import "server-only";
import type {
  INaverBlogPostItem,
  INaverBlogPostListResponse,
  IWebScrapeContentResponse,
} from "types/thirdparty";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process 안전 URL 검증  HTML fetch 제한  네이버 목록/일반 본문 파싱  결과 포맷팅
 * @domain thirdparty.scraper
 * @scope server-utils
 */

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

type FetchHtmlOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
};

function cleanText(value: unknown, max = 600) {
  return decodeEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function decodeEntities(raw: string) {
  return String(raw || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (fallback, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
    })
    .replace(/&#x([0-9a-f]+);/gi, (fallback, n) => {
      const code = Number.parseInt(n, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
    });
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

function stripTags(raw: string, max = 20000) {
  return cleanText(
    String(raw || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
    max,
  );
}

function isPrivateIPv4(host: string) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
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
  return isPrivateIPv4(h);
}

export function isSafeScrapeUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return !isUnsafeHost(url.hostname);
  } catch {
    return false;
  }
}

function normalizeNaverBlogId(raw: unknown) {
  const value = String(raw || "").trim();
  return /^[a-zA-Z0-9_-]{2,64}$/.test(value) ? value : "";
}

function normalizePositiveInt(raw: unknown, fallback: number, min: number, max: number) {
  const value = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

async function fetchHtmlSafe(rawUrl: string, options: FetchHtmlOptions = {}) {
  if (!isSafeScrapeUrl(rawUrl)) return null;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const res = await fetch(rawUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    headers: {
      "User-Agent": DESKTOP_UA,
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      ...options.headers,
    },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const finalUrl = res.url || rawUrl;
  if (!isSafeScrapeUrl(finalUrl)) return null;
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml") &&
    !contentType.includes("application/json") &&
    !contentType.includes("text/plain")
  ) {
    return null;
  }
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.length;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
  return { html: buffer.toString("utf8"), finalUrl };
}

function collectMeta(html: string) {
  const meta = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = readTagAttrs(match[0]);
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
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

function pickTagText(html: string, tagName: "title" | "h1") {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? stripTags(match[1], 240) : "";
}

function resolveUrl(raw: string, baseUrl: string) {
  if (!raw) return "";
  try {
    const url = new URL(raw, baseUrl).toString();
    return isSafeScrapeUrl(url) ? url : "";
  } catch {
    return "";
  }
}

function collectImageUrls(html: string, baseUrl: string) {
  const out = new Set<string>();
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = readTagAttrs(match[0]);
    const raw = attrs.src || attrs["data-src"] || attrs["data-lazy-src"] || attrs["data-original"] || "";
    const resolved = resolveUrl(raw, baseUrl);
    if (resolved) out.add(resolved);
    if (out.size >= 20) break;
  }
  return Array.from(out);
}

function extractNaverLogNo(href: string, blogId: string) {
  const fromParam = href.match(/[?&]logNo=(\d+)/i)?.[1];
  if (fromParam) return fromParam;
  const escapedBlogId = blogId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return href.match(new RegExp(`/${escapedBlogId}/(\\d+)`, "i"))?.[1] || "";
}

function readDates(html: string) {
  const dates: string[] = [];
  for (const match of html.matchAll(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/g)) {
    const y = match[1];
    const m = String(Number(match[2])).padStart(2, "0");
    const d = String(Number(match[3])).padStart(2, "0");
    dates.push(`${y}.${m}.${d}`);
  }
  return dates;
}

function addPost(
  posts: INaverBlogPostItem[],
  seen: Set<string>,
  blogId: string,
  logNo: string,
  rawTitle: string,
  date = "",
) {
  const title = cleanText(rawTitle, 240);
  if (!logNo || seen.has(logNo) || !title || title.length < 2) return;
  if (["이전", "다음", "목록", "글쓰기"].includes(title)) return;
  seen.add(logNo);
  posts.push({
    logNo,
    title,
    url: `https://blog.naver.com/${blogId}/${logNo}`,
    date,
  });
}

function parseNaverPostsFromHtml(html: string, blogId: string) {
  const posts: INaverBlogPostItem[] = [];
  const seen = new Set<string>();
  const dates = readDates(html);

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = readTagAttrs(match[1]);
    const logNo = extractNaverLogNo(attrs.href || "", blogId);
    addPost(posts, seen, blogId, logNo, stripTags(match[2], 240), dates[posts.length] || "");
  }

  const jsonPatternA = /"logNo"\s*:\s*"?(\d+)"?[\s\S]{0,800}?"title"\s*:\s*"([^"]*)"/g;
  for (const match of html.matchAll(jsonPatternA)) {
    addPost(posts, seen, blogId, match[1], match[2], dates[posts.length] || "");
  }

  const jsonPatternB = /"title"\s*:\s*"([^"]*)"[\s\S]{0,800}?"logNo"\s*:\s*"?(\d+)"?/g;
  for (const match of html.matchAll(jsonPatternB)) {
    addPost(posts, seen, blogId, match[2], match[1], dates[posts.length] || "");
  }

  return posts;
}

async function fetchNaverTitleListPage(blogId: string, page: number) {
  const url =
    `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}` +
    `&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=0&countPerPage=30`;
  return await fetchHtmlSafe(url, {
    maxBytes: 1024 * 1024,
    headers: {
      Referer: `https://blog.naver.com/${blogId}`,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
}

async function fetchNaverPostListPage(blogId: string, page: number) {
  const url =
    `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}` +
    `&from=postList&categoryNo=0&currentPage=${page}`;
  return await fetchHtmlSafe(url, {
    maxBytes: 1024 * 1024,
    headers: { Referer: `https://blog.naver.com/${blogId}` },
  });
}

function mergePosts(target: INaverBlogPostItem[], seen: Set<string>, posts: INaverBlogPostItem[], limit: number) {
  let added = 0;
  for (const post of posts) {
    if (seen.has(post.logNo)) continue;
    seen.add(post.logNo);
    target.push(post);
    added++;
    if (target.length >= limit) break;
  }
  return added;
}

export async function crawlNaverBlogPosts(args: {
  blogId: string;
  maxPages?: number;
  limit?: number;
}): Promise<INaverBlogPostListResponse> {
  const blogId = normalizeNaverBlogId(args.blogId);
  if (!blogId) throw new Error("invalid_blog_id");

  const maxPages = normalizePositiveInt(args.maxPages, 20, 1, 200);
  const limit = normalizePositiveInt(args.limit, 300, 1, 2000);
  const posts: INaverBlogPostItem[] = [];
  const seen = new Set<string>();
  let source: INaverBlogPostListResponse["source"] = "api";
  let emptyStreak = 0;

  for (let page = 1; page <= maxPages && posts.length < limit; page++) {
    const fetched = await fetchNaverTitleListPage(blogId, page);
    const found = fetched ? parseNaverPostsFromHtml(fetched.html, blogId) : [];
    const added = mergePosts(posts, seen, found, limit);
    if (added === 0) emptyStreak++;
    else emptyStreak = 0;
    if (emptyStreak >= 2) break;
  }

  if (!posts.length) {
    source = "post-list";
    emptyStreak = 0;
    for (let page = 1; page <= maxPages && posts.length < limit; page++) {
      const fetched = await fetchNaverPostListPage(blogId, page);
      const found = fetched ? parseNaverPostsFromHtml(fetched.html, blogId) : [];
      const added = mergePosts(posts, seen, found, limit);
      if (added === 0) emptyStreak++;
      else emptyStreak = 0;
      if (emptyStreak >= 3) break;
    }
  }

  posts.sort((a, b) => Number(b.logNo) - Number(a.logNo));
  return { blogId, count: posts.length, source, posts };
}

function normalizeNaverPostUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const pathMatch = url.pathname.match(/^\/([^/]+)\/(\d+)/);
    const logNo = url.searchParams.get("logNo") || pathMatch?.[2] || "";
    const blogId = url.searchParams.get("blogId") || pathMatch?.[1] || "";
    if (!logNo || !normalizeNaverBlogId(blogId)) return rawUrl;
    if (host === "blog.naver.com" || host === "m.blog.naver.com") {
      return `https://m.blog.naver.com/${blogId}/${logNo}`;
    }
  } catch {
    return rawUrl;
  }
  return rawUrl;
}

function pickReadableHtml(html: string) {
  const candidates = [
    /<div\b[^>]*class=["'][^"']*se-main-container[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div\b[^>]*id=["']postViewArea["'][^>]*>([\s\S]*?)<\/div>/i,
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<body\b[^>]*>([\s\S]*?)<\/body>/i,
  ];
  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return html;
}

export async function scrapeReadableContent(args: {
  url: string;
  includeHtml?: boolean;
}): Promise<IWebScrapeContentResponse> {
  const targetUrl = normalizeNaverPostUrl(String(args.url || "").trim());
  if (!isSafeScrapeUrl(targetUrl)) throw new Error("invalid_url");

  const fetched = await fetchHtmlSafe(targetUrl, {
    headers: targetUrl.includes("m.blog.naver.com") ? { "User-Agent": MOBILE_UA } : undefined,
  });
  if (!fetched) throw new Error("fetch_failed");

  const meta = collectMeta(fetched.html);
  const readableHtml = pickReadableHtml(fetched.html);
  const siteName = pickMeta(meta, ["og:site_name", "application-name"], 160);
  const title =
    pickMeta(meta, ["og:title", "twitter:title"], 240) ||
    pickTagText(fetched.html, "title") ||
    pickTagText(readableHtml, "h1");
  const description = pickMeta(meta, ["og:description", "twitter:description", "description"], 600);
  const imageUrls = collectImageUrls(readableHtml, fetched.finalUrl);

  return {
    url: args.url,
    finalUrl: fetched.finalUrl,
    title,
    description,
    siteName,
    text: stripTags(readableHtml, 50000),
    html: args.includeHtml ? readableHtml.slice(0, 100000) : undefined,
    imageUrls,
  };
}
