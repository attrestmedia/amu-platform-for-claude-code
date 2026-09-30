import {
  deriveSmartstorePipelineProgress,
  type SmartstorePipelineRunLike,
  type SmartstorePipelineStep,
} from "libs/server-utils/commerce/commercePipelineProgressContract";
import type {
  ICommerceDraftValidationMessage,
  ICommerceProductDraft,
} from "types/commerce/draft";

/**
 * @docHint
 * @purpose P3 섹션 상태 투영 SSOT. 파이프라인·readiness라는 서버 계약 상태를 사용자용
 *          "등록 준비도(탭 상태)"로 번역하는 단일 지점이다.
 *          - 탭 상태 권위는 draft 데이터 완결(completeness) + 서버 validation issue code다.
 *            배송 정책·allowlist 같은 Commerce 비즈니스 규칙을 여기서 재구현하지 않는다 —
 *            존재 여부(presence) 확인까지만 하고 판정은 서버가 한다 (설계 제안 §3.2 D6).
 *          - pipeline은 등록 완료도가 아니라 추천·재개 맥락(deriveRecommendedNextAction)에만 쓴다.
 * @domain commerce.naver
 * @scope client
 */

export type SmartstoreSectionKey = "images" | "product" | "required";
export type SmartstoreSectionStatus = "complete" | "required" | "empty";

/**
 * validation issue(code·field) → 편집 화면 섹션 매핑.
 * field는 서버(`naverDraftValidation.ts`)가 관리하는 경로다 — 새 코드는 서버와 이 표를 같은 작업 단위에서 갱신한다.
 * review.*·categoryPolicyGroup·product identifier처럼 어느 탭으로도 가지 않는 항목은 null(등록 점검 요약 전용)이다.
 */
export function mapValidationIssueToSection(message: ICommerceDraftValidationMessage): SmartstoreSectionKey | null {
  const field = String(message.field || "");
  if (field.startsWith("smartstore.images") || field.startsWith("smartstore.representativeImage")) return "images";
  if (field.startsWith("display.")) return "product";
  if (
    field.startsWith("smartstore.channelProductName") ||
    field.startsWith("smartstore.salePrice") ||
    field.startsWith("smartstore.stockQuantity") ||
    field.startsWith("smartstore.categoryId")
  ) {
    return "product";
  }
  if (
    field.startsWith("smartstore.logistics") ||
    field.startsWith("smartstore.origin") ||
    field.startsWith("smartstore.notice")
  ) {
    return "required";
  }
  return null;
}

function collectSectionErrors(
  validation: ICommerceProductDraft["validation"],
): Record<SmartstoreSectionKey, number> {
  const counts: Record<SmartstoreSectionKey, number> = { images: 0, product: 0, required: 0 };
  (validation?.errors || []).forEach((message) => {
    const section = mapValidationIssueToSection(message);
    if (section) counts[section] += 1;
  });
  return counts;
}

function toUnknownRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveSmartstorePresence(draft: ICommerceProductDraft) {
  const smartstore = toUnknownRecord((draft as unknown as Record<string, unknown>).smartstore);
  const display = toUnknownRecord((draft as unknown as Record<string, unknown>).display);

  const images = Array.isArray(smartstore.images) ? smartstore.images : [];
  const representative = toUnknownRecord(smartstore.representativeImage);
  const hasImageData = toText(representative.url).length > 0 || images.length > 0;

  const hasProductData =
    toText(display.title).length > 0 ||
    toText(smartstore.channelProductName).length > 0 ||
    toText(display.summary).length > 0 ||
    toText(display.detailHtml).length > 0 ||
    smartstore.salePrice != null ||
    smartstore.stockQuantity != null;

  const logistics = toUnknownRecord(smartstore.logistics);
  const origin = toUnknownRecord(smartstore.origin);
  const notice = toUnknownRecord(smartstore.notice);
  const noticeKeys = notice.payload && typeof notice.payload === "object" ? Object.keys(toUnknownRecord(notice.payload)) : [];
  const requiredInfo = {
    shipping: toText(logistics.shippingPolicyText).length > 0,
    returns: toText(logistics.returnPolicyText).length > 0,
    origin: toText(origin.originAreaCode).length > 0,
    notice: noticeKeys.length > 0,
  };

  return {
    hasImageData,
    hasProductData,
    hasRequiredData: Object.values(requiredInfo).some(Boolean),
    requiredInfo,
  };
}

export type SmartstoreRegistrationSectionStatus = {
  sections: Record<SmartstoreSectionKey, SmartstoreSectionStatus>;
  /** 필수 섹션 중 완료 개수 — 헤더 "등록 준비 n/m". m은 readyTotal(섹션 수)이며 optional(AI 제작)은 분모에서 제외된다. */
  readyCount: number;
  readyTotal: number;
};

export function deriveRegistrationSectionStatus(args: {
  draft: ICommerceProductDraft;
  validation?: ICommerceProductDraft["validation"];
}): SmartstoreRegistrationSectionStatus {
  const { draft, validation } = args;
  const sectionErrors = collectSectionErrors(validation);
  const presence = deriveSmartstorePresence(draft);

  // 단계 완료 여부는 pipeline contract의 draft 기반 판정을 재사용한다 — run 없이도 draft 완결성만 본다.
  const progress = deriveSmartstorePipelineProgress({ draft, run: null });
  const stepStatus = (step: SmartstorePipelineStep) =>
    progress.steps.find((item) => item.key === step)?.status || "pending";

  const imagesComplete = stepStatus("photos") === "done" && stepStatus("images") === "done";
  const productComplete = stepStatus("basics") === "done" && stepStatus("content") === "done";
  const requiredComplete = Object.values(presence.requiredInfo).every(Boolean);

  const resolve = (section: SmartstoreSectionKey, complete: boolean, hasData: boolean): SmartstoreSectionStatus => {
    if (sectionErrors[section] > 0) return "required";
    if (complete) return "complete";
    return hasData ? "required" : "empty";
  };

  const sections: Record<SmartstoreSectionKey, SmartstoreSectionStatus> = {
    images: resolve("images", imagesComplete, presence.hasImageData),
    product: resolve("product", productComplete, presence.hasProductData),
    required: resolve("required", requiredComplete, presence.hasRequiredData),
  };

  const keys = Object.keys(sections) as SmartstoreSectionKey[];
  return {
    sections,
    readyCount: keys.filter((key) => sections[key] === "complete").length,
    readyTotal: keys.length,
  };
}

export type SmartstoreRecommendedNextAction = {
  /** 재개 지점. 모든 단계 완료 시 null. */
  step: SmartstorePipelineStep | null;
  skippable: boolean;
  allDone: boolean;
};

/**
 * pipeline(제작 과정 위치) → 사용자용 "다음 할 일" 1줄. 등록 완료도 판정에는 쓰지 않는다(§3.2 ②).
 */
export function deriveRecommendedNextAction(args: {
  draft: ICommerceProductDraft;
  run?: SmartstorePipelineRunLike | null;
}): SmartstoreRecommendedNextAction {
  const progress = deriveSmartstorePipelineProgress({ draft: args.draft, run: args.run ?? null });
  const resumeStep = progress.resumeStep;
  const resumeDef = progress.steps.find((step) => step.key === resumeStep);
  return {
    step: resumeStep ?? null,
    skippable: Boolean(resumeDef?.skippable),
    allDone: !resumeStep,
  };
}
