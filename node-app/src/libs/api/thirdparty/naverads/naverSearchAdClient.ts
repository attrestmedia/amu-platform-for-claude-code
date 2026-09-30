import "server-only";

import crypto from "crypto";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { redactSecrets } from "libs/api/thirdparty/redactSecrets";
import { toSafeString } from "utils/common/typeUtils";

const NAVER_SEARCH_AD_BASE_URL = "https://api.searchad.naver.com";
const REQUEST_TIMEOUT_MS = 15_000;

export type NaverAdsAuth = { apiKey: string; secretKey: string; customerId: string };

export async function getNaverAdsAuth(universeId: string): Promise<NaverAdsAuth | null> {
  const credential = await getDecryptedCredential(universeId, "naver_ads");
  const apiKey = toSafeString(credential?.clientId);
  const secretKey = toSafeString(credential?.clientSecret);
  const customerId = toSafeString(credential?.extras?.customerId);
  return apiKey && secretKey && customerId ? { apiKey, secretKey, customerId } : null;
}

function buildSignature(auth: NaverAdsAuth, timestamp: string, method: string, uri: string) {
  return crypto.createHmac("sha256", auth.secretKey).update(`${timestamp}.${method}.${uri}`).digest("base64");
}

export async function naverSearchAdRequest<T>(
  auth: NaverAdsAuth,
  method: "GET" | "POST" | "PUT" | "DELETE",
  uri: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
) {
  const timestamp = String(Date.now());
  const search = options.query ? `?${new URLSearchParams(options.query)}` : "";
  const response = await fetch(`${NAVER_SEARCH_AD_BASE_URL}${uri}${search}`, {
    method,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "X-Timestamp": timestamp,
      "X-API-KEY": auth.apiKey,
      "X-Customer": auth.customerId,
      "X-Signature": buildSignature(auth, timestamp, method, uri),
    },
    body: typeof options.body === "undefined" ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`NAVER_SEARCH_AD_${response.status}:${redactSecrets(raw).slice(0, 500)}`);
  return (raw ? JSON.parse(raw) : null) as T;
}

export const naverSearchAdReadApi = {
  listCampaigns: (auth: NaverAdsAuth) => naverSearchAdRequest<Record<string, unknown>[]>(auth, "GET", "/ncc/campaigns"),
  listAdGroups: (auth: NaverAdsAuth, nccCampaignId: string) =>
    naverSearchAdRequest<Record<string, unknown>[]>(auth, "GET", "/ncc/adgroups", { query: { nccCampaignId } }),
  listKeywords: (auth: NaverAdsAuth, nccAdgroupId: string) =>
    naverSearchAdRequest<Record<string, unknown>[]>(auth, "GET", "/ncc/keywords", { query: { nccAdgroupId } }),
  getStats: (auth: NaverAdsAuth, ids: string[], since: string, until: string) =>
    naverSearchAdRequest<Record<string, unknown>>(auth, "GET", "/stats", {
      query: {
        ids: ids.join(","),
        fields: JSON.stringify(["impCnt", "clkCnt", "salesAmt", "ccnt", "convAmt"]),
        timeRange: JSON.stringify({ since, until }),
        timeIncrement: "1",
      },
    }),
  keywordIdeas: (auth: NaverAdsAuth, hintKeywords: string[]) =>
    naverSearchAdRequest<Record<string, unknown>>(auth, "GET", "/keywordstool", {
      query: { hintKeywords: hintKeywords.join(","), showDetail: "1" },
    }),
};
