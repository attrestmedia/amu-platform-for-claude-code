import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { upsertOAuthAppCredential } from "libs/database/secure/oauthAppCredentials";
import { listMarketingOAuthAppCredentialStatus } from "libs/marketing/auth/oauthAppCredentials";
import {
  OAUTH_APP_CREDENTIAL_PROVIDERS,
  type OAuthAppCredentialProvider,
} from "models/secure/OAuthAppCredentialSchema";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 통합 관리자용 글로벌 OAuth App Credential 상태 조회·암호화 저장
 * @process 관리자 인증 → provider/입력 검증 → secrets DB upsert → 비밀값 제외 상태 반환
 * @domain marketing-auth
 * @scope admin-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isOAuthAppCredentialProvider(value: string): value is OAuthAppCredentialProvider {
  return (OAUTH_APP_CREDENTIAL_PROVIDERS as readonly string[]).includes(value);
}

export const GET = withAuth(
  async () => {
    const credentials = await listMarketingOAuthAppCredentialStatus();
    return NextResponse.json({ success: true, data: { credentials } });
  },
  undefined,
  "marketing_oauth_app_credentials_get",
  { requireAdmin: true, bodyParser: "none" },
);

export const POST = withAuth(
  async (data, user, request) => {
    const body = toUnknownRecord(data);
    const provider = toSafeString(body.provider);
    if (!isOAuthAppCredentialProvider(provider)) {
      return NextResponse.json({ success: false, error: "invalid_provider" }, { status: 400 });
    }

    try {
      await upsertOAuthAppCredential({
        provider,
        clientId: toSafeString(body.clientId),
        clientSecret: toSafeString(body.clientSecret),
        developerToken: toSafeString(body.developerToken),
        actor: toSafeString(user?.userEmail || user?.userEmailLower || user?.uid || user?.ID),
        actorIp: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        requestId: request?.headers.get("x-request-id") || undefined,
      });
      const credentials = await listMarketingOAuthAppCredentialStatus();
      return NextResponse.json({ success: true, data: { credentials } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "OAUTH_APP_CREDENTIAL_REQUIRED") {
        return NextResponse.json(
          { success: false, error: "client_id_and_secret_required_for_first_save" },
          { status: 400 },
        );
      }
      if (message === "OAUTH_APP_CREDENTIAL_NO_CHANGES") {
        return NextResponse.json({ success: false, error: "no_changes" }, { status: 400 });
      }
      throw error;
    }
  },
  undefined,
  "marketing_oauth_app_credentials_update",
  { requireAdmin: true },
);
