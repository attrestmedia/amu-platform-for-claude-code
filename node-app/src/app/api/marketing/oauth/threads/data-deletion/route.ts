import { NextResponse } from "next/server";
import { buildMarketingOAuthUrl } from "libs/marketing/auth/marketingOAuthUrls";
import { getMarketingOAuthAppCredential } from "libs/marketing/auth/oauthAppCredentials";
import { readMetaSignedRequest, verifyMetaSignedRequest } from "libs/marketing/auth/metaSignedRequest";
import { handleThreadsDataDeletion } from "libs/marketing/auth/threadsLifecycleService";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Meta Threads 사용자 데이터 삭제 콜백 수신
 * @process form signed_request HMAC 검증 → OAuth/Threads 유래 데이터 삭제 → 상태 URL·확인 코드 반환
 * @domain marketing-auth
 * @scope public-provider-callback
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const appSecret = (await getMarketingOAuthAppCredential("threads")).clientSecret;
  if (!appSecret) {
    logger.error("[threads/data-deletion] Threads App Secret is not configured");
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const signedRequest = await readMetaSignedRequest(request);
  const payload = verifyMetaSignedRequest({ signedRequest, appSecret });
  if (!payload) {
    return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  }

  try {
    const { receipt } = await handleThreadsDataDeletion(payload.userId);
    const statusPath = `/marketing/data-deletion/status?code=${encodeURIComponent(receipt.confirmationCode)}`;
    return NextResponse.json({
      url: buildMarketingOAuthUrl(statusPath, request),
      confirmation_code: receipt.confirmationCode,
    });
  } catch (error) {
    logger.error("[threads/data-deletion] lifecycle processing failed", { error });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
