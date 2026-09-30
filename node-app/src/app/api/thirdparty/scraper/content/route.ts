import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { scrapeReadableContent } from "libs/server-utils/thirdparty/scraper";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * @docHint
 * @purpose API 라우트(thirdparty / scraper / content) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  URL 안전 검증  본문 수집  JSON 응답 반환
 * @domain thirdparty.scraper
 * @scope authenticated_api
 */

function toBool(raw: string | null) {
  const value = String(raw || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export const GET = withAuth(
  async (_data, user, request) => {
    if (!request) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }

    try {
      const { searchParams } = new URL(request.url);
      const url = searchParams.get("url") || "";
      const includeHtml = toBool(searchParams.get("includeHtml"));
      const data = await scrapeReadableContent({ url, includeHtml });

      logger.info("웹 콘텐츠 수집 완료", {
        userId: user.ID,
        urlHost: new URL(data.finalUrl).hostname,
        textLength: data.text.length,
      });

      return NextResponse.json({ ok: true, data });
    } catch (error) {
      const message = toErrorMessage(error, "scrape_content_failed");
      logger.warn("웹 콘텐츠 수집 실패", message);
      return NextResponse.json(
        { ok: false, error: message },
        { status: message === "invalid_url" ? 400 : 502 },
      );
    }
  },
  undefined,
  "thirdparty/scraper/content",
  { bodyParser: "none" },
);
