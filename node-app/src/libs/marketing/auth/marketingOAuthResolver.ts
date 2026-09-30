import "server-only";

import {
  getDecryptedOAuthConnection,
  hasOAuthConnectionHistory,
  updateOAuthConnectionToken,
  updateOAuthConnectionValidation,
} from "libs/database/secure/oauthConnections";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { getMarketingOAuthAppCredential, getMarketingOAuthAppReadiness } from "libs/marketing/auth/oauthAppCredentials";
import { refreshMarketingOAuthToken } from "libs/marketing/auth/oauthProviderLifecycle";
import { getConnectionStatusAfterRefresh } from "libs/marketing/auth/oauthConnectionStatusContract";
import type { OAuthConnectionProvider } from "models/secure/OAuthConnectionSchema";

/**
 * @docHint
 * @purpose 실행 시점에 유효한 OAuth access token과 선택 자산을 일관되게 해석
 * @process 활성 연결 조회 → 만료 임박 토큰 갱신 → 저장 → 게시·수집 클라이언트에 최소 인증 정보 전달
 * @domain marketing
 * @scope server
 */

const GOOGLE_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const META_REFRESH_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

export async function resolveMarketingOAuthAccess(args: {
  universeId: string;
  provider: OAuthConnectionProvider;
  allowSelectionRequired?: boolean;
}) {
  const readiness = await getMarketingOAuthAppReadiness(args.provider);
  if (!readiness.ready) return null;

  const connection = await getDecryptedOAuthConnection({
    ownerType: "universe",
    ownerId: args.universeId,
    provider: args.provider,
    allowSelectionRequired: args.allowSelectionRequired,
    allowExpired: true,
  });
  if (!connection) return null;

  const isGoogle = args.provider === "google_analytics" || args.provider === "google_ads";
  const refreshWindow = isGoogle ? GOOGLE_REFRESH_WINDOW_MS : META_REFRESH_WINDOW_MS;
  const needsRefresh = !!connection.expiresAt && connection.expiresAt.getTime() <= Date.now() + refreshWindow;
  if (!needsRefresh) {
    return { ...connection, appCredential: await getMarketingOAuthAppCredential(args.provider) };
  }

  const appCredential = await getMarketingOAuthAppCredential(args.provider);
  const refreshResult = await refreshMarketingOAuthToken({
    provider: args.provider,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    appCredential,
  });
  if (!refreshResult.token) {
    await updateOAuthConnectionValidation({
      ownerType: "universe",
      ownerId: args.universeId,
      provider: args.provider,
      providerAccountId: connection.providerAccountId,
      errorCode: refreshResult.errorCode,
      ...(refreshResult.reauthRequired ? { connectionStatus: "reauth_required" as const } : {}),
    });
    return !connection.expiresAt || connection.expiresAt.getTime() > Date.now()
      ? { ...connection, appCredential }
      : null;
  }

  const refreshed = refreshResult.token;
  const refreshedConnectionStatus = getConnectionStatusAfterRefresh({
    connectionStatus: connection.connectionStatus,
    selectedResourceId: connection.selectedResourceId,
  });

  await updateOAuthConnectionToken({
    ownerType: "universe",
    ownerId: args.universeId,
    provider: args.provider,
    providerAccountId: connection.providerAccountId,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresIn: refreshed.expiresIn,
    tokenType: refreshed.tokenType,
    connectionStatus: refreshedConnectionStatus,
  });

  return {
    ...connection,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || connection.refreshToken,
    expiresAt: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : connection.expiresAt,
    connectionStatus: refreshedConnectionStatus,
    appCredential,
  };
}

export async function resolveSocialMarketingCredential(
  universeId: string,
  provider: "instagram" | "threads",
) {
  const oauth = await resolveMarketingOAuthAccess({ universeId, provider });
  if (oauth) {
    return {
      clientId: oauth.selectedResourceId || oauth.providerAccountId,
      clientSecret: oauth.accessToken,
      extras: {
        username: oauth.selectedResourceName || oauth.displayName,
        authMode: provider === "instagram" ? "instagram_login" : undefined,
      } as Record<string, unknown>,
      source: "oauth" as const,
    };
  }

  // 한 번 OAuth로 전환한 유니버스는 해제/오류 후 오래된 수동 토큰으로 자동 회귀하지 않는다.
  const hasHistory = await hasOAuthConnectionHistory({ ownerType: "universe", ownerId: universeId, provider });
  if (hasHistory) return null;

  const legacy = await getDecryptedCredential(universeId, provider);
  return legacy ? { ...legacy, source: "legacy" as const } : null;
}
