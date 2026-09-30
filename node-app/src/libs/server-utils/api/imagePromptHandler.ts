import "server-only";
import type { ImagePromptBodyType, ImagePromptInputPolicyType } from "types/app";
import type { ImageProviderType } from "types/ai";
import { AI_GEN_IMAGE_LIMIT } from "consts/ai";
import { IMAGE_STUDIO_NAMESPACE_KEY, IMAGE_STUDIO_COMMERCE_NAMESPACE_KEY } from "consts/app";
import { getImagePromptByKey } from "libs/database/lab/imagePromptRepo";
import { resolveSystemDefaultModelName } from "libs/server-utils/api/systemModelControl";
import { resolveUserImagePromptDoc } from "./apiSafetyHelper";
import {
  countImageReferenceInputs,
  filterImagePromptVariableDefaults,
  renderImagePrompt,
  resolveImagePromptNegative,
  resolveImageReferencePolicy,
} from "utils/lab";
import {
  normalizeImageProvider,
  resolveImageProvider,
  generateSaveAndBillImages,
} from "./imagePipeline";
import { getRequiredPromptVariableError } from "./promptTemplateValidation";
import { resolvePromptDefaultModelName, resolvePromptModelLock } from "utils/app/promptModelLock";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process handleUserImagePrompt 중심 처리  입력 검증  핵심 로직  결과 포맷팅  프롬프트 렌더링/정책 적용 포함  이미지 파이프라인 호출 포함
 * @domain ai-image
 * @scope global
 */

function pickProvider(payloadProvider: unknown, docProvider: unknown) {
  return normalizeImageProvider(payloadProvider) || normalizeImageProvider(docProvider) || "google";
}

async function resolvePromptModelSelection(args: {
  payloadProvider: unknown;
  payloadModelName: unknown;
  defaultParams: UnknownRecord;
}) {
  const locked = resolvePromptModelLock(args.defaultParams);
  if (locked) return locked;

  const fallbackModelName = resolvePromptDefaultModelName(args.defaultParams);
  const requestedModelName = String(args.payloadModelName || fallbackModelName || "").trim();
  const picked = pickProvider(args.payloadProvider, args.defaultParams.provider);
  const provider = resolveImageProvider({
    bodyProvider: picked || undefined,
    modelName: requestedModelName || undefined,
  });
  const systemDefaultModel = await resolveSystemDefaultModelName({ provider, modality: "image" });

  return {
    provider,
    modelName: requestedModelName || String(systemDefaultModel),
  };
}

export async function handleUserImagePrompt(
  data: ImagePromptBodyType,
  user: unknown,
  opts?: { existingJobId?: string; clientRequestId?: string },
) {
  const u = toUnknownRecord(user);
  const uid = String(u.uid || u.ID || "");
  if (!uid) return { ok: false, error: "UNAUTHORIZED" };

  const doc = await resolveUserImagePromptDoc({
    templateKey: data?.templateKey,
    templateScope: data?.templateScope,
    user,
  });
  if (!doc) return { ok: false, error: "prompt_not_found" };

  const docRec = toUnknownRecord(doc);
  const defaultParams = toUnknownRecord(docRec.defaultParams);

  const modelSelection = await resolvePromptModelSelection({
    payloadProvider: data?.provider,
    payloadModelName: data?.modelName,
    defaultParams,
  });
  const provider: ImageProviderType = modelSelection.provider;
  const inputPolicy = docRec.inputPolicy as ImagePromptInputPolicyType | undefined;
  const referencePolicy = resolveImageReferencePolicy(inputPolicy, provider);
  const refCount = countImageReferenceInputs([...(data?.baseImages || []), ...(data?.modelImages || [])]);
  if (referencePolicy.required && refCount < referencePolicy.minCount) {
    return { ok: false, error: "reference_image_required", errorCode: "REFERENCE_IMAGE_REQUIRED" };
  }
  if (referencePolicy.maxCount > 0 && refCount > referencePolicy.maxCount) {
    return { ok: false, error: "reference_image_max_count_exceeded", errorCode: "REFERENCE_IMAGE_MAX_COUNT_EXCEEDED" };
  }

  const modelName = modelSelection.modelName;

  const defaultsOnlyVars = filterImagePromptVariableDefaults(defaultParams);
  const variables = { ...defaultsOnlyVars, ...(data?.variables || {}) };
  const requiredVariableError = getRequiredPromptVariableError(String(doc?.templateText || ""), variables);
  if (requiredVariableError) return requiredVariableError;
  const resolvedNegative = resolveImagePromptNegative(
    String(doc?.templateText || ""),
    typeof data?.negative === "string" ? data.negative : (defaultParams.negative as string | undefined),
  );
  const finalPrompt = renderImagePrompt(doc.title, doc.templateText, {
    extra: String(data?.extraPrompt || ""),
    negative: resolvedNegative,
    params: variables,
  });

  return await generateSaveAndBillImages({
    scope: "user",
    uid,
    user,
    provider: resolveImageProvider({ bodyProvider: provider, modelName, forcedProvider: provider }),
    modelName,
    prompt: finalPrompt,
    baseImages: data?.baseImages,
    modelImages: data?.modelImages,
    referenceStrength: data?.referenceStrength,
    modelReferenceStrength: data?.modelReferenceStrength,
    n: Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(data?.n || 1))),
    size: data?.size || (defaultParams.size as string | undefined),
    aspectRatio: data?.aspectRatio || (defaultParams.aspectRatio as string | undefined),
    metaRoute: "ai/generate/template-image",
    appBillingKey: IMAGE_STUDIO_NAMESPACE_KEY,
    metaExtra: {
      templateKey: data?.templateKey,
      negative: resolvedNegative,
    },
    templateKey: data?.templateKey,
    requestMeta: {
      variables: data?.variables || {},
      extraPrompt: String(data?.extraPrompt || ""),
      negative: String(resolvedNegative || ""),
      generationMode: "template",
      clientRequestId: opts?.clientRequestId,
      templateTitle: String(doc?.title || ""),
      source: data?.source,
    },
    promptSnapshot: {
      title: String(doc?.title || ""),
      templateText: String(doc?.templateText || ""),
      defaultParams,
      inputPolicy: toUnknownRecord(docRec.inputPolicy),
      tags: Array.isArray(docRec.tags) ? (docRec.tags as string[]) : [],
      categories: Array.isArray(docRec.categories) ? (docRec.categories as string[]) : [],
      version: typeof docRec.version === "number" ? Number(docRec.version) : undefined,
      enabled: typeof docRec.enabled === "boolean" ? Boolean(docRec.enabled) : undefined,
      renderedPrompt: finalPrompt,
      negative: String(resolvedNegative || ""),
      variables: data?.variables || {},
      extraPrompt: String(data?.extraPrompt || ""),
    },
    visibility: data?.visibility,
    existingJobId: opts?.existingJobId,
  });
}

export async function handleUniverseImagePrompt(
  data: ImagePromptBodyType,
  user?: unknown,
  opts?: { existingJobId?: string; clientRequestId?: string },
) {
  const u = toUnknownRecord(user);
  const uid = String(u.uid || u.ID || "");
  const universeId = String(data?.universeId || "");
  if (!universeId) return { ok: false, error: "universeId_required" };

  const doc = await getImagePromptByKey(String(data?.templateKey || ""));
  if (!doc) return { ok: false, error: "prompt_not_found" };

  const docRec = toUnknownRecord(doc);
  const defaultParams = toUnknownRecord(docRec.defaultParams);

  const modelSelection = await resolvePromptModelSelection({
    payloadProvider: data?.provider,
    payloadModelName: data?.modelName,
    defaultParams,
  });
  const provider: ImageProviderType = modelSelection.provider;
  const inputPolicy = docRec.inputPolicy as ImagePromptInputPolicyType | undefined;
  const referencePolicy = resolveImageReferencePolicy(inputPolicy, provider);
  const refCount = countImageReferenceInputs([...(data?.baseImages || []), ...(data?.modelImages || [])]);
  if (referencePolicy.required && refCount < referencePolicy.minCount) {
    return { ok: false, error: "reference_image_required", errorCode: "REFERENCE_IMAGE_REQUIRED" };
  }
  if (referencePolicy.maxCount > 0 && refCount > referencePolicy.maxCount) {
    return { ok: false, error: "reference_image_max_count_exceeded", errorCode: "REFERENCE_IMAGE_MAX_COUNT_EXCEEDED" };
  }

  const modelName = modelSelection.modelName;

  const defaultsOnlyVars = filterImagePromptVariableDefaults(defaultParams);
  const variables = { ...defaultsOnlyVars, ...(data?.variables || {}) };
  const requiredVariableError = getRequiredPromptVariableError(String(doc?.templateText || ""), variables);
  if (requiredVariableError) return requiredVariableError;
  const resolvedNegative = resolveImagePromptNegative(
    String(doc?.templateText || ""),
    typeof data?.negative === "string" ? data.negative : (defaultParams.negative as string | undefined),
  );
  const finalPrompt = renderImagePrompt(doc.title, doc.templateText, {
    extra: String(data?.extraPrompt || ""),
    negative: resolvedNegative,
    params: variables,
  });

  return await generateSaveAndBillImages({
    scope: "universe",
    uid,
    user,
    universeId,
    provider: resolveImageProvider({ bodyProvider: provider, modelName, forcedProvider: provider }),
    modelName,
    prompt: finalPrompt,
    baseImages: data?.baseImages,
    modelImages: data?.modelImages,
    referenceStrength: data?.referenceStrength,
    modelReferenceStrength: data?.modelReferenceStrength,
    n: Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(data?.n || 1))),
    size: data?.size || (defaultParams.size as string | undefined),
    aspectRatio: data?.aspectRatio || (defaultParams.aspectRatio as string | undefined),
    metaRoute: "commerce/generate/template-image",
    appBillingKey: IMAGE_STUDIO_COMMERCE_NAMESPACE_KEY,
    metaExtra: {
      templateKey: data?.templateKey,
      negative: resolvedNegative,
      universeId,
    },
    templateKey: data?.templateKey,
    requestMeta: {
      variables: data?.variables || {},
      extraPrompt: String(data?.extraPrompt || ""),
      negative: String(resolvedNegative || ""),
      generationMode: "template",
      clientRequestId: opts?.clientRequestId,
      templateTitle: String(doc?.title || ""),
      source: data?.source,
    },
    promptSnapshot: {
      title: String(doc?.title || ""),
      templateText: String(doc?.templateText || ""),
      defaultParams,
      inputPolicy: toUnknownRecord(docRec.inputPolicy),
      tags: Array.isArray(docRec.tags) ? (docRec.tags as string[]) : [],
      categories: Array.isArray(docRec.categories) ? (docRec.categories as string[]) : [],
      version: typeof docRec.version === "number" ? Number(docRec.version) : undefined,
      enabled: typeof docRec.enabled === "boolean" ? Boolean(docRec.enabled) : undefined,
      renderedPrompt: finalPrompt,
      negative: String(resolvedNegative || ""),
      variables: data?.variables || {},
      extraPrompt: String(data?.extraPrompt || ""),
    },
    visibility: data?.visibility,
    existingJobId: opts?.existingJobId,
  });
}
