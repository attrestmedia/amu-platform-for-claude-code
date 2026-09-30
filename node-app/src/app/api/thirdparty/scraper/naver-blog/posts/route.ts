import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { crawlNaverBlogPosts } from "libs/server-utils/thirdparty/scraper";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * @docHint
 * @purpose API 라우트(thirdparty / scraper / naver-blog / posts) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  네이버 블로그 목록 수집  JSON 응답 반환
 * @domain thirdparty.scraper
 * @scope authenticated_api
 */

export const GET = withAuth(
  async (_data, user, request) => {
    if (!request) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }

    try {
      const { searchParams } = new URL(request.url);
      const blogId = searchParams.get("blogId") || "";
      const maxPages = searchParams.get("maxPages") || undefined;
      const limit = searchParams.get("limit") || undefined;
      const data = await crawlNaverBlogPosts({ blogId, maxPages: Number(maxPages), limit: Number(limit) });

      logger.info("네이버 블로그 포스트 목록 수집 완료", {
        userId: user.ID,
        blogId: data.blogId,
        count: data.count,
        source: data.source,
      });

      return NextResponse.json({ ok: true, data });
    } catch (error) {
      const message = toErrorMessage(error, "naver_blog_posts_failed");
      logger.warn("네이버 블로그 포스트 목록 수집 실패", message);
      return NextResponse.json(
        { ok: false, error: message },
        { status: message === "invalid_blog_id" ? 400 : 502 },
      );
    }
  },
  undefined,
  "thirdparty/scraper/naver-blog/posts",
  { bodyParser: "none" },
);
