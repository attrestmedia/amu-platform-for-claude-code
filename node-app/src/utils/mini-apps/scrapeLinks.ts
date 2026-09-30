/**
 * @docHint
 * @purpose Scrape Links 미니앱 전용 URL 추출/정규화/해시 유틸 (client+server 공용)
 * @process 통 텍스트 → URL 토큰 추출(마크다운 [text](/path) 포함) → baseDomain으로 상대 경로 절대화 → 구두점/fragment/tracking param 정리 → URL() 검증
 * @domain mini-app.scrape-links
 * @scope utils
 */

export const DEFAULT_SCRAPE_LINKS_BASE_DOMAIN = "https://allmyuniverse.com";

const URL_TOKEN_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'`)\]\}　]+/gi;
// [text](url) 형태의 마크다운 링크 — url 캡처 그룹은 공백/`)` 경계로 단일 토큰
const MARKDOWN_LINK_URL_REGEX = /\[[^\]\n]*\]\(([^)\s]+)\)/g;
// 도메인에 이어 붙일 수 있는 절대 경로(`/path`)만 허용 — `//protocol-relative`, `./`, `../`는 제외
const RELATIVE_URL_REGEX = /^\/[^/\s]/;
const TRAILING_PUNCT = /[),.;:!?\]\}'"`]+$/;

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ysclid",
  "_ga",
]);

function trimUrlToken(token: string) {
  let t = token.trim();
  while (t.endsWith(")") && (t.match(/\(/g) || []).length < (t.match(/\)/g) || []).length) {
    t = t.slice(0, -1);
  }
  while (TRAILING_PUNCT.test(t)) {
    t = t.replace(TRAILING_PUNCT, "");
  }
  return t;
}

function isRelativeUrl(s: string): boolean {
  return RELATIVE_URL_REGEX.test(s);
}

/**
 * baseDomain 입력을 `https://host` origin 형태로 정규화한다.
 * 잘못된 입력 또는 빈 값이면 "" 를 반환해 호출부가 안전하게 fallback 하도록 한다.
 */
export function normalizeBaseDomain(input: string | null | undefined): string {
  const trimmed = String(input || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname || !u.hostname.includes(".")) return "";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export function extractUrlTokens(raw: string): string[] {
  const text = String(raw || "");
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  // 마크다운 링크 안의 도메인 결합형 상대 경로(/path)를 선취 — 절대 URL은 아래 URL_TOKEN_REGEX가 담당
  for (const m of text.matchAll(MARKDOWN_LINK_URL_REGEX)) {
    const inner = trimUrlToken(m[1] || "");
    if (!inner || !isRelativeUrl(inner)) continue;
    if (seen.has(inner)) continue;
    seen.add(inner);
    out.push(inner);
  }

  for (const match of text.matchAll(URL_TOKEN_REGEX)) {
    const cleaned = trimUrlToken(match[0]);
    if (!cleaned) continue;
    const withScheme = cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
    if (seen.has(withScheme)) continue;
    seen.add(withScheme);
    try {
      const u = new URL(withScheme);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (!u.hostname || !u.hostname.includes(".")) continue;
      out.push(withScheme);
    } catch {
      // ignore invalid URLs
    }
  }
  return out;
}

export function normalizeUrl(raw: string, options?: { baseDomain?: string | null }): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  // 상대 경로(/path): baseDomain이 있으면 absolute로 붙여 재귀 정규화, 없으면 path만 정리
  if (isRelativeUrl(trimmed)) {
    const base = normalizeBaseDomain(options?.baseDomain);
    if (base) return normalizeUrl(`${base}${trimmed}`);

    const [noHash] = trimmed.split("#");
    const [pathRaw, queryRaw] = noHash.split("?");
    let path = pathRaw.replace(/\/{2,}/g, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    if (!queryRaw) return path;
    const params = new URLSearchParams(queryRaw);
    for (const key of Array.from(params.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
    }
    const q = params.toString();
    return q ? `${path}?${q}` : path;
  }

  const candidate = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    const keys = Array.from(u.searchParams.keys());
    for (const key of keys) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    let path = u.pathname.replace(/\/{2,}/g, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path || "/";
    return u.toString();
  } catch {
    return "";
  }
}

export function safeDomain(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

export function extractAndNormalizeAll(
  raw: string,
  options?: { baseDomain?: string | null },
): Array<{ url: string; normalizedUrl: string; domain: string }> {
  const tokens = extractUrlTokens(raw);
  const seenNorm = new Set<string>();
  const items: Array<{ url: string; normalizedUrl: string; domain: string }> = [];
  for (const token of tokens) {
    const normalized = normalizeUrl(token, options);
    if (!normalized || seenNorm.has(normalized)) continue;
    seenNorm.add(normalized);
    items.push({
      url: isRelativeUrl(token) ? normalized : token,
      normalizedUrl: normalized,
      domain: safeDomain(normalized),
    });
  }
  return items;
}
