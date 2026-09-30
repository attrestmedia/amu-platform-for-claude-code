import "server-only";
import type { ImageProviderType } from "types/ai";
import type { ImagePromptCustomType, ImagePromptInputPolicyType } from "types/app";
import { getImagePromptByKeyInternal } from "libs/database/lab/imagePromptRepo";
import { countImageReferenceInputs, resolveImageReferencePolicy } from "utils/lab";
import { toUnknownRecord } from "utils/common/typeUtils";

export async function validateTemplateReferencePolicy(data: ImagePromptCustomType, provider: ImageProviderType) {
  const templateKey = String(data?.templateKey || "").trim();
  if (!templateKey) return null;

  const doc = await getImagePromptByKeyInternal(templateKey);
  if (!doc) return null;

  const inputPolicy = toUnknownRecord(doc).inputPolicy as ImagePromptInputPolicyType | undefined;
  const referencePolicy = resolveImageReferencePolicy(inputPolicy, provider);
  const refCount = countImageReferenceInputs([...(data?.baseImages || []), ...(data?.modelImages || [])]);
  const shouldEnforceRequired =
    referencePolicy.required && (data?.generationMode !== "custom" || referencePolicy.enforceInCustomMode);

  if (shouldEnforceRequired && refCount < referencePolicy.minCount) {
    return { ok: false, error: "reference_image_required", errorCode: "REFERENCE_IMAGE_REQUIRED" };
  }

  if (referencePolicy.maxCount > 0 && refCount > referencePolicy.maxCount) {
    return { ok: false, error: "reference_image_max_count_exceeded", errorCode: "REFERENCE_IMAGE_MAX_COUNT_EXCEEDED" };
  }

  return null;
}
