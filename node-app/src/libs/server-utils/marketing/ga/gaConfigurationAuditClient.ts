import "server-only";

import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

const GA_ADMIN_BASE_URL = "https://analyticsadmin.googleapis.com";
const GA_DATA_BASE_URL = "https://analyticsdata.googleapis.com";
const GA_REQUEST_TIMEOUT_MS = 15_000;
const GA_MAX_LIST_PAGES = 5;
const GA_EVENT_CATALOG_LIMIT = 250;

type GaApiError = {
  errorCode: string;
  httpStatus: number | null;
  message: string;
};

export type GaAuditSection<T> =
  | { status: "ok"; data: T }
  | { status: "partial"; data: T; error: GaApiError }
  | { status: "error"; data: null; error: GaApiError };

export type GaObservedEvents = GaAuditSection<{
  dateRange: { startDate: string; endDate: string };
  rowCount: number;
  truncated: boolean;
  events: Array<{
    eventName: string;
    eventCount: number;
    totalUsers: number;
    keyEvents: number;
  }>;
}>;

class GoogleAnalyticsApiError extends Error {
  httpStatus: number;
  errorCode: string;

  constructor(args: { message: string; httpStatus: number; errorCode: string }) {
    super(args.message);
    this.name = "GoogleAnalyticsApiError";
    this.httpStatus = args.httpStatus;
    this.errorCode = args.errorCode;
  }
}

function dateDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readJsonSafe(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toGaApiError(error: unknown): GaApiError {
  if (error instanceof GoogleAnalyticsApiError) {
    return {
      errorCode: error.errorCode,
      httpStatus: error.httpStatus,
      message: error.message,
    };
  }
  return {
    errorCode: "GA_API_REQUEST_FAILED",
    httpStatus: null,
    message: error instanceof Error ? error.message.slice(0, 300) : "Google Analytics API request failed",
  };
}

async function requestGoogleAnalyticsJson(
  accessToken: string,
  url: URL,
  init: Pick<RequestInit, "method" | "body"> = {},
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(GA_REQUEST_TIMEOUT_MS),
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    const apiError = toUnknownRecord(payload.error);
    throw new GoogleAnalyticsApiError({
      httpStatus: response.status,
      errorCode: toSafeString(apiError.status) || `GA_API_HTTP_${response.status}`,
      message: toSafeString(apiError.message).slice(0, 300) || "Google Analytics API request failed",
    });
  }
  return payload;
}

export async function getGaAdminSection(
  accessToken: string,
  url: URL,
): Promise<GaAuditSection<Record<string, unknown>>> {
  try {
    return { status: "ok", data: await requestGoogleAnalyticsJson(accessToken, url) };
  } catch (error) {
    return { status: "error", data: null, error: toGaApiError(error) };
  }
}

export async function listGaAdminSection(
  accessToken: string,
  baseUrl: URL,
  collectionKey: string,
): Promise<GaAuditSection<Record<string, unknown>[]>> {
  const data: Record<string, unknown>[] = [];
  let pageToken = "";
  try {
    for (let page = 0; page < GA_MAX_LIST_PAGES; page += 1) {
      const url = new URL(baseUrl);
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const payload = await requestGoogleAnalyticsJson(accessToken, url);
      const items = Array.isArray(payload[collectionKey]) ? payload[collectionKey] : [];
      items.forEach((item) => data.push(toUnknownRecord(item)));
      pageToken = toSafeString(payload.nextPageToken);
      if (!pageToken) return { status: "ok", data };
    }
    return {
      status: "partial",
      data,
      error: {
        errorCode: "GA_API_LIST_PAGE_LIMIT",
        httpStatus: null,
        message: `List response exceeded ${GA_MAX_LIST_PAGES} pages`,
      },
    };
  } catch (error) {
    return data.length
      ? { status: "partial", data, error: toGaApiError(error) }
      : { status: "error", data: null, error: toGaApiError(error) };
  }
}

export function gaAdminUrl(version: "v1alpha" | "v1beta", resourcePath: string) {
  return new URL(`${GA_ADMIN_BASE_URL}/${version}/${resourcePath}`);
}

export async function getGaObservedEvents(
  accessToken: string,
  propertyId: string,
  lookbackDays: number,
): Promise<GaObservedEvents> {
  const startDate = dateDaysAgo(lookbackDays);
  const endDate = "today";
  const url = new URL(`${GA_DATA_BASE_URL}/v1beta/properties/${propertyId}:runReport`);
  try {
    const payload = await requestGoogleAnalyticsJson(accessToken, url, {
      method: "POST",
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }, { name: "totalUsers" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: GA_EVENT_CATALOG_LIMIT,
      }),
    });
    const events = (Array.isArray(payload.rows) ? payload.rows : []).map((rawRow) => {
      const row = toUnknownRecord(rawRow);
      const dimensionValues = Array.isArray(row.dimensionValues) ? row.dimensionValues : [];
      const metricValues = Array.isArray(row.metricValues) ? row.metricValues : [];
      return {
        eventName: toSafeString(toUnknownRecord(dimensionValues[0]).value),
        eventCount: toNumber(toUnknownRecord(metricValues[0]).value),
        totalUsers: toNumber(toUnknownRecord(metricValues[1]).value),
        keyEvents: toNumber(toUnknownRecord(metricValues[2]).value),
      };
    });
    const rowCount = toNumber(payload.rowCount) || events.length;
    return {
      status: "ok",
      data: {
        dateRange: { startDate, endDate },
        rowCount,
        truncated: rowCount > events.length,
        events,
      },
    };
  } catch (error) {
    return { status: "error", data: null, error: toGaApiError(error) };
  }
}

export function gaSectionArray(section: GaAuditSection<Record<string, unknown>[]>) {
  return section.status === "error" ? null : section.data;
}
