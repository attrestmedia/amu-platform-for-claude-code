import "server-only";

import { redactSecrets } from "libs/api/thirdparty/redactSecrets";
import {
  getGoogleAdsAccessToken,
  type GoogleAdsAuth,
} from "libs/api/thirdparty/googleads/googleAdsClient";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

const SEARCH_CONSOLE_BASE_URL = "https://searchconsole.googleapis.com/webmasters/v3";
const REQUEST_TIMEOUT_MS = 30_000;

type SearchConsoleRequestBody = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit: number;
  startRow: number;
  type: string;
  dimensionFilterGroups?: Array<{
    groupType: "and";
    filters: Array<{
      dimension: string;
      operator: "contains" | "equals";
      expression: string;
    }>;
  }>;
};

export type SearchConsoleQueryResponse = {
  rows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
  responseAggregationType?: string;
};

class SearchConsoleApiError extends Error {
  readonly status: number;
  readonly errorCode = "SEARCH_CONSOLE_API_ERROR";

  constructor(status: number, raw: string) {
    const payload = toUnknownRecord(raw ? JSON.parse(raw) : {});
    const providerError = toUnknownRecord(payload.error);
    const providerMessage = toSafeString(providerError.message);
    super(providerMessage ? `SEARCH_CONSOLE_${status}:${providerMessage}` : `SEARCH_CONSOLE_${status}`);
    this.name = "SearchConsoleApiError";
    this.status = status;
  }
}

async function searchConsoleRequest<T>(auth: GoogleAdsAuth, path: string, body?: unknown) {
  const accessToken = await getGoogleAdsAccessToken(auth);
  const response = await fetch(`${SEARCH_CONSOLE_BASE_URL}${path}`, {
    method: typeof body === "undefined" ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: typeof body === "undefined" ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) {
    let safeRaw = "";
    try {
      safeRaw = redactSecrets(raw);
      throw new SearchConsoleApiError(response.status, safeRaw);
    } catch (error) {
      if (error instanceof SearchConsoleApiError) throw error;
      throw new SearchConsoleApiError(response.status, "");
    }
  }
  return (raw ? JSON.parse(raw) : {}) as T;
}

export function searchConsoleListSites(auth: GoogleAdsAuth) {
  return searchConsoleRequest<{
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
  }>(auth, "/sites");
}

export function searchConsoleQuery(auth: GoogleAdsAuth, siteUrl: string, body: SearchConsoleRequestBody) {
  return searchConsoleRequest<SearchConsoleQueryResponse>(
    auth,
    `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    body,
  );
}
