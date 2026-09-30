import "server-only";

import {
  createMarketingJobStep,
  createMarketingAsset,
  getMarketingJobByJobId,
  listMarketingAssets,
  listMarketingJobSteps,
  getMarketingQueueCategoryConfig,
  updateMarketingJob,
  updateMarketingJobStatus,
  updateMarketingJobStepStatus,
  updateMarketingSourceInventoryItem,
} from "libs/database/marketing";
import { createMarketingPublishLog } from "libs/database/marketing";
import wpCacheService from "libs/services/wpCacheService";
import { decodeHtmlEntities } from "utils/common";
import { getRedisClient } from "libs/cache/redisClient";
import { MARKETING_DEFAULT_CONTENT_CHANNELS } from "consts/marketing/queue";
import type { MarketingChannel, MarketingStepStatus } from "consts/marketing/queue";
import { validateMarketingChannelDraft } from "libs/marketing/bridge/schemaValidator";
import { getMarketingChannelDraftSchemaExample } from "libs/marketing/bridge/channelDraftContract";
import { runMarketingBridge } from "libs/marketing/bridge/runner";
import type { MarketingChannelDraft, MarketingSourceSnapshot } from "libs/marketing/bridge/types";
import { publishMarketingThreadsDraft } from "libs/marketing/publish/threadsPublisher";
import { publishMarketingInstagramDraft } from "libs/marketing/publish/instagramPublisher";
import { normalizePlainTextSocialDraft } from "libs/marketing/format/socialPlainText";
import { resolveMarketingPublishImage } from "libs/marketing/images/resolvePublishImage";
import { sendMarketingSlackNotification } from "libs/marketing/notify/slackNotifier";
import { publishDueMarketingChannelActions } from "libs/marketing/operator/channelActionService";
import { getMarketingGenerationConfigFromJob, type MarketingGenerationConfig } from "libs/marketing/generationConfig";
import { normalizeMarketingQueueCategory } from "libs/marketing/queue/categoryConfig";
import { normalizeMarketingContentTargets } from "libs/marketing/ingest/normalizeTarget";
import { extractMarketingPostImageFields } from "libs/marketing/sourceImageFields";
import { withMarketingSourceEvidence } from "libs/marketing/source/sourceEvidence";
import {
  recordTypoCandidatesFromValidation,
  validateDraftAgainstActiveTypoRules,
} from "libs/marketing/quality/koreanTypoRules";
import { runIndependentMarketingProofread } from "libs/marketing/quality/independentProofreadService";
import { createMarketingDraftDigest } from "libs/marketing/quality/marketingDraftDigest";
import { markMarketingWorkerHeartbeat } from "./ops";
import { getMarketingUniverseProcessingKey, getMarketingUniverseQueueKey } from "./keys";
import { acquireMarketingJobLease, releaseMarketingJobLease } from "./lease";

const LOCAL_AGENT_LEASE_TTL_MS = 30 * 60 * 1000;
const CATEGORY_CLAIM_SCAN_LIMIT = 20;
const GENSTUDIO_ASSET_ID_RE = /^asset_[a-z0-9]+$/i;

type MarketingRecord = Record<string, unknown>;
type MarketingJobLike = {
  universeId?: unknown;
  status?: unknown;
  queueCategory?: unknown;
  sourceRef?: MarketingRecord;
  request?: MarketingRecord;
  metrics?: MarketingRecord & {
    localAgent?: MarketingRecord;
    sourceSnapshotAssetId?: unknown;
  };
  channels?: unknown;
  dryRun?: unknown;
  startedAt?: string | Date | null;
  updatedAt?: unknown;
  archivedAt?: unknown;
};
type MarketingStepLike = {
  stepId?: string;
  stepKey?: unknown;
  channel?: unknown;
  status?: MarketingStepStatus | "";
  startedAt?: string | Date | null;
  outputRef?: MarketingRecord;
  meta?: MarketingRecord;
};

function isMarketingRecord(value: unknown): value is MarketingRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toRecord(value: unknown): MarketingRecord {
  return isMarketingRecord(value) ? value : {};
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toOperationSegment(value: unknown, max = 80) {
  return toSafeString(value).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, max) || "unknown";
}

function toDate(value?: string | Date | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function isCanceledOrArchivedJob(job: MarketingJobLike) {
  return toSafeString(job?.status) === "canceled" || Boolean(job?.archivedAt);
}

function toPlainText(raw: unknown, max = 4000) {
  const text = String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeHtmlEntities(text).slice(0, max);
}

async function moveBackToQueue(universeId: string, jobId: string) {
  const client = await getRedisClient();
  const queueKey = getMarketingUniverseQueueKey(universeId);
  const processingKey = getMarketingUniverseProcessingKey(universeId);
  await client.lrem(processingKey, 1, jobId);
  await client.rpush(queueKey, jobId);
}

async function deferJobInQueue(universeId: string, jobId: string) {
  const client = await getRedisClient();
  const queueKey = getMarketingUniverseQueueKey(universeId);
  const processingKey = getMarketingUniverseProcessingKey(universeId);
  await client.lrem(processingKey, 1, jobId);
  await client.lpush(queueKey, jobId);
}

function getJobQueueCategory(job: MarketingJobLike) {
  return normalizeMarketingQueueCategory(job?.queueCategory || job?.sourceRef?.queueCategory || job?.request?.queueCategory);
}

async function getProcessingCategoryCount(args: {
  universeId: string;
  queueCategory: string;
  excludeJobId?: string;
}) {
  const client = await getRedisClient();
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const processingJobIds = Array.from(
    new Set((await client.lrange(processingKey, 0, -1)).map((jobId) => toSafeString(jobId)).filter(Boolean)),
  ).filter((jobId) => jobId !== toSafeString(args.excludeJobId));

  if (processingJobIds.length === 0) return 0;

  const jobs = await Promise.all(processingJobIds.slice(0, 200).map((jobId) => getMarketingJobByJobId(jobId).catch(() => null)));
  return jobs.filter((job) => {
    if (!job || isCanceledOrArchivedJob(job)) return false;
    return getJobQueueCategory(job) === args.queueCategory;
  }).length;
}

async function getCategoryThrottleState(args: {
  universeId: string;
  job: MarketingJobLike;
  jobId: string;
}) {
  const queueCategory = getJobQueueCategory(args.job);
  const config = await getMarketingQueueCategoryConfig({
    universeId: args.universeId,
    queueCategory,
    enabledOnly: true,
  }).catch(() => null);
  const maxConcurrency = Math.max(0, Math.floor(Number(config?.maxConcurrency || 0)));

  if (!config || maxConcurrency <= 0) {
    return {
      throttled: false,
      queueCategory,
      activeCount: 0,
      maxConcurrency,
    };
  }

  const activeCount = await getProcessingCategoryCount({
    universeId: args.universeId,
    queueCategory,
    excludeJobId: args.jobId,
  });

  return {
    throttled: activeCount >= maxConcurrency,
    queueCategory,
    activeCount,
    maxConcurrency,
  };
}

async function claimMarketingWorkerJob(args: {
  universeId: string;
  workerId: string;
  leaseTtlMs?: number;
  jobId?: string;
  queueCategory?: string;
}) {
  const client = await getRedisClient();
  const queueKey = getMarketingUniverseQueueKey(args.universeId);
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const requestedJobId = toSafeString(args.jobId);
  const requestedQueueCategory = args.queueCategory ? normalizeMarketingQueueCategory(args.queueCategory) : "";

  if (requestedJobId) {
    const leaseAcquired = await acquireMarketingJobLease({
      jobId: requestedJobId,
      workerId: args.workerId,
      ...(args.leaseTtlMs ? { ttlMs: args.leaseTtlMs } : {}),
    });
    if (!leaseAcquired) {
      return {
        ok: true,
        status: "busy" as const,
        jobId: requestedJobId,
      };
    }

    const job = await getMarketingJobByJobId(requestedJobId);
    if (!job) {
      await releaseMarketingJobLease({ jobId: requestedJobId, workerId: args.workerId }).catch(() => null);
      await client.lrem(queueKey, 0, requestedJobId);
      await client.lrem(processingKey, 0, requestedJobId);
      return {
        ok: false,
        status: "missing_job" as const,
        jobId: requestedJobId,
      };
    }

    if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
      await releaseMarketingJobLease({ jobId: requestedJobId, workerId: args.workerId }).catch(() => null);
      return {
        ok: false,
        status: "forbidden" as const,
        jobId: requestedJobId,
      };
    }

    if (isCanceledOrArchivedJob(job)) {
      await releaseMarketingJobLease({ jobId: requestedJobId, workerId: args.workerId }).catch(() => null);
      await client.lrem(queueKey, 0, requestedJobId);
      await client.lrem(processingKey, 0, requestedJobId);
      return {
        ok: true,
        status: "canceled" as const,
        jobId: requestedJobId,
      };
    }

    if (requestedQueueCategory && getJobQueueCategory(job) !== requestedQueueCategory) {
      await releaseMarketingJobLease({ jobId: requestedJobId, workerId: args.workerId }).catch(() => null);
      return {
        ok: true,
        status: "category_mismatch" as const,
        jobId: requestedJobId,
        queueCategory: getJobQueueCategory(job),
      };
    }

    const throttle = await getCategoryThrottleState({
      universeId: args.universeId,
      job,
      jobId: requestedJobId,
    });
    if (throttle.throttled) {
      await releaseMarketingJobLease({ jobId: requestedJobId, workerId: args.workerId }).catch(() => null);
      return {
        ok: true,
        status: "category_throttled" as const,
        jobId: requestedJobId,
        queueCategory: throttle.queueCategory,
        activeCount: throttle.activeCount,
        maxConcurrency: throttle.maxConcurrency,
      };
    }

    await client.lrem(queueKey, 0, requestedJobId);
    await client.lrem(processingKey, 0, requestedJobId);
    await client.rpush(processingKey, requestedJobId);

    return {
      ok: true,
      status: "claimed" as const,
      jobId: requestedJobId,
      job,
    };
  }

  const queueDepth = Math.max(1, Math.min(CATEGORY_CLAIM_SCAN_LIMIT, Number(await client.llen(queueKey).catch(() => 1)) || 1));
  let latestThrottle: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt < queueDepth; attempt += 1) {
    const jobId = await client.rpoplpush(queueKey, processingKey);

    if (!jobId) {
      break;
    }

    const leaseAcquired = await acquireMarketingJobLease({
      jobId,
      workerId: args.workerId,
      ...(args.leaseTtlMs ? { ttlMs: args.leaseTtlMs } : {}),
    });
    if (!leaseAcquired) {
      await moveBackToQueue(args.universeId, jobId);
      return {
        ok: true,
        status: "busy" as const,
        jobId,
      };
    }

    const job = await getMarketingJobByJobId(jobId);
    if (!job) {
      await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => null);
      await client.lrem(processingKey, 1, jobId);
      return {
        ok: false,
        status: "missing_job" as const,
        jobId,
      };
    }

    if (isCanceledOrArchivedJob(job)) {
      await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => null);
      await client.lrem(processingKey, 1, jobId);
      return {
        ok: true,
        status: "canceled" as const,
        jobId,
      };
    }

    if (requestedQueueCategory && getJobQueueCategory(job) !== requestedQueueCategory) {
      await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => null);
      await deferJobInQueue(args.universeId, jobId);
      continue;
    }

    const throttle = await getCategoryThrottleState({
      universeId: args.universeId,
      job,
      jobId,
    });
    if (throttle.throttled) {
      await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => null);
      await deferJobInQueue(args.universeId, jobId);
      latestThrottle = {
        jobId,
        queueCategory: throttle.queueCategory,
        activeCount: throttle.activeCount,
        maxConcurrency: throttle.maxConcurrency,
      };
      continue;
    }

    return {
      ok: true,
      status: "claimed" as const,
      jobId,
      job,
    };
  }

  if (latestThrottle) {
    return {
      ok: true,
      status: "category_throttled" as const,
      ...latestThrottle,
    };
  }

  return {
    ok: true,
    status: "idle" as const,
  };
}

async function updateInventoryRewriteStatusFromJob(args: {
  universeId: string;
  job: MarketingJobLike;
  status: "drafted" | "waiting_review" | "failed";
  jobId: string;
  batchKey?: string;
}) {
  const itemId = toSafeString(args.job?.sourceRef?.inventoryId);
  if (!itemId) return;
  await updateMarketingSourceInventoryItem({
    universeId: args.universeId,
    itemId,
    set: {
      rewriteStatus: args.status,
      lastJobId: args.jobId,
      batchKey: toSafeString(args.batchKey || args.job?.request?.batchKey),
    },
  }).catch(() => null);
}

function toStringArray(values: unknown, limit = 20) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => toSafeString(value))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function normalizeGenStudioAssetId(raw: unknown) {
  const value = toSafeString(raw).replace(/\s+/g, "");
  return GENSTUDIO_ASSET_ID_RE.test(value) ? value : "";
}

function toBridgeChannels(values: unknown): MarketingChannel[] {
  const channels = toStringArray(values, 10).filter((channel) =>
    (MARKETING_DEFAULT_CONTENT_CHANNELS as readonly string[]).includes(channel),
  ) as MarketingChannel[];
  return channels.length > 0 ? channels : [...MARKETING_DEFAULT_CONTENT_CHANNELS];
}

function buildSourceSnapshot(job: MarketingJobLike, post: unknown): MarketingSourceSnapshot {
  const postRecord = toRecord(post);
  const title = toRecord(postRecord.title);
  const excerpt = toRecord(postRecord.excerpt);
  const content = toRecord(postRecord.content);
  const imageFields = extractMarketingPostImageFields(post);
  const categories = toStringArray(postRecord.categories);
  const tags = toStringArray(postRecord.tags);
  const rawContentHtml = String(content.rendered || "");
  const sourceSnapshot = {
    postId: Number(postRecord.id || job?.sourceRef?.postId || 0) || undefined,
    slug: toSafeString(postRecord.slug || job?.sourceRef?.slug),
    url: toSafeString(postRecord.link || job?.sourceRef?.url),
    canonicalUrl: toSafeString(postRecord.link || job?.sourceRef?.url),
    title: decodeHtmlEntities(toSafeString(title.rendered)),
    ...(imageFields.imageUrl ? { imageUrl: imageFields.imageUrl } : {}),
    ...(imageFields.imageAlt ? { imageAlt: imageFields.imageAlt } : {}),
    ...(imageFields.imageSource ? { imageSource: imageFields.imageSource } : {}),
    ...(imageFields.genStudioImageAssetId ? { genStudioImageAssetId: imageFields.genStudioImageAssetId } : {}),
    ...(imageFields.imageUrls.length ? { imageUrls: imageFields.imageUrls } : {}),
    excerptText: toPlainText(excerpt.rendered, 1200),
    contentText: toPlainText(rawContentHtml, 50000),
    categories,
    tags,
    modified: toSafeString(postRecord.modified),
  };

  return withMarketingSourceEvidence(sourceSnapshot, {
    title: sourceSnapshot.title,
    contentHtml: rawContentHtml,
    contentText: sourceSnapshot.contentText,
    excerptText: sourceSnapshot.excerptText,
    categories,
    tags,
  }) as MarketingSourceSnapshot;
}

function buildEmbeddedSourceSnapshot(job: MarketingJobLike): MarketingSourceSnapshot | null {
  const source = job?.sourceRef?.sourceSnapshot;
  if (!isMarketingRecord(source)) return null;
  const url = toSafeString(source.url || job?.sourceRef?.url || job?.sourceRef?.sourceUrl);
  if (!url) return null;

  const sourceSnapshot = {
    sourceKind: toSafeString(source.sourceKind || job?.sourceRef?.sourceKind),
    sourceId: toSafeString(source.sourceId || job?.sourceRef?.sourceId),
    sourceVersion: Number(source.sourceVersion || 0) || undefined,
    snapshotHash: toSafeString(source.snapshotHash),
    sourceFingerprint: toSafeString(source.sourceFingerprint),
    universeId: toSafeString(source.universeId || job?.universeId),
    draftId: toSafeString(source.draftId),
    draftRevision: Number(source.draftRevision || 0) || undefined,
    channelProductNo: Number(source.channelProductNo || 0) || undefined,
    summary: toSafeString(source.summary),
    imageAssetIds: toStringArray(source.imageAssetIds, 24),
    contentAssetIds: toStringArray(source.contentAssetIds, 16),
    productFacts: isMarketingRecord(source.productFacts) ? source.productFacts : undefined,
    campaignId: toSafeString(source.campaignId),
    storeManagerUrl: toSafeString(source.storeManagerUrl),
    publishedAt: toSafeString(source.publishedAt),
    imageLineage: Array.isArray(source.imageLineage) ? source.imageLineage : undefined,
    promotion: isMarketingRecord(source.promotion)
      ? (source.promotion as MarketingSourceSnapshot["promotion"])
      : undefined,
    postId: Number(source.postId || 0) || undefined,
    slug: toSafeString(source.slug || job?.sourceRef?.inventoryId || url),
    url,
    canonicalUrl: toSafeString(source.canonicalUrl || url),
    title: toSafeString(source.title || job?.sourceRef?.title),
    imageUrl: toSafeString(source.imageUrl),
    imageAlt: toSafeString(source.imageAlt),
    imageSource: toSafeString(source.imageSource),
    genStudioImageAssetId: normalizeGenStudioAssetId(source.genStudioImageAssetId || source.imageAssetId),
    imageUrls: toStringArray(source.imageUrls),
    excerptText: toSafeString(source.excerptText),
    contentText: toSafeString(source.contentText),
    outline: Array.isArray(source.outline) ? source.outline : undefined,
    sourceQuotes: toStringArray(source.sourceQuotes),
    keyTerms: toStringArray(source.keyTerms),
    allowedClaims: toStringArray(source.allowedClaims),
    categories: toStringArray(source.categories),
    tags: toStringArray(source.tags),
    modified: toSafeString(source.modified || job?.updatedAt),
  };

  return withMarketingSourceEvidence(sourceSnapshot, {
    title: sourceSnapshot.title,
    contentText: sourceSnapshot.contentText,
    excerptText: sourceSnapshot.excerptText,
    categories: sourceSnapshot.categories,
    tags: sourceSnapshot.tags,
  }) as MarketingSourceSnapshot;
}

function getWpContentTargetFromSource(job: MarketingJobLike, snapshot?: MarketingSourceSnapshot | null) {
  const rawUrl = toSafeString(snapshot?.url || job?.sourceRef?.url || job?.sourceRef?.sourceUrl);
  const target = rawUrl ? normalizeMarketingContentTargets({ url: rawUrl }).targets[0] : null;
  if (target?.sourceKind === "wp_post") return target;

  const sourceKind = toSafeString(job?.sourceRef?.sourceKind).toLowerCase();
  if (["wp", "wp_post", "wordpress"].includes(sourceKind)) {
    const slug = toSafeString(snapshot?.slug || job?.sourceRef?.slug);
    return slug
      ? {
          slug,
          url: rawUrl || undefined,
          raw: rawUrl || slug,
          sourceKind: "wp_post" as const,
        }
      : null;
  }

  return null;
}

async function loadAuthoritativeWpPost(job: MarketingJobLike, snapshot?: MarketingSourceSnapshot | null) {
  const target = getWpContentTargetFromSource(job, snapshot);
  if (!target && snapshot) return { shouldUseWp: false, post: null };

  const post = await wpCacheService.getPostDetail({
    postId: Number(job.sourceRef?.postId || snapshot?.postId || 0) || undefined,
    slug: toSafeString(target?.slug || job.sourceRef?.slug || snapshot?.slug) || undefined,
    forceRefresh: true,
    includeUnpublished: true,
  });

  return {
    shouldUseWp: Boolean(target || !snapshot),
    post,
  };
}

async function createTextAsset(args: {
  jobId: string;
  stepId: string;
  universeId: string;
  kind: string;
  channel: MarketingChannel;
  title: string;
  text: string;
  meta?: Record<string, unknown>;
}) {
  return await createMarketingAsset({
    jobId: args.jobId,
    stepId: args.stepId,
    universeId: args.universeId,
    kind: args.kind,
    channel: args.channel,
    title: args.title,
    mimeType: "text/plain",
    content: {
      text: args.text,
    },
    meta: args.meta || {},
  });
}

async function ensureRewriteSteps(args: {
  jobId: string;
  universeId: string;
  channels: MarketingChannel[];
  steps: MarketingStepLike[];
}) {
  const steps = [...args.steps];

  for (const channel of args.channels) {
    const hasGenerate = steps.some(
      (step) => toSafeString(step.stepKey) === "generate_channel_copy" && toSafeString(step.channel) === channel,
    );
    const hasValidate = steps.some(
      (step) => toSafeString(step.stepKey) === "validate_output" && toSafeString(step.channel) === channel,
    );

    if (!hasGenerate) {
      steps.push(
        await createMarketingJobStep({
          jobId: args.jobId,
          universeId: args.universeId,
          stepKey: "generate_channel_copy",
          status: "queued",
          channel,
          inputRef: { channel },
        }),
      );
    }

    if (!hasValidate) {
      steps.push(
        await createMarketingJobStep({
          jobId: args.jobId,
          universeId: args.universeId,
          stepKey: "validate_output",
          status: "queued",
          channel,
          inputRef: { channel },
        }),
      );
    }
  }

  return steps;
}

async function ensureThreadsPublishStep(args: {
  jobId: string;
  universeId: string;
  channels: MarketingChannel[];
  steps: MarketingStepLike[];
}) {
  if (!args.channels.includes("threads")) {
    return args.steps;
  }

  const hasPublish = args.steps.some(
    (step) => toSafeString(step.stepKey) === "publish_threads" && toSafeString(step.channel) === "threads",
  );
  if (hasPublish) {
    return args.steps;
  }

  return [
    ...args.steps,
    await createMarketingJobStep({
      jobId: args.jobId,
      universeId: args.universeId,
      stepKey: "publish_threads",
      status: "queued",
      channel: "threads",
      inputRef: { channel: "threads" },
    }),
  ];
}

async function ensureInstagramPublishStep(args: {
  jobId: string;
  universeId: string;
  channels: MarketingChannel[];
  steps: MarketingStepLike[];
}) {
  if (!args.channels.includes("instagram")) {
    return args.steps;
  }

  const hasPublish = args.steps.some(
    (step) => toSafeString(step.stepKey) === "publish_instagram" && toSafeString(step.channel) === "instagram",
  );
  if (hasPublish) {
    return args.steps;
  }

  return [
    ...args.steps,
    await createMarketingJobStep({
      jobId: args.jobId,
      universeId: args.universeId,
      stepKey: "publish_instagram",
      status: "queued",
      channel: "instagram",
      inputRef: { channel: "instagram" },
    }),
  ];
}

async function ensureManualReviewStep(args: {
  jobId: string;
  universeId: string;
  channel: Extract<MarketingChannel, "linkedin" | "naver_blog">;
  steps: MarketingStepLike[];
  assetIds: string[];
}) {
  const stepKey = args.channel === "linkedin" ? "prepare_linkedin_draft" : "prepare_naver_draft";
  const existingStep = args.steps.find(
    (step) => toSafeString(step.stepKey) === stepKey && toSafeString(step.channel) === args.channel,
  );

  if (existingStep?.stepId) {
    const status = ["success", "skipped"].includes(toSafeString(existingStep.status))
      ? (existingStep.status as MarketingStepStatus)
      : "waiting_review";

    await updateMarketingJobStepStatus({
      stepId: existingStep.stepId,
      status,
      outputRef: {
        ...(existingStep.outputRef || {}),
        assetIds: args.assetIds,
      },
      meta: {
        ...(existingStep.meta || {}),
        reviewRequired: true,
      },
    });

    return existingStep;
  }

  return await createMarketingJobStep({
    jobId: args.jobId,
    universeId: args.universeId,
    stepKey,
    status: "waiting_review",
    channel: args.channel,
    outputRef: {
      assetIds: args.assetIds,
    },
    meta: {
      reviewRequired: true,
    },
  });
}

async function ensureThreadsReviewStep(args: {
  publishStep: MarketingStepLike;
  workerId: string;
  assetIds: string[];
  generationConfig: MarketingGenerationConfig;
}) {
  if (!args.publishStep?.stepId) return null;

  await updateMarketingJobStepStatus({
    stepId: args.publishStep.stepId,
    status: "waiting_review",
    workerId: args.workerId,
    outputRef: {
      ...(args.publishStep.outputRef || {}),
      assetIds: args.assetIds,
    },
    meta: {
      ...(args.publishStep.meta || {}),
      reviewRequired: true,
      autoPublishAfterReview: args.generationConfig.autoPublishAfterReview,
      imageTemplateKey: args.generationConfig.imageTemplateKey,
    },
  });

  return args.publishStep;
}

async function ensureInstagramReviewStep(args: {
  publishStep: MarketingStepLike;
  workerId: string;
  assetIds: string[];
  generationConfig: MarketingGenerationConfig;
}) {
  if (!args.publishStep?.stepId) return null;

  await updateMarketingJobStepStatus({
    stepId: args.publishStep.stepId,
    status: "waiting_review",
    workerId: args.workerId,
    outputRef: {
      ...(args.publishStep.outputRef || {}),
      assetIds: args.assetIds,
    },
    meta: {
      ...(args.publishStep.meta || {}),
      reviewRequired: true,
      autoPublishAfterReview: args.generationConfig.autoPublishAfterReview,
      imageTemplateKey: args.generationConfig.imageTemplateKey,
    },
  });

  return args.publishStep;
}

async function publishThreadsStep(args: {
  universeId: string;
  workerId: string;
  jobId: string;
  job: MarketingJobLike;
  sourceSnapshot: MarketingSourceSnapshot;
  sourceAssetId: string;
  generateStep: MarketingStepLike;
  validateStep: MarketingStepLike;
  publishStep: MarketingStepLike;
  draftPayload: MarketingChannelDraft;
}) {
  await updateMarketingJobStepStatus({
    stepId: toSafeString(args.publishStep.stepId),
    status: "running",
    workerId: args.workerId,
    startedAt: args.publishStep.startedAt || new Date(),
  });

  const publishResult = await publishMarketingThreadsDraft({
    universeId: args.universeId,
    jobId: args.jobId,
    slug: args.sourceSnapshot.slug,
    draft: args.draftPayload,
    dryRun: Boolean(args.job.dryRun),
    canonicalUrl: args.sourceSnapshot.url,
    sourceImageUrl: args.sourceSnapshot.imageUrl || args.sourceSnapshot.imageUrls?.[0],
    campaignId: args.sourceSnapshot.campaignId,
  });

  const publishLog = await createMarketingPublishLog({
    universeId: args.universeId,
    jobId: args.jobId,
    stepId: args.publishStep.stepId,
    channel: "threads",
    status: publishResult.status,
    targetRef: {
      canonicalUrl: publishResult.request.canonicalUrl,
      finalUrl: publishResult.request.finalUrl,
      sourceLineage: {
        sourceKind: args.sourceSnapshot.sourceKind,
        campaignId: args.sourceSnapshot.campaignId,
        sourceFingerprint: args.sourceSnapshot.sourceFingerprint,
        draftId: args.sourceSnapshot.draftId,
        draftRevision: args.sourceSnapshot.draftRevision,
        channelProductNo: args.sourceSnapshot.channelProductNo,
      },
    },
    request: publishResult.request,
    response: publishResult.response,
    completedBy: args.workerId,
    publishedAt: publishResult.publishedAt,
    completedAt: new Date(),
  });

  const receiptAsset = await createMarketingAsset({
    jobId: args.jobId,
    stepId: args.publishStep.stepId,
    universeId: args.universeId,
    kind: "publish_receipt",
    channel: "threads",
    title: "threads publish receipt",
    mimeType: "application/json",
    content: {
      channel: "threads",
      mode: publishResult.mode,
      request: publishResult.request,
      response: publishResult.response,
      publishedAt: publishResult.publishedAt,
      sourceAssetId: args.sourceAssetId,
    },
    meta: {
      publishLogId: publishLog.publishLogId,
      generateStepId: toSafeString(args.generateStep.stepId),
      validateStepId: toSafeString(args.validateStep.stepId),
    },
  });

  const stepStatus = publishResult.ok
    ? publishResult.status === "skipped"
      ? "skipped"
      : "success"
    : "failed";

  await updateMarketingJobStepStatus({
    stepId: toSafeString(args.publishStep.stepId),
    status: stepStatus,
    workerId: args.workerId,
    outputRef: {
      assetIds: [receiptAsset.assetId],
      publishLogIds: [publishLog.publishLogId],
    },
    meta: {
      publishMode: publishResult.mode,
      publishStatus: publishResult.status,
      finalUrl: publishResult.request.finalUrl,
    },
    lastError: publishResult.ok ? null : publishResult.error,
    completedAt: new Date(),
  });

  return {
    stepStatus,
    publishStatus: publishResult.status,
    publishMode: publishResult.mode,
    publishLogId: publishLog.publishLogId,
    receiptAssetId: receiptAsset.assetId,
    finalUrl: publishResult.request.finalUrl,
    error: publishResult.ok ? null : publishResult.error,
  };
}

async function publishInstagramStep(args: {
  universeId: string;
  workerId: string;
  jobId: string;
  job: MarketingJobLike;
  sourceSnapshot: MarketingSourceSnapshot;
  sourceAssetId: string;
  generateStep: MarketingStepLike;
  validateStep: MarketingStepLike;
  publishStep: MarketingStepLike;
  draftPayload: MarketingChannelDraft;
}) {
  await updateMarketingJobStepStatus({
    stepId: toSafeString(args.publishStep.stepId),
    status: "running",
    workerId: args.workerId,
    startedAt: args.publishStep.startedAt || new Date(),
  });

  const publishResult = await publishMarketingInstagramDraft({
    universeId: args.universeId,
    jobId: args.jobId,
    slug: args.sourceSnapshot.slug,
    draft: args.draftPayload,
    dryRun: Boolean(args.job.dryRun),
    canonicalUrl: args.sourceSnapshot.url,
    sourceImageUrl: args.sourceSnapshot.imageUrl || args.sourceSnapshot.imageUrls?.[0],
    campaignId: args.sourceSnapshot.campaignId,
  });

  const publishLog = await createMarketingPublishLog({
    universeId: args.universeId,
    jobId: args.jobId,
    stepId: args.publishStep.stepId,
    channel: "instagram",
    status: publishResult.status,
    targetRef: {
      canonicalUrl: publishResult.request.canonicalUrl,
      finalUrl: publishResult.request.finalUrl,
      imageUrl: publishResult.request.imageUrl,
      sourceLineage: {
        sourceKind: args.sourceSnapshot.sourceKind,
        campaignId: args.sourceSnapshot.campaignId,
        sourceFingerprint: args.sourceSnapshot.sourceFingerprint,
        draftId: args.sourceSnapshot.draftId,
        draftRevision: args.sourceSnapshot.draftRevision,
        channelProductNo: args.sourceSnapshot.channelProductNo,
      },
    },
    request: publishResult.request,
    response: {
      mode: publishResult.mode,
      raw: publishResult.response,
      error: publishResult.ok ? null : publishResult.error,
    },
    completedBy: args.workerId,
    publishedAt: publishResult.publishedAt,
    completedAt: new Date(),
  });

  const receiptAsset = await createMarketingAsset({
    jobId: args.jobId,
    stepId: args.publishStep.stepId,
    universeId: args.universeId,
    kind: "publish_receipt",
    channel: "instagram",
    title: "instagram publish receipt",
    mimeType: "application/json",
    content: {
      channel: "instagram",
      mode: publishResult.mode,
      request: publishResult.request,
      response: publishResult.response,
      error: publishResult.ok ? null : publishResult.error,
      publishedAt: publishResult.publishedAt,
      sourceAssetId: args.sourceAssetId,
    },
    meta: {
      publishLogId: publishLog.publishLogId,
      generateStepId: toSafeString(args.generateStep.stepId),
      validateStepId: toSafeString(args.validateStep.stepId),
    },
  });

  const stepStatus = publishResult.ok
    ? publishResult.status === "skipped"
      ? "skipped"
      : "success"
    : "failed";

  await updateMarketingJobStepStatus({
    stepId: toSafeString(args.publishStep.stepId),
    status: stepStatus,
    workerId: args.workerId,
    outputRef: {
      assetIds: [receiptAsset.assetId],
      publishLogIds: [publishLog.publishLogId],
    },
    meta: {
      publishMode: publishResult.mode,
      publishStatus: publishResult.status,
      finalUrl: publishResult.request.finalUrl,
      imageUrl: publishResult.request.imageUrl,
    },
    lastError: publishResult.ok ? null : publishResult.error,
    completedAt: new Date(),
  });

  return {
    stepStatus,
    publishStatus: publishResult.status,
    publishMode: publishResult.mode,
    publishLogId: publishLog.publishLogId,
    receiptAssetId: receiptAsset.assetId,
    finalUrl: publishResult.request.finalUrl,
    error: publishResult.ok ? null : publishResult.error,
  };
}

function summarizeJobAfterRewrite(args: { validCount: number; invalidCount: number; failedCount: number }) {
  if (args.validCount <= 0) {
    return {
      status: "failed" as const,
      lastError: {
        code: "REWRITE_FAILED",
        message: "모든 채널 초안 생성 또는 검증에 실패했습니다.",
      },
    };
  }

  if (args.invalidCount > 0 || args.failedCount > 0) {
    return {
      status: "partial" as const,
      lastError: {
        code: "REWRITE_PARTIAL",
        message: "일부 채널 초안이 검증 실패 또는 생성 실패 상태입니다.",
      },
    };
  }

  return {
    status: "waiting_review" as const,
    lastError: null,
  };
}

function buildLocalAgentInstructions(args: { channels: MarketingChannel[]; generationConfig: MarketingGenerationConfig }) {
  return {
    purpose:
      "Use the current local agent model to analyze the source article and generate channel drafts. Do not call node-app LLM APIs for this step.",
    submitAction: "submit_local_generation",
    generationConfig: {
      modelProvider: args.generationConfig.modelProvider,
      modelName: args.generationConfig.modelName,
      contentTemplateKey: args.generationConfig.contentTemplateKey,
      imageTemplateKey: args.generationConfig.imageTemplateKey,
      instructionText: args.generationConfig.instructionText,
      reviewMode: args.generationConfig.reviewMode,
      reviewRequired: args.generationConfig.reviewRequired,
    },
    output: {
      drafts: args.channels.map((channel) => ({
        channel,
        draftSchema: getMarketingChannelDraftSchemaExample(channel),
        validationSchema: {
          channel,
          valid: true,
          summary: "short summary",
          issues: ["blocking_issue_code"],
          warnings: ["non_blocking_warning_code"],
          score: 0,
          marketingFit: {
            kind: "marketing",
            channel,
            score: 0,
            verdict: "not_fit",
            signal: "red",
            summary: "short strategy-alignment summary",
            reasons: ["strategy-based reason"],
            recommendations: [{ action: "improvement", reason: "why" }],
            strategyVersion: 0,
          },
          adFit: {
            kind: "advertising",
            channel,
            score: 0,
            verdict: "not_fit",
            signal: "red",
            summary: "short advertising-reuse summary",
            reasons: ["strategy-based reason"],
            recommendations: [{ action: "improvement", reason: "why" }],
            strategyVersion: 0,
          },
          sourceCoverage: {
            usedSections: ["source.outline heading used as evidence"],
            usedTerms: ["exact source.keyTerms value copied in the draft"],
            usedQuotes: ["source.sourceQuotes excerpt used as evidence"],
            unsupportedClaims: [],
          },
          checks: {
            koreanProofread: {
              candidates: [
                {
                  type: "literal",
                  pattern: "suspicious Korean typo candidate",
                  expected: ["correction candidate"],
                  reason: "why this looks wrong",
                  channel,
                  field: "text",
                  context: "short surrounding text",
                },
              ],
            },
          },
        },
      })),
    },
    sourceContract: {
      primaryEvidence: ["source.outline", "source.sourceQuotes", "source.allowedClaims"],
      termAuthority: "source.keyTerms",
      fallbackOnly: ["source.excerptText"],
    },
    typoDictionary: {
      lookup: "Before writing, query list_typo_rules twice with this job universeId: once without status and once with status=active and limit=500. Continue through every page while truncated=true.",
      statusMeaning: {
        candidate: "review/reference only; does not block validation",
        active: "applied to the validation warning/blocking gate",
        ignored: "confirmed normal expression",
        disabled: "inactive historical rule",
      },
    },
    rules: [
      "Use structured source evidence first: select source.outline sections, source.sourceQuotes, or source.allowedClaims before writing channel copy.",
      "Do not base channel body copy on source.excerptText alone. Treat excerptText as fallback context only.",
      "Copy proper nouns and core terms from source.keyTerms exactly. Do not invent new core terms, names, metrics, or claims.",
      "For Threads, use only 1-2 sourceQuotes plus 1 allowedClaim unless the operator instruction explicitly asks for a series.",
      "Every validation object must include sourceCoverage.usedSections, sourceCoverage.usedTerms, and sourceCoverage.unsupportedClaims.",
      "Before writing, call get_content_fit_strategies for this universe and score marketingFit and adFit independently from channelFit using the returned strategy versions.",
      "Use 85-100=fit, 70-84=needs_work, 0-69=not_fit. Do not predict absolute reach, clicks, conversions, or revenue.",
      "For Naver Blog, verify the source topic matches the blog goal and registered marketing strategy before generating. Exclude the channel when it does not match instead of forcing a passing score.",
      "Set validation.valid=false when unsupportedClaims is not empty or when the draft cannot be traced to the structured source evidence.",
      "Keep canonical links unchanged.",
      "For Instagram, include semanticCards in the same generate_channel_copy response when the card-news downstream is enabled. Use 3-10 cards in cover/body/closing order; each card carries only role, copy slots, altText, and optional evidence.",
      "In Instagram semanticCards, copy source.genStudioImageAssetId into evidence.assetId when available. Otherwise use only an approved /api/proxy/image?url= reference; never return raw external image URLs.",
      "Do not emit x/y pixel coordinates, fontSize, fontFamily, arbitrary layout values, or raw asset URLs in semanticCards. The versioned Template Resolver owns geometry and fonts. This extends generate_channel_copy and does not require another AI call.",
      "Return each draft as structured JSON, not prose.",
      "Use validation.valid=false if the draft is not publishable.",
      "Run one Korean proofreading pass before submit. If you find a new suspicious typo that should be learned but is not enough to block the current draft after correction, add it to validation.checks.koreanProofread.candidates.",
      "Do not interpret an empty filtered typo-rule response as an empty global dictionary. Confirm the queried universeId, status, and channel.",
      "Do not add normal brand names, URLs, hashtags, or intentional quotes as Korean typo candidates.",
	      "Hashtags are metadata-only: put them in draft.hashtags (or Naver Blog draft.tags) and never include hashtag tokens in title, headline, body, text, caption, summary, plainText, html, cta, or reply text. The server blocks mixed copy fields.",
	      "Apply the operator instruction and content template key when they are present.",
      "Do not publish directly. Submit generated drafts for the required first review gate.",
    ],
  };
}

async function applySourceImageDefaults(args: {
  channel: MarketingChannel;
  draft: MarketingChannelDraft;
  sourceSnapshot: MarketingSourceSnapshot;
}) {
  const draft = normalizePlainTextSocialDraft(args.channel, args.draft);
  if (!["threads", "instagram", "linkedin"].includes(args.channel)) return draft;

  const imageUrl = await resolveMarketingPublishImage({
    draft,
    sourceSnapshot: args.sourceSnapshot,
  });
  const imageAssetId = toSafeString(draft.imageAssetId || args.sourceSnapshot.genStudioImageAssetId);
  const imageAlt = toSafeString(draft.imageAlt || args.sourceSnapshot.imageAlt);

  return {
    ...draft,
    ...(imageUrl && !toSafeString(draft.imageUrl) ? { imageUrl } : {}),
    ...(imageAssetId && !toSafeString(draft.imageAssetId) ? { imageAssetId } : {}),
    ...(imageAlt && !toSafeString(draft.imageAlt) ? { imageAlt } : {}),
  };
}

function normalizeSubmittedDrafts(values: unknown) {
  return (Array.isArray(values) ? values : [])
    .map((item) => {
      const record = toRecord(item);
      return {
        channel: toSafeString(record.channel) as MarketingChannel,
        draft: toRecord(record.draft),
        validation: toRecord(record.validation),
        excluded: record.excluded === true,
        exclusionReason: toSafeString(record.exclusionReason),
      };
    })
    .filter((item) => toSafeString(item.channel));
}

function findSubmittedDraft(drafts: ReturnType<typeof normalizeSubmittedDrafts>, channel: MarketingChannel) {
  return drafts.find((item) => toSafeString(item.channel) === channel);
}

function normalizeSubmittedSourceCoverage(agentReport: MarketingRecord, sourceSnapshot: MarketingSourceSnapshot) {
  const rawCoverage = toRecord(agentReport.sourceCoverage);
  const usedSections = toStringArray(rawCoverage.usedSections, 20);
  const usedTerms = toStringArray(rawCoverage.usedTerms, 30);
  const usedQuotes = toStringArray(rawCoverage.usedQuotes, 20);
  const unsupportedClaims = toStringArray(rawCoverage.unsupportedClaims, 20);
  const issues: string[] = [];
  const warnings: string[] = [];
  const hasStructuredEvidence =
    (sourceSnapshot.outline?.length || 0) > 0 ||
    (sourceSnapshot.sourceQuotes?.length || 0) > 0 ||
    (sourceSnapshot.allowedClaims?.length || 0) > 0;

  if (Object.keys(rawCoverage).length === 0) {
    issues.push("source_coverage_required");
  }

  if (hasStructuredEvidence && usedSections.length === 0 && usedQuotes.length === 0) {
    issues.push("source_evidence_trace_required");
  }

  if ((sourceSnapshot.keyTerms?.length || 0) > 0 && usedTerms.length === 0) {
    warnings.push("source_terms_not_reported");
  }

  if (unsupportedClaims.length > 0) {
    issues.push("unsupported_claims_present");
  }

  return {
    sourceCoverage: {
      usedSections,
      usedTerms,
      ...(usedQuotes.length ? { usedQuotes } : {}),
      unsupportedClaims,
    },
    issues,
    warnings,
  };
}

export async function prepareMarketingLocalAgentGeneration(args: {
  universeId: string;
  workerId: string;
  jobId?: string;
  queueCategory?: string;
  /** 에이전트 준비 경로는 기존 full_auto 설정을 외부 발행 권한으로 승격하지 않는다. */
  allowExternalPublish?: boolean;
}) {
  const client = await getRedisClient();
  await markMarketingWorkerHeartbeat({
    universeId: args.universeId,
    workerId: args.workerId,
  }).catch(() => null);
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const claimed = await claimMarketingWorkerJob({
    universeId: args.universeId,
    workerId: args.workerId,
    leaseTtlMs: LOCAL_AGENT_LEASE_TTL_MS,
    jobId: args.jobId,
    queueCategory: args.queueCategory,
  });

  if (claimed.status !== "claimed") {
    return claimed;
  }

  const jobId = claimed.jobId;
  const job = claimed.job;
  let keepLease = false;
  try {
    const storedGenerationConfig = getMarketingGenerationConfigFromJob(job);
    const generationConfig =
      args.allowExternalPublish === false
        ? { ...storedGenerationConfig, reviewRequired: true, reviewMode: "review_required" as const }
        : storedGenerationConfig;
    const scheduledAt = toDate(job.scheduledAt);
    if (scheduledAt && scheduledAt.getTime() > Date.now()) {
      await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => null);
      await moveBackToQueue(args.universeId, jobId);
      return {
        ok: true,
        status: "scheduled" as const,
        jobId,
        scheduledAt: scheduledAt.toISOString(),
      };
    }

    const initialSteps = await listMarketingJobSteps({ jobId, limit: 200 });
    const channels = toBridgeChannels(job.channels);
    const rewriteSteps = await ensureRewriteSteps({
      jobId,
      universeId: args.universeId,
      channels,
      steps: initialSteps,
    });
    const withThreadsPublish = await ensureThreadsPublishStep({
      jobId,
      universeId: args.universeId,
      channels,
      steps: rewriteSteps,
    });
    const steps = await ensureInstagramPublishStep({
      jobId,
      universeId: args.universeId,
      channels,
      steps: withThreadsPublish,
    });
    const normalizeStep = steps.find((step) => toSafeString(step.stepKey) === "normalize_target");
    const loadStep = steps.find((step) => toSafeString(step.stepKey) === "load_wp_content");

    await updateMarketingJobStatus({
      jobId,
      status: "running",
      currentStepKey: "normalize_target",
      startedAt: job.startedAt || new Date(),
      metrics: {
        ...(job.metrics || {}),
        localAgent: {
          workerId: args.workerId,
          status: "preparing",
          claimedAt: new Date().toISOString(),
          leaseTtlMs: LOCAL_AGENT_LEASE_TTL_MS,
        },
      },
    });

    if (normalizeStep?.stepId) {
      await updateMarketingJobStepStatus({
        stepId: normalizeStep.stepId,
        status: "success",
        workerId: args.workerId,
        outputRef: {
          normalized: true,
          slug: toSafeString(job.sourceRef?.slug),
          url: toSafeString(job.sourceRef?.url),
        },
        completedAt: new Date(),
      });
    }

    if (!loadStep?.stepId) {
      await updateMarketingJobStatus({
        jobId,
        status: "failed",
        currentStepKey: "load_wp_content",
        completedAt: new Date(),
        lastError: { code: "STEP_MISSING", message: "load_wp_content step is missing" },
      });
      await client.lrem(processingKey, 1, jobId);
      return {
        ok: false,
        status: "failed" as const,
        jobId,
        reason: "load_wp_content_step_missing",
      };
    }

    await updateMarketingJobStepStatus({
      stepId: loadStep.stepId,
      status: "running",
      workerId: args.workerId,
      startedAt: loadStep.startedAt || new Date(),
    });

    const embeddedSourceSnapshot = buildEmbeddedSourceSnapshot(job);
    const { shouldUseWp, post } = await loadAuthoritativeWpPost(job, embeddedSourceSnapshot);

    if (shouldUseWp && !post?.id) {
      await updateMarketingJobStepStatus({
        stepId: loadStep.stepId,
        status: "failed",
        workerId: args.workerId,
        lastError: { code: "WP_POST_NOT_FOUND", message: "포스트를 찾을 수 없습니다." },
        completedAt: new Date(),
      });
      await updateMarketingJobStatus({
        jobId,
        status: "failed",
        currentStepKey: "load_wp_content",
        completedAt: new Date(),
        lastError: { code: "WP_POST_NOT_FOUND", message: "포스트를 찾을 수 없습니다." },
      });
      await client.lrem(processingKey, 1, jobId);
      return {
        ok: false,
        status: "failed" as const,
        jobId,
        reason: "wp_post_not_found",
      };
    }

    const sourceSnapshot = post?.id ? buildSourceSnapshot(job, post) : embeddedSourceSnapshot;
    if (!sourceSnapshot) {
      await updateMarketingJobStepStatus({
        stepId: loadStep.stepId,
        status: "failed",
        workerId: args.workerId,
        lastError: { code: "SOURCE_SNAPSHOT_MISSING", message: "source snapshot is missing" },
        completedAt: new Date(),
      });
      await updateMarketingJobStatus({
        jobId,
        status: "failed",
        currentStepKey: "load_wp_content",
        completedAt: new Date(),
        lastError: { code: "SOURCE_SNAPSHOT_MISSING", message: "source snapshot is missing" },
      });
      await client.lrem(processingKey, 1, jobId);
      return {
        ok: false,
        status: "failed" as const,
        jobId,
        reason: "source_snapshot_missing",
      };
    }
    const sourceAsset = await createMarketingAsset({
      jobId,
      stepId: loadStep.stepId,
      universeId: args.universeId,
      kind: "source_snapshot",
      title: sourceSnapshot.title,
      mimeType: "application/json",
      content: sourceSnapshot,
      meta: {
        mode: "local_agent",
        workerId: args.workerId,
        sourceOrigin: post?.id ? (embeddedSourceSnapshot ? "wp_rehydrated" : "wp_cache") : "direct_snapshot",
        generationConfig,
      },
    });

    await updateMarketingJobStepStatus({
      stepId: loadStep.stepId,
      status: "success",
      workerId: args.workerId,
      outputRef: {
        assetId: sourceAsset.assetId,
        postId: Number(post?.id || sourceSnapshot.postId || 0) || undefined,
        slug: toSafeString(post?.slug || sourceSnapshot.slug),
      },
      completedAt: new Date(),
    });

    for (const channel of channels) {
      const generateStep = steps.find(
        (step) => toSafeString(step.stepKey) === "generate_channel_copy" && toSafeString(step.channel) === channel,
      );
      const validateStep = steps.find(
        (step) => toSafeString(step.stepKey) === "validate_output" && toSafeString(step.channel) === channel,
      );

      if (generateStep?.stepId) {
        await updateMarketingJobStepStatus({
          stepId: generateStep.stepId,
          status: "waiting_input",
          workerId: args.workerId,
          meta: {
            ...(generateStep.meta || {}),
            mode: "local_agent",
            sourceAssetId: sourceAsset.assetId,
            generationConfig,
          },
          startedAt: generateStep.startedAt || new Date(),
        });
      }

      if (validateStep?.stepId) {
        await updateMarketingJobStepStatus({
          stepId: validateStep.stepId,
          status: "waiting_input",
          workerId: args.workerId,
          meta: {
            ...(validateStep.meta || {}),
            mode: "local_agent",
            sourceAssetId: sourceAsset.assetId,
            generationConfig,
          },
        });
      }
    }

    const preparedAt = new Date().toISOString();
    await updateMarketingJobStatus({
      jobId,
      status: "running",
      currentStepKey: "generate_channel_copy",
      metrics: {
        ...(job.metrics || {}),
        localAgent: {
          workerId: args.workerId,
          status: "waiting_input",
          sourceSnapshotAssetId: sourceAsset.assetId,
          preparedAt,
          leaseTtlMs: LOCAL_AGENT_LEASE_TTL_MS,
        },
      },
    });

    keepLease = true;
    return {
      ok: true,
      status: "waiting_input" as const,
      mode: "local_agent" as const,
      jobId,
      universeId: args.universeId,
      workerId: args.workerId,
      sourceSnapshotAssetId: sourceAsset.assetId,
      source: sourceSnapshot,
      channels,
      generationConfig,
      instructions: buildLocalAgentInstructions({ channels, generationConfig }),
    };
  } finally {
    if (!keepLease) {
      await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => false);
    }
  }
}

export async function submitMarketingLocalAgentGeneration(args: {
  universeId: string;
  jobId: string;
  workerId: string;
  drafts: Array<{
    channel: string;
    draft?: Record<string, unknown>;
    validation?: Record<string, unknown>;
    excluded?: boolean;
    exclusionReason?: string;
  }>;
  modelName?: string;
  proofreadUid: string;
  proofreadRequestedBy: string;
  /** 에이전트 제출 경로는 기존 full_auto 설정으로 외부 발행하지 않는다. */
  allowExternalPublish?: boolean;
}) {
  const client = await getRedisClient();
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const jobId = toSafeString(args.jobId);
  const job = await getMarketingJobByJobId(jobId);
  if (!job) {
    return { ok: false, status: "missing_job" as const, jobId };
  }

  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false, status: "forbidden" as const, jobId };
  }

  if (isCanceledOrArchivedJob(job)) {
    await client.lrem(processingKey, 1, jobId);
    await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => false);
    return { ok: true, status: "canceled" as const, jobId };
  }

  const withThreadsPublish = await ensureThreadsPublishStep({
    jobId,
    universeId: args.universeId,
    channels: toBridgeChannels(job.channels),
    steps: await listMarketingJobSteps({ jobId, limit: 200 }),
  });
  const steps = await ensureInstagramPublishStep({
    jobId,
    universeId: args.universeId,
    channels: toBridgeChannels(job.channels),
    steps: withThreadsPublish,
  });
  const channels = toBridgeChannels(job.channels);
  const storedGenerationConfig = getMarketingGenerationConfigFromJob(job);
  const generationConfig =
    args.allowExternalPublish === false
      ? { ...storedGenerationConfig, reviewRequired: true, reviewMode: "review_required" as const }
      : storedGenerationConfig;
  const submittedDrafts = normalizeSubmittedDrafts(args.drafts);
  const sourceAssets = await listMarketingAssets({
    jobId,
    kind: "source_snapshot",
    limit: 20,
  });
  const metrics = toRecord(job.metrics);
  const localAgentMetrics = toRecord(metrics.localAgent);
  const sourceSnapshotAssetId = toSafeString(localAgentMetrics.sourceSnapshotAssetId || metrics.sourceSnapshotAssetId);
  const sourceAsset =
    sourceAssets.find((asset) => toSafeString(asset.assetId) === sourceSnapshotAssetId) || sourceAssets[0] || null;
  const sourceSnapshot = (sourceAsset?.content || {}) as MarketingSourceSnapshot;

  if (!sourceAsset?.assetId) {
    await updateMarketingJobStatus({
      jobId,
      status: "failed",
      currentStepKey: "load_wp_content",
      completedAt: new Date(),
      lastError: { code: "SOURCE_SNAPSHOT_MISSING", message: "source_snapshot asset is missing" },
    });
    return { ok: false, status: "failed" as const, jobId, reason: "source_snapshot_missing" };
  }

  let validCount = 0;
  let invalidCount = 0;
  let failedCount = 0;
  const channelDraftAssetIds: string[] = [];
  const validationAssetIds: string[] = [];
  const publishReceiptAssetIds: string[] = [];
  const publishLogIds: string[] = [];
  const channelStatusMap: Record<string, string> = {};
  let autoPublishFailure = false;
  let nextSteps = steps;
  const modelName = toSafeString(args.modelName) || generationConfig.modelName || "local-agent-selected-model";
  const isPatternNextActionJob = toSafeString(toRecord(job.request).trigger) === "intelligence_pattern_next_action";
  const reusablePatternAssetsByChannel = new Map<string, { draftAssetId: string; validationAssetId: string }>();
  if (isPatternNextActionJob) {
    const [existingDraftAssets, existingValidationAssets] = await Promise.all([
      listMarketingAssets({ jobId, kind: "channel_draft", state: "active", limit: 200 }),
      listMarketingAssets({ jobId, kind: "validation_report", state: "active", limit: 200 }),
    ]);
    const latestDraftByChannel = new Map<string, string>();
    for (const draftAsset of existingDraftAssets) {
      const channel = toSafeString(draftAsset.channel);
      if (channel && !latestDraftByChannel.has(channel)) latestDraftByChannel.set(channel, toSafeString(draftAsset.assetId));
    }
    for (const draftAsset of existingDraftAssets) {
      const channel = toSafeString(draftAsset.channel);
      const latestDraftAssetId = latestDraftByChannel.get(channel);
      const validation = existingValidationAssets.find(
        (asset) =>
          toSafeString(asset.channel) === channel &&
          toRecord(asset.content).valid === true &&
          toSafeString(toRecord(asset.meta).draftAssetId) === latestDraftAssetId,
      );
      if (
        channel &&
        latestDraftAssetId === toSafeString(draftAsset.assetId) &&
        validation?.assetId
      ) {
        reusablePatternAssetsByChannel.set(channel, {
          draftAssetId: latestDraftAssetId,
          validationAssetId: toSafeString(validation.assetId),
        });
      }
    }
  }

  for (const channel of channels) {
    const generateStep = nextSteps.find(
      (step) => toSafeString(step.stepKey) === "generate_channel_copy" && toSafeString(step.channel) === channel,
    );
    const validateStep = nextSteps.find(
      (step) => toSafeString(step.stepKey) === "validate_output" && toSafeString(step.channel) === channel,
    );
    const publishStep =
      channel === "threads"
        ? nextSteps.find(
            (step) => toSafeString(step.stepKey) === "publish_threads" && toSafeString(step.channel) === "threads",
          )
        : channel === "instagram"
          ? nextSteps.find(
              (step) => toSafeString(step.stepKey) === "publish_instagram" && toSafeString(step.channel) === "instagram",
            )
        : null;

    if (!generateStep?.stepId || !validateStep?.stepId) {
      failedCount += 1;
      channelStatusMap[channel] = "missing_step";
      continue;
    }

    const reusablePatternAssets = reusablePatternAssetsByChannel.get(channel);
    if (reusablePatternAssets) {
      channelDraftAssetIds.push(reusablePatternAssets.draftAssetId);
      validationAssetIds.push(reusablePatternAssets.validationAssetId);
      validCount += 1;
      channelStatusMap[channel] = "waiting_review";
      continue;
    }

    const submitted = findSubmittedDraft(submittedDrafts, channel);
    if (submitted?.excluded) {
      const exclusionReason = submitted.exclusionReason || "registered_strategy_not_fit";
      const excludedAt = new Date();
      const draftAsset = await createMarketingAsset({
        jobId,
        stepId: generateStep.stepId,
        universeId: args.universeId,
        kind: "channel_draft",
        channel,
        title: `${channel} excluded draft marker`,
        mimeType: "application/json",
        content: { channel, excluded: true, exclusionReason },
        meta: { provider: "local_agent", executionProvider: "mcp_client", excludedAt },
      });
      const validationReport = {
        channel,
        valid: false,
        summary: exclusionReason,
        issues: ["strategy_not_fit_excluded"],
        warnings: [],
        score: 0,
        ...submitted.validation,
        excluded: true,
        exclusionReason,
      };
      const validationAsset = await createMarketingAsset({
        jobId,
        stepId: validateStep.stepId,
        universeId: args.universeId,
        kind: "validation_report",
        channel,
        title: `${channel} exclusion report`,
        mimeType: "application/json",
        content: validationReport,
        meta: { provider: "local_agent", executionProvider: "mcp_client", excludedAt },
      });
      channelDraftAssetIds.push(draftAsset.assetId);
      validationAssetIds.push(validationAsset.assetId);
      validCount += 1;
      channelStatusMap[channel] = "skipped";
      await Promise.all([
        updateMarketingJobStepStatus({ stepId: generateStep.stepId, status: "skipped", workerId: args.workerId, completedAt: excludedAt }),
        updateMarketingJobStepStatus({ stepId: validateStep.stepId, status: "skipped", workerId: args.workerId, completedAt: excludedAt }),
      ]);
      const reviewStepKey = channel === "linkedin"
        ? "prepare_linkedin_draft"
        : channel === "naver_blog"
          ? "prepare_naver_draft"
          : channel === "threads"
            ? "publish_threads"
            : "publish_instagram";
      const reviewStep = nextSteps.find(
        (step) => toSafeString(step.stepKey) === reviewStepKey && toSafeString(step.channel) === channel,
      );
      if (reviewStep?.stepId) {
        await updateMarketingJobStepStatus({ stepId: reviewStep.stepId, status: "skipped", completedAt: excludedAt });
      }
      const publishLog = await createMarketingPublishLog({
        universeId: args.universeId,
        jobId,
        stepId: toSafeString(reviewStep?.stepId || validateStep.stepId),
        channel,
        status: "skipped",
        request: { action: "exclude_before_generation", reason: exclusionReason },
        response: { validation: validationReport },
        completedBy: args.workerId,
        completedAt: excludedAt,
      });
      publishLogIds.push(publishLog.publishLogId);
      continue;
    }
    if (!submitted?.draft || Object.keys(submitted.draft).length === 0) {
      failedCount += 1;
      channelStatusMap[channel] = "missing_draft";
      await updateMarketingJobStepStatus({
        stepId: generateStep.stepId,
        status: "failed",
        workerId: args.workerId,
        lastError: { code: "LOCAL_AGENT_DRAFT_MISSING", message: `${channel} draft is missing` },
        completedAt: new Date(),
      });
      await updateMarketingJobStepStatus({
        stepId: validateStep.stepId,
        status: "failed",
        workerId: args.workerId,
        lastError: { code: "LOCAL_AGENT_DRAFT_MISSING", message: `${channel} draft is missing` },
        completedAt: new Date(),
      });
      continue;
    }

    const draftPayload = await applySourceImageDefaults({
      channel,
      sourceSnapshot,
      draft: {
      ...submitted.draft,
      channel,
      } as MarketingChannelDraft,
    });

    await updateMarketingJobStepStatus({
      stepId: generateStep.stepId,
      status: "running",
      workerId: args.workerId,
      startedAt: generateStep.startedAt || new Date(),
    });

    const rawText = JSON.stringify({ draft: draftPayload, validation: submitted.validation || null }, null, 2);
    const stdoutAsset = await createTextAsset({
      jobId,
      stepId: generateStep.stepId,
      universeId: args.universeId,
      kind: "cli_stdout",
      channel,
      title: `${channel} local agent output`,
      text: rawText,
      meta: {
        provider: "local_agent",
        executionProvider: "mcp_client",
        modelName,
        generationConfig,
      },
    });

    const draftAsset = await createMarketingAsset({
      jobId,
      stepId: generateStep.stepId,
      universeId: args.universeId,
      kind: "channel_draft",
      channel,
      title: `${channel} draft`,
      mimeType: "application/json",
      content: draftPayload,
      meta: {
        provider: "local_agent",
        executionProvider: "mcp_client",
        executionKind: "mcp",
        modelName,
        generationConfig,
        sourceAssetId: sourceAsset.assetId,
        stdoutAssetId: stdoutAsset.assetId,
      },
    });

    channelDraftAssetIds.push(draftAsset.assetId);

    await updateMarketingJobStepStatus({
      stepId: generateStep.stepId,
      status: "success",
      workerId: args.workerId,
      outputRef: {
        assetIds: [draftAsset.assetId, stdoutAsset.assetId],
      },
      meta: {
        engine: {
          provider: "local_agent",
          executionProvider: "mcp_client",
          executionKind: "mcp",
          modelName,
        },
      },
      completedAt: new Date(),
    });

    await updateMarketingJobStepStatus({
      stepId: validateStep.stepId,
      status: "running",
      workerId: args.workerId,
      startedAt: validateStep.startedAt || new Date(),
    });

    const staticReport = validateMarketingChannelDraft(channel, draftPayload as Record<string, unknown>);
    const agentReport = submitted.validation || {};
    const typoRuleReport = await validateDraftAgainstActiveTypoRules({
      universeId: args.universeId,
      channel,
      draft: draftPayload,
    });
    const draftDigest = createMarketingDraftDigest(draftPayload as Record<string, unknown>);
    const previousChannelAssets = await listMarketingAssets({ jobId, channel, kind: "validation_report", limit: 20 });
    const reusableIndependentProofread = previousChannelAssets
      .map((asset) => toRecord(toRecord(asset.content).checks).independentProofread)
      .map(toRecord)
      .find((check) =>
        toSafeString(check.draftDigest) === draftDigest && ["passed", "failed"].includes(toSafeString(check.status)),
      );
    const runIndependentProofread = () => runIndependentMarketingProofread({
      uid: args.proofreadUid,
      universeId: args.universeId,
      jobId,
      channel,
      draft: draftPayload as Record<string, unknown>,
      requestedBy: args.proofreadRequestedBy,
      source: "local_agent",
    });
    const independentProofread = reusableIndependentProofread?.draftDigest
      ? reusableIndependentProofread
      : await runIndependentProofread()
        .catch((error: unknown) => {
          const code = error instanceof Error ? error.message : String(error);
          if (
            code === "independent_proofread_response_invalid" ||
            code === "independent_proofread_response_inconsistent"
          ) {
            return runIndependentProofread();
          }
          throw error;
        })
        .catch((error: unknown) => ({
          policyVersion: 1,
          status: "unavailable",
          valid: false,
          provider: "google",
          modelName: "gemini-3.5-flash-lite",
          checkedAt: new Date().toISOString(),
          draftDigest: "",
          findings: [],
          issues: [error instanceof Error ? error.message : "independent_proofread_unavailable"],
          warnings: [],
          usage: null,
          coins: 0,
        }));
    const typoCandidateDocs = await recordTypoCandidatesFromValidation({
      universeId: args.universeId,
      jobId,
      channel,
      validation: agentReport,
      createdBy: args.workerId,
      modelName,
    });
    const sourceCoverageReport = normalizeSubmittedSourceCoverage(agentReport, sourceSnapshot);
    const issues = Array.from(
      new Set([
        ...staticReport.issues,
        ...toStringArray(agentReport.issues, 20),
        ...sourceCoverageReport.issues,
        ...typoRuleReport.issues,
        ...toStringArray(independentProofread.issues, 20),
      ]),
    );
    const warnings = Array.from(
      new Set([
        ...(staticReport.warnings || []),
        ...toStringArray(agentReport.warnings, 20),
        ...sourceCoverageReport.warnings,
        ...typoRuleReport.warnings,
        ...toStringArray(independentProofread.warnings, 20),
      ]),
    );
    const valid =
      staticReport.valid &&
      sourceCoverageReport.issues.length === 0 &&
      typoRuleReport.valid &&
      independentProofread.valid === true &&
      (typeof agentReport.valid === "boolean" ? agentReport.valid : true);
    const validationReport = {
      channel,
      valid,
      summary:
        toSafeString(agentReport.summary) ||
        (valid ? "로컬 에이전트/기본 검증을 통과했습니다." : "로컬 에이전트/기본 검증에서 수정이 필요한 항목이 있습니다."),
      issues,
      warnings,
      score: Math.max(0, Math.min(100, Number(agentReport.score ?? staticReport.score ?? (valid ? 85 : 45)) || 0)),
      channelFit: agentReport.channelFit || staticReport.channelFit,
      impactScore: agentReport.impactScore || staticReport.impactScore,
      marketingFit: agentReport.marketingFit || null,
      adFit: agentReport.adFit || null,
      sourceCoverage: sourceCoverageReport.sourceCoverage,
      checks: {
        static: staticReport,
        localAgent: submitted.validation || null,
        koreanTypoRules: typoRuleReport,
        independentProofread,
        recordedTypoCandidates: typoCandidateDocs.map((doc) => ({
          ruleId: doc.ruleId,
          status: doc.status,
          pattern: doc.pattern,
          occurrenceCount: doc.occurrenceCount,
        })),
      },
    };

    const validationAsset = await createMarketingAsset({
      jobId,
      stepId: validateStep.stepId,
      universeId: args.universeId,
      kind: "validation_report",
      channel,
      title: `${channel} validation report`,
      mimeType: "application/json",
      content: validationReport,
      meta: {
        provider: "local_agent",
        executionProvider: "mcp_client",
        executionKind: "mcp",
        modelName,
        draftAssetId: draftAsset.assetId,
      },
    });

    validationAssetIds.push(validationAsset.assetId);

    await updateMarketingJobStepStatus({
      stepId: validateStep.stepId,
      status: valid ? "success" : "failed",
      workerId: args.workerId,
      outputRef: {
        assetIds: [validationAsset.assetId],
      },
	      meta: {
	        schema: staticReport,
	        localAgent: submitted.validation || null,
	        koreanTypoRules: typoRuleReport,
	        independentProofread,
	      },
      lastError: valid
        ? null
        : {
            code: "VALIDATION_FAILED",
            message: issues.join(", ") || "validation_failed",
          },
      completedAt: new Date(),
    });

    if (valid) {
      validCount += 1;
      if (channel === "linkedin" || channel === "naver_blog") {
        const reviewStep = await ensureManualReviewStep({
          jobId,
          universeId: args.universeId,
          channel,
          steps: nextSteps,
          assetIds: [draftAsset.assetId, validationAsset.assetId],
        });

        nextSteps = nextSteps.some((step) => toSafeString(step.stepId) === toSafeString(reviewStep.stepId))
          ? nextSteps
          : [...nextSteps, reviewStep];
        channelStatusMap[channel] = "waiting_review";
      } else if (channel === "threads" && publishStep?.stepId && generationConfig.reviewRequired) {
        await ensureThreadsReviewStep({
          publishStep,
          workerId: args.workerId,
          assetIds: [draftAsset.assetId, validationAsset.assetId],
          generationConfig,
        });
        channelStatusMap[channel] = "waiting_review";
      } else if (channel === "instagram" && publishStep?.stepId && generationConfig.reviewRequired) {
        await ensureInstagramReviewStep({
          publishStep,
          workerId: args.workerId,
          assetIds: [draftAsset.assetId, validationAsset.assetId],
          generationConfig,
        });
        channelStatusMap[channel] = "waiting_review";
      } else {
        channelStatusMap[channel] = "validated";
      }
    } else {
      invalidCount += 1;
      channelStatusMap[channel] = "validation_failed";
    }

    if (channel === "threads" && valid && publishStep?.stepId && !generationConfig.reviewRequired) {
      const publishSummary = await publishThreadsStep({
        universeId: args.universeId,
        workerId: args.workerId,
        jobId,
        job,
        sourceSnapshot,
        sourceAssetId: sourceAsset.assetId,
        generateStep,
        validateStep,
        publishStep,
        draftPayload,
      });

      publishReceiptAssetIds.push(publishSummary.receiptAssetId);
      publishLogIds.push(publishSummary.publishLogId);
      channelStatusMap.threads = publishSummary.publishStatus;
      if (publishSummary.publishStatus === "failed") {
        autoPublishFailure = true;
      }
    }

    if (channel === "instagram" && valid && publishStep?.stepId && !generationConfig.reviewRequired) {
      const publishSummary = await publishInstagramStep({
        universeId: args.universeId,
        workerId: args.workerId,
        jobId,
        job,
        sourceSnapshot,
        sourceAssetId: sourceAsset.assetId,
        generateStep,
        validateStep,
        publishStep,
        draftPayload,
      });

      publishReceiptAssetIds.push(publishSummary.receiptAssetId);
      publishLogIds.push(publishSummary.publishLogId);
      channelStatusMap.instagram = publishSummary.publishStatus;
      if (publishSummary.publishStatus === "failed") {
        autoPublishFailure = true;
      }
    }
  }

  const nextJobState = summarizeJobAfterRewrite({ validCount, invalidCount, failedCount });
  const nextCurrentStepKey =
    channelStatusMap.linkedin === "waiting_review"
      ? "prepare_linkedin_draft"
      : channelStatusMap.naver_blog === "waiting_review"
        ? "prepare_naver_draft"
        : channelStatusMap.threads
          ? "publish_threads"
          : channelStatusMap.instagram
            ? "publish_instagram"
          : "validate_output";
  const finalStatus =
    nextJobState.status === "waiting_review" && !autoPublishFailure
      ? "waiting_review"
      : autoPublishFailure && validCount > 0
        ? "partial"
        : nextJobState.status;
  const finalError =
    autoPublishFailure && finalStatus === "partial"
      ? {
          code: "AUTO_PUBLISH_PARTIAL",
          message: "자동 발행에 실패했지만 다른 채널 draft는 준비되었습니다.",
        }
      : nextJobState.lastError;

  await updateMarketingJobStatus({
    jobId,
    status: finalStatus,
    currentStepKey: nextCurrentStepKey,
    completedAt: new Date(),
    lastError: finalError,
    metrics: {
      ...(job.metrics || {}),
      localAgent: {
        ...(job.metrics?.localAgent || {}),
        workerId: args.workerId,
        status: "submitted",
        modelName,
        submittedAt: new Date().toISOString(),
      },
      sourceSnapshotAssetId: sourceAsset.assetId,
      channelDraftAssetIds,
      validationAssetIds,
      publishReceiptAssetIds,
      publishLogIds,
      channelStatusMap,
      rewriteSummary: {
        validCount,
        invalidCount,
        failedCount,
      },
    },
  });

  await updateInventoryRewriteStatusFromJob({
    universeId: args.universeId,
    job,
    status: finalStatus === "failed" ? "failed" : finalStatus === "waiting_review" ? "waiting_review" : "drafted",
    jobId,
  });

  await sendMarketingSlackNotification({
    universeId: args.universeId,
    jobId,
    event: finalStatus === "failed" ? "job_failed" : finalStatus === "partial" ? "job_partial" : "waiting_review",
    postTitle: sourceSnapshot.title,
    postUrl: sourceSnapshot.url,
    channels: {
      threads: channelStatusMap.threads || "skipped",
      instagram: channelStatusMap.instagram || "skipped",
      linkedin: channelStatusMap.linkedin || "waiting_review",
      naver_blog: channelStatusMap.naver_blog || "waiting_review",
    },
    summary:
      finalStatus === "waiting_review"
        ? "로컬 에이전트가 채널 draft 생성/검증을 완료했고, 운영자 검토가 필요한 채널이 남아 있습니다."
        : finalError?.message || "마케팅 job 상태를 확인하세요.",
  }).catch(() => null);

  await client.lrem(processingKey, 1, jobId);
  await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => false);

  return {
    ok: true,
    status: "processed" as const,
    mode: "local_agent" as const,
    jobId,
    universeId: args.universeId,
    rewriteSummary: {
      validCount,
      invalidCount,
      failedCount,
    },
    channelStatusMap,
  };
}

export async function prepareMarketingLocalAgentGenerationAcrossUniverses(args: {
  universeIds: string[];
  workerId: string;
  queueCategory?: string;
  allowExternalPublish?: boolean;
}) {
  const universeIds = Array.from(new Set((args.universeIds || []).map((value) => toSafeString(value)).filter(Boolean)));
  if (universeIds.length === 0) {
    return {
      ok: true,
      status: "idle" as const,
      scope: "global" as const,
      universeId: "",
    };
  }

  for (const universeId of universeIds) {
    const result = await prepareMarketingLocalAgentGeneration({
      universeId,
      workerId: args.workerId,
      queueCategory: args.queueCategory,
      allowExternalPublish: args.allowExternalPublish,
    });

    if (toSafeString(result.status) !== "idle") {
      return {
        ...result,
        scope: "global" as const,
        universeId,
      };
    }
  }

  return {
    ok: true,
    status: "idle" as const,
    scope: "global" as const,
    universeId: "",
  };
}

export async function pollMarketingDryRunWorker(args: {
  universeId: string;
  workerId: string;
  billingUid?: string;
  jobId?: string;
  queueCategory?: string;
  scheduledOnly?: boolean;
  /** 에이전트 polling은 예약 발행을 실행하지 않고 draft 생성까지만 수행한다. */
  allowScheduledPublish?: boolean;
  /** 에이전트 polling은 기존 full_auto 작업도 외부 채널에 발행하지 않는다. */
  allowExternalPublish?: boolean;
}) {
  const client = await getRedisClient();
  await markMarketingWorkerHeartbeat({
    universeId: args.universeId,
    workerId: args.workerId,
  }).catch(() => null);
  if (!args.jobId && args.allowScheduledPublish !== false) {
    const scheduledPublish = await publishDueMarketingChannelActions({
      universeId: args.universeId,
      workerId: args.workerId,
    });
    if (scheduledPublish.status !== "idle") {
      return scheduledPublish;
    }
  }
  if (args.scheduledOnly) {
    return {
      ok: true,
      status: "idle" as const,
      scheduledOnly: true,
    };
  }
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const claimed = await claimMarketingWorkerJob({
    universeId: args.universeId,
    workerId: args.workerId,
    jobId: args.jobId,
    queueCategory: args.queueCategory,
  });

  if (claimed.status !== "claimed") {
    return claimed;
  }

  const jobId = claimed.jobId;
  const job = claimed.job;
  try {
    const storedGenerationConfig = getMarketingGenerationConfigFromJob(job);
    // 기존에 관리자가 만든 full_auto job을 에이전트가 jobId로 집어도
    // 외부 채널 발행 경로에 도달하지 않도록 호출자 권한으로 검수 대기를 강제한다.
    const generationConfig =
      args.allowExternalPublish === false
        ? { ...storedGenerationConfig, reviewRequired: true, reviewMode: "review_required" as const }
        : storedGenerationConfig;
    const scheduledAt = toDate(job.scheduledAt);
    if (scheduledAt && scheduledAt.getTime() > Date.now()) {
      await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => null);
      await moveBackToQueue(args.universeId, jobId);
      return {
        ok: true,
        status: "scheduled" as const,
        jobId,
        scheduledAt: scheduledAt.toISOString(),
      };
    }
    if (generationConfig.generationMode === "local_agent") {
      await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => null);
      await moveBackToQueue(args.universeId, jobId);
      return {
        ok: true,
        status: "local_agent_required" as const,
        jobId,
      };
    }

    const billingUid = toSafeString(args.billingUid);
    const generationRequestKey =
      toSafeString(job.request?.generationRequestedAt) || toSafeString(job.updatedAt) || "initial";
    const billingOperationBase = `marketing:${toOperationSegment(jobId)}:${toOperationSegment(generationRequestKey)}`;

    const initialSteps = await listMarketingJobSteps({ jobId, limit: 200 });
    const channels = toBridgeChannels(job.channels);
    const rewriteSteps = await ensureRewriteSteps({
      jobId,
      universeId: args.universeId,
      channels,
      steps: initialSteps,
    });
    const withThreadsPublish = await ensureThreadsPublishStep({
      jobId,
      universeId: args.universeId,
      channels,
      steps: rewriteSteps,
    });
    let steps = await ensureInstagramPublishStep({
      jobId,
      universeId: args.universeId,
      channels,
      steps: withThreadsPublish,
    });
    const normalizeStep = steps.find((step) => toSafeString(step.stepKey) === "normalize_target");
    const loadStep = steps.find((step) => toSafeString(step.stepKey) === "load_wp_content");

    await updateMarketingJobStatus({
      jobId,
      status: "running",
      currentStepKey: "normalize_target",
      startedAt: job.startedAt || new Date(),
      metrics: {
        ...(job.metrics || {}),
        lastDryRunWorkerId: args.workerId,
      },
    });

    if (normalizeStep?.stepId) {
      await updateMarketingJobStepStatus({
        stepId: normalizeStep.stepId,
        status: "running",
        workerId: args.workerId,
        startedAt: normalizeStep.startedAt || new Date(),
      });
      await updateMarketingJobStepStatus({
        stepId: normalizeStep.stepId,
        status: "success",
        workerId: args.workerId,
        outputRef: {
          normalized: true,
          slug: toSafeString(job.sourceRef?.slug),
          url: toSafeString(job.sourceRef?.url),
        },
        completedAt: new Date(),
      });
    }

    if (!loadStep?.stepId) {
      await updateMarketingJob({
        jobId,
        set: {
          status: "failed",
          currentStepKey: "load_wp_content",
          completedAt: new Date(),
          lastError: { code: "STEP_MISSING", message: "load_wp_content step is missing" },
        },
      });
      await client.lrem(processingKey, 1, jobId);
      return {
        ok: false,
        status: "failed" as const,
        jobId,
        reason: "load_wp_content_step_missing",
      };
    }

    await updateMarketingJobStepStatus({
      stepId: loadStep.stepId,
      status: "running",
      workerId: args.workerId,
      startedAt: loadStep.startedAt || new Date(),
    });

    const embeddedSourceSnapshot = buildEmbeddedSourceSnapshot(job);
    const { shouldUseWp, post } = await loadAuthoritativeWpPost(job, embeddedSourceSnapshot);

    if (shouldUseWp && !post?.id) {
      await updateMarketingJobStepStatus({
        stepId: loadStep.stepId,
        status: "failed",
        workerId: args.workerId,
        lastError: { code: "WP_POST_NOT_FOUND", message: "포스트를 찾을 수 없습니다." },
        completedAt: new Date(),
      });
      await updateMarketingJobStatus({
        jobId,
        status: "failed",
        currentStepKey: "load_wp_content",
        completedAt: new Date(),
        lastError: { code: "WP_POST_NOT_FOUND", message: "포스트를 찾을 수 없습니다." },
      });
      await client.lrem(processingKey, 1, jobId);
      return {
        ok: false,
        status: "failed" as const,
        jobId,
        reason: "wp_post_not_found",
      };
    }

    const sourceSnapshot = post?.id ? buildSourceSnapshot(job, post) : embeddedSourceSnapshot;
    if (!sourceSnapshot) {
      await updateMarketingJobStepStatus({
        stepId: loadStep.stepId,
        status: "failed",
        workerId: args.workerId,
        lastError: { code: "SOURCE_SNAPSHOT_MISSING", message: "source snapshot is missing" },
        completedAt: new Date(),
      });
      await updateMarketingJobStatus({
        jobId,
        status: "failed",
        currentStepKey: "load_wp_content",
        completedAt: new Date(),
        lastError: { code: "SOURCE_SNAPSHOT_MISSING", message: "source snapshot is missing" },
      });
      await client.lrem(processingKey, 1, jobId);
      return {
        ok: false,
        status: "failed" as const,
        jobId,
        reason: "source_snapshot_missing",
      };
    }
    const sourceAsset = await createMarketingAsset({
      jobId,
      stepId: loadStep.stepId,
      universeId: args.universeId,
      kind: "source_snapshot",
      title: sourceSnapshot.title,
      mimeType: "application/json",
      content: sourceSnapshot,
      meta: {
        dryRun: true,
        workerId: args.workerId,
        sourceOrigin: post?.id ? (embeddedSourceSnapshot ? "wp_rehydrated" : "wp_cache") : "direct_snapshot",
        generationConfig,
      },
    });

    await updateMarketingJobStepStatus({
      stepId: loadStep.stepId,
      status: "success",
      workerId: args.workerId,
      outputRef: {
        assetId: sourceAsset.assetId,
        postId: Number(post?.id || sourceSnapshot.postId || 0) || undefined,
        slug: toSafeString(post?.slug || sourceSnapshot.slug),
      },
      completedAt: new Date(),
    });

    let validCount = 0;
    let invalidCount = 0;
    let failedCount = 0;
    const channelDraftAssetIds: string[] = [];
    const validationAssetIds: string[] = [];
    const publishReceiptAssetIds: string[] = [];
    const publishLogIds: string[] = [];
    const channelStatusMap: Record<string, string> = {};
    let autoPublishFailure = false;

    for (const channel of channels) {
      const generateStep = steps.find(
        (step) => toSafeString(step.stepKey) === "generate_channel_copy" && toSafeString(step.channel) === channel,
      );
      const validateStep = steps.find(
        (step) => toSafeString(step.stepKey) === "validate_output" && toSafeString(step.channel) === channel,
      );
      const publishStep =
        channel === "threads"
          ? steps.find(
              (step) => toSafeString(step.stepKey) === "publish_threads" && toSafeString(step.channel) === "threads",
            )
          : channel === "instagram"
            ? steps.find(
                (step) => toSafeString(step.stepKey) === "publish_instagram" && toSafeString(step.channel) === "instagram",
              )
          : null;

      if (!generateStep?.stepId || !validateStep?.stepId) {
        failedCount += 1;
        channelStatusMap[channel] = "missing_step";
        continue;
      }

      try {
        await updateMarketingJobStepStatus({
          stepId: generateStep.stepId,
          status: "running",
          workerId: args.workerId,
          startedAt: generateStep.startedAt || new Date(),
        });

        const draftBridge = await runMarketingBridge({
          task: "channel_draft",
          channel,
          source: sourceSnapshot,
          generationConfig,
          billing: {
            uid: billingUid,
            app: "ai_marketing_channel_draft",
            operationId: `${billingOperationBase}:draft:${toOperationSegment(channel)}`,
            meta: {
              route: "marketing/worker/channel-draft",
              universeId: args.universeId,
              jobId,
              channel,
              workerId: args.workerId,
            },
          },
        });

        const draftStdoutAsset = await createTextAsset({
          jobId,
          stepId: generateStep.stepId,
          universeId: args.universeId,
          kind: "cli_stdout",
          channel,
          title: `${channel} draft stdout`,
          text: draftBridge.rawText,
          meta: {
            provider: draftBridge.provider,
            executionProvider: draftBridge.executionProvider,
            modelName: draftBridge.modelName,
            commandPreview: draftBridge.commandPreview,
            generationConfig,
          },
        });

        const draftPayload = await applySourceImageDefaults({
          channel,
          sourceSnapshot,
          draft: {
          ...draftBridge.payload,
          channel,
          } as MarketingChannelDraft,
        });

        const draftAsset = await createMarketingAsset({
          jobId,
          stepId: generateStep.stepId,
          universeId: args.universeId,
          kind: "channel_draft",
          channel,
          title: `${channel} draft`,
          mimeType: "application/json",
          content: draftPayload,
          meta: {
            provider: draftBridge.provider,
            executionProvider: draftBridge.executionProvider,
            executionKind: draftBridge.executionKind,
            modelName: draftBridge.modelName,
            commandPreview: draftBridge.commandPreview,
            usage: draftBridge.usage,
            sourceAssetId: sourceAsset.assetId,
            stdoutAssetId: draftStdoutAsset.assetId,
            generationConfig,
          },
        });

        channelDraftAssetIds.push(draftAsset.assetId);

        await updateMarketingJobStepStatus({
          stepId: generateStep.stepId,
          status: "success",
          workerId: args.workerId,
          outputRef: {
            assetIds: [draftAsset.assetId, draftStdoutAsset.assetId],
          },
          meta: {
            engine: {
              provider: draftBridge.provider,
              executionProvider: draftBridge.executionProvider,
              executionKind: draftBridge.executionKind,
              modelName: draftBridge.modelName,
              commandPreview: draftBridge.commandPreview,
            },
            usage: draftBridge.usage,
          },
          completedAt: new Date(),
        });

        await updateMarketingJobStepStatus({
          stepId: validateStep.stepId,
          status: "running",
          workerId: args.workerId,
          startedAt: validateStep.startedAt || new Date(),
        });

        let validationBridge: Awaited<ReturnType<typeof runMarketingBridge>> | null = null;
        let validationStdoutAssetId = "";
        let validationStderrAssetId = "";

        try {
          validationBridge = await runMarketingBridge({
            task: "validation",
            channel,
            source: sourceSnapshot,
            draft: draftPayload,
            generationConfig,
            billing: {
              uid: billingUid,
              app: "ai_marketing_validation",
              operationId: `${billingOperationBase}:validation:${toOperationSegment(channel)}`,
              meta: {
                route: "marketing/worker/validation",
                universeId: args.universeId,
                jobId,
                channel,
                workerId: args.workerId,
              },
            },
          });

          const validationStdoutAsset = await createTextAsset({
            jobId,
            stepId: validateStep.stepId,
            universeId: args.universeId,
            kind: "cli_stdout",
            channel,
            title: `${channel} validation stdout`,
            text: validationBridge.rawText,
            meta: {
              provider: validationBridge.provider,
              executionProvider: validationBridge.executionProvider,
              modelName: validationBridge.modelName,
              commandPreview: validationBridge.commandPreview,
            },
          });

          validationStdoutAssetId = validationStdoutAsset.assetId;
        } catch (error: unknown) {
          const validationStderrAsset = await createTextAsset({
            jobId,
            stepId: validateStep.stepId,
            universeId: args.universeId,
            kind: "cli_stderr",
            channel,
            title: `${channel} validation stderr`,
            text: toSafeString(getErrorMessage(error)) || "validation_bridge_failed",
            meta: {
              source: "validation_bridge",
            },
          });

          validationStderrAssetId = validationStderrAsset.assetId;
        }

        const staticReport = validateMarketingChannelDraft(channel, draftPayload as Record<string, unknown>);
        const aiReport = validationBridge?.payload || {};
        const typoRuleReport = await validateDraftAgainstActiveTypoRules({
          universeId: args.universeId,
          channel,
          draft: draftPayload,
        });
        const typoCandidateDocs = await recordTypoCandidatesFromValidation({
          universeId: args.universeId,
          jobId,
          channel,
          validation: aiReport,
          createdBy: args.workerId,
          modelName: validationBridge?.modelName || "",
        });
        const issues = Array.from(
          new Set([...staticReport.issues, ...toStringArray(aiReport.issues, 20), ...typoRuleReport.issues]),
        );
        const warnings = Array.from(
          new Set([...(staticReport.warnings || []), ...toStringArray(aiReport.warnings, 20), ...typoRuleReport.warnings]),
        );
        const valid = staticReport.valid && typoRuleReport.valid && (typeof aiReport.valid === "boolean" ? aiReport.valid : true);
        const validationReport = {
          channel,
          valid,
          summary:
            toSafeString(aiReport.summary) ||
            (valid ? "기본/AI 검증을 통과했습니다." : "기본/AI 검증에서 수정이 필요한 항목이 있습니다."),
          issues,
          warnings,
          score: Math.max(
            0,
            Math.min(100, Number(aiReport.score ?? staticReport.score ?? (valid ? 85 : 45)) || 0),
          ),
          channelFit: aiReport.channelFit || staticReport.channelFit,
          impactScore: aiReport.impactScore || staticReport.impactScore,
          marketingFit: aiReport.marketingFit || null,
          adFit: aiReport.adFit || null,
          checks: {
            static: staticReport,
            ai: validationBridge?.payload || null,
            koreanTypoRules: typoRuleReport,
            recordedTypoCandidates: typoCandidateDocs.map((doc) => ({
              ruleId: doc.ruleId,
              status: doc.status,
              pattern: doc.pattern,
              occurrenceCount: doc.occurrenceCount,
            })),
          },
        };

        const validationAsset = await createMarketingAsset({
          jobId,
          stepId: validateStep.stepId,
          universeId: args.universeId,
          kind: "validation_report",
          channel,
          title: `${channel} validation report`,
          mimeType: "application/json",
          content: validationReport,
          meta: {
            provider: validationBridge?.provider || "claude",
            executionProvider: validationBridge?.executionProvider || "claude",
            executionKind: validationBridge?.executionKind || "api",
            modelName: validationBridge?.modelName || "",
            commandPreview: validationBridge?.commandPreview || "",
            usage: validationBridge?.usage || null,
            stdoutAssetId: validationStdoutAssetId,
            stderrAssetId: validationStderrAssetId,
            draftAssetId: draftAsset.assetId,
          },
        });

        validationAssetIds.push(validationAsset.assetId);

        await updateMarketingJobStepStatus({
          stepId: validateStep.stepId,
          status: valid ? "success" : "failed",
          workerId: args.workerId,
          outputRef: {
            assetIds: [
              validationAsset.assetId,
              ...(validationStdoutAssetId ? [validationStdoutAssetId] : []),
              ...(validationStderrAssetId ? [validationStderrAssetId] : []),
            ],
          },
	          meta: {
	            schema: staticReport,
	            usage: validationBridge?.usage || null,
	            koreanTypoRules: typoRuleReport,
	          },
          lastError: valid
            ? null
            : {
                code: "VALIDATION_FAILED",
                message: issues.join(", ") || "validation_failed",
              },
          completedAt: new Date(),
        });

        if (valid) {
          validCount += 1;
          if (channel === "linkedin" || channel === "naver_blog") {
            const reviewStep = await ensureManualReviewStep({
              jobId,
              universeId: args.universeId,
              channel,
              steps,
              assetIds: [draftAsset.assetId, validationAsset.assetId],
            });

            steps = steps.some((step) => toSafeString(step.stepId) === toSafeString(reviewStep.stepId))
              ? steps
              : [...steps, reviewStep];
            channelStatusMap[channel] = "waiting_review";
          } else if (channel === "threads" && publishStep?.stepId && generationConfig.reviewRequired) {
            await ensureThreadsReviewStep({
              publishStep,
              workerId: args.workerId,
              assetIds: [draftAsset.assetId, validationAsset.assetId],
              generationConfig,
            });
            channelStatusMap[channel] = "waiting_review";
          } else if (channel === "instagram" && publishStep?.stepId && generationConfig.reviewRequired) {
            await ensureInstagramReviewStep({
              publishStep,
              workerId: args.workerId,
              assetIds: [draftAsset.assetId, validationAsset.assetId],
              generationConfig,
            });
            channelStatusMap[channel] = "waiting_review";
          } else {
            channelStatusMap[channel] = "validated";
          }
        } else {
          invalidCount += 1;
          channelStatusMap[channel] = "validation_failed";
        }

        if (channel === "threads" && valid && publishStep?.stepId && !generationConfig.reviewRequired) {
          const publishSummary = await publishThreadsStep({
            universeId: args.universeId,
            workerId: args.workerId,
            jobId,
            job,
            sourceSnapshot,
            sourceAssetId: sourceAsset.assetId,
            generateStep,
            validateStep,
            publishStep,
            draftPayload,
          });

          publishReceiptAssetIds.push(publishSummary.receiptAssetId);
          publishLogIds.push(publishSummary.publishLogId);
          channelStatusMap.threads = publishSummary.publishStatus;
          if (publishSummary.publishStatus === "failed") {
            autoPublishFailure = true;
          }

          await sendMarketingSlackNotification({
            universeId: args.universeId,
            jobId,
            event: publishSummary.publishStatus === "failed" ? "threads_failed" : "threads_published",
            postTitle: sourceSnapshot.title,
            postUrl: publishSummary.finalUrl || sourceSnapshot.url,
            channels: {
              threads: publishSummary.publishStatus,
              instagram: channelStatusMap.instagram || "skipped",
              linkedin: channelStatusMap.linkedin || "waiting_review",
              naver_blog: channelStatusMap.naver_blog || "waiting_review",
            },
            summary:
              publishSummary.publishStatus === "failed"
                ? publishSummary.error?.message || "Threads 자동 발행에 실패했습니다."
                : `Threads 발행 단계가 ${publishSummary.publishMode} 모드로 처리되었습니다.`,
          }).catch(() => null);
        }

        if (channel === "instagram" && valid && publishStep?.stepId && !generationConfig.reviewRequired) {
          const publishSummary = await publishInstagramStep({
            universeId: args.universeId,
            workerId: args.workerId,
            jobId,
            job,
            sourceSnapshot,
            sourceAssetId: sourceAsset.assetId,
            generateStep,
            validateStep,
            publishStep,
            draftPayload,
          });

          publishReceiptAssetIds.push(publishSummary.receiptAssetId);
          publishLogIds.push(publishSummary.publishLogId);
          channelStatusMap.instagram = publishSummary.publishStatus;
          if (publishSummary.publishStatus === "failed") {
            autoPublishFailure = true;
          }

          await sendMarketingSlackNotification({
            universeId: args.universeId,
            jobId,
            event: publishSummary.publishStatus === "failed" ? "job_partial" : "job_success",
            postTitle: sourceSnapshot.title,
            postUrl: publishSummary.finalUrl || sourceSnapshot.url,
            channels: {
              threads: channelStatusMap.threads || "skipped",
              instagram: publishSummary.publishStatus,
              linkedin: channelStatusMap.linkedin || "waiting_review",
              naver_blog: channelStatusMap.naver_blog || "waiting_review",
            },
            summary:
              publishSummary.publishStatus === "failed"
                ? publishSummary.error?.message || "Instagram 자동 발행에 실패했습니다."
                : `Instagram 발행 단계가 ${publishSummary.publishMode} 모드로 처리되었습니다.`,
          }).catch(() => null);
        }
      } catch (error: unknown) {
        failedCount += 1;
        channelStatusMap[channel] = "failed";

        const message = toSafeString(getErrorMessage(error)) || "channel_rewrite_failed";

        const stderrAsset = await createTextAsset({
          jobId,
          stepId: generateStep.stepId,
          universeId: args.universeId,
          kind: "cli_stderr",
          channel,
          title: `${channel} rewrite stderr`,
          text: message,
          meta: {
            source: "channel_rewrite",
          },
        });

        await updateMarketingJobStepStatus({
          stepId: generateStep.stepId,
          status: "failed",
          workerId: args.workerId,
          outputRef: {
            assetIds: [stderrAsset.assetId],
          },
          lastError: {
            code: "CHANNEL_REWRITE_FAILED",
            message,
          },
          completedAt: new Date(),
        });

        await updateMarketingJobStepStatus({
          stepId: validateStep.stepId,
          status: "failed",
          workerId: args.workerId,
          lastError: {
            code: "CHANNEL_REWRITE_FAILED",
            message,
          },
          completedAt: new Date(),
        });
      }
    }

    const nextJobState = summarizeJobAfterRewrite({ validCount, invalidCount, failedCount });
    const nextCurrentStepKey =
      channelStatusMap.linkedin === "waiting_review"
        ? "prepare_linkedin_draft"
        : channelStatusMap.naver_blog === "waiting_review"
          ? "prepare_naver_draft"
          : channelStatusMap.threads
            ? "publish_threads"
            : channelStatusMap.instagram
              ? "publish_instagram"
              : "validate_output";
    const finalStatus =
      nextJobState.status === "waiting_review" && !autoPublishFailure
        ? "waiting_review"
        : autoPublishFailure && validCount > 0
          ? "partial"
          : nextJobState.status;
    const finalError =
      autoPublishFailure && finalStatus === "partial"
        ? {
            code: "AUTO_PUBLISH_PARTIAL",
            message: "자동 발행에 실패했지만 다른 채널 draft는 준비되었습니다.",
          }
        : nextJobState.lastError;

    await updateMarketingJobStatus({
      jobId,
      status: finalStatus,
      currentStepKey: nextCurrentStepKey,
      completedAt: new Date(),
      lastError: finalError,
      metrics: {
        ...(job.metrics || {}),
        lastDryRunWorkerId: args.workerId,
        sourceSnapshotAssetId: sourceAsset.assetId,
        channelDraftAssetIds,
        validationAssetIds,
        publishReceiptAssetIds,
        publishLogIds,
        channelStatusMap,
        rewriteSummary: {
          validCount,
          invalidCount,
          failedCount,
        },
      },
    });

    await updateInventoryRewriteStatusFromJob({
      universeId: args.universeId,
      job,
      status: finalStatus === "failed" ? "failed" : finalStatus === "waiting_review" ? "waiting_review" : "drafted",
      jobId,
    });

    await sendMarketingSlackNotification({
      universeId: args.universeId,
      jobId,
      event: finalStatus === "failed" ? "job_failed" : finalStatus === "partial" ? "job_partial" : "waiting_review",
      postTitle: sourceSnapshot.title,
      postUrl: sourceSnapshot.url,
      channels: {
        threads: channelStatusMap.threads || "skipped",
        instagram: channelStatusMap.instagram || "skipped",
        linkedin: channelStatusMap.linkedin || "waiting_review",
        naver_blog: channelStatusMap.naver_blog || "waiting_review",
      },
      summary:
        finalStatus === "waiting_review"
          ? "자동 발행 채널과 채널 draft 생성이 끝났고, 운영자 검토가 필요한 채널이 남아 있습니다."
          : finalError?.message || "마케팅 job 상태를 확인하세요.",
    }).catch(() => null);

    await client.lrem(processingKey, 1, jobId);
    return {
      ok: true,
      status: "processed" as const,
      jobId,
      assetId: sourceAsset.assetId,
      rewriteSummary: {
        validCount,
        invalidCount,
        failedCount,
      },
    };
  } finally {
    await releaseMarketingJobLease({ jobId, workerId: args.workerId }).catch(() => false);
  }
}

export async function pollMarketingDryRunWorkerAcrossUniverses(args: {
  universeIds: string[];
  workerId: string;
  billingUid?: string;
  queueCategory?: string;
  scheduledOnly?: boolean;
  allowScheduledPublish?: boolean;
  allowExternalPublish?: boolean;
}) {
  const universeIds = Array.from(new Set((args.universeIds || []).map((value) => toSafeString(value)).filter(Boolean)));
  if (universeIds.length === 0) {
    return {
      ok: true,
      status: "idle" as const,
      scope: "global" as const,
      universeId: "",
    };
  }

  let latestThrottle: Record<string, unknown> | null = null;
  for (const universeId of universeIds) {
    const result = await pollMarketingDryRunWorker({
      universeId,
      workerId: args.workerId,
      billingUid: args.billingUid,
      queueCategory: args.queueCategory,
      scheduledOnly: args.scheduledOnly,
      allowScheduledPublish: args.allowScheduledPublish,
      allowExternalPublish: args.allowExternalPublish,
    });

    const status = toSafeString(result.status);
    if (status === "category_throttled") {
      latestThrottle = {
        ...result,
        universeId,
      };
      continue;
    }

    if (status !== "idle") {
      return {
        ...result,
        scope: "global" as const,
        universeId,
      };
    }
  }

  if (latestThrottle) {
    return {
      ...latestThrottle,
      scope: "global" as const,
    };
  }

  return {
    ok: true,
    status: "idle" as const,
    scope: "global" as const,
    universeId: "",
  };
}
