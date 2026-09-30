import "server-only";
import { buildNaverApiHeaders, type NaverDatalabConnection } from "./naverDatalabClient";

/**
 * @docHint
 * @purpose 네이버 검색(블로그) API 클라이언트 — 경쟁 문서량/포화도 분석과 발행 글 순위 추적
 * @process 블로그 검색 호출 → 상위 결과에서 발행 URL 매칭으로 blog tab 기준 순위 산출
 * @domain marketing
 * @scope server
 */

const BLOG_SEARCH_URL = "https://openapi.naver.com/v1/search/blog.json";

export type NaverBlogSearchItem = {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string; // YYYYMMDD
};

export async function searchNaverBlog(
  connection: Pick<NaverDatalabConnection, "clientId" | "clientSecret">,
  query: string,
  options: { display?: number; start?: number; sort?: "sim" | "date" } = {},
) {
  const params = new URLSearchParams({
    query,
    display: String(Math.min(options.display ?? 30, 100)),
    start: String(options.start ?? 1),
    sort: options.sort ?? "sim",
  });

  const response = await fetch(`${BLOG_SEARCH_URL}?${params.toString()}`, {
    headers: buildNaverApiHeaders(connection),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`naver_blog_search_error_${response.status}: ${text.slice(0, 300)}`);
  }

  return (await response.json()) as { total: number; items: NaverBlogSearchItem[] };
}

function normalizeUrlForMatch(url: string) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^m\./, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

/**
 * 발행 글 순위 추적: 키워드의 블로그 검색 상위 N에서 발행 URL을 찾는다.
 * 주의: 블로그 검색 탭 기준 순위이며 네이버 통합검색 노출 순위와 다를 수 있다.
 * 결과는 추세(순위 상승/하락) 지표로만 사용한다.
 */
export async function findPublishedRank(
  connection: Pick<NaverDatalabConnection, "clientId" | "clientSecret">,
  keyword: string,
  publishedUrls: string[],
  depth = 100,
) {
  const normalized = publishedUrls.map(normalizeUrlForMatch).filter(Boolean);
  const { total, items } = await searchNaverBlog(connection, keyword, {
    display: Math.min(depth, 100),
    sort: "sim",
  });

  for (let i = 0; i < items.length; i += 1) {
    const link = normalizeUrlForMatch(items[i].link);
    const hit = normalized.findIndex((url) => link.includes(url) || url.includes(link));
    if (hit >= 0) {
      return { rank: i + 1, matchedUrl: publishedUrls[hit], total, scanned: items.length };
    }
  }
  return { rank: null, matchedUrl: null, total, scanned: items.length };
}

/** 상위 결과의 경쟁 지표: 최근 30일 발행 비율(포화도)과 제목 목록 */
export function buildSerpCompetitionSummary(total: number, items: NaverBlogSearchItem[]) {
  const now = Date.now();
  const recentCount = items.filter((item) => {
    const raw = String(item.postdate || "");
    if (raw.length !== 8) return false;
    const time = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`).getTime();
    return Number.isFinite(time) && now - time <= 30 * 24 * 3600 * 1000;
  }).length;

  return {
    competitionTotal: total,
    sampled: items.length,
    recent30dCount: recentCount,
    recent30dRatio: items.length > 0 ? Number((recentCount / items.length).toFixed(3)) : 0,
    topTitles: items.slice(0, 10).map((item) => item.title.replace(/<[^>]+>/g, "")),
  };
}
