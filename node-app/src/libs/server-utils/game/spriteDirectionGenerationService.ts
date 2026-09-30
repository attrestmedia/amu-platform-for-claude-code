import "server-only";
import type { BaseImageType } from "types/app";
import type {
  IGameAssetPipelineDoc,
  SpriteDirectionPricingQuoteType,
  SpriteDirectionType,
} from "types/game/asset-pipeline";
import {
  GAME_ASSET_IMAGE_PROMPT_TEMPLATES,
  SPRITE_PIPELINE_V2_TEMPLATE_KEYS,
  SPRITE_SHEET_PROFILES,
  getSpriteDirectionPromptVariables,
  getSpriteSheetProfileKey,
  getChromaKeyPromptVariables,
  resolveSpriteModelSelection,
} from "consts/game/gameAssetTemplates";
import { IMAGE_STUDIO_NAMESPACE_KEY } from "consts/app";
import {
  SPRITE_PIPELINE_MAX_STEP_ATTEMPTS,
  SPRITE_MIRROR_PAIRS,
  buildPipelineStepClientRequestId,
  canMirrorSpriteDirection,
  classifyPipelineStepFailure,
  normalizeSpriteActionVariables,
  resolveSpritePipelineAnchorAssetId,
} from "utils/game/assetPipeline";
import {
  countImageReferenceInputs,
  filterImagePromptVariableDefaults,
  renderImagePrompt,
  resolveImagePromptNegative,
  resolveImageReferencePolicy,
} from "utils/lab";
import { resolvePromptModelLock } from "utils/app/promptModelLock";
import { resolveMediaBillingStrategy } from "utils/payment";
import { generateSaveAndBillImages, resolveImageProvider } from "libs/server-utils/api/imagePipeline";
import { getSystemPricingMaps, previewSystemPricingQuote } from "libs/server-utils/api/systemPricingControl";
import { assertPricingPreflightOrThrow, refundAIUsageOrThrow } from "libs/services/aiUsageBilling";
import { getImageAssetByAssetId, createImageGenJob, markImageGenJobFailed } from "libs/database/lab/imageGenRepo";
import {
  completeDirectionMirrorAtomic,
  completeDirectionRegenAtomic,
  failDirectionRegenAtomic,
  getGameAssetPipelineById,
} from "libs/database/game";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import {
  fetchPostProcessedSheetBuffer,
  postProcessSheetAsset,
  analyzeSheetAlphaQuality,
} from "libs/server-utils/game/spriteSheetPostProcess";
import { mirrorSpriteDirectionStrip, reflowGridToStrip } from "libs/server-utils/game/spriteSheetComposer";
import { saveDirectionStrip, verifySheetSlices } from "libs/server-utils/game/spriteSheetVerifier";
import { loadMotionGuideReference } from "libs/server-utils/game/motionGuideRenderer";
import { logger } from "utils/log";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";

const DIRECTION_TEMPLATE_KEY = SPRITE_PIPELINE_V2_TEMPLATE_KEYS.direction;
const META_ROUTE = "game/assets/pipeline:step2-dir";
const IMAGE_FETCH_TIMEOUT_MS = 30_000;
const IMAGE_MAX_BYTES = 24 * 1024 * 1024;
const DIRECTION_PROMPT: Record<SpriteDirectionType, string> = {
  down: "down — front three-quarter view toward the viewer's lower-left (SW)",
  up: "up — back three-quarter view toward the viewer's upper-right (NE)",
  left: "left — back three-quarter view toward the viewer's upper-left (NW)",
  right: "right — front three-quarter view toward the viewer's lower-right (SE)",
  "down-left": "down-left — left-facing side view toward the screen's left (W)",
  "up-left": "up-left — back view toward the top of the screen (N)",
  "up-right": "up-right — right-facing side view toward the screen's right (E)",
  "down-right": "down-right — front view toward the bottom of the screen (S)",
};

function codedError(message: string, errorCode: string, status = 400) {
  const error = new Error(message) as Error & { errorCode: string; status: number };
  error.errorCode = errorCode;
  error.status = status;
  return error;
}

function getDirectionTemplate() {
  const template = GAME_ASSET_IMAGE_PROMPT_TEMPLATES.find((item) => item.key === DIRECTION_TEMPLATE_KEY);
  if (!template) throw codedError("direction_template_not_found", "DIRECTION_TEMPLATE_NOT_FOUND", 500);
  return template;
}

function buildDirectionPrompt(pipeline: IGameAssetPipelineDoc, direction: SpriteDirectionType) {
  const template = getDirectionTemplate();
  const defaultParams = toUnknownRecord(template.defaultParams);
  const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
  const profileKey = getSpriteSheetProfileKey(actionVariables.sprite_frame_count);
  const variables = {
    ...filterImagePromptVariableDefaults(defaultParams),
    ...actionVariables,
    ...getSpriteDirectionPromptVariables(profileKey),
    ...getChromaKeyPromptVariables(actionVariables.chroma_key_preset),
    sprite_direction: DIRECTION_PROMPT[direction],
  };
  const negative = resolveImagePromptNegative(template.templateText, String(defaultParams.negative || ""));
  return {
    template,
    defaultParams,
    variables,
    negative,
    prompt: renderImagePrompt(template.title, template.templateText, { negative, params: variables }),
  };
}

function resolveDirectionModel(pipeline: IGameAssetPipelineDoc) {
  const template = getDirectionTemplate();
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
  const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
  const profile = SPRITE_SHEET_PROFILES[getSpriteSheetProfileKey(actionVariables.sprite_frame_count)];
  return {
    provider,
    modelName: modelSelection.modelName,
    size: profile.directionGeneration.size,
    aspectRatio: profile.directionGeneration.aspectRatio,
  };
}

async function fetchImageAsBase64(url: string): Promise<BaseImageType> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw codedError(`direction_reference_fetch_failed:${response.status}`, "DIRECTION_REFERENCE_FETCH_FAILED", 502);
    const mimeType = String(response.headers.get("content-type") || "image/webp").split(";")[0].trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > IMAGE_MAX_BYTES) {
      throw codedError("direction_reference_size_invalid", "DIRECTION_REFERENCE_SIZE_INVALID", 422);
    }
    return { mimeType, data: buffer.toString("base64") };
  } finally {
    clearTimeout(timer);
  }
}

async function loadDirectionReference(pipeline: IGameAssetPipelineDoc) {
  const assetId = resolveSpritePipelineAnchorAssetId(pipeline.anchor);
  if (assetId) {
    const asset = await getImageAssetByAssetId(assetId);
    if (!asset) throw codedError("direction_reference_not_found", "DIRECTION_REFERENCE_NOT_FOUND", 404);
    const display = await resolveImageAssetDisplayUrl(asset as unknown as { assetId?: string; storage?: unknown }, {
      delivery: "signed",
    });
    if (!display.url) throw codedError("direction_reference_url_unresolvable", "DIRECTION_REFERENCE_URL_UNRESOLVABLE", 502);
    return fetchImageAsBase64(display.url);
  }
  const sourceUrl = String(pipeline.anchor?.sourceUrl || "").trim();
  if (/^https?:\/\//.test(sourceUrl)) return fetchImageAsBase64(sourceUrl);
  throw codedError("direction_reference_missing", "DIRECTION_REFERENCE_MISSING", 400);
}

export async function fetchSpriteDirectionStripBuffer(
  pipeline: IGameAssetPipelineDoc,
  direction: SpriteDirectionType,
) {
  const state = pipeline.directions?.[direction];
  const storage = toUnknownRecord(state?.stripStorage);
  if (Object.keys(storage).length > 0) {
    const display = await resolveImageAssetDisplayUrl(
      { assetId: "", visibility: "private", storage },
      { delivery: "signed" },
    );
    if (display.url) {
      const image = await fetchImageAsBase64(display.url);
      return Buffer.from(image.data, "base64");
    }
  }
  const ref = String(state?.stripAssetRef || "");
  if (/^https?:\/\//.test(ref)) {
    const image = await fetchImageAsBase64(ref);
    return Buffer.from(image.data, "base64");
  }
  throw codedError(`direction_strip_unreadable:${direction}`, "DIRECTION_STRIP_UNREADABLE", 422);
}

function willAllDirectionsPass(pipeline: IGameAssetPipelineDoc, targetDirection: SpriteDirectionType) {
  return Object.entries(pipeline.directions || {}).every(
    ([direction, state]) => direction === targetDirection || state.status === "passed",
  );
}

export async function getSpriteDirectionPricingQuote(
  pipeline: IGameAssetPipelineDoc,
): Promise<SpriteDirectionPricingQuoteType> {
  const { provider, modelName, size } = resolveDirectionModel(pipeline);
  const prompt = (Object.keys(DIRECTION_PROMPT) as SpriteDirectionType[])
    .map((direction) => buildDirectionPrompt(pipeline, direction).prompt)
    .reduce((longest, candidate) => (candidate.length > longest.length ? candidate : longest), "");
  const pricing = await getSystemPricingMaps();
  const billingStrategy = resolveMediaBillingStrategy({
    provider,
    modelName,
    modality: "image",
    pricing,
  });
  if (billingStrategy === "token" || billingStrategy === "hybrid") {
    await assertPricingPreflightOrThrow({ provider, modelName, modality: "image", kind: "token" });
  }
  if (billingStrategy === "fixed" || billingStrategy === "hybrid") {
    await assertPricingPreflightOrThrow({ provider, modelName, modality: "image", kind: "fixed" });
  }
  const quote = await previewSystemPricingQuote({
    provider,
    modelName,
    modality: "image",
    ...(billingStrategy === "token" || billingStrategy === "hybrid"
      ? {
          usage: {
            text: { input: Math.max(1, Math.ceil(prompt.length / 3)), output: 0 },
            image: { input: 4096, output: 4096 },
          },
        }
      : {}),
    ...(billingStrategy === "fixed" || billingStrategy === "hybrid" ? { fixed: { images: 1 } } : {}),
  });
  return {
    unit: "coin",
    perDirectionCoins: Math.max(0, Number(quote.coins || 0)),
    billingStrategy,
    provider,
    modelName,
    size,
    source: "system-pricing",
  };
}

export async function executeSpriteDirectionGeneration(args: {
  uid: string;
  pipeline: IGameAssetPipelineDoc;
  direction: SpriteDirectionType;
}) {
  const { uid, pipeline, direction } = args;
  const pipelineId = pipeline.pipelineId;
  const regen = pipeline.directions?.[direction]?.regen;
  const attempt = Math.max(1, Number(regen?.attempt || 1));
  const clientRequestId = buildPipelineStepClientRequestId(
    pipelineId,
    "step2-dir",
    attempt,
    regen?.resetCount,
    direction,
  );
  let billing: { jobId: string; coins: number; freeRetryUsed: boolean } | undefined;

  try {
    const { template, defaultParams, variables, negative, prompt } = buildDirectionPrompt(pipeline, direction);
    const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
    const profileKey = getSpriteSheetProfileKey(actionVariables.sprite_frame_count);
    const profile = SPRITE_SHEET_PROFILES[profileKey];
    const { provider, modelName, size, aspectRatio } = resolveDirectionModel(pipeline);
    const reference = await loadDirectionReference(pipeline);
    const baseImages = [reference];
    const motionGuideVersion = Number(actionVariables.motion_guide_version || 0);
    const guideDirection = SPRITE_MIRROR_PAIRS[direction as keyof typeof SPRITE_MIRROR_PAIRS] || direction;
    const motionGuide =
      motionGuideVersion > 0
        ? await loadMotionGuideReference({
            actionKey: actionVariables.sprite_action_key,
            direction: guideDirection,
            version: motionGuideVersion,
            frameCount: profile.frameCount,
          })
        : null;
    if (motionGuideVersion > 0 && !motionGuide) {
      throw codedError("motion_guide_not_found", "MOTION_GUIDE_NOT_FOUND", 409);
    }
    if (motionGuide) baseImages.push(motionGuide.image);
    const referencePolicy = resolveImageReferencePolicy(
      template.inputPolicy as Parameters<typeof resolveImageReferencePolicy>[0],
      provider,
    );
    if (referencePolicy.required && countImageReferenceInputs(baseImages) < referencePolicy.minCount) {
      throw codedError("direction_reference_required", "DIRECTION_REFERENCE_REQUIRED", 400);
    }

    const queuedJob = await createImageGenJob({
      scope: "user",
      uid,
      createdBy: uid,
      provider,
      modelName,
      status: "queued",
      request: { templateKey: DIRECTION_TEMPLATE_KEY, clientRequestId },
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
      size,
      aspectRatio,
      metaRoute: META_ROUTE,
      appBillingKey: IMAGE_STUDIO_NAMESPACE_KEY,
      templateKey: DIRECTION_TEMPLATE_KEY,
      existingJobId: jobId,
      metaExtra: {
        pipelineId,
        stepKey: "step2-dir",
        generationUnit: "direction",
        direction,
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
        inputPolicy: template.inputPolicy as Record<string, unknown> | undefined,
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
        logger.warn("[SpriteDirectionGeneration] replay queued job cleanup failed:", cleanupError);
      });
    }
    const billedJobId = String(data.jobId || jobId);
    const grossCoins = Math.max(0, Number(data.coins || 0));
    const freeRetry = Boolean(regen?.freeRetryEligible && !regen.freeRetryUsed);
    let refundedCoins = 0;
    billing = { jobId: billedJobId, coins: grossCoins, freeRetryUsed: false };
    if (freeRetry && grossCoins > 0) {
      const refundRequestId = `sprite-direction-free-retry:${billedJobId}`;
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
          route: `${META_ROUTE}:free-retry`,
          pipelineId,
          direction,
          attempt,
          jobId: billedJobId,
        },
      });
      refundedCoins = grossCoins;
    }
    billing = {
      jobId: billedJobId,
      coins: Math.max(0, grossCoins - refundedCoins),
      freeRetryUsed: freeRetry && refundedCoins === grossCoins,
    };

    const assetId = String(Array.isArray(data.assetIds) ? data.assetIds[0] || "" : "").trim();
    if (!assetId) throw codedError("direction_asset_missing", "DIRECTION_ASSET_MISSING", 502);
    const processed = await postProcessSheetAsset({ uid, sourceAssetId: assetId, stepKey: `step2-dir:${direction}` });
    billing.coins += Math.max(0, Number(processed.coins || 0));

    // CK-202: strip reflow 전 PNG alpha 품질 검증
    const processedBuffer = await fetchPostProcessedSheetBuffer(processed.output);
    const alphaCheck = await analyzeSheetAlphaQuality(processedBuffer);
    if (!alphaCheck.transparentBackground) {
      throw codedError("direction_alpha_quality_failed", "DIRECTION_ALPHA_QUALITY_FAILED", 422);
    }

    const strip = await reflowGridToStrip(processedBuffer, {
      cols: profile.directionGeneration.columns,
      rows: profile.directionGeneration.rows,
      frameCount: profile.frameCount,
    });
    const verified = await verifySheetSlices({
      buffer: strip,
      columns: profile.frameCount,
      rows: 1,
      directions: [direction],
    });
    const directionVerify = verified.directions[0];
    if (!directionVerify?.passed) {
      throw codedError("direction_verification_failed", "DIRECTION_VERIFICATION_FAILED", 422);
    }
    const saved = await saveDirectionStrip({ uid, direction, stripBuffer: strip });
    const updated = await completeDirectionRegenAtomic({
      pipelineId,
      direction,
      stripAssetRef: saved.url || saved.sha256,
      stripStorage: saved.storage,
      verify: directionVerify.verify,
      allDirectionsPassed: willAllDirectionsPass(pipeline, direction),
      // CK-202: STEP3 처리 방식 기록
      method: processed.output.method,
      jobId: billing.jobId,
      coins: billing.coins,
      freeRetryUsed: billing.freeRetryUsed,
      updatedBy: uid,
    });
    return updated || (await getGameAssetPipelineById(pipelineId)) || pipeline;
  } catch (error) {
    const errLike = toErrorLike(error);
    const failure = classifyPipelineStepFailure(error);
    const attemptsExhausted = failure.consumesAttempt && attempt >= SPRITE_PIPELINE_MAX_STEP_ATTEMPTS;
    await failDirectionRegenAtomic({
      pipelineId,
      direction,
      errorCode: String(errLike.errorCode || ""),
      errorMessage: String(errLike.message || "direction_regeneration_failed"),
      failureKind: failure.kind,
      retryable: failure.retryable,
      consumeAttempt: failure.consumesAttempt,
      attemptsExhausted,
      jobId: billing?.jobId,
      coins: billing?.coins,
      freeRetryUsed: billing?.freeRetryUsed,
      updatedBy: uid,
    }).catch((markError: unknown) => logger.warn("[SpriteDirection] failure state update missed:", markError));
    throw error;
  }
}

export async function executeSpriteDirectionMirror(args: {
  uid: string;
  pipeline: IGameAssetPipelineDoc;
  targetDirection: SpriteDirectionType;
  confirmed: boolean;
}) {
  const { uid, pipeline, targetDirection } = args;
  const sourceDirection = SPRITE_MIRROR_PAIRS[targetDirection as keyof typeof SPRITE_MIRROR_PAIRS];
  if (!args.confirmed) throw codedError("mirror_confirmation_required", "MIRROR_CONFIRMATION_REQUIRED", 400);
  if (!sourceDirection || !canMirrorSpriteDirection({ pipeline, targetDirection })) {
    throw codedError("direction_mirror_not_allowed", "DIRECTION_MIRROR_NOT_ALLOWED", 409);
  }
  const source = await fetchSpriteDirectionStripBuffer(pipeline, sourceDirection);
  const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
  const profile = SPRITE_SHEET_PROFILES[getSpriteSheetProfileKey(actionVariables.sprite_frame_count)];
  const mirrored = await mirrorSpriteDirectionStrip(source, profile.frameCount);

  // CK-202: 미러 strip 알파 품질 검증
  const alphaCheck = await analyzeSheetAlphaQuality(mirrored);
  if (!alphaCheck.transparentBackground) {
    throw codedError("mirror_alpha_quality_failed", "MIRROR_ALPHA_QUALITY_FAILED", 422);
  }

  const saved = await saveDirectionStrip({ uid, direction: targetDirection, stripBuffer: mirrored });
  const updated = await completeDirectionMirrorAtomic({
    pipelineId: pipeline.pipelineId,
    sourceDirection,
    targetDirection,
    stripAssetRef: saved.url || saved.sha256,
    stripStorage: saved.storage,
    verify: pipeline.directions[sourceDirection]?.verify || {},
    allDirectionsPassed: willAllDirectionsPass(pipeline, targetDirection),
    updatedBy: uid,
  });
  if (!updated) throw codedError("direction_mirror_conflict", "DIRECTION_MIRROR_CONFLICT", 409);
  return updated;
}
