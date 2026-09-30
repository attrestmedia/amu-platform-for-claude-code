import fetchClient from "libs/api/fetchClient";
import type { INaverBlogPostListResponse, IWebScrapeContentResponse } from "types/thirdparty";

/**
 * @docHint
 * @purpose Scraper 클라이언트 API 래퍼
 * @process fetchClient로 서버 라우트 호출  표준 응답 파싱
 * @domain thirdparty.scraper
 * @scope client_api
 */

type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };

export async function listNaverBlogPosts(input: {
  blogId: string;
  maxPages?: number;
  limit?: number;
}): Promise<INaverBlogPostListResponse> {
  const res = await fetchClient.get<ApiEnvelope<INaverBlogPostListResponse>>(
    "/thirdparty/scraper/naver-blog/posts",
    { params: input, timeout: 60000 },
  );
  if (!res.data?.ok || !res.data.data) throw new Error(res.data?.error || "naver_blog_posts_failed");
  return res.data.data;
}

export async function scrapeWebContent(input: {
  url: string;
  includeHtml?: boolean;
}): Promise<IWebScrapeContentResponse> {
  const res = await fetchClient.get<ApiEnvelope<IWebScrapeContentResponse>>("/thirdparty/scraper/content", {
    params: input,
    timeout: 30000,
  });
  if (!res.data?.ok || !res.data.data) throw new Error(res.data?.error || "scrape_content_failed");
  return res.data.data;
}
