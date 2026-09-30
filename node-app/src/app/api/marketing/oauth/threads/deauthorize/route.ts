import { NextResponse } from "next/server";
import { getMarketingOAuthAppCredential } from "libs/marketing/auth/oauthAppCredentials";
import { readMetaSignedRequest, verifyMetaSignedRequest } from "libs/marketing/auth/metaSignedRequest";
import { handleThreadsDeauthorization } from "libs/marketing/auth/threadsLifecycleService";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Meta Threads 앱 제거 콜백 수신
 * @process form signed_request HMAC 검증 → 해당 provider 사용자 OAuth 토큰 즉시 폐기
 * @domain marketing-auth
 * @scope public-provider-callback
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const appSecret = (await getMarketingOAuthAppCredential("threads")).clientSecret;
  if (!appSecret) {
    logger.error("[threads/deauthorize] Threads App Secret is not configured");
    return NextResponse.json({ success: false, error: "service_unavailable" }, { status: 503 });
  }

  const signedRequest = await readMetaSignedRequest(request);
  const payload = verifyMetaSignedRequest({ signedRequest, appSecret });
  if (!payload) {
    return NextResponse.json({ success: false, error: "invalid_signed_request" }, { status: 400 });
  }

  try {
    await handleThreadsDeauthorization(payload.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[threads/deauthorize] lifecycle processing failed", { error });
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
