import {
  CHARACTER_REFERENCE_ANGLE_IMAGE_ROLES,
  CHARACTER_REFERENCE_FIT_IMAGE_ROLES,
  CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES,
} from "consts/app/characterReferenceSet";
import { CHARACTER_REFERENCE_KIT_TEMPLATE_KEY } from "consts/app/services";
import { SMARTSTORE_DEFAULT_CREATE_STATUS } from "consts/commerce/smartstore";
import type { BaseImageType, ImagePromptMetaType } from "types/app";
import type { CommerceDraftStatusType, ICommerceProductDraft } from "types/commerce";
import type { ICharacterReferenceKit } from "types/character";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import {
  extractSmartstoreDetailImageUrls,
  sanitizeSmartstoreDetailHtml,
} from "utils/commerce/smartstoreDetailHtmlUtils";
import type { SmartstoreDetailInfoTemplateContext } from "../SmartstoreDetailEditor";

export type SmartstoreImageRow = UnknownRecord;
export type SmartstoreGenStudioReferenceImage = BaseImageType & { preview: string; name: string };
export type SmartstoreImageRailRole = "representative" | "detail" | "body" | "generated";
export type SmartstoreImageRailItem = {
  id: string;
  url: string;
  role: SmartstoreImageRailRole;
  label: { ko: string; en: string };
  description?: string;
  assetId?: string;
  templateKey?: string;
};

export const SMARTSTORE_DETAIL_PANEL_CLASS = "group border-t border-border [&_summary::-webkit-details-marker]:hidden";

export const SMARTSTORE_CONTENT_TEMPLATE_KEY = "shop-product-sales-content-v1";

export const SMARTSTORE_CONTENT_PREFERRED_TEMPLATE_KEYS = [SMARTSTORE_CONTENT_TEMPLATE_KEY];

// Gen Studio 추천 템플릿 (진입 시 추천 섹션 상단 노출 — .claude/rules/gen-studio-process.md 계약)
// 키 실존 검증은 항상 운영 ai DB 기준 (2026-07-15 운영 확인 완료). 로컬 dev DB는 부분 사본이므로 판단 근거 아님.
export const SMARTSTORE_CONTENT_RECOMMENDED_TEMPLATE_KEYS: string[] = [SMARTSTORE_CONTENT_TEMPLATE_KEY];
export const SMARTSTORE_IMAGE_RECOMMENDED_TEMPLATE_KEYS: string[] = [
  CHARACTER_REFERENCE_KIT_TEMPLATE_KEY,
  "smartstore-product-detail-page-v1",
  "ecommerce-lifestyle-mood-shot",
  "ecommerce-product-detail-closeup",
];

export const SMARTSTORE_GENSTUDIO_TEMPLATE_TAGS: string[] = ["smartstore", "naver-smartstore", "commerce", "ecommerce"];
export const SMARTSTORE_GENSTUDIO_TEMPLATE_CATEGORIES: string[] = ["smartstore", "commerce", "product-detail"];

export const SMARTSTORE_OPERATOR_TEXT = {
  draft: { ko: "초안", en: "Draft" },
  blankDraft: { ko: "새 상품 만들기", en: "New Product" },
  readiness: { ko: "등록 점검", en: "Pre-publish Check" },
  publishCreate: { ko: "새 상품 등록", en: "Publish New Product" },
  publishUpdate: { ko: "스마트스토어에 반영", en: "Apply to Smart Store" },
  save: { ko: "저장", en: "Save" },
  archive: { ko: "보관함으로 이동", en: "Move to Archive" },
  storeManager: { ko: "스마트스토어 운영", en: "Smart Store Manager" },
  storePreview: { ko: "공개 화면 미리보기", en: "Preview Public Store" },
  openStorefront: { ko: "공개 스토어 보기", en: "Open Public Store" },
  operations: { ko: "스토어 운영", en: "Store Operations" },
  storefrontOpen: { ko: "공개 스토어 열기", en: "Open Public Store" },
  diff: { ko: "스토어 원본과 비교", en: "Compare with Source" },
  jobs: { ko: "등록/수정 기록", en: "Publish History" },
  publishPreview: { ko: "변경 내용 미리보기", en: "Publish Preview" },
  workflow: { ko: "진행 상태", en: "Progress" },
} as const;

/** workflow run 단계 라벨. 서버 상태 enum과 1:1로 대응하며 화면 표시 순서도 이 배열을 따른다. */
export const SMARTSTORE_WORKFLOW_STAGE_LABELS = [
  { stage: "draft_created", label: { ko: "초안 생성", en: "Draft created" } },
  { stage: "model_reference_ready", label: { ko: "모델 시트 준비", en: "Model sheet ready" } },
  { stage: "image_assets_ready", label: { ko: "모델컷·썸네일 준비", en: "Image assets ready" } },
  { stage: "product_content_ready", label: { ko: "상품 콘텐츠 준비", en: "Product content ready" } },
  { stage: "publish_ready", label: { ko: "등록 준비 완료", en: "Publish ready" } },
  { stage: "publishing", label: { ko: "스마트스토어 반영 중", en: "Publishing" } },
  { stage: "published", label: { ko: "스마트스토어 반영 완료", en: "Published" } },
  { stage: "marketing_draft_ready", label: { ko: "소셜 초안 준비", en: "Marketing draft ready" } },
  { stage: "waiting_review", label: { ko: "운영자 검수 대기", en: "Waiting review" } },
  { stage: "social_published", label: { ko: "소셜 발행 완료", en: "Social published" } },
  { stage: "measuring", label: { ko: "성과 측정 중", en: "Measuring" } },
  { stage: "improvement_proposed", label: { ko: "개선안 제안", en: "Improvement proposed" } },
] as const;

export const SMARTSTORE_WORKFLOW_STAGE_STATUS_LABELS = {
  pending: { ko: "대기", en: "Pending" },
  running: { ko: "진행 중", en: "Running" },
  succeeded: { ko: "완료", en: "Done" },
  failed: { ko: "실패", en: "Failed" },
  cancelled: { ko: "취소됨", en: "Cancelled" },
} as const;

export const SMARTSTORE_WORKFLOW_LIFECYCLE_LABELS = {
  active: { ko: "진행 중", en: "Active" },
  completed: { ko: "완료", en: "Completed" },
  cancelled: { ko: "취소됨", en: "Cancelled" },
  failed: { ko: "중단됨", en: "Halted" },
} as const;

export const SMARTSTORE_SALE_STATUS_OPTIONS = [
  { value: "WAIT", label: { ko: "판매 대기", en: "Sale waiting" } },
  { value: "SALE", label: { ko: "판매 중", en: "On sale" } },
  { value: "OUTOFSTOCK", label: { ko: "품절", en: "Out of stock" } },
  { value: "SUSPENSION", label: { ko: "판매 중지", en: "Sale suspended" } },
  { value: "CLOSE", label: { ko: "판매 종료", en: "Closed" } },
] as const;

export const SMARTSTORE_NOTICE_FIELD_OPTIONS = [
  { key: "품명", label: { ko: "품명", en: "Product Name" } },
  { key: "모델명", label: { ko: "모델명", en: "Model Name" } },
  { key: "인증허가사항", label: { ko: "인증/허가 사항", en: "Certification / Permission" } },
  { key: "제조자", label: { ko: "제조자", en: "Manufacturer" } },
  { key: "제조국", label: { ko: "제조국", en: "Country of Manufacture" } },
  { key: "취급주의사항", label: { ko: "취급 주의사항", en: "Handling Caution" } },
  { key: "품질보증기준", label: { ko: "품질보증 기준", en: "Warranty Standard" } },
  { key: "AS책임자와전화번호", label: { ko: "A/S 책임자와 전화번호", en: "A/S Contact" } },
] as const;

export const SMARTSTORE_DETAIL_GUIDE_FIELD_OPTIONS = [
  { key: "사이즈안내", label: { ko: "사이즈 안내", en: "Size Guide" }, rows: 3 },
  { key: "관리방법", label: { ko: "관리 방법", en: "Care Guide" }, rows: 3 },
] as const;

export type DraftFormState = {
  title: string;
  summary: string;
  detailHtml: string;
  price: string;
  stockQuantity: string;
  categoryId: string;
  categoryPolicyGroup: string;
  sellerManagementCode: string;
  productName: string;
  channelProductName: string;
  statusType: string;
  brandName: string;
  manufacturerName: string;
  modelName: string;
  originAreaCode: string;
  originAreaName: string;
  originContent: string;
  shippingPolicyText: string;
  returnPolicyText: string;
  asPolicyText: string;
  noticeType: string;
  noticePayloadText: string;
  representativeImageUrl: string;
  detailImageUrlsText: string;
  factualConfirmed: boolean;
  representativeImageConfirmed: boolean;
  aiDisclosureChecked: boolean;
};

export type BadgeVariant = "primary" | "secondary" | "accent" | "neutral" | "muted" | "destructive" | "outline";
export type ProductListFilter = "displayed" | "all" | "display_wait" | "sale_wait" | "hidden" | "drafts";

export const DRAFT_STATUS_LABEL: Record<CommerceDraftStatusType, { ko: string; en: string }> = {
  draft: { ko: "초안", en: "Draft" },
  needs_review: { ko: "검토 필요", en: "Needs Review" },
  ready: { ko: "발행 준비", en: "Ready" },
  publishing: { ko: "발행 중", en: "Publishing" },
  published: { ko: "발행됨", en: "Published" },
  publish_failed: { ko: "발행 실패", en: "Failed" },
  archived: { ko: "보관됨", en: "Archived" },
};

export const DRAFT_STATUS_VARIANT: Record<CommerceDraftStatusType, BadgeVariant> = {
  draft: "muted",
  needs_review: "secondary",
  ready: "accent",
  publishing: "secondary",
  published: "primary",
  publish_failed: "destructive",
  archived: "neutral",
};

export const PRODUCT_LIST_FILTER_LABEL: Record<ProductListFilter, { ko: string; en: string }> = {
  displayed: { ko: "현재 전시 상품", en: "Displayed products" },
  all: { ko: "전체 상품", en: "All products" },
  display_wait: { ko: "전시 대기", en: "Display waiting" },
  sale_wait: { ko: "판매 대기", en: "Sale waiting" },
  hidden: { ko: "미전시/중지", en: "Hidden or suspended" },
  drafts: { ko: "작성 중/검토", en: "Drafts or review" },
};

export const SMARTSTORE_SALE_STATUS_LABEL: Record<string, { ko: string; en: string }> = {
  WAIT: { ko: "판매 대기", en: "Sale waiting" },
  SALE: { ko: "판매 중", en: "On sale" },
  OUTOFSTOCK: { ko: "품절", en: "Out of stock" },
  SUSPENSION: { ko: "판매 중지", en: "Sale suspended" },
  CLOSE: { ko: "판매 종료", en: "Closed" },
};

export const SMARTSTORE_DISPLAY_STATUS_LABEL: Record<string, { ko: string; en: string }> = {
  WAIT: { ko: "전시 대기", en: "Display waiting" },
  ON: { ko: "전시 중", en: "Displayed" },
  SUSPENSION: { ko: "전시 중지", en: "Display suspended" },
};

export function getDraftThumbnailUrl(draft: ICommerceProductDraft | null | undefined): string {
  const images = Array.isArray(draft?.smartstore?.images) ? draft?.smartstore?.images : [];
  if (!images || images.length === 0) return "";
  const rep = images.find((raw: unknown) => toSafeString(toUnknownRecord(raw).role).toLowerCase() === "representative");
  return toSafeString(toUnknownRecord(rep || images[0]).url);
}

export function getDraftPriceDisplay(draft: ICommerceProductDraft): string {
  const price = draft?.smartstore?.salePrice ?? draft?.display?.price;
  if (price == null || Number.isNaN(Number(price))) return "";
  return `${Number(price).toLocaleString()}원`;
}

export function getDraftStockDisplay(draft: ICommerceProductDraft): string {
  const stock = draft?.smartstore?.stockQuantity;
  if (stock == null) return "";
  return `재고 ${Number(stock).toLocaleString()}`;
}

export function getSmartstoreSaleStatus(draft: ICommerceProductDraft | null | undefined) {
  return toSafeString(draft?.smartstore?.statusType).toUpperCase();
}

export function getSmartstoreDisplayStatus(draft: ICommerceProductDraft | null | undefined) {
  return toSafeString(draft?.smartstore?.channelProductDisplayStatusType).toUpperCase();
}

/** 상품 카드에 표시할 등록일 — 동기화로 덮이는 updatedAt 대신 불변 등록 시각을 사용한다. */
export function getDraftRegisteredAt(draft: ICommerceProductDraft | null | undefined): string {
  return (
    toSafeString(draft?.smartstore?.registeredAt) ||
    toSafeString(draft?.createdAt) ||
    toSafeString(draft?.updatedAt)
  );
}

export function getProductStatusBadge(draft: ICommerceProductDraft): {
  label: { ko: string; en: string };
  variant: BadgeVariant;
} {
  const displayStatus = getSmartstoreDisplayStatus(draft);
  const saleStatus = getSmartstoreSaleStatus(draft);

  if (displayStatus && displayStatus !== "ON") {
    return {
      label: SMARTSTORE_DISPLAY_STATUS_LABEL[displayStatus] || {
        ko: `전시 상태: ${displayStatus}`,
        en: `Display: ${displayStatus}`,
      },
      variant: displayStatus === "WAIT" ? "secondary" : "neutral",
    };
  }
  if (saleStatus && saleStatus !== "SALE") {
    return {
      label: SMARTSTORE_SALE_STATUS_LABEL[saleStatus] || {
        ko: `판매 상태: ${saleStatus}`,
        en: `Sale: ${saleStatus}`,
      },
      variant: saleStatus === "WAIT" ? "secondary" : saleStatus === "OUTOFSTOCK" ? "muted" : "neutral",
    };
  }
  if (displayStatus === "ON") return { label: SMARTSTORE_DISPLAY_STATUS_LABEL.ON, variant: "primary" };
  if (saleStatus === "SALE") return { label: SMARTSTORE_SALE_STATUS_LABEL.SALE, variant: "primary" };
  return { label: DRAFT_STATUS_LABEL[draft.status || "draft"], variant: DRAFT_STATUS_VARIANT[draft.status || "draft"] };
}

export function isDisplayedSmartstoreProduct(draft: ICommerceProductDraft, hasDisplayStatusSignal: boolean) {
  const saleStatus = getSmartstoreSaleStatus(draft);
  const displayStatus = getSmartstoreDisplayStatus(draft);
  const saleVisible = !saleStatus || saleStatus === "SALE";
  const displayVisible = hasDisplayStatusSignal ? displayStatus === "ON" : !displayStatus || displayStatus === "ON";
  return saleVisible && displayVisible;
}

export function matchesProductListFilter(
  draft: ICommerceProductDraft,
  filter: ProductListFilter,
  hasDisplayStatusSignal: boolean,
) {
  if (filter === "all") return true;
  if (filter === "displayed") return isDisplayedSmartstoreProduct(draft, hasDisplayStatusSignal);
  if (filter === "drafts")
    return draft.status === "draft" || draft.status === "needs_review" || draft.status === "ready";

  const saleStatus = getSmartstoreSaleStatus(draft);
  const displayStatus = getSmartstoreDisplayStatus(draft);

  if (filter === "display_wait") return displayStatus === "WAIT";
  if (filter === "sale_wait") return saleStatus === "WAIT";
  if (filter === "hidden") {
    return (
      displayStatus === "SUSPENSION" ||
      saleStatus === "SUSPENSION" ||
      saleStatus === "CLOSE" ||
      saleStatus === "OUTOFSTOCK"
    );
  }
  return true;
}

export function getDraftSearchHaystack(draft: ICommerceProductDraft): string {
  return [
    draft?.display?.title,
    draft?.smartstore?.productName,
    draft?.smartstore?.channelProductName,
    draft?.smartstore?.sellerManagementCode,
    draft?.smartstore?.channelProductNo,
    draft?.smartstore?.originProductNo,
    draft?.draftId,
  ]
    .map((value) => toSafeString(value as unknown as string).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function toFormState(draft?: ICommerceProductDraft | null): DraftFormState {
  const noticePayload = draft?.smartstore?.notice?.payload;
  const detailImages = Array.isArray(draft?.smartstore?.images)
    ? draft?.smartstore?.images
        ?.filter((rawImage: unknown, index: number) => {
          const image = toUnknownRecord(rawImage);
          const role = toSafeString(image.role).toLowerCase();
          if (role === "representative") return false;
          if (!role && index === 0) return false;
          return Boolean(toSafeString(image.url));
        })
        .map((rawImage: unknown) => toSafeString(toUnknownRecord(rawImage).url))
        .filter(Boolean)
    : [];
  const representativeImage = Array.isArray(draft?.smartstore?.images)
    ? draft?.smartstore?.images?.find(
        (rawImage: unknown) => toSafeString(toUnknownRecord(rawImage).role).toLowerCase() === "representative",
      ) || draft?.smartstore?.images?.[0]
    : null;

  return {
    title: String(draft?.display?.title || ""),
    summary: String(draft?.display?.summary || ""),
    detailHtml: String(draft?.display?.detailHtml || draft?.display?.detail || ""),
    price:
      draft?.smartstore?.salePrice != null
        ? String(draft.smartstore.salePrice)
        : draft?.display?.price != null
          ? String(draft.display.price)
          : "",
    stockQuantity: draft?.smartstore?.stockQuantity != null ? String(draft.smartstore.stockQuantity) : "",
    categoryId: String(draft?.smartstore?.categoryId || ""),
    categoryPolicyGroup: String(draft?.smartstore?.categoryPolicyGroup || ""),
    sellerManagementCode: String(draft?.smartstore?.sellerManagementCode || ""),
    productName: String(draft?.smartstore?.productName || draft?.display?.title || ""),
    channelProductName: String(draft?.smartstore?.channelProductName || draft?.display?.title || ""),
    statusType: String(draft?.smartstore?.statusType || SMARTSTORE_DEFAULT_CREATE_STATUS),
    brandName: String(draft?.smartstore?.facts?.brandName || ""),
    manufacturerName: String(draft?.smartstore?.facts?.manufacturerName || ""),
    modelName: String(draft?.smartstore?.facts?.modelName || ""),
    originAreaCode: String(draft?.smartstore?.origin?.originAreaCode || ""),
    originAreaName: String(draft?.smartstore?.origin?.originAreaName || ""),
    originContent: String(draft?.smartstore?.origin?.content || ""),
    shippingPolicyText: String(draft?.smartstore?.logistics?.shippingPolicyText || ""),
    returnPolicyText: String(draft?.smartstore?.logistics?.returnPolicyText || ""),
    asPolicyText: String(draft?.smartstore?.logistics?.asPolicyText || ""),
    noticeType: String(draft?.smartstore?.notice?.productInfoProvidedNoticeType || ""),
    noticePayloadText:
      noticePayload && typeof noticePayload === "object" && Object.keys(noticePayload).length > 0
        ? JSON.stringify(noticePayload, null, 2)
        : "",
    representativeImageUrl: toSafeString(representativeImage?.url),
    detailImageUrlsText: detailImages.join("\n"),
    factualConfirmed: Boolean(draft?.review?.factualConfirmed),
    representativeImageConfirmed: Boolean(draft?.review?.representativeImageConfirmed),
    aiDisclosureChecked: Boolean(draft?.review?.aiDisclosureChecked),
  };
}

export function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export type CommerceDraftApiError = {
  code: string;
  message: string;
  details: UnknownRecord;
};

export function getCommerceDraftRevision(draft?: ICommerceProductDraft | null) {
  const revision = Number(draft?.revision);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 1;
}

export function getCommerceDraftApiError(error: unknown): CommerceDraftApiError {
  const root = toUnknownRecord(error);
  const response = toUnknownRecord(root.response);
  const payload = toUnknownRecord(response.data || root.data);
  const nestedError = toUnknownRecord(payload.error);
  const code = toSafeString(payload.errorCode || nestedError.code || root.errorCode || root.code) || "commerce_draft_operation_failed";
  const message =
    toSafeString(nestedError.message || payload.message || root.message) ||
    "상품 초안 처리 중 오류가 발생했습니다.";
  const details = toUnknownRecord(nestedError.details || payload.details);
  return { code, message, details };
}

export function formatDate(value?: string) {
  if (!value) return "";
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return value;
  return next.toLocaleString("ko-KR");
}

export function getImageReferenceName(url: string) {
  try {
    const parsed = new URL(url);
    const filename = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return filename || "smartstore-reference.png";
  } catch {
    return "smartstore-reference.png";
  }
}

// 참조 첨부 순서는 축 우선순위를 따른다 — 정체성(클로즈업 + 원거리 스케일 쌍) → 핏 → 각도 → 대표.
// 첨부 개수 상한에 걸려 잘릴 때 정체성 컷이 먼저 살아남아야 인물이 흔들리지 않는다 (SSM-202).
export const MODEL_REFERENCE_IMAGE_PRIORITY = [
  ...CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES,
  ...CHARACTER_REFERENCE_FIT_IMAGE_ROLES,
  ...CHARACTER_REFERENCE_ANGLE_IMAGE_ROLES,
  "profile",
] as const;

export function getModelReferenceKitImageUrls(kit: ICharacterReferenceKit) {
  const seen = new Set<string>();
  const urls: string[] = [];
  MODEL_REFERENCE_IMAGE_PRIORITY.forEach((role) => {
    const url = toSafeString(toUnknownRecord(kit.images?.[role]).url);
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  });
  return urls;
}

/**
 * 모델컷 생성에 실제로 붙일 kit만 남긴다.
 * readiness가 blocked인 kit은 필수 역할이나 스펙이 비어 있어 인물이 컷마다 달라지므로
 * 생성의 기본 선택에서 제외한다 (SSM-202 acceptance).
 */
export function selectGenerationReadyModelReferenceKits(kits: ICharacterReferenceKit[]) {
  return kits.filter((kit) => Boolean(kit.quality?.ready));
}

export function getModelReferenceKitSpecText(kits: ICharacterReferenceKit[]) {
  return kits
    .map((kit, index) => {
      const promptText = toSafeString(kit.spec?.promptText);
      if (!promptText) return "";
      return `[Model ${index + 1}: ${kit.name}]\n${promptText}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function parseJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("상품정보고시 입력값은 JSON 객체여야 합니다.");
  }
  return parsed as UnknownRecord;
}

export function parseNoticePayloadText(text: string) {
  try {
    return parseJsonObject(text);
  } catch {
    return {};
  }
}

export function getNoticePayloadFieldValue(payload: UnknownRecord, key: string) {
  const value = payload[key];
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function updateNoticePayloadText(text: string, key: string, value: string) {
  const next = { ...parseNoticePayloadText(text) };
  const trimmed = value.trim();
  if (trimmed) next[key] = trimmed;
  else delete next[key];
  return Object.keys(next).length > 0 ? JSON.stringify(next, null, 2) : "";
}

export function formatSmartstoreInfoPrice(value: string) {
  const price = Number(String(value || "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(price) || price <= 0) return "";
  return `${price.toLocaleString("ko-KR")}원`;
}

export function buildSmartstoreDetailInfoTemplateContext(form: DraftFormState): SmartstoreDetailInfoTemplateContext {
  const noticePayload = parseNoticePayloadText(form.noticePayloadText);
  const noticeItems = SMARTSTORE_NOTICE_FIELD_OPTIONS.map((option) => ({
    label: option.label.ko,
    value: getNoticePayloadFieldValue(noticePayload, option.key),
  })).filter((item) => item.value.trim());

  return {
    productName: form.channelProductName.trim() || form.productName.trim() || form.title.trim(),
    summary: form.summary.trim(),
    price: formatSmartstoreInfoPrice(form.price),
    stockQuantity: form.stockQuantity.trim() ? `${form.stockQuantity.trim()}개` : "",
    brandName: form.brandName.trim(),
    manufacturerName: form.manufacturerName.trim(),
    modelName: form.modelName.trim(),
    originAreaName: form.originAreaName.trim(),
    originContent: form.originContent.trim(),
    shippingPolicyText: form.shippingPolicyText.trim(),
    returnPolicyText: form.returnPolicyText.trim(),
    asPolicyText: form.asPolicyText.trim(),
    sizeGuideText: getNoticePayloadFieldValue(noticePayload, "사이즈안내"),
    careGuideText: getNoticePayloadFieldValue(noticePayload, "관리방법"),
    noticeItems,
  };
}

export function normalizeSmartstoreUrlList(text: string) {
  return Array.from(
    new Set(
      String(text || "")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function buildSmartstoreImageRailItems(
  form: DraftFormState,
  generatedAssets: ImagePromptMetaType[],
): SmartstoreImageRailItem[] {
  const items: SmartstoreImageRailItem[] = [];
  const representativeUrl = form.representativeImageUrl.trim();
  const pushed = new Set<string>();
  const pushItem = (item: SmartstoreImageRailItem) => {
    if (!item.url || pushed.has(item.id)) return;
    pushed.add(item.id);
    items.push(item);
  };

  if (representativeUrl) {
    pushItem({
      id: `representative:${representativeUrl}`,
      url: representativeUrl,
      role: "representative",
      label: { ko: "대표", en: "Hero" },
      description: form.channelProductName.trim() || form.productName.trim() || form.title.trim(),
    });
  }

  normalizeSmartstoreUrlList(form.detailImageUrlsText).forEach((url, index) => {
    pushItem({
      id: `detail:${url}`,
      url,
      role: "detail",
      label: { ko: `추가 ${index + 1}`, en: `Detail ${index + 1}` },
      description: url,
    });
  });

  extractSmartstoreDetailImageUrls(form.detailHtml).forEach((url, index) => {
    pushItem({
      id: `body:${url}`,
      url,
      role: "body",
      label: { ko: `본문 ${index + 1}`, en: `Body ${index + 1}` },
      description: url,
    });
  });

  generatedAssets.slice(0, 8).forEach((asset) => {
    const url = toSafeString(asset.url);
    if (!url) return;
    pushItem({
      id: `generated:${asset.assetId || url}`,
      url,
      role: "generated",
      label: { ko: "생성", en: "Generated" },
      description: String(asset.templateKey || asset.modelName || asset.assetId || ""),
      assetId: toSafeString(asset.assetId),
      templateKey: toSafeString(asset.templateKey),
    });
  });

  return items;
}

export function appendDetailImageUrlText(text: string, url: string) {
  const next = new Set(normalizeSmartstoreUrlList(text));
  const trimmed = url.trim();
  if (trimmed) next.add(trimmed);
  return Array.from(next).join("\n");
}

export function removeDetailImageUrlText(text: string, url: string) {
  const target = url.trim();
  return normalizeSmartstoreUrlList(text)
    .filter((item) => item !== target)
    .join("\n");
}

export function buildImagesFromForm(form: DraftFormState, draft?: ICommerceProductDraft | null) {
  const currentImages = Array.isArray(draft?.smartstore?.images) ? draft?.smartstore?.images : [];
  const representativeOrigin =
    toUnknownRecord(
      currentImages.find(
        (rawImage: unknown) => toSafeString(toUnknownRecord(rawImage).url) === form.representativeImageUrl.trim(),
      ),
    ).origin || "manual_upload";
  const detailUrls = form.detailImageUrlsText
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const detailOrigins = new Map(
    currentImages
      .filter((rawImage: unknown) => Boolean(toSafeString(toUnknownRecord(rawImage).url)))
      .map((rawImage: unknown) => {
        const image = toUnknownRecord(rawImage);
        return [toSafeString(image.url), toSafeString(image.origin)];
      }),
  );
  const nextImages: SmartstoreImageRow[] = [];

  if (form.representativeImageUrl.trim()) {
    nextImages.push({
      url: form.representativeImageUrl.trim(),
      type: "REPRESENTATIVE",
      imageType: "REPRESENTATIVE",
      role: "representative",
      sortOrder: 1,
      origin: representativeOrigin || "manual_upload",
    });
  }

  detailUrls.forEach((url, index) => {
    nextImages.push({
      url,
      type: "OPTIONAL",
      imageType: "OPTIONAL",
      role: "detail",
      sortOrder: nextImages.length + index + 1,
      origin: detailOrigins.get(url) || "manual_upload",
    });
  });

  return nextImages;
}

export function buildDraftPatch(form: DraftFormState, draft?: ICommerceProductDraft | null) {
  const salePrice = form.price.trim() === "" ? 0 : Number(form.price);
  const stockQuantity = form.stockQuantity.trim() === "" ? 0 : Number(form.stockQuantity);
  const noticePayload = parseJsonObject(form.noticePayloadText);
  const currentSmartstore = draft?.smartstore || {};
  const currentDisplay = draft?.display || {};
  const currentReview = draft?.review || {};

  return {
    display: {
      ...currentDisplay,
      title: form.title.trim(),
      summary: form.summary.trim(),
      detailHtml: sanitizeSmartstoreDetailHtml(form.detailHtml),
      price: Number.isFinite(salePrice) ? salePrice : 0,
    },
    smartstore: {
      ...currentSmartstore,
      productName: form.productName.trim() || form.title.trim(),
      channelProductName: form.channelProductName.trim() || form.title.trim(),
      salePrice: Number.isFinite(salePrice) ? salePrice : 0,
      stockQuantity: Number.isFinite(stockQuantity) ? stockQuantity : 0,
      categoryId: form.categoryId.trim(),
      categoryPolicyGroup: form.categoryPolicyGroup.trim(),
      sellerManagementCode: form.sellerManagementCode.trim(),
      statusType: form.statusType.trim() || SMARTSTORE_DEFAULT_CREATE_STATUS,
      images: buildImagesFromForm(form, draft),
      facts: {
        ...(currentSmartstore.facts || {}),
        brandName: form.brandName.trim(),
        manufacturerName: form.manufacturerName.trim(),
        modelName: form.modelName.trim(),
      },
      origin: {
        ...(currentSmartstore.origin || {}),
        originAreaCode: form.originAreaCode.trim(),
        originAreaName: form.originAreaName.trim(),
        content: form.originContent.trim(),
      },
      logistics: {
        ...(currentSmartstore.logistics || {}),
        shippingPolicyText: form.shippingPolicyText.trim(),
        returnPolicyText: form.returnPolicyText.trim(),
        asPolicyText: form.asPolicyText.trim(),
      },
      notice: {
        ...(currentSmartstore.notice || {}),
        productInfoProvidedNoticeType: form.noticeType.trim(),
        payload: noticePayload,
      },
    },
    review: {
      ...currentReview,
      factualConfirmed: form.factualConfirmed,
      representativeImageConfirmed: form.representativeImageConfirmed,
      aiDisclosureChecked: form.aiDisclosureChecked,
    },
  };
}

export function toDisplayDiffValue(value: unknown) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.length ? `${value.length} items` : "";
  if (typeof value === "object") return Object.keys(toUnknownRecord(value)).length ? JSON.stringify(value) : "";
  return String(value).trim();
}

export type DraftDiffRow = ReturnType<typeof buildDraftDiffRows>[number];

export function buildDraftDiffRows(draft?: ICommerceProductDraft | null) {
  const importedSnapshot = toUnknownRecord(draft?.smartstore?.importedSnapshot);
  const importedDetail = toSafeString(importedSnapshot.detailContent);
  const currentDetail = toSafeString(draft?.display?.detailHtml || draft?.display?.detail || "");
  const importedImages = Array.isArray(importedSnapshot.images) ? importedSnapshot.images : [];
  const currentImages = Array.isArray(draft?.smartstore?.images) ? draft?.smartstore?.images : [];

  return [
    {
      key: "channelProductName",
      label: { ko: "스마트스토어 상품명", en: "Smart Store Product Name" },
      source: toDisplayDiffValue(importedSnapshot.channelProductName || importedSnapshot.title),
      current: toDisplayDiffValue(draft?.smartstore?.channelProductName || draft?.display?.title),
    },
    {
      key: "productName",
      label: { ko: "네이버 원상품명", en: "Naver Origin Product Name" },
      source: toDisplayDiffValue(importedSnapshot.productName),
      current: toDisplayDiffValue(draft?.smartstore?.productName),
    },
    {
      key: "salePrice",
      label: { ko: "판매가", en: "Sale Price" },
      source: toDisplayDiffValue(importedSnapshot.salePrice),
      current: toDisplayDiffValue(draft?.smartstore?.salePrice ?? draft?.display?.price),
    },
    {
      key: "stockQuantity",
      label: { ko: "재고", en: "Stock" },
      source: toDisplayDiffValue(importedSnapshot.stockQuantity),
      current: toDisplayDiffValue(draft?.smartstore?.stockQuantity),
    },
    {
      key: "statusType",
      label: { ko: "판매 상태", en: "Sale Status" },
      source: toDisplayDiffValue(importedSnapshot.statusType),
      current: toDisplayDiffValue(draft?.smartstore?.statusType),
    },
    {
      key: "detailContent",
      label: { ko: "상세 설명", en: "Detail Content" },
      source: importedDetail ? `${importedDetail.length} chars` : "",
      current: currentDetail ? `${currentDetail.length} chars` : "",
    },
    {
      key: "images",
      label: { ko: "이미지 수", en: "Image Count" },
      source: importedImages.length ? String(importedImages.length) : "",
      current: currentImages.length ? String(currentImages.length) : "",
    },
  ].map((item) => ({
    ...item,
    changed: item.source !== item.current,
  }));
}
