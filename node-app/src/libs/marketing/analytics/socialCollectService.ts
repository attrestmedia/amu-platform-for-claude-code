import "server-only";

import type { MarketingChannel } from "consts/marketing/queue";
import { resolveInstagramAuthMode } from "consts/thirdparty/instagram";
import { getDecryptedLinkedInMemberToken } from "libs/database/secure/linkedinMemberTokens";
import { listMarketingPerformanceDaily, listMarketingPublishLogs, upsertMarketingPerformanceDaily } from "libs/database/marketing";
import { InstagramGraphClient } from "libs/api/thirdparty/instagram/instagramClient";
import { ThreadsApiClient } from "libs/api/thirdparty/threads/threadsClient";
import { resolveSocialMarketingCredential } from "libs/marketing/auth/marketingOAuthResolver";
import {
  LINKEDIN_CORE_POST_ANALYTICS_METRICS,
  LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE,
  LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE,
  LinkedInMemberAnalyticsClient,
} from "libs/api/thirdparty/linkedin/linkedinMemberAnalyticsClient";
import { toErrorMessage, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 소셜 채널(Threads/Instagram/LinkedIn/Naver Blog) 게시물·계정 성과 일별 스냅샷 수집/조회
 * @process publish log에서 외부 post/media id 추출 → provider insights API 호출 → 지표 정규화 → marketing_performance_daily upsert(social_post/social_account) / 조회는 entity별 최신 누적 + 인접 날짜 차분(delta) 집계
 * @domain marketing
 * @scope server
 */

export const SOCIAL_PERFORMANCE_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"] as const;
export type SocialPerformanceChannel = (typeof SOCIAL_PERFORMANCE_CHANNELS)[number];

const THREADS_INSIGHT_METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"] as const;
const THREADS_ACCOUNT_INSIGHT_METRICS = ["views", "followers_count"] as const;
// v22+에서 impressions는 deprecated(views로 대체) — metric 목록에 포함하면 insights 호출 전체가 실패할 수 있다.
const INSTAGRAM_INSIGHT_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"] as const;
const SOCIAL_REPORT_TIME_ZONE = "Asia/Seoul";

export const INSTAGRAM_SOCIAL_MEASUREMENT_CAPABILITIES = Object.freeze({
  availablePostMetrics: ["reach", "views", "likes", "comments", "shares", "saves", "engagements"],
  availableAccountMetrics: ["followers"],
  unavailablePostMetrics: ["carousel_completion_rate"],
  unavailableAccountMetrics: ["profile_visits"],
  comparison: {
    unit: "per_published_post",
    cohorts: ["carousel", "single_image"],
    dimensions: ["format", "card_count"],
  },
} as const);
// Linkedin-Version(YYYYMM)은 매월 갱신되고 구버전은 순차 sunset되는 값이라 완전 고정이 불가능하다.
// 운영 제어는 수집 설정(DB, 성과 탭 UI에서 편집)이 단일 창구이고, 미설정 시에만 아래 코드 기본값을 쓴다.
const LINKEDIN_SOCIAL_ACTIONS_FALLBACK_VERSION = "202606";
const LINKEDIN_SOCIAL_ACTIONS_READ_SCOPES = new Set(["r_member_social_feed", "r_compliance"]);
// Development Tier 회원당 100 calls/day 중 25 calls를 follower/smoke/운영 여유로 남긴다.
const LINKEDIN_POST_ANALYTICS_CALL_BUDGET = 75;
const LINKEDIN_RECENT_POSTS_PER_RUN = 10;

function resolveLinkedInVersion(version?: string) {
  const next = toSafeString(version);
  return /^\d{6}$/.test(next) ? next : LINKEDIN_SOCIAL_ACTIONS_FALLBACK_VERSION;
}

type SocialPostRef = {
  universeId: string;
  jobId: string;
  publishLogId: string;
  channel: SocialPerformanceChannel;
  platformPostId: string;
  entityId: string;
  publishedAt: string;
  permalink: string;
  meta: UnknownRecord;
};

function selectLinkedInRefsWithinBudget(refs: SocialPostRef[], maxPosts: number, now = new Date()) {
  const sorted = refs
    .filter((ref) => ref.channel === "linkedin")
    .sort((a, b) => toSafeString(b.publishedAt).localeCompare(toSafeString(a.publishedAt)));
  if (sorted.length <= maxPosts) return new Set(sorted.map((ref) => ref.entityId));

  const recentCount = Math.min(LINKEDIN_RECENT_POSTS_PER_RUN, maxPosts);
  const recent = sorted.slice(0, recentCount);
  const backlog = sorted.slice(recentCount);
  const rotatingCount = Math.max(0, maxPosts - recentCount);
  const windowCount = Math.max(1, Math.ceil(backlog.length / Math.max(1, rotatingCount)));
  const dayIndex = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  const windowIndex = dayIndex % windowCount;
  const rotating = backlog.slice(windowIndex * rotatingCount, windowIndex * rotatingCount + rotatingCount);
  return new Set([...recent, ...rotating].map((ref) => ref.entityId));
}

type CollectStatus = "collected" | "dry_run" | "skipped" | "failed";

function toDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SOCIAL_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function dateDaysAgo(days: number) {
  return toDateString(new Date(Date.now() - days * 86_400_000));
}

/** 발행 시각을 보고 기준 시간대(Asia/Seoul)의 시(hour)로 환산한다. 일부 ICU 구현이 자정을 24로 포맷하므로 되돌린다. */
function toReportHour(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: SOCIAL_REPORT_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const hour = Number(formatted);
  return Number.isInteger(hour) ? hour % 24 : null;
}

function clampDays(days?: number) {
  const next = Number(days || 30);
  return Math.max(1, Math.min(180, Number.isFinite(next) ? Math.floor(next) : 30));
}

function toChannelList(values?: string[]) {
  const allowed = new Set<string>(SOCIAL_PERFORMANCE_CHANNELS);
  const channels = Array.from(
    new Set((values || []).map((value) => toSafeString(value)).filter((value): value is SocialPerformanceChannel => allowed.has(value))),
  );
  return channels.length > 0 ? channels : [...SOCIAL_PERFORMANCE_CHANNELS];
}

function toNumber(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function firstString(...values: unknown[]) {
  return values.map(toSafeString).find(Boolean) || "";
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function metricValueFromInsightRow(row: UnknownRecord) {
  const values = Array.isArray(row.values) ? row.values : [];
  const latest = values.length ? toUnknownRecord(values[values.length - 1]) : {};
  const totalValue = toUnknownRecord(row.total_value);
  return toNumber(totalValue.value ?? latest.value ?? row.value);
}

function normalizeInsightMetrics(raw: unknown) {
  const data = Array.isArray(toUnknownRecord(raw).data) ? (toUnknownRecord(raw).data as unknown[]) : [];
  return data.reduce<Record<string, number>>((acc, item) => {
    const row = toUnknownRecord(item);
    const name = toSafeString(row.name);
    if (name) acc[name] = metricValueFromInsightRow(row);
    return acc;
  }, {});
}

function normalizeSocialMetrics(channel: SocialPerformanceChannel, metrics: Record<string, number>) {
  const impressions =
    metrics.views || metrics.impressions || metrics.reach || metrics.video_views || metrics.screenPageViews || 0;
  const likes = metrics.likes || metrics.like_count || 0;
  const reactions = metrics.reactions || likes;
  const comments = metrics.comments || metrics.comment_count || metrics.replies || 0;
  const shares = metrics.shares || metrics.reshares || metrics.reposts || metrics.share_count || 0;
  const saves = metrics.saved || metrics.saves || 0;
  const quotes = metrics.quotes || 0;
  const engagements = metrics.total_interactions || metrics.engagements || reactions + comments + shares + saves + quotes;

  return {
    ...metrics,
    impressions,
    likes,
    reactions,
    comments,
    shares,
    saves,
    quotes,
    engagements,
    engagementRate: impressions > 0 ? Number((engagements / impressions).toFixed(6)) : 0,
    metricBasis: channel === "instagram" ? "instagram_media_insights" : channel === "threads" ? "threads_media_insights" : "channel_api",
  };
}

function extractSocialPostRefs(logRaw: unknown): SocialPostRef[] {
  const log = toUnknownRecord(logRaw);
  const channel = toSafeString(log.channel) as SocialPerformanceChannel;
  if (!SOCIAL_PERFORMANCE_CHANNELS.includes(channel)) return [];

  const response = toUnknownRecord(log.response);
  const nestedRaw = toUnknownRecord(response.raw);
  // 운영자 완료 경로는 response.raw, queue worker는 response 최상위에
  // provider 응답을 저장하므로 기존 로그까지 양쪽 형식을 모두 수용한다.
  const raw = Object.keys(nestedRaw).length > 0 ? nestedRaw : response;
  const targetRef = toUnknownRecord(log.targetRef);
  const request = toUnknownRecord(log.request);
  const publishLogId = toSafeString(log.publishLogId);
  const universeId = toSafeString(log.universeId);
  const jobId = toSafeString(log.jobId);
  const publishedAt = firstString(log.publishedAt, log.completedAt, log.createdAt);
  const sourceLineage = toUnknownRecord(targetRef.sourceLineage || request.sourceLineage || log.sourceLineage);
  const attributionMeta = {
    ...(toSafeString(sourceLineage.sourceKind) ? { sourceKind: toSafeString(sourceLineage.sourceKind) } : {}),
    ...(toSafeString(sourceLineage.campaignId) ? { campaignId: toSafeString(sourceLineage.campaignId) } : {}),
    ...(toSafeString(sourceLineage.sourceFingerprint) ? { sourceFingerprint: toSafeString(sourceLineage.sourceFingerprint) } : {}),
    ...(toSafeString(sourceLineage.draftId) ? { draftId: toSafeString(sourceLineage.draftId) } : {}),
    ...(Number(sourceLineage.draftRevision || 0) > 0 ? { draftRevision: Number(sourceLineage.draftRevision) } : {}),
    ...(Number(sourceLineage.channelProductNo || 0) > 0 ? { channelProductNo: Number(sourceLineage.channelProductNo) } : {}),
  };
  const refs: SocialPostRef[] = [];

  if (channel === "threads") {
    const posts = Array.isArray(raw.posts) ? raw.posts : [];
    posts.forEach((item, index) => {
      const post = toUnknownRecord(item);
      const platformPostId = toSafeString(post.postId);
      if (!platformPostId) return;
      refs.push({
        universeId,
        jobId,
        publishLogId,
        channel,
        platformPostId,
        entityId: `${channel}:${platformPostId}`,
        publishedAt,
        permalink: firstString(raw.permalink, targetRef.externalUrl, targetRef.finalUrl),
        meta: { ...attributionMeta, threadIndex: index, creationId: toSafeString(post.creationId), source: "marketing_publish_log" },
      });
    });
    const postId = toSafeString(raw.postId);
    if (!refs.length && postId) {
      refs.push({
        universeId,
        jobId,
        publishLogId,
        channel,
        platformPostId: postId,
        entityId: `${channel}:${postId}`,
        publishedAt,
        permalink: firstString(raw.permalink, targetRef.externalUrl, targetRef.finalUrl),
        meta: { ...attributionMeta, source: "marketing_publish_log" },
      });
    }
    return refs;
  }

  if (channel === "instagram") {
    const mediaId = firstString(raw.mediaId, raw.id);
    if (!mediaId) return [];
    const requestImageUrls = Array.isArray(request.imageUrls) ? request.imageUrls : [];
    const targetImageUrls = Array.isArray(targetRef.imageUrls) ? targetRef.imageUrls : [];
    const cardCount = Math.max(
      requestImageUrls.length,
      targetImageUrls.length,
      toSafeString(request.imageUrl) ? 1 : 0,
      toSafeString(targetRef.imageUrl) ? 1 : 0,
    );
    const mediaType = toSafeString(request.mediaType || targetRef.mediaType).toUpperCase();
    const format = mediaType === "CAROUSEL" || cardCount > 1 ? "carousel" : "single_image";
    return [
      {
        universeId,
        jobId,
        publishLogId,
        channel,
        platformPostId: mediaId,
        entityId: `${channel}:${mediaId}`,
        publishedAt,
        permalink: firstString(targetRef.externalUrl, targetRef.finalUrl),
        meta: {
          ...attributionMeta,
          source: "marketing_publish_log",
          creationId: toSafeString(raw.creationId),
          format,
          mediaType: mediaType || (format === "carousel" ? "CAROUSEL" : "IMAGE"),
          cardCount: cardCount || 1,
        },
      },
    ];
  }

  if (channel === "linkedin") {
    // publish 경로는 항상 x-restli-id 헤더의 URN(urn:li:share:...)을 저장한다.
    const postId = firstString(raw.postId, raw.id);
    if (!postId) return [];
    return [
      {
        universeId,
        jobId,
        publishLogId,
        channel,
        platformPostId: postId,
        entityId: `${channel}:${postId}`,
        publishedAt,
        permalink: firstString(raw.postUrl, targetRef.externalUrl, targetRef.finalUrl),
        meta: { ...attributionMeta, source: "marketing_publish_log" },
      },
    ];
  }

  const publishedUrl = firstString(response.publishedUrl, raw.publishedUrl);
  const url = firstString(publishedUrl, targetRef.externalUrl, targetRef.finalUrl);
  if (!url) return [];
  const platformPostId = hashText(firstString(raw.postId, response.receiptAssetId, publishLogId, publishedUrl, url));
  return [
    {
      universeId,
      jobId,
      publishLogId,
      channel,
      platformPostId,
      entityId: `${channel}:${platformPostId}`,
      publishedAt,
      permalink: url,
      meta: { ...attributionMeta, source: "manual_publish_url", note: "Naver Blog internal analytics API is not connected." },
    },
  ];
}

async function fetchLinkedInSocialActionMetrics(accessToken: string, postId: string, version?: string) {
  const response = await fetch(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Linkedin-Version": resolveLinkedInVersion(version),
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const body = (await response.json().catch(() => ({}))) as UnknownRecord;
  if (!response.ok) {
    throw new Error(toSafeString(body.message) || `linkedin_social_actions_failed:${response.status}`);
  }

  const likesSummary = toUnknownRecord(body.likesSummary);
  const commentsSummary = toUnknownRecord(body.commentsSummary);
  return {
    likes: toNumber(likesSummary.totalLikes),
    comments: toNumber(commentsSummary.aggregatedTotalComments ?? commentsSummary.totalFirstLevelComments),
  };
}

type CollectRunContext = {
  credentials: Map<string, Awaited<ReturnType<typeof resolveSocialMarketingCredential>>>;
  linkedinTokens: Map<string, Awaited<ReturnType<typeof getDecryptedLinkedInMemberToken>>>;
  abortedChannels: Set<SocialPerformanceChannel>;
  linkedinVersion?: string;
  linkedinMemberAnalyticsEnabled: boolean;
};

function createCollectRunContext(linkedinVersion?: string, linkedinMemberAnalyticsEnabled = false): CollectRunContext {
  return {
    credentials: new Map(),
    linkedinTokens: new Map(),
    abortedChannels: new Set(),
    linkedinVersion,
    linkedinMemberAnalyticsEnabled,
  };
}

function isRateLimitError(message: string) {
  return /rate.?limit|too many (calls|requests)|\b429\b|\(#4\)|\(#17\)|\(#32\)/i.test(message);
}

async function getCachedCredential(ctx: CollectRunContext, universeId: string, provider: "threads" | "instagram") {
  const key = `${universeId}:${provider}`;
  if (!ctx.credentials.has(key)) ctx.credentials.set(key, await resolveSocialMarketingCredential(universeId, provider));
  return ctx.credentials.get(key) || null;
}

async function getCachedLinkedInToken(ctx: CollectRunContext, universeId: string) {
  if (!ctx.linkedinTokens.has(universeId)) ctx.linkedinTokens.set(universeId, await getDecryptedLinkedInMemberToken(universeId));
  return ctx.linkedinTokens.get(universeId) || null;
}

async function collectRefMetrics(ref: SocialPostRef, ctx: CollectRunContext) {
  if (ref.channel === "threads") {
    const credential = await getCachedCredential(ctx, ref.universeId, "threads");
    const accessToken = toSafeString(credential?.clientSecret);
    if (!accessToken) return { ok: false as const, status: "skipped" as CollectStatus, reason: "threads_credential_missing" };
    const client = new ThreadsApiClient({
      baseUrl: typeof credential?.extras?.graphBaseUrl === "string" ? credential.extras.graphBaseUrl : undefined,
    });
    const raw = await client.getMediaInsights({
      accessToken,
      postId: ref.platformPostId,
      metrics: [...THREADS_INSIGHT_METRICS],
    });
    return { ok: true as const, status: "collected" as CollectStatus, metrics: normalizeSocialMetrics(ref.channel, normalizeInsightMetrics(raw)), raw };
  }

  if (ref.channel === "instagram") {
    const credential = await getCachedCredential(ctx, ref.universeId, "instagram");
    const accessToken = toSafeString(credential?.clientSecret);
    if (!accessToken) return { ok: false as const, status: "skipped" as CollectStatus, reason: "instagram_credential_missing" };
    const client = new InstagramGraphClient({
      authMode: resolveInstagramAuthMode(credential?.extras?.authMode, credential?.extras?.graphBaseUrl),
    });
    const raw = await client.getMediaInsights({
      accessToken,
      mediaId: ref.platformPostId,
      metrics: [...INSTAGRAM_INSIGHT_METRICS],
    });
    return { ok: true as const, status: "collected" as CollectStatus, metrics: normalizeSocialMetrics(ref.channel, normalizeInsightMetrics(raw)), raw };
  }

  if (ref.channel === "linkedin") {
    const token = await getCachedLinkedInToken(ctx, ref.universeId);
    if (!token?.accessToken) return { ok: false as const, status: "skipped" as CollectStatus, reason: "linkedin_token_missing" };
    if (token.expired) return { ok: false as const, status: "skipped" as CollectStatus, reason: "linkedin_token_expired" };
    const scopes = new Set((token.scope || []).map(toSafeString).filter(Boolean));
    if (ctx.linkedinMemberAnalyticsEnabled && scopes.has(LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE)) {
      const client = new LinkedInMemberAnalyticsClient({
        accessToken: token.accessToken,
        version: resolveLinkedInVersion(ctx.linkedinVersion),
      });
      const raw = await client.getPostMetrics({ postUrn: ref.platformPostId });
      const normalized = normalizeSocialMetrics(ref.channel, raw.metrics);
      return {
        ok: true as const,
        status: "collected" as CollectStatus,
        metrics: { ...normalized, metricBasis: "linkedin_member_post_analytics" },
        raw,
      };
    }

    if (!ctx.linkedinMemberAnalyticsEnabled) {
      return { ok: false as const, status: "skipped" as CollectStatus, reason: "linkedin_member_analytics_disabled" };
    }
    const hasLegacyReadScope = Array.from(scopes).some((scope) => LINKEDIN_SOCIAL_ACTIONS_READ_SCOPES.has(scope));
    if (!hasLegacyReadScope) {
      return { ok: false as const, status: "skipped" as CollectStatus, reason: "linkedin_member_post_analytics_scope_missing" };
    }
    const raw = await fetchLinkedInSocialActionMetrics(token.accessToken, ref.platformPostId, ctx.linkedinVersion);
    const normalized = normalizeSocialMetrics(ref.channel, raw);
    return {
      ok: true as const,
      status: "collected" as CollectStatus,
      metrics: { ...normalized, metricBasis: "linkedin_social_actions_legacy" },
      raw,
    };
  }

  return {
    ok: true as const,
    status: "collected" as CollectStatus,
    metrics: normalizeSocialMetrics(ref.channel, { published: 1 }),
    raw: { note: "manual_published_url_verified" },
  };
}

export async function collectSocialPerformanceSnapshots(args: {
  universeId: string;
  channels?: string[];
  sinceDays?: number;
  dryRun?: boolean;
  linkedinVersion?: string;
  linkedinMemberAnalyticsEnabled?: boolean;
}) {
  const days = clampDays(args.sinceDays);
  const channels = toChannelList(args.channels);
  const dateFrom = dateDaysAgo(days);
  // 채널별 분할 조회 — 합산 조회는 저장소의 200건 클램프에 걸려 다채널 백필 시 오래된 발행물이 무음 누락된다.
  const logsByChannel = await Promise.all(
    channels.map((channel) =>
      listMarketingPublishLogs({
        universeId: args.universeId,
        channel: [channel] as MarketingChannel[],
        status: "published",
        dateFrom,
        limit: 200,
      }),
    ),
  );
  const logs = logsByChannel.flat();
  const truncatedChannels = channels.filter((_, index) => (logsByChannel[index]?.length || 0) >= 200);
  const refs = logs.flatMap(extractSocialPostRefs);
  const today = toDateString(new Date());
  const dryRun = args.dryRun === true;
  const ctx = createCollectRunContext(args.linkedinVersion, args.linkedinMemberAnalyticsEnabled === true);
  const linkedinToken = channels.includes("linkedin") ? await getCachedLinkedInToken(ctx, args.universeId) : null;
  const linkedinScopes = new Set((linkedinToken?.scope || []).map(toSafeString));
  const hasLinkedInPostAnalyticsScope =
    args.linkedinMemberAnalyticsEnabled === true && linkedinScopes.has(LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE);
  const hasLinkedInLegacyReadScope =
    args.linkedinMemberAnalyticsEnabled === true &&
    Array.from(linkedinScopes).some((scope) => LINKEDIN_SOCIAL_ACTIONS_READ_SCOPES.has(scope));
  const selectedLinkedInEntityIds = hasLinkedInPostAnalyticsScope
    ? selectLinkedInRefsWithinBudget(
        refs,
        Math.floor(LINKEDIN_POST_ANALYTICS_CALL_BUDGET / LINKEDIN_CORE_POST_ANALYTICS_METRICS.length),
      )
    : hasLinkedInLegacyReadScope
      ? selectLinkedInRefsWithinBudget(refs, LINKEDIN_POST_ANALYTICS_CALL_BUDGET)
      : new Set(refs.filter((ref) => ref.channel === "linkedin").map((ref) => ref.entityId));
  const results: Array<{
    channel: string;
    entityId: string;
    publishLogId: string;
    status: CollectStatus;
    reason?: string;
    error?: string;
    metrics?: Record<string, unknown>;
  }> = [];
  const processedLinkedInEntityIds = new Set<string>();

  for (const ref of refs) {
    if (ref.channel === "linkedin" && !selectedLinkedInEntityIds.has(ref.entityId)) {
      results.push({
        channel: ref.channel,
        entityId: ref.entityId,
        publishLogId: ref.publishLogId,
        status: "skipped",
        reason: "linkedin_daily_budget_deferred",
      });
      continue;
    }
    if (ref.channel === "linkedin") {
      if (processedLinkedInEntityIds.has(ref.entityId)) {
        results.push({
          channel: ref.channel,
          entityId: ref.entityId,
          publishLogId: ref.publishLogId,
          status: "skipped",
          reason: "duplicate_publish_ref",
        });
        continue;
      }
      processedLinkedInEntityIds.add(ref.entityId);
    }
    if (ctx.abortedChannels.has(ref.channel)) {
      results.push({
        channel: ref.channel,
        entityId: ref.entityId,
        publishLogId: ref.publishLogId,
        status: "skipped",
        reason: "provider_rate_limited_abort",
      });
      continue;
    }
    try {
      const collected = await collectRefMetrics(ref, ctx);
      if (!collected.ok) {
        results.push({
          channel: ref.channel,
          entityId: ref.entityId,
          publishLogId: ref.publishLogId,
          status: collected.status,
          reason: collected.reason,
        });
        continue;
      }

      if (!dryRun) {
        await upsertMarketingPerformanceDaily({
          universeId: args.universeId,
          channel: ref.channel,
          date: today,
          entityType: "social_post",
          entityId: ref.entityId,
          metrics: collected.metrics,
          meta: {
            source: collected.metrics.metricBasis,
            jobId: ref.jobId,
            publishLogId: ref.publishLogId,
            platformPostId: ref.platformPostId,
            permalink: ref.permalink,
            publishedAt: ref.publishedAt,
            collectedAt: new Date().toISOString(),
            ...ref.meta,
          },
        });
      }

      results.push({
        channel: ref.channel,
        entityId: ref.entityId,
        publishLogId: ref.publishLogId,
        status: dryRun ? "dry_run" : "collected",
        metrics: collected.metrics,
      });
    } catch (error) {
      const message = toErrorMessage(error, String(error));
      // provider rate limit이면 같은 채널의 남은 호출을 즉시 중단해 quota 소진/차단 악화를 막는다.
      if (isRateLimitError(message)) ctx.abortedChannels.add(ref.channel);
      logger.warn("[socialCollect] collect failed", {
        universeId: args.universeId,
        channel: ref.channel,
        entityId: ref.entityId,
        error: message,
      });
      results.push({
        channel: ref.channel,
        entityId: ref.entityId,
        publishLogId: ref.publishLogId,
        status: "failed",
        error: message,
      });
    }
  }

  return {
    // skipped(자격증명/토큰 없음, rate-limit 중단)는 예상된 상태이므로 실패로 취급하지 않는다.
    ok: results.every((item) => item.status !== "failed"),
    dryRun,
    days,
    dateFrom,
    date: today,
    channels,
    truncatedChannels,
    publishLogCount: logs.length,
    targetCount: refs.length,
    collectedCount: results.filter((item) => item.status === "collected" || item.status === "dry_run").length,
    skippedCount: results.filter((item) => item.status === "skipped").length,
    linkedinBudgetDeferredCount: results.filter((item) => item.reason === "linkedin_daily_budget_deferred").length,
    linkedinApiCallBudget: LINKEDIN_POST_ANALYTICS_CALL_BUDGET,
    failedCount: results.filter((item) => item.status === "failed").length,
    results,
  };
}

const SOCIAL_SUMMARY_METRIC_KEYS = [
  "impressions",
  "views",
  "reach",
  "likes",
  "reactions",
  "comments",
  "shares",
  "saves",
  "quotes",
  "engagements",
  "published",
  "followers",
] as const;

function addMetrics(acc: Record<string, number>, metrics: UnknownRecord) {
  SOCIAL_SUMMARY_METRIC_KEYS.forEach((key) => {
    acc[key] = (acc[key] || 0) + toNumber(metrics[key]);
  });
}

function diffMetrics(current: UnknownRecord, previous: UnknownRecord | undefined) {
  if (!previous) return undefined;
  return SOCIAL_SUMMARY_METRIC_KEYS.reduce<Record<string, number>>((acc, key) => {
    // 누적 스냅샷 차분 — 최초 스냅샷은 기준선이므로 일별 증가량에서 제외한다.
    const delta = toNumber(current[key]) - toNumber(previous[key]);
    acc[key] = Math.max(0, delta);
    return acc;
  }, {});
}

export async function getSocialPerformance(args: {
  universeId: string;
  channels?: string[];
  days?: number;
  entityId?: string;
  campaignId?: string;
  sourceFingerprint?: string;
  draftId?: string;
}) {
  const days = clampDays(args.days);
  const channels = toChannelList(args.channels);
  const dateFrom = dateDaysAgo(days);
  const [fetchedItems, accountItems] = await Promise.all([
    listMarketingPerformanceDaily({
      universeId: args.universeId,
      channel: channels as MarketingChannel[],
      entityType: "social_post",
      entityId: args.entityId,
      dateFrom,
      limit: 5000,
    }),
    listMarketingPerformanceDaily({
      universeId: args.universeId,
      channel: channels as MarketingChannel[],
      entityType: "social_account",
      dateFrom,
      limit: 5000,
    }),
  ]);
  const requestedCampaignId = toSafeString(args.campaignId);
  const requestedSourceFingerprint = toSafeString(args.sourceFingerprint);
  const requestedDraftId = toSafeString(args.draftId);
  const hasAttributionFilter = Boolean(requestedCampaignId || requestedSourceFingerprint || requestedDraftId);
  const items = fetchedItems.filter((itemRaw) => {
    if (!hasAttributionFilter) return true;
    const meta = toUnknownRecord(toUnknownRecord(itemRaw).meta);
    return (
      (!requestedCampaignId || toSafeString(meta.campaignId) === requestedCampaignId) &&
      (!requestedSourceFingerprint || toSafeString(meta.sourceFingerprint) === requestedSourceFingerprint) &&
      (!requestedDraftId || toSafeString(meta.draftId) === requestedDraftId)
    );
  });
  const attributionMatchedRows = items.filter((itemRaw) => {
    const meta = toUnknownRecord(toUnknownRecord(itemRaw).meta);
    return Boolean(toSafeString(meta.campaignId) && toSafeString(meta.sourceFingerprint) && toSafeString(meta.draftId));
  }).length;

  const summaryByChannel = new Map<string, Record<string, number>>();
  const metricBasisByChannel = new Map<string, Set<string>>();
  const summaryByFormat = new Map<string, { channel: string; format: string; postCount: number; metrics: Record<string, number> }>();
  const dailyByKey = new Map<string, { date: string; channel: string; metrics: Record<string, number> }>();
  const latestByEntity = new Map<string, UnknownRecord>();
  const latestAccountByChannel = new Map<string, UnknownRecord>();
  const rowsByEntity = new Map<string, UnknownRecord[]>();

  items.forEach((itemRaw) => {
    const item = toUnknownRecord(itemRaw);
    const entityId = toSafeString(item.entityId);
    const prev = latestByEntity.get(entityId);
    if (!prev || toSafeString(prev.date) < toSafeString(item.date)) latestByEntity.set(entityId, item);
    const rows = rowsByEntity.get(entityId) || [];
    rows.push(item);
    rowsByEntity.set(entityId, rows);
  });

  (hasAttributionFilter ? [] : accountItems).forEach((itemRaw) => {
    const item = toUnknownRecord(itemRaw);
    const channel = toSafeString(item.channel);
    const previous = latestAccountByChannel.get(channel);
    if (!previous || toSafeString(previous.date) < toSafeString(item.date)) {
      latestAccountByChannel.set(channel, item);
    }
  });

  // 요약: entity별 "최신 누적 스냅샷"의 합 — 날짜별 누적치를 재합산하면 수집일수 배수로 과대 계상된다.
  latestByEntity.forEach((item) => {
    const channel = toSafeString(item.channel);
    const summary = summaryByChannel.get(channel) || {};
    const itemMetrics = toUnknownRecord(item.metrics);
    addMetrics(summary, itemMetrics);
    summaryByChannel.set(channel, summary);
    const format = toSafeString(toUnknownRecord(item.meta).format);
    if (format) {
      const formatKey = `${channel}:${format}`;
      const formatSummary = summaryByFormat.get(formatKey) || { channel, format, postCount: 0, metrics: {} };
      formatSummary.postCount += 1;
      addMetrics(formatSummary.metrics, itemMetrics);
      summaryByFormat.set(formatKey, formatSummary);
    }
    const metricBasis = toSafeString(itemMetrics.metricBasis);
    if (metricBasis) {
      const bases = metricBasisByChannel.get(channel) || new Set<string>();
      bases.add(metricBasis);
      metricBasisByChannel.set(channel, bases);
    }
  });

  // 일별 추이: entity별 날짜 오름차순 인접 차분(delta)의 채널 합 — 스냅샷 누적값에서 일별 증가량을 복원한다.
  rowsByEntity.forEach((rows) => {
    const sorted = rows.slice().sort((a, b) => toSafeString(a.date).localeCompare(toSafeString(b.date)));
    sorted.forEach((item, index) => {
      const channel = toSafeString(item.channel);
      const date = toSafeString(item.date);
      const deltas = diffMetrics(toUnknownRecord(item.metrics), index > 0 ? toUnknownRecord(sorted[index - 1].metrics) : undefined);
      if (!deltas) return;
      const dailyKey = `${date}:${channel}`;
      const daily = dailyByKey.get(dailyKey) || { date, channel, metrics: {} };
      addMetrics(daily.metrics, deltas);
      dailyByKey.set(dailyKey, daily);
    });
  });

  // 시간대별 롤업: entity별 "최신 누적 스냅샷"을 발행 시각(KST hour)으로 묶는다.
  // topPosts는 상위 20건만 노출해 분모(그 시간에 몇 건 올렸는지)가 없으므로 시간대 우열 판정에 쓸 수 없다.
  // postCount를 함께 제공해야 시간대별 평균 비교가 성립한다.
  const hourlyByKey = new Map<string, { channel: string; hour: number; postCount: number; metrics: Record<string, number> }>();
  latestByEntity.forEach((item) => {
    const hour = toReportHour(toUnknownRecord(item.meta).publishedAt);
    if (hour === null) return;
    const channel = toSafeString(item.channel);
    const hourlyKey = `${channel}:${hour}`;
    const bucket = hourlyByKey.get(hourlyKey) || { channel, hour, postCount: 0, metrics: {} };
    bucket.postCount += 1;
    addMetrics(bucket.metrics, toUnknownRecord(item.metrics));
    hourlyByKey.set(hourlyKey, bucket);
  });
  const hourlyByChannel = Array.from(hourlyByKey.values())
    .map((bucket) => ({
      channel: bucket.channel,
      hour: bucket.hour,
      postCount: bucket.postCount,
      impressions: bucket.metrics.impressions || 0,
      engagements: bucket.metrics.engagements || 0,
      avgImpressions: Number((((bucket.metrics.impressions || 0) / bucket.postCount) || 0).toFixed(2)),
      avgEngagements: Number((((bucket.metrics.engagements || 0) / bucket.postCount) || 0).toFixed(2)),
      engagementRate: bucket.metrics.impressions > 0
        ? Number(((bucket.metrics.engagements || 0) / bucket.metrics.impressions).toFixed(6))
        : 0,
    }))
    .sort((left, right) => left.channel.localeCompare(right.channel) || left.hour - right.hour);
  const hourlyCoverage = Array.from(hourlyByKey.values()).reduce((count, bucket) => count + bucket.postCount, 0);

  const topPosts = Array.from(latestByEntity.values())
    .sort((a, b) => toNumber(toUnknownRecord(b.metrics).engagements) - toNumber(toUnknownRecord(a.metrics).engagements))
    .slice(0, 20)
    .map((item) => ({
      entityId: toSafeString(item.entityId),
      channel: toSafeString(item.channel),
      date: toSafeString(item.date),
      metrics: toUnknownRecord(item.metrics),
      meta: toUnknownRecord(item.meta),
      updatedAt: toSafeString(item.updatedAt),
    }));

  return {
    days,
    dateFrom,
    channels,
    attribution: {
      level: hasAttributionFilter ? "commerce_product_campaign" : "universe_social",
      campaignId: requestedCampaignId || undefined,
      sourceFingerprint: requestedSourceFingerprint || undefined,
      draftId: requestedDraftId || undefined,
      metricBasis: "latest_cumulative_provider_snapshot",
      fetchedPostRows: fetchedItems.length,
      matchedPostRows: items.length,
      missingAttributionRows: hasAttributionFilter ? Math.max(0, items.length - attributionMatchedRows) : fetchedItems.filter((itemRaw) => {
        const meta = toUnknownRecord(toUnknownRecord(itemRaw).meta);
        return !toSafeString(meta.campaignId) || !toSafeString(meta.sourceFingerprint) || !toSafeString(meta.draftId);
      }).length,
    },
    itemCount: items.length,
    accountItemCount: accountItems.length,
    summaryByChannel: Array.from(summaryByChannel.entries()).map(([channel, metrics]) => ({
      channel,
      metricBasis: Array.from(metricBasisByChannel.get(channel) || []),
      metrics: {
        ...metrics,
        engagementRate: metrics.impressions > 0 ? Number(((metrics.engagements || 0) / metrics.impressions).toFixed(6)) : 0,
      },
    })),
    accountSummaryByChannel: Array.from(latestAccountByChannel.entries()).map(([channel, item]) => ({
      channel,
      date: toSafeString(item.date),
      metrics: toUnknownRecord(item.metrics),
      meta: toUnknownRecord(item.meta),
    })),
    summaryByFormat: Array.from(summaryByFormat.values()).map((item) => ({
      channel: item.channel,
      format: item.format,
      postCount: item.postCount,
      metrics: {
        ...item.metrics,
        engagementRate: item.metrics.impressions > 0
          ? Number(((item.metrics.engagements || 0) / item.metrics.impressions).toFixed(6))
          : 0,
      },
      perPost: {
        impressions: Number(((item.metrics.impressions || 0) / item.postCount).toFixed(2)),
        reach: Number(((item.metrics.reach || 0) / item.postCount).toFixed(2)),
        saves: Number(((item.metrics.saves || 0) / item.postCount).toFixed(2)),
        shares: Number(((item.metrics.shares || 0) / item.postCount).toFixed(2)),
        engagements: Number(((item.metrics.engagements || 0) / item.postCount).toFixed(2)),
      },
    })),
    dailySeries: Array.from(dailyByKey.values())
      .map((item) => ({ date: item.date, channel: item.channel, ...item.metrics }))
      .sort((a, b) => `${a.date}:${a.channel}`.localeCompare(`${b.date}:${b.channel}`)),
    hourlyByChannel,
    // 발행 시각 메타가 없는 스냅샷은 시간대 롤업에서 빠진다. 표본 대표성 판단에 쓴다.
    hourlyCoverage: { timeZone: SOCIAL_REPORT_TIME_ZONE, countedPosts: hourlyCoverage, totalPosts: latestByEntity.size },
    topPosts,
    measurementCapabilities: {
      instagram: INSTAGRAM_SOCIAL_MEASUREMENT_CAPABILITIES,
    },
  };
}

export async function collectSocialAccountSnapshots(args: {
  universeId: string;
  channels?: string[];
  dryRun?: boolean;
  linkedinVersion?: string;
  linkedinMemberAnalyticsEnabled?: boolean;
}) {
  const channels = toChannelList(args.channels).filter(
    (channel) => channel === "threads" || channel === "instagram" || channel === "linkedin",
  );
  const today = toDateString(new Date());
  const dryRun = args.dryRun === true;
  const ctx = createCollectRunContext();
  const results: Array<{ channel: string; entityId: string; status: CollectStatus; reason?: string; error?: string; metrics?: Record<string, unknown> }> = [];

  for (const channel of channels) {
    try {
      const credential = channel === "linkedin" ? null : await getCachedCredential(ctx, args.universeId, channel);
      const linkedinToken = channel === "linkedin" ? await getCachedLinkedInToken(ctx, args.universeId) : null;
      const accessToken = channel === "linkedin" ? toSafeString(linkedinToken?.accessToken) : toSafeString(credential?.clientSecret);
      const accountId = channel === "linkedin" ? toSafeString(linkedinToken?.memberId) : toSafeString(credential?.clientId);
      if (!accessToken || !accountId) {
        results.push({ channel, entityId: "", status: "skipped", reason: `${channel}_credential_missing` });
        continue;
      }
      if (channel === "linkedin") {
        if (!args.linkedinMemberAnalyticsEnabled) {
          results.push({ channel, entityId: "", status: "skipped", reason: "linkedin_member_analytics_disabled" });
          continue;
        }
        if (linkedinToken?.expired) {
          results.push({ channel, entityId: "", status: "skipped", reason: "linkedin_token_expired" });
          continue;
        }
        const scopes = new Set((linkedinToken?.scope || []).map(toSafeString));
        if (!scopes.has(LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE)) {
          results.push({ channel, entityId: "", status: "skipped", reason: "linkedin_member_profile_analytics_scope_missing" });
          continue;
        }
      }

      const entityId = `${channel}:account:${accountId}`;
      let metrics: Record<string, number> = {};
      let raw: unknown = {};

      if (channel === "threads") {
        const client = new ThreadsApiClient({
          baseUrl: typeof credential?.extras?.graphBaseUrl === "string" ? credential.extras.graphBaseUrl : undefined,
        });
        raw = await client.getUserInsights({ accessToken, threadsUserId: accountId, metrics: [...THREADS_ACCOUNT_INSIGHT_METRICS] });
        const normalized = normalizeInsightMetrics(raw);
        metrics = { views: toNumber(normalized.views), followers: toNumber(normalized.followers_count) };
      } else if (channel === "instagram") {
        const client = new InstagramGraphClient({
          authMode: resolveInstagramAuthMode(credential?.extras?.authMode, credential?.extras?.graphBaseUrl),
        });
        raw = await client.getAccountFields({ accessToken, instagramUserId: accountId, fields: ["followers_count", "media_count"] });
        const record = toUnknownRecord(raw);
        metrics = { followers: toNumber(record.followers_count), mediaCount: toNumber(record.media_count) };
      } else {
        const client = new LinkedInMemberAnalyticsClient({
          accessToken,
          version: resolveLinkedInVersion(args.linkedinVersion),
        });
        raw = await client.getFollowerCount();
        metrics = { followers: toNumber(toUnknownRecord(raw).followers) };
      }

      if (!dryRun) {
        await upsertMarketingPerformanceDaily({
          universeId: args.universeId,
          channel,
          date: today,
          entityType: "social_account",
          entityId,
          metrics,
          meta: {
            source: channel === "linkedin" ? "linkedin_member_profile_analytics" : `${channel}_account_snapshot`,
            accountId,
            collectedAt: new Date().toISOString(),
          },
        });
      }

      results.push({ channel, entityId, status: dryRun ? "dry_run" : "collected", metrics });
    } catch (error) {
      const message = toErrorMessage(error, String(error));
      logger.warn("[socialCollect] account collect failed", { universeId: args.universeId, channel, error: message });
      results.push({ channel, entityId: `${channel}:account`, status: "failed", error: message });
    }
  }

  return {
    ok: results.every((item) => item.status !== "failed"),
    dryRun,
    date: today,
    channels,
    collectedCount: results.filter((item) => item.status === "collected" || item.status === "dry_run").length,
    skippedCount: results.filter((item) => item.status === "skipped").length,
    failedCount: results.filter((item) => item.status === "failed").length,
    results,
  };
}
