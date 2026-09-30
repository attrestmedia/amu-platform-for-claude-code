import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getMarketingOAuthAppCredential, getMarketingOAuthAppReadiness } from "libs/marketing/auth/oauthAppCredentials";
import {
  buildAuthorizeUrl,
  createPkcePair,
  getOAuthProviderConfig,
  isSupportedOAuthProvider,
} from "libs/marketing/auth/oauthProviderRegistry";
import { createMarketingOAuthTransaction } from "libs/marketing/auth/oauthTransactionService";
import { buildMarketingOAuthUrl } from "libs/marketing/auth/marketingOAuthUrls";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자 OAuth 연결 시작(302 → provider authorize)
 * @process 공용 앱 준비 확인 → 서버 Redis에 state/PKCE 저장 → provider authorize 리다이렉트
 * @domain marketing
 * @scope universe-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(
  async (_data, user, request, ctx: { params: Promise<{ provider: string }> }) => {
    if (!request) return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });

    const { provider } = await ctx.params;
    if (!isSupportedOAuthProvider(provider)) {
      return NextResponse.json({ success: false, error: "unsupported_provider" }, { status: 400 });
    }
    const universeId = toSafeString(new URL(request.url).searchParams.get("universeId"));
    if (!universeId) {
      return NextResponse.json({ success: false, error: "universe_id_required" }, { status: 400 });
    }

    const readiness = await getMarketingOAuthAppReadiness(provider);
    if (!readiness.ready) {
      return NextResponse.json({ success: false, error: "oauth_app_not_ready" }, { status: 503 });
    }

    const config = getOAuthProviderConfig(provider);
    const appCredential = await getMarketingOAuthAppCredential(provider);
    const { codeVerifier, codeChallenge } = config.usePkce
      ? createPkcePair()
      : { codeVerifier: "", codeChallenge: "" };
    const redirectUri = buildMarketingOAuthUrl(`/api/marketing/oauth/${provider}/callback`, request);
    const returnPath = `/marketing-oops/connections?universeId=${encodeURIComponent(universeId)}`;
    const actorId = toSafeString(user?.uid || user?.ID);
    const { state } = await createMarketingOAuthTransaction({
      provider,
      universeId,
      actorId,
      codeVerifier,
      redirectUri,
      returnPath,
    });

    return NextResponse.redirect(
      buildAuthorizeUrl({
        config,
        clientId: appCredential.clientId,
        redirectUri,
        state,
        codeChallenge: config.usePkce ? codeChallenge : undefined,
      }),
    );
  },
  undefined,
  "marketing_oauth_start",
  {
    bodyParser: "none",
    checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
  },
);
