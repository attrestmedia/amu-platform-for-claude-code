import "server-only";

import { toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose LinkedIn Community Management Member Analytics API read-only client
 * @process 승인된 member token + Linkedin-Version → 게시물별 memberCreatorPostAnalytics TOTAL 지표 / memberFollowersCount lifetime 조회
 * @domain marketing
 * @scope server
 */

const LINKEDIN_API_BASE = "https://api.linkedin.com";

export const LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE = "r_member_postAnalytics";
export const LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE = "r_member_profileAnalytics";

export const LINKEDIN_CORE_POST_ANALYTICS_METRICS = [
  "IMPRESSION",
  "MEMBERS_REACHED",
  "RESHARE",
  "REACTION",
  "COMMENT",
] as const;

export type LinkedInPostAnalyticsMetric = (typeof LINKEDIN_CORE_POST_ANALYTICS_METRICS)[number];

const LINKEDIN_METRIC_KEY: Record<LinkedInPostAnalyticsMetric, string> = {
  IMPRESSION: "impressions",
  MEMBERS_REACHED: "reach",
  RESHARE: "reshares",
  REACTION: "reactions",
  COMMENT: "comments",
};

type LinkedInAnalyticsClientConfig = {
  accessToken: string;
  version: string;
  baseUrl?: string;
};

function toPostAnalyticsEntity(postUrn: string) {
  const safeUrn = toSafeString(postUrn);
  if (safeUrn.startsWith("urn:li:ugcPost:")) return `(ugc:${encodeURIComponent(safeUrn)})`;
  if (safeUrn.startsWith("urn:li:share:")) return `(share:${encodeURIComponent(safeUrn)})`;
  throw new Error("linkedin_post_analytics_urn_unsupported");
}

function readAnalyticsCount(payload: unknown) {
  const elements = Array.isArray(toUnknownRecord(payload).elements) ? (toUnknownRecord(payload).elements as unknown[]) : [];
  return elements.reduce<number>((sum, item) => {
    const count = Number(toUnknownRecord(item).count || 0);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);
}

export class LinkedInMemberAnalyticsClient {
  private accessToken: string;
  private version: string;
  private baseUrl: string;

  constructor(config: LinkedInAnalyticsClientConfig) {
    this.accessToken = toSafeString(config.accessToken);
    this.version = toSafeString(config.version);
    this.baseUrl = toSafeString(config.baseUrl || LINKEDIN_API_BASE).replace(/\/+$/, "");
  }

  private async get(pathAndQuery: string): Promise<UnknownRecord> {
    const response = await fetch(`${this.baseUrl}${pathAndQuery}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Linkedin-Version": this.version,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
      },
    });
    const body = (await response.json().catch(() => ({}))) as UnknownRecord;
    if (!response.ok) {
      throw new Error(toSafeString(body.message) || `linkedin_member_analytics_failed:${response.status}`);
    }
    return body;
  }

  async getPostMetrics(args: { postUrn: string; metrics?: LinkedInPostAnalyticsMetric[] }) {
    const entity = toPostAnalyticsEntity(args.postUrn);
    const requestedMetrics = args.metrics?.length ? args.metrics : [...LINKEDIN_CORE_POST_ANALYTICS_METRICS];
    const metrics: Record<string, number> = {};

    for (const queryType of requestedMetrics) {
      const body = await this.get(
        `/rest/memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`,
      );
      metrics[LINKEDIN_METRIC_KEY[queryType]] = readAnalyticsCount(body);
    }

    return {
      metrics,
      apiCallCount: requestedMetrics.length,
      metricTypes: requestedMetrics,
    };
  }

  async getFollowerCount() {
    const body = await this.get("/rest/memberFollowersCount?q=me");
    const elements = Array.isArray(body.elements) ? (body.elements as unknown[]) : [];
    const first = toUnknownRecord(elements[0]);
    const count = Number(first.memberFollowersCount || 0);
    return {
      followers: Number.isFinite(count) ? count : 0,
      apiCallCount: 1,
    };
  }
}
