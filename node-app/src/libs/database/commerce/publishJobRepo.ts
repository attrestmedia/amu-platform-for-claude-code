import "server-only";
import crypto from "crypto";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  CommercePublishJobSchema,
  type ICommercePublishJobDocument,
  type CommercePublishJobStatusType,
  type CommercePublishOperationType,
} from "models/commerce";

const JOB_COLLECTION = "commerce_publish_jobs";

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toSafeDate(value?: Date | string | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function toJobStatus(raw?: string): CommercePublishJobStatusType {
  const value = toSafeString(raw).toLowerCase();
  if (
    value === "queued" ||
    value === "running" ||
    value === "success" ||
    value === "failed" ||
    value === "partial" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "queued";
}

function toOperation(raw?: string): CommercePublishOperationType {
  const value = toSafeString(raw).toLowerCase();
  if (value === "create" || value === "update" || value === "sync") return value;
  return "update";
}

function hashPayloadSnapshot(snapshot?: Record<string, unknown>) {
  try {
    return crypto.createHash("sha256").update(JSON.stringify(snapshot || {}), "utf8").digest("hex");
  } catch {
    return crypto.createHash("sha256").update("{}", "utf8").digest("hex");
  }
}

export function buildCommercePublishJobDedupeKey(args: {
  universeId: string;
  draftId: string;
  operation: CommercePublishOperationType | string;
  payloadHash?: string;
  draftRevision?: number;
}) {
  const revision = Number(args.draftRevision);
  const stableSuffix = Number.isFinite(revision)
    ? String(Math.max(0, Math.trunc(revision)))
    : toSafeString(args.payloadHash);
  return `${toSafeString(args.universeId)}:${toSafeString(args.draftId)}:${toOperation(args.operation)}:${stableSuffix}`;
}

async function getCommercePublishJobModel() {
  return await getModel<ICommercePublishJobDocument>(
    MONGODB_AMU_URL,
    "CommercePublishJob",
    CommercePublishJobSchema,
    JOB_COLLECTION,
  );
}

export async function createCommercePublishJob(input: {
  draftId: string;
  universeId: string;
  provider?: "naver";
  operation: CommercePublishOperationType | string;
  actor: string;
  draftRevision?: number;
  payloadHash?: string;
  dedupeKey?: string;
  idempotencyKey?: string;
  attempt?: number;
  requestSnapshot?: Record<string, unknown>;
  targetRef?: Record<string, unknown>;
  status?: CommercePublishJobStatusType | string;
  queuedAt?: Date | string | null;
}) {
  const model = await getCommercePublishJobModel();
  const payloadHash = toSafeString(input.payloadHash) || hashPayloadSnapshot(input.requestSnapshot || {});
  const operation = toOperation(input.operation);
  const dedupeKey =
    toSafeString(input.dedupeKey) ||
    buildCommercePublishJobDedupeKey({
      universeId: input.universeId,
      draftId: input.draftId,
      operation,
      payloadHash,
      draftRevision: input.draftRevision,
    });

  const idempotencyKey = toSafeString(input.idempotencyKey) || (input.draftRevision != null ? dedupeKey : "");

  const doc = await model.create({
    jobId: makeId("commerce_publish"),
    draftId: toSafeString(input.draftId),
    universeId: toSafeString(input.universeId),
    provider: "naver",
    operation,
    status: toJobStatus(input.status),
    actor: toSafeString(input.actor),
    draftRevision: Math.max(0, Math.trunc(Number(input.draftRevision) || 1)),
    payloadHash,
    dedupeKey,
    idempotencyKey: idempotencyKey || undefined,
    attempt: Math.max(1, Number(input.attempt || 1)),
    requestSnapshot: input.requestSnapshot || {},
    responseSnapshot: {},
    targetRef: input.targetRef || {},
    queuedAt: toSafeDate(input.queuedAt) || new Date(),
  });

  return (doc.toObject?.() ?? doc) as ICommercePublishJobDocument;
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

/** 동일 revision·operation job을 Mongo unique key로 원자적으로 확보한다. */
export async function getOrCreateCommercePublishJob(input: Parameters<typeof createCommercePublishJob>[0]) {
  const idempotencyKey = toSafeString(input.idempotencyKey || input.dedupeKey);
  try {
    return await createCommercePublishJob({ ...input, idempotencyKey });
  } catch (error) {
    if (!idempotencyKey || !isDuplicateKeyError(error)) throw error;
    const model = await getCommercePublishJobModel();
    const existing = await model.findOne({ idempotencyKey }).lean();
    if (existing) return existing;
    throw error;
  }
}

export async function getCommercePublishJob(jobId: string) {
  const model = await getCommercePublishJobModel();
  return await model.findOne({ jobId: toSafeString(jobId) }).lean();
}

export async function listCommercePublishJobs(params: {
  universeId?: string;
  draftId?: string;
  status?: CommercePublishJobStatusType | CommercePublishJobStatusType[];
  operation?: CommercePublishOperationType | CommercePublishOperationType[];
  limit?: number;
}) {
  const model = await getCommercePublishJobModel();
  const cond: Record<string, unknown> = {};

  const universeId = toSafeString(params.universeId);
  if (universeId) cond.universeId = universeId;

  const draftId = toSafeString(params.draftId);
  if (draftId) cond.draftId = draftId;

  const statuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  if (statuses.length > 0) cond.status = { $in: statuses };

  const operations = Array.isArray(params.operation) ? params.operation : params.operation ? [params.operation] : [];
  if (operations.length > 0) cond.operation = { $in: operations };

  const limit = Math.max(1, Math.min(200, Number(params.limit || 50)));
  return await model.find(cond).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function findLatestPublishJobByDedupeKey(dedupeKey: string) {
  const model = await getCommercePublishJobModel();
  return await model.findOne({ dedupeKey: toSafeString(dedupeKey) }).sort({ createdAt: -1 }).lean();
}

/** draft의 최초 성공 create job — 스마트스토어 실제 등록 시각 복원용 */
export async function findEarliestSuccessfulCreatePublishJob(draftId: string) {
  const model = await getCommercePublishJobModel();
  return await model
    .findOne({ draftId: toSafeString(draftId), operation: "create", status: "success" })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
}

export async function markCommercePublishJobRunning(jobId: string) {
  const model = await getCommercePublishJobModel();
  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(jobId) },
      {
        $set: {
          status: "running",
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true },
    )
    .lean();
}

/** publish job 외부 호출도 queued → running 전이를 원자적으로 한 번만 허용한다. */
export async function claimCommercePublishJobExecution(args: { jobId: string; owner: string }) {
  const model = await getCommercePublishJobModel();
  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(args.jobId), status: "queued" },
      {
        $set: {
          status: "running",
          executionLockOwner: toSafeString(args.owner),
          executionLockAt: new Date(),
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true },
    )
    .lean();
}

export async function markCommercePublishJobSuccess(args: {
  jobId: string;
  responseSnapshot?: Record<string, unknown>;
  targetRef?: Record<string, unknown>;
  traceId?: string;
  completedAt?: Date | string | null;
}) {
  const model = await getCommercePublishJobModel();
  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(args.jobId) },
      {
        $set: {
          status: "success",
          responseSnapshot: args.responseSnapshot || {},
          targetRef: args.targetRef || {},
          traceId: toSafeString(args.traceId),
          completedAt: toSafeDate(args.completedAt) || new Date(),
          updatedAt: new Date(),
        },
        $unset: { executionLockOwner: 1, executionLockAt: 1 },
      },
      { new: true },
    )
    .lean();
}

export async function markCommercePublishJobFailed(args: {
  jobId: string;
  responseSnapshot?: Record<string, unknown>;
  error?: Record<string, unknown>;
  traceId?: string;
  completedAt?: Date | string | null;
}) {
  const model = await getCommercePublishJobModel();
  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(args.jobId) },
      {
        $set: {
          status: "failed",
          responseSnapshot: args.responseSnapshot || {},
          error: args.error || {},
          traceId: toSafeString(args.traceId),
          completedAt: toSafeDate(args.completedAt) || new Date(),
          updatedAt: new Date(),
        },
        $unset: { executionLockOwner: 1, executionLockAt: 1 },
      },
      { new: true },
    )
    .lean();
}

export async function markCommercePublishJobPartial(args: {
  jobId: string;
  responseSnapshot?: Record<string, unknown>;
  targetRef?: Record<string, unknown>;
  error?: Record<string, unknown>;
  traceId?: string;
  completedAt?: Date | string | null;
}) {
  const model = await getCommercePublishJobModel();
  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(args.jobId) },
      {
        $set: {
          status: "partial",
          responseSnapshot: args.responseSnapshot || {},
          targetRef: args.targetRef || {},
          error: args.error || {},
          traceId: toSafeString(args.traceId),
          completedAt: toSafeDate(args.completedAt) || new Date(),
          updatedAt: new Date(),
        },
        $unset: { executionLockOwner: 1, executionLockAt: 1 },
      },
      { new: true },
    )
    .lean();
}

export async function cancelCommercePublishJob(args: { jobId: string; responseSnapshot?: Record<string, unknown> }) {
  const model = await getCommercePublishJobModel();
  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(args.jobId) },
      {
        $set: {
          status: "cancelled",
          responseSnapshot: args.responseSnapshot || {},
          completedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { executionLockOwner: 1, executionLockAt: 1 },
      },
      { new: true },
    )
    .lean();
}
