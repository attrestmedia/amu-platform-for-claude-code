import "server-only";

import { getRedisClient } from "libs/cache/redisClient";
import {
  createContentGenJob,
  getContentGenJobByClientRequestId,
  getContentGenJobByJobId,
  markContentGenJobFailed,
} from "libs/database/lab";
import {
  handleUniverseContentBasic,
  handleUniverseContentCustom,
  handleUserContentBasic,
  handleUserContentCustom,
  type ContentBasicBody,
  type ContentCustomBody,
} from "libs/server-utils/api/contentBasicHandler";
import { resolveTextProvider } from "libs/server-utils/api/contentPipeline";
import { COMMERCE_NAMESPACE_KEY, CONTENT_STUDIO_NAMESPACE_KEY } from "consts/app/services";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { PromptGenType } from "types/app";
import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Gen Studio 콘텐츠 생성 서버 Job queue 처리
 * @process 요청 검증  Job 생성  Redis queue 적재  worker claim  콘텐츠 생성 핸들러 실행  상태 정리
 * @domain ai-content
 * @scope server-worker
 */

export type StudioContentJobKindType = "template-content" | "basic-content";

type StudioContentJobPayloadType = {
  kind: StudioContentJobKindType;
  payload: ContentBasicBody | ContentCustomBody;
  user: UnknownRecord;
  clientRequestId?: string;
};

const QUEUE_KEY = "amu:studio-content-jobs:queue";
const PROCESSING_KEY = "amu:studio-content-jobs:processing";
const PAYLOAD_KEY_PREFIX = "amu:studio-content-jobs:payload:";
const LEASE_KEY_PREFIX = "amu:studio-content-jobs:lease:";
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

function normalizeKind(raw: unknown): StudioContentJobKindType | "" {
  const value = toSafeString(raw);
  return value === "template-content" || value === "basic-content" ? value : "";
}

function isTemplatePayload(kind: StudioContentJobKindType, payload: UnknownRecord): payload is ContentBasicBody {
  return kind === "template-content" && Boolean(toSafeString(payload.templateKey));
}

function isCustomPayload(kind: StudioContentJobKindType, payload: UnknownRecord): payload is ContentCustomBody {
  return kind === "basic-content" && Boolean(toSafeString(payload.prompt));
}

function normalizePayload(kind: StudioContentJobKindType, payloadRaw: unknown) {
  const payload = toUnknownRecord(payloadRaw);
  if (isTemplatePayload(kind, payload)) return payload;
  if (isCustomPayload(kind, payload)) return payload;
  return null;
}

function resolveScope(payload: ContentBasicBody | ContentCustomBody) {
  return toSafeString(payload.universeId) ? "universe" : "user";
}

function resolveGenerationMode(
  kind: StudioContentJobKindType,
  payload: ContentBasicBody | ContentCustomBody,
): PromptGenType {
  if (kind === "template-content") return payload.generationMode === "custom" ? "custom" : "template";
  return "custom";
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

export async function enqueueStudioContentJob(args: {
  kind: StudioContentJobKindType;
  payload: ContentBasicBody | ContentCustomBody;
  user: AuthenticatedUserType;
  clientRequestId?: string;
}) {
  const uid = resolveUid(args.user);
  if (!uid) return { ok: false as const, error: "UNAUTHORIZED" };

  const scope = resolveScope(args.payload);
  const clientRequestId = toSafeString(args.clientRequestId);
  if (scope === "user" && clientRequestId) {
    const existing = await getContentGenJobByClientRequestId({ uid, clientRequestId });
    const existingRec = toUnknownRecord(existing);
    if (toSafeString(existingRec.jobId)) {
      return {
        ok: true as const,
        job: {
          jobId: toSafeString(existingRec.jobId),
          status: toSafeString(existingRec.status),
          reused: true,
        },
      };
    }
  }

  const provider = resolveTextProvider({
    bodyProvider: args.payload.provider,
    modelName: args.payload.modelName,
  });
  const modelName = toSafeString(args.payload.modelName) || "auto";
  const job = await createContentGenJob({
    scope,
    uid,
    universeId: scope === "universe" ? toSafeString(args.payload.universeId) : "",
    createdBy: uid,
    provider,
    modelName,
    status: "queued",
    deletePolicy: "soft",
    request: {
      kind: args.kind,
      clientRequestId,
      templateKey: toSafeString(args.payload.templateKey),
      generationMode: resolveGenerationMode(args.kind, args.payload),
      platform: toSafeString(args.payload.platform),
      language: toSafeString(args.payload.language),
      length: toSafeString(args.payload.length),
      outputFormat: toSafeString(args.payload.outputFormat),
      n: Math.max(1, Number(args.payload.n || 1)),
      sourceService: toSafeString(args.payload.source?.service) || "unknown",
      sourceSurface: toSafeString(args.payload.source?.surface) || "unknown",
    },
  });

  const jobId = toSafeString(toUnknownRecord(job).jobId);
  const payload: StudioContentJobPayloadType = {
    kind: args.kind,
    payload: args.payload,
    user: buildUserSnapshot(args.user),
    clientRequestId,
  };

  try {
    const client = await getRedisClient();
    await client.set(getPayloadKey(jobId), JSON.stringify(payload), "EX", PAYLOAD_TTL_SECONDS);
    await client.rpush(QUEUE_KEY, jobId);
  } catch (error) {
    const err = toErrorLike(error);
    await markContentGenJobFailed({
      jobId,
      code: "QUEUE_ENQUEUE_FAILED",
      reason: toSafeString(err.message) || "studio_content_job_enqueue_failed",
    }).catch(() => null);
    throw error;
  }

  return {
    ok: true as const,
    job: {
      jobId,
      status: "queued",
      reused: false,
      request: {
        kind: args.kind,
        clientRequestId,
        templateKey: toSafeString(args.payload.templateKey),
        generationMode: resolveGenerationMode(args.kind, args.payload),
        n: Math.max(1, Number(args.payload.n || 1)),
      },
    },
  };
}

async function loadPayload(jobId: string) {
  const client = await getRedisClient();
  const raw = await client.get(getPayloadKey(jobId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StudioContentJobPayloadType;
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

function runContentHandler(args: {
  kind: StudioContentJobKindType;
  payload: ContentBasicBody | ContentCustomBody;
  user: UnknownRecord;
  jobId: string;
  clientRequestId: string;
}) {
  const isUniverse = Boolean(toSafeString(args.payload.universeId));
  // 동기 라우트(ai|commerce/generate/*-content)와 동일한 과금 네임스페이스·routeMeta를 유지한다.
  const opts = {
    appBillingKey: isUniverse ? COMMERCE_NAMESPACE_KEY : CONTENT_STUDIO_NAMESPACE_KEY,
    routeMeta: isUniverse ? "commerce/content" : "ai/content",
    costTracePilot: true,
    existingJobId: args.jobId,
    kind: args.kind,
    clientRequestId: args.clientRequestId,
  };

  if (args.kind === "template-content") {
    const payload = args.payload as ContentBasicBody;
    return isUniverse
      ? handleUniverseContentBasic(payload, args.user, opts)
      : handleUserContentBasic(payload, args.user, opts);
  }

  const payload = args.payload as ContentCustomBody;
  return isUniverse
    ? handleUniverseContentCustom(payload, args.user, opts)
    : handleUserContentCustom(payload, args.user, opts);
}

async function processClaimedJob(args: { jobId: string; workerId: string }) {
  const job = await getContentGenJobByJobId(args.jobId);
  const status = toSafeString(toUnknownRecord(job).status);
  if (!job || !["queued", "running"].includes(status)) {
    await removeProcessing(args.jobId);
    return { ok: true, status: job ? "skipped" : "missing_job", jobId: args.jobId };
  }

  const loaded = await loadPayload(args.jobId);
  if (!loaded) {
    await markContentGenJobFailed({
      jobId: args.jobId,
      code: "PAYLOAD_MISSING",
      reason: "studio_content_job_payload_missing",
    });
    await removeProcessing(args.jobId);
    return { ok: false, status: "payload_missing", jobId: args.jobId };
  }

  try {
    const result = await runContentHandler({
      kind: loaded.kind,
      payload: loaded.payload,
      user: loaded.user,
      jobId: args.jobId,
      clientRequestId: loaded.clientRequestId,
    });

    const resultRec = toUnknownRecord(result);
    if (resultRec.ok === false) {
      await markContentGenJobFailed({
        jobId: args.jobId,
        code: toSafeString(resultRec.errorCode),
        reason: toSafeString(resultRec.error) || "studio_content_job_failed",
      });
      return { ok: false, status: "failed", jobId: args.jobId, error: resultRec.error };
    }

    await deletePayload(args.jobId);
    return { ok: true, status: "processed", jobId: args.jobId };
  } catch (error) {
    const err = toErrorLike(error);
    await markContentGenJobFailed({
      jobId: args.jobId,
      code: toSafeString(err.errorCode || err.code),
      reason: toSafeString(err.message) || "studio_content_job_failed",
    }).catch((markError) => logger.warn("[studioContentJobQueue] mark failed error", markError));
    return { ok: false, status: "failed", jobId: args.jobId, error: toSafeString(err.message) };
  } finally {
    await removeProcessing(args.jobId).catch(() => null);
    await releaseLease(args.jobId, args.workerId).catch(() => null);
  }
}

export async function pollStudioContentJobWorker(args: { workerId: string; jobId?: string }) {
  const workerId = toSafeString(args.workerId) || `studio-content-worker-${Date.now()}`;
  const claimed = await claimJob({ workerId, jobId: args.jobId });
  if (claimed.status !== "claimed") {
    return { ok: true as const, status: claimed.status, jobId: claimed.jobId };
  }

  return await processClaimedJob({ jobId: claimed.jobId, workerId });
}
