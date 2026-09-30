import { NextRequest, NextResponse } from "next/server";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { verifyWpBridgeRequest } from "libs/server-utils/api/wpBridgeAuth";
import { enqueueMarketingContent } from "libs/marketing/ingest/contentQueueService";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { logger } from "utils/log";
import { toSafeString } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(marketing / content-queue / from-wp-hook) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain marketing
 * @scope wp-hook-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  return await withApiTimeout(async () => {
    if (!isMarketingFeatureEnabled()) {
      return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
    }

    const auth = verifyWpBridgeRequest({ request });
    if (!auth.ok) {
      logger.warn("[marketing/content-queue/from-wp-hook] auth failed", { error: auth.error });
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const data = await request.json().catch(() => null);
    const universeId = toSafeString(data?.universeId);
    if (!universeId) {
      return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
    }

    const result = await enqueueMarketingContent({
      universeId,
      slug: toSafeString(data?.slug),
      url: toSafeString(data?.url),
      priority: "normal",
      force: false,
      requestedBy: auth.site,
      source: "wp_hook",
      trigger: toSafeString(data?.trigger) || "publish",
      site: auth.site,
    });

    return NextResponse.json({
      success: true,
      site: auth.site,
      data: result,
    });
  }, 20000);
}
