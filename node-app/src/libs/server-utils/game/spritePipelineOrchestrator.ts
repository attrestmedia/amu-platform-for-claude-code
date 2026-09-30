import "server-only";
import crypto from "crypto";
import type { BaseImageType } from "types/app";
import type {
  CharacterBibleCandidateType,
  CharacterBibleSymmetryType,
  GameAssetPipelineStatusType,
  GameAssetPipelineStepStateType,
  IGameAssetPipelineDoc,
  SpriteDirectionType,
  SpritePipelineStepKeyType,
} from "types/game/asset-pipeline";
import { SPRITE_DIRECTIONS, SPRITE_PIPELINE_STEP_KEYS } from "types/game/asset-pipeline";
import {
  GAME_ASSET_IMAGE_PROMPT_TEMPLATES,
  SPRITE_SHEET_PROFILES,
  SPRITE_PIPELINE_V2_TEMPLATE_KEYS,
  SPRITE_SHEET_V2_CONTRACT,
  getSpriteSheet4PromptVariables,
  getSpriteSheetProfileKey,
  getChromaKeyPromptVariables,
  resolveSpriteModelSelection,
} from "consts/game/gameAssetTemplates";
import { IMAGE_STUDIO_NAMESPACE_KEY } from "consts/app";
import {
  SPRITE_BASE_DIRECTIONS,
  SPRITE_DIAGONAL_DIRECTIONS,
  SPRITE_PIPELINE_MAX_STEP_ATTEMPTS,
  SPRITE_PIPELINE_STEP_ALLOWED_STATUSES,
  SPRITE_PIPELINE_STEP_RUNNING_STATUS,
  buildPipelineStepClientRequestId,
  buildSpritePipelineIdempotencySource,
  buildSpritePipelineVariantKey,
  canStartPipelineStep,
  classifyPipelineStepFailure,
  isStepAllowedForStatus,
  normalizeSpriteActionVariables,
  resolveSpritePipelineAnchorAssetId,
  resolveStatusAfterStepSuccess,
  shouldWaiveSpriteVerificationRetry,
} from "utils/game/assetPipeline";
import {
  countImageReferenceInputs,
  filterImagePromptVariableDefaults,
  renderImagePrompt,
  resolveImagePromptNegative,
  resolveImageReferencePolicy,
} from "utils/lab";
import { generateSaveAndBillImages, resolveImageProvider } from "libs/server-utils/api/imagePipeline";
import { claimProviderOperationOrThrow, type ProviderOperationLease } from "libs/server-utils/api/providerOperationGuard";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import { getImageAssetByAssetId, createImageGenJob, markImageGenJobFailed } from "libs/database/lab/imageGenRepo";
import {
  completePipelineStepAtomic,
  completeVerifyStepAtomic,
  confirmPipelineBibleAtomic,
  createGameAsset,
  createGameAssetPipelineIfAbsent,
  failPipelineStepAtomic,
  getGameAssetPipelineById,
  getGameAssetModel,
  getPipelineStepState,
  startPipelineStepAtomic,
  startDirectionRegenAtomic,
} from "libs/database/game";
import { resolvePromptModelLock } from "utils/app/promptModelLock";
import {
  fetchPostProcessedSheetBuffer,
  postProcessSheetAsset,
  type SheetPostProcessOutputType,
} from "libs/server-utils/game/spriteSheetPostProcess";
import { saveDirectionStrip, sliceDirectionStrip, verifySheetSlices } from "libs/server-utils/game/spriteSheetVerifier";
import {
  buildSpriteSheetMeta,
  composeSpriteSheet,
  reflowSheet4GridToRuntimeRows,
} from "libs/server-utils/game/spriteSheetComposer";
import { resolveSmartCutPaths, saveBase64Image } from "libs/server-utils/file/fileStorage";
import { logger } from "utils/log";
import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { refundAIUsageOrThrow } from "libs/services/aiUsageBilling";
import { verifyCharacterBibleAsset } from "libs/server-utils/game/spriteBibleVerifier";
import { loadMotionGuideReference } from "libs/server-utils/game/motionGuideRenderer";
import {
  executeSpriteDirectionGeneration,
  executeSpriteDirectionMirror,
  fetchSpriteDirectionStripBuffer,
} from "libs/server-utils/game/spriteDirectionGenerationService";

/**
 * @docHint
 * @purpose 8방향 스프라이트 파이프라인 v2 오케스트레이션 (STEP 상태 머신 wrapper — 생성/과금은 기존 imagePipeline 경로 재사용)
 * @process 파이프라인 멱등 생성  step 원자 시작(중복 실행 차단)  코드 정본 템플릿 렌더  잡 사전 생성+existingJobId 재진입  성공/실패 원자 기록
 * @domain game.asset-pipeline
 * @scope admin
 */

const SPRITE_PIPELINE_TEMPLATE_VERSION = 3;
const SPRITE_PIPELINE_BIBLE_TEMPLATE_VERSION = 4;
const PIPELINE_META_ROUTE = "game/assets/pipeline";
const ANCHOR_FETCH_TIMEOUT_MS = 30_000;
const ANCHOR_MAX_BYTES = 24 * 1024 * 1024;

type StepTemplateKeyType =
  | typeof SPRITE_PIPELINE_V2_TEMPLATE_KEYS.bible
  | typeof SPRITE_PIPELINE_V2_TEMPLATE_KEYS.base4
  | typeof SPRITE_PIPELINE_V2_TEMPLATE_KEYS.diagonal4;

const STEP_TEMPLATE_KEY_MAP: Partial<Record<SpritePipelineStepKeyType, StepTemplateKeyType>> = {
  "step1-bible": SPRITE_PIPELINE_V2_TEMPLATE_KEYS.bible,
  "step2-base": SPRITE_PIPELINE_V2_TEMPLATE_KEYS.base4,
  "step2-diagonal": SPRITE_PIPELINE_V2_TEMPLATE_KEYS.diagonal4,
};

function codedError(message: string, errorCode: string, status = 400) {
  const err = new Error(message) as Error & { errorCode: string; status: number };
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

function sha256Hex(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// 코드 상수 배열이 정본 — DB 시딩본이 아닌 코드 템플릿으로 렌더 (accessLevel/드리프트 이슈 차단)
function getPipelineTemplate(templateKey: string) {
  const template = GAME_ASSET_IMAGE_PROMPT_TEMPLATES.find((item) => item.key === templateKey);
  if (!template) throw codedError(`pipeline_template_not_found:${templateKey}`, "PIPELINE_TEMPLATE_NOT_FOUND", 500);
  return template;
}

async function fetchImageAsBase64(url: string): Promise<BaseImageType> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANCHOR_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw codedError(`anchor_fetch_failed:${res.status}`, "ANCHOR_FETCH_FAILED", 502);
    const contentType = String(res.headers.get("content-type") || "image/webp").split(";")[0].trim();
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > ANCHOR_MAX_BYTES) {
      throw codedError("anchor_image_size_invalid", "ANCHOR_IMAGE_SIZE_INVALID", 400);
    }
    return { mimeType: contentType, data: buffer.toString("base64") };
  } finally {
    clearTimeout(timer);
  }
}

async function loadAnchorBaseImage(
  pipeline: IGameAssetPipelineDoc,
  options: { preferBible?: boolean } = {},
): Promise<BaseImageType> {
  const assetId = options.preferBible === false
    ? String(pipeline.anchor?.imageAssetId || "").trim()
    : resolveSpritePipelineAnchorAssetId(pipeline.anchor);
  if (assetId) {
    const asset = await getImageAssetByAssetId(assetId);
    if (!asset) throw codedError("anchor_image_asset_not_found", "ANCHOR_NOT_FOUND", 404);
    const display = await resolveImageAssetDisplayUrl(asset as unknown as { assetId?: string; storage?: unknown }, {
      delivery: "signed",
    });
    if (!display.url) throw codedError("anchor_image_url_unresolvable", "ANCHOR_URL_UNRESOLVABLE", 502);
    return await fetchImageAsBase64(display.url);
  }

  const sourceUrl = String(pipeline.anchor?.sourceUrl || "").trim();
  if (/^https?:\/\//.test(sourceUrl)) return await fetchImageAsBase64(sourceUrl);

  throw codedError("pipeline_anchor_missing", "PIPELINE_ANCHOR_MISSING", 400);
}

function buildInitialSteps(includeBible: boolean) {
  const steps: Record<string, GameAssetPipelineStepStateType> = {};
  for (const stepKey of SPRITE_PIPELINE_STEP_KEYS) {
    if (stepKey === "step1-bible" && !includeBible) continue;
    steps[stepKey] = { status: "pending", attempt: 0 };
  }
  return steps;
}

function buildInitialDirections() {
  const directions: IGameAssetPipelineDoc["directions"] = {};
  for (const direction of SPRITE_SHEET_V2_CONTRACT.rowOrder) {
    directions[direction] = { status: "pending" };
  }
  return directions;
}

export async function createSpritePipeline(args: {
  uid: string;
  anchorImageAssetId?: string;
  anchorSourceUrl?: string;
  name?: string;
  variables?: UnknownRecord;
  includeBible?: boolean;
}) {
  const uid = String(args.uid || "").trim();
  if (!uid) throw codedError("uid_required", "UNAUTHORIZED", 401);

  const anchorImageAssetId = String(args.anchorImageAssetId || "").trim();
  const anchorSourceUrl = String(args.anchorSourceUrl || "").trim();

  let anchorSha256 = "";
  if (anchorImageAssetId) {
    const asset = await getImageAssetByAssetId(anchorImageAssetId);
    if (!asset) throw codedError("anchor_image_asset_not_found", "ANCHOR_NOT_FOUND", 404);
    anchorSha256 = String(toUnknownRecord(toUnknownRecord(asset).storage).sha256 || "");
  } else if (/^https?:\/\//.test(anchorSourceUrl)) {
    anchorSha256 = "";
  } else {
    throw codedError("pipeline_anchor_required", "PIPELINE_ANCHOR_REQUIRED", 400);
  }

  const actionVariables = normalizeSpriteActionVariables(args.variables);
  const requestedModelSelection = resolveSpriteModelSelection({ variables: args.variables });
  if (requestedModelSelection.hasSelection && !requestedModelSelection.option) {
    throw codedError("sprite_model_not_allowed", "SPRITE_MODEL_NOT_ALLOWED", 400);
  }
  const includeBible = args.includeBible === true;
  const templateVersion = includeBible
    ? SPRITE_PIPELINE_BIBLE_TEMPLATE_VERSION
    : SPRITE_PIPELINE_TEMPLATE_VERSION;
  const anchorRef = anchorSha256 || anchorImageAssetId || anchorSourceUrl;
  const idempotencyKey = sha256Hex(
    buildSpritePipelineIdempotencySource({
      uid,
      anchorRef,
      templateVersion,
      // 4프레임은 F0~F4 멱등 키를 보존하고, 옵트인 프로필만 suffix로 분리한다.
      variantKey: [
        buildSpritePipelineVariantKey(actionVariables),
        requestedModelSelection.option
          ? `${requestedModelSelection.option.provider}-${requestedModelSelection.option.modelName}`
          : "",
      ]
        .filter(Boolean)
        .join(":"),
    }),
  );

  return await createGameAssetPipelineIfAbsent({
    kind: "character-sprite-v2",
    status: "draft",
    idempotencyKey,
    name: String(args.name || "").trim(),
    templateVersion,
    anchor: {
      imageAssetId: anchorImageAssetId,
      sourceUrl: anchorSourceUrl,
      sha256: anchorSha256,
    },
    variables: {
      ...actionVariables,
      ...(requestedModelSelection.option
        ? {
            sprite_model_provider: requestedModelSelection.option.provider,
            sprite_model_name: requestedModelSelection.option.modelName,
          }
        : {}),
      sprite_generation_mode: "sheet4",
    },
    steps: buildInitialSteps(includeBible),
    directions: buildInitialDirections(),
    billing: { totalCoins: 0, jobs: [] },
    createdBy: uid,
    updatedBy: uid,
  });
}

export type RunPipelineStepResultType =
  | { ok: true; deduped: boolean; reason?: string; pipeline: IGameAssetPipelineDoc }
  | { ok: false; error: string; errorCode?: string; status?: number; pipeline?: IGameAssetPipelineDoc };

async function recordPipelineStepFailure(args: {
  pipelineId: string;
  stepKey: SpritePipelineStepKeyType;
  attempt: number;
  retryStatus: GameAssetPipelineStatusType;
  error: unknown;
  billing?: { jobId: string; coins: number; meta?: Record<string, unknown> };
  updatedBy: string;
}) {
  const errLike = toErrorLike(args.error);
  const failure = classifyPipelineStepFailure(args.error);
  const attemptsExhausted = failure.consumesAttempt && args.attempt >= SPRITE_PIPELINE_MAX_STEP_ATTEMPTS;

  await failPipelineStepAtomic({
    pipelineId: args.pipelineId,
    stepKey: args.stepKey,
    pipelineStatus: attemptsExhausted ? "failed" : args.retryStatus,
    errorCode: String(errLike.errorCode || ""),
    errorMessage: String(errLike.message || "pipeline_step_failed"),
    failureKind: failure.kind,
    retryable: failure.retryable,
    consumeAttempt: failure.consumesAttempt,
    jobId: args.billing?.jobId,
    coins: args.billing?.coins,
    meta: args.billing?.meta,
    updatedBy: args.updatedBy,
  }).catch((markErr: unknown) => logger.warn("[SpritePipeline] failPipelineStepAtomic failed:", markErr));

  return errLike;
}

async function executeSpriteImageGeneration(args: {
  uid: string;
  pipeline: IGameAssetPipelineDoc;
  stepKey: SpritePipelineStepKeyType;
}): Promise<RunPipelineStepResultType> {
  const { uid, pipeline, stepKey } = args;
  const pipelineId = pipeline.pipelineId;
  const templateKey = STEP_TEMPLATE_KEY_MAP[stepKey];
  if (!templateKey) {
    return { ok: false, error: "step_template_not_mapped", errorCode: "STEP_TEMPLATE_NOT_MAPPED", status: 500 };
  }

  const stepState = getPipelineStepState(pipeline, stepKey);
  const attempt = Math.max(1, Number(stepState?.attempt || 1));
  const clientRequestId = buildPipelineStepClientRequestId(pipelineId, stepKey, attempt, stepState?.resetCount);
  let generatedBilling: { jobId: string; coins: number; meta?: Record<string, unknown> } | undefined;

  try {
    const template = getPipelineTemplate(templateKey);
    const defaultParams = toUnknownRecord(template.defaultParams);
    const modelLock = resolvePromptModelLock(defaultParams);
    const modelSelection = resolveSpriteModelSelection({
      variables: pipeline.variables,
      fallbackProvider: modelLock?.provider || defaultParams.provider,
      fallbackModelName: modelLock?.modelName || defaultParams.modelName,
    });
    if (modelSelection.hasSelection && !modelSelection.option) {
      throw codedError("sprite_model_not_allowed", "SPRITE_MODEL_NOT_ALLOWED", 400);
    }
    const provider = resolveImageProvider({
      bodyProvider: modelSelection.provider,
      modelName: modelSelection.modelName,
    });
    const modelName = modelSelection.modelName;

    const isBibleStep = stepKey === "step1-bible";
    const anchorImage = await loadAnchorBaseImage(pipeline, { preferBible: !isBibleStep });
    const baseImages: BaseImageType[] = [anchorImage];
    const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
    const profileKey = getSpriteSheetProfileKey(actionVariables.sprite_frame_count);
    const profile = SPRITE_SHEET_PROFILES[profileKey];
    const motionGuideVersion = Number(actionVariables.motion_guide_version || 0);
    const motionGuide =
      !isBibleStep && motionGuideVersion > 0
        ? await loadMotionGuideReference({
            actionKey: actionVariables.sprite_action_key,
            direction: stepKey === "step2-diagonal" ? "down-right" : "down",
            version: motionGuideVersion,
            frameCount: profile.frameCount,
          })
        : null;
    if (!isBibleStep && motionGuideVersion > 0 && !motionGuide) {
      throw codedError("motion_guide_not_found", "MOTION_GUIDE_NOT_FOUND", 409);
    }
    if (motionGuide) baseImages.push(motionGuide.image);

    const referencePolicy = resolveImageReferencePolicy(
      template.inputPolicy as Parameters<typeof resolveImageReferencePolicy>[0],
      provider,
    );
    const refCount = countImageReferenceInputs(baseImages);
    if (referencePolicy.required && refCount < referencePolicy.minCount) {
      return { ok: false, error: "reference_image_required", errorCode: "REFERENCE_IMAGE_REQUIRED", status: 400 };
    }

    const variables = {
      ...filterImagePromptVariableDefaults(defaultParams),
      ...toUnknownRecord(pipeline.variables),
      ...actionVariables,
      ...getChromaKeyPromptVariables(actionVariables.chroma_key_preset),
      ...(!isBibleStep
        ? getSpriteSheet4PromptVariables(
            profileKey,
            stepKey === "step2-diagonal" ? SPRITE_DIAGONAL_DIRECTIONS : SPRITE_BASE_DIRECTIONS,
          )
        : {}),
    };
    const negative = resolveImagePromptNegative(template.templateText, String(defaultParams.negative || ""));
    const prompt = renderImagePrompt(template.title, template.templateText, {
      negative,
      params: variables,
    });

    // 잡 사전 생성(queued) → existingJobId 재진입: replay가 반환한 원래 잡과 새 잡이 어긋나면 새 잡은 실패 감사 기록으로 종결한다.
    const queuedJob = await createImageGenJob({
      scope: "user",
      uid,
      createdBy: uid,
      provider,
      modelName,
      status: "queued",
      request: { templateKey, clientRequestId },
    });
    const jobId = String(toUnknownRecord(queuedJob).jobId || "");

    const result = await generateSaveAndBillImages({
      scope: "user",
      uid,
      provider,
      modelName,
      prompt,
      baseImages,
      n: 1,
      size: isBibleStep ? String(defaultParams.size || "1536x1024") : profile.sheet4Generation.size,
      aspectRatio: isBibleStep ? String(defaultParams.aspectRatio || "3:2") : profile.sheet4Generation.aspectRatio,
      metaRoute: `${PIPELINE_META_ROUTE}:${stepKey}`,
      appBillingKey: IMAGE_STUDIO_NAMESPACE_KEY,
      templateKey,
      existingJobId: jobId,
      background: String(defaultParams.background || ""),
      metaExtra: {
        pipelineId,
        stepKey,
        attempt,
        ...(motionGuide
          ? {
              motionGuide: {
                actionKey: motionGuide.ref.actionKey,
                direction: motionGuide.ref.direction,
                version: motionGuide.ref.version,
                sha256: motionGuide.ref.sha256,
                frameCount: motionGuide.ref.frameCount,
              },
            }
          : {}),
      },
      requestMeta: {
        generationMode: "template",
        clientRequestId,
        templateTitle: template.title,
        negative,
      },
      promptSnapshot: {
        title: template.title,
        templateText: template.templateText,
        defaultParams,
        inputPolicy: template.inputPolicy as UnknownRecord | undefined,
        tags: template.tags,
        categories: template.categories,
        version: template.version,
        enabled: template.enabled,
        renderedPrompt: prompt,
        negative,
        variables,
      },
    });

    const data = toUnknownRecord(toUnknownRecord(result).data);
    const replayedJobId = String(data.jobId || "");
    if (jobId && replayedJobId && replayedJobId !== jobId) {
      await markImageGenJobFailed({
        jobId,
        reason: "provider_operation_replay_superseded_queued_job",
        code: "PROVIDER_OPERATION_REPLAY_SUPERSEDED_JOB",
      }).catch((cleanupError: unknown) => {
        logger.warn("[SpritePipeline] replay queued job cleanup failed:", cleanupError);
      });
    }
    const billedJobId = String(data.jobId || jobId);
    const grossCoins = Math.max(0, Number(data.coins || 0));
    const waiveRetryCharge = shouldWaiveSpriteVerificationRetry(stepState);
    let refundedCoins = 0;

    if (waiveRetryCharge && grossCoins > 0) {
      if (!billedJobId) {
        throw codedError("free_retry_job_id_missing", "FREE_RETRY_JOB_ID_MISSING", 500);
      }
      const refundRequestId = `sprite-free-retry:${billedJobId}`;
      await refundAIUsageOrThrow({
        uid,
        app: IMAGE_STUDIO_NAMESPACE_KEY,
        provider,
        modelName: String(data.billedModelName || modelName),
        modality: "image",
        fixed: { images: 1 },
        coins: grossCoins,
        meta: {
          kind: "refund",
          requestId: refundRequestId,
          operationId: refundRequestId,
          sourceOperationId: `image:${billedJobId}:generate`,
          route: `${PIPELINE_META_ROUTE}:${stepKey}:free-retry`,
          pipelineId,
          stepKey,
          attempt,
          jobId: billedJobId,
        },
      });
      refundedCoins = grossCoins;
    }
    const netCoins = Math.max(0, grossCoins - refundedCoins);
    let bibleCandidate: CharacterBibleCandidateType | undefined;
    if (isBibleStep) {
      generatedBilling = {
        jobId: billedJobId,
        coins: netCoins,
        meta: { clientRequestId, provider, modelName },
      };
      const bibleAssetId = String(Array.isArray(data.assetIds) ? data.assetIds[0] || "" : "").trim();
      if (!bibleAssetId) {
        throw codedError("character_bible_asset_missing", "CHARACTER_BIBLE_ASSET_MISSING", 502);
      }
      bibleCandidate = await verifyCharacterBibleAsset(bibleAssetId);
      generatedBilling.meta = { ...generatedBilling.meta, assetIds: [bibleAssetId], candidate: bibleCandidate };
      if (!bibleCandidate.allPassed) {
        throw codedError("character_bible_verification_failed", "CHARACTER_BIBLE_VERIFICATION_FAILED", 422);
      }
    }

    const nextStatus = resolveStatusAfterStepSuccess(stepKey, {
      ...pipeline.steps,
      [stepKey]: { ...(stepState || { attempt }), status: "success" } as GameAssetPipelineStepStateType,
    });

    const updated = await completePipelineStepAtomic({
      pipelineId,
      stepKey,
      nextStatus,
      jobId: billedJobId,
      assetIds: Array.isArray(data.assetIds) ? (data.assetIds as string[]) : [],
      coins: netCoins,
      meta: {
        clientRequestId,
        provider,
        modelName,
        billing: { grossCoins, refundedCoins, netCoins, freeRetry: waiveRetryCharge },
        ...(motionGuide
          ? {
              motionGuide: {
                actionKey: motionGuide.ref.actionKey,
                direction: motionGuide.ref.direction,
                version: motionGuide.ref.version,
                sha256: motionGuide.ref.sha256,
                frameCount: motionGuide.ref.frameCount,
              },
            }
          : {}),
        ...(bibleCandidate ? { candidate: bibleCandidate } : {}),
      },
      freeRetryUsed: waiveRetryCharge ? true : undefined,
      updatedBy: uid,
    });
    if (!updated) {
      logger.warn("[SpritePipeline] completePipelineStepAtomic missed (state drift):", { pipelineId, stepKey });
    }

    const latest = updated || (await getGameAssetPipelineById(pipelineId));
    return { ok: true, deduped: false, pipeline: latest || pipeline };
  } catch (error) {
    const errLike = await recordPipelineStepFailure({
      pipelineId,
      stepKey,
      attempt,
      retryStatus: "generating",
      error,
      billing: generatedBilling,
      updatedBy: uid,
    });

    logger.error(`[SpritePipeline] ${stepKey} failed:`, error);
    const latest = await getGameAssetPipelineById(pipelineId).catch(() => null);
    return {
      ok: false,
      error: String(errLike.message || "pipeline_step_failed"),
      errorCode: String(errLike.errorCode || "PIPELINE_STEP_FAILED"),
      status: Number(errLike.status || 500),
      pipeline: latest || undefined,
    };
  }
}

// STEP3 — step2 산출 시트 2장 후처리 (알파 품질 검사 → 필요 시에만 remove-bg, D2b 중간 산출물 보존)
async function executeStep3PostProcess(args: {
  uid: string;
  pipeline: IGameAssetPipelineDoc;
}): Promise<RunPipelineStepResultType> {
  const { uid, pipeline } = args;
  const pipelineId = pipeline.pipelineId;
  const stepKey: SpritePipelineStepKeyType = "step3-removebg";
  const stepState = getPipelineStepState(pipeline, stepKey);
  const attempt = Math.max(1, Number(stepState?.attempt || 1));

  try {
    const sources: Array<{ stepKey: SpritePipelineStepKeyType; assetId: string }> = (
      ["step2-base", "step2-diagonal"] as const
    ).map((sourceStep) => {
      const assetId = String(getPipelineStepState(pipeline, sourceStep)?.assetIds?.[0] || "");
      if (!assetId) {
        throw codedError(`step2_output_missing:${sourceStep}`, "STEP2_OUTPUT_MISSING", 409);
      }
      return { stepKey: sourceStep, assetId };
    });

    const outputs: SheetPostProcessOutputType[] = [];
    let totalCoins = 0;
    for (const source of sources) {
      const processed = await postProcessSheetAsset({
        uid,
        sourceAssetId: source.assetId,
        stepKey: source.stepKey,
      });
      outputs.push(processed.output);
      totalCoins += processed.coins;
    }

    const jobRef =
      totalCoins > 0 ? buildPipelineStepClientRequestId(pipelineId, stepKey, attempt, stepState?.resetCount) : "";
    const updated = await completePipelineStepAtomic({
      pipelineId,
      stepKey,
      nextStatus: resolveStatusAfterStepSuccess(stepKey, pipeline.steps),
      jobId: jobRef,
      coins: totalCoins,
      meta: { outputs, attempt },
      updatedBy: uid,
    });
    if (!updated) {
      logger.warn("[SpritePipeline] step3 completePipelineStepAtomic missed (state drift):", { pipelineId });
    }

    const latest = updated || (await getGameAssetPipelineById(pipelineId));
    return { ok: true, deduped: false, pipeline: latest || pipeline };
  } catch (error) {
    const errLike = await recordPipelineStepFailure({
      pipelineId,
      stepKey,
      attempt,
      retryStatus: "post_processing",
      error,
      updatedBy: uid,
    });

    logger.error("[SpritePipeline] step3-removebg failed:", error);
    const latest = await getGameAssetPipelineById(pipelineId).catch(() => null);
    return {
      ok: false,
      error: String(errLike.message || "pipeline_step_failed"),
      errorCode: String(errLike.errorCode || "PIPELINE_STEP_FAILED"),
      status: Number(errLike.status || 500),
      pipeline: latest || undefined,
    };
  }
}

// STEP4 — 셀 단위 슬라이스 검증 + 방향별 판정 + 통과 방향 strip 보존(D2b), 실패 시 소스 step 리셋(부분 재생성 루프)
async function executeStep4Verify(args: {
  uid: string;
  pipeline: IGameAssetPipelineDoc;
}): Promise<RunPipelineStepResultType> {
  const { uid, pipeline } = args;
  const pipelineId = pipeline.pipelineId;
  const stepKey: SpritePipelineStepKeyType = "step4-verify";
  const stepState = getPipelineStepState(pipeline, stepKey);
  const attempt = Math.max(1, Number(stepState?.attempt || 1));

  try {
    const step3Meta = toUnknownRecord(getPipelineStepState(pipeline, "step3-removebg")?.meta);
    const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
    const profileKey = getSpriteSheetProfileKey(actionVariables.sprite_frame_count);
    const profile = SPRITE_SHEET_PROFILES[profileKey];
    const outputs = (Array.isArray(step3Meta.outputs) ? step3Meta.outputs : []) as SheetPostProcessOutputType[];
    const sheetPlans: Array<{ sourceStep: string; directions: readonly string[] }> = [
      { sourceStep: "step2-base", directions: SPRITE_BASE_DIRECTIONS },
      { sourceStep: "step2-diagonal", directions: SPRITE_DIAGONAL_DIRECTIONS },
    ];

    const directionsUpdate: Record<string, unknown> = {};
    const failedDirections: string[] = [];
    const sheetsMeta: Array<Record<string, unknown>> = [];

    for (const plan of sheetPlans) {
      const output = outputs.find((item) => item.stepKey === plan.sourceStep);
      if (!output) throw codedError(`step3_output_missing:${plan.sourceStep}`, "STEP3_OUTPUT_MISSING", 409);

      const sourceBuffer = await fetchPostProcessedSheetBuffer(output);
      const buffer = await reflowSheet4GridToRuntimeRows(sourceBuffer, profileKey);
      const verify = await verifySheetSlices({
        buffer,
        columns: profile.frameCount,
        rows: plan.directions.length,
        directions: plan.directions,
      });
      sheetsMeta.push({ sourceStep: plan.sourceStep, width: verify.width, height: verify.height });

      for (const result of verify.directions) {
        if (result.passed) {
          const strip = await sliceDirectionStrip({ buffer, row: result.row, rows: plan.directions.length });
          const saved = await saveDirectionStrip({ uid, direction: result.direction, stripBuffer: strip });
          directionsUpdate[result.direction] = {
            status: "passed",
            stripAssetRef: saved.url || saved.sha256,
            stripStorage: saved.storage,
            verify: result.verify,
          };
        } else {
          failedDirections.push(result.direction);
          directionsUpdate[result.direction] = {
            status: "failed",
            verify: result.verify,
            regen: {
              attempt: 0,
              maxAttempts: SPRITE_PIPELINE_MAX_STEP_ATTEMPTS,
              status: "pending",
              freeRetryEligible: true,
              freeRetryUsed: false,
            },
          };
        }
      }
    }

    const allPassed = failedDirections.length === 0;
    const updated = await completeVerifyStepAtomic({
      pipelineId,
      directions: directionsUpdate,
      allPassed,
      meta: {
        attempt,
        generationMode: "sheet4",
        profileKey,
        frameCount: profile.frameCount,
        sheets: sheetsMeta,
        failedDirections,
        directionPassRate: (SPRITE_SHEET_V2_CONTRACT.directionCount - failedDirections.length) /
          SPRITE_SHEET_V2_CONTRACT.directionCount,
      },
      updatedBy: uid,
    });
    if (!updated) {
      logger.warn("[SpritePipeline] step4 completeVerifyStepAtomic missed (state drift):", { pipelineId });
    }

    const latest = updated || (await getGameAssetPipelineById(pipelineId));
    return { ok: true, deduped: false, pipeline: latest || pipeline };
  } catch (error) {
    const errLike = await recordPipelineStepFailure({
      pipelineId,
      stepKey,
      attempt,
      retryStatus: "verifying",
      error,
      updatedBy: uid,
    });

    logger.error("[SpritePipeline] step4-verify failed:", error);
    const latest = await getGameAssetPipelineById(pipelineId).catch(() => null);
    return {
      ok: false,
      error: String(errLike.message || "pipeline_step_failed"),
      errorCode: String(errLike.errorCode || "PIPELINE_STEP_FAILED"),
      status: Number(errLike.status || 500),
      pipeline: latest || undefined,
    };
  }
}

// STEP5 — strip 8개를 D1 규격으로 합성해 WebP 저장 + GameAsset(review) 등록 + 파이프라인 종결(composed)
async function executeStep5Compose(args: {
  uid: string;
  pipeline: IGameAssetPipelineDoc;
}): Promise<RunPipelineStepResultType> {
  const { uid, pipeline } = args;
  const pipelineId = pipeline.pipelineId;
  const stepKey: SpritePipelineStepKeyType = "step5-compose";
  const stepState = getPipelineStepState(pipeline, stepKey);
  const attempt = Math.max(1, Number(stepState?.attempt || 1));
  let lease: ProviderOperationLease | undefined;
  let storageStarted = false;

  try {
    if (String(pipeline.createdBy || "") !== uid) {
      throw codedError("pipeline_owner_mismatch", "PIPELINE_OWNER_MISMATCH", 403);
    }
    lease = await claimProviderOperationOrThrow(`sprite-materialize:${uid}:${pipelineId}:step5-compose`);
    const model = await getGameAssetModel();
    const existing = await model.findOne({
      createdBy: uid,
      assetType: "character-sprite",
      "meta.pipelineId": pipelineId,
      ...(lease.kind === "replay"
        ? { gameAssetId: String(toUnknownRecord(lease.result).gameAssetId || "") }
        : {}),
    }).lean();
    if (existing) {
      const sheetUrl = String(existing.storage?.url || "");
      if (!sheetUrl) throw codedError("materialized_sheet_url_missing", "MATERIALIZED_SHEET_URL_MISSING", 409);
      if (lease.kind === "reserved") await lease.complete({ gameAssetId: existing.gameAssetId });
      const updated = await completePipelineStepAtomic({
        pipelineId,
        stepKey,
        nextStatus: "composed",
        meta: { attempt, sheetUrl },
        result: {
          gameAssetId: existing.gameAssetId,
          sheetSha256: existing.storage.sha256,
          width: existing.storage.width,
          height: existing.storage.height,
        },
        updatedBy: uid,
      });
      if (!updated) throw codedError("compose_completion_conflict", "COMPOSE_COMPLETION_CONFLICT", 409);
      return { ok: true, deduped: true, pipeline: updated };
    }
    if (lease.kind === "replay") {
      throw codedError("materialized_asset_not_found", "MATERIALIZED_ASSET_NOT_FOUND", 409);
    }
    const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
    const profileKey = getSpriteSheetProfileKey(actionVariables.sprite_frame_count);
    const profile = SPRITE_SHEET_PROFILES[profileKey];
    const strips: Record<string, Buffer> = {};
    for (const direction of SPRITE_SHEET_V2_CONTRACT.rowOrder) {
      const state = toUnknownRecord(pipeline.directions?.[direction]);
      if (String(state.status || "") !== "passed") {
        throw codedError(`direction_not_passed:${direction}`, "DIRECTION_NOT_PASSED", 409);
      }
      strips[direction] = await fetchSpriteDirectionStripBuffer(pipeline, direction);
    }

    const composed = await composeSpriteSheet(strips, profileKey);

    // 최종 런타임 자산은 공개 저장 (기존 publish 라우트의 runtime URL 계약)
    const paths = resolveSmartCutPaths({ scope: "user", uid });
    storageStarted = true;
    const saved = await saveBase64Image({
      base64: composed.buffer.toString("base64"),
      dir: paths.dir,
      storagePrefix: paths.storagePrefix,
      visibility: "public",
      mimeType: composed.mimeType,
      outputFormat: "webp",
      modelName: profileKey === "v2" ? "sprite-sheet-v2" : `sprite-sheet-${profileKey}`,
    });
    const savedRec = toUnknownRecord(saved);
    const savedStorage = toUnknownRecord(savedRec.storage);
    const sheetUrl = String(savedRec.url || savedStorage.url || "");
    if (!sheetUrl) throw codedError("composed_sheet_url_missing", "COMPOSED_SHEET_URL_MISSING", 502);

    const spriteSheet = buildSpriteSheetMeta(profileKey);
    const actionFps = Math.max(1, Math.min(24, Number(actionVariables.motion_fps || 8)));
    spriteSheet.fps = actionFps;
    Object.values(spriteSheet.animations || {}).forEach((animation) => {
      animation.fps = actionFps;
      animation.loop = actionVariables.motion_loop_value === "true";
    });

    const gameAsset = await createGameAsset({
      name: String(
        pipeline.name || `${actionVariables.sprite_action_label}-sprite-${pipelineId.slice(-8)}`,
      ),
      assetType: "character-sprite",
      status: "review",
      sourceType: "generated",
      sourceImageAssetId: String(pipeline.anchor?.imageAssetId || ""),
      templateKey: SPRITE_PIPELINE_V2_TEMPLATE_KEYS.base4,
      provider: "openai",
      modelName: "",
      storage: {
        driver: savedStorage.driver as "r2",
        access: savedStorage.access as "public",
        bucket: String(savedStorage.bucket || ""),
        key: String(savedStorage.key || ""),
        url: sheetUrl,
        mimeType: composed.mimeType,
        width: composed.width,
        height: composed.height,
        bytes: composed.bytes,
        sha256: composed.sha256,
        ext: "webp",
      },
      spriteSheet,
      meta: {
        pipelineId,
        composedAttempt: attempt,
        directionCount: SPRITE_SHEET_V2_CONTRACT.directionCount,
        generationMode: "sheet4-hybrid",
        spriteSheetProfile: profileKey,
        frameCount: profile.frameCount,
        derivedDirections: Object.entries(pipeline.directions || {})
          .filter(([, direction]) => Boolean(direction.derivedFrom))
          .map(([direction]) => direction),
        spriteAction: {
          key: actionVariables.sprite_action_key,
          label: actionVariables.sprite_action_label,
          description: actionVariables.motion_action,
          fps: actionFps,
          loop: actionVariables.motion_loop_value === "true",
          frameCount: profile.frameCount,
        },
      },
      createdBy: uid,
      updatedBy: uid,
    });
    const gameAssetId = String(toUnknownRecord(gameAsset).gameAssetId || "");
    if (!gameAssetId) throw codedError("materialized_asset_id_missing", "MATERIALIZED_ASSET_ID_MISSING", 502);
    await lease.complete({ gameAssetId });

    const result = {
      gameAssetId,
      sheetSha256: composed.sha256,
      width: composed.width,
      height: composed.height,
    };
    const updated = await completePipelineStepAtomic({
      pipelineId,
      stepKey,
      nextStatus: "composed",
      meta: { attempt, sheetUrl },
      result,
      updatedBy: uid,
    });
    if (!updated) {
      throw codedError("compose_completion_conflict", "COMPOSE_COMPLETION_CONFLICT", 409);
    }

    const latest = updated || (await getGameAssetPipelineById(pipelineId));
    return { ok: true, deduped: false, pipeline: latest || pipeline };
  } catch (error) {
    if (lease?.kind === "reserved" && !storageStarted) await lease.release();
    const errLike = await recordPipelineStepFailure({
      pipelineId,
      stepKey,
      attempt,
      retryStatus: "composing",
      error,
      updatedBy: uid,
    });

    logger.error("[SpritePipeline] step5-compose failed:", error);
    const latest = await getGameAssetPipelineById(pipelineId).catch(() => null);
    return {
      ok: false,
      error: String(errLike.message || "pipeline_step_failed"),
      errorCode: String(errLike.errorCode || "PIPELINE_STEP_FAILED"),
      status: Number(errLike.status || 500),
      pipeline: latest || undefined,
    };
  }
}

const IMPLEMENTED_STEP_KEYS: SpritePipelineStepKeyType[] = [
  "step1-bible",
  "step2-base",
  "step2-diagonal",
  "step2-dir",
  "step3-removebg",
  "step4-verify",
  "step5-compose",
];

export async function runSpritePipelineStep(args: {
  uid: string;
  pipelineId: string;
  stepKey: string;
  direction?: string;
  mirrorConfirmed?: boolean;
}): Promise<RunPipelineStepResultType> {
  const uid = String(args.uid || "").trim();
  const pipelineId = String(args.pipelineId || "").trim();
  const stepKey = String(args.stepKey || "").trim() as SpritePipelineStepKeyType;

  if (!uid) return { ok: false, error: "uid_required", errorCode: "UNAUTHORIZED", status: 401 };
  if (!SPRITE_PIPELINE_STEP_KEYS.includes(stepKey)) {
    return { ok: false, error: "invalid_step_key", errorCode: "INVALID_STEP_KEY", status: 400 };
  }

  const pipeline = await getGameAssetPipelineById(pipelineId);
  if (!pipeline) return { ok: false, error: "pipeline_not_found", errorCode: "PIPELINE_NOT_FOUND", status: 404 };
  if (pipeline.kind !== "character-sprite-v2") {
    return { ok: false, error: "unsupported_pipeline_kind", errorCode: "UNSUPPORTED_PIPELINE_KIND", status: 400 };
  }
  if (!Object.prototype.hasOwnProperty.call(pipeline.steps || {}, stepKey)) {
    return { ok: false, error: "step_not_configured", errorCode: "STEP_NOT_CONFIGURED", status: 409, pipeline };
  }
  if (
    stepKey !== "step1-bible" &&
    Object.prototype.hasOwnProperty.call(pipeline.steps || {}, "step1-bible") &&
    !pipeline.anchor?.bible?.confirmedAt
  ) {
    return {
      ok: false,
      error: "character_bible_confirmation_required",
      errorCode: "CHARACTER_BIBLE_CONFIRMATION_REQUIRED",
      status: 409,
      pipeline,
    };
  }

  // 등록되지 않은 step은 eligibility 게이트가 실행 전에 차단한다 (상태 무변경).
  if (!IMPLEMENTED_STEP_KEYS.includes(stepKey)) {
    return { ok: false, error: "step_not_implemented", errorCode: "STEP_NOT_IMPLEMENTED", status: 501, pipeline };
  }

  if (stepKey === "step2-dir") {
    const direction = String(args.direction || "").trim() as SpriteDirectionType;
    if (!(SPRITE_DIRECTIONS as readonly string[]).includes(direction)) {
      return { ok: false, error: "invalid_sprite_direction", errorCode: "INVALID_SPRITE_DIRECTION", status: 400, pipeline };
    }
    if (!isStepAllowedForStatus(pipeline.status, stepKey)) {
      return {
        ok: false,
        error: `step_not_allowed_for_status:${pipeline.status}`,
        errorCode: "STEP_NOT_ALLOWED_FOR_STATUS",
        status: 409,
        pipeline,
      };
    }

    try {
      if (args.mirrorConfirmed === true) {
        const updated = await executeSpriteDirectionMirror({ uid, pipeline, targetDirection: direction, confirmed: true });
        return { ok: true, deduped: false, pipeline: updated };
      }
      const regen = pipeline.directions?.[direction]?.regen;
      const decision = canStartPipelineStep(regen);
      if (!decision.ok) {
        if (decision.reason === "attempts_exhausted") {
          return { ok: false, error: "direction_attempts_exhausted", errorCode: "DIRECTION_ATTEMPTS_EXHAUSTED", status: 409, pipeline };
        }
        return { ok: true, deduped: true, reason: decision.reason, pipeline };
      }
      const started = await startDirectionRegenAtomic({
        pipelineId,
        direction,
        maxAttempts: SPRITE_PIPELINE_MAX_STEP_ATTEMPTS,
        updatedBy: uid,
      });
      if (!started) {
        const latest = await getGameAssetPipelineById(pipelineId);
        return { ok: true, deduped: true, reason: "already_running", pipeline: latest || pipeline };
      }
      const updated = await executeSpriteDirectionGeneration({ uid, pipeline: started, direction });
      return { ok: true, deduped: false, pipeline: updated };
    } catch (error) {
      const errLike = toErrorLike(error);
      const latest = await getGameAssetPipelineById(pipelineId).catch(() => null);
      return {
        ok: false,
        error: String(errLike.message || "direction_regeneration_failed"),
        errorCode: String(errLike.errorCode || "DIRECTION_REGENERATION_FAILED"),
        status: Number(errLike.status || 500),
        pipeline: latest || pipeline,
      };
    }
  }

  if (!isStepAllowedForStatus(pipeline.status, stepKey)) {
    return {
      ok: false,
      error: `step_not_allowed_for_status:${pipeline.status}`,
      errorCode: "STEP_NOT_ALLOWED_FOR_STATUS",
      status: 409,
      pipeline,
    };
  }

  const decision = canStartPipelineStep(getPipelineStepState(pipeline, stepKey));
  if (!decision.ok) {
    if (decision.reason === "attempts_exhausted") {
      return { ok: false, error: "step_attempts_exhausted", errorCode: "STEP_ATTEMPTS_EXHAUSTED", status: 409, pipeline };
    }
    // running/success → 멱등 dedupe: 재실행 없이 현재 상태 반환
    return { ok: true, deduped: true, reason: decision.reason, pipeline };
  }

  const started = await startPipelineStepAtomic({
    pipelineId,
    stepKey,
    allowedStatuses: SPRITE_PIPELINE_STEP_ALLOWED_STATUSES[stepKey],
    runningStatus: SPRITE_PIPELINE_STEP_RUNNING_STATUS[stepKey],
    maxAttempts: SPRITE_PIPELINE_MAX_STEP_ATTEMPTS,
    updatedBy: uid,
  });
  if (!started) {
    // 경합에서 패배(다른 요청이 먼저 시작) — dedupe 응답
    const latest = await getGameAssetPipelineById(pipelineId);
    return { ok: true, deduped: true, reason: "already_running", pipeline: latest || pipeline };
  }

  if (stepKey === "step3-removebg") {
    return await executeStep3PostProcess({ uid, pipeline: started });
  }
  if (stepKey === "step4-verify") {
    return await executeStep4Verify({ uid, pipeline: started });
  }
  if (stepKey === "step5-compose") {
    return await executeStep5Compose({ uid, pipeline: started });
  }
  return await executeSpriteImageGeneration({ uid, pipeline: started, stepKey });
}

export async function confirmSpritePipelineBible(args: {
  uid: string;
  pipelineId: string;
  symmetry: CharacterBibleSymmetryType;
}) {
  const uid = String(args.uid || "").trim();
  const pipelineId = String(args.pipelineId || "").trim();
  const pipeline = await getGameAssetPipelineById(pipelineId);
  if (!pipeline) throw codedError("pipeline_not_found", "PIPELINE_NOT_FOUND", 404);
  if (!uid || String(pipeline.createdBy || "") !== uid) {
    throw codedError("pipeline_owner_mismatch", "PIPELINE_OWNER_MISMATCH", 403);
  }
  if (pipeline.anchor?.bible?.confirmedAt) return pipeline;

  const candidate = toUnknownRecord(getPipelineStepState(pipeline, "step1-bible")?.meta).candidate as
    | CharacterBibleCandidateType
    | undefined;
  if (!candidate?.assetId || !candidate.sha256 || candidate.allPassed !== true) {
    throw codedError("character_bible_not_ready", "CHARACTER_BIBLE_NOT_READY", 409);
  }

  const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
  const idempotencyKey = sha256Hex(
    buildSpritePipelineIdempotencySource({
      uid,
      anchor: {
        ...pipeline.anchor,
        bible: {
          assetId: candidate.assetId,
          sha256: candidate.sha256,
          columns: candidate.columns,
          cellWidth: candidate.cellWidth,
          cellHeight: candidate.cellHeight,
          directions: candidate.directions,
          symmetry: args.symmetry,
          confirmedAt: new Date(),
        },
      },
      templateVersion: pipeline.templateVersion,
      variantKey: buildSpritePipelineVariantKey(actionVariables),
    }),
  );
  const updated = await confirmPipelineBibleAtomic({
    pipelineId,
    createdBy: uid,
    candidate,
    symmetry: args.symmetry,
    idempotencyKey,
  });
  if (!updated) throw codedError("character_bible_confirm_conflict", "CHARACTER_BIBLE_CONFIRM_CONFLICT", 409);
  return updated;
}
