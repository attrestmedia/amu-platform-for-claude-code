import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getOwnedLinksByIds, markOgPayload } from "libs/database/mini-apps/scrapeLinksRepo";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose API 라우트 (mini-apps/scrape-links/og) — OpenGraph 기반 자동 라벨
 * @process 인증 → 소유 레코드 확인 → SSRF 차단 + 타임아웃/바이트 상한 fetch → meta 파싱 → DB 반영
 * @domain mini-app.scrape-links
 * @scope server_route
 */

type OgBody = { ids?: string[] };

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const TITLE_META_KEYS = ["og:title", "twitter:title", "title"];
const DESCRIPTION_META_KEYS = ["og:description", "twitter:description", "description"];
const IMAGE_META_KEYS = ["og:image:secure_url", "og:image", "twitter:image:src", "twitter:image", "image"];

function validateBody(data: OgBody) {
  if (!Array.isArray(data?.ids) || data.ids.length === 0) return { valid: false, error: "ids_required" };
  if (data.ids.length > 20) return { valid: false, error: "too_many_ids" };
  return { valid: true };
}

function isPrivateIPv4(host: string) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isUnsafeHost(host: string) {
  const h = String(host || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.startsWith("[") || /^[0-9a-f:]+$/.test(h)) return true;
  if (isPrivateIPv4(h)) return true;
  return false;
}

function isSafeUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isUnsafeHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function pickCharsetFromHeader(ctype: string): string {
  const m = String(ctype || "").match(/charset\s*=\s*"?([\w.:+-]+)/i);
  return m ? m[1].trim().toLowerCase() : "";
}

function pickCharsetFromHtmlHead(buf: Buffer): string {
  const head = buf.subarray(0, Math.min(buf.length, 4096)).toString("ascii");
  const meta = head.match(/<meta[^>]+charset\s*=\s*["']?([\w.:+-]+)/i);
  if (meta?.[1]) return meta[1].toLowerCase();
  const httpEquiv = head.match(
    /<meta[^>]+http-equiv\s*=\s*["']?content-type[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([\w.:+-]+)/i,
  );
  return httpEquiv?.[1]?.toLowerCase() || "";
}

function decodeBufferAsHtml(buf: Buffer, headerCtype: string): string {
  const detected = pickCharsetFromHeader(headerCtype) || pickCharsetFromHtmlHead(buf) || "utf-8";
  // WHATWG TextDecoder는 ks_c_5601-1987, windows-949 등 표준 라벨을 직접 지원하므로
  // 비표준 한국어 라벨(cp949/uhc)만 euc-kr로 폴백한다.
  const target = detected === "cp949" || detected === "uhc" ? "euc-kr" : detected;
  try {
    return new TextDecoder(target, { fatal: false }).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

function decodeEntities(raw: string) {
  return String(raw || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    });
}

function cleanText(raw: string, max = 600) {
  return decodeEntities(raw).replace(/\s+/g, " ").trim().slice(0, max);
}

function readTagAttrs(tag: string) {
  const attrs: Record<string, string> = {};
  const attrRe = /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(attrRe)) {
    const key = String(match[1] || "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (key) attrs[key] = cleanText(value, 1200);
  }
  return attrs;
}

function collectMeta(html: string) {
  const meta = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = readTagAttrs(match[0]);
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    const content = attrs.content;
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  return meta;
}

function pickMeta(meta: Map<string, string>, keys: string[], max = 600) {
  for (const key of keys) {
    const value = meta.get(key);
    if (value) return cleanText(value, max);
  }
  return "";
}

function stripTags(raw: string) {
  return cleanText(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  );
}

function pickTagText(html: string, tagName: "title" | "h1") {
  const m = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return m?.[1] ? stripTags(m[1]).slice(0, 240) : "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function siteTitleCandidates(sourceUrl: string, siteName: string) {
  const out = new Set<string>();
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./i, "");
    out.add(host);
    out.add(host.replace(/\.[a-z]{2,}$/i, ""));
  } catch {
    // ignore bad source
  }
  if (siteName) out.add(siteName);
  return Array.from(out).filter(Boolean);
}

function compactTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[\s._|:;,\-–—]+/g, "");
}

// 서버에 렌더되지 않고 그대로 노출된 템플릿 토큰을 OG 타이틀로 사용하지 않도록 감지
// {#item}, {{title}}, {% block %}, ${title}, <%= title %>, <%title%>, [%title%], %TITLE%
const TEMPLATE_LEAK_PATTERNS: RegExp[] = [
  /^\{[#%@!][\s\S]*\}$/,
  /^\{\{[\s\S]*\}\}$/,
  /^\$\{[\s\S]*\}$/,
  /^<%[\s\S]*%>$/,
  /^\[%[\s\S]*%\]$/,
  /^%[\w.\-]+%$/,
];

function isTemplateLeak(value: string) {
  const v = String(value || "").trim();
  if (!v) return false;
  return TEMPLATE_LEAK_PATTERNS.some((re) => re.test(v));
}

function isWeakTitle(title: string, sourceUrl: string, siteName: string) {
  if (isTemplateLeak(title)) return true;
  const compact = compactTitle(title);
  if (!compact) return true;
  return siteTitleCandidates(sourceUrl, siteName).some((candidate) => compact === compactTitle(candidate));
}

function stripSiteSuffix(title: string, sourceUrl: string, siteName: string) {
  let next = cleanText(title, 240);
  for (const candidate of siteTitleCandidates(sourceUrl, siteName)) {
    const escaped = escapeRegExp(candidate);
    next = next.replace(new RegExp(`\\s*(?:-|\\||\\u2013|\\u2014|:|»|>)\\s*${escaped}\\s*$`, "i"), "");
  }
  return cleanText(next || title, 240);
}

function pickBestTitle(html: string, meta: Map<string, string>, sourceUrl: string, siteName: string) {
  const titleCandidates = [
    pickMeta(meta, TITLE_META_KEYS, 240),
    pickTagText(html, "title"),
    pickTagText(html, "h1"),
  ].filter(Boolean);

  // 1순위: 정상(약하거나 템플릿 누수가 아닌) 타이틀 후보
  const goodTitle = titleCandidates.find((candidate) => !isWeakTitle(candidate, sourceUrl, siteName));
  if (goodTitle) return stripSiteSuffix(goodTitle, sourceUrl, siteName);

  // 2순위: 모든 타이틀 후보가 약하거나 템플릿 누수인 경우 description/site_name으로 폴백
  const fallbackCandidates = [
    pickMeta(meta, DESCRIPTION_META_KEYS, 240),
    siteName,
  ].filter(Boolean);
  const goodFallback = fallbackCandidates.find(
    (candidate) => !isWeakTitle(candidate, sourceUrl, siteName) && !isTemplateLeak(candidate),
  );
  if (goodFallback) return stripSiteSuffix(goodFallback, sourceUrl, siteName);

  // 3순위: 템플릿 누수가 아닌 첫 후보(약한 타이틀이라도 템플릿 토큰 노출은 회피)
  const fallback =
    [...titleCandidates, ...fallbackCandidates].find((candidate) => !isTemplateLeak(candidate)) || "";
  return stripSiteSuffix(fallback, sourceUrl, siteName);
}

function resolvePreviewUrl(raw: string, baseUrl: string) {
  if (!raw) return "";
  try {
    const resolved = new URL(raw, baseUrl).toString();
    return isSafeUrl(resolved) ? resolved : "";
  } catch {
    return "";
  }
}

async function fetchHtmlSafe(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AMUScrapeLinksBot/1.0; +https://allmyuniverse.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const finalUrl = res.url || url;
    if (!isSafeUrl(finalUrl)) return null;
    const ctype = String(res.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("text/html") && !ctype.includes("application/xhtml")) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > MAX_BYTES) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let received = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.length;
      if (received > MAX_BYTES) {
        reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
    return { html: decodeBufferAsHtml(buf, ctype), finalUrl };
  } catch {
    return null;
  }
}

async function handlePOST(data: OgBody, user: AuthenticatedUserType) {
  const uid = String(user?.ID || "");
  if (!uid) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const owned = await getOwnedLinksByIds({ uid, ids: data.ids || [] });
  if (!owned.length) return { ok: true, data: { results: [] } };

  const results = await Promise.all(
    owned.map(async (row) => {
      if (!isSafeUrl(row.url)) {
        await markOgPayload({ uid, id: row.id, payload: { status: "failed" } });
        return { id: row.id, status: "failed" as const };
      }
      const fetched = await fetchHtmlSafe(row.url);
      if (!fetched) {
        await markOgPayload({ uid, id: row.id, payload: { status: "failed" } });
        return { id: row.id, status: "failed" as const };
      }
      const metaMap = collectMeta(fetched.html);
      const siteName = pickMeta(metaMap, ["og:site_name", "application-name"], 160);
      const meta = {
        ogTitle: pickBestTitle(fetched.html, metaMap, fetched.finalUrl, siteName),
        ogDescription: pickMeta(metaMap, DESCRIPTION_META_KEYS),
        ogImage: resolvePreviewUrl(pickMeta(metaMap, IMAGE_META_KEYS), fetched.finalUrl),
        ogSiteName: siteName,
      };
      await markOgPayload({ uid, id: row.id, payload: { ...meta, status: "success" } });
      return { id: row.id, status: "success" as const, ...meta };
    }),
  );

  return { ok: true, data: { results } };
}

export const POST = withAuth(handlePOST, validateBody, "mini-apps/scrape-links/og", {
  bodyParser: "json",
});
