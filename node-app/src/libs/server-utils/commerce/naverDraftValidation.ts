import "server-only";

import {
  SMARTSTORE_CREATE_ALLOWLIST_GROUPS,
  SMARTSTORE_CREATE_EXCLUDE_GROUPS,
  type SmartstoreCreateAllowlistGroup,
  type SmartstoreCreateExcludeGroup,
} from "consts/commerce/smartstore";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { validateSmartstoreDetailHtml } from "utils/commerce/smartstoreDetailHtmlUtils";

export type SmartstoreDraftValidationMode = "create" | "update";

export type SmartstoreDraftValidationMessage = {
  code: string;
  field: string;
  message: string;
};

export type SmartstoreDraftValidationResult = {
  ready: boolean;
  errors: SmartstoreDraftValidationMessage[];
  warnings: SmartstoreDraftValidationMessage[];
  allowlistMatched: boolean;
  rulesVersion: string;
};

const RULES_VERSION = "smartstore-draft-rules-v1";

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toFiniteNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function hasText(value: unknown) {
  return toSafeString(value).length > 0;
}

function hasArrayValue(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function getRepresentativeImage(images: unknown[]) {
  return images.find((image) => toSafeString(toUnknownRecord(image).role) === "representative") || images[0] || null;
}

function pushMessage(
  bucket: SmartstoreDraftValidationMessage[],
  code: string,
  field: string,
  message: string,
) {
  bucket.push({ code, field, message });
}

function isAllowlistGroup(value: string): value is SmartstoreCreateAllowlistGroup {
  return (SMARTSTORE_CREATE_ALLOWLIST_GROUPS as readonly string[]).includes(value);
}

function isExcludeGroup(value: string): value is SmartstoreCreateExcludeGroup {
  return (SMARTSTORE_CREATE_EXCLUDE_GROUPS as readonly string[]).includes(value);
}

export function validateSmartstoreDraft(args: {
  mode: SmartstoreDraftValidationMode;
  draft: UnknownRecord;
  categoryPolicyGroup?: string;
}) {
  const errors: SmartstoreDraftValidationMessage[] = [];
  const warnings: SmartstoreDraftValidationMessage[] = [];

  const draft = args.draft || {};
  const display = toUnknownRecord(draft.display);
  const smartstore = toUnknownRecord(draft.smartstore);
  const review = toUnknownRecord(draft.review);
  const validation = toUnknownRecord(draft.validation);
  const logistics = toUnknownRecord(smartstore.logistics);
  const origin = toUnknownRecord(smartstore.origin);
  const facts = toUnknownRecord(smartstore.facts);

  const categoryId = toSafeString(smartstore.categoryId);
  const categoryPolicyGroup = toSafeString(args.categoryPolicyGroup).toLowerCase();
  const title = toSafeString(smartstore.channelProductName || smartstore.productName || display.title);
  const summary = toSafeString(display.summary);
  const detailHtml = toSafeString(display.detailHtml || display.detail || smartstore.detailContent);
  const salePrice = toFiniteNumber(smartstore.salePrice ?? display.price);
  const stockQuantity = toFiniteNumber(smartstore.stockQuantity);
  const images = Array.isArray(smartstore.images) ? smartstore.images : [];
  const representativeImage = getRepresentativeImage(images);
  const noticePayload = toUnknownRecord(smartstore.notice).payload;
  const shippingPolicyText = toSafeString(logistics.shippingPolicyText);
  const returnPolicyText = toSafeString(logistics.returnPolicyText);
  const asPolicyText = toSafeString(logistics.asPolicyText);
  const originAreaCode = toSafeString(origin.originAreaCode);
  const brandName = toSafeString(facts.brandName);
  const manufacturerName = toSafeString(facts.manufacturerName);

  if (!hasText(title)) {
    pushMessage(errors, "title_required", "smartstore.channelProductName", "상품명 또는 채널 상품명은 필수입니다.");
  }

  if (!hasText(summary)) {
    pushMessage(warnings, "summary_recommended", "display.summary", "스토어 요약이 비어 있습니다.");
  }

  if (!hasText(detailHtml)) {
    pushMessage(errors, "detail_required", "display.detailHtml", "상세 설명은 필수입니다.");
  } else {
    validateSmartstoreDetailHtml(detailHtml).issues.forEach((issue) => {
      const target = issue.severity === "error" ? errors : warnings;
      pushMessage(target, issue.code, "display.detailHtml", issue.message.ko);
    });
  }

  if (salePrice == null || salePrice < 0) {
    pushMessage(errors, "sale_price_required", "smartstore.salePrice", "판매가는 0 이상 숫자로 입력해야 합니다.");
  }

  if (stockQuantity == null || stockQuantity < 0) {
    pushMessage(errors, "stock_required", "smartstore.stockQuantity", "재고 수량은 0 이상 숫자로 입력해야 합니다.");
  }

  const representativeImageRecord = toUnknownRecord(representativeImage);
  if (!representativeImage || !hasText(representativeImageRecord.url)) {
    pushMessage(errors, "representative_image_required", "smartstore.images", "대표 이미지는 최소 1개 필요합니다.");
  } else {
    const imageOrigin = toSafeString(representativeImageRecord.origin);
    if (imageOrigin === "pure_ai" && !review.representativeImageConfirmed) {
      pushMessage(
        warnings,
        "representative_image_review_required",
        "review.representativeImageConfirmed",
        "대표 이미지가 pure AI 후보입니다. 운영자 확인이 필요합니다.",
      );
    }
  }

  if (!review.factualConfirmed) {
    pushMessage(
      warnings,
      "factual_confirmation_required",
      "review.factualConfirmed",
      "브랜드/제조사/원산지/구성 등 사실값 확인이 아직 완료되지 않았습니다.",
    );
  }

  if (!brandName) {
    pushMessage(warnings, "brand_recommended", "smartstore.facts.brandName", "브랜드명이 비어 있습니다.");
  }

  if (!manufacturerName) {
    pushMessage(warnings, "manufacturer_recommended", "smartstore.facts.manufacturerName", "제조사명이 비어 있습니다.");
  }

  if (!shippingPolicyText) {
    pushMessage(errors, "shipping_policy_required", "smartstore.logistics.shippingPolicyText", "배송 정책은 필수입니다.");
  }

  if (!returnPolicyText) {
    pushMessage(errors, "return_policy_required", "smartstore.logistics.returnPolicyText", "반품/교환 정책은 필수입니다.");
  }

  if (!asPolicyText) {
    pushMessage(warnings, "as_policy_recommended", "smartstore.logistics.asPolicyText", "A/S 정책이 비어 있습니다.");
  }

  if (!originAreaCode) {
    pushMessage(errors, "origin_required", "smartstore.origin.originAreaCode", "원산지 코드는 필수입니다.");
  }

  if (!noticePayload || typeof noticePayload !== "object" || !hasArrayValue(Object.keys(noticePayload))) {
    pushMessage(errors, "notice_required", "smartstore.notice.payload", "상품정보제공고시 정보는 필수입니다.");
  }

  let allowlistMatched = true;
  if (args.mode === "create") {
    if (!categoryId) {
      pushMessage(errors, "category_required", "smartstore.categoryId", "신규 등록에는 categoryId가 필요합니다.");
    }

    if (!categoryPolicyGroup) {
      allowlistMatched = false;
      pushMessage(
        errors,
        "category_policy_group_required",
        "categoryPolicyGroup",
        "신규 등록에는 allowlist 판단용 categoryPolicyGroup이 필요합니다.",
      );
    } else if (isExcludeGroup(categoryPolicyGroup)) {
      allowlistMatched = false;
      pushMessage(
        errors,
        "category_excluded",
        "categoryPolicyGroup",
        "이 카테고리군은 1차 신규 등록 대상에서 제외됩니다.",
      );
    } else if (!isAllowlistGroup(categoryPolicyGroup)) {
      allowlistMatched = false;
      pushMessage(
        errors,
        "category_not_allowlisted",
        "categoryPolicyGroup",
        "이 카테고리군은 1차 신규 등록 allowlist에 포함되지 않습니다.",
      );
    }
  }

  if (args.mode === "update") {
    if (!smartstore.channelProductNo && !smartstore.originProductNo) {
      pushMessage(
        errors,
        "product_identifier_required",
        "smartstore.channelProductNo",
        "수정 흐름에는 channelProductNo 또는 originProductNo가 필요합니다.",
      );
    }
  }

  if (validation.ready && errors.length > 0) {
    pushMessage(
      warnings,
      "stale_validation_state",
      "validation.ready",
      "기존 validation.ready 값이 true지만 현재 초안에는 오류가 있습니다. 재검증이 필요합니다.",
    );
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings,
    allowlistMatched,
    rulesVersion: RULES_VERSION,
  } as SmartstoreDraftValidationResult;
}
