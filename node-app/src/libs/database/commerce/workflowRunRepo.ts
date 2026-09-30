import "server-only";
import crypto from "crypto";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  CommerceWorkflowRunSchema,
  type ICommerceWorkflowRunDocument,
} from "models/commerce/CommerceWorkflowRunSchema";
import {
  applyCommerceWorkflowEvent,
  assertCommerceWorkflowTransition,
  buildCommerceWorkflowStageIdempotencyKey,
  CommerceWorkflowIdempotencyConflictError,
  CommerceWorkflowRunNotFoundError,
  CommerceWorkflowStatusConflictError,
  CommerceWorkflowStateValidationError,
  getCommerceWorkflowResumePoint,
  normalizeCommerceWorkflowLineage,
  isCommerceWorkflowState,
  normalizeCommerceWorkflowRunSnapshot,
  normalizeCommerceWorkflowState,
  type CommerceWorkflowEvent,
  type CommerceWorkflowLineage,
  type CommerceWorkflowRunSnapshot,
  type CommerceWorkflowState,
} from "libs/server-utils/commerce/commerceWorkflowContract";

const WORKFLOW_RUN_COLLECTION = "commerce_workflow_runs";
const RUN_CAS_MAX_ATTEMPTS = 4;

function toSafeString(value: unknown, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function makeRunId() {
  return `commerce_run_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function getCommerceWorkflowRunModel() {
  return await getModel<ICommerceWorkflowRunDocument>(
    MONGODB_AMU_URL,
    "CommerceWorkflowRun",
    CommerceWorkflowRunSchema,
    WORKFLOW_RUN_COLLECTION,
  );
}

export type CommerceWorkflowRunRecord = CommerceWorkflowRunSnapshot & {
  runRevision: number;
  cancelledAt: string;
  cancelledBy: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  resume: ReturnType<typeof getCommerceWorkflowResumePoint>;
};

function toIsoString(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return toSafeString(value, 40);
}

/** 저장 문서를 계약 스냅샷으로 정규화한다. 라우트·UI는 항상 이 형태만 본다. */
function normalizeRun(doc?: Record<string, unknown> | null): CommerceWorkflowRunRecord | null {
  if (!doc) return null;
  const raw = ((doc as { toObject?: () => Record<string, unknown> }).toObject?.() ?? doc) as Record<string, unknown>;
  const snapshot = normalizeCommerceWorkflowRunSnapshot(raw as Partial<CommerceWorkflowRunSnapshot>);
  return {
    ...snapshot,
    runRevision: Math.max(1, Math.floor(Number(raw.runRevision) || 1)),
    cancelledAt: toIsoString(raw.cancelledAt),
    cancelledBy: toSafeString(raw.cancelledBy, 160),
    createdBy: toSafeString(raw.createdBy, 160),
    updatedBy: toSafeString(raw.updatedBy, 160),
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
    resume: getCommerceWorkflowResumePoint(snapshot),
  };
}

export async function createCommerceWorkflowRun(input: {
  universeId: string;
  draftId: string;
  draftRevision: number;
  idempotencyKey: string;
  createdBy: string;
  status?: CommerceWorkflowState;
  lineage?: Partial<CommerceWorkflowLineage>;
  estimatedCost?: number;
}) {
  const model = await getCommerceWorkflowRunModel();
  const universeId = toSafeString(input.universeId);
  const idempotencyKey = toSafeString(input.idempotencyKey);
  const existing = await model.findOne({ universeId, idempotencyKey }).lean();
  if (existing) {
    if (
      toSafeString(existing.draftId) !== toSafeString(input.draftId) ||
      Number(existing.draftRevision) !== Number(input.draftRevision)
    ) {
      throw new CommerceWorkflowIdempotencyConflictError(universeId, idempotencyKey);
    }
    return normalizeRun(existing);
  }

  const status = input.status || "draft_created";
  if (!isCommerceWorkflowState(status)) throw new CommerceWorkflowStateValidationError(status);
  const seed = normalizeCommerceWorkflowRunSnapshot({
    runId: makeRunId(),
    universeId,
    draftId: toSafeString(input.draftId),
    draftRevision: Math.max(1, Math.floor(Number(input.draftRevision) || 1)),
    idempotencyKey,
    status,
    currentStage: status,
    lifecycle: "active",
    lineage: normalizeCommerceWorkflowLineage(input.lineage),
    estimatedCost: input.estimatedCost,
  });

  const doc = await model
    .create({
      ...seed,
      runRevision: 1,
      cancelledAt: null,
      cancelledBy: "",
      createdBy: toSafeString(input.createdBy),
      updatedBy: toSafeString(input.createdBy),
    })
    .catch(async (error: unknown) => {
      if ((error as { code?: number })?.code !== 11000) throw error;
      const concurrent = await model.findOne({ universeId, idempotencyKey }).lean();
      if (!concurrent) throw error;
      if (
        toSafeString(concurrent.draftId) !== toSafeString(input.draftId) ||
        Number(concurrent.draftRevision) !== Number(input.draftRevision)
      ) {
        throw new CommerceWorkflowIdempotencyConflictError(universeId, idempotencyKey);
      }
      return concurrent;
    });

  return normalizeRun(doc as unknown as Record<string, unknown>);
}

export async function getCommerceWorkflowRun(runId: string, universeId?: string) {
  const model = await getCommerceWorkflowRunModel();
  const filter: Record<string, unknown> = { runId: toSafeString(runId) };
  if (universeId) filter.universeId = toSafeString(universeId);
  return normalizeRun(await model.findOne(filter).lean());
}

export async function listCommerceWorkflowRuns(args: {
  universeId: string;
  draftId?: string;
  lifecycle?: string;
  limit?: number;
}) {
  const model = await getCommerceWorkflowRunModel();
  const filter: Record<string, unknown> = { universeId: toSafeString(args.universeId) };
  if (args.draftId) filter.draftId = toSafeString(args.draftId);
  if (args.lifecycle) filter.lifecycle = toSafeString(args.lifecycle, 40);
  const limit = Math.max(1, Math.min(50, Math.floor(Number(args.limit) || 10)));
  const docs = await model.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
  return docs.map((doc) => normalizeRun(doc)).filter(Boolean) as CommerceWorkflowRunRecord[];
}

/** draft당 진행 중인 run은 하나로 유지한다. 재개는 새 run이 아니라 이 run을 다시 쓰는 것이다. */
export async function getActiveCommerceWorkflowRun(args: { universeId: string; draftId: string }) {
  const model = await getCommerceWorkflowRunModel();
  const doc = await model
    .findOne({
      universeId: toSafeString(args.universeId),
      draftId: toSafeString(args.draftId),
      lifecycle: { $in: ["active", "failed"] },
    })
    .sort({ updatedAt: -1 })
    .lean();
  return normalizeRun(doc);
}

/**
 * 이벤트를 순수 reducer로 계산한 뒤 runRevision CAS로 저장한다.
 * 동시 요청이 같은 단계를 두 번 진행시키거나 갱신을 덮어쓰는 경로를 막는다.
 */
async function applyWorkflowEvent(args: {
  runId: string;
  universeId: string;
  actor: string;
  event: CommerceWorkflowEvent;
}) {
  const model = await getCommerceWorkflowRunModel();
  const runId = toSafeString(args.runId);
  const universeId = toSafeString(args.universeId);
  const actor = toSafeString(args.actor, 160);

  for (let attempt = 0; attempt < RUN_CAS_MAX_ATTEMPTS; attempt += 1) {
    const current = await model.findOne({ runId, universeId }).lean();
    if (!current) throw new CommerceWorkflowRunNotFoundError(runId);
    const currentRevision = Math.max(1, Math.floor(Number(current.runRevision) || 1));
    const result = applyCommerceWorkflowEvent(current as Partial<CommerceWorkflowRunSnapshot>, args.event);
    if (!result.changed) return normalizeRun(current);

    const cancelling = args.event.type === "cancel_run";
    const updated = await model
      .findOneAndUpdate(
        { runId, universeId, runRevision: currentRevision },
        {
          $set: {
            status: result.run.status,
            currentStage: result.run.currentStage,
            lifecycle: result.run.lifecycle,
            stages: result.run.stages,
            stageAttempts: result.run.stageAttempts,
            lineage: result.run.lineage,
            estimatedCost: result.run.estimatedCost,
            appliedCost: result.run.appliedCost,
            lastError: result.run.lastError,
            cancelReason: result.run.cancelReason,
            ...(cancelling ? { cancelledAt: new Date(), cancelledBy: actor } : {}),
            runRevision: currentRevision + 1,
            updatedBy: actor,
          },
        },
        { new: true },
      )
      .lean();
    if (updated) return normalizeRun(updated);
  }

  const latest = await model.findOne({ runId, universeId }).lean();
  throw new CommerceWorkflowStatusConflictError(
    runId,
    normalizeCommerceWorkflowState(latest?.status),
    normalizeCommerceWorkflowState(latest?.status),
  );
}

export async function startCommerceWorkflowStage(args: {
  runId: string;
  universeId: string;
  stage: CommerceWorkflowState;
  idempotencyKey?: string;
  estimatedCost?: number;
  draftRevision?: number;
  actor: string;
}) {
  const runId = toSafeString(args.runId);
  const idempotencyKey =
    toSafeString(args.idempotencyKey, 240) ||
    buildCommerceWorkflowStageIdempotencyKey({ runId, stage: args.stage, attempt: 1 });
  return await applyWorkflowEvent({
    runId,
    universeId: args.universeId,
    actor: args.actor,
    event: {
      type: "start_stage",
      stage: args.stage,
      idempotencyKey,
      estimatedCost: args.estimatedCost,
      draftRevision: args.draftRevision,
    },
  });
}

export async function completeCommerceWorkflowStage(args: {
  runId: string;
  universeId: string;
  stage: CommerceWorkflowState;
  idempotencyKey?: string;
  appliedCost?: number;
  evidence?: Partial<CommerceWorkflowLineage>;
  actor: string;
}) {
  return await applyWorkflowEvent({
    runId: args.runId,
    universeId: args.universeId,
    actor: args.actor,
    event: {
      type: "complete_stage",
      stage: args.stage,
      idempotencyKey: args.idempotencyKey,
      appliedCost: args.appliedCost,
      evidence: args.evidence,
    },
  });
}

export async function failCommerceWorkflowStage(args: {
  runId: string;
  universeId: string;
  stage: CommerceWorkflowState;
  idempotencyKey?: string;
  error?: { code?: string; message?: string; retryable?: boolean; traceId?: string } | null;
  actor: string;
}) {
  return await applyWorkflowEvent({
    runId: args.runId,
    universeId: args.universeId,
    actor: args.actor,
    event: { type: "fail_stage", stage: args.stage, idempotencyKey: args.idempotencyKey, error: args.error },
  });
}

export async function retryCommerceWorkflowStage(args: {
  runId: string;
  universeId: string;
  stage: CommerceWorkflowState;
  actor: string;
}) {
  return await applyWorkflowEvent({
    runId: args.runId,
    universeId: args.universeId,
    actor: args.actor,
    event: { type: "retry_stage", stage: args.stage },
  });
}

export async function cancelCommerceWorkflowRun(args: {
  runId: string;
  universeId: string;
  reason?: string;
  actor: string;
}) {
  return await applyWorkflowEvent({
    runId: args.runId,
    universeId: args.universeId,
    actor: args.actor,
    event: { type: "cancel_run", reason: args.reason },
  });
}

export async function resumeCommerceWorkflowRun(args: { runId: string; universeId: string; actor: string }) {
  return await applyWorkflowEvent({
    runId: args.runId,
    universeId: args.universeId,
    actor: args.actor,
    event: { type: "resume_run" },
  });
}

/** 기존 호출부 호환용 단순 상태 전이. 취소된 run에는 적용되지 않는다. */
export async function transitionCommerceWorkflowRun(args: {
  runId: string;
  fromStatus: CommerceWorkflowState;
  toStatus: CommerceWorkflowState;
  updatedBy: string;
  appliedCost?: number;
  lastError?: Record<string, unknown> | null;
}) {
  assertCommerceWorkflowTransition(args.fromStatus, args.toStatus);
  const model = await getCommerceWorkflowRunModel();
  const runId = toSafeString(args.runId);
  const doc = await model
    .findOneAndUpdate(
      { runId, status: args.fromStatus, lifecycle: "active" },
      {
        $set: {
          status: args.toStatus,
          currentStage: args.toStatus,
          ...(args.appliedCost === undefined ? {} : { appliedCost: Math.max(0, Number(args.appliedCost) || 0) }),
          lastError: args.lastError || null,
          updatedBy: toSafeString(args.updatedBy, 160),
        },
        $inc: { runRevision: 1 },
      },
      { new: true },
    )
    .lean();
  if (doc) return normalizeRun(doc);

  const current = await model.findOne({ runId }).lean();
  if (!current) return null;
  throw new CommerceWorkflowStatusConflictError(
    runId,
    args.fromStatus,
    normalizeCommerceWorkflowState(current.status),
  );
}
