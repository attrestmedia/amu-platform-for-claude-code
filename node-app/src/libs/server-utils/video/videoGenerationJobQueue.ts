import "server-only";

import { getRedisClient } from "libs/cache/redisClient";
import {
  cancelQueuedVideoGenJob,
  createVideoAsset,
  createVideoGenJob,
  getVideoGenJobByClientRequestId,
  getVideoGenJobByJobId,
  listVideoGenJobs,
  listVideoAssetsByJobId,
  markVideoGenJobCompleted,
  markVideoGenJobFailed,
  markVideoGenJobProviderRequestId,
  toVideoJobTransport,
  updateVideoGenJobBilling,
} from "libs/database/lab/videoGenRepo";
import { assertAIUsageBalanceOrThrow, billAIUsageOrThrow, refundAIUsageOrThrow } from "libs/services/aiUsageBilling";
import { getSystemPricingMaps } from "libs/server-utils/api/systemPricingControl";
import { assertSystemModelEnabledOrThrow, assertSystemModelSelectableOrThrow } from "libs/server-utils/api/systemModelControl";
import { getVideoProviderAdapter } from "libs/server-utils/video/videoProviderAdapters";
import { storeVideoFromProvider } from "libs/server-utils/video/videoAssetStorage";
import { buildVideoBillingPlan, resolveActualVideoCoins, resolveVideoBillingProvider, type VideoBillingPlan } from "libs/server-utils/video/videoGenerationBilling";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { VideoGenerationRequest } from "types/ai";
import { validateVideoGenerationRequest } from "types/ai";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

const QUEUE_KEY = "amu:studio-video-jobs:queue";
const PROCESSING_KEY = "amu:studio-video-jobs:processing";
const LEASE_KEY_PREFIX = "amu:studio-video-jobs:lease:";
const LEASE_TTL_MS = 10 * 60 * 1000;
const BILLING_APP = "gen_studio_video";

function safe(value: unknown) {
  return String(value || "").trim();
}

function resolveUid(user: AuthenticatedUserType | unknown) {
  const record = toUnknownRecord(user);
  return safe(record.uid || record.ID || record.id || record.userId);
}

function parseRequest(raw: unknown): VideoGenerationRequest | null {
  const request = toUnknownRecord(raw) as VideoGenerationRequest;
  if (request.modality !== "video") return null;
  return request;
}

function operationId(jobId: string, suffix = "reserve") {
  return `video:${jobId}:${suffix}`.slice(0, 240);
}

function queuePlan(job: { billing?: Record<string, unknown> }) {
  const raw = toUnknownRecord(job.billing?.pricingPlan);
  if (!raw.provider || !raw.modelName || !raw.pricingBasis) return null;
  return raw as unknown as VideoBillingPlan;
}

async function refundReserved(job: { jobId: string; uid: string; provider: string; modelName: string; estimatedCoins: number; billing?: Record<string, unknown> }, reason: string) {
  const reserveOperationId = safe(toUnknownRecord(job.billing).reserveOperationId);
  const coins = Math.max(0, Number(job.estimatedCoins || 0));
  if (!reserveOperationId || !coins) return { ok: true, coins: 0 };
  try {
    const result = await refundAIUsageOrThrow({
      uid: job.uid,
      app: BILLING_APP,
      provider: resolveVideoBillingProvider(job.provider),
      modelName: job.modelName,
      modality: "video",
      fixed: queuePlan(job)?.fixedUsage,
      coins,
      meta: {
        operationId: operationId(job.jobId, `refund:${reason}:${coins}`),
        sourceOperationId: reserveOperationId,
        reason,
      },
    });
    await updateVideoGenJobBilling({ jobId: job.jobId, refundedCoins: coins });
    return result;
  } catch (error) {
    await updateVideoGenJobBilling({ jobId: job.jobId, reconciliationRequired: true }).catch(() => undefined);
    throw error;
  }
}

async function settleReserved(job: { jobId: string; uid: string; provider: string; modelName: string; estimatedCoins: number; billing?: Record<string, unknown> }, actualCoins: number) {
  const reserved = Math.max(0, Number(job.estimatedCoins || 0));
  const actual = Math.max(0, Math.ceil(Number(actualCoins || 0)));
  const plan = queuePlan(job);
  if (!plan || actual === reserved) {
    await updateVideoGenJobBilling({ jobId: job.jobId, settledCoins: actual, settlementOperationId: operationId(job.jobId, "settlement:exact") });
    return { actualCoins: actual };
  }

  if (actual < reserved) {
    const reserveOperationId = safe(toUnknownRecord(job.billing).reserveOperationId);
    if (!reserveOperationId) throw Object.assign(new Error("video_reserve_operation_missing"), { errorCode: "VIDEO_RECONCILIATION_REQUIRED" });
    const refundCoins = reserved - actual;
    await refundAIUsageOrThrow({
      uid: job.uid,
      app: BILLING_APP,
      provider: resolveVideoBillingProvider(job.provider),
      modelName: job.modelName,
      modality: "video",
      fixed: plan.fixedUsage,
      coins: refundCoins,
      meta: {
        operationId: operationId(job.jobId, `settlement:refund:${refundCoins}`),
        sourceOperationId: reserveOperationId,
        reason: "actual_duration_shorter",
      },
    });
    await updateVideoGenJobBilling({
      jobId: job.jobId,
      settledCoins: actual,
      refundedCoins: refundCoins,
      settlementOperationId: operationId(job.jobId, `settlement:refund:${refundCoins}`),
    });
    return { actualCoins: actual, refundedCoins: refundCoins };
  }

  const extra = actual - reserved;
  const fixed = plan.pricingBasis === "per-second" ? { seconds: extra } : { videos: 1 };
  const charged = await billAIUsageOrThrow({
    uid: job.uid,
    app: BILLING_APP,
    provider: resolveVideoBillingProvider(job.provider),
    modelName: job.modelName,
    modality: "video",
    fixed,
    meta: { operationId: operationId(job.jobId, `settlement:extra:${extra}`), sourceOperationId: safe(toUnknownRecord(job.billing).reserveOperationId) },
  });
  await updateVideoGenJobBilling({ jobId: job.jobId, settledCoins: actual, settlementOperationId: safe(toUnknownRecord(charged).operationId) || operationId(job.jobId, `settlement:extra:${extra}`) });
  return { actualCoins: actual, extraCoins: extra };
}

export async function enqueueStudioVideoJob(args: { request: VideoGenerationRequest; user: AuthenticatedUserType }) {
  const uid = resolveUid(args.user);
  if (!uid) return { ok: false as const, error: "UNAUTHORIZED", errorCode: "UNAUTHORIZED" };
  const request = parseRequest(args.request);
  if (!request) return { ok: false as const, error: "video_request_invalid", errorCode: "INVALID_INPUT" };
  const validation = validateVideoGenerationRequest(request);
  if (!validation.ok) return { ok: false as const, error: validation.reason, errorCode: "VIDEO_CAPABILITY_REJECTED" };
  const provider = resolveVideoBillingProvider(safe(request.provider));
  const modelName = safe(request.modelName);

  const existing = await getVideoGenJobByClientRequestId({ uid, clientRequestId: request.clientRequestId });
  if (existing) {
    return { ok: true as const, job: await toVideoJobTransport(existing), reused: true };
  }
  await assertSystemModelSelectableOrThrow({ provider, modelName, modality: "video", actor: { user: args.user } });

  const pricing = await getSystemPricingMaps();
  const billingPlan = buildVideoBillingPlan({
    provider,
    modelName,
    durationSeconds: Number(request.durationSeconds || 0),
    resolution: safe(request.resolution),
    pricing,
  });
  if (!billingPlan) return { ok: false as const, error: "video_pricing_unavailable", errorCode: "PRICING_NOT_FOUND" };

  const preflightMeta = { operationId: "video:preflight:" + request.clientRequestId, pricingRevision: billingPlan.pricingRevision };
  await assertAIUsageBalanceOrThrow({
    uid,
    app: BILLING_APP,
    provider,
    modelName,
    modality: "video",
    fixed: billingPlan.fixedUsage,
    variant: safe(request.resolution),
    meta: preflightMeta,
  });

  const job = await createVideoGenJob({ uid, request: { ...request, provider, modelName, pricingRevision: billingPlan.pricingRevision }, estimatedCoins: billingPlan.estimatedCoins, pricingRevision: billingPlan.pricingRevision, billingPlan: billingPlan as unknown as Record<string, unknown> });
  const reserveOperationId = operationId(job.jobId);
  try {
    const reserved = await billAIUsageOrThrow({
      uid,
      app: BILLING_APP,
      provider,
      modelName,
      modality: "video",
      fixed: billingPlan.fixedUsage,
      variant: safe(request.resolution),
      meta: { operationId: reserveOperationId, pricingRevision: billingPlan.pricingRevision, jobId: job.jobId },
    });
    const updated = await updateVideoGenJobBilling({ jobId: job.jobId, reserveOperationId: safe(toUnknownRecord(reserved).operationId) || reserveOperationId, reservedCoins: reserved.coins });
    const client = await getRedisClient();
    await client.rpush(QUEUE_KEY, job.jobId);
    return { ok: true as const, job: await toVideoJobTransport(updated || job), reused: false };
  } catch (error) {
    await markVideoGenJobFailed({ jobId: job.jobId, code: safe(toUnknownRecord(error).errorCode) || "VIDEO_RESERVE_FAILED", message: safe(toUnknownRecord(error).message) || "video_reserve_failed" }).catch(() => undefined);
    return { ok: false as const, error: safe(toUnknownRecord(error).message) || "video_reserve_failed", errorCode: safe(toUnknownRecord(error).errorCode) || "VIDEO_RESERVE_FAILED" };
  }
}

export async function getStudioVideoJobForUser(args: { uid: string; jobId: string }) {
  const job = await getVideoGenJobByJobId(args.jobId);
  if (!job || job.uid !== args.uid) return null;
  return await toVideoJobTransport(job);
}

export async function listStudioVideoJobsForUser(args: { uid: string; jobIds?: string[]; limit?: number }) {
  const jobs = await listVideoGenJobs(args);
  return await Promise.all(jobs.map((job) => toVideoJobTransport(job)));
}

export async function cancelStudioVideoJobForUser(args: { uid: string; jobId: string }) {
  const job = await getVideoGenJobByJobId(args.jobId);
  if (!job || job.uid !== args.uid) return { ok: false as const, error: "job_not_found", errorCode: "NOT_FOUND" };
  const cancelled = await cancelQueuedVideoGenJob(args);
  if (!cancelled) return { ok: false as const, error: "video_cancel_only_before_provider_start", errorCode: "VIDEO_CANCEL_UNSUPPORTED" };
  try {
    await refundReserved(cancelled, "cancelled");
  } catch (error) {
    return { ok: false as const, error: "video_cancel_refund_reconciliation_required", errorCode: safe(toUnknownRecord(error).errorCode) || "VIDEO_RECONCILIATION_REQUIRED" };
  }
  const client = await getRedisClient();
  await client.lrem(QUEUE_KEY, 0, args.jobId);
  return { ok: true as const, job: await toVideoJobTransport(cancelled) };
}

async function getLeaseKey(jobId: string) {
  return `${LEASE_KEY_PREFIX}${jobId}`;
}

async function acquireLease(jobId: string, workerId: string) {
  const client = await getRedisClient();
  return (await client.set(await getLeaseKey(jobId), workerId, "PX", LEASE_TTL_MS, "NX")) === "OK";
}

async function releaseLease(jobId: string, workerId: string) {
  const client = await getRedisClient();
  const key = await getLeaseKey(jobId);
  if ((await client.get(key).catch(() => "")) === workerId) await client.del(key);
}

async function requeue(jobId: string) {
  const client = await getRedisClient();
  await client.lrem(PROCESSING_KEY, 0, jobId);
  await client.rpush(QUEUE_KEY, jobId);
}

async function claimVideoJob(args: { workerId: string; jobId?: string }) {
  const client = await getRedisClient();
  const requested = safe(args.jobId);
  const jobId = requested || safe(await client.rpoplpush(QUEUE_KEY, PROCESSING_KEY));
  if (!jobId) return { status: "idle" as const, jobId: "" };
  if (!(await acquireLease(jobId, args.workerId))) {
    await requeue(jobId);
    return { status: "busy" as const, jobId };
  }
  if (requested) {
    await client.lrem(QUEUE_KEY, 0, jobId);
    await client.lrem(PROCESSING_KEY, 0, jobId);
    await client.rpush(PROCESSING_KEY, jobId);
  }
  return { status: "claimed" as const, jobId };
}

async function processClaimedVideoJob(args: { jobId: string; workerId: string }) {
  const job = await getVideoGenJobByJobId(args.jobId);
  if (!job) return { ok: false, status: "missing_job", jobId: args.jobId };
  if (["success", "partial", "failed", "expired", "cancelled"].includes(job.status)) return { ok: true, status: "skipped", jobId: args.jobId };
  const request = parseRequest(job.request);
  if (!request) {
    await markVideoGenJobFailed({ jobId: job.jobId, code: "VIDEO_REQUEST_MISSING", message: "video_request_missing" });
    await refundReserved(job, "request_missing").catch(() => undefined);
    return { ok: false, status: "failed", jobId: job.jobId };
  }

  try {
    const provider = resolveVideoBillingProvider(job.provider);
    await assertSystemModelEnabledOrThrow({ provider, modelName: job.modelName, modality: "video" });
    const adapter = getVideoProviderAdapter(provider);
    let providerRequestId = safe(job.providerRequestId);
    if (!providerRequestId) {
      const started = await adapter.start(request);
      providerRequestId = started.providerRequestId;
      await markVideoGenJobProviderRequestId({ jobId: job.jobId, providerRequestId });
    }
    const result = await adapter.poll({ providerRequestId });
    if (result.status === "running") {
      await requeue(job.jobId);
      return { ok: true, status: "running", jobId: job.jobId };
    }
    if (result.status === "failed" || result.status === "expired") {
      await refundReserved(job, result.status);
      await markVideoGenJobFailed({ jobId: job.jobId, code: result.errorCode, message: result.errorMessage, status: result.status });
      return { ok: false, status: result.status, jobId: job.jobId };
    }
    if (result.status !== "success") {
      await refundReserved(job, "provider_result_invalid").catch(() => undefined);
      await markVideoGenJobFailed({ jobId: job.jobId, code: "VIDEO_PROVIDER_RESULT_INVALID", message: "video_provider_result_invalid" });
      return { ok: false, status: "failed", jobId: job.jobId };
    }
    if (result.moderationApproved === false) {
      await refundReserved(job, "moderation_rejected");
      await markVideoGenJobFailed({ jobId: job.jobId, code: "VIDEO_MODERATION_REJECTED", message: "video_moderation_rejected" });
      return { ok: false, status: "failed", jobId: job.jobId };
    }

    const existingAssets = await listVideoAssetsByJobId(job.jobId);
    let asset = existingAssets[0];
    if (!asset) {
      const assetId = `video_asset_${job.jobId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const storage = await storeVideoFromProvider({
        sourceUrl: result.sourceUrl,
        downloadHeaders: result.downloadHeaders,
        scope: job.scope,
        uid: job.uid,
        jobId: job.jobId,
        assetId,
        visibility: request.visibility,
      });
      asset = await createVideoAsset({
        assetId,
        jobId: job.jobId,
        uid: job.uid,
        provider: job.provider,
        modelName: job.modelName,
        durationSeconds: result.actualDurationSeconds || job.requestedDurationSeconds,
        mimeType: storage.mimeType,
        storage: { ...storage, url: "url" in storage ? storage.url : undefined },
        moderation: { providerApproved: true },
      });
    }
    const actualDuration = Math.max(1, Number(result.actualDurationSeconds || job.requestedDurationSeconds));
    const plan = queuePlan(job);
    const actualCoins = plan ? resolveActualVideoCoins({ plan, actualDurationSeconds: actualDuration }) : job.estimatedCoins;
    await settleReserved(job, actualCoins);
    await markVideoGenJobCompleted({ jobId: job.jobId, status: "success", actualDurationSeconds: actualDuration, actualCoins, assetIds: [asset.assetId] });
    return { ok: true, status: "processed", jobId: job.jobId };
  } catch (error) {
    const err = toErrorLike(error);
    await refundReserved(job, "provider_or_storage_failed").catch((refundError) => logger.error("[video-job] refund failed", { jobId: job.jobId, error: toErrorLike(refundError).message }));
    await markVideoGenJobFailed({ jobId: job.jobId, code: safe(err.errorCode || err.code) || "VIDEO_JOB_FAILED", message: safe(err.message) || "video_job_failed" }).catch(() => undefined);
    return { ok: false, status: "failed", jobId: job.jobId, error: safe(err.message) };
  } finally {
    const client = await getRedisClient();
    await client.lrem(PROCESSING_KEY, 0, args.jobId).catch(() => undefined);
    await releaseLease(args.jobId, args.workerId).catch(() => undefined);
  }
}

export async function pollStudioVideoJobWorker(args: { workerId: string; jobId?: string }) {
  const workerId = safe(args.workerId) || `studio-video-worker-${Date.now()}`;
  const claimed = await claimVideoJob({ workerId, jobId: args.jobId });
  if (claimed.status !== "claimed") return { ok: true as const, status: claimed.status, jobId: claimed.jobId };
  return await processClaimedVideoJob({ jobId: claimed.jobId, workerId });
}
