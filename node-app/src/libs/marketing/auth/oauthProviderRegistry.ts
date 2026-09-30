import "server-only";

import crypto from "crypto";
import { resolveInstagramAccountIdentity } from "libs/api/thirdparty/instagram/instagramIdentity";
import type { CredentialProviderType } from "types/thirdparty/providers";
import type { OAuthConnectionProvider } from "models/secure/OAuthConnectionSchema";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자 OAuth 연결 provider 레지스트리(authorize/token/identity/scope) + PKCE·토큰 교환 유틸
 * @process provider별 표준 Authorization Code(+PKCE) 흐름을 데이터 구동으로 흡수하고, 관리자 공용 앱 자격증명으로 토큰을 교환
 * @domain marketing
 * @scope server
 */

export type OAuthProviderConfig = {
  provider: OAuthConnectionProvider;
  // 글로벌 OAuth App Credential 저장소에서 공용 앱 Client ID/Secret을 읽기 위한 provider 매핑
  credentialProvider: CredentialProviderType;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator: string; // Google " ", Meta ","
  usePkce: boolean;
  extraAuthParams?: Record<string, string>;
  identity: {
    // Bearer GET로 계정 식별자를 조회할 URL (미지정 시 토큰 응답의 tokenAccountField 사용)
    url?: string;
    // identity(또는 토큰) 응답에서 providerAccountId로 쓸 필드
    idField: string;
    nameField?: string;
    // 토큰 응답 자체에 계정 id가 오는 provider(Meta 계열)용 필드명
    tokenAccountField?: string;
  };
};

const OAUTH_REQUEST_TIMEOUT_MS = 15_000;

// 초기 지원: 기존 credential 슬롯이 있고 OAuth 표준 흐름이 확실한 provider만 활성화
const OAUTH_PROVIDER_CONFIGS: Record<OAuthConnectionProvider, OAuthProviderConfig> = {
  instagram: {
    provider: "instagram",
    credentialProvider: "instagram",
    authorizeUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    scopeSeparator: ",",
    usePkce: false,
    identity: {
      url: "https://graph.instagram.com/me?fields=user_id,username",
      idField: "user_id",
      nameField: "username",
      tokenAccountField: "user_id",
    },
  },
  threads: {
    provider: "threads",
    credentialProvider: "threads",
    authorizeUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: ["threads_basic", "threads_content_publish"],
    scopeSeparator: ",",
    usePkce: false,
    identity: {
      url: "https://graph.threads.net/v1.0/me?fields=id,username",
      idField: "id",
      nameField: "username",
      tokenAccountField: "user_id",
    },
  },
  google_analytics: {
    provider: "google_analytics",
    credentialProvider: "google_analytics",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/analytics.readonly"],
    scopeSeparator: " ",
    usePkce: true,
    extraAuthParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      enable_granular_consent: "true",
    },
    identity: {
      url: "https://openidconnect.googleapis.com/v1/userinfo",
      idField: "sub",
      nameField: "email",
    },
  },
  google_ads: {
    provider: "google_ads",
    credentialProvider: "google_ads",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // adwords 외 webmasters.readonly 포함: searchConsoleClient가 GoogleAdsAuth를 재사용하므로
    // 간편 연결(편도 전환) 이후에도 Search Console 조회가 동일 OAuth 토큰으로 동작해야 한다.
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/adwords",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
    scopeSeparator: " ",
    usePkce: true,
    extraAuthParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      enable_granular_consent: "true",
    },
    identity: {
      url: "https://openidconnect.googleapis.com/v1/userinfo",
      idField: "sub",
      nameField: "email",
    },
  },
};

export function isSupportedOAuthProvider(value: string): value is OAuthConnectionProvider {
  return Object.prototype.hasOwnProperty.call(OAUTH_PROVIDER_CONFIGS, value);
}

export function getOAuthProviderConfig(provider: OAuthConnectionProvider): OAuthProviderConfig {
  return OAUTH_PROVIDER_CONFIGS[provider];
}

/** PKCE code_verifier/challenge 생성 (RFC 7636) */
export function createPkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizeUrl(args: {
  config: OAuthProviderConfig;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}) {
  const { config } = args;
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("scope", config.scopes.join(config.scopeSeparator));
  url.searchParams.set("state", args.state);
  if (config.usePkce && args.codeChallenge) {
    url.searchParams.set("code_challenge", args.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  Object.entries(config.extraAuthParams || {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function readJsonSafe(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    // Meta 일부 응답은 querystring 형태일 수 있어 방어적으로 파싱
    if (text.includes("=") && text.includes("&")) {
      return Object.fromEntries(new URLSearchParams(text));
    }
    return { raw: text };
  }
}

export type OAuthTokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
  raw: Record<string, unknown>;
};

export async function exchangeCodeForToken(args: {
  config: OAuthProviderConfig;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<OAuthTokenResult | null> {
  const { config } = args;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
  });
  if (config.usePkce && args.codeVerifier) {
    body.set("code_verifier", args.codeVerifier);
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
  });
  const payload = (await readJsonSafe(response)) as Record<string, unknown>;
  const accessToken = toSafeString(payload?.access_token);
  if (!response.ok || !accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken: toSafeString(payload?.refresh_token) || undefined,
    expiresIn: Number(payload?.expires_in) || undefined,
    scope: toSafeString(payload?.scope) || undefined,
    tokenType: toSafeString(payload?.token_type) || undefined,
    raw: payload,
  };
}

export type OAuthIdentity = {
  providerAccountId: string;
  displayName?: string;
};

export async function fetchProviderIdentity(args: {
  config: OAuthProviderConfig;
  token: OAuthTokenResult;
}): Promise<OAuthIdentity | null> {
  const { config, token } = args;

  // 1) 토큰 응답에 계정 id가 직접 오는 provider(Meta) 우선 처리
  if (config.identity.tokenAccountField) {
    const fromToken = toSafeString(token.raw?.[config.identity.tokenAccountField]);
    if (fromToken && !config.identity.url) {
      return { providerAccountId: fromToken };
    }
    // url이 있으면 아래에서 username 등 보강
  }

  // 2) Bearer GET identity 조회
  if (config.identity.url) {
    const response = await fetch(config.identity.url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
    });
    const payload = (await readJsonSafe(response)) as Record<string, unknown>;
    if (!response.ok) {
      // Meta는 access_token 쿼리 방식도 허용 → 토큰 응답 id로 폴백
      const fallback = config.identity.tokenAccountField
        ? toSafeString(token.raw?.[config.identity.tokenAccountField])
        : "";
      return fallback ? { providerAccountId: fallback } : null;
    }
    const firstData = Array.isArray(payload.data) && payload.data[0] && typeof payload.data[0] === "object"
      ? (payload.data[0] as Record<string, unknown>)
      : null;
    const instagramIdentity =
      config.provider === "instagram"
        ? resolveInstagramAccountIdentity(firstData || payload, "instagram_login")
        : null;
    const id =
      instagramIdentity?.accountId ||
      toSafeString(payload?.[config.identity.idField] ?? firstData?.[config.identity.idField]);
    if (!id) return null;
    return {
      providerAccountId: id,
      displayName:
        instagramIdentity?.username ||
        (config.identity.nameField
          ? toSafeString(payload?.[config.identity.nameField] ?? firstData?.[config.identity.nameField])
          : undefined),
    };
  }

  return null;
}
