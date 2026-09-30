import "server-only";
import crypto from "crypto";
import type { AiProviderType, ImageProviderType } from "types/ai";
import type {
  PromptGenType,
  BaseImageType,
  DeletePolicyType,
  ImagePromptCustomType,
  PromptVisibilityType,
} from "types/app";
import {
  AI_GEN_IMAGE_LIMIT,
  IMAGE_REF_LIMIT_BY_PROVIDER,
} from "consts/ai";
import {
  deleteStoredGenStudioImageByStorage,
  deleteStoredGenStudioImageByUrl,
  resolveSmartCutPaths,
  saveBase64Image,
  validateBase64Image,
} from "libs/server-utils/file/fileStorage";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import {
  inferImageProviderFromModelNameRaw,
  normalizeImageProvider as normalizeImageProviderShared,
} from "utils/ai/providerHelper";
import { callImagesByProvider, resolveImageModelNameFor } from "libs/server-utils/api/apiHelper";
import { assertSystemModelEnabledOrThrow, resolveSystemDefaultModelName } from "libs/server-utils/api/systemModelControl";
import {
  assertAIUsageBalanceOrThrow,
  assertCommerceAIUsageBalanceOrThrow,
  assertPricingPreflightOrThrow,
  billAIUsageOrThrow,
  billCommerceAIUsageOrThrow,
} from "libs/services/aiUsageBilling";
import {
  createImageAssets,
  createImageGenJob,
  createPromptSnapshot,
  listImageAssets,
  markAssetsDeletedByJob,
  markImageGenJobFailed,
  markImageGenJobRunning,
  markImageGenJobSuccess,
} from "libs/database/lab/imageGenRepo";
import { claimProviderOperationOrThrow } from "libs/server-utils/api/providerOperationGuard";
import { resolveImageBillingModelName } from "utils/ai/imageBillingPolicy";
import { resolveImageGenOptions } from "utils/ai/imageOptions";
import { estimateImageGenerationTokenUsage, resolveBillableImageCount } from "utils/ai/imageCostEstimate";
import { hasBillableTokenUsage, resolveMediaBillingStrategy } from "utils/payment";
import type { ITokenUsageBreakdown } from "types/payment/coin";
import { getSystemPricingMaps, type SystemPricingMaps } from "libs/server-utils/api/systemPricingControl";
import { appendModelIdentityInstruction } from "utils/lab";
import { logger } from "utils/log";
import { assertQwenProviderCallReady, QWEN_IMAGE_MODEL } from "libs/server-utils/audio/providers/qwenSpeech";
import { toUnknownRecord, toErrorLike, type UnknownRecord } from "utils/common/typeUtils";
import {
  mergeAgentImageRoutingMetaForBilling,
  sanitizeAgentImageRoutingMeta,
  toAgentImageRoutingMetaResponse,
  type AgentImageRoutingMetaType,
} from "utils/ai/agentImageRoutingPolicy";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process normalizeImageProvider 중심 처리  입력 검증  핵심 로직  결과 포맷팅  프롬프트 렌더링/정책 적용 포함  이미지 파이프라인 호출 포함
 * @domain ai-image
 * @scope global
 */

const GEN_STUDIO_SAVE_FORMAT = "webp" as const;
const GEN_STUDIO_SAVE_QUALITY = 82;

function hashPromptUtf8(prompt: string) {
  return crypto
    .createHash("sha256")
    .update(String(prompt || ""), "utf8")
    .digest("hex");
}

function codedError(message: string, errorCode: string, status = 400) {
  const err = new Error(message) as Error & { errorCode: string; status: number };
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

function classifyQwenImageOperationFailure(args: { dispatchStarted: boolean; responseReceived: boolean; error: unknown }) {
  if (!args.dispatchStarted) return "release" as const;
  const errorRecord = toUnknownRecord(args.error);
  const detail = toUnknownRecord(errorRecord.detail);
  const state = errorRecord.providerCallState || detail.providerCallState;
  if (state === "not_sent") return "release" as const;
  const status = Number(errorRecord.upstreamStatus ?? errorRecord.status);
  if (Number.isInteger(status) && status >= 400 && status < 500) return "release" as const;
  if (args.responseReceived || state === "completed") return "post_response_failure" as const;
  return "dispatch_uncertain" as const;
}

function extractBaseImagesMeta(baseImages?: BaseImageType[], role: "reference" | "model" = "reference") {
  const normalized = normalizeBaseImages(baseImages);
  return normalized.map((img, index) => {
    try {
      const bin = Buffer.from(img.data, "base64");
      return {
        index,
        role,
        mimeType: String(img.mimeType || ""),
        bytes: bin.length,
        sha256: crypto.createHash("sha256").update(bin).digest("hex"),
      };
    } catch {
      return {
        index,
        role,
        mimeType: String(img.mimeType || ""),
      };
    }
  });
}

async function cleanupGeneratedFiles(urls: string[]) {
  if (!Array.isArray(urls) || urls.length === 0) return;
  await Promise.allSettled(
    urls.map(async (url) => {
      await deleteStoredGenStudioImageByUrl(url).catch(() => {});
    }),
  );
}

function normalizeBaseImages(baseImages?: BaseImageType[]) {
  return Array.isArray(baseImages) ? baseImages.filter((v) => Boolean(v?.data)) : [];
}

function resolvePromptVisibility(raw?: PromptVisibilityType): PromptVisibilityType {
  return raw === "public" ? "public" : "private";
}

type ImagePipelineDataType = {
  jobId: string;
  images: string[];
  assetIds: string[];
  assets: UnknownRecord[];
  coins: number;
  modelName: string;
  executedModelName: string;
  billedModelName: string;
  provider: string;
  [key: string]: unknown;
};

type ImagePipelineResultType = {
  ok: true;
  data: ImagePipelineDataType;
};

function resolveProviderOperationConsumer(args: {
  appBillingKey: string;
  metaRoute: string;
  sourceService?: unknown;
}) {
  const appBillingKey = String(args.appBillingKey || "").trim().toLowerCase();
  const metaRoute = String(args.metaRoute || "").trim().toLowerCase();
  const sourceService = String(args.sourceService || "").trim().toLowerCase();
  const domain =
    sourceService === "play" || metaRoute.startsWith("game/") || metaRoute.includes("world-assets")
      ? "play"
      : metaRoute.startsWith("tutors/")
        ? "tutors"
        : sourceService === "store" || metaRoute.startsWith("commerce/") || appBillingKey.includes("commerce")
          ? "store"
          : sourceService === "gen-studio" || metaRoute.startsWith("ai/")
            ? "gen-studio"
            : "unknown";
  const safeBillingKey = appBillingKey.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  return `${safeBillingKey}-${domain}`.slice(0, 96);
}

function buildProviderOperationId(args: {
  appBillingKey: string;
  metaRoute: string;
  sourceService?: unknown;
  scope: "user" | "universe";
  uid?: string;
  universeId?: string;
  clientRequestId?: string;
}) {
  const clientRequestId = String(args.clientRequestId || "").trim();
  if (!clientRequestId) return "";

  const digest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        uid: String(args.uid || "").trim(),
        universeId: String(args.universeId || "").trim(),
        clientRequestId,
      }),
      "utf8",
    )
    .digest("hex");
  const consumer = resolveProviderOperationConsumer(args);
  return `image:${consumer}:${args.scope}:${digest}`;
}

function buildProviderOperationCacheResult(result: ImagePipelineResultType) {
  const resultRec = toUnknownRecord(result);
  const data = toUnknownRecord(resultRec.data);
  const assets = Array.isArray(data.assets)
    ? data.assets.map((asset) => {
        const assetRec = toUnknownRecord(asset);
        const storage = toUnknownRecord(assetRec.storage);
        return {
          ...assetRec,
          url: "",
          urlKind: "none",
          urlExpiresAt: undefined,
          refreshUrl: undefined,
          storage: { ...storage, url: "" },
        };
      })
    : [];
  return {
    ...resultRec,
    data: {
      ...data,
      images: [],
      assets,
    },
  };
}

async function hydrateProviderOperationReplayResult(
  result: unknown,
  args: { scope: "user" | "universe"; uid?: string; universeId?: string },
): Promise<ImagePipelineResultType> {
  const resultRec = toUnknownRecord(result);
  const data = toUnknownRecord(resultRec.data);
  const assetIds = Array.from(
    new Set((Array.isArray(data.assetIds) ? data.assetIds : []).map((assetId) => String(assetId || "").trim()).filter(Boolean)),
  );
  const cachedAssets = Array.isArray(data.assets)
    ? data.assets.map(toUnknownRecord).filter((asset) => String(asset.assetId || "").trim())
    : [];
  if (!assetIds.length || !cachedAssets.length) {
    return {
      ...resultRec,
      data: { ...data, images: [], assets: [] },
    } as unknown as ImagePipelineResultType;
  }

  const assets = await listImageAssets({
    assetIds,
    scope: args.scope,
    uid: String(args.uid || ""),
    universeId: String(args.universeId || ""),
    state: "active",
    limit: assetIds.length,
  });
  const assetsById = new Map((assets || []).map((asset) => [String(asset.assetId || "").trim(), asset]));
  const cachedAssetsById = new Map(cachedAssets.map((asset) => [String(asset.assetId || "").trim(), asset]));
  const hydratedAssets = await Promise.all(
    assetIds.map(async (assetId) => {
      const storedAsset = assetsById.get(assetId);
      const cachedAsset = cachedAssetsById.get(assetId);
      if (!storedAsset || !cachedAsset) return null;
      const display = await resolveImageAssetDisplayUrl(storedAsset);
      return {
        ...cachedAsset,
        assetId,
        url: display.url,
        urlKind: display.urlKind,
        urlExpiresAt: display.urlExpiresAt,
        refreshUrl: display.refreshUrl,
      };
    }),
  );
  const resolvedAssets = hydratedAssets.filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  return {
    ...resultRec,
    data: {
      ...data,
      images: resolvedAssets.map((asset) => String(asset.url || "")).filter(Boolean),
      assetIds: resolvedAssets.map((asset) => String(asset.assetId || "")).filter(Boolean),
      assets: resolvedAssets,
    },
  } as unknown as ImagePipelineResultType;
}

type ImagePipelineInputType = ImagePromptCustomType & {
  scope: "user" | "universe";
  uid?: string;
  user?: unknown;
  provider: ImageProviderType;
  metaRoute: string;
  appBillingKey: string;
  /** capability router가 계산한 동일 가격 snapshot을 과금까지 전달한다. */
  pricingMaps?: SystemPricingMaps;
  metaExtra?: UnknownRecord;
  routingMeta?: AgentImageRoutingMetaType;
  promptSnapshot?: {
    title?: string;
    templateText?: string;
    defaultParams?: UnknownRecord;
    inputPolicy?: UnknownRecord;
    tags?: string[];
    categories?: string[];
    version?: number;
    enabled?: boolean;
    renderedPrompt?: string;
    negative?: string;
    variables?: UnknownRecord;
    extraPrompt?: string;
  };
  requestMeta?: {
    variables?: UnknownRecord;
    extraPrompt?: string;
    negative?: string;
    generationMode?: PromptGenType;
    clientRequestId?: string;
    templateTitle?: string;
    source?: ImagePromptCustomType["source"];
  };
  deletePolicy?: DeletePolicyType;
  existingJobId?: string;
  // gpt-image 계열 전용 실제 알파 투명 배경 — provider 레이어에서 지원 모델에만 전송
  background?: string;
};

// image provider는 google/openai/xai만 허용
export function normalizeImageProvider(raw: unknown) {
  return normalizeImageProviderShared(raw);
}

export function inferImageProviderFromModelName(modelName?: string): ImageProviderType {
  return inferImageProviderFromModelNameRaw(modelName) || "google";
}

export function resolveImageProvider(args: {
  bodyProvider?: unknown;
  modelName?: string;
  forcedProvider?: AiProviderType;
}): ImageProviderType {
  const forced = normalizeImageProvider(args.forcedProvider);
  if (forced) return forced;

  const p = normalizeImageProvider(args.bodyProvider);
  if (p) return p;

  return inferImageProviderFromModelName(args.modelName);
}

export function validatePromptOrImageOrThrow(prompt?: unknown, baseImages?: BaseImageType[]) {
  const p = String(prompt || "").trim();
  const hasImg = Array.isArray(baseImages) && baseImages.some((v) => Boolean(v?.data));
  if (!p && !hasImg) throw codedError("prompt_or_image_required", "INVALID_INPUT", 400);
}

export function validateBaseImageOrThrow(baseImage?: BaseImageType) {
  if (!baseImage?.data) return;
  const v = validateBase64Image({ mimeType: baseImage.mimeType, data: baseImage.data });
  if (!v.valid) throw codedError(v.error || "invalid_base_image", "INVALID_BASE_IMAGE", 400);
}

export async function generateSaveAndBillImages(params: ImagePipelineInputType) {
  const {
    scope,
    uid,
    user,
    universeId,
    provider,
    modelName,
    prompt,
    baseImages,
    modelImages,
    modelReferenceStrength,
    n,
    size,
    aspectRatio,
    metaRoute,
    appBillingKey,
    pricingMaps: providedPricingMaps,
    metaExtra,
    routingMeta,
    templateKey,
    promptSnapshot,
    requestMeta,
    deletePolicy,
    visibility,
    confirmedPromptHash,
    existingJobId,
    background,
  } = params;

  if (String(provider) === "qwen") {
    await assertQwenProviderCallReady({
      modelName: String(modelName || QWEN_IMAGE_MODEL),
      modality: "image",
      user,
    });
  }

  const safeRoutingMeta = sanitizeAgentImageRoutingMeta(routingMeta);

  const normalizedBaseImages = normalizeBaseImages(baseImages);
  const normalizedModelImages = normalizeBaseImages(modelImages);
  const normalizedInputImages = [...normalizedModelImages, ...normalizedBaseImages];
  validatePromptOrImageOrThrow(prompt, normalizedInputImages);
  normalizedInputImages.forEach((img) => validateBaseImageOrThrow(img));
  const refLimit = Math.max(0, Number(IMAGE_REF_LIMIT_BY_PROVIDER[provider] || 0));
  if (refLimit > 0 && normalizedInputImages.length > refLimit) {
    throw codedError(`${provider}_base_image_limit_exceeded`, "BASE_IMAGE_LIMIT_EXCEEDED", 400);
  }

  // aspectRatio → size 정책 적용 (서버 권위)
  const outputVisibility = resolvePromptVisibility(visibility);
  const isQwenImageRequest = String(provider) === "qwen";
  const resolvedOpts = resolveImageGenOptions({ provider, modelName, aspectRatio, size });
  const effectiveAspectRatio = isQwenImageRequest ? "1:1" : resolvedOpts.aspectRatio;
  const effectiveSize = isQwenImageRequest ? "1024*1024" : resolvedOpts.size;
  const billingVariant = provider === "google" ? effectiveSize : undefined;

  // OpenAI edits는 prompt가 사실상 필수인 경우가 많아 upstream 에러 대신 400으로 정리
  if (provider === "openai" && normalizedInputImages.length > 0 && !String(prompt || "").trim()) {
    throw codedError("prompt_required_for_edit", "INVALID_INPUT", 400);
  }

  // allowlist + default 확정
  const fallbackModel = !String(modelName || "").trim()
    ? await resolveSystemDefaultModelName({ provider, modality: "image" })
    : "";
  const useModel = await resolveImageModelNameFor(provider, String(modelName || fallbackModel), user);
  const hasBaseImages = normalizedInputImages.length > 0;
  await assertSystemModelEnabledOrThrow({
    provider,
    modelName: useModel,
    modality: "image",
  });

  const plannedBillingModelName = resolveImageBillingModelName({
    provider,
    requestedModelName: useModel,
    hasBaseImages,
  });
  const pricingMaps = providedPricingMaps || (await getSystemPricingMaps());

  const plannedBillingStrategy = resolveMediaBillingStrategy({
    provider,
    modelName: plannedBillingModelName,
    modality: "image",
    variant: billingVariant,
    pricing: pricingMaps,
  });

  if (plannedBillingStrategy === "token" || plannedBillingStrategy === "hybrid") {
    await assertPricingPreflightOrThrow({
      provider,
      modelName: plannedBillingModelName,
      modality: "image",
      kind: "token",
      variants: [billingVariant],
    });
  }
  if (plannedBillingStrategy === "fixed" || plannedBillingStrategy === "hybrid") {
    await assertPricingPreflightOrThrow({
      provider,
      modelName: plannedBillingModelName,
      modality: "image",
      kind: "fixed",
      variants: [billingVariant],
    });
  }

  const take = Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(n || 1)));
  if (isQwenImageRequest && (normalizedInputImages.length > 0 || take !== 1)) {
    throw codedError("Qwen Image D1 only supports one 1K text-to-image output without references.", "QWEN_IMAGE_SCOPE_UNSUPPORTED", 400);
  }
  const normalizedPrompt = appendModelIdentityInstruction(
    String(prompt || ""),
    normalizedModelImages.length,
    normalizedBaseImages.length,
    modelReferenceStrength,
  );
  const normalizedPromptHash = hashPromptUtf8(normalizedPrompt);
  const expectedPromptHash = String(confirmedPromptHash || "").trim().toLowerCase();
  if (expectedPromptHash && expectedPromptHash !== normalizedPromptHash) {
    throw codedError("prompt_confirmation_stale", "PROMPT_CONFIRMATION_STALE", 409);
  }

  const jobRequest = {
    templateKey: String(templateKey || ""),
    templateTitle: String(requestMeta?.templateTitle || ""),
    generationMode: String(requestMeta?.generationMode || "custom"),
    sourceService: String(requestMeta?.source?.service || "unknown"),
    sourceSurface: String(requestMeta?.source?.surface || "unknown"),
    clientRequestId: String(requestMeta?.clientRequestId || ""),
    promptBytes: Buffer.byteLength(normalizedPrompt, "utf8"),
    promptHash: normalizedPromptHash,
    variables: requestMeta?.variables || {},
    extraPrompt: String(requestMeta?.extraPrompt || ""),
    negative: String(requestMeta?.negative || ""),
    requestedModelName: useModel,
    plannedBillingModelName,
    plannedBillingStrategy,
    hasBaseImages,
    aspectRatio: effectiveAspectRatio,
    size: effectiveSize,
    referenceImageCount: normalizedBaseImages.length,
    modelImageCount: normalizedModelImages.length,
    n: take,
    baseImages: [
      ...extractBaseImagesMeta(normalizedModelImages, "model"),
      ...extractBaseImagesMeta(normalizedBaseImages, "reference"),
    ],
  };

  const providerOperationId = buildProviderOperationId({
    appBillingKey,
    metaRoute,
    sourceService: requestMeta?.source?.service,
    scope,
    uid,
    universeId,
    clientRequestId: requestMeta?.clientRequestId,
  });
  if (isQwenImageRequest && !providerOperationId) {
    throw codedError("qwen_provider_operation_id_required", "PROVIDER_OPERATION_ID_REQUIRED", 400);
  }
  const providerOperationLease = providerOperationId ? await claimProviderOperationOrThrow(providerOperationId) : null;
  if (providerOperationLease?.kind === "replay") {
    return await hydrateProviderOperationReplayResult(providerOperationLease.result, { scope, uid, universeId });
  }
  const completeReplayableResult = async <T extends ImagePipelineResultType>(result: T): Promise<T> => {
    if (providerOperationLease?.kind === "reserved") {
      await providerOperationLease.complete(buildProviderOperationCacheResult(result));
    }
    return result;
  };

  const existingJobIdSafe = String(existingJobId || "").trim();
  let job: unknown;
  try {
    job = existingJobIdSafe
      ? await markImageGenJobRunning({
          jobId: existingJobIdSafe,
          provider,
          modelName: useModel,
          request: jobRequest,
        })
      : await createImageGenJob({
          scope,
          uid: String(uid || ""),
          universeId: String(universeId || ""),
          createdBy: String(uid || ""),
          provider,
          modelName: useModel,
          status: "running",
          deletePolicy: deletePolicy || "soft",
          request: jobRequest,
        });
  } catch (error) {
    if (providerOperationLease?.kind === "reserved") await providerOperationLease.release();
    throw error;
  }

  const jobId = String(toUnknownRecord(job).jobId || existingJobIdSafe || "");
  let urls: string[] = [];
  let storedUrls: string[] = [];
  let storedStorages: Array<Record<string, unknown> | undefined> = [];
  let savedAssets: Array<UnknownRecord> = [];
  let providerCallSucceeded = false;
  let qwenProviderDispatchStarted = false;
  let qwenProviderResponseReceived = false;

  try {
    const expectedBillableImageCount = resolveBillableImageCount({
      provider,
      outputImageCount: take,
      inputImageCount: normalizedInputImages.length,
    });
    const balancePayload = {
      app: appBillingKey,
      provider,
      modelName: plannedBillingModelName,
      variant: billingVariant,
      ...(plannedBillingStrategy === "token" || plannedBillingStrategy === "hybrid"
        ? {
            // 라우터의 가격 상한 판정과 같은 추정 공식을 쓴다 — utils/ai/imageCostEstimate
            usage: estimateImageGenerationTokenUsage({
              promptChars: normalizedPrompt.length,
              inputImageCount: normalizedInputImages.length,
              outputImageCount: take,
            }),
          }
        : {}),
      ...(plannedBillingStrategy === "fixed" || plannedBillingStrategy === "hybrid"
        ? { fixed: { images: expectedBillableImageCount } }
        : {}),
      modality: "image" as const,
      meta: {
        route: `${metaRoute}:preflight`,
        ...(jobId ? { operationId: `image:${jobId}:generate` } : {}),
      },
    };
    if (scope === "user") {
      await assertAIUsageBalanceOrThrow({ uid: String(uid || ""), ...balancePayload });
    } else {
      await assertCommerceAIUsageBalanceOrThrow({
        universeId: String(universeId || ""),
        ...balancePayload,
      });
    }

    if (isQwenImageRequest) qwenProviderDispatchStarted = true;
    const out = await callImagesByProvider(provider, useModel, normalizedPrompt, {
      n: take,
      size: effectiveSize,
      aspectRatio: effectiveAspectRatio,
      baseImages: normalizedInputImages,
      background: String(background || "").trim() || undefined,
      user,
    });
    if (isQwenImageRequest) qwenProviderResponseReceived = true;
    const outputBase64s = Array.isArray(out.base64s) ? out.base64s.slice(0, take).filter(Boolean) : [];
    if (outputBase64s.length === 0) {
      throw codedError("image_provider_returned_no_images", "NO_IMAGE_OUTPUT", 502);
    }
    providerCallSucceeded = true;

    const requestedModelName = useModel;
    const outRec = toUnknownRecord(out);
    const executedModelName = String(outRec.executedModelName || out.modelName || requestedModelName);
    const billedModelName = String(
      outRec.billingModelName ||
        resolveImageBillingModelName({
          provider,
          requestedModelName,
          executedModelName,
          hasBaseImages,
        }),
    );
    const billingStrategy = resolveMediaBillingStrategy({
      provider,
      modelName: billedModelName,
      modality: "image",
      variant: billingVariant,
      pricing: pricingMaps,
    });
    const tokenUsage = outRec.usageTotal as ITokenUsageBreakdown | undefined;

    const paths =
      scope === "user"
        ? resolveSmartCutPaths({ scope: "user", uid: String(uid || "") })
        : resolveSmartCutPaths({ scope: "universe", universeId: String(universeId || "") });

    const saved = await Promise.all(
      outputBase64s.map((b64: string) =>
        saveBase64Image({
          base64: b64,
          dir: paths.dir,
          storagePrefix: paths.storagePrefix,
          visibility: outputVisibility,
          modelName: executedModelName,
          outputFormat: GEN_STUDIO_SAVE_FORMAT,
          quality: GEN_STUDIO_SAVE_QUALITY,
        }),
      ),
    );
    storedUrls = saved.map((s) => s.url || (s.storage ? "" : `${paths.publicBase}/${s.name}`));
    storedStorages = saved.map((s, index) =>
      s.storage ? { ...s.storage, ...(storedUrls[index] ? { url: storedUrls[index] } : {}) } : undefined,
    );
    const hasStoredOutputs = saved.some((s, index) => {
      const storage = storedStorages[index];
      if (String(storedUrls[index] || "").trim()) return true;
      return Boolean(storage && (String(storage.bucket || "").trim() || String(storage.key || "").trim()));
    });

    if (jobId && promptSnapshot) {
      await createPromptSnapshot({
        jobId,
        templateKey: String(templateKey || ""),
        title: promptSnapshot.title,
        templateText: promptSnapshot.templateText,
        defaultParams: promptSnapshot.defaultParams,
        inputPolicy: promptSnapshot.inputPolicy,
        tags: promptSnapshot.tags,
        categories: promptSnapshot.categories,
        version: promptSnapshot.version,
        enabled: promptSnapshot.enabled,
        renderedPrompt: normalizedModelImages.length > 0 ? normalizedPrompt : promptSnapshot.renderedPrompt,
        negative: promptSnapshot.negative,
        variables: promptSnapshot.variables,
        extraPrompt: promptSnapshot.extraPrompt,
      });
    }

    if (jobId && hasStoredOutputs) {
      savedAssets = (await createImageAssets({
        jobId,
        scope,
        uid: String(uid || ""),
        universeId: String(universeId || ""),
        // R2 private 결과는 표시 URL이 비어 있을 수 있으므로, PUT 후 확정한
        // storedUrls와 storage 메타를 함께 등록한다. 빈 urls를 넘기면
        // 비-R2 fallback 결과가 자산 문서로 누락될 수 있다.
        urls: storedUrls,
        provider,
        modelName: executedModelName,
        templateKey: String(templateKey || ""),
        generationMode: (requestMeta?.generationMode || "custom") as PromptGenType,
        sourceService: requestMeta?.source?.service,
        sourceSurface: requestMeta?.source?.surface,
        extraPrompt: String(requestMeta?.extraPrompt || promptSnapshot?.extraPrompt || ""),
        tags: promptSnapshot?.tags,
        categories: promptSnapshot?.categories,
        routingMeta: safeRoutingMeta,
        deletePolicy: deletePolicy || "soft",
        visibility: outputVisibility,
        storages: storedStorages,
      })) as unknown as UnknownRecord[];
    }

    const displayUrls = await Promise.all((savedAssets || []).map((asset) => resolveImageAssetDisplayUrl(asset)));
    urls = displayUrls.map((item) => item.url).filter(Boolean);

    const assetMetas = (savedAssets || []).map((asset: UnknownRecord, index) => {
      const storage = toUnknownRecord(asset.storage);
      const display = displayUrls[index] || { url: String(storage.url || ""), urlKind: "none" };
      return {
        assetId: String(asset.assetId || ""),
        jobId: String(asset.jobId || jobId || ""),
        url: String(display.url || ""),
        urlKind: String(display.urlKind || "none"),
        urlExpiresAt: display.urlExpiresAt || undefined,
        refreshUrl: display.refreshUrl || undefined,
        templateKey: String(asset.templateKey || templateKey || ""),
        templateTitle: String(promptSnapshot?.title || ""),
        visibility: String(asset.visibility || outputVisibility),
        scope: String(asset.scope || scope || "user"),
        uid: String(asset.uid || uid || ""),
        universeId: String(asset.universeId || universeId || ""),
        createdAt: (asset.createdAt as Date | string | null) || null,
        provider: String(asset.provider || provider),
        modelName: String(asset.modelName || executedModelName),
        generationMode: String(asset.generationMode || requestMeta?.generationMode || "custom"),
        sourceService: String(asset.sourceService || requestMeta?.source?.service || "unknown"),
        sourceSurface: String(asset.sourceSurface || requestMeta?.source?.surface || "unknown"),
        outputIndex: Number(asset.outputIndex || 0),
        extraPrompt: String(asset.extraPrompt || requestMeta?.extraPrompt || promptSnapshot?.extraPrompt || ""),
        ...toAgentImageRoutingMetaResponse(asset.routingMeta),
        storage: {
          driver: String(storage.driver || ""),
          access: String(storage.access || ""),
          mimeType: String(storage.mimeType || ""),
          ext: String(storage.ext || ""),
          bytes: Number(storage.bytes || 0),
          sha256: String(storage.sha256 || ""),
        },
      };
    });
    const savedRefs = (savedAssets || [])
      .map((asset: UnknownRecord) => {
        const storage = toUnknownRecord(asset.storage);
        const publicUrl = String(storage.url || "").trim();
        if (publicUrl) return publicUrl;
        const bucket = String(storage.bucket || "").trim();
        const key = String(storage.key || "").trim();
        return bucket && key ? `r2://${bucket}/${key}` : "";
      })
      .filter(Boolean);

    // xAI imagine 편집은 입력 + 출력 이미지 모두 과금 단위에 반영
    const billableImageCount = resolveBillableImageCount({
      provider,
      outputImageCount: urls.length,
      inputImageCount: normalizedInputImages.length,
    });

    const meta = {
      ...mergeAgentImageRoutingMetaForBilling(
        {
          route: metaRoute,
          ...(scope === "universe" ? { universeId: String(universeId || "") } : {}),
          provider,
          requestedModelName,
          executedModelName,
          billedModelName,
          modelName: executedModelName,
          size: effectiveSize,
          aspectRatio: effectiveAspectRatio,
          saved: savedRefs,
          billableImageCount,
          billingStrategy,
          tokenUsage: tokenUsage || null,
          referenceImageCount: normalizedBaseImages.length,
          modelImageCount: normalizedModelImages.length,
          visibility: outputVisibility,
          source: "user_action",
          ...(metaExtra || {}),
        },
        safeRoutingMeta,
      ),
      ...(jobId ? { operationId: `image:${jobId}:generate` } : {}),
    };

    const shouldBillToken = billingStrategy === "token" || billingStrategy === "hybrid";
    const shouldBillFixed = billingStrategy === "fixed" || billingStrategy === "hybrid";
    if (shouldBillToken && !hasBillableTokenUsage(tokenUsage)) {
      throw codedError("token_usage_missing", "TOKEN_USAGE_MISSING", 502);
    }

    const billingPayload = {
      ...(shouldBillToken ? { usage: tokenUsage } : {}),
      ...(shouldBillFixed ? { fixed: { images: billableImageCount } } : {}),
    };

    if (scope === "user") {
      const billed = await billAIUsageOrThrow({
        uid: String(uid || ""),
        app: appBillingKey,
        provider,
        modelName: billedModelName,
        variant: billingVariant,
        ...billingPayload,
        modality: "image",
        meta,
      });

      if (jobId) {
        await markImageGenJobSuccess({
          jobId,
          outputCount: urls.length,
          status: urls.length < take ? "partial" : "success",
          billing: {
            requestedModelName,
            executedModelName,
            billedModelName,
            billingStrategy,
            tokenUsage,
            coins: Number(billed.coins || 0),
          },
        }).catch((e: unknown) => logger.warn("[imagePipeline] markImageGenJobSuccess failed:", e));
      }

      const result = {
        ok: true as const,
        data: {
          jobId,
          images: urls,
          assetIds: assetMetas.map((asset) => asset.assetId).filter(Boolean),
          assets: assetMetas,
          coins: billed.coins ?? 0,
          modelName: requestedModelName,
          executedModelName,
          billedModelName,
          provider,
        },
      };
      return await completeReplayableResult(result);
    }

    const billed = await billCommerceAIUsageOrThrow({
      universeId: String(universeId || ""),
      app: appBillingKey,
      provider,
      modelName: billedModelName,
      variant: billingVariant,
      ...billingPayload,
      modality: "image",
      meta,
    });

    if (jobId) {
      await markImageGenJobSuccess({
        jobId,
        outputCount: urls.length,
        status: urls.length < take ? "partial" : "success",
        billing: {
          requestedModelName,
          executedModelName,
          billedModelName,
          billingStrategy,
          tokenUsage,
          coins: Number(billed.coins || 0),
        },
      }).catch((e: unknown) => logger.warn("[imagePipeline] markImageGenJobSuccess failed:", e));
    }

    const result = {
      ok: true as const,
      data: {
        jobId,
        images: urls,
        assetIds: assetMetas.map((asset) => asset.assetId).filter(Boolean),
        assets: assetMetas,
        coins: billed.coins ?? 0,
        modelName: requestedModelName,
        executedModelName,
        billedModelName,
        provider,
      },
    };
    return await completeReplayableResult(result);
  } catch (e: unknown) {
    const errLike = toErrorLike(e);
    if (jobId) {
      await markAssetsDeletedByJob({
        jobId,
        deletedBy: String(uid || ""),
        reason: String(errLike.message || "generation_failed"),
        policy: deletePolicy || "soft",
      }).catch((markErr: unknown) => logger.warn("[imagePipeline] markAssetsDeletedByJob failed:", markErr));
    }

    if (storedStorages.length > 0) {
      await Promise.allSettled(storedStorages.map((storage) => deleteStoredGenStudioImageByStorage(storage))).catch(
        (cleanupErr: unknown) => logger.warn("[imagePipeline] cleanupGeneratedStorage failed:", cleanupErr),
      );
    } else if (storedUrls.length > 0) {
      await cleanupGeneratedFiles(storedUrls).catch((cleanupErr: unknown) =>
        logger.warn("[imagePipeline] cleanupGeneratedFiles failed:", cleanupErr),
      );
    }

    if (jobId) {
      await markImageGenJobFailed({
        jobId,
        code: String(errLike.errorCode || ""),
        reason: String(errLike.message || "generation_failed"),
      }).catch((markErr: unknown) => logger.warn("[imagePipeline] markImageGenJobFailed failed:", markErr));
    }

    if (providerOperationLease?.kind === "reserved") {
      if (isQwenImageRequest) {
        const disposition = classifyQwenImageOperationFailure({
          dispatchStarted: qwenProviderDispatchStarted,
          responseReceived: qwenProviderResponseReceived,
          error: e,
        });
        if (disposition === "release") await providerOperationLease.release();
        else await providerOperationLease.markUnresolved(disposition);
      } else if (!providerCallSucceeded) {
        await providerOperationLease.release();
      }
    }

    throw e;
  }
}
