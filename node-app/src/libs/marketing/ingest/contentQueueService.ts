import "server-only";

import crypto from "crypto";
import { MARKETING_DRY_RUN } from "consts/marketing/server";
import { MARKETING_DEFAULT_CONTENT_CHANNELS, MARKETING_QUEUE_ENQUEUE_BATCH_MAX } from "consts/marketing/queue";
import { getRedisClient } from "libs/cache/redisClient";
import {
  createMarketingJob,
  createMarketingJobStep,
  findActiveMarketingJobByDedupeKey,
  getMarketingJobByJobId,
  getMarketingJobStepByStepId,
  updateMarketingJob,
  updateMarketingJobStepStatus,
  getMarketingQueueCategoryConfig,
} from "libs/database/marketing";
import wpCacheService from "libs/services/wpCacheService";
import { decodeHtmlEntities } from "utils/common";
import { scrapeReadableContent } from "libs/server-utils/thirdparty/scraper";
import { getAppMagazineContentBySlug } from "libs/server-utils/magazine/appContentRepo";
import {
  APP_MAGAZINE_CANONICAL_ORIGIN,
  appMagazineContentId,
  appMagazineContentPath,
} from "libs/server-utils/magazine/appContentContract";
import { getMarketingJobPayloadKey, getMarketingUniverseQueueKey } from "libs/marketing/queue/keys";
import { sendMarketingSlackNotification } from "libs/marketing/notify/slackNotifier";
import { normalizeMarketingGenerationConfig } from "libs/marketing/generationConfig";
import { withMarketingSourceEvidence } from "libs/marketing/source/sourceEvidence";
import {
  normalizeMarketingQueueCategory,
  normalizeMarketingQueueChannels,
  normalizeMarketingQueuePriority,
} from "libs/marketing/queue/categoryConfig";
import type { MarketingChannel } from "consts/marketing/queue";
import type { MarketingSourceSnapshot } from "libs/marketing/bridge/types";
import {
  buildCommerceProductSourceDedupeKey,
  buildCommerceProductSourceSnapshot,
  COMMERCE_PRODUCT_SOURCE_KIND,
} from "libs/marketing/source/commerceProductSourceContract";
import { normalizeMarketingContentTargets } from "./normalizeTarget";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toDateOrNull(value?: string | Date | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

/**
 * AIR-404 — dedupeKey는 namespace가 붙은 식별자를 받는다.
 * WP 기사(`wp:<slug>`)와 App 콘텐츠(`app:<contentId>`)는 slug 문자열이 같아도(승격 관계에서 흔하다)
 * 서로 다른 콘텐츠이므로, active job 중복 판정이 한쪽을 다른 쪽으로 착각하지 않게 한다.
 */
function toDedupeKey(universeId: string, namespacedIdentifier: string, queueCategory?: string, templateKey?: string) {
  return [
    "content",
    toSafeString(universeId),
    normalizeMarketingQueueCategory(queueCategory),
    toSafeString(namespacedIdentifier).toLowerCase(),
    toSafeString(templateKey) || "default",
  ].join(":");
}

function toWpDedupeKey(universeId: string, slug: string, queueCategory?: string, templateKey?: string) {
  return toDedupeKey(universeId, `wp:${slug}`, queueCategory, templateKey);
}

function toAppContentDedupeKey(universeId: string, contentId: string, queueCategory?: string, templateKey?: string) {
  return toDedupeKey(universeId, `app:${contentId}`, queueCategory, templateKey);
}

function toSourceSnapshotDedupeKey(universeId: string, url: string, queueCategory?: string, templateKey?: string) {
  const hash = crypto.createHash("sha256").update(toSafeString(url).toLowerCase()).digest("hex").slice(0, 24);
  return [
    "source_snapshot",
    toSafeString(universeId),
    normalizeMarketingQueueCategory(queueCategory),
    hash,
    toSafeString(templateKey) || "default",
  ].join(":");
}

function toRequestedBy(value?: string) {
  return toSafeString(value);
}

function limitTargets<T>(values: T[]) {
  return values.slice(0, MARKETING_QUEUE_ENQUEUE_BATCH_MAX);
}

function normalizeSnapshotSlug(snapshot: Partial<MarketingSourceSnapshot>, index: number) {
  const raw =
    toSafeString(snapshot.slug) ||
    toSafeString(snapshot.url)
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  return raw || `source-${index + 1}`;
}

function normalizeSourceSnapshot(snapshot: Partial<MarketingSourceSnapshot>, index: number): MarketingSourceSnapshot | null {
  if (toSafeString(snapshot.sourceKind) === COMMERCE_PRODUCT_SOURCE_KIND) {
    try {
      return buildCommerceProductSourceSnapshot(snapshot as Record<string, unknown>) as MarketingSourceSnapshot;
    } catch {
      return null;
    }
  }

  const url = toSafeString(snapshot.url);
  if (!/^https?:\/\//i.test(url)) return null;

  return withMarketingSourceEvidence(
    {
      sourceKind: toSafeString(snapshot.sourceKind),
      sourceId: toSafeString(snapshot.sourceId),
      slug: normalizeSnapshotSlug(snapshot, index),
      url,
      canonicalUrl: toSafeString(snapshot.canonicalUrl || url),
      title: toSafeString(snapshot.title) || url,
      imageUrl: toSafeString(snapshot.imageUrl),
      imageAlt: toSafeString(snapshot.imageAlt),
      imageSource: toSafeString(snapshot.imageSource),
      genStudioImageAssetId: toSafeString(snapshot.genStudioImageAssetId),
      imageUrls: Array.from(
        new Set((Array.isArray(snapshot.imageUrls) ? snapshot.imageUrls : []).map((value) => toSafeString(value)).filter(Boolean)),
      ).slice(0, 8),
      excerptText: toSafeString(snapshot.excerptText),
      contentText: toSafeString(snapshot.contentText),
      categories: Array.from(
        new Set((Array.isArray(snapshot.categories) ? snapshot.categories : []).map((value) => toSafeString(value)).filter(Boolean)),
      ).slice(0, 20),
      tags: Array.from(
        new Set((Array.isArray(snapshot.tags) ? snapshot.tags : []).map((value) => toSafeString(value)).filter(Boolean)),
      ).slice(0, 20),
      modified: toSafeString(snapshot.modified),
      outline: Array.isArray(snapshot.outline) ? snapshot.outline : undefined,
      sourceQuotes: Array.isArray(snapshot.sourceQuotes) ? snapshot.sourceQuotes : undefined,
      keyTerms: Array.isArray(snapshot.keyTerms) ? snapshot.keyTerms : undefined,
      allowedClaims: Array.isArray(snapshot.allowedClaims) ? snapshot.allowedClaims : undefined,
    },
    {
      title: snapshot.title || url,
      contentText: snapshot.contentText,
      excerptText: snapshot.excerptText,
      categories: snapshot.categories,
      tags: snapshot.tags,
    },
  ) as MarketingSourceSnapshot;
}

function inferWebSourceKind(rawUrl: string) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === "blog.naver.com" || host === "m.blog.naver.com") return "naver_blog";
  } catch {
    return "web_page";
  }
  return "web_page";
}

const APP_CONTENT_SOURCE_KIND = "app_content" as const;

function getWpContentTargetFromSnapshot(snapshot: MarketingSourceSnapshot) {
  const target = normalizeMarketingContentTargets({ url: snapshot.url }).targets[0];
  return target?.sourceKind === "wp_post" ? target : null;
}

/** AIR-404 — `/magazine/{slug}` URL을 App 콘텐츠 저장소 대상으로 판정한다. wp_post와 분리된 sourceKind다. */
function getAppContentTargetFromSnapshot(snapshot: MarketingSourceSnapshot) {
  const target = normalizeMarketingContentTargets({ url: snapshot.url }).targets[0];
  return target?.sourceKind === "app_content" ? target : null;
}

function stripAppContentHtml(html: string) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * AIR-404 — App 콘텐츠 저장소(`app_magazine_contents`)에서 소스 스냅샷을 만든다.
 * WordPress `wpCacheService.getPostDetail`을 절대 거치지 않는다 — App 콘텐츠는
 * WP 저장소에 존재하지 않고, slug가 같은 WP 원문이 있어도(승격 관계) 그것을 대신 쓰지 않는다.
 */
async function buildAppContentSourceSnapshot(target: { slug: string }) {
  const result = await getAppMagazineContentBySlug(target.slug);
  if (!result.ok) {
    throw new Error(result.error === "not_found" ? "app_content_not_found" : "app_content_unavailable");
  }

  const { content, updatedAt } = result.data;
  const contentText = content.body
    .filter((block) => block.kind === "prose")
    .map((block) => stripAppContentHtml((block as { html: string }).html))
    .join("\n\n")
    .slice(0, 50000);
  const url = `${APP_MAGAZINE_CANONICAL_ORIGIN}${appMagazineContentPath(content.slug)}`;

  return {
    sourceKind: APP_CONTENT_SOURCE_KIND,
    sourceId: content.contentId,
    slug: content.slug,
    url,
    canonicalUrl: toSafeString(content.seo?.canonicalUrl) || url,
    title: content.title,
    excerptText: content.excerpt,
    contentText,
    categories: [content.contentRole],
    tags: (content.topicRefs ?? []).map((topic) => toSafeString(topic.label)).filter(Boolean),
    modified: updatedAt,
  };
}

async function buildScrapedSourceSnapshot(target: { slug: string; url?: string; raw: string }) {
  const url = toSafeString(target.url || target.raw);
  const scraped = await scrapeReadableContent({ url });
  const finalUrl = toSafeString(scraped.finalUrl || url);
  const title = toSafeString(scraped.title || scraped.description || finalUrl);
  const text = toSafeString(scraped.text);
  const description = toSafeString(scraped.description);
  const imageUrls = Array.from(new Set((scraped.imageUrls || []).map((value) => toSafeString(value)).filter(Boolean))).slice(0, 8);

  return {
    sourceKind: inferWebSourceKind(finalUrl),
    sourceId: finalUrl,
    slug: toSafeString(target.slug),
    url: finalUrl,
    canonicalUrl: finalUrl,
    title,
    imageUrl: imageUrls[0] || "",
    imageUrls,
    excerptText: (description || text).slice(0, 1200),
    contentText: text.slice(0, 50000),
    categories: scraped.siteName ? [scraped.siteName] : [],
    modified: "",
  };
}

export async function enqueueMarketingJob(args: {
  universeId: string;
  jobId: string;
  sourceRef: Record<string, unknown>;
  scheduledAt?: string | Date | null;
  generationConfig?: Record<string, unknown>;
}) {
  const client = await getRedisClient();
  const queueKey = getMarketingUniverseQueueKey(args.universeId);
  const payloadKey = getMarketingJobPayloadKey(args.jobId);

  await client.rpush(queueKey, args.jobId);
  await client.set(
    payloadKey,
    JSON.stringify({
      universeId: args.universeId,
      sourceRef: args.sourceRef,
      scheduledAt: toDateOrNull(args.scheduledAt)?.toISOString() || null,
      generationConfig: args.generationConfig || null,
    }),
    "EX",
    60 * 60 * 24,
  );
}

export async function enqueueMarketingContent(args: {
  universeId: string;
  slug?: string;
  url?: string;
  slugs?: string[];
  urls?: string[];
  priority?: "low" | "normal" | "high" | "urgent";
  queueCategory?: string;
  scheduledAt?: string | Date | null;
  force?: boolean;
  requestedBy?: string;
  source?: "manual" | "wp_hook" | "api_batch" | "retry";
  trigger?: string;
  site?: string;
  generationMode?: "server_worker" | "local_agent";
  modelProvider?: string;
  modelName?: string;
  instructionText?: string;
  contentTemplateKey?: string;
  imageTemplateKey?: string;
  reviewMode?: string;
  channels?: MarketingChannel[];
  campaignContext?: Record<string, unknown>;
  sourceSnapshots?: Array<Partial<MarketingSourceSnapshot> & { sourceKind?: string; sourceId?: string }>;
}) {
  const agentRequest = /^agent:/i.test(toSafeString(args.requestedBy));
  const normalized = normalizeMarketingContentTargets(args);
  const queueCategory = normalizeMarketingQueueCategory(args.queueCategory);
  const categoryConfig = await getMarketingQueueCategoryConfig({
    universeId: args.universeId,
    queueCategory,
    enabledOnly: true,
  }).catch(() => null);
  const generationConfig = normalizeMarketingGenerationConfig({
    generationMode: args.generationMode || categoryConfig?.defaultGenerationMode,
    modelProvider: args.modelProvider || categoryConfig?.defaultModelProvider,
    modelName: args.modelName || categoryConfig?.defaultModelName,
    instructionText: args.instructionText || categoryConfig?.instructionText,
    contentTemplateKey: args.contentTemplateKey || categoryConfig?.defaultContentTemplateKey,
    imageTemplateKey: args.imageTemplateKey || categoryConfig?.defaultImageTemplateKey,
    // 에이전트는 반드시 검수 대기에서 멈춘다. category 기본값이 full_auto여도 우회하지 못한다.
    reviewMode: agentRequest ? "review_required" : args.reviewMode || categoryConfig?.defaultReviewMode,
  });
  const priority = normalizeMarketingQueuePriority(args.priority, categoryConfig?.defaultPriority || "normal");
  const normalizedChannels = normalizeMarketingQueueChannels(
    args.channels?.length ? args.channels : categoryConfig?.allowedChannels,
    [...MARKETING_DEFAULT_CONTENT_CHANNELS],
  );
  const channels = normalizedChannels.filter((channel) =>
    (MARKETING_DEFAULT_CONTENT_CHANNELS as readonly string[]).includes(channel),
  );
  const contentChannels = channels.length > 0 ? channels : [...MARKETING_DEFAULT_CONTENT_CHANNELS];
  const enqueued: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  const rawDirectSourceSnapshots = Array.isArray(args.sourceSnapshots) ? args.sourceSnapshots : [];
  const directSourceSnapshots = rawDirectSourceSnapshots.slice(0, MARKETING_QUEUE_ENQUEUE_BATCH_MAX);
  const targetCapacity = Math.max(0, MARKETING_QUEUE_ENQUEUE_BATCH_MAX - directSourceSnapshots.length);
  const targets = normalized.targets.slice(0, targetCapacity);
  const overflowCount = Math.max(
    0,
    normalized.targets.length + rawDirectSourceSnapshots.length - MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
  );

  if (normalized.invalid.length > 0) {
    normalized.invalid.forEach((raw) => {
      failed.push({ raw, reason: "invalid_target" });
    });
  }
  if (overflowCount > 0) {
    failed.push({ count: overflowCount, reason: "batch_limit_exceeded", limit: MARKETING_QUEUE_ENQUEUE_BATCH_MAX });
  }

  const sourceSnapshots: Array<Partial<MarketingSourceSnapshot> & { sourceKind?: string; sourceId?: string }> = [
    ...directSourceSnapshots,
  ];
  const scrapedWebTargets = await Promise.all(
    targets
      .filter((target) => target.sourceKind === "web_page")
      .map(async (target) => {
        try {
          return { sourceSnapshot: await buildScrapedSourceSnapshot(target) };
        } catch (error: unknown) {
          const errLike = error as { message?: unknown } | null | undefined;
          return {
            failed: {
              url: target.url || target.raw,
              slug: target.slug,
              reason: (typeof errLike?.message === "string" && errLike.message) || "web_content_fetch_failed",
            },
          };
        }
      }),
  );
  scrapedWebTargets.forEach((result) => {
    if (result.sourceSnapshot) sourceSnapshots.push(result.sourceSnapshot);
    if (result.failed) failed.push(result.failed);
  });

  // AIR-404 — App 콘텐츠는 wpCacheService를 거치지 않고 App 저장소에서 직접 읽는다.
  // web_page와 같은 위치(sourceSnapshots 경유)로 보내야 아래 WP 전용 루프에 진입하지 않는다.
  const appContentTargets = await Promise.all(
    targets
      .filter((target) => target.sourceKind === "app_content")
      .map(async (target) => {
        try {
          return { sourceSnapshot: await buildAppContentSourceSnapshot(target) };
        } catch (error: unknown) {
          const errLike = error as { message?: unknown } | null | undefined;
          return {
            failed: {
              url: target.url || target.raw,
              slug: target.slug,
              reason: (typeof errLike?.message === "string" && errLike.message) || "app_content_fetch_failed",
            },
          };
        }
      }),
  );
  appContentTargets.forEach((result) => {
    if (result.sourceSnapshot) sourceSnapshots.push(result.sourceSnapshot);
    if (result.failed) failed.push(result.failed);
  });

  for (const target of targets) {
    if (target.sourceKind === "web_page" || target.sourceKind === "app_content") {
      continue;
    }

    const post = await wpCacheService.getPostDetail({ slug: target.slug, forceRefresh: true, includeUnpublished: true });
    if (!post?.id) {
      failed.push({ slug: target.slug, reason: "wp_post_not_found" });
      continue;
    }

    const dedupeKey = toWpDedupeKey(args.universeId, target.slug, queueCategory, generationConfig.contentTemplateKey);
    if (!args.force) {
      const activeJob = await findActiveMarketingJobByDedupeKey({
        universeId: args.universeId,
        dedupeKey,
      });

      if (activeJob?.jobId) {
        skipped.push({
          slug: target.slug,
          jobId: activeJob.jobId,
          reason: "duplicate_active_job",
        });
        continue;
      }
    }

    const sourceRef = {
      postId: Number(post.id),
      slug: target.slug,
      url: target.url || toSafeString(post.link),
      title: decodeHtmlEntities(toSafeString(post.title?.rendered)),
      site: toSafeString(args.site),
      queueCategory,
    };

    const job = await createMarketingJob({
      universeId: args.universeId,
      source: args.source || "manual",
      sourceRef,
      priority,
      queueCategory,
      channels: contentChannels,
      currentStepKey: "normalize_target",
      dedupeKey,
      requestedBy: toRequestedBy(args.requestedBy),
      scheduledAt: args.scheduledAt,
      dryRun: MARKETING_DRY_RUN,
      request: {
        trigger: toSafeString(args.trigger),
        force: Boolean(args.force),
        queueCategory,
        generationConfig,
        ...(args.campaignContext ? { campaignContext: args.campaignContext } : {}),
      },
      featureFlags: {
        dryRun: MARKETING_DRY_RUN,
        reviewRequired: generationConfig.reviewRequired,
        autoPublishAfterReview: generationConfig.autoPublishAfterReview,
      },
    });

    await Promise.all([
      createMarketingJobStep({
        jobId: job.jobId,
        universeId: args.universeId,
        stepKey: "normalize_target",
        status: "queued",
        inputRef: { slug: target.slug, url: sourceRef.url },
      }),
      createMarketingJobStep({
        jobId: job.jobId,
        universeId: args.universeId,
        stepKey: "load_wp_content",
        status: "queued",
        inputRef: { postId: sourceRef.postId, slug: target.slug },
      }),
      ...contentChannels.map((channel) =>
        createMarketingJobStep({
          jobId: job.jobId,
          universeId: args.universeId,
          stepKey: "generate_channel_copy",
          status: "queued",
          channel,
          inputRef: { postId: sourceRef.postId, slug: target.slug, channel },
        }),
      ),
      ...contentChannels.map((channel) =>
        createMarketingJobStep({
          jobId: job.jobId,
          universeId: args.universeId,
          stepKey: "validate_output",
          status: "queued",
          channel,
          inputRef: { postId: sourceRef.postId, slug: target.slug, channel },
        }),
      ),
    ]);

    await enqueueMarketingJob({
      universeId: args.universeId,
      jobId: job.jobId,
      sourceRef,
      scheduledAt: args.scheduledAt,
      generationConfig,
    });

    await sendMarketingSlackNotification({
      universeId: args.universeId,
      jobId: job.jobId,
      event: "queue_enqueued",
      postTitle: decodeHtmlEntities(toSafeString(post.title?.rendered)),
      postUrl: sourceRef.url,
      channels: {
        threads: "queued",
        instagram: "queued",
        linkedin: "queued",
        naver_blog: "queued",
      },
      summary: "WordPress 콘텐츠가 marketing queue에 적재되었습니다.",
    }).catch(() => null);

    enqueued.push({
      jobId: job.jobId,
      slug: target.slug,
      postId: sourceRef.postId,
      status: job.status,
    });
  }

  if (sourceSnapshots.length > 0) {
    const sourceResult = await enqueueMarketingSourceSnapshots({
      universeId: args.universeId,
      snapshots: sourceSnapshots,
      priority: args.priority,
      queueCategory,
      scheduledAt: args.scheduledAt,
      force: args.force,
      requestedBy: args.requestedBy,
      trigger: args.trigger || "web_content_queue",
      generationMode: args.generationMode,
      modelProvider: args.modelProvider,
      modelName: args.modelName,
      instructionText: args.instructionText,
      contentTemplateKey: args.contentTemplateKey,
      imageTemplateKey: args.imageTemplateKey,
      reviewMode: args.reviewMode,
      channels: args.channels,
    });
    enqueued.push(...sourceResult.enqueued);
    skipped.push(...sourceResult.skipped);
    failed.push(...sourceResult.failed);
  }

  return {
    enqueued,
    skipped,
    failed,
  };
}

export async function enqueueMarketingSourceSnapshots(args: {
  universeId: string;
  snapshots: Array<Partial<MarketingSourceSnapshot> & { sourceKind?: string; sourceId?: string }>;
  priority?: "low" | "normal" | "high" | "urgent";
  queueCategory?: string;
  scheduledAt?: string | Date | null;
  force?: boolean;
  requestedBy?: string;
  trigger?: string;
  generationMode?: "server_worker" | "local_agent";
  modelProvider?: string;
  modelName?: string;
  instructionText?: string;
  contentTemplateKey?: string;
  imageTemplateKey?: string;
  reviewMode?: string;
  channels?: MarketingChannel[];
  campaignContext?: Record<string, unknown>;
}) {
  const agentRequest = /^agent:/i.test(toSafeString(args.requestedBy));
  const queueCategory = normalizeMarketingQueueCategory(args.queueCategory);
  const categoryConfig = await getMarketingQueueCategoryConfig({
    universeId: args.universeId,
    queueCategory,
    enabledOnly: true,
  }).catch(() => null);
  const generationConfig = normalizeMarketingGenerationConfig({
    generationMode: args.generationMode || categoryConfig?.defaultGenerationMode,
    modelProvider: args.modelProvider || categoryConfig?.defaultModelProvider,
    modelName: args.modelName || categoryConfig?.defaultModelName,
    instructionText: args.instructionText || categoryConfig?.instructionText,
    contentTemplateKey: args.contentTemplateKey || categoryConfig?.defaultContentTemplateKey,
    imageTemplateKey: args.imageTemplateKey || categoryConfig?.defaultImageTemplateKey,
    reviewMode: agentRequest ? "review_required" : args.reviewMode || categoryConfig?.defaultReviewMode,
  });
  const priority = normalizeMarketingQueuePriority(args.priority, categoryConfig?.defaultPriority || "normal");
  const channels = normalizeMarketingQueueChannels(
    args.channels?.length ? args.channels : categoryConfig?.allowedChannels,
    [...MARKETING_DEFAULT_CONTENT_CHANNELS],
  ).filter((channel) => (MARKETING_DEFAULT_CONTENT_CHANNELS as readonly string[]).includes(channel));
  const contentChannels = channels.length > 0 ? channels : [...MARKETING_DEFAULT_CONTENT_CHANNELS];
  const enqueued: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  const limitedSnapshots = limitTargets(args.snapshots || []);
  const overflowCount = Math.max(0, (args.snapshots || []).length - limitedSnapshots.length);

  if (overflowCount > 0) {
    failed.push({ count: overflowCount, reason: "batch_limit_exceeded", limit: MARKETING_QUEUE_ENQUEUE_BATCH_MAX });
  }

  for (let index = 0; index < limitedSnapshots.length; index += 1) {
    const input = limitedSnapshots[index];
    let sourceSnapshot = normalizeSourceSnapshot(input, index);
    if (!sourceSnapshot) {
      failed.push({ raw: input?.url, reason: "invalid_source_snapshot" });
      continue;
    }

    const wpTarget = getWpContentTargetFromSnapshot(sourceSnapshot);
    if (wpTarget) {
      const result = await enqueueMarketingContent({
        universeId: args.universeId,
        url: wpTarget.url || sourceSnapshot.url,
        priority: args.priority,
        queueCategory,
        scheduledAt: args.scheduledAt,
        force: args.force,
        requestedBy: args.requestedBy,
        source: "api_batch",
        trigger: args.trigger || "source_snapshot_wp_rehydrate",
        generationMode: args.generationMode,
        modelProvider: args.modelProvider,
        modelName: args.modelName,
        instructionText: args.instructionText,
        contentTemplateKey: args.contentTemplateKey,
        imageTemplateKey: args.imageTemplateKey,
        reviewMode: args.reviewMode,
        channels: args.channels,
      });
      enqueued.push(...result.enqueued);
      skipped.push(...result.skipped);
      failed.push(...result.failed);
      continue;
    }

    // AIR-404 — App 콘텐츠는 wpTarget 판정에 절대 걸리지 않는다(getWpContentTargetFromSnapshot이
    // sourceKind==="wp_post"만 통과시킨다). 대신 App 저장소에서 최신 본문으로 다시 채운다 —
    // 호출자가 넘긴 sourceSnapshot을 신뢰하지 않는 것은 WP 경로의 forceRefresh 원칙과 동일하다.
    const appContentTarget = getAppContentTargetFromSnapshot(sourceSnapshot);
    if (appContentTarget) {
      try {
        sourceSnapshot = (await buildAppContentSourceSnapshot(appContentTarget)) as MarketingSourceSnapshot;
      } catch (error: unknown) {
        const errLike = error as { message?: unknown } | null | undefined;
        failed.push({
          url: sourceSnapshot.url,
          slug: sourceSnapshot.slug,
          reason: (typeof errLike?.message === "string" && errLike.message) || "app_content_fetch_failed",
        });
        continue;
      }
    }

    const dedupeKey =
      sourceSnapshot.sourceKind === COMMERCE_PRODUCT_SOURCE_KIND
        ? buildCommerceProductSourceDedupeKey({
            universeId: args.universeId,
            draftId: toSafeString(sourceSnapshot.draftId),
            draftRevision: Number(sourceSnapshot.draftRevision || 1),
            queueCategory,
            channelSet: contentChannels,
          })
        : appContentTarget
          ? toAppContentDedupeKey(
              args.universeId,
              appMagazineContentId(appContentTarget.slug),
              queueCategory,
              generationConfig.contentTemplateKey,
            )
          : toSourceSnapshotDedupeKey(
              args.universeId,
              sourceSnapshot.url,
              queueCategory,
              generationConfig.contentTemplateKey,
            );
    if (!args.force) {
      const activeJob = await findActiveMarketingJobByDedupeKey({
        universeId: args.universeId,
        dedupeKey,
      });

      if (activeJob?.jobId) {
        skipped.push({
          url: sourceSnapshot.url,
          jobId: activeJob.jobId,
          reason: "duplicate_active_job",
        });
        continue;
      }
    }

    const sourceRef = {
      url: sourceSnapshot.url,
      slug: sourceSnapshot.slug,
      title: sourceSnapshot.title,
      sourceKind: toSafeString(sourceSnapshot.sourceKind || input?.sourceKind) || "web_page",
      sourceId: toSafeString(sourceSnapshot.sourceId || input?.sourceId),
      sourceSnapshot,
      queueCategory,
    };

    const job = await createMarketingJob({
      universeId: args.universeId,
      source: "api_batch",
      sourceRef,
      priority,
      queueCategory,
      channels: contentChannels,
      currentStepKey: "normalize_target",
      dedupeKey,
      requestedBy: toRequestedBy(args.requestedBy),
      scheduledAt: args.scheduledAt,
      dryRun: MARKETING_DRY_RUN,
      request: {
        trigger: toSafeString(args.trigger) || "source_snapshot_queue",
        force: Boolean(args.force),
        queueCategory,
        generationConfig,
        ...(args.campaignContext ? { campaignContext: args.campaignContext } : {}),
      },
      featureFlags: {
        dryRun: MARKETING_DRY_RUN,
        reviewRequired: generationConfig.reviewRequired,
        autoPublishAfterReview: generationConfig.autoPublishAfterReview,
      },
    });

    await Promise.all([
      createMarketingJobStep({
        jobId: job.jobId,
        universeId: args.universeId,
        stepKey: "normalize_target",
        status: "queued",
        inputRef: { url: sourceSnapshot.url, slug: sourceSnapshot.slug },
      }),
      createMarketingJobStep({
        jobId: job.jobId,
        universeId: args.universeId,
        stepKey: "load_wp_content",
        status: "queued",
        inputRef: { sourceKind: sourceRef.sourceKind, url: sourceSnapshot.url },
      }),
      ...contentChannels.map((channel) =>
        createMarketingJobStep({
          jobId: job.jobId,
          universeId: args.universeId,
          stepKey: "generate_channel_copy",
          status: "queued",
          channel,
          inputRef: { url: sourceSnapshot.url, channel },
        }),
      ),
      ...contentChannels.map((channel) =>
        createMarketingJobStep({
          jobId: job.jobId,
          universeId: args.universeId,
          stepKey: "validate_output",
          status: "queued",
          channel,
          inputRef: { url: sourceSnapshot.url, channel },
        }),
      ),
    ]);

    await enqueueMarketingJob({
      universeId: args.universeId,
      jobId: job.jobId,
      sourceRef,
      scheduledAt: args.scheduledAt,
      generationConfig,
    });

    enqueued.push({
      jobId: job.jobId,
      slug: sourceSnapshot.slug,
      url: sourceSnapshot.url,
      status: job.status,
    });
  }

  return {
    enqueued,
    skipped,
    failed,
  };
}

export async function retryMarketingJob(args: {
  universeId: string;
  jobId: string;
  stepId?: string;
  reason?: string;
  resetTo?: "queued";
  requestedBy?: string;
}) {
  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) {
    return { ok: false as const, status: 404, error: "job_not_found" };
  }

  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  const status = toSafeString(job.status);
  if (!["failed", "rejected", "canceled", "partial"].includes(status)) {
    return { ok: false as const, status: 400, error: "job_not_retryable" };
  }

  let resetStepKey = toSafeString(job.currentStepKey) || "normalize_target";
  if (args.stepId) {
    const step = await getMarketingJobStepByStepId(args.stepId);
    if (!step || toSafeString(step.jobId) !== toSafeString(args.jobId)) {
      return { ok: false as const, status: 404, error: "step_not_found" };
    }

    resetStepKey = toSafeString(step.stepKey) || resetStepKey;
    await updateMarketingJobStepStatus({
      stepId: step.stepId,
      status: args.resetTo || "queued",
      workerId: "",
      leaseExpiresAt: null,
      outputRef: {},
      meta: {
        retriedBy: toRequestedBy(args.requestedBy),
        retryReason: toSafeString(args.reason) || "operator_retry",
      },
      lastError: null,
      startedAt: null,
      completedAt: null,
    });
  }

  await updateMarketingJob({
    jobId: args.jobId,
    set: {
      status: args.resetTo || "queued",
      source: "retry",
      currentStepKey: resetStepKey,
      startedAt: null,
      completedAt: null,
      lastError: null,
      requestedBy: toRequestedBy(args.requestedBy) || toSafeString(job.requestedBy),
      request: {
        ...(job.request || {}),
        retryReason: toSafeString(args.reason) || "operator_retry",
      },
    },
  });

  await enqueueMarketingJob({
    universeId: args.universeId,
    jobId: args.jobId,
    sourceRef: job.sourceRef || {},
    scheduledAt: job.scheduledAt || null,
  });

  return {
    ok: true as const,
    jobId: args.jobId,
    stepKey: resetStepKey,
    status: args.resetTo || "queued",
  };
}
