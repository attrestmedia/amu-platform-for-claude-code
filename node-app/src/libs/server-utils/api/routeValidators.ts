import "server-only";
import { CHARACTER_REFERENCE_IMAGE_ROLES } from "consts/app";
import { CHARACTER_REFERENCE_KIT_VISIBILITIES } from "models/character";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

export function validateTemplateKey(body: UnknownRecord) {
  const templateKey = typeof body.templateKey === "string" ? body.templateKey.trim() : "";
  if (!templateKey) return { valid: false, error: "templateKey_required" };
  return { valid: true };
}

export function validatePromptOrBaseImage(body: UnknownRecord) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const hasImg =
    (Array.isArray(body.baseImages) && body.baseImages.some((v: unknown) => Boolean(toUnknownRecord(v).data))) ||
    (Array.isArray(body.modelImages) && body.modelImages.some((v: unknown) => Boolean(toUnknownRecord(v).data)));
  if (!prompt && !hasImg) return { valid: false, error: "prompt_or_baseImage_required" };
  return { valid: true };
}

export function validateContentPrompt(body: UnknownRecord) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return { valid: false, error: "prompt_required" };
  return { valid: true };
}

function validateDraftActionMode(mode: unknown) {
  const value = typeof mode === "string" ? mode.trim().toLowerCase() : "";
  if (!value) return { valid: true };
  if (value !== "create" && value !== "update") {
    return { valid: false, error: "mode_must_be_create_or_update" };
  }
  return { valid: true };
}

function validateExpectedRevision(body: UnknownRecord, required: boolean) {
  const raw = body.expectedRevision;
  if (raw === undefined || raw === null || raw === "") {
    return required ? { valid: false, error: "expectedRevision_required" } : { valid: true };
  }

  const revision = Number(raw);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    return { valid: false, error: "expectedRevision_invalid" };
  }
  return { valid: true };
}

export function validateSmartstoreDraftAction(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) return { valid: false, error: "draftId_required" };
  const revision = validateExpectedRevision(body, true);
  if (!revision.valid) return revision;
  return validateDraftActionMode(body.mode);
}

export function validateSmartstorePublishPreview(body: UnknownRecord) {
  return validateSmartstoreDraftAction(body);
}

export function validateCommerceDraftCreate(body: UnknownRecord) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (body.title !== undefined && !title) return { valid: false, error: "title_invalid" };
  return { valid: true };
}

export function validateCommerceDraftCreateAllowlist(body: UnknownRecord) {
  const categoryPolicyGroup = typeof body.categoryPolicyGroup === "string" ? body.categoryPolicyGroup.trim() : "";
  if (!categoryPolicyGroup) return { valid: false, error: "categoryPolicyGroup_required" };

  // title은 선택 입력: 빈 문자열은 라우트가 기본 제목(buildDefaultTitle)으로 대체하므로 비문자열 타입만 거절
  if (body.title !== undefined && typeof body.title !== "string") return { valid: false, error: "title_invalid" };

  return { valid: true };
}

export function validateCommerceDraftPatch(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) return { valid: false, error: "draftId_required" };
  if (!body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) {
    return { valid: false, error: "patch_required" };
  }
  const revision = validateExpectedRevision(body, false);
  if (!revision.valid) return revision;
  return { valid: true };
}

function hasTemplateKey(body: UnknownRecord) {
  return typeof body.templateKey === "string" && body.templateKey.trim().length > 0;
}

function hasPrompt(body: UnknownRecord) {
  return typeof body.prompt === "string" && body.prompt.trim().length > 0;
}

export function validateCommerceDraftGenerateContent(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) return { valid: false, error: "draftId_required" };
  if (!hasTemplateKey(body) && !hasPrompt(body)) {
    return { valid: false, error: "templateKey_or_prompt_required" };
  }
  return { valid: true };
}

// SSM-204: 상품 사실 기반 후보 생성. 필드별 후보만 허용하고, 구조화 필드는 생성 대상이 아니다.
const COMMERCE_PRODUCT_CONTENT_TARGET_FIELDS = ["title", "summary", "detailHtml"];

export function validateCommerceDraftGenerateProductContent(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) return { valid: false, error: "draftId_required" };

  const rawFields = Array.isArray(body.targetFields) ? body.targetFields : [];
  const fields = rawFields
    .map((field) => (typeof field === "string" ? field.trim().toLowerCase() : ""))
    .filter(Boolean);
  if (!fields.length) return { valid: false, error: "targetFields_required" };
  if (fields.length > 3) return { valid: false, error: "targetFields_too_many" };
  if (!fields.every((field) => COMMERCE_PRODUCT_CONTENT_TARGET_FIELDS.includes(field))) {
    return { valid: false, error: "targetFields_invalid" };
  }

  const extraPrompt = typeof body.extraPrompt === "string" ? body.extraPrompt.trim() : "";
  if (extraPrompt.length > 1000) return { valid: false, error: "extraPrompt_too_long" };

  return { valid: true };
}

export function validateCommerceDraftGenerateImage(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) return { valid: false, error: "draftId_required" };
  if (!hasTemplateKey(body)) return validatePromptOrBaseImage(body);
  return { valid: true };
}

// 기본 정보 AI 자동완성 — 클라 폼의 상품 이미지 URL(선택)만 받는다. 서버에서 SSRF·개수를 재검증한다.
export function validateCommerceDraftSuggestBasicInfo(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) return { valid: false, error: "draftId_required" };

  const rawUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
  const urls = rawUrls
    .filter((url: unknown): url is string => typeof url === "string")
    .map((url: string) => url.trim())
    .filter(Boolean);
  if (urls.length > 4) return { valid: false, error: "imageUrls_too_many" };
  for (const url of urls) {
    if (url.length > 2048) return { valid: false, error: "imageUrl_too_long" };
  }

  return { valid: true };
}

export function validateCommerceDraftApplyAsset(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  const assetType = typeof body.assetType === "string" ? body.assetType.trim().toLowerCase() : "";
  const targetField = typeof body.targetField === "string" ? body.targetField.trim().toLowerCase() : "";

  if (!draftId) return { valid: false, error: "draftId_required" };
  if (!assetId) return { valid: false, error: "assetId_required" };
  if (assetType !== "content" && assetType !== "image") {
    return { valid: false, error: "assetType_invalid" };
  }
  if (assetType === "content" && !["title", "summary", "detailHtml".toLowerCase()].includes(targetField)) {
    return { valid: false, error: "content_target_invalid" };
  }
  // SSM-203: 내부 variant(모델컷·썸네일)는 Smartstore payload에 실리지 않고 lineage만 남긴다.
  if (assetType === "image" && !["representative", "detail", "model_cut", "thumbnail"].includes(targetField)) {
    return { valid: false, error: "image_target_invalid" };
  }
  if (body.referenceImageUrls !== undefined) {
    if (!Array.isArray(body.referenceImageUrls) || body.referenceImageUrls.length > 4) {
      return { valid: false, error: "referenceImageUrls_invalid" };
    }
    for (const url of body.referenceImageUrls) {
      if (typeof url !== "string" || url.trim().length > 2048 || !/^https?:\/\//i.test(url.trim())) {
        return { valid: false, error: "referenceImageUrl_invalid" };
      }
    }
  }
  return { valid: true };
}

function isModelReferenceRole(value: string) {
  return (CHARACTER_REFERENCE_IMAGE_ROLES as readonly string[]).includes(value);
}

export function validateCharacterReferenceKitCreate(body: UnknownRecord) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { valid: false, error: "name_required" };
  if (name.length > 80) return { valid: false, error: "name_too_long" };
  return { valid: true };
}

export function validateCharacterReferenceKitPatch(body: UnknownRecord) {
  const patch = body.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { valid: false, error: "patch_required" };
  }
  const raw = patch as UnknownRecord;
  if (raw.name !== undefined) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return { valid: false, error: "name_invalid" };
    if (name.length > 80) return { valid: false, error: "name_too_long" };
  }
  if (raw.status !== undefined) {
    const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
    if (status !== "draft" && status !== "active" && status !== "archived") {
      return { valid: false, error: "status_invalid" };
    }
  }
  // ASH-17 3단계 — 공유 축 허용값을 서버에서 고정한다. owner 축은 patch 로 바꿀 수 없다.
  if (raw.visibility !== undefined) {
    const visibility = typeof raw.visibility === "string" ? raw.visibility.trim().toLowerCase() : "";
    if (!(CHARACTER_REFERENCE_KIT_VISIBILITIES as readonly string[]).includes(visibility)) {
      return { valid: false, error: "visibility_invalid" };
    }
  }
  if (raw.allowedUniverseIds !== undefined) {
    if (!Array.isArray(raw.allowedUniverseIds) || raw.allowedUniverseIds.length > 50) {
      return { valid: false, error: "allowedUniverseIds_invalid" };
    }
    if (raw.allowedUniverseIds.some((value) => typeof value !== "string" || !value.trim())) {
      return { valid: false, error: "allowedUniverseIds_invalid" };
    }
  }
  return { valid: true };
}

export function validateCharacterReferenceKitAttachImage(body: UnknownRecord) {
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";

  if (!isModelReferenceRole(role)) return { valid: false, error: "role_invalid" };
  if (!url && !assetId) return { valid: false, error: "url_or_assetId_required" };
  return { valid: true };
}

export function validateCommerceDraftModelReferenceKitSelection(body: UnknownRecord) {
  const kitIds = Array.isArray(body.kitIds) ? body.kitIds : [];
  if (kitIds.length > 6) return { valid: false, error: "kitIds_too_many" };
  if (kitIds.some((value) => typeof value !== "string" || !value.trim())) {
    return { valid: false, error: "kitIds_invalid" };
  }
  return { valid: true };
}

export function validateCommerceDraftImportFromNaver(body: UnknownRecord) {
  const channelProductNo = Number(body.channelProductNo);
  if (!Number.isFinite(channelProductNo) || channelProductNo <= 0) {
    return { valid: false, error: "channelProductNo_required" };
  }
  return { valid: true };
}

export function validateCommerceDraftSyncFromNaver(body: UnknownRecord) {
  const pageSize = Number(body.pageSize ?? 50);
  const maxPages = Number(body.maxPages ?? 3);

  if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 100) {
    return { valid: false, error: "pageSize_must_be_1_to_100" };
  }
  if (!Number.isFinite(maxPages) || maxPages < 1 || maxPages > 20) {
    return { valid: false, error: "maxPages_must_be_1_to_20" };
  }

  return { valid: true };
}

export function validateCommerceDraftPublish(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) return { valid: false, error: "draftId_required" };
  const revision = validateExpectedRevision(body, true);
  if (!revision.valid) return revision;
  return validateDraftActionMode(body.mode);
}

const COMMERCE_WORKFLOW_RUN_ACTIONS = [
  "start_stage",
  "complete_stage",
  "fail_stage",
  "retry_stage",
  "cancel",
  "resume",
] as const;

const STAGE_REQUIRED_ACTIONS: readonly string[] = ["start_stage", "complete_stage", "fail_stage", "retry_stage"];

function validateWorkflowCost(value: unknown, field: string) {
  if (value === undefined || value === null) return { valid: true };
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) return { valid: false, error: `${field}_invalid` };
  return { valid: true };
}

export function validateCommerceWorkflowRunCreate(body: UnknownRecord) {
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) return { valid: false, error: "draftId_required" };
  if (body.idempotencyKey !== undefined && typeof body.idempotencyKey !== "string") {
    return { valid: false, error: "idempotencyKey_invalid" };
  }
  if (body.expectedRevision !== undefined) {
    const revision = validateExpectedRevision(body, true);
    if (!revision.valid) return revision;
  }
  return validateWorkflowCost(body.estimatedCost, "estimatedCost");
}

export function validateCommerceWorkflowRunAction(body: UnknownRecord) {
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!(COMMERCE_WORKFLOW_RUN_ACTIONS as readonly string[]).includes(action)) {
    return { valid: false, error: "action_invalid" };
  }
  const stage = typeof body.stage === "string" ? body.stage.trim() : "";
  if (STAGE_REQUIRED_ACTIONS.includes(action) && !stage) return { valid: false, error: "stage_required" };
  if (body.idempotencyKey !== undefined && typeof body.idempotencyKey !== "string") {
    return { valid: false, error: "idempotencyKey_invalid" };
  }
  if (body.evidence !== undefined && (typeof body.evidence !== "object" || Array.isArray(body.evidence))) {
    return { valid: false, error: "evidence_invalid" };
  }
  const estimated = validateWorkflowCost(body.estimatedCost, "estimatedCost");
  if (!estimated.valid) return estimated;
  return validateWorkflowCost(body.appliedCost, "appliedCost");
}
