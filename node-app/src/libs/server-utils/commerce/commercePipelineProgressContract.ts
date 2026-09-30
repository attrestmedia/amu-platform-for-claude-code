import { toUnknownRecord } from "utils/common/typeUtils";
import { buildCommerceWorkflowStageIdempotencyKey, type CommerceWorkflowState } from "libs/server-utils/commerce/commerceWorkflowContract";

/**
 * @docHint
 * @purpose SSM-205 새 상품 guided flow의 전체 pipeline progress 계약. 제품 사진→기본 정보→모델→이미지→
 *          콘텐츠→검토 6단계를 draft와 workflow run에서 유도하고, 건너뛰기·돌아가기·재개와
 *          실패 사진 업로드의 개별 재시도를 순수 로직으로 정의한다.
 * @process 단계 완료 판정 → run stage 정합(reconciliation) 목록 산출 → 재개 지점 계산
 * @domain commerce.naver
 * @scope server
 *
 * 계약 원칙:
 * - 단계 상태의 SSOT는 두 개다. 데이터 완료 여부는 draft, 실행 lineage는 workflow run.
 * - 건너뛰기는 draft.display.pipelineProgress.skippedSteps에 저장된다 — reload 후에도 유지된다.
 * - draft에서 완료(또는 건너뜀)인데 run stage가 succeeded가 아니면 reconciliation 목록에 오른다.
 * - 이 파일은 순수 로직만 둔다. DB·네트워크 접근은 라우트·컴포넌트 계층의 책임이다.
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}
function toRecord(value: unknown) {
  return toUnknownRecord(value);
}

/* ─────────────────────────────────────────────
 * 단계 정의
 * ───────────────────────────────────────────── */

export const SMARTSTORE_PIPELINE_STEPS = ["photos", "basics", "model", "images", "content", "review"] as const;
export type SmartstorePipelineStep = (typeof SMARTSTORE_PIPELINE_STEPS)[number];

export function isSmartstorePipelineStep(value: unknown): value is SmartstorePipelineStep {
  return (SMARTSTORE_PIPELINE_STEPS as readonly string[]).includes(String(value));
}

export type SmartstorePipelineStepDef = {
  key: SmartstorePipelineStep;
  label: { ko: string; en: string };
  /** 이 단계가 완료됐을 때 기록할 workflow run stage. */
  workflowStage: CommerceWorkflowState;
  /** 데이터 없이 건너뛸 수 있는 단계인가. 사진·기본 정보·검토는 건너뛸 수 없다. */
  skippable: boolean;
};

export const SMARTSTORE_PIPELINE_STEP_DEFS: Record<SmartstorePipelineStep, SmartstorePipelineStepDef> = {
  photos: { key: "photos", label: { ko: "제품 사진", en: "Photos" }, workflowStage: "draft_created", skippable: false },
  basics: { key: "basics", label: { ko: "기본 정보", en: "Basics" }, workflowStage: "draft_created", skippable: false },
  model: { key: "model", label: { ko: "모델", en: "Model" }, workflowStage: "model_reference_ready", skippable: true },
  images: { key: "images", label: { ko: "이미지", en: "Images" }, workflowStage: "image_assets_ready", skippable: true },
  content: { key: "content", label: { ko: "콘텐츠", en: "Content" }, workflowStage: "product_content_ready", skippable: true },
  review: { key: "review", label: { ko: "검토", en: "Review" }, workflowStage: "publish_ready", skippable: false },
};

/* ─────────────────────────────────────────────
 * 건너뛴 단계 저장 (draft.display.pipelineProgress)
 * ───────────────────────────────────────────── */

export function readSmartstorePipelineSkippedSteps(draft: unknown): SmartstorePipelineStep[] {
  const display = toRecord(toRecord(draft).display);
  const progress = toRecord(display.pipelineProgress);
  const skipped = Array.isArray(progress.skippedSteps) ? progress.skippedSteps : [];
  return skipped.filter(
    (step): step is SmartstorePipelineStep =>
      isSmartstorePipelineStep(step) && SMARTSTORE_PIPELINE_STEP_DEFS[step].skippable,
  );
}

export function addSmartstorePipelineSkippedStep(draft: unknown, step: SmartstorePipelineStep): SmartstorePipelineStep[] {
  if (!isSmartstorePipelineStep(step) || !SMARTSTORE_PIPELINE_STEP_DEFS[step].skippable) {
    return readSmartstorePipelineSkippedSteps(draft);
  }
  return Array.from(new Set([...readSmartstorePipelineSkippedSteps(draft), step]));
}

/** draft.display.patch에 병합할 pipelineProgress 객체를 만든다. 기존 display 값을 보존한다. */
export function buildSmartstorePipelineDisplayPatch(draft: unknown, skippedSteps: SmartstorePipelineStep[]) {
  const display = toRecord(toRecord(draft).display);
  return {
    ...display,
    pipelineProgress: {
      ...toRecord(display.pipelineProgress),
      skippedSteps: Array.from(
        new Set(skippedSteps.filter((step) => isSmartstorePipelineStep(step) && SMARTSTORE_PIPELINE_STEP_DEFS[step].skippable)),
      ),
    },
  };
}

/* ─────────────────────────────────────────────
 * 단계 완료 판정 (draft 기준)
 * ───────────────────────────────────────────── */

export function deriveSmartstorePipelineStepCompletion(draft: unknown): Record<SmartstorePipelineStep, boolean> {
  const record = toRecord(draft);
  const smartstore = toRecord(record.smartstore);
  const display = toRecord(record.display);
  const assets = toRecord(record.assets);
  const validation = toRecord(record.validation);
  const images = Array.isArray(smartstore.images) ? smartstore.images : [];
  const kitIds = Array.isArray(assets.selectedModelReferenceKitIds) ? assets.selectedModelReferenceKitIds : [];
  const variantAssetIds = toRecord(assets.variantAssetIds);
  const hasVariantAssets = Object.values(variantAssetIds).some((ids) => Array.isArray(ids) && ids.length > 0);

  return {
    photos: images.length > 0,
    basics:
      Boolean(toSafeString(smartstore.channelProductName || smartstore.productName || display.title)) &&
      Boolean(toSafeString(smartstore.categoryPolicyGroup) || Boolean(smartstore.allowlistMatched)),
    model: kitIds.length > 0,
    images: Boolean(toSafeString(assets.selectedRepresentativeImageAssetId)) || hasVariantAssets,
    content:
      Boolean(toSafeString(assets.selectedDescriptionContentAssetId)) ||
      Boolean(toSafeString(display.detailHtml || display.detail)),
    review: validation.ready === true,
  };
}

/* ─────────────────────────────────────────────
 * 진행 상태 유도 (draft + run)
 * ───────────────────────────────────────────── */

export type SmartstorePipelineStepStatus = "done" | "active" | "pending" | "skipped";

export type SmartstorePipelineRunLike =
  | {
      currentStage?: unknown;
      lifecycle?: unknown;
      stages?: Array<{
        stage?: unknown;
        status?: unknown;
        attempt?: unknown;
        idempotencyKey?: unknown;
      }>;
    }
  | null
  | undefined;

export type SmartstorePipelineProgressStep = SmartstorePipelineStepDef & {
  status: SmartstorePipelineStepStatus;
  /** draft 데이터 기준 완료. run stage와 무관하다. */
  dataDone: boolean;
  /** run stage가 succeeded다. */
  stageSucceeded: boolean;
};

export type SmartstorePipelineProgress = {
  steps: SmartstorePipelineProgressStep[];
  /** 사용자가 지금 작업해야 할 단계. 첫 번째 done/skipped가 아닌 단계다. */
  resumeStep: SmartstorePipelineStep;
  allDone: boolean;
};

function isStageSucceeded(run: SmartstorePipelineRunLike, stage: CommerceWorkflowState) {
  if (!run) return false;
  return toSafeString(findRunStage(run, stage)?.status) === "succeeded";
}

function findRunStage(run: SmartstorePipelineRunLike, stage: CommerceWorkflowState) {
  const stages = Array.isArray(run?.stages) ? run.stages : [];
  return stages.find((record) => toSafeString(record?.stage) === stage) || null;
}

export function deriveSmartstorePipelineProgress(input: {
  draft: unknown;
  run?: SmartstorePipelineRunLike;
  skippedSteps?: readonly string[];
}): SmartstorePipelineProgress {
  const { draft, run } = input;
  const completion = deriveSmartstorePipelineStepCompletion(draft);
  const skipped = new Set(
    (input.skippedSteps ?? readSmartstorePipelineSkippedSteps(draft)).filter((step): step is SmartstorePipelineStep =>
      isSmartstorePipelineStep(step) && SMARTSTORE_PIPELINE_STEP_DEFS[step].skippable,
    ),
  );

  const steps = SMARTSTORE_PIPELINE_STEPS.map((key) => {
    const def = SMARTSTORE_PIPELINE_STEP_DEFS[key];
    const dataDone = completion[key];
    const stageSucceeded = isStageSucceeded(run, def.workflowStage);
    // photos·basics는 하나의 draft_created stage를 공유하므로 stageSucceeded만으로 양쪽을 완료 처리하면
    // 사진만 올린 draft가 기본 정보까지 완료된 것으로 보인다. 두 필수 단계는 draft data를 기준으로만 완료한다.
    const status: SmartstorePipelineStepStatus = dataDone
      ? "done"
      : skipped.has(key)
        ? "skipped"
        : stageSucceeded && key !== "photos" && key !== "basics"
          ? "done"
          : "pending";
    return { ...def, status, dataDone, stageSucceeded };
  });

  const resume = steps.find((step) => step.status !== "done" && step.status !== "skipped");
  return {
    steps,
    resumeStep: resume ? resume.key : "review",
    allDone: !resume,
  };
}

/* ─────────────────────────────────────────────
 * run stage reconciliation
 * ───────────────────────────────────────────── */

export type SmartstorePipelineStageSyncAction = {
  stage: CommerceWorkflowState;
  /** 같은 키 재요청은 서버가 멱등 처리한다(start_stage 재진입 허용). */
  idempotencyKey: string;
  evidence: {
    modelReferenceKitIds?: string[];
    outputAssetIds?: string[];
    selectedAssetIds?: string[];
  };
};

/**
 * draft에서 완료(또는 건너뜀)인데 run stage가 succeeded가 아닌 단계의 완료 기록 목록.
 * UI가 이 목록을 start_stage → complete_stage로 보내면 reload 후에도 run lineage가 draft를 따라간다.
 */
export function buildSmartstorePipelineStageSyncActions(args: {
  runId: string;
  draft: unknown;
  run?: SmartstorePipelineRunLike;
  skippedSteps?: readonly string[];
}): SmartstorePipelineStageSyncAction[] {
  const { draft, run } = args;
  const completion = deriveSmartstorePipelineStepCompletion(draft);
  const skipped = new Set(
    (args.skippedSteps ?? readSmartstorePipelineSkippedSteps(draft)).filter((step): step is SmartstorePipelineStep =>
      isSmartstorePipelineStep(step) && SMARTSTORE_PIPELINE_STEP_DEFS[step].skippable,
    ),
  );
  const record = toRecord(draft);
  const assets = toRecord(record.assets);
  const kitIds = (Array.isArray(assets.selectedModelReferenceKitIds) ? assets.selectedModelReferenceKitIds : [])
    .map((id) => toSafeString(id))
    .filter(Boolean);
  const variantAssetIds = toRecord(assets.variantAssetIds);
  const outputAssetIds = [
    toSafeString(assets.selectedRepresentativeImageAssetId),
    ...Object.values(variantAssetIds).flatMap((ids) => (Array.isArray(ids) ? ids.map((id) => toSafeString(id)) : [])),
  ].filter(Boolean);
  const selectedContentAssetId = toSafeString(assets.selectedDescriptionContentAssetId);

  const actions: SmartstorePipelineStageSyncAction[] = [];
  const pushAction = (step: SmartstorePipelineStep, evidence: SmartstorePipelineStageSyncAction["evidence"]) => {
    const stage = SMARTSTORE_PIPELINE_STEP_DEFS[step].workflowStage;
    if (actions.some((action) => action.stage === stage)) return;
    if (run && ["cancelled", "completed"].includes(toSafeString(run.lifecycle))) return;
    const existing = findRunStage(run, stage);
    // 실패·취소 stage는 운영자의 명시적인 retry_stage 이후에만 재시도한다. retry가 만든
    // attempt/idempotencyKey를 그대로 사용해야 재시도 회차를 이전 실행과 합치지 않는다.
    if (existing && ["failed", "cancelled"].includes(toSafeString(existing.status))) return;
    const idempotencyKey =
      toSafeString(existing?.idempotencyKey) ||
      buildCommerceWorkflowStageIdempotencyKey({
        runId: args.runId,
        stage,
        attempt: Math.max(1, Math.floor(Number(existing?.attempt) || 1)),
      });
    actions.push({ stage, idempotencyKey, evidence });
  };

  // photos와 basics는 같은 draft_created stage를 공유한다. 둘 중 하나라도 완료면 draft_created를 기록한다.
  if (completion.photos || completion.basics || skipped.has("photos") || skipped.has("basics")) {
    pushAction("basics", {});
  }
  if (completion.model || skipped.has("model")) pushAction("model", { modelReferenceKitIds: kitIds });
  if (completion.images || skipped.has("images")) pushAction("images", { outputAssetIds });
  if (completion.content || skipped.has("content")) {
    pushAction("content", { selectedAssetIds: selectedContentAssetId ? [selectedContentAssetId] : [] });
  }
  if (completion.review) pushAction("review", {});

  return actions.filter((action) => !isStageSucceeded(run, action.stage));
}

/* ─────────────────────────────────────────────
 * 사진 업로드 개별 상태
 * ───────────────────────────────────────────── */

export type SmartstorePhotoUploadStatus = "success" | "failed";

export type SmartstorePhotoUploadResult = {
  name: string;
  status: SmartstorePhotoUploadStatus;
  url: string;
};

/**
 * 사진 파일별 업로드 결과를 만든다. 실패한 사진은 개별 재시도 대상으로 분리된다.
 * 파일 목록과 성공·실패 결과 목록만으로 순수 계산한다 — 상태는 컴포넌트가 보관한다.
 */
export function summarizeSmartstorePhotoUploads(
  files: ReadonlyArray<{ name: string }>,
  outcomes: ReadonlyArray<{ name?: unknown; ok?: unknown; url?: unknown }>,
): SmartstorePhotoUploadResult[] {
  const outcomeByName = new Map<string, { ok: boolean; url: string }>();
  for (const outcome of outcomes) {
    const name = toSafeString(outcome.name);
    if (!name || outcomeByName.has(name)) continue;
    outcomeByName.set(name, { ok: outcome.ok === true, url: toSafeString(outcome.url) });
  }
  return files.map((file) => {
    const outcome = outcomeByName.get(file.name);
    return {
      name: file.name,
      status: outcome?.ok ? "success" : "failed",
      url: outcome?.url || "",
    };
  });
}

export function filterSmartstoreFailedPhotoUploads(
  results: ReadonlyArray<SmartstorePhotoUploadResult>,
): SmartstorePhotoUploadResult[] {
  return results.filter((result) => result.status === "failed");
}
