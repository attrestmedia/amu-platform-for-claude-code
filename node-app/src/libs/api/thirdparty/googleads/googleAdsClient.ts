import "server-only";

import { getDecryptedCredential } from "libs/database/secure/credentials";
import { hasOAuthConnectionHistory } from "libs/database/secure/oauthConnections";
import { resolveMarketingOAuthAccess } from "libs/marketing/auth/marketingOAuthResolver";
import { redactSecrets } from "libs/api/thirdparty/redactSecrets";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

const GOOGLE_ADS_API_VERSION = "v24";
const REQUEST_TIMEOUT_MS = 15_000;
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

export type GoogleAdsAuth = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
  accessToken?: string;
};

type GoogleAdsRequestOptions = {
  omitLoginCustomerId?: boolean;
};

type GoogleAdsFailureDetails = {
  reasons: string[];
  providerMessage?: string;
  requestId?: string;
};

export class GoogleAdsApiError extends Error {
  readonly status: number;
  readonly reasons: string[];
  readonly providerMessage?: string;
  readonly requestId?: string;

  constructor(args: { status: number; raw: string; headerRequestId?: string }) {
    const details = extractGoogleAdsFailureDetails(args.raw);
    super(`GOOGLE_ADS_${args.status}:${details.reasons.join(",") || "UNKNOWN"}`);
    this.name = "GoogleAdsApiError";
    this.status = args.status;
    this.reasons = details.reasons;
    this.providerMessage = details.providerMessage;
    this.requestId = details.requestId || args.headerRequestId;
  }
}

function extractGoogleAdsFailureDetails(raw: string): GoogleAdsFailureDetails {
  const reasons = new Set<string>();
  let providerMessage = "";
  let requestId = "";
  try {
    const parsed = JSON.parse(raw);
    const envelopes = Array.isArray(parsed) ? parsed : [parsed];
    for (const rawEnvelope of envelopes) {
      const envelope = toUnknownRecord(rawEnvelope);
      const error = toUnknownRecord(envelope.error);
      const details = Array.isArray(error.details) ? error.details : [];
      for (const rawDetail of details) {
        const detail = toUnknownRecord(rawDetail);
        requestId ||= toSafeString(detail.requestId);
        const errors = Array.isArray(detail.errors) ? detail.errors : [];
        for (const rawError of errors) {
          const googleError = toUnknownRecord(rawError);
          providerMessage ||= toSafeString(googleError.message);
          const errorCode = toUnknownRecord(googleError.errorCode);
          Object.values(errorCode).forEach((value) => {
            const reason = toSafeString(value).toUpperCase();
            if (reason) reasons.add(reason);
          });
        }
      }
    }
  } catch {}
  return {
    reasons: [...reasons],
    ...(providerMessage ? { providerMessage } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

function digits(value: unknown) {
  // Customer ID는 숫자만 유효하다. 하이픈 외에 공백/문자 혼입도 제거해 잘못된 REST 경로 호출을 막는다.
  return toSafeString(value).replace(/\D+/g, "");
}

export async function getGoogleAdsAuth(universeId: string): Promise<GoogleAdsAuth | null> {
  const oauth = await resolveMarketingOAuthAccess({ universeId, provider: "google_ads" });
  if (oauth?.selectedResourceId) {
    return {
      clientId: oauth.appCredential.clientId,
      clientSecret: oauth.appCredential.clientSecret,
      refreshToken: oauth.refreshToken,
      developerToken: oauth.appCredential.developerToken || "",
      customerId: digits(oauth.selectedResourceId),
      loginCustomerId: digits(oauth.managerResourceId) || undefined,
      accessToken: oauth.accessToken,
    };
  }
  if (await hasOAuthConnectionHistory({ ownerType: "universe", ownerId: universeId, provider: "google_ads" })) {
    return null;
  }

  const credential = await getDecryptedCredential(universeId, "google_ads");
  let secret: Record<string, unknown> = {};
  try {
    secret = toUnknownRecord(JSON.parse(toSafeString(credential?.clientSecret)));
  } catch {
    return null;
  }
  const auth = {
    clientId: toSafeString(credential?.clientId),
    clientSecret: toSafeString(secret.clientSecret),
    refreshToken: toSafeString(secret.refreshToken),
    developerToken: toSafeString(secret.developerToken),
    customerId: digits(credential?.extras?.customerId),
    loginCustomerId: digits(credential?.extras?.loginCustomerId) || undefined,
  };
  return auth.clientId && auth.clientSecret && auth.refreshToken && auth.developerToken && auth.customerId ? auth : null;
}

export async function getGoogleAdsAccessToken(auth: GoogleAdsAuth) {
  if (auth.accessToken) return auth.accessToken;
  const cacheKey = `${auth.clientId}:${auth.refreshToken.slice(-12)}`;
  const cached = accessTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      refresh_token: auth.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = toUnknownRecord(await response.json().catch(() => ({})));
  const token = toSafeString(body.access_token);
  if (!response.ok || !token) throw new Error(`GOOGLE_ADS_OAUTH_FAILED:${redactSecrets(JSON.stringify(body)).slice(0, 300)}`);
  accessTokenCache.set(cacheKey, { token, expiresAt: Date.now() + Math.max(300, Number(body.expires_in || 3600)) * 1000 });
  return token;
}

export async function googleAdsRequest<T>(
  auth: GoogleAdsAuth,
  path: string,
  body?: unknown,
  options: GoogleAdsRequestOptions = {},
) {
  const token = await getGoogleAdsAccessToken(auth);
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "developer-token": auth.developerToken,
  };
  if (auth.loginCustomerId && !options.omitLoginCustomerId) headers["login-customer-id"] = auth.loginCustomerId;
  const response = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/${path}`, {
    method: typeof body === "undefined" ? "GET" : "POST",
    headers,
    body: typeof body === "undefined" ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new GoogleAdsApiError({
      status: response.status,
      raw: redactSecrets(raw),
      headerRequestId: response.headers.get("request-id") || response.headers.get("google-ads-request-id") || undefined,
    });
  }
  return (raw ? JSON.parse(raw) : {}) as T;
}

export function googleAdsSearch<T>(auth: GoogleAdsAuth, query: string) {
  return googleAdsRequest<Array<{ results?: T[] }>>(
    auth,
    `customers/${auth.customerId}/googleAds:searchStream`,
    { query },
  );
}

export function googleAdsSearchForCustomer<T>(auth: GoogleAdsAuth, customerId: string, query: string) {
  return googleAdsRequest<Array<{ results?: T[] }>>(
    auth,
    `customers/${digits(customerId)}/googleAds:searchStream`,
    { query },
  );
}

export function googleAdsListAccessibleCustomers(auth: GoogleAdsAuth) {
  return googleAdsRequest<{ resourceNames?: string[] }>(
    auth,
    "customers:listAccessibleCustomers",
    undefined,
    { omitLoginCustomerId: true },
  );
}

export type GoogleAdsKeywordIdeasInput = {
  keywords: string[];
  languageId?: string;
  geoTargetIds?: string[];
  urlSeed?: string;
  pageSize?: number;
  keywordPlanNetwork?: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS";
  includeAdultKeywords?: boolean;
};

export type GoogleAdsKeywordIdeasResponse = {
  results?: Array<{
    text?: string;
    keywordIdeaMetrics?: {
      avgMonthlySearches?: number;
      competition?: string;
      competitionIndex?: number;
      lowTopOfPageBidMicros?: string | number;
      highTopOfPageBidMicros?: string | number;
    };
  }>;
  nextPageToken?: string;
  totalSize?: string | number;
};

export function googleAdsGenerateKeywordIdeas(auth: GoogleAdsAuth, input: GoogleAdsKeywordIdeasInput) {
  const keywords = input.keywords.map((value) => toSafeString(value)).filter(Boolean).slice(0, 10);
  const languageId = digits(input.languageId || "1012");
  const geoTargetIds = (input.geoTargetIds?.length ? input.geoTargetIds : ["2410"])
    .map(digits)
    .filter(Boolean)
    .slice(0, 10);
  const urlSeed = toSafeString(input.urlSeed);
  const rawPageSize = Number(input.pageSize || 20);
  const pageSize = Math.max(1, Math.min(100, Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : 20));
  const body: Record<string, unknown> = {
    pageSize,
    includeAdultKeywords: input.includeAdultKeywords === true,
    keywordPlanNetwork: input.keywordPlanNetwork || "GOOGLE_SEARCH_AND_PARTNERS",
    language: `languageConstants/${languageId || "1012"}`,
    geoTargetConstants: (geoTargetIds.length ? geoTargetIds : ["2410"]).map((id) => `geoTargetConstants/${id}`),
  };

  if (urlSeed && keywords.length > 0) body.keywordAndUrlSeed = { url: urlSeed, keywords };
  else if (urlSeed) body.urlSeed = { url: urlSeed };
  else body.keywordSeed = { keywords };

  return googleAdsRequest<GoogleAdsKeywordIdeasResponse>(
    auth,
    `customers/${auth.customerId}:generateKeywordIdeas`,
    body,
  );
}

export const GOOGLE_ADS_GAQL = {
  accessibleCheck: "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1",
  customerHierarchy: (customerId: string) =>
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.level, customer_client.manager, customer_client.status, customer_client.test_account FROM customer_client WHERE customer_client.id = ${digits(customerId)}`,
  campaignDaily: (since: string, until: string) =>
    `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`,
} as const;
