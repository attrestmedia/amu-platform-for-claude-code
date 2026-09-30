export const COMMERCE_WORKFLOW_STATES = [
  "draft_created",
  "model_reference_ready",
  "image_assets_ready",
  "product_content_ready",
  "publish_ready",
  "publishing",
  "published",
  "marketing_draft_ready",
  "waiting_review",
  "social_published",
  "measuring",
  "improvement_proposed",
] as const;

export type CommerceWorkflowState = (typeof COMMERCE_WORKFLOW_STATES)[number];

export function normalizeCommerceWorkflowState(value: unknown): CommerceWorkflowState {
  return (COMMERCE_WORKFLOW_STATES as readonly string[]).includes(String(value))
    ? (String(value) as CommerceWorkflowState)
    : "draft_created";
}

export function isCommerceWorkflowState(value: unknown): value is CommerceWorkflowState {
  return (COMMERCE_WORKFLOW_STATES as readonly string[]).includes(String(value));
}

const WORKFLOW_TRANSITIONS: Record<CommerceWorkflowState, readonly CommerceWorkflowState[]> = {
  draft_created: ["model_reference_ready"],
  model_reference_ready: ["image_assets_ready"],
  image_assets_ready: ["product_content_ready"],
  product_content_ready: ["publish_ready"],
  publish_ready: ["publishing"],
  publishing: ["published", "publish_ready"],
  published: ["marketing_draft_ready"],
  marketing_draft_ready: ["waiting_review"],
  waiting_review: ["social_published", "marketing_draft_ready"],
  social_published: ["measuring"],
  measuring: ["improvement_proposed"],
  improvement_proposed: ["marketing_draft_ready", "draft_created"],
};

export class CommerceWorkflowTransitionError extends Error {
  readonly errorCode = "commerce_workflow_invalid_transition";
  readonly status = 422;
  readonly details: { fromStatus: CommerceWorkflowState; toStatus: CommerceWorkflowState };

  constructor(fromStatus: CommerceWorkflowState, toStatus: CommerceWorkflowState) {
    super(`허용되지 않은 Commerce workflow 상태 전이입니다: ${fromStatus} → ${toStatus}`);
    this.name = "CommerceWorkflowTransitionError";
    this.details = { fromStatus, toStatus };
  }
}

export class CommerceWorkflowIdempotencyConflictError extends Error {
  readonly errorCode = "commerce_workflow_idempotency_conflict";
  readonly status = 409;
  readonly details: { universeId: string; idempotencyKey: string };

  constructor(universeId: string, idempotencyKey: string) {
    super("같은 멱등키로 다른 Commerce workflow를 만들 수 없습니다.");
    this.name = "CommerceWorkflowIdempotencyConflictError";
    this.details = { universeId, idempotencyKey };
  }
}

export class CommerceWorkflowStatusConflictError extends Error {
  readonly errorCode = "commerce_workflow_status_conflict";
  readonly status = 409;
  readonly details: { runId: string; expectedStatus: CommerceWorkflowState; currentStatus?: CommerceWorkflowState };

  constructor(runId: string, expectedStatus: CommerceWorkflowState, currentStatus?: CommerceWorkflowState) {
    super("Commerce workflow가 다른 작업에서 먼저 변경되었습니다.");
    this.name = "CommerceWorkflowStatusConflictError";
    this.details = { runId, expectedStatus, currentStatus };
  }
}

export class CommerceWorkflowStateValidationError extends Error {
  readonly errorCode = "commerce_workflow_invalid_state";
  readonly status = 422;
  readonly details: { state: unknown };

  constructor(state: unknown) {
    super("Commerce workflow 상태 값이 유효하지 않습니다.");
    this.name = "CommerceWorkflowStateValidationError";
    this.details = { state };
  }
}

export function assertCommerceWorkflowTransition(fromStatus: CommerceWorkflowState, toStatus: CommerceWorkflowState) {
  if (!isCommerceWorkflowState(fromStatus)) throw new CommerceWorkflowStateValidationError(fromStatus);
  if (!isCommerceWorkflowState(toStatus)) throw new CommerceWorkflowStateValidationError(toStatus);
  if (fromStatus === toStatus) return toStatus;
  if (WORKFLOW_TRANSITIONS[fromStatus]?.includes(toStatus)) return toStatus;
  throw new CommerceWorkflowTransitionError(fromStatus, toStatus);
}

export function getCommerceWorkflowTransitions(fromStatus: CommerceWorkflowState) {
  return [...(WORKFLOW_TRANSITIONS[fromStatus] || [])];
}

export const COMMERCE_API_SCHEMA_VERSION = 1;

export type CommerceApiMeta = {
  requestId?: string;
  idempotencyKey?: string;
  schemaVersion?: number;
};

export function buildCommerceApiSuccess<T>(data: T, meta: CommerceApiMeta = {}) {
  return {
    success: true as const,
    data,
    meta: { schemaVersion: COMMERCE_API_SCHEMA_VERSION, ...meta },
  };
}

export function buildCommerceApiError(args: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  retryable?: boolean;
}) {
  return {
    success: false as const,
    error: {
      code: args.code,
      message: args.message,
      ...(args.details ? { details: args.details } : {}),
      ...(args.retryable === undefined ? {} : { retryable: args.retryable }),
    },
    errorCode: args.code,
    message: args.message,
    meta: { schemaVersion: COMMERCE_API_SCHEMA_VERSION, ...(args.requestId ? { requestId: args.requestId } : {}) },
  };
}

export const COMMERCE_WORKFLOW_RUN_LIFECYCLES = ["active", "completed", "cancelled", "failed"] as const;

export type CommerceWorkflowRunLifecycle = (typeof COMMERCE_WORKFLOW_RUN_LIFECYCLES)[number];

export const COMMERCE_WORKFLOW_STAGE_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type CommerceWorkflowStageStatus = (typeof COMMERCE_WORKFLOW_STAGE_STATUSES)[number];

const TERMINAL_WORKFLOW_STATE: CommerceWorkflowState =
  COMMERCE_WORKFLOW_STATES[COMMERCE_WORKFLOW_STATES.length - 1];

export function isCommerceWorkflowRunLifecycle(value: unknown): value is CommerceWorkflowRunLifecycle {
  return (COMMERCE_WORKFLOW_RUN_LIFECYCLES as readonly string[]).includes(String(value));
}

export function isCommerceWorkflowStageStatus(value: unknown): value is CommerceWorkflowStageStatus {
  return (COMMERCE_WORKFLOW_STAGE_STATUSES as readonly string[]).includes(String(value));
}

export function normalizeCommerceWorkflowRunLifecycle(value: unknown): CommerceWorkflowRunLifecycle {
  return isCommerceWorkflowRunLifecycle(value) ? value : "active";
}

export function normalizeCommerceWorkflowStageStatus(value: unknown): CommerceWorkflowStageStatus {
  return isCommerceWorkflowStageStatus(value) ? value : "pending";
}

/** stage 실행 상태의 허용 전이. running 재진입은 동일 idempotencyKey일 때만 호출부에서 허용한다. */
const WORKFLOW_STAGE_TRANSITIONS: Record<CommerceWorkflowStageStatus, readonly CommerceWorkflowStageStatus[]> = {
  pending: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: ["pending", "running", "cancelled"],
  cancelled: ["pending", "running"],
};

/** run lifecycle 전이. cancelled는 종착 상태이며 재개 대신 새 run을 만든다. */
const WORKFLOW_LIFECYCLE_TRANSITIONS: Record<CommerceWorkflowRunLifecycle, readonly CommerceWorkflowRunLifecycle[]> = {
  active: ["completed", "cancelled", "failed"],
  failed: ["active", "cancelled"],
  completed: [],
  cancelled: [],
};

export function getCommerceWorkflowStageTransitions(status: CommerceWorkflowStageStatus) {
  return [...(WORKFLOW_STAGE_TRANSITIONS[status] || [])];
}

export function getCommerceWorkflowLifecycleTransitions(lifecycle: CommerceWorkflowRunLifecycle) {
  return [...(WORKFLOW_LIFECYCLE_TRANSITIONS[lifecycle] || [])];
}

export class CommerceWorkflowRunNotFoundError extends Error {
  readonly errorCode = "commerce_workflow_run_not_found";
  readonly status = 404;
  readonly details: { runId: string };

  constructor(runId: string) {
    super("Commerce workflow run을 찾을 수 없습니다.");
    this.name = "CommerceWorkflowRunNotFoundError";
    this.details = { runId };
  }
}

export class CommerceWorkflowRunLifecycleError extends Error {
  readonly errorCode = "commerce_workflow_run_not_active";
  readonly status = 409;
  readonly details: { runId: string; lifecycle: CommerceWorkflowRunLifecycle; attempted: string };

  constructor(runId: string, lifecycle: CommerceWorkflowRunLifecycle, attempted: string) {
    super(
      lifecycle === "cancelled"
        ? "취소된 Commerce workflow run은 이어서 실행할 수 없습니다. 새 run을 시작해 주세요."
        : "진행 중이 아닌 Commerce workflow run에는 이 작업을 적용할 수 없습니다.",
    );
    this.name = "CommerceWorkflowRunLifecycleError";
    this.details = { runId, lifecycle, attempted };
  }
}

export class CommerceWorkflowStageNotFoundError extends Error {
  readonly errorCode = "commerce_workflow_stage_not_found";
  readonly status = 404;
  readonly details: { runId: string; stage: CommerceWorkflowState };

  constructor(runId: string, stage: CommerceWorkflowState) {
    super("아직 시작하지 않은 Commerce workflow 단계입니다.");
    this.name = "CommerceWorkflowStageNotFoundError";
    this.details = { runId, stage };
  }
}

export class CommerceWorkflowStageStateError extends Error {
  readonly errorCode = "commerce_workflow_invalid_stage_state";
  readonly status = 422;
  readonly details: {
    runId: string;
    stage: CommerceWorkflowState;
    fromStatus: CommerceWorkflowStageStatus;
    toStatus: CommerceWorkflowStageStatus;
  };

  constructor(
    runId: string,
    stage: CommerceWorkflowState,
    fromStatus: CommerceWorkflowStageStatus,
    toStatus: CommerceWorkflowStageStatus,
  ) {
    super(`허용되지 않은 Commerce workflow 단계 전이입니다: ${fromStatus} → ${toStatus}`);
    this.name = "CommerceWorkflowStageStateError";
    this.details = { runId, stage, fromStatus, toStatus };
  }
}

/** 같은 단계를 다른 멱등키로 동시에 실행하려는 시도. 중복 생성·중복 과금을 막는 경계다. */
export class CommerceWorkflowStageConflictError extends Error {
  readonly errorCode = "commerce_workflow_stage_conflict";
  readonly status = 409;
  readonly details: {
    runId: string;
    stage: CommerceWorkflowState;
    status: CommerceWorkflowStageStatus;
    expectedIdempotencyKey: string;
    receivedIdempotencyKey: string;
  };

  constructor(args: {
    runId: string;
    stage: CommerceWorkflowState;
    status: CommerceWorkflowStageStatus;
    expectedIdempotencyKey: string;
    receivedIdempotencyKey: string;
  }) {
    super("이 단계는 다른 요청이 이미 처리 중이거나 완료했습니다. 진행 상태를 새로 고친 뒤 다시 시도해 주세요.");
    this.name = "CommerceWorkflowStageConflictError";
    this.details = { ...args };
  }
}

export function assertCommerceWorkflowStageTransition(
  runId: string,
  stage: CommerceWorkflowState,
  fromStatus: CommerceWorkflowStageStatus,
  toStatus: CommerceWorkflowStageStatus,
) {
  if (!isCommerceWorkflowStageStatus(fromStatus) || !isCommerceWorkflowStageStatus(toStatus)) {
    throw new CommerceWorkflowStageStateError(runId, stage, fromStatus, toStatus);
  }
  if (fromStatus === toStatus) return toStatus;
  if (WORKFLOW_STAGE_TRANSITIONS[fromStatus]?.includes(toStatus)) return toStatus;
  throw new CommerceWorkflowStageStateError(runId, stage, fromStatus, toStatus);
}

export function assertCommerceWorkflowLifecycleTransition(
  runId: string,
  fromLifecycle: CommerceWorkflowRunLifecycle,
  toLifecycle: CommerceWorkflowRunLifecycle,
  attempted: string,
) {
  if (fromLifecycle === toLifecycle) return toLifecycle;
  if (WORKFLOW_LIFECYCLE_TRANSITIONS[fromLifecycle]?.includes(toLifecycle)) return toLifecycle;
  throw new CommerceWorkflowRunLifecycleError(runId, fromLifecycle, attempted);
}

/** 단계·시도 회차까지 포함한 결정적 멱등키. 같은 회차의 재요청은 항상 같은 키를 만든다. */
export function buildCommerceWorkflowStageIdempotencyKey(args: {
  runId: string;
  stage: CommerceWorkflowState;
  attempt: number;
}) {
  const attempt = Math.max(1, Math.floor(Number(args.attempt) || 1));
  return `${String(args.runId || "").trim()}:${args.stage}:${attempt}`;
}

export type CommerceWorkflowLineage = {
  modelReferenceKitIds: string[];
  inputAssetIds: string[];
  generationJobIds: string[];
  outputAssetIds: string[];
  selectedAssetIds: string[];
  publishJobId: string;
  marketingJobIds: string[];
  campaignIds: string[];
};

export type CommerceWorkflowErrorRecord = {
  code: string;
  message: string;
  stage: string;
  retryable: boolean;
  traceId: string;
};

export type CommerceWorkflowStageRecord = {
  stage: CommerceWorkflowState;
  status: CommerceWorkflowStageStatus;
  attempt: number;
  idempotencyKey: string;
  draftRevision: number;
  estimatedCost: number;
  appliedCost: number;
  evidence: CommerceWorkflowLineage;
  lastError: CommerceWorkflowErrorRecord | null;
  startedAt: string;
  completedAt: string;
};

export type CommerceWorkflowRunSnapshot = {
  runId: string;
  universeId: string;
  draftId: string;
  draftRevision: number;
  idempotencyKey: string;
  status: CommerceWorkflowState;
  currentStage: CommerceWorkflowState;
  lifecycle: CommerceWorkflowRunLifecycle;
  stages: CommerceWorkflowStageRecord[];
  stageAttempts: Record<string, number>;
  lineage: CommerceWorkflowLineage;
  estimatedCost: number;
  appliedCost: number;
  lastError: CommerceWorkflowErrorRecord | null;
  cancelReason: string;
};

export type CommerceWorkflowEvent =
  | {
      type: "start_stage";
      stage: CommerceWorkflowState;
      idempotencyKey: string;
      estimatedCost?: number;
      draftRevision?: number;
      at?: string;
    }
  | {
      type: "complete_stage";
      stage: CommerceWorkflowState;
      idempotencyKey?: string;
      appliedCost?: number;
      evidence?: Partial<CommerceWorkflowLineage>;
      at?: string;
    }
  | {
      type: "fail_stage";
      stage: CommerceWorkflowState;
      idempotencyKey?: string;
      error?: Partial<CommerceWorkflowErrorRecord> | null;
      at?: string;
    }
  | { type: "retry_stage"; stage: CommerceWorkflowState; at?: string }
  | { type: "cancel_run"; reason?: string; at?: string }
  | { type: "resume_run"; at?: string };

const EMPTY_LINEAGE: CommerceWorkflowLineage = {
  modelReferenceKitIds: [],
  inputAssetIds: [],
  generationJobIds: [],
  outputAssetIds: [],
  selectedAssetIds: [],
  publishJobId: "",
  marketingJobIds: [],
  campaignIds: [],
};

const LINEAGE_LIST_KEYS = [
  "modelReferenceKitIds",
  "inputAssetIds",
  "generationJobIds",
  "outputAssetIds",
  "selectedAssetIds",
  "marketingJobIds",
  "campaignIds",
] as const;

function safeText(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function safeCost(value: unknown) {
  const cost = Math.floor(Number(value) || 0);
  return cost > 0 ? Math.min(cost, 100_000_000) : 0;
}

function uniqueIds(values: unknown) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => safeText(value, 160)).filter(Boolean)),
  );
}

export function normalizeCommerceWorkflowLineage(value?: Partial<CommerceWorkflowLineage> | null) {
  const raw = value || {};
  const lineage = { ...EMPTY_LINEAGE, publishJobId: safeText(raw.publishJobId, 160) };
  for (const key of LINEAGE_LIST_KEYS) lineage[key] = uniqueIds(raw[key]);
  return lineage;
}

function mergeLineage(base: CommerceWorkflowLineage, patch?: Partial<CommerceWorkflowLineage> | null) {
  if (!patch) return base;
  const next = { ...base, publishJobId: safeText(patch.publishJobId, 160) || base.publishJobId };
  for (const key of LINEAGE_LIST_KEYS) next[key] = uniqueIds([...base[key], ...uniqueIds(patch[key])]);
  return next;
}

export function normalizeCommerceWorkflowError(value?: Partial<CommerceWorkflowErrorRecord> | null) {
  if (!value) return null;
  return {
    code: safeText(value.code, 120),
    message: safeText(value.message, 1000),
    stage: safeText(value.stage, 120),
    retryable: Boolean(value.retryable),
    traceId: safeText(value.traceId, 160),
  };
}

export function normalizeCommerceWorkflowStage(value: Partial<CommerceWorkflowStageRecord> | null | undefined) {
  const stage = normalizeCommerceWorkflowState(value?.stage);
  return {
    stage,
    status: normalizeCommerceWorkflowStageStatus(value?.status),
    attempt: Math.max(1, Math.min(999, Math.floor(Number(value?.attempt) || 1))),
    idempotencyKey: safeText(value?.idempotencyKey, 240),
    draftRevision: Math.max(0, Math.floor(Number(value?.draftRevision) || 0)),
    estimatedCost: safeCost(value?.estimatedCost),
    appliedCost: safeCost(value?.appliedCost),
    evidence: normalizeCommerceWorkflowLineage(value?.evidence),
    lastError: normalizeCommerceWorkflowError(value?.lastError),
    startedAt: safeText(value?.startedAt, 40),
    completedAt: safeText(value?.completedAt, 40),
  } satisfies CommerceWorkflowStageRecord;
}

export function normalizeCommerceWorkflowRunSnapshot(
  value: Partial<CommerceWorkflowRunSnapshot> | null | undefined,
): CommerceWorkflowRunSnapshot {
  const stages = (Array.isArray(value?.stages) ? value.stages : []).map(normalizeCommerceWorkflowStage);
  const status = normalizeCommerceWorkflowState(value?.status);
  return {
    runId: safeText(value?.runId, 160),
    universeId: safeText(value?.universeId, 160),
    draftId: safeText(value?.draftId, 160),
    draftRevision: Math.max(0, Math.floor(Number(value?.draftRevision) || 0)),
    idempotencyKey: safeText(value?.idempotencyKey, 240),
    status,
    currentStage: normalizeCommerceWorkflowState(value?.currentStage ?? status),
    lifecycle: normalizeCommerceWorkflowRunLifecycle(value?.lifecycle),
    stages,
    stageAttempts: Object.fromEntries(stages.map((stage) => [stage.stage, stage.attempt])),
    lineage: normalizeCommerceWorkflowLineage(value?.lineage),
    estimatedCost: safeCost(value?.estimatedCost),
    appliedCost: safeCost(value?.appliedCost),
    lastError: normalizeCommerceWorkflowError(value?.lastError),
    cancelReason: safeText(value?.cancelReason, 400),
  };
}

function sumStageCost(stages: CommerceWorkflowStageRecord[], key: "estimatedCost" | "appliedCost") {
  return stages.reduce((total, stage) => total + safeCost(stage[key]), 0);
}

function withStages(run: CommerceWorkflowRunSnapshot, stages: CommerceWorkflowStageRecord[]) {
  return {
    ...run,
    stages,
    stageAttempts: Object.fromEntries(stages.map((stage) => [stage.stage, stage.attempt])),
    estimatedCost: sumStageCost(stages, "estimatedCost"),
    appliedCost: sumStageCost(stages, "appliedCost"),
  };
}

function findStage(run: CommerceWorkflowRunSnapshot, stage: CommerceWorkflowState) {
  return run.stages.find((item) => item.stage === stage) || null;
}

function assertRunActive(run: CommerceWorkflowRunSnapshot, attempted: string) {
  if (run.lifecycle !== "active") throw new CommerceWorkflowRunLifecycleError(run.runId, run.lifecycle, attempted);
}

function assertStageIdempotency(
  run: CommerceWorkflowRunSnapshot,
  stage: CommerceWorkflowStageRecord,
  receivedIdempotencyKey: string,
) {
  if (!receivedIdempotencyKey || receivedIdempotencyKey === stage.idempotencyKey) return;
  throw new CommerceWorkflowStageConflictError({
    runId: run.runId,
    stage: stage.stage,
    status: stage.status,
    expectedIdempotencyKey: stage.idempotencyKey,
    receivedIdempotencyKey,
  });
}

/**
 * workflow run에 이벤트를 적용한 결과를 계산한다. 저장소 접근이 없는 순수 함수이므로
 * 재개·재시도·취소 시나리오를 DB 없이 그대로 검증할 수 있다.
 */
export function applyCommerceWorkflowEvent(
  input: Partial<CommerceWorkflowRunSnapshot>,
  event: CommerceWorkflowEvent,
): { run: CommerceWorkflowRunSnapshot; changed: boolean; stage: CommerceWorkflowStageRecord | null } {
  const run = normalizeCommerceWorkflowRunSnapshot(input);
  const at = safeText(event.at, 40) || new Date().toISOString();

  if (event.type === "cancel_run") {
    if (run.lifecycle === "cancelled") return { run, changed: false, stage: null };
    assertCommerceWorkflowLifecycleTransition(run.runId, run.lifecycle, "cancelled", "cancel_run");
    const stages = run.stages.map((stage) =>
      stage.status === "running" || stage.status === "pending"
        ? { ...stage, status: "cancelled" as const, completedAt: at }
        : stage,
    );
    return {
      run: { ...withStages(run, stages), lifecycle: "cancelled", cancelReason: safeText(event.reason, 400) },
      changed: true,
      stage: null,
    };
  }

  if (event.type === "resume_run") {
    if (run.lifecycle === "active") return { run, changed: false, stage: null };
    assertCommerceWorkflowLifecycleTransition(run.runId, run.lifecycle, "active", "resume_run");
    return { run: { ...run, lifecycle: "active", lastError: null }, changed: true, stage: null };
  }

  assertRunActive(run, event.type);
  const targetStage = normalizeCommerceWorkflowState(event.stage);
  if (!isCommerceWorkflowState(event.stage)) throw new CommerceWorkflowStateValidationError(event.stage);
  const existing = findStage(run, targetStage);

  if (event.type === "start_stage") {
    const idempotencyKey = safeText(event.idempotencyKey, 240);
    if (!idempotencyKey) throw new CommerceWorkflowStageStateError(run.runId, targetStage, "pending", "running");
    assertCommerceWorkflowTransition(run.status, targetStage);

    if (existing) {
      // 같은 멱등키의 재요청은 중복 실행·중복 과금 없이 기존 기록을 그대로 돌려준다.
      if (existing.status === "running" || existing.status === "succeeded") {
        assertStageIdempotency(run, existing, idempotencyKey);
        return { run, changed: false, stage: existing };
      }
      assertCommerceWorkflowStageTransition(run.runId, targetStage, existing.status, "running");
    }

    const nextStage: CommerceWorkflowStageRecord = {
      ...(existing || normalizeCommerceWorkflowStage({ stage: targetStage })),
      stage: targetStage,
      status: "running",
      idempotencyKey,
      draftRevision: Math.max(0, Math.floor(Number(event.draftRevision) || existing?.draftRevision || 0)),
      estimatedCost: event.estimatedCost === undefined ? existing?.estimatedCost || 0 : safeCost(event.estimatedCost),
      lastError: null,
      startedAt: at,
      completedAt: "",
    };
    const stages = existing
      ? run.stages.map((item) => (item.stage === targetStage ? nextStage : item))
      : [...run.stages, nextStage];
    return {
      run: { ...withStages(run, stages), currentStage: targetStage, lastError: null },
      changed: true,
      stage: nextStage,
    };
  }

  if (!existing) throw new CommerceWorkflowStageNotFoundError(run.runId, targetStage);

  if (event.type === "complete_stage") {
    if (existing.status === "succeeded") {
      assertStageIdempotency(run, existing, safeText(event.idempotencyKey, 240));
      return { run, changed: false, stage: existing };
    }
    assertStageIdempotency(run, existing, safeText(event.idempotencyKey, 240));
    assertCommerceWorkflowStageTransition(run.runId, targetStage, existing.status, "succeeded");
    const nextStatus = assertCommerceWorkflowTransition(run.status, targetStage);
    const evidence = mergeLineage(existing.evidence, event.evidence);
    const nextStage: CommerceWorkflowStageRecord = {
      ...existing,
      status: "succeeded",
      appliedCost: existing.appliedCost + safeCost(event.appliedCost),
      evidence,
      lastError: null,
      completedAt: at,
    };
    const stages = run.stages.map((item) => (item.stage === targetStage ? nextStage : item));
    const lifecycle: CommerceWorkflowRunLifecycle = targetStage === TERMINAL_WORKFLOW_STATE ? "completed" : "active";
    return {
      run: {
        ...withStages(run, stages),
        status: nextStatus,
        currentStage: targetStage,
        lifecycle,
        lineage: mergeLineage(run.lineage, evidence),
        lastError: null,
      },
      changed: true,
      stage: nextStage,
    };
  }

  if (event.type === "fail_stage") {
    assertStageIdempotency(run, existing, safeText(event.idempotencyKey, 240));
    assertCommerceWorkflowStageTransition(run.runId, targetStage, existing.status, "failed");
    const lastError = normalizeCommerceWorkflowError({ stage: targetStage, retryable: true, ...(event.error || {}) });
    const nextStage: CommerceWorkflowStageRecord = { ...existing, status: "failed", lastError, completedAt: at };
    const stages = run.stages.map((item) => (item.stage === targetStage ? nextStage : item));
    // 재시도 불가 오류는 run 전체를 멈춘다. 운영자가 명시적으로 재개해야 다음 단계가 진행된다.
    const lifecycle: CommerceWorkflowRunLifecycle = lastError?.retryable === false ? "failed" : "active";
    return {
      run: { ...withStages(run, stages), currentStage: targetStage, lifecycle, lastError },
      changed: true,
      stage: nextStage,
    };
  }

  // retry_stage: 실패·취소된 단계만 새 시도 회차로 되돌린다. 멱등키가 회차마다 바뀌어야 재실행이 중복으로 처리되지 않는다.
  assertCommerceWorkflowStageTransition(run.runId, targetStage, existing.status, "pending");
  const attempt = Math.min(999, existing.attempt + 1);
  const nextStage: CommerceWorkflowStageRecord = {
    ...existing,
    status: "pending",
    attempt,
    idempotencyKey: buildCommerceWorkflowStageIdempotencyKey({ runId: run.runId, stage: targetStage, attempt }),
    lastError: null,
    startedAt: "",
    completedAt: "",
  };
  const stages = run.stages.map((item) => (item.stage === targetStage ? nextStage : item));
  return { run: { ...withStages(run, stages), currentStage: targetStage, lastError: null }, changed: true, stage: nextStage };
}

/** 중단 지점 계산. 재개 UI와 API가 같은 기준을 쓰도록 한 곳에서만 판단한다. */
export function getCommerceWorkflowResumePoint(input: Partial<CommerceWorkflowRunSnapshot>) {
  const run = normalizeCommerceWorkflowRunSnapshot(input);
  const blocked = run.stages.find((stage) => stage.status === "failed" || stage.status === "cancelled") || null;
  const running = run.stages.find((stage) => stage.status === "running") || null;
  const pending = run.stages.find((stage) => stage.status === "pending") || null;
  const nextStage = getCommerceWorkflowTransitions(run.status)[0] || null;
  const resumeStage = blocked?.stage || running?.stage || pending?.stage || nextStage;
  return {
    resumable: run.lifecycle === "active" || run.lifecycle === "failed",
    resumeStage,
    resumeAction: blocked ? ("retry_stage" as const) : running ? ("await_stage" as const) : ("start_stage" as const),
    blockedStage: blocked?.stage || null,
    lastError: blocked?.lastError || run.lastError,
  };
}
