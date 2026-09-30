import type { Model } from "mongoose";
import { getModel } from "libs/database/modelCache";
import { GameAssetPipelineSchema, type IGameAssetPipelineDocument } from "models/game";
import { MONGODB_GAME_URL } from "consts/env/server";
import type {
  CharacterBibleCandidateType,
  CharacterBibleSymmetryType,
  GameAssetPipelineFailureKindType,
  GameAssetPipelineStatusType,
  GameAssetPipelineStepStateType,
  IGameAssetPipelineDoc,
  SpriteDirectionType,
  SpritePipelineDirectionVerifyType,
  SpritePipelineStepKeyType,
} from "types/game/asset-pipeline";

/**
 * @docHint
 * @purpose game_asset_pipelines 원장 접근 + 원자적 상태 전이 헬퍼 (멱등 생성/step start·complete·fail)
 * @process 모델 getter  멱등 생성(unique 충돌 시 기존 반환)  findOneAndUpdate 조건부 전이(중복 실행 차단)
 * @domain game.asset-pipeline
 * @scope admin
 */

function makePipelineId() {
  return `gap_${crypto.randomUUID().replace(/-/g, "")}`;
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export async function getGameAssetPipelineModel(): Promise<Model<IGameAssetPipelineDocument>> {
  return getModel<IGameAssetPipelineDocument>(MONGODB_GAME_URL, "GameAssetPipeline", GameAssetPipelineSchema, "game_asset_pipelines");
}

export async function getGameAssetPipelineById(pipelineId: string) {
  const model = await getGameAssetPipelineModel();
  return await model.findOne({ pipelineId: String(pipelineId || "").trim() }).lean<IGameAssetPipelineDoc | null>();
}

export async function listGameAssetPipelines(args: {
  kind?: string;
  status?: GameAssetPipelineStatusType;
  createdBy?: string;
  page?: number;
  pageSize?: number;
}) {
  const model = await getGameAssetPipelineModel();
  const query: Record<string, unknown> = {};
  if (String(args.kind || "").trim()) query.kind = String(args.kind).trim();
  if (String(args.status || "").trim()) query.status = String(args.status).trim();
  if (String(args.createdBy || "").trim()) query.createdBy = String(args.createdBy).trim();

  const page = Math.max(1, Number(args.page || 1));
  const pageSize = Math.max(1, Math.min(50, Number(args.pageSize || 20)));

  const [items, total] = await Promise.all([
    model
      .find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<IGameAssetPipelineDoc[]>(),
    model.countDocuments(query),
  ]);

  return { items, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

// 멱등 생성 — idempotencyKey unique 인덱스로 경합을 DB 레벨에서 차단
export async function createGameAssetPipelineIfAbsent(
  input: Omit<IGameAssetPipelineDoc, "pipelineId" | "createdAt" | "updatedAt"> & { pipelineId?: string },
): Promise<{ pipeline: IGameAssetPipelineDoc; created: boolean }> {
  const model = await getGameAssetPipelineModel();
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (!idempotencyKey) throw new Error("pipeline_idempotency_key_required");

  const existing = await model.findOne({ idempotencyKey }).lean<IGameAssetPipelineDoc | null>();
  if (existing) return { pipeline: existing, created: false };

  try {
    const doc = await model.create({
      ...input,
      pipelineId: input.pipelineId || makePipelineId(),
      idempotencyKey,
    });
    return { pipeline: (doc.toObject?.() ?? doc) as IGameAssetPipelineDoc, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await model.findOne({ idempotencyKey }).lean<IGameAssetPipelineDoc | null>();
      if (raced) return { pipeline: raced, created: false };
    }
    throw error;
  }
}

// step 시작 — 허용 상태 + step pending/failed + attempt 상한 미만일 때만 원자 전이 (아니면 null = dedupe)
export async function startPipelineStepAtomic(args: {
  pipelineId: string;
  stepKey: SpritePipelineStepKeyType;
  allowedStatuses: GameAssetPipelineStatusType[];
  runningStatus: GameAssetPipelineStatusType;
  maxAttempts: number;
  updatedBy?: string;
}) {
  const model = await getGameAssetPipelineModel();
  const stepPath = `steps.${args.stepKey}`;
  const now = new Date();

  return await model
    .findOneAndUpdate(
      {
        pipelineId: String(args.pipelineId || "").trim(),
        status: { $in: args.allowedStatuses },
        $and: [
          {
            $or: [
              { [`${stepPath}.status`]: { $exists: false } },
              { [`${stepPath}.status`]: { $in: ["pending", "failed"] } },
            ],
          },
          { [`${stepPath}.attempt`]: { $not: { $gte: Math.max(1, args.maxAttempts) } } },
        ],
      },
      {
        $set: {
          status: args.runningStatus,
          [`${stepPath}.status`]: "running",
          [`${stepPath}.startedAt`]: now,
          [`${stepPath}.error`]: null,
          updatedBy: String(args.updatedBy || ""),
        },
        $inc: { [`${stepPath}.attempt`]: 1 },
      },
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function completePipelineStepAtomic(args: {
  pipelineId: string;
  stepKey: SpritePipelineStepKeyType;
  nextStatus: GameAssetPipelineStatusType;
  jobId?: string;
  assetIds?: string[];
  coins?: number;
  meta?: Record<string, unknown>;
  result?: Record<string, unknown>;
  freeRetryUsed?: boolean;
  updatedBy?: string;
}) {
  const model = await getGameAssetPipelineModel();
  const stepPath = `steps.${args.stepKey}`;
  const coins = Math.max(0, Number(args.coins || 0));
  const jobId = String(args.jobId || "").trim();

  const update: Record<string, Record<string, unknown>> = {
    $set: {
      status: args.nextStatus,
      [`${stepPath}.status`]: "success",
      [`${stepPath}.completedAt`]: new Date(),
      ...(jobId ? { [`${stepPath}.jobId`]: jobId } : {}),
      ...(Array.isArray(args.assetIds) ? { [`${stepPath}.assetIds`]: args.assetIds.filter(Boolean) } : {}),
      ...(args.meta ? { [`${stepPath}.meta`]: args.meta } : {}),
      ...(args.result ? { result: args.result } : {}),
      ...(typeof args.freeRetryUsed === "boolean"
        ? {
            [`${stepPath}.freeRetryUsed`]: args.freeRetryUsed,
            [`${stepPath}.freeRetryEligible`]: false,
          }
        : {}),
      updatedBy: String(args.updatedBy || ""),
    },
  };
  if (jobId && coins >= 0) {
    update.$push = { "billing.jobs": { jobId, step: args.stepKey, coins } };
    update.$inc = { "billing.totalCoins": coins };
  }

  return await model
    .findOneAndUpdate(
      { pipelineId: String(args.pipelineId || "").trim(), [`${stepPath}.status`]: "running" },
      update,
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

// STEP4 검증 결과 반영 — 전량 통과=composing, 부분 실패=verify_failed + 실패 소스 step/후속 step 조건부 리셋
// attempt 카운터는 리셋하지 않음: step별 상한(최초+재시도 1회)이 재생성 1회 상한을 그대로 강제한다 (D2 계약)
export async function completeVerifyStepAtomic(args: {
  pipelineId: string;
  directions: Record<string, unknown>;
  allPassed: boolean;
  meta?: Record<string, unknown>;
  updatedBy?: string;
}) {
  const model = await getGameAssetPipelineModel();
  const stepPath = "steps.step4-verify";
  const now = new Date();

  const directionSets = Object.fromEntries(
    Object.entries(args.directions || {}).map(([direction, state]) => [`directions.${direction}`, state]),
  );

  const set: Record<string, unknown> = {
    ...directionSets,
    updatedBy: String(args.updatedBy || ""),
    ...(args.meta ? { [`${stepPath}.meta`]: args.meta } : {}),
  };

  if (args.allPassed) {
    set.status = "composing";
    set[`${stepPath}.status`] = "success";
    set[`${stepPath}.completedAt`] = now;
  } else {
    set.status = "verify_failed";
    // F4: 검증은 완료 처리하고 실패 방향만 step2-dir 큐로 넘긴다. 통과 strip과 sheet4 산출물은 보존한다.
    set[`${stepPath}.status`] = "success";
    set[`${stepPath}.completedAt`] = now;
    set["steps.step2-dir.status"] = "pending";
    set["steps.step2-dir.attempt"] = 0;
    set["steps.step2-dir.error"] = null;
  }

  return await model
    .findOneAndUpdate(
      { pipelineId: String(args.pipelineId || "").trim(), [`${stepPath}.status`]: "running" },
      { $set: set },
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function startDirectionRegenAtomic(args: {
  pipelineId: string;
  direction: SpriteDirectionType;
  maxAttempts: number;
  updatedBy?: string;
}) {
  const model = await getGameAssetPipelineModel();
  const directionPath = `directions.${args.direction}`;
  const regenPath = `${directionPath}.regen`;
  const maxAttempts = Math.max(1, Number(args.maxAttempts || 1));
  return model
    .findOneAndUpdate(
      {
        pipelineId: String(args.pipelineId || "").trim(),
        status: "verify_failed",
        "steps.step2-dir.status": { $in: ["pending", "failed"] },
        [`${directionPath}.status`]: "failed",
        [`${regenPath}.status`]: { $in: ["pending", "failed"] },
        [`${regenPath}.attempt`]: { $lt: maxAttempts },
      },
      {
        $set: {
          "steps.step2-dir.status": "running",
          "steps.step2-dir.startedAt": new Date(),
          "steps.step2-dir.error": null,
          [`${directionPath}.status`]: "regenerating",
          [`${regenPath}.status`]: "running",
          [`${regenPath}.startedAt`]: new Date(),
          [`${regenPath}.error`]: null,
          updatedBy: String(args.updatedBy || ""),
        },
        $inc: {
          "steps.step2-dir.attempt": 1,
          [`${regenPath}.attempt`]: 1,
        },
      },
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function completeDirectionRegenAtomic(args: {
  pipelineId: string;
  direction: SpriteDirectionType;
  stripAssetRef: string;
  stripStorage?: Record<string, unknown>;
  verify: SpritePipelineDirectionVerifyType;
  allDirectionsPassed: boolean;
  /** CK-202: STEP3 처리 방식 */
  method?: string;
  jobId?: string;
  coins?: number;
  freeRetryUsed?: boolean;
  updatedBy?: string;
}) {
  const model = await getGameAssetPipelineModel();
  const directionPath = `directions.${args.direction}`;
  const regenPath = `${directionPath}.regen`;
  const jobId = String(args.jobId || "").trim();
  const coins = Math.max(0, Number(args.coins || 0));
  const now = new Date();
  const set: Record<string, unknown> = {
    status: args.allDirectionsPassed ? "composing" : "verify_failed",
    "steps.step2-dir.status": args.allDirectionsPassed ? "success" : "pending",
    "steps.step2-dir.completedAt": now,
    [`${directionPath}.status`]: "passed",
    [`${directionPath}.stripAssetRef`]: args.stripAssetRef,
    [`${directionPath}.stripStorage`]: args.stripStorage || {},
    [`${directionPath}.verify`]: args.verify,
    [`${directionPath}.derivedFrom`]: null,
    [`${regenPath}.status`]: "success",
    [`${regenPath}.completedAt`]: now,
    ...(args.method ? { [`${directionPath}.method`]: args.method } : {}),
    ...(jobId ? { [`${regenPath}.jobId`]: jobId } : {}),
    ...(typeof args.freeRetryUsed === "boolean"
      ? { [`${regenPath}.freeRetryUsed`]: args.freeRetryUsed, [`${regenPath}.freeRetryEligible`]: false }
      : {}),
    updatedBy: String(args.updatedBy || ""),
  };
  const update: Record<string, Record<string, unknown>> = { $set: set };
  if (jobId) {
    update.$push = { "billing.jobs": { jobId, step: `step2-dir:${args.direction}`, coins } };
    update.$inc = { "billing.totalCoins": coins };
  }
  return model
    .findOneAndUpdate(
      {
        pipelineId: String(args.pipelineId || "").trim(),
        "steps.step2-dir.status": "running",
        [`${regenPath}.status`]: "running",
      },
      update,
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function failDirectionRegenAtomic(args: {
  pipelineId: string;
  direction: SpriteDirectionType;
  errorCode?: string;
  errorMessage?: string;
  failureKind: GameAssetPipelineFailureKindType;
  retryable: boolean;
  consumeAttempt: boolean;
  attemptsExhausted: boolean;
  jobId?: string;
  coins?: number;
  freeRetryUsed?: boolean;
  updatedBy?: string;
}) {
  const model = await getGameAssetPipelineModel();
  const directionPath = `directions.${args.direction}`;
  const regenPath = `${directionPath}.regen`;
  const jobId = String(args.jobId || "").trim();
  const coins = Math.max(0, Number(args.coins || 0));
  const update: Record<string, Record<string, unknown>> = {
    $set: {
      status: args.attemptsExhausted ? "failed" : "verify_failed",
      "steps.step2-dir.status": args.attemptsExhausted ? "failed" : "pending",
      "steps.step2-dir.completedAt": new Date(),
      "steps.step2-dir.error": {
        code: String(args.errorCode || ""),
        message: String(args.errorMessage || "direction_regeneration_failed"),
        kind: args.failureKind,
        retryable: args.retryable,
        attemptConsumed: args.consumeAttempt,
      },
      [`${directionPath}.status`]: "failed",
      [`${regenPath}.status`]: "failed",
      [`${regenPath}.completedAt`]: new Date(),
      [`${regenPath}.error`]: {
        code: String(args.errorCode || ""),
        message: String(args.errorMessage || "direction_regeneration_failed"),
        kind: args.failureKind,
        retryable: args.retryable,
        attemptConsumed: args.consumeAttempt,
      },
      ...(jobId ? { [`${regenPath}.jobId`]: jobId } : {}),
      ...(typeof args.freeRetryUsed === "boolean"
        ? { [`${regenPath}.freeRetryUsed`]: args.freeRetryUsed, [`${regenPath}.freeRetryEligible`]: false }
        : {}),
      updatedBy: String(args.updatedBy || ""),
    },
  };
  if (!args.consumeAttempt) update.$inc = { [`${regenPath}.attempt`]: -1, "steps.step2-dir.attempt": -1 };
  if (jobId) {
    update.$push = { "billing.jobs": { jobId, step: `step2-dir:${args.direction}`, coins } };
    update.$inc = { ...(update.$inc || {}), "billing.totalCoins": coins };
  }
  return model
    .findOneAndUpdate(
      {
        pipelineId: String(args.pipelineId || "").trim(),
        "steps.step2-dir.status": "running",
        [`${regenPath}.status`]: "running",
      },
      update,
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function completeDirectionMirrorAtomic(args: {
  pipelineId: string;
  sourceDirection: SpriteDirectionType;
  targetDirection: SpriteDirectionType;
  stripAssetRef: string;
  stripStorage?: Record<string, unknown>;
  verify: SpritePipelineDirectionVerifyType;
  allDirectionsPassed: boolean;
  updatedBy?: string;
}) {
  const model = await getGameAssetPipelineModel();
  const targetPath = `directions.${args.targetDirection}`;
  return model
    .findOneAndUpdate(
      {
        pipelineId: String(args.pipelineId || "").trim(),
        status: "verify_failed",
        [`directions.${args.sourceDirection}.status`]: "passed",
        [`${targetPath}.status`]: "failed",
      },
      {
        $set: {
          status: args.allDirectionsPassed ? "composing" : "verify_failed",
          "steps.step2-dir.status": args.allDirectionsPassed ? "success" : "pending",
          "steps.step2-dir.completedAt": new Date(),
          [`${targetPath}.status`]: "passed",
          [`${targetPath}.stripAssetRef`]: args.stripAssetRef,
          [`${targetPath}.stripStorage`]: args.stripStorage || {},
          [`${targetPath}.verify`]: args.verify,
          [`${targetPath}.derivedFrom`]: {
            direction: args.sourceDirection,
            transform: "mirror-x",
          },
          [`${targetPath}.regen.status`]: "success",
          [`${targetPath}.regen.completedAt`]: new Date(),
          [`${targetPath}.regen.error`]: null,
          [`${targetPath}.regen.freeRetryEligible`]: false,
          updatedBy: String(args.updatedBy || ""),
        },
      },
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function resetFailedDirectionRegensAtomic(args: {
  pipelineId: string;
  resetBy: string;
}) {
  const model = await getGameAssetPipelineModel();
  const pipeline = await getGameAssetPipelineById(args.pipelineId);
  const failedDirections = Object.entries(pipeline?.directions || {})
    .filter(([, state]) => state.regen?.status === "failed")
    .map(([direction]) => direction);
  if (pipeline?.status !== "failed" || failedDirections.length === 0) return null;
  const set: Record<string, unknown> = {
    status: "verify_failed",
    "steps.step2-dir.status": "pending",
    "steps.step2-dir.attempt": 0,
    "steps.step2-dir.error": null,
    updatedBy: String(args.resetBy || ""),
  };
  const inc: Record<string, number> = { "steps.step2-dir.resetCount": 1 };
  for (const direction of failedDirections) {
    set[`directions.${direction}.status`] = "failed";
    set[`directions.${direction}.regen.status`] = "pending";
    set[`directions.${direction}.regen.attempt`] = 0;
    set[`directions.${direction}.regen.error`] = null;
    inc[`directions.${direction}.regen.resetCount`] = 1;
  }
  return model
    .findOneAndUpdate(
      { pipelineId: String(args.pipelineId || "").trim(), status: "failed" },
      { $set: set, $inc: inc },
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function failPipelineStepAtomic(args: {
  pipelineId: string;
  stepKey: SpritePipelineStepKeyType;
  pipelineStatus: GameAssetPipelineStatusType;
  errorCode?: string;
  errorMessage?: string;
  failureKind: GameAssetPipelineFailureKindType;
  retryable: boolean;
  consumeAttempt: boolean;
  jobId?: string;
  coins?: number;
  meta?: Record<string, unknown>;
  updatedBy?: string;
}) {
  const model = await getGameAssetPipelineModel();
  const stepPath = `steps.${args.stepKey}`;
  const jobId = String(args.jobId || "").trim();
  const coins = Math.max(0, Number(args.coins || 0));
  const update: Record<string, Record<string, unknown>> = {
    $set: {
      status: args.pipelineStatus,
      [`${stepPath}.status`]: "failed",
      [`${stepPath}.completedAt`]: new Date(),
      [`${stepPath}.error`]: {
        code: String(args.errorCode || ""),
        message: String(args.errorMessage || "pipeline_step_failed"),
        kind: args.failureKind,
        retryable: args.retryable,
        attemptConsumed: args.consumeAttempt,
      },
      ...(jobId ? { [`${stepPath}.jobId`]: jobId } : {}),
      ...(args.meta ? { [`${stepPath}.meta`]: args.meta } : {}),
      updatedBy: String(args.updatedBy || ""),
    },
  };
  if (!args.consumeAttempt) {
    update.$inc = { [`${stepPath}.attempt`]: -1 };
  }
  if (jobId) {
    update.$push = { "billing.jobs": { jobId, step: args.stepKey, coins } };
    update.$inc = { ...(update.$inc || {}), "billing.totalCoins": coins };
  }

  return await model
    .findOneAndUpdate(
      { pipelineId: String(args.pipelineId || "").trim(), [`${stepPath}.status`]: "running" },
      update,
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function confirmPipelineBibleAtomic(args: {
  pipelineId: string;
  createdBy: string;
  candidate: CharacterBibleCandidateType;
  symmetry: CharacterBibleSymmetryType;
  idempotencyKey: string;
}) {
  const model = await getGameAssetPipelineModel();
  const candidate = args.candidate;
  return model
    .findOneAndUpdate(
      {
        pipelineId: String(args.pipelineId || "").trim(),
        createdBy: String(args.createdBy || "").trim(),
        status: "generating",
        "steps.step1-bible.status": "success",
        "steps.step1-bible.meta.candidate.assetId": candidate.assetId,
        "steps.step2-base.attempt": 0,
        "steps.step2-diagonal.attempt": 0,
        "anchor.bible": { $exists: false },
      },
      {
        $set: {
          idempotencyKey: String(args.idempotencyKey || "").trim(),
          "anchor.bible": {
            assetId: candidate.assetId,
            sha256: candidate.sha256,
            columns: candidate.columns,
            cellWidth: candidate.cellWidth,
            cellHeight: candidate.cellHeight,
            directions: candidate.directions,
            symmetry: args.symmetry,
            confirmedAt: new Date(),
          },
          updatedBy: String(args.createdBy || "").trim(),
        },
      },
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export async function resetPipelineStepAtomic(args: {
  pipelineId: string;
  stepKey: SpritePipelineStepKeyType;
  expectedAttempt: number;
  pipelineStatus: GameAssetPipelineStatusType;
  reason: string;
  resetBy: string;
}) {
  const model = await getGameAssetPipelineModel();
  const stepPath = `steps.${args.stepKey}`;
  const resetAt = new Date();
  const expectedAttempt = Math.max(1, Number(args.expectedAttempt || 0));

  return await model
    .findOneAndUpdate(
      {
        pipelineId: String(args.pipelineId || "").trim(),
        status: { $ne: "composed" },
        [`${stepPath}.status`]: { $in: ["pending", "failed"] },
        [`${stepPath}.attempt`]: expectedAttempt,
      },
      {
        $set: {
          status: args.pipelineStatus,
          [`${stepPath}.status`]: "pending",
          [`${stepPath}.attempt`]: 0,
          [`${stepPath}.startedAt`]: null,
          [`${stepPath}.completedAt`]: null,
          [`${stepPath}.error`]: null,
          ...(args.stepKey === "step1-bible"
            ? {
                [`${stepPath}.meta`]: null,
                [`${stepPath}.assetIds`]: [],
                [`${stepPath}.jobId`]: "",
              }
            : {}),
          updatedBy: String(args.resetBy || ""),
        },
        $inc: { [`${stepPath}.resetCount`]: 1 },
        $push: {
          adminResets: {
            stepKey: args.stepKey,
            previousAttempt: expectedAttempt,
            reason: String(args.reason || "").trim(),
            resetBy: String(args.resetBy || ""),
            resetAt,
          },
        },
      },
      { new: true },
    )
    .lean<IGameAssetPipelineDoc | null>();
}

export function getPipelineStepState(
  pipeline: IGameAssetPipelineDoc | null | undefined,
  stepKey: SpritePipelineStepKeyType,
): GameAssetPipelineStepStateType | undefined {
  const step = pipeline?.steps?.[stepKey];
  return step && typeof step === "object" ? (step as GameAssetPipelineStepStateType) : undefined;
}
