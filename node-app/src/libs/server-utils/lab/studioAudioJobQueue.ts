import "server-only";

import { getRedisClient } from "libs/cache/redisClient";
import {
  cancelQueuedAudioGenJob,
  createAudioAsset,
  createAudioGenJob,
  detachAudioAsset,
  findReusableAudioAsset,
  getAudioAssetByAssetId,
  getAudioGenJobByClientRequestId,
  getAudioGenJobByJobId,
  hardDeleteAudioAsset,
  heartbeatAudioGenJob,
  listAudioAssetsByJobId,
  listRecoverableAudioGenJobs,
  listAudioGenJobsForUser,
  markAudioGenJobFailed,
  markAudioGenJobRunning,
  markAudioGenJobSuccess,
  markStaleRunningAudioGenJobUnknown,
  requeueFailedAudioGenJob,
  requeueRecoverableAudioGenJob,
  softDeleteAudioAsset,
  toAudioJobTransport,
  updateAudioGenJobBilling,
} from "libs/database/lab";
import { assertAIUsageBalanceOrThrow, billAIUsageOrThrow, refundAIUsageOrThrow } from "libs/services/aiUsageBilling";
import { createSystemPricingSnapshotRevision, getSystemPricingMaps, previewSystemPricingQuote } from "libs/server-utils/api/systemPricingControl";
import { assertSystemModelEnabledOrThrow } from "libs/server-utils/api/systemModelControl";
import { claimProviderOperationOrThrow } from "libs/server-utils/api/providerOperationGuard";
import { synthesizeSpeech } from "libs/server-utils/audio/synthesizeSpeech";
import {
  buildStudioAudioRequestHash,
  resolveStudioAudioMetadata,
  resolveStudioAudioProgressIncrement,
  resolveStudioAudioRecoveryTransition,
  resolveStudioAudioReservationCharacters,
  buildStudioAudioCloneStorageKey,
  isTerminalStudioAudioJobStatus,
  resolveStudioAudioSettlement,
  type StudioAudioManifest,
  type StudioAudioRequest,
  validateStudioAudioRequest,
} from "libs/server-utils/lab/studioAudioContract";
import { copyVoiceAssetToAccess, deleteVoiceAssetByStorage, resolveAudioExt, saveVoiceBufferToR2 } from "libs/server-utils/audio/voiceAssetStorage";
import { getR2PrivateBucket, getR2PublicBucket } from "libs/server-utils/storage/r2Storage";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";
import type { IAudioAssetDocument, IAudioGenJobDocument } from "models/lab";
import { logger } from "utils/log";

const QUEUE_KEY = "amu:studio-audio-jobs:queue";
const PROCESSING_KEY = "amu:studio-audio-jobs:processing";
const PAYLOAD_KEY_PREFIX = "amu:studio-audio-jobs:payload:";
const LEASE_KEY_PREFIX = "amu:studio-audio-jobs:lease:";
const PAYLOAD_TTL_SECONDS = 60 * 60 * 24;
const LEASE_TTL_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const RECOVERY_SCAN_LIMIT = 20;
const RECOVERY_MARKER_TTL_MS = 60 * 1000;
const RECOVERY_MARKER_PREFIX = "amu:studio-audio-jobs:recovery:";
const BILLING_APP = "gen_studio_audio";

function safe(value: unknown) {
  return String(value || "").trim();
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function uidOf(user: unknown) {
  const value = record(user);
  return safe(value.uid || value.ID || value.id || value.userId);
}

function snapshotUser(user: AuthenticatedUserType) {
  const value = record(user);
  const uid = uidOf(user);
  return {
    uid,
    ID: safe(value.ID || uid),
    id: safe(value.id || uid),
    userId: safe(value.userId || uid),
    userKey: safe(value.userKey),
    userEmail: safe(value.userEmail || value.email),
    userEmailLower: safe(value.userEmailLower || value.email).toLowerCase(),
    email: safe(value.email || value.userEmail),
    roles: Array.isArray(value.roles) ? value.roles : [],
  };
}

function payloadKey(jobId: string) {
  return `${PAYLOAD_KEY_PREFIX}${safe(jobId)}`;
}

function leaseKey(jobId: string) {
  return `${LEASE_KEY_PREFIX}${safe(jobId)}`;
}

function recoveryMarkerKey(jobId: string) {
  return `${RECOVERY_MARKER_PREFIX}${safe(jobId)}`;
}

function operationId(jobId: string, segmentIndex: number, suffix = "provider") {
  return `audio:${safe(jobId)}:segment:${Math.max(0, segmentIndex)}:${safe(suffix)}`.slice(0, 240);
}

function fixedCharacters(manifest: StudioAudioManifest) {
  return Math.max(0, manifest.segments.reduce((sum, segment) => sum + Math.max(0, Number(segment.charCount || 0)), 0));
}

function isDuplicateKeyError(error: unknown) {
  const value = record(error);
  return value.code === 11000 || safe(value.message).includes("E11000");
}

async function acquireLease(jobId: string, workerId: string) {
  const redis = await getRedisClient();
  return (await redis.set(leaseKey(jobId), workerId, "PX", LEASE_TTL_MS, "NX")) === "OK";
}

async function releaseLease(jobId: string, workerId: string) {
  const redis = await getRedisClient();
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    leaseKey(jobId),
    workerId,
  );
}

async function renewLease(jobId: string, workerId: string) {
  const redis = await getRedisClient();
  const result = await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
    1,
    leaseKey(jobId),
    workerId,
    String(LEASE_TTL_MS),
  );
  return Number(result) === 1;
}

async function refreshJobLease(args: { jobId: string; workerId: string; generatedCharacters?: number; completedCharacters?: number }) {
  if (!(await renewLease(args.jobId, args.workerId))) {
    throw unknownOutcomeError("AUDIO_WORKER_LEASE_LOST", "audio worker lease was lost");
  }
  const touched = await heartbeatAudioGenJob({
    jobId: args.jobId,
    generatedCharacters: args.generatedCharacters,
    completedCharacters: args.completedCharacters,
  });
  if (!touched) throw unknownOutcomeError("AUDIO_WORKER_HEARTBEAT_FAILED", "audio worker heartbeat failed");
  return touched;
}

async function removeProcessing(jobId: string) {
  await (await getRedisClient()).lrem(PROCESSING_KEY, 0, jobId);
}

async function requeue(jobId: string) {
  const redis = await getRedisClient();
  // rpoplpush가 방금 추가한 마지막 occurrence만 제거해 다른 worker의 processing 항목을 건드리지 않는다.
  await redis.lrem(PROCESSING_KEY, -1, jobId);
  if (await redis.get(leaseKey(jobId))) return false;
  await redis.rpush(QUEUE_KEY, jobId);
  return true;
}

async function requeueClaimedJob(jobId: string, workerId: string) {
  const redis = await getRedisClient();
  await redis.lrem(PROCESSING_KEY, 0, jobId);
  await releaseLease(jobId, workerId);
  await redis.rpush(QUEUE_KEY, jobId);
}

async function isInList(redis: Awaited<ReturnType<typeof getRedisClient>>, key: string, jobId: string) {
  return (await redis.lpos(key, jobId)) !== null;
}

async function recoverExpiredProcessingJobs(redis: Awaited<ReturnType<typeof getRedisClient>>) {
  const staleBefore = new Date(Date.now() - LEASE_TTL_MS);
  const processingIds = await redis.lrange(PROCESSING_KEY, 0, RECOVERY_SCAN_LIMIT - 1);
  let recovered = 0;
  for (const jobId of processingIds.map(safe).filter(Boolean)) {
    if (await redis.get(leaseKey(jobId))) continue;
    const job = await getAudioGenJobByJobId(jobId);
    if (!job || isTerminalStudioAudioJobStatus(job.status)) {
      await redis.lrem(PROCESSING_KEY, 0, jobId);
      continue;
    }
    const action = resolveStudioAudioRecoveryTransition(job.status).action;
    if (action === "mark_unknown") {
      const unknown = await markStaleRunningAudioGenJobUnknown({ jobId, staleBefore });
      if (unknown) {
        await redis.lrem(PROCESSING_KEY, 0, jobId);
        recovered += 1;
      }
      continue;
    }
    if (action !== "requeue") continue;
    const requeued = await requeueRecoverableAudioGenJob({ jobId, staleBefore });
    if (!requeued) continue;
    if (await redis.get(leaseKey(jobId))) continue;
    await redis.lrem(PROCESSING_KEY, 0, jobId);
    await redis.rpush(QUEUE_KEY, jobId);
    recovered += 1;
  }
  return recovered;
}

async function recoverLostAudioJobs(redis: Awaited<ReturnType<typeof getRedisClient>>, workerId: string) {
  const staleBefore = new Date(Date.now() - LEASE_TTL_MS);
  const candidates = await listRecoverableAudioGenJobs({ staleBefore, limit: RECOVERY_SCAN_LIMIT });
  let recovered = 0;
  for (const job of candidates) {
    const jobId = safe(job.jobId);
    if (!jobId || await redis.get(leaseKey(jobId))) continue;
    if (await isInList(redis, QUEUE_KEY, jobId) || await isInList(redis, PROCESSING_KEY, jobId)) continue;
    const marker = await redis.set(recoveryMarkerKey(jobId), workerId, "PX", RECOVERY_MARKER_TTL_MS, "NX");
    if (marker !== "OK" || await redis.get(leaseKey(jobId))) continue;
    const action = resolveStudioAudioRecoveryTransition(job.status).action;
    if (action === "mark_unknown") {
      const unknown = await markStaleRunningAudioGenJobUnknown({ jobId, staleBefore });
      if (unknown) recovered += 1;
      continue;
    }
    if (action !== "requeue") continue;
    const requeued = await requeueRecoverableAudioGenJob({ jobId, staleBefore });
    if (!requeued || await redis.get(leaseKey(jobId))) continue;
    await redis.rpush(QUEUE_KEY, jobId);
    recovered += 1;
  }
  return recovered;
}

async function claimJob(args: { workerId: string; jobId?: string }) {
  const redis = await getRedisClient();
  const requested = safe(args.jobId);
  if (!requested) {
    await recoverExpiredProcessingJobs(redis);
    await recoverLostAudioJobs(redis, args.workerId);
  }
  const jobId = requested || safe(await redis.rpoplpush(QUEUE_KEY, PROCESSING_KEY));
  if (!jobId) return { status: "idle" as const, jobId: "" };
  if (!(await acquireLease(jobId, args.workerId))) {
    if (!requested) await requeue(jobId);
    return { status: "busy" as const, jobId };
  }
  if (requested) {
    await redis.lrem(QUEUE_KEY, 0, jobId);
    await redis.lrem(PROCESSING_KEY, 0, jobId);
    await redis.rpush(PROCESSING_KEY, jobId);
  }
  return { status: "claimed" as const, jobId };
}

function requestFromJob(job: IAudioGenJobDocument) {
  const stored = record(job.request);
  const manifest = record(stored.manifest) as unknown as StudioAudioManifest;
  const request = { ...stored };
  delete request.manifest;
  const validation = validateStudioAudioRequest(request);
  if (!validation.ok) return null;
  if (validation.request.uid !== job.uid || validation.requestHash !== job.requestHash) return null;
  if (manifest.segmentCount && !manifestMatches(manifest, validation.manifest, job)) return null;
  return { request: validation.request, manifest: manifest.segmentCount ? manifest : validation.manifest };
}

function manifestMatches(stored: StudioAudioManifest, generated: StudioAudioManifest, job: IAudioGenJobDocument) {
  if (
    stored.contractVersion !== generated.contractVersion ||
    stored.sourceRevision !== generated.sourceRevision ||
    stored.sourceHash !== generated.sourceHash ||
    stored.manifestHash !== generated.manifestHash ||
    stored.segmentCount !== generated.segmentCount ||
    stored.sourceHash !== job.sourceHash ||
    stored.manifestHash !== job.manifestHash ||
    stored.segmentCount !== job.segmentCount ||
    stored.segments.length !== generated.segments.length
  ) return false;
  return stored.segments.every((segment, index) => {
    const expected = generated.segments[index];
    return Boolean(
      expected &&
        segment.segmentIndex === expected.segmentIndex &&
        segment.orderedIndex === expected.orderedIndex &&
        segment.text === expected.text &&
        segment.charCount === expected.charCount &&
        segment.segmentHash === expected.segmentHash,
    );
  });
}

async function loadRequest(job: IAudioGenJobDocument) {
  const redis = await getRedisClient();
  const raw = await redis.get(payloadKey(job.jobId));
  if (raw) {
    try {
      const parsed = record(JSON.parse(raw));
      const validation = validateStudioAudioRequest(parsed.request);
      const manifest = record(parsed.manifest) as unknown as StudioAudioManifest;
      if (validation.ok && validation.requestHash === job.requestHash && manifest.segmentCount && manifestMatches(manifest, validation.manifest, job)) {
        return { request: validation.request, manifest, user: record(parsed.user) };
      }
    } catch {
      // DB의 operation ledger를 복구 경로로 사용한다.
    }
  }
  const stored = requestFromJob(job);
  if (!stored) return null;
  return { ...stored, user: { uid: job.uid, ID: job.uid, id: job.uid, userId: job.uid } };
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveInteger(value: unknown) {
  return Math.floor(nonNegativeNumber(value));
}

function billingAmount(value: unknown, fallback: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : nonNegativeNumber(fallback);
}

function appendOperationId(values: unknown, operationId: string) {
  return Array.from(new Set([
    ...(Array.isArray(values) ? values.map(safe).filter(Boolean) : []),
    safe(operationId),
  ])).filter(Boolean);
}

async function refundReservation(job: IAudioGenJobDocument, reason: string) {
  const billing = record(job.billing);
  const reserveOperationId = safe(billing.reserveOperationId);
  const reservedCoins = billingAmount(billing.reservedCoins, billing.estimatedCoins);
  const previousRefundedCoins = nonNegativeNumber(billing.refundedCoins);
  const reservationCycle = Math.max(1, positiveInteger(billing.reservationCycle) || 1);
  if (!reserveOperationId || !reservedCoins) return { coins: 0, refundedCoins: previousRefundedCoins };
  const settlementOperationId = `audio:${job.jobId}:settlement:${reservationCycle}:refund:${safe(reason) || "failed"}`.slice(0, 240);
  try {
    const result = await refundAIUsageOrThrow({
      uid: job.uid,
      app: BILLING_APP,
      provider: job.provider as never,
      modelName: job.modelName,
      modality: "audio",
      fixed: { characters: positiveInteger(billing.reservedCharacters) },
      coins: reservedCoins,
      meta: { operationId: settlementOperationId, sourceOperationId: reserveOperationId, reason },
    });
    const totalRefundedCoins = previousRefundedCoins + reservedCoins;
    await updateAudioGenJobBilling({
      jobId: job.jobId,
      refundedCoins: totalRefundedCoins,
      settlementOperationId,
      settlementOperationIds: appendOperationId(billing.settlementOperationIds, settlementOperationId),
    });
    return { ...record(result), coins: reservedCoins, refundedCoins: totalRefundedCoins, settlementOperationId };
  } catch (error) {
    await updateAudioGenJobBilling({ jobId: job.jobId, reconciliationRequired: true }).catch(() => undefined);
    throw error;
  }
}

function unknownOutcomeError(code: string, message: string) {
  const error = new Error(message) as Error & { errorCode?: string; providerCallState?: string };
  error.errorCode = code;
  error.providerCallState = "unknown_outcome";
  return error;
}

async function settleReservation(job: IAudioGenJobDocument) {
  const billing = record(job.billing);
  const reservedCoins = billingAmount(billing.reservedCoins, billing.estimatedCoins);
  const reservedCharacters = positiveInteger(billing.reservedCharacters);
  const generatedCharacters = positiveInteger(billing.generatedCharacters);
  const previousSettledCharacters = Math.min(generatedCharacters, positiveInteger(billing.settledCharacters));
  const pendingCharacters = Math.max(0, generatedCharacters - previousSettledCharacters);
  const previousActualCoins = nonNegativeNumber(billing.actualCoins);
  const previousRefundedCoins = nonNegativeNumber(billing.refundedCoins);
  const reservationCycle = Math.max(1, positiveInteger(billing.reservationCycle) || 1);
  let settlement: ReturnType<typeof resolveStudioAudioSettlement>;
  if (!pendingCharacters) {
    settlement = {
      kind: "settle",
      actualCoins: 0,
      refundCoins: reservedCoins,
      cumulativeActualCoins: previousActualCoins,
      cumulativeRefundedCoins: previousRefundedCoins + reservedCoins,
      settledCharacters: previousSettledCharacters,
    };
  } else {
    const reservedPricingRevision = safe(billing.pricingRevision);
    const currentPricing = await getSystemPricingMaps();
    const currentPricingRevision = createSystemPricingSnapshotRevision(currentPricing);
    const quote = await previewSystemPricingQuote({
      provider: job.provider as never,
      modelName: job.modelName,
      modality: "audio",
      fixed: { characters: pendingCharacters },
    });
    const actualCoins = Math.ceil(nonNegativeNumber(quote.coins));
    settlement = resolveStudioAudioSettlement({
      reservedCoins,
      actualCoins,
      reservedPricingRevision,
      currentPricingRevision,
      previousActualCoins,
      previousRefundedCoins,
      previousSettledCharacters,
      pendingCharacters,
    });
  }
  if (settlement.kind === "unknown_outcome") {
    throw unknownOutcomeError(settlement.errorCode, settlement.errorCode === "AUDIO_PRICING_REVISION_CHANGED"
      ? "audio pricing revision changed after reservation"
      : "audio reservation cap would be exceeded");
  }
  const reserveOperationId = safe(billing.reserveOperationId);
  if (settlement.refundCoins > 0) {
    if (!reserveOperationId) throw new Error("AUDIO_RESERVE_OPERATION_MISSING");
    const settlementOperationId = `audio:${job.jobId}:settlement:${reservationCycle}:refund`;
    await refundAIUsageOrThrow({
      uid: job.uid,
      app: BILLING_APP,
      provider: job.provider as never,
      modelName: job.modelName,
      modality: "audio",
      fixed: { characters: reservedCharacters },
      coins: settlement.refundCoins,
      meta: { operationId: settlementOperationId, sourceOperationId: reserveOperationId, reason: "segment_cache" },
    });
    return {
      actualCoins: settlement.cumulativeActualCoins,
      refundedCoins: settlement.cumulativeRefundedCoins,
      generatedCharacters,
      settledCharacters: settlement.settledCharacters,
      settlementOperationId,
      settlementOperationIds: appendOperationId(billing.settlementOperationIds, settlementOperationId),
    };
  }
  const settlementOperationId = `audio:${job.jobId}:settlement:${reservationCycle}:exact`;
  return {
    actualCoins: settlement.cumulativeActualCoins,
    refundedCoins: settlement.cumulativeRefundedCoins,
    generatedCharacters,
    settledCharacters: settlement.settledCharacters,
    settlementOperationId,
    settlementOperationIds: appendOperationId(billing.settlementOperationIds, settlementOperationId),
  };
}

export async function enqueueStudioAudioJob(args: {
  request: unknown;
  user: AuthenticatedUserType;
}) {
  const uid = uidOf(args.user);
  if (!uid) return { ok: false as const, error: "UNAUTHORIZED", errorCode: "UNAUTHORIZED" };
  const raw = { ...record(args.request), uid };
  const initial = validateStudioAudioRequest(raw);
  if (!initial.ok) return { ok: false as const, error: initial.error, errorCode: "AUDIO_REQUEST_INVALID" };
  try {
    await assertSystemModelEnabledOrThrow({ provider: initial.request.provider, modelName: initial.request.modelName, modality: "audio" });
  } catch (error) {
    const err = toErrorLike(error);
    return { ok: false as const, error: safe(err.message) || "AUDIO_MODEL_NOT_AVAILABLE", errorCode: safe(err.errorCode || err.code) || "AUDIO_MODEL_NOT_AVAILABLE" };
  }
  const pricing = await getSystemPricingMaps();
  const pricingRevision = createSystemPricingSnapshotRevision(pricing);
  const request: StudioAudioRequest = { ...initial.request, pricingRevision };
  const requestHash = buildStudioAudioRequestHash({
    ...request,
    sourceHash: initial.manifest.sourceHash,
    manifestHash: initial.manifest.manifestHash,
  });
  const totalCharacters = fixedCharacters(initial.manifest);
  const scope = request.scope;
  const existing = await getAudioGenJobByClientRequestId({ uid, clientRequestId: request.clientRequestId, scope, universeId: request.universeId });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return { ok: false as const, error: "AUDIO_REQUEST_HASH_CONFLICT", errorCode: "IDEMPOTENCY_CONFLICT" };
    }
    if (existing.status !== "failed") {
      return { ok: true as const, job: await toAudioJobTransport(existing), reused: true };
    }
    // provider 실패는 같은 clientRequestId로 재시도할 수 있지만, unknown_outcome은 위에서 terminal 재사용한다.
  }

  const existingAssets = existing?.status === "failed" ? await listAudioAssetsByJobId(existing.jobId) : [];
  const completedSegmentIndexes = new Set(existingAssets.map((asset) => asset.segmentIndex));
  const reservationCharacters = existing?.status === "failed"
    ? resolveStudioAudioReservationCharacters({ manifest: initial.manifest, completedSegmentIndexes: [...completedSegmentIndexes] })
    : totalCharacters;
  const reservationCycle = Math.max(1, Math.floor(Number(existing?.billing?.reservationCycle || 0)) + 1);

  const billingMeta = { operationId: `audio:${request.clientRequestId}:preflight:${reservationCycle}`, pricingRevision, source: "gen-studio" };
  const preview = await assertAIUsageBalanceOrThrow({
    uid,
    app: BILLING_APP,
    provider: request.provider,
    modelName: request.modelName,
    modality: "audio",
    fixed: { characters: reservationCharacters },
    meta: billingMeta,
  });
  let job: IAudioGenJobDocument;
  try {
    job = existing?.status === "failed"
      ? (await requeueFailedAudioGenJob({
          uid,
          jobId: existing.jobId,
          billing: { pricingRevision, estimatedCoins: preview.coins, reservedCharacters: reservationCharacters, reservationCycle },
        }) || existing)
      : await createAudioGenJob({
          scope,
          uid,
          universeId: request.universeId,
          createdBy: uid,
          provider: request.provider,
          modelName: request.modelName,
          clientRequestId: request.clientRequestId,
          requestHash,
          request: { ...request, manifest: initial.manifest } as unknown as Record<string, unknown>,
          sourceRevision: request.sourceRevision,
          sourceHash: initial.manifest.sourceHash,
          manifestHash: initial.manifest.manifestHash,
          segmentCount: initial.manifest.segmentCount,
          billing: { pricingRevision, estimatedCoins: preview.coins, reservedCharacters: reservationCharacters, reservationCycle },
        });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await getAudioGenJobByClientRequestId({ uid, clientRequestId: request.clientRequestId, scope, universeId: request.universeId });
      if (raced?.requestHash === requestHash) return { ok: true as const, job: await toAudioJobTransport(raced), reused: true };
    }
    throw error;
  }

  const reserveOperation = `audio:${job.jobId}:reserve:${reservationCycle}`;
  try {
    const reserved = await billAIUsageOrThrow({
      uid,
      app: BILLING_APP,
      provider: request.provider,
      modelName: request.modelName,
      modality: "audio",
      fixed: { characters: reservationCharacters },
      meta: { operationId: reserveOperation, pricingRevision, jobId: job.jobId },
    });
    await updateAudioGenJobBilling({
      jobId: job.jobId,
      reserveOperationId: safe(record(reserved).operationId) || reserveOperation,
      reservedCoins: Number(record(reserved).coins || preview.coins),
      reservedCharacters: reservationCharacters,
      reservationCycle,
    });
    const redis = await getRedisClient();
    await redis.set(payloadKey(job.jobId), JSON.stringify({ request, manifest: initial.manifest, user: snapshotUser(args.user) }), "EX", PAYLOAD_TTL_SECONDS);
    await redis.rpush(QUEUE_KEY, job.jobId);
    const updated = await getAudioGenJobByJobId(job.jobId);
    return { ok: true as const, job: updated ? await toAudioJobTransport(updated) : await toAudioJobTransport(job), reused: false };
  } catch (error) {
    const err = toErrorLike(error);
    const refundError = await refundReservation(Object.assign({}, job, {
      billing: { ...(job.billing || {}), reserveOperationId: reserveOperation, reservedCoins: preview.coins, reservedCharacters: reservationCharacters, reservationCycle },
    }) as IAudioGenJobDocument, "enqueue_failed").then(() => null).catch((refundError) => refundError);
    if (refundError) {
      logger.error("[studioAudioJobQueue] reservation refund failed", { jobId: job.jobId, error: toErrorLike(refundError).message });
      await markUnknown(job.jobId, refundError);
      return { ok: false as const, error: "audio_enqueue_refund_reconciliation_required", errorCode: "AUDIO_RECONCILIATION_REQUIRED" };
    }
    await markAudioGenJobFailed({ jobId: job.jobId, code: safe(err.errorCode || err.code) || "AUDIO_ENQUEUE_FAILED", message: safe(err.message) || "audio_enqueue_failed" }).catch(() => undefined);
    return { ok: false as const, error: safe(err.message) || "audio_enqueue_failed", errorCode: safe(err.errorCode || err.code) || "AUDIO_ENQUEUE_FAILED" };
  }
}

export async function getStudioAudioJobForUser(args: { uid: string; jobId: string }) {
  const job = await getAudioGenJobByJobId(args.jobId);
  if (!job || job.uid !== safe(args.uid)) return null;
  return await toAudioJobTransport(job);
}

export async function listStudioAudioJobsForUser(args: { uid: string; jobIds?: string[]; limit?: number }) {
  const jobs = await listAudioGenJobsForUser(args);
  return await Promise.all(jobs.map(toAudioJobTransport));
}

export async function cancelStudioAudioJobForUser(args: { uid: string; jobId: string }) {
  const cancelled = await cancelQueuedAudioGenJob(args);
  if (!cancelled) {
    const current = await getAudioGenJobByJobId(args.jobId);
    if (!current || current.uid !== safe(args.uid)) return { ok: false as const, error: "job_not_found", errorCode: "NOT_FOUND" };
    return { ok: false as const, error: "audio_cancel_only_before_provider_start", errorCode: "AUDIO_CANCEL_UNSUPPORTED" };
  }
  try {
    await refundReservation(cancelled, "cancelled");
  } catch (error) {
    return { ok: false as const, error: "audio_cancel_refund_reconciliation_required", errorCode: safe(record(error).errorCode) || "AUDIO_RECONCILIATION_REQUIRED" };
  }
  const redis = await getRedisClient();
  await redis.lrem(QUEUE_KEY, 0, args.jobId);
  return { ok: true as const, job: await toAudioJobTransport(cancelled) };
}

async function markUnknown(jobId: string, error: unknown) {
  const err = toErrorLike(error);
  await markAudioGenJobFailed({
    jobId,
    code: safe(err.errorCode || err.code) || "AUDIO_UNKNOWN_OUTCOME",
    message: safe(err.message) || "audio_provider_outcome_unknown",
    status: "unknown_outcome",
  }).catch(() => undefined);
  await updateAudioGenJobBilling({ jobId, reconciliationRequired: true }).catch(() => undefined);
}

async function processClaimedJob(args: { jobId: string; workerId: string }) {
  const job = await getAudioGenJobByJobId(args.jobId);
  if (!job) {
    await removeProcessing(args.jobId).catch(() => undefined);
    return { ok: false, status: "missing_job", jobId: args.jobId };
  }
  if (isTerminalStudioAudioJobStatus(job.status)) {
    await removeProcessing(args.jobId).catch(() => undefined);
    await releaseLease(args.jobId, args.workerId).catch(() => undefined);
    return { ok: true, status: "skipped", jobId: args.jobId };
  }
  const loaded = await loadRequest(job);
  if (!loaded) {
    const refundError = await refundReservation(job, "request_missing").then(() => null).catch((error) => error);
    if (refundError) {
      await markUnknown(job.jobId, refundError);
      await removeProcessing(args.jobId).catch(() => undefined);
      await releaseLease(args.jobId, args.workerId).catch(() => undefined);
      return { ok: false, status: "unknown_outcome", jobId: job.jobId };
    }
    await markAudioGenJobFailed({ jobId: job.jobId, code: "AUDIO_REQUEST_MISSING", message: "audio_request_missing" }).catch(() => undefined);
    await removeProcessing(args.jobId).catch(() => undefined);
    await releaseLease(args.jobId, args.workerId).catch(() => undefined);
    return { ok: false, status: "request_missing", jobId: job.jobId };
  }
  const running = await markAudioGenJobRunning({ jobId: job.jobId });
  if (!running) {
    await removeProcessing(args.jobId).catch(() => undefined);
    await releaseLease(args.jobId, args.workerId).catch(() => undefined);
    return { ok: true, status: "already_claimed", jobId: job.jobId };
  }

  const assets: string[] = [];
  const completedSegments: number[] = [];
  let heartbeatError: unknown = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let settlementAttempted = false;
  try {
    await refreshJobLease({ jobId: job.jobId, workerId: args.workerId });
    heartbeatTimer = setInterval(() => {
      if (heartbeatError) return;
      void refreshJobLease({ jobId: job.jobId, workerId: args.workerId }).catch((error) => {
        heartbeatError = error;
      });
    }, HEARTBEAT_INTERVAL_MS);
    await assertSystemModelEnabledOrThrow({ provider: loaded.request.provider, modelName: loaded.request.modelName, modality: "audio" });
    const existing = await listAudioAssetsByJobId(job.jobId);
    const currentJob = await getAudioGenJobByJobId(job.jobId);
    const accountedCharacters = Math.max(
      positiveInteger(currentJob?.billing?.completedCharacters),
      positiveInteger(currentJob?.billing?.generatedCharacters),
    );
    const existingCharacters = loaded.manifest.segments
      .filter((segment) => existing.some((asset) => asset.segmentIndex === segment.segmentIndex))
      .reduce((sum, segment) => sum + Math.max(0, Number(segment.charCount || 0)), 0);
    if (existingCharacters > accountedCharacters) {
      await refreshJobLease({ jobId: job.jobId, workerId: args.workerId, completedCharacters: existingCharacters - accountedCharacters });
    }
    for (const asset of existing) {
      assets.push(asset.assetId);
      completedSegments.push(asset.segmentIndex);
    }
    for (const segment of loaded.manifest.segments) {
      if (heartbeatError) throw heartbeatError;
      await refreshJobLease({ jobId: job.jobId, workerId: args.workerId });
      if (completedSegments.includes(segment.segmentIndex)) continue;
      const cached = await findReusableAudioAsset({
        uid: job.uid,
        segmentHash: segment.segmentHash,
        provider: loaded.request.provider,
        voiceId: loaded.request.voiceId,
        visibility: loaded.request.visibility,
      });
      if (cached) {
        const cloneStorage = await copyVoiceAssetToAccess({
          storage: cached.storage,
          targetAccess: loaded.request.visibility,
          targetKey: buildStudioAudioCloneStorageKey({
            visibility: loaded.request.visibility,
            uid: job.uid,
            jobId: job.jobId,
            segmentIndex: segment.segmentIndex,
            ext: cached.storage.ext || resolveAudioExt(cached.storage.mimeType, loaded.request.format),
          }),
          cacheControl: loaded.request.visibility === "public" ? "public, max-age=31536000, immutable" : "private, max-age=0, no-store",
        });
        let clone: IAudioAssetDocument;
        try {
          clone = await createAudioAsset({
            jobId: job.jobId,
            scope: loaded.request.scope,
            uid: job.uid,
            universeId: loaded.request.universeId,
            createdBy: job.createdBy,
            provider: loaded.request.provider,
            modelName: loaded.request.modelName,
            templateKey: loaded.request.templateKey,
            visibility: loaded.request.visibility,
            sourceService: loaded.request.sourceService,
            sourceSurface: loaded.request.sourceSurface,
            sourceRevision: loaded.request.sourceRevision,
            sourceHash: segment.sourceHash,
            segmentIndex: segment.segmentIndex,
            segmentCount: loaded.manifest.segmentCount,
            segmentHash: segment.segmentHash,
            manifestHash: loaded.manifest.manifestHash,
            audio: { ...cached.audio, sourceTextVersion: loaded.request.sourceRevision },
            storage: cloneStorage as never,
          });
        } catch (cloneError) {
          const deleted = await deleteVoiceAssetByStorage(cloneStorage).catch(() => false);
          if (!deleted) throw unknownOutcomeError("AUDIO_CACHE_CLONE_CLEANUP_FAILED", "cached audio clone cleanup failed");
          throw cloneError;
        }
        assets.push(clone.assetId);
        completedSegments.push(segment.segmentIndex);
        const progress = resolveStudioAudioProgressIncrement({ segmentCharacters: segment.charCount, completion: "cache" });
        await refreshJobLease({
          jobId: job.jobId,
          workerId: args.workerId,
          generatedCharacters: progress.generatedCharacters,
          completedCharacters: progress.completedCharacters,
        });
        continue;
      }

      await refreshJobLease({ jobId: job.jobId, workerId: args.workerId });
      const lease = await claimProviderOperationOrThrow(operationId(job.jobId, segment.segmentIndex));
      if (lease.kind === "replay") {
        const replayAssetId = safe(record(lease.result).assetId);
        const replayAsset = replayAssetId ? await getAudioAssetByAssetId(replayAssetId) : null;
        if (!replayAsset) throw new Error("AUDIO_PROVIDER_OPERATION_REPLAY_ASSET_MISSING");
        assets.push(replayAsset.assetId);
        completedSegments.push(segment.segmentIndex);
        const progress = resolveStudioAudioProgressIncrement({ segmentCharacters: segment.charCount, completion: "replay" });
        await refreshJobLease({
          jobId: job.jobId,
          workerId: args.workerId,
          generatedCharacters: progress.generatedCharacters,
          completedCharacters: progress.completedCharacters,
        });
        continue;
      }

      try {
        const result = await synthesizeSpeech({
          user: record(loaded.user),
          provider: loaded.request.provider,
          modelName: loaded.request.modelName,
          text: segment.text,
          format: loaded.request.format,
          speed: loaded.request.speed,
          locale: loaded.request.locale,
          routeHint: "ai",
          voiceProfile: {
            provider: loaded.request.provider,
            voiceId: loaded.request.voiceId,
            modelName: loaded.request.modelName,
            locale: loaded.request.locale,
            settings: loaded.request.settings as never,
            speechIntent: loaded.request.speechIntent as never,
            speed: loaded.request.speed,
          },
          speechIntent: loaded.request.speechIntent as never,
          settings: loaded.request.settings as never,
          billing: {
            uid: job.uid,
            app: BILLING_APP,
            routeHint: "ai",
            skipCharge: true,
            requireChargeContext: true,
            meta: { operationId: operationId(job.jobId, segment.segmentIndex), jobId: job.jobId, budgetOwner: "internal" },
          },
        });
        const contentType = String(result.contentType || "audio/mpeg").split(";")[0].trim().toLowerCase();
        if (heartbeatError) throw heartbeatError;
        const metadata = resolveStudioAudioMetadata({ audioBuffer: result.audioBuffer, contentType, format: loaded.request.format });
        if (!metadata) throw unknownOutcomeError("AUDIO_METADATA_UNAVAILABLE", "audio output metadata could not be resolved");
        const storageKey = `voice/studio/${loaded.request.visibility}/${job.uid}/${job.jobId}/${segment.segmentIndex}.${resolveAudioExt(contentType, loaded.request.format)}`;
        let storage: Awaited<ReturnType<typeof saveVoiceBufferToR2>> | null = null;
        try {
          storage = await saveVoiceBufferToR2({
          key: storageKey,
          body: result.audioBuffer,
          contentType,
          access: loaded.request.visibility,
          cacheControl: loaded.request.visibility === "public" ? "public, max-age=31536000, immutable" : "private, max-age=0, no-store",
          });
        } catch (storageError) {
          await deleteVoiceAssetByStorage({
            driver: "r2",
            access: loaded.request.visibility,
            bucket: loaded.request.visibility === "public" ? getR2PublicBucket() : getR2PrivateBucket(),
            key: storageKey,
          }).catch(() => false);
          const unknownError = new Error(safe(toErrorLike(storageError).message) || "audio_storage_persistence_failed") as Error & { providerCallState?: string };
          unknownError.providerCallState = "unknown_outcome";
          throw unknownError;
        }
        let asset: IAudioAssetDocument;
        try {
          asset = await createAudioAsset({
          jobId: job.jobId,
          scope: loaded.request.scope,
          uid: job.uid,
          universeId: loaded.request.universeId,
          createdBy: job.createdBy,
          provider: loaded.request.provider,
          modelName: loaded.request.modelName,
          templateKey: loaded.request.templateKey,
          visibility: loaded.request.visibility,
          sourceService: loaded.request.sourceService,
          sourceSurface: loaded.request.sourceSurface,
          sourceRevision: loaded.request.sourceRevision,
          sourceHash: segment.sourceHash,
          segmentIndex: segment.segmentIndex,
          segmentCount: loaded.manifest.segmentCount,
          segmentHash: segment.segmentHash,
          manifestHash: loaded.manifest.manifestHash,
          audio: {
            durationMs: metadata.durationMs,
            codec: metadata.codec,
            sampleRateHz: metadata.sampleRateHz,
            channels: metadata.channels,
            sourceTextVersion: loaded.request.sourceRevision,
            voiceProvenance: {
              provider: result.resolvedVoice.provider,
              voiceId: result.resolvedVoice.voiceId,
              voiceRevision: safe(result.resolvedVoice.voiceRevision) || "catalog-unknown",
              rightsStatus: safe(result.resolvedVoice.rightsStatus) || "unknown",
              source: safe(result.resolvedVoice.provenance) || "approved_catalog",
            },
          },
            storage: storage as never,
          });
        } catch (assetError) {
          await deleteVoiceAssetByStorage(storage).catch(() => false);
          const unknownError = new Error(safe(toErrorLike(assetError).message) || "audio_asset_persistence_failed") as Error & { providerCallState?: string };
          unknownError.providerCallState = "unknown_outcome";
          throw unknownError;
        }
        assets.push(asset.assetId);
        completedSegments.push(segment.segmentIndex);
        const progress = resolveStudioAudioProgressIncrement({ segmentCharacters: segment.charCount, completion: "provider" });
        await refreshJobLease({
          jobId: job.jobId,
          workerId: args.workerId,
          generatedCharacters: progress.generatedCharacters,
          completedCharacters: progress.completedCharacters,
        });
        await lease.complete({ assetId: asset.assetId, segmentIndex: segment.segmentIndex });
      } catch (error) {
        if (safe((error as { providerCallState?: unknown })?.providerCallState) !== "unknown_outcome") {
          await lease.release().catch(() => undefined);
        }
        throw error;
      }
    }
    completedSegments.sort((left, right) => left - right);
    if (completedSegments.length !== loaded.manifest.segmentCount) throw new Error("AUDIO_SEGMENT_COMPLETENESS_FAILED");
    if (heartbeatError) throw heartbeatError;
    await refreshJobLease({ jobId: job.jobId, workerId: args.workerId });
    const latestJob = await getAudioGenJobByJobId(job.jobId);
    if (!latestJob) throw unknownOutcomeError("AUDIO_JOB_MISSING_BEFORE_SETTLEMENT", "audio job disappeared before settlement");
    settlementAttempted = true;
    const settlement = await settleReservation(latestJob);
    const succeeded = await markAudioGenJobSuccess({
      jobId: job.jobId,
      assetIds: assets,
      completedSegments,
      actualCoins: settlement.actualCoins,
      refundedCoins: settlement.refundedCoins,
      generatedCharacters: settlement.generatedCharacters,
      settledCharacters: settlement.settledCharacters,
      settlementOperationId: settlement.settlementOperationId,
      settlementOperationIds: settlement.settlementOperationIds,
    });
    if (!succeeded) throw unknownOutcomeError("AUDIO_SETTLEMENT_PERSIST_FAILED", "audio settlement result could not be persisted");
    const redis = await getRedisClient();
    await redis.del(payloadKey(job.jobId));
    return { ok: true, status: "processed", jobId: job.jobId };
  } catch (error) {
    const providerCallState = safe((error as { providerCallState?: unknown })?.providerCallState);
    const errorCode = safe(toUnknownRecord(error).errorCode);
    if (errorCode === "PROVIDER_OPERATION_IN_PROGRESS") {
      await requeueClaimedJob(args.jobId, args.workerId).catch(() => undefined);
      return { ok: true, status: "busy", jobId: args.jobId };
    }
    if (
      settlementAttempted ||
      providerCallState === "unknown_outcome" ||
      safe(toUnknownRecord(error).errorCode) === "PROVIDER_OPERATION_UNAVAILABLE" ||
      safe(toUnknownRecord(error).message) === "AUDIO_PROVIDER_OPERATION_REPLAY_ASSET_MISSING"
    ) {
      await markUnknown(job.jobId, error);
      return { ok: false, status: "unknown_outcome", jobId: job.jobId };
    }
    const err = toErrorLike(error);
    try {
      const latestJob = await getAudioGenJobByJobId(job.jobId);
      if (!latestJob) throw unknownOutcomeError("AUDIO_JOB_MISSING_BEFORE_REFUND", "audio job disappeared before refund");
      settlementAttempted = true;
      const settlement = await settleReservation(latestJob);
      const failed = await markAudioGenJobFailed({
        jobId: job.jobId,
        code: safe(err.errorCode || err.code) || "AUDIO_JOB_FAILED",
        message: safe(err.message) || "audio_job_failed",
        billing: {
          actualCoins: settlement.actualCoins,
          refundedCoins: settlement.refundedCoins,
          generatedCharacters: settlement.generatedCharacters,
          settledCharacters: settlement.settledCharacters,
          settlementOperationId: settlement.settlementOperationId,
          settlementOperationIds: settlement.settlementOperationIds,
        },
      });
      if (!failed) throw unknownOutcomeError("AUDIO_SETTLEMENT_PERSIST_FAILED", "audio failure settlement could not be persisted");
      return { ok: false, status: "failed", jobId: job.jobId, error: safe(err.message) };
    } catch (settlementError) {
      await markUnknown(job.jobId, settlementError);
      return { ok: false, status: "unknown_outcome", jobId: job.jobId };
    }
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await removeProcessing(args.jobId).catch(() => undefined);
    await releaseLease(args.jobId, args.workerId).catch(() => undefined);
  }
}

export async function pollStudioAudioJobWorker(args: { workerId: string; jobId?: string }) {
  const workerId = safe(args.workerId) || `studio-audio-worker-${Date.now()}`;
  const claimed = await claimJob({ workerId, jobId: args.jobId });
  if (claimed.status !== "claimed") return { ok: true as const, status: claimed.status, jobId: claimed.jobId };
  return await processClaimedJob({ jobId: claimed.jobId, workerId });
}

export async function deleteStudioAudioAssetForUser(args: { uid: string; assetId: string; policy?: "soft" | "hard" | "detach"; reason?: string }) {
  const asset = await (async () => {
    const found = await getAudioAssetByAssetId(args.assetId);
    return found && found.uid === safe(args.uid) ? found : null;
  })();
  if (!asset) return { ok: false as const, error: "asset_not_found", errorCode: "NOT_FOUND" };
  const deleted = args.policy === "hard"
    ? await hardDeleteAudioAsset({ assetId: asset.assetId, deletedBy: args.uid, reason: args.reason })
    : args.policy === "detach"
      ? await detachAudioAsset({ assetId: asset.assetId, deletedBy: args.uid, reason: args.reason })
      : await softDeleteAudioAsset({ assetId: asset.assetId, deletedBy: args.uid, reason: args.reason });
  return { ok: true as const, asset: deleted };
}
