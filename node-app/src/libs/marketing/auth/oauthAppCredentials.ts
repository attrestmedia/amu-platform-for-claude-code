import "server-only";

import { MARKETING_OAUTH_APP_CREDENTIALS } from "consts/marketing/server";
import {
  getDecryptedOAuthAppCredential,
  listOAuthAppCredentialDatabaseStatus,
} from "libs/database/secure/oauthAppCredentials";
import {
  OAUTH_APP_CREDENTIAL_PROVIDERS,
  type OAuthAppCredentialProvider,
} from "models/secure/OAuthAppCredentialSchema";
import type { OAuthConnectionProvider } from "models/secure/OAuthConnectionSchema";
import { logger } from "utils/log";
import {
  getMarketingOAuthAppCredentialMissing,
  getOAuthAppCredentialProvider,
} from "./oauthAppCredentialContract";

export { getMarketingOAuthAppCredentialMissing, getOAuthAppCredentialProvider } from "./oauthAppCredentialContract";

/**
 * @docHint
 * @purpose 사용자 토큰과 분리된 AMU 공용 OAuth 공급자 앱 자격증명 해석
 * @process 글로벌 secrets DB 우선 조회 → env fallback → 필수값 준비 상태 계산 → OAuth/lifecycle 서비스 전달
 * @domain marketing
 * @scope server
 */

export type MarketingOAuthAppCredential = {
  clientId: string;
  clientSecret: string;
  developerToken?: string;
  source: "database" | "environment" | "missing";
};

function getEnvironmentCredential(provider: OAuthConnectionProvider): MarketingOAuthAppCredential {
  const raw = provider === "instagram"
    ? MARKETING_OAUTH_APP_CREDENTIALS.instagram
    : provider === "threads"
      ? MARKETING_OAUTH_APP_CREDENTIALS.threads
      : MARKETING_OAUTH_APP_CREDENTIALS.google;
  const ready = Boolean(raw.clientId && raw.clientSecret);
  return { ...raw, source: ready ? "environment" : "missing" };
}

export async function getMarketingOAuthAppCredential(
  provider: OAuthConnectionProvider,
): Promise<MarketingOAuthAppCredential> {
  const storageProvider = getOAuthAppCredentialProvider(provider);
  try {
    const stored = await getDecryptedOAuthAppCredential(storageProvider);
    if (stored?.clientId && stored.clientSecret) {
      return {
        clientId: stored.clientId,
        clientSecret: stored.clientSecret,
        developerToken: stored.developerToken,
        source: "database",
      };
    }
  } catch (error) {
    logger.warn("[marketing/oauth-app-credentials] database lookup failed; checking environment fallback", {
      provider: storageProvider,
      error,
    });
  }

  return getEnvironmentCredential(provider);
}

export async function getMarketingOAuthAppReadiness(provider: OAuthConnectionProvider) {
  const credential = await getMarketingOAuthAppCredential(provider);
  const missing = getMarketingOAuthAppCredentialMissing(provider, credential);
  return { ready: missing.length === 0, missing, source: credential.source };
}

export async function listMarketingOAuthAppCredentialStatus() {
  let databaseStatus = new Map<OAuthAppCredentialProvider, {
    exists: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasDeveloperToken: boolean;
    updatedAt: string;
  }>();
  try {
    databaseStatus = await listOAuthAppCredentialDatabaseStatus();
  } catch (error) {
    logger.warn("[marketing/oauth-app-credentials] status lookup failed", { error });
  }

  return await Promise.all(
    OAUTH_APP_CREDENTIAL_PROVIDERS.map(async (storageProvider) => {
      const connectionProvider: OAuthConnectionProvider = storageProvider === "google" ? "google_ads" : storageProvider;
      const resolved = await getMarketingOAuthAppCredential(connectionProvider);
      const database = databaseStatus.get(storageProvider);
      const missing = getMarketingOAuthAppCredentialMissing(connectionProvider, resolved);
      return {
        provider: storageProvider,
        exists: Boolean(database?.exists),
        ready: missing.length === 0,
        missing,
        configured: {
          clientId: Boolean(resolved.clientId),
          clientSecret: Boolean(resolved.clientSecret),
          developerToken: Boolean(resolved.developerToken),
        },
        source: resolved.source,
        updatedAt: database?.updatedAt || null,
      };
    }),
  );
}
