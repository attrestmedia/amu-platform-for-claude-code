import "server-only";

import { getRedisClient } from "libs/cache/redisClient";
import {
  createImageGenJob,
  getImageGenJobByClientRequestId,
  getImageGenJobByJobId,
  listImageAssets,
  markImageGenJobFailed,
} from "libs/database/lab/imageGenRepo";
import { handleUniverseImageBasic, handleUserImageBasic } from "libs/server-utils/api/imageBasicHandler";
import { handleUniverseImagePrompt, handleUserImagePrompt } from "libs/server-utils/api/imagePromptHandler";
import { resolveImageProvider } from "libs/server-utils/api/imagePipeline";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { ImageProviderType } from "types/ai";
import type { ImagePromptBodyType, ImagePromptCustomType, PromptGenType } from "types/app";
import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Gen Studio 이미지 생성 서버 Job queue 처리
 * @process 요청 검증  Job 생성  Redis queue 적재  worker claim  이미지 생성 핸들러 실행  상태 정리
 * @domain ai-image
 * @scope server-worker
 */

export type StudioImageJobKindType = "template-image" | "basic-image";

type StudioImageJobPayloadType = {
  kind: StudioImageJobKindType;
  payload: ImagePromptBodyType | ImagePromptCustomType;
  user: UnknownRecord;
  clientRequestId?: string;
};

const QUEUE_KEY = "amu:studio-image-jobs:queue";
const PROCESSING_KEY = "amu:studio-image-jobs:processing";
const PAYLOAD_KEY_PREFIX = "amu:studio-image-jobs:payload:";
const LEASE_KEY_PREFIX = "amu:studio-image-jobs:lease:";
const PAYLOAD_TTL_SECONDS = 60 * 60 * 24;
const LEASE_TTL_MS = 10 * 60 * 1000;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function getPayloadKey(jobId: string) {
  return `${PAYLOAD_KEY_PREFIX}${jobId}`;
}

function getLeaseKey(jobId: string) {
  return `${LEASE_KEY_PREFIX}${jobId}`;
}

function resolveUid(user: unknown) {
  const u = toUnknownRecord(user);
  return toSafeString(u.uid || u.ID || u.id || u.userId);
}

function buildUserSnapshot(user: AuthenticatedUserType) {
  const u = toUnknownRecord(user);
  return {
    uid: resolveUid(user),
    ID: toSafeString(u.ID || u.uid || u.id || u.userId),
    id: toSafeString(u.id || u.ID || u.uid || u.userId),
    userId: toSafeString(u.userId || u.ID || u.uid || u.id),
    userKey: toSafeString(u.userKey),
    userEmail: toSafeString(u.userEmail || u.email),
    userEmailLower: toSafeString(u.userEmailLower || u.email).toLowerCase(),
    email: toSafeString(u.email || u.userEmail),
    roles: Array.isArray(u.roles) ? u.roles : [],
  };
}

function normalizeKind(raw: unknown): StudioImageJobKindType | "" {
  const value = toSafeString(raw);
  return value === "template-image" || value === "basic-image" ? value : "";
}

function isTemplatePayload(kind: StudioImageJobKindType, payload: UnknownRecord): payload is ImagePromptBodyType {
  return kind === "template-image" && Boolean(toSafeString(payload.templateKey));
}

function isBasicPayload(kind: StudioImageJobKindType, payload: UnknownRecord): payload is ImagePromptCustomType {
  const hasPrompt = Boolean(toSafeString(payload.prompt));
  const hasBaseImage =
    (Array.isArray(payload.baseImages) && payload.baseImages.some((item) => Boolean(toUnknownRecord(item).data))) ||
    (Array.isArray(payload.modelImages) && payload.modelImages.some((item) => Boolean(toUnknownRecord(item).data)));
  return kind === "basic-image" && (hasPrompt || hasBaseImage);
}

function normalizePayload(kind: StudioImageJobKindType, payloadRaw: unknown) {
  const payload = toUnknownRecord(payloadRaw);
  if (isTemplatePayload(kind, payload)) return payload;
  if (isBasicPayload(kind, payload)) return payload;
  return null;
}

function resolveScope(payload: ImagePromptBodyType | ImagePromptCustomType) {
  return toSafeString(payload.universeId) ? "universe" : "user";
}

function resolveGenerationMode(kind: StudioImageJobKindType, payload: ImagePromptBodyType | ImagePromptCustomType): PromptGenType {
  if (kind === "template-image") return "template";
  return payload.generationMode === "template" ? "template" : "custom";
}

function resolveInitialProvider(payload: ImagePromptBodyType | ImagePromptCustomType): ImageProviderType {
  return resolveImageProvider({
    bodyProvider: payload.provider,
    modelName: toSafeString(payload.modelName) || undefined,
  });
}

function buildQueuedJobRequest(args: {
  kind: StudioImageJobKindType;
  payload: ImagePromptBodyType | ImagePromptCustomType;
  payloadKey: string;
  clientRequestId?: string;
}) {
  return {
    kind: args.kind,
    payloadKey: args.payloadKey,
    clientRequestId: toSafeString(args.clientRequestId),
    templateKey: toSafeString(args.payload.templateKey),
    generationMode: resolveGenerationMode(args.kind, args.payload),
    sourceService: toSafeString(args.payload.source?.service) || "unknown",
    sourceSurface: toSafeString(args.payload.source?.surface) || "unknown",
    aspectRatio: toSafeString(args.payload.aspectRatio),
    size: toSafeString(args.payload.size),
    n: Math.max(1, Number(args.payload.n || 1)),
  };
}

async function acquireLease(jobId: string, workerId: string) {
  const client = await getRedisClient();
  const result = await client.set(getLeaseKey(jobId), workerId, "PX", LEASE_TTL_MS, "NX");
  return result === "OK";
}

async function releaseLease(jobId: string, workerId: string) {
  const client = await getRedisClient();
  const key = getLeaseKey(jobId);
  const value = await client.get(key).catch(() => "");
  if (value === workerId) await client.del(key);
}

async function removeProcessing(jobId: string) {
  const client = await getRedisClient();
  await client.lrem(PROCESSING_KEY, 0, jobId);
}

async function claimJob(args: { workerId: string; jobId?: string }) {
  const client = await getRedisClient();
  const requestedJobId = toSafeString(args.jobId);
  if (requestedJobId) {
    const locked = await acquireLease(requestedJobId, args.workerId);
    if (!locked) return { status: "busy" as const, jobId: requestedJobId };

    await client.lrem(QUEUE_KEY, 0, requestedJobId);
    await client.lrem(PROCESSING_KEY, 0, requestedJobId);
    await client.rpush(PROCESSING_KEY, requestedJobId);
    return { status: "claimed" as const, jobId: requestedJobId };
  }

  const jobId = toSafeString(await client.rpoplpush(QUEUE_KEY, PROCESSING_KEY));
  if (!jobId) return { status: "idle" as const, jobId: "" };

  const locked = await acquireLease(jobId, args.workerId);
  if (!locked) {
    await client.lrem(PROCESSING_KEY, 0, jobId);
    await client.rpush(QUEUE_KEY, jobId);
    return { status: "busy" as const, jobId };
  }

  return { status: "claimed" as const, jobId };
}

export async function enqueueStudioImageJob(args: {
  kind: StudioImageJobKindType;
  payload: ImagePromptBodyType | ImagePromptCustomType;
  user: AuthenticatedUserType;
  clientRequestId?: string;
}) {
  const uid = resolveUid(args.user);
  if (!uid) return { ok: false as const, error: "UNAUTHORIZED" };

  const scope = resolveScope(args.payload);
  const clientRequestId = toSafeString(args.clientRequestId);
  // universe scope도 같은 기준으로 재사용한다. 이전에는 user scope만 걸러서 Store·유니버스 생성 화면의
  // 동일 요청 재전송이 매번 새 job이 되고 그대로 재과금됐다 (SSM-203).
  if (clientRequestId) {
    const existing = await getImageGenJobByClientRequestId({
      uid,
      clientRequestId,
      scope,
      universeId: scope === "universe" ? toSafeString(args.payload.universeId) : undefined,
    });
    if (existing?.jobId) {
      // 끝난 job인데 자산이 남아 있지 않으면 재사용해도 돌려줄 결과가 없다(라이브러리에서 삭제한 경우).
      // 그대로 재사용하면 코인은 안 쓰지만 원인 없는 실패가 재사용 지평 내내 반복된다.
      const existingStatus = toSafeString(existing.status);
      const isTerminalSuccess = existingStatus === "success" || existingStatus === "partial";
      const hasDeliverableAssets =
        !isTerminalSuccess ||
        (await listImageAssets({ scope: "all", jobIds: [toSafeString(existing.jobId)], state: "active", limit: 1 }))
          .length > 0;

      if (hasDeliverableAssets) {
        return {
          ok: true as const,
          job: {
            jobId: toSafeString(existing.jobId),
            status: existingStatus,
            reused: true,
          },
        };
      }
      logger.info("스튜디오 이미지 job 재사용 건너뜀 — 남은 자산 없음", {
        uid,
        jobId: toSafeString(existing.jobId),
        status: existingStatus,
      });
    }
  }

  const provider = resolveInitialProvider(args.payload);
  const modelName = toSafeString(args.payload.modelName) || "auto";
  const job = await createImageGenJob({
    scope,
    uid,
    universeId: scope === "universe" ? toSafeString(args.payload.universeId) : "",
    createdBy: uid,
    provider,
    modelName,
    status: "queued",
    request: {
      kind: args.kind,
      clientRequestId,
      templateKey: toSafeString(args.payload.templateKey),
      generationMode: resolveGenerationMode(args.kind, args.payload),
      sourceService: toSafeString(args.payload.source?.service) || "unknown",
      sourceSurface: toSafeString(args.payload.source?.surface) || "unknown",
      aspectRatio: toSafeString(args.payload.aspectRatio),
      size: toSafeString(args.payload.size),
      n: Math.max(1, Number(args.payload.n || 1)),
    },
  });

  const jobId = toSafeString(job.jobId);
  const payloadKey = getPayloadKey(jobId);
  const payload: StudioImageJobPayloadType = {
    kind: args.kind,
    payload: args.payload,
    user: buildUserSnapshot(args.user),
    clientRequestId,
  };

  try {
    const client = await getRedisClient();
    await client.set(payloadKey, JSON.stringify(payload), "EX", PAYLOAD_TTL_SECONDS);
    await client.rpush(QUEUE_KEY, jobId);
  } catch (error) {
    const err = toErrorLike(error);
    await markImageGenJobFailed({
      jobId,
      code: "QUEUE_ENQUEUE_FAILED",
      reason: toSafeString(err.message) || "studio_image_job_enqueue_failed",
    }).catch(() => null);
    throw error;
  }

  return {
    ok: true as const,
    job: {
      jobId,
      status: "queued",
      reused: false,
      request: buildQueuedJobRequest({ kind: args.kind, payload: args.payload, payloadKey, clientRequestId }),
    },
  };
}

async function loadPayload(jobId: string) {
  const client = await getRedisClient();
  const raw = await client.get(getPayloadKey(jobId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StudioImageJobPayloadType;
    const kind = normalizeKind(parsed?.kind);
    if (!kind) return null;
    const payload = normalizePayload(kind, parsed?.payload);
    if (!payload) return null;
    return {
      kind,
      payload,
      user: toUnknownRecord(parsed.user),
      clientRequestId: toSafeString(parsed.clientRequestId),
    };
  } catch {
    return null;
  }
}

async function deletePayload(jobId: string) {
  const client = await getRedisClient();
  await client.del(getPayloadKey(jobId));
}

async function processClaimedJob(args: { jobId: string; workerId: string }) {
  const job = await getImageGenJobByJobId(args.jobId);
  const status = toSafeString(job?.status);
  if (!job || !["queued", "running"].includes(status)) {
    await removeProcessing(args.jobId);
    return { ok: true, status: job ? "skipped" : "missing_job", jobId: args.jobId };
  }

  const loaded = await loadPayload(args.jobId);
  if (!loaded) {
    await markImageGenJobFailed({
      jobId: args.jobId,
      code: "PAYLOAD_MISSING",
      reason: "studio_image_job_payload_missing",
    });
    await removeProcessing(args.jobId);
    return { ok: false, status: "payload_missing", jobId: args.jobId };
  }

  try {
    const result = loaded.kind === "template-image"
      ? await (async () => {
          const payload = loaded.payload as ImagePromptBodyType;
          return payload.universeId
            ? handleUniverseImagePrompt(payload, loaded.user, {
                existingJobId: args.jobId,
                clientRequestId: loaded.clientRequestId,
              })
            : handleUserImagePrompt(payload, loaded.user, {
                existingJobId: args.jobId,
                clientRequestId: loaded.clientRequestId,
              });
        })()
      : await (async () => {
          const payload = loaded.payload as ImagePromptCustomType;
          return payload.universeId
            ? handleUniverseImageBasic(payload, loaded.user, {
                existingJobId: args.jobId,
                clientRequestId: loaded.clientRequestId,
              })
            : handleUserImageBasic(payload, loaded.user, {
                existingJobId: args.jobId,
                clientRequestId: loaded.clientRequestId,
              });
        })();

    const resultRec = toUnknownRecord(result);
    if (resultRec.ok === false) {
      await markImageGenJobFailed({
        jobId: args.jobId,
        code: toSafeString(resultRec.errorCode),
        reason: toSafeString(resultRec.error) || "studio_image_job_failed",
      });
      return { ok: false, status: "failed", jobId: args.jobId, error: resultRec.error };
    }

    await deletePayload(args.jobId);
    return { ok: true, status: "processed", jobId: args.jobId };
  } catch (error) {
    const err = toErrorLike(error);
    await markImageGenJobFailed({
      jobId: args.jobId,
      code: toSafeString(err.errorCode || err.code),
      reason: toSafeString(err.message) || "studio_image_job_failed",
    }).catch((markError) => logger.warn("[studioImageJobQueue] mark failed error", markError));
    return { ok: false, status: "failed", jobId: args.jobId, error: toSafeString(err.message) };
  } finally {
    await removeProcessing(args.jobId).catch(() => null);
    await releaseLease(args.jobId, args.workerId).catch(() => null);
  }
}

export async function pollStudioImageJobWorker(args: { workerId: string; jobId?: string }) {
  const workerId = toSafeString(args.workerId) || `studio-image-worker-${Date.now()}`;
  const claimed = await claimJob({ workerId, jobId: args.jobId });
  if (claimed.status !== "claimed") {
    return { ok: true as const, status: claimed.status, jobId: claimed.jobId };
  }

  return await processClaimedJob({ jobId: claimed.jobId, workerId });
}
