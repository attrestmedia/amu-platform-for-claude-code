import "server-only";

import type { MarketingOAuthAppCredential } from "libs/marketing/auth/oauthAppCredentials";
import { fetchProviderIdentity, getOAuthProviderConfig, type OAuthTokenResult } from "libs/marketing/auth/oauthProviderRegistry";
import type { OAuthConnectionProvider } from "models/secure/OAuthConnectionSchema";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose OAuth provider별 장기 토큰 교환·갱신·자산 조회·폐기 수명주기
 * @process provider 공식 endpoint 호출 → 응답 정규화 → 선택 가능한 서버 검증 자산만 반환
 * @domain marketing
 * @scope server
 */

const OAUTH_REQUEST_TIMEOUT_MS = 15_000;

export type MarketingOAuthResource = {
  id: string;
  name: string;
  type: "account" | "property" | "customer";
  managerResourceId?: string;
};

export type MarketingOAuthTokenRefreshResult =
  | { token: OAuthTokenResult; errorCode: ""; reauthRequired: false }
  | { token: null; errorCode: string; reauthRequired: boolean };

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function readJson(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function toTokenResult(payload: Record<string, unknown>): OAuthTokenResult | null {
  const accessToken = toSafeString(payload.access_token);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: toSafeString(payload.refresh_token) || undefined,
    expiresIn: numberOrUndefined(payload.expires_in),
    scope: toSafeString(payload.scope) || undefined,
    tokenType: toSafeString(payload.token_type) || undefined,
    raw: payload,
  };
}

async function fetchToken(url: URL, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS) });
  const payload = await readJson(response);
  if (!response.ok) return null;
  return toTokenResult(payload);
}

export async function exchangeMarketingLongLivedToken(args: {
  provider: OAuthConnectionProvider;
  token: OAuthTokenResult;
  appCredential: MarketingOAuthAppCredential;
}) {
  if (args.provider === "google_analytics" || args.provider === "google_ads") return args.token;

  const isInstagram = args.provider === "instagram";
  const url = new URL(
    isInstagram ? "https://graph.instagram.com/access_token" : "https://graph.threads.net/access_token",
  );
  url.searchParams.set("grant_type", isInstagram ? "ig_exchange_token" : "th_exchange_token");
  url.searchParams.set("client_secret", args.appCredential.clientSecret);
  url.searchParams.set("access_token", args.token.accessToken);

  const longLived = await fetchToken(url, {
    headers: isInstagram ? undefined : { Authorization: `Bearer ${args.token.accessToken}` },
  });
  return longLived
    ? { ...longLived, refreshToken: longLived.refreshToken || args.token.refreshToken, scope: args.token.scope }
    : null;
}

export async function refreshMarketingOAuthToken(args: {
  provider: OAuthConnectionProvider;
  accessToken: string;
  refreshToken?: string;
  appCredential: MarketingOAuthAppCredential;
}): Promise<MarketingOAuthTokenRefreshResult> {
  if (args.provider === "google_analytics" || args.provider === "google_ads") {
    if (!args.refreshToken) {
      return { token: null, errorCode: "oauth_refresh_token_missing", reauthRequired: true };
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: args.refreshToken,
      client_id: args.appCredential.clientId,
      client_secret: args.appCredential.clientSecret,
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
    }).catch(() => null);
    if (!response) {
      return { token: null, errorCode: "oauth_provider_unavailable", reauthRequired: false };
    }
    const payload = await readJson(response);
    if (!response.ok) {
      const providerError = toSafeString(payload.error);
      if (providerError === "invalid_grant") {
        return { token: null, errorCode: "oauth_refresh_token_invalid", reauthRequired: true };
      }
      if (providerError === "invalid_client" || providerError === "unauthorized_client") {
        return { token: null, errorCode: "oauth_app_credentials_invalid", reauthRequired: false };
      }
      return {
        token: null,
        errorCode: response.status >= 500 ? "oauth_provider_unavailable" : "oauth_refresh_rejected",
        reauthRequired: false,
      };
    }
    const refreshed = toTokenResult(payload);
    return refreshed
      ? { token: { ...refreshed, refreshToken: args.refreshToken }, errorCode: "", reauthRequired: false }
      : { token: null, errorCode: "oauth_refresh_response_invalid", reauthRequired: false };
  }

  const isInstagram = args.provider === "instagram";
  const url = new URL(
    isInstagram
      ? "https://graph.instagram.com/refresh_access_token"
      : "https://graph.threads.net/refresh_access_token",
  );
  url.searchParams.set("grant_type", isInstagram ? "ig_refresh_token" : "th_refresh_token");
  url.searchParams.set("access_token", args.accessToken);
  const refreshed = await fetchToken(url, {
    headers: isInstagram ? undefined : { Authorization: `Bearer ${args.accessToken}` },
  }).catch(() => null);
  return refreshed
    ? { token: refreshed, errorCode: "", reauthRequired: false }
    : { token: null, errorCode: "oauth_refresh_rejected", reauthRequired: false };
}

async function listGoogleAnalyticsResources(accessToken: string) {
  const resources: MarketingOAuthResource[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
    });
    const payload = await readJson(response);
    if (!response.ok) throw new Error("OAUTH_RESOURCE_LOOKUP_FAILED");
    const summaries = Array.isArray(payload.accountSummaries) ? payload.accountSummaries : [];
    for (const rawSummary of summaries) {
      const summary = toUnknownRecord(rawSummary);
      const properties = Array.isArray(summary.propertySummaries) ? summary.propertySummaries : [];
      for (const rawProperty of properties) {
        const property = toUnknownRecord(rawProperty);
        const id = toSafeString(property.property);
        if (!id) continue;
        resources.push({
          id,
          name: toSafeString(property.displayName) || id,
          type: "property",
        });
      }
    }
    pageToken = toSafeString(payload.nextPageToken);
    if (!pageToken) break;
  }
  return resources;
}

async function listGoogleAdsResources(accessToken: string, developerToken: string) {
  const response = await fetch("https://googleads.googleapis.com/v24/customers:listAccessibleCustomers", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
    signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error("OAUTH_RESOURCE_LOOKUP_FAILED");
  const names = Array.isArray(payload.resourceNames) ? payload.resourceNames : [];
  const directResources = names
    .map(toSafeString)
    .filter(Boolean)
    .map<MarketingOAuthResource>((resourceName) => ({
      id: resourceName.replace(/^customers\//, ""),
      name: resourceName.replace(/^customers\//, ""),
      type: "customer" as const,
    }));
  const expanded = new Map(directResources.map((resource) => [resource.id, resource]));

  // 직접 접근 대상이 관리자 계정이면 직속 고객도 선택 목록에 포함한다.
  for (const root of directResources.slice(0, 20)) {
    const hierarchyResponse = await fetch(
      `https://googleads.googleapis.com/v24/customers/${root.id}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "developer-token": developerToken,
          "login-customer-id": root.id,
        },
        body: JSON.stringify({
          query:
            "SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.level, customer_client.manager FROM customer_client WHERE customer_client.level <= 1",
        }),
        signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
      },
    ).catch(() => null);
    if (!hierarchyResponse?.ok) continue;
    const hierarchyPayload = await hierarchyResponse.json().catch(() => []);
    const batches = Array.isArray(hierarchyPayload) ? hierarchyPayload : [];
    for (const rawBatch of batches) {
      const rawResults = toUnknownRecord(rawBatch).results;
      const results = Array.isArray(rawResults) ? rawResults : [];
      for (const rawResult of results) {
        const customer = toUnknownRecord(toUnknownRecord(rawResult).customerClient);
        const id = toSafeString(customer.clientCustomer).replace(/^customers\//, "");
        if (!id) continue;
        expanded.set(id, {
          id,
          name: toSafeString(customer.descriptiveName) || id,
          type: "customer",
          ...(id !== root.id ? { managerResourceId: root.id } : {}),
        });
      }
    }
  }
  return [...expanded.values()];
}

export async function listMarketingOAuthResources(args: {
  provider: OAuthConnectionProvider;
  accessToken: string;
  appCredential: MarketingOAuthAppCredential;
  providerAccountId: string;
  displayName?: string;
}) {
  if (args.provider === "google_analytics") return await listGoogleAnalyticsResources(args.accessToken);
  if (args.provider === "google_ads") {
    if (!args.appCredential.developerToken) throw new Error("OAUTH_APP_NOT_READY");
    return await listGoogleAdsResources(args.accessToken, args.appCredential.developerToken);
  }

  const identity = await fetchProviderIdentity({
    config: getOAuthProviderConfig(args.provider),
    token: { accessToken: args.accessToken, raw: {} },
  });
  const id = identity?.providerAccountId || args.providerAccountId;
  return id
    ? [{ id, name: identity?.displayName || args.displayName || id, type: "account" as const }]
    : [];
}

export async function revokeMarketingOAuthToken(args: {
  provider: OAuthConnectionProvider;
  accessToken: string;
}) {
  if (args.provider !== "google_analytics" && args.provider !== "google_ads") return false;
  const body = new URLSearchParams({ token: args.accessToken });
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
  }).catch(() => null);
  return response?.ok === true;
}
