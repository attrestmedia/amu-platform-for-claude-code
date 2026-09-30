import type { OAuthAppCredentialProvider } from "models/secure/OAuthAppCredentialSchema";
import type { OAuthConnectionProvider } from "models/secure/OAuthConnectionSchema";

/**
 * @docHint
 * @purpose OAuth connection provider와 글로벌 app credential provider/readiness의 순수 계약 제공
 * @process provider 매핑 → 필수 App ID/Secret/Developer Token 누락 계산
 * @domain marketing-auth
 * @scope shared
 */

export function getOAuthAppCredentialProvider(provider: OAuthConnectionProvider): OAuthAppCredentialProvider {
  if (provider === "instagram" || provider === "threads") return provider;
  return "google";
}

export function getMarketingOAuthAppCredentialMissing(
  provider: OAuthConnectionProvider,
  credential: { clientId: string; clientSecret: string; developerToken?: string },
) {
  return [
    ...(!credential.clientId ? ["clientId"] : []),
    ...(!credential.clientSecret ? ["clientSecret"] : []),
    ...(provider === "google_ads" && !credential.developerToken ? ["developerToken"] : []),
  ];
}
