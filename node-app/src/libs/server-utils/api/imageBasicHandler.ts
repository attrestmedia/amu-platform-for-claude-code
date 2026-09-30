import "server-only";
import type { ImageProviderType } from "types/ai";
import type { ImagePromptCustomType } from "types/app";
import { IMAGE_STUDIO_NAMESPACE_KEY, IMAGE_STUDIO_COMMERCE_NAMESPACE_KEY } from "consts/app";
import { getImagePromptByKeyInternal } from "libs/database/lab/imagePromptRepo";
import { resolvePromptDefaultModelName, resolvePromptModelLock } from "utils/app/promptModelLock";
import { resolveImageProvider, generateSaveAndBillImages } from "./imagePipeline";
import { validateTemplateReferencePolicy } from "./imageReferencePolicyGuard";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process handleUserImageBasic 중심 처리  입력 검증  핵심 로직  결과 포맷팅  프롬프트 렌더링/정책 적용 포함  이미지 파이프라인 호출 포함
 * @domain ai-image
 * @scope global
 */

async function resolveTemplateBackedModelSelection(data: ImagePromptCustomType) {
  const templateKey = String(data?.templateKey || "").trim();
  if (!templateKey) return null;

  const doc = await getImagePromptByKeyInternal(templateKey);
  if (!doc) return null;

  const defaultParams: UnknownRecord = toUnknownRecord(toUnknownRecord(doc).defaultParams);
  const locked = resolvePromptModelLock(defaultParams);
  if (locked) return locked;

  if (String(data?.modelName || "").trim()) return null;

  const modelName = resolvePromptDefaultModelName(defaultParams);
  if (!modelName) return null;

  return {
    provider: resolveImageProvider({
      bodyProvider: defaultParams.provider as ImageProviderType | undefined,
      modelName,
    }),
    modelName,
  };
}

export async function handleUserImageBasic(
  data: ImagePromptCustomType,
  user: unknown,
  opts?: { forcedProvider?: ImageProviderType; routeMeta?: string; existingJobId?: string; clientRequestId?: string },
) {
  const u = toUnknownRecord(user);
  const uid = String(u.uid || u.ID || "");
  if (!uid) return { ok: false, error: "UNAUTHORIZED" };

  const templateBackedModel = await resolveTemplateBackedModelSelection(data);
  const requestedModelName = String(templateBackedModel?.modelName || data?.modelName || "").trim();
  const provider = resolveImageProvider({
    bodyProvider: templateBackedModel?.provider || data?.provider,
    modelName: requestedModelName,
    forcedProvider: opts?.forcedProvider,
  });
  const policyError = await validateTemplateReferencePolicy(data, provider);
  if (policyError) return policyError;

  return await generateSaveAndBillImages({
    scope: "user",
    uid,
    user,
    provider,
    modelName: requestedModelName,
    prompt: data?.prompt,
    baseImages: data?.baseImages,
    modelImages: data?.modelImages,
    referenceStrength: data?.referenceStrength,
    modelReferenceStrength: data?.modelReferenceStrength,
    n: data?.n,
    size: data?.size,
    aspectRatio: data?.aspectRatio,
    metaRoute: opts?.routeMeta || "ai/generate/basic-image",
    appBillingKey: IMAGE_STUDIO_NAMESPACE_KEY,
    templateKey: data?.templateKey,
    requestMeta: {
      extraPrompt: String(data?.prompt || ""),
      generationMode: data?.generationMode || "custom",
      clientRequestId: opts?.clientRequestId,
      source: data?.source,
    },
    visibility: data?.visibility,
    existingJobId: opts?.existingJobId,
  });
}

export async function handleUniverseImageBasic(
  data: ImagePromptCustomType,
  user: unknown,
  opts?: { forcedProvider?: ImageProviderType; routeMeta?: string; existingJobId?: string; clientRequestId?: string },
) {
  const u = toUnknownRecord(user);
  const uid = String(u.uid || u.ID || "");
  const universeId = String(data?.universeId || "");
  if (!universeId) return { ok: false, error: "universeId_required" };

  const templateBackedModel = await resolveTemplateBackedModelSelection(data);
  const requestedModelName = String(templateBackedModel?.modelName || data?.modelName || "").trim();
  const provider = resolveImageProvider({
    bodyProvider: templateBackedModel?.provider || data?.provider,
    modelName: requestedModelName,
    forcedProvider: opts?.forcedProvider,
  });
  const policyError = await validateTemplateReferencePolicy(data, provider);
  if (policyError) return policyError;

  return await generateSaveAndBillImages({
    scope: "universe",
    uid,
    user,
    universeId,
    provider,
    modelName: requestedModelName,
    prompt: data?.prompt,
    baseImages: data?.baseImages,
    modelImages: data?.modelImages,
    referenceStrength: data?.referenceStrength,
    modelReferenceStrength: data?.modelReferenceStrength,
    n: data?.n,
    size: data?.size,
    aspectRatio: data?.aspectRatio,
    metaRoute: opts?.routeMeta || "commerce/generate/basic-image",
    appBillingKey: IMAGE_STUDIO_COMMERCE_NAMESPACE_KEY,
    templateKey: data?.templateKey,
    requestMeta: {
      extraPrompt: String(data?.prompt || ""),
      generationMode: data?.generationMode || "custom",
      clientRequestId: opts?.clientRequestId,
      source: data?.source,
    },
    visibility: data?.visibility,
    existingJobId: opts?.existingJobId,
  });
}
