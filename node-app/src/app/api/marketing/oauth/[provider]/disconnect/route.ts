import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { disconnectOAuthConnection, getDecryptedOAuthConnection } from "libs/database/secure/oauthConnections";
import { revokeMarketingOAuthToken } from "libs/marketing/auth/oauthProviderLifecycle";
import { getOAuthProviderConfig, isSupportedOAuthProvider } from "libs/marketing/auth/oauthProviderRegistry";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자 OAuth 연결 해제(soft: status=disconnected + 토큰 폐기)
 * @process provider 검증 → 유니버스 권한 → 연결 폐기
 * @domain marketing
 * @scope universe-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const POST = withAuth(
  async (data, user, _request, ctx: { params: Promise<{ provider: string }> }) => {
    const { provider } = await ctx.params;
    if (!isSupportedOAuthProvider(provider)) {
      return NextResponse.json({ success: false, error: "unsupported_provider" }, { status: 400 });
    }

    const body = toUnknownRecord(data);
    const universeId = toSafeString(body.universeId);
    if (!universeId) {
      return NextResponse.json({ success: false, error: "universe_id_required" }, { status: 400 });
    }
    const providerAccountId = toSafeString(body.providerAccountId) || undefined;

    const config = getOAuthProviderConfig(provider);
    const connection = await getDecryptedOAuthConnection({
      ownerType: "universe",
      ownerId: universeId,
      provider: config.provider,
      providerAccountId,
      allowSelectionRequired: true,
      allowExpired: true,
    });
    const revoked = connection
      ? await revokeMarketingOAuthToken({ provider: config.provider, accessToken: connection.accessToken })
      : false;
    const result = await disconnectOAuthConnection({
      ownerType: "universe",
      ownerId: universeId,
      provider: config.provider,
      providerAccountId,
      actor: toSafeString(user?.userEmail || user?.userEmailLower),
    });

    return NextResponse.json({ success: true, data: { ...result, revoked } });
  },
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_oauth_disconnect",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
