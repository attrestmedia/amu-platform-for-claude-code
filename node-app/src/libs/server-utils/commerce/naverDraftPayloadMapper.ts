import "server-only";

import { validateSmartstoreDraft, type SmartstoreDraftValidationMode } from "./naverDraftValidation";
import { isUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toFiniteNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return isUnknownRecord(value);
}

function compactValue<T>(value: T): T | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const next = value
      .map((item) => compactValue(item))
      .filter((item) => item !== undefined) as unknown as T;
    return (next as unknown[]).length > 0 ? next : undefined;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, compactValue(item)] as const)
      .filter(([, item]) => item !== undefined);
    return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
  }
  if (typeof value === "string") {
    return value.trim() ? value : undefined;
  }
  return value;
}

function inferValidationMode(draft: UnknownRecord, preferredMode?: string): SmartstoreDraftValidationMode {
  const mode = toSafeString(preferredMode).toLowerCase();
  if (mode === "create" || mode === "update") return mode;
  const smartstore = isRecord(draft.smartstore) ? draft.smartstore : {};
  if (smartstore.channelProductNo || smartstore.originProductNo) return "update";
  return "create";
}

function pickCategoryPolicyGroup(draft: UnknownRecord, overrideValue?: string) {
  const preferred = toSafeString(overrideValue);
  if (preferred) return preferred;
  const smartstore = isRecord(draft.smartstore) ? draft.smartstore : {};
  return toSafeString(smartstore.categoryPolicyGroup || draft.categoryPolicyGroup);
}

function buildImagesPayload(images: unknown) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image, index) => {
      if (!isRecord(image)) return null;
      const url = toSafeString(image.url);
      if (!url) return null;
      return compactValue({
        imageUrl: url,
        imageType: toSafeString(image.type || image.imageType || "REPRESENTATIVE"),
        role: toSafeString(image.role || (index === 0 ? "representative" : "detail")),
        sortOrder: toFiniteNumber(image.sortOrder ?? image.order ?? index + 1) ?? index + 1,
        origin: toSafeString(image.origin),
      });
    })
    .filter(Boolean);
}

function buildNoticePayload(smartstore: UnknownRecord) {
  const notice = isRecord(smartstore.notice) ? smartstore.notice : {};
  return compactValue({
    productInfoProvidedNoticeType: toSafeString(notice.productInfoProvidedNoticeType || notice.noticeType),
    payload: isRecord(notice.payload) ? notice.payload : undefined,
  });
}

function buildOriginPayload(smartstore: UnknownRecord) {
  const origin = isRecord(smartstore.origin) ? smartstore.origin : {};
  return compactValue({
    originAreaCode: toSafeString(origin.originAreaCode),
    originAreaName: toSafeString(origin.originAreaName),
    content: toSafeString(origin.content),
  });
}

function buildLogisticsPayload(smartstore: UnknownRecord) {
  const logistics = isRecord(smartstore.logistics) ? smartstore.logistics : {};
  return compactValue({
    shippingPolicyText: toSafeString(logistics.shippingPolicyText),
    returnPolicyText: toSafeString(logistics.returnPolicyText),
    asPolicyText: toSafeString(logistics.asPolicyText),
    deliveryInfo: isRecord(logistics.deliveryInfo) ? logistics.deliveryInfo : undefined,
  });
}

function buildFactsPayload(smartstore: UnknownRecord) {
  const facts = isRecord(smartstore.facts) ? smartstore.facts : {};
  return compactValue({
    brandName: toSafeString(facts.brandName),
    manufacturerName: toSafeString(facts.manufacturerName),
    modelName: toSafeString(facts.modelName),
  });
}

export function buildNaverPublishPreviewFromDraft(args: {
  draft: UnknownRecord;
  mode?: SmartstoreDraftValidationMode | string;
  categoryPolicyGroup?: string;
}) {
  const draft = isRecord(args.draft) ? args.draft : {};
  const display = isRecord(draft.display) ? draft.display : {};
  const smartstore = isRecord(draft.smartstore) ? draft.smartstore : {};
  const mode = inferValidationMode(draft, args.mode);
  const categoryPolicyGroup = pickCategoryPolicyGroup(draft, args.categoryPolicyGroup);
  const validation = validateSmartstoreDraft({ mode, draft, categoryPolicyGroup });

  const shared = compactValue({
    sellerManagementCode: toSafeString(smartstore.sellerManagementCode),
    categoryId: toSafeString(smartstore.categoryId),
    channelProductName: toSafeString(smartstore.channelProductName || display.title),
    productName: toSafeString(smartstore.productName || display.title),
    salePrice: toFiniteNumber(smartstore.salePrice ?? display.price),
    stockQuantity: toFiniteNumber(smartstore.stockQuantity),
    statusType: toSafeString(smartstore.statusType),
    saleStartDate: toSafeString(smartstore.saleStartDate),
    saleEndDate: toSafeString(smartstore.saleEndDate),
    detailContent: toSafeString(display.detailHtml || display.detail || smartstore.detailContent),
    summary: toSafeString(display.summary),
    images: buildImagesPayload(smartstore.images),
    facts: buildFactsPayload(smartstore),
    logistics: buildLogisticsPayload(smartstore),
    notice: buildNoticePayload(smartstore),
    origin: buildOriginPayload(smartstore),
    attributes: isRecord(smartstore.attributes) ? smartstore.attributes : undefined,
    review: isRecord(draft.review) ? draft.review : undefined,
  });

  const channelPayload = compactValue({
    channelProductNo: toFiniteNumber(smartstore.channelProductNo),
    channelProductName: shared?.channelProductName,
    sellerManagementCode: shared?.sellerManagementCode,
    salePrice: shared?.salePrice,
    stockQuantity: shared?.stockQuantity,
    statusType: shared?.statusType,
    detailContent: shared?.detailContent,
    images: shared?.images,
    saleStartDate: shared?.saleStartDate,
    saleEndDate: shared?.saleEndDate,
  });

  const originPayload = compactValue({
    originProductNo: toFiniteNumber(smartstore.originProductNo),
    productName: shared?.productName,
    categoryId: shared?.categoryId,
    attributes: shared?.attributes,
    notice: shared?.notice,
    origin: shared?.origin,
    logistics: shared?.logistics,
    facts: shared?.facts,
  });

  const statusPayload = compactValue({
    statusType: shared?.statusType,
  });

  const stockPayload = compactValue({
    stockQuantity: shared?.stockQuantity,
  });

  const createPayload = compactValue({
    product: {
      channelProduct: {
        channelProductName: shared?.channelProductName,
        sellerManagementCode: shared?.sellerManagementCode,
        salePrice: shared?.salePrice,
        stockQuantity: shared?.stockQuantity,
        statusType: shared?.statusType,
        detailContent: shared?.detailContent,
        images: shared?.images,
        saleStartDate: shared?.saleStartDate,
        saleEndDate: shared?.saleEndDate,
      },
      originProduct: {
        productName: shared?.productName,
        categoryId: shared?.categoryId,
        attributes: shared?.attributes,
        notice: shared?.notice,
        origin: shared?.origin,
        logistics: shared?.logistics,
        facts: shared?.facts,
      },
    },
  });

  return {
    mode,
    categoryPolicyGroup,
    validation,
    preview: {
      createPayload,
      updatePayloads: {
        channelProduct: channelPayload,
        originProduct: originPayload,
        status: statusPayload,
        stock: stockPayload,
      },
    },
  };
}

export function buildNaverCreateProductPayloadFromDraft(args: {
  draft: UnknownRecord;
  categoryPolicyGroup?: string;
}) {
  const result = buildNaverPublishPreviewFromDraft({
    draft: args.draft,
    mode: "create",
    categoryPolicyGroup: args.categoryPolicyGroup,
  });
  return {
    mode: result.mode,
    categoryPolicyGroup: result.categoryPolicyGroup,
    validation: result.validation,
    payload: result.preview.createPayload || {},
  };
}

export function buildNaverUpdateChannelProductPayloadFromDraft(args: {
  draft: UnknownRecord;
  categoryPolicyGroup?: string;
}) {
  const result = buildNaverPublishPreviewFromDraft({
    draft: args.draft,
    mode: "update",
    categoryPolicyGroup: args.categoryPolicyGroup,
  });
  return {
    mode: result.mode,
    categoryPolicyGroup: result.categoryPolicyGroup,
    validation: result.validation,
    payload: result.preview.updatePayloads.channelProduct || {},
  };
}

export function buildNaverUpdateOriginProductPayloadFromDraft(args: {
  draft: UnknownRecord;
  categoryPolicyGroup?: string;
}) {
  const result = buildNaverPublishPreviewFromDraft({
    draft: args.draft,
    mode: "update",
    categoryPolicyGroup: args.categoryPolicyGroup,
  });
  return {
    mode: result.mode,
    categoryPolicyGroup: result.categoryPolicyGroup,
    validation: result.validation,
    payload: result.preview.updatePayloads.originProduct || {},
  };
}
