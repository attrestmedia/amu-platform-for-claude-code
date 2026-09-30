import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { upsertOAuthConnection } from "libs/database/secure/oauthConnections";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { getMarketingOAuthAppCredential, getMarketingOAuthAppReadiness } from "libs/marketing/auth/oauthAppCredentials";
import { exchangeMarketingLongLivedToken } from "libs/marketing/auth/oauthProviderLifecycle";
import {
  exchangeCodeForToken,
  fetchProviderIdentity,
  getOAuthProviderConfig,
  isSupportedOAuthProvider,
} from "libs/marketing/auth/oauthProviderRegistry";
import { consumeMarketingOAuthTransaction } from "libs/marketing/auth/oauthTransactionService";
import { buildMarketingOAuthUrl } from "libs/marketing/auth/marketingOAuthUrls";
import { assessOAuthScopes } from "libs/marketing/auth/oauthScopeContract";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자 OAuth 콜백(code → 장기 token 교환 → 연결 저장)
 * @process 서버 state 1회 소비·actor 검증 → token/identity 교환 → 자산 선택 상태 저장 → 연결 센터 리다이렉트
 * @domain marketing
 * @scope universe-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function redirectToConnections(
  request: Request,
  returnPath: string,
  provider: string,
  status: "connected" | "failed" | "selection_required",
  reason?: string,
) {
  const safePath = returnPath.startsWith("/marketing-oops/connections")
    ? returnPath
    : "/marketing-oops/connections";
  const redirectUrl = new URL(buildMarketingOAuthUrl(safePath, request));
  redirectUrl.searchParams.set("marketingOAuth", status);
  redirectUrl.searchParams.set("provider", provider);
  if (reason) redirectUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(redirectUrl);
}

export const GET = withAuth(
  async (_data, user, request, ctx: { params: Promise<{ provider: string }> }) => {
    if (!request) return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });

    const { provider } = await ctx.params;
    const url = new URL(request.url);
    const state = toSafeString(url.searchParams.get("state"));
    const transaction = await consumeMarketingOAuthTransaction(state);
    const returnPath = transaction?.returnPath || "/marketing-oops/connections";

    if (!isSupportedOAuthProvider(provider) || transaction?.provider !== provider) {
      return redirectToConnections(request, returnPath, provider, "failed", "invalid_state");
    }
    const actorId = toSafeString(user?.uid || user?.ID);
    if (!transaction || !actorId || transaction.actorId !== actorId) {
      return redirectToConnections(request, returnPath, provider, "failed", "invalid_state");
    }

    const providerError = toSafeString(url.searchParams.get("error"));
    if (providerError) {
      return redirectToConnections(request, returnPath, provider, "failed", providerError);
    }
    const code = toSafeString(url.searchParams.get("code"));
    if (!code) return redirectToConnections(request, returnPath, provider, "failed", "code_missing");

    const access = await assertMarketingUniverseAccess({ user, universeId: transaction.universeId });
    if (!access.ok) return redirectToConnections(request, returnPath, provider, "failed", access.error);

    const readiness = await getMarketingOAuthAppReadiness(provider);
    if (!readiness.ready) {
      return redirectToConnections(request, returnPath, provider, "failed", "oauth_app_not_ready");
    }

    try {
      const config = getOAuthProviderConfig(provider);
      const appCredential = await getMarketingOAuthAppCredential(provider);
      const shortToken = await exchangeCodeForToken({
        config,
        clientId: appCredential.clientId,
        clientSecret: appCredential.clientSecret,
        code,
        redirectUri: transaction.redirectUri,
        codeVerifier: transaction.codeVerifier || undefined,
      });
      if (!shortToken) {
        return redirectToConnections(request, returnPath, provider, "failed", "token_exchange_failed");
      }
      const token = await exchangeMarketingLongLivedToken({ provider, token: shortToken, appCredential });
      if (!token) {
        return redirectToConnections(request, returnPath, provider, "failed", "long_lived_token_failed");
      }
      const identity = await fetchProviderIdentity({ config, token });
      if (!identity?.providerAccountId) {
        return redirectToConnections(request, returnPath, provider, "failed", "identity_lookup_failed");
      }

      const permissionMissing = !assessOAuthScopes(provider, token.scope).complete;
      const needsSelection = provider === "google_analytics" || provider === "google_ads";
      const connectionStatus = permissionMissing
        ? "permission_missing"
        : needsSelection
          ? "selection_required"
          : "connected";

      await upsertOAuthConnection({
        ownerType: "universe",
        ownerId: transaction.universeId,
        provider,
        providerAccountId: identity.providerAccountId,
        displayName: identity.displayName,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        scope: token.scope || config.scopes,
        tokenType: token.tokenType,
        expiresIn: token.expiresIn,
        connectionStatus,
        selectedResourceId: needsSelection ? "" : identity.providerAccountId,
        selectedResourceName: needsSelection ? "" : identity.displayName,
        selectedResourceType: needsSelection ? "" : "account",
        connectedByProviderUserId: identity.providerAccountId,
        actor: toSafeString(user?.userEmail || user?.userEmailLower || actorId),
      });

      if (permissionMissing) {
        return redirectToConnections(request, returnPath, provider, "failed", "permission_missing");
      }
      return redirectToConnections(
        request,
        returnPath,
        provider,
        needsSelection ? "selection_required" : "connected",
      );
    } catch {
      return redirectToConnections(request, returnPath, provider, "failed", "provider_request_failed");
    }
  },
  undefined,
  "marketing_oauth_callback",
  { bodyParser: "none" },
);
