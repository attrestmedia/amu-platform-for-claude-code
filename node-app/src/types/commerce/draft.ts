import type { ContentAssetMetaType, ImagePromptMetaType } from "types/app";
import type { UnknownRecord } from "utils/common/typeUtils";

export type CommerceDraftStatusType =
  | "draft"
  | "needs_review"
  | "ready"
  | "publishing"
  | "published"
  | "publish_failed"
  | "archived";

export interface ICommerceDraftValidationMessage {
  code?: string;
  field?: string;
  message?: string;
}

export interface ICommerceDraftValidationResult {
  ready: boolean;
  errors: ICommerceDraftValidationMessage[];
  warnings: ICommerceDraftValidationMessage[];
  allowlistMatched?: boolean;
  rulesVersion?: string;
}

export interface ICommerceProductDraft {
  draftId: string;
  universeId: string;
  revision?: number;
  provider: "naver";
  status: CommerceDraftStatusType;
  source?: string;
  display?: {
    title?: string;
    summary?: string;
    detail?: string;
    detailHtml?: string;
    price?: number;
    [key: string]: unknown;
  };
  smartstore?: {
    categoryId?: string;
    categoryName?: string;
    categoryPolicyGroup?: string;
    sellerManagementCode?: string;
    productName?: string;
    channelProductName?: string;
    salePrice?: number;
    stockQuantity?: number;
    channelProductNo?: number;
    originProductNo?: number;
    statusType?: string;
    importedSnapshot?: UnknownRecord;
    lastImportedAt?: string;
    /** 상품이 실제로 등록된 시각(AMU 등록 성공 또는 최초 연동 시점). 설정 후 덮어쓰지 않는다. */
    registeredAt?: string;
    facts?: {
      brandName?: string;
      manufacturerName?: string;
      modelName?: string;
      [k: string]: unknown;
    };
    origin?: {
      originAreaCode?: string;
      originAreaName?: string;
      content?: string;
      [k: string]: unknown;
    };
    logistics?: {
      shippingPolicyText?: string;
      returnPolicyText?: string;
      asPolicyText?: string;
      [k: string]: unknown;
    };
    notice?: {
      productInfoProvidedNoticeType?: string;
      payload?: UnknownRecord;
      [k: string]: unknown;
    };
    images?: Array<UnknownRecord>;
    [key: string]: unknown;
  };
  validation?: ICommerceDraftValidationResult;
  review?: {
    factualConfirmed?: boolean;
    representativeImageConfirmed?: boolean;
    aiDisclosureChecked?: boolean;
    [key: string]: unknown;
  };
  publish?: UnknownRecord;
  assets?: {
    imageAssetIds?: string[];
    contentAssetIds?: string[];
    selectedRepresentativeImageAssetId?: string;
    selectedDescriptionContentAssetId?: string;
    selectedModelReferenceKitIds?: string[];
    /** variant별 적용 자산 lineage (SSM-203). key는 CommerceImageVariantType. */
    variantAssetIds?: Record<string, string[]>;
    /** assetId별 모델 일관성 수동 검수 기록 (SSM-203). */
    variantQuality?: Record<string, UnknownRecord>;
  };
  updatedAt?: string;
  createdAt?: string;
}

export interface ICommercePublishJob {
  jobId: string;
  draftId: string;
  universeId: string;
  provider: "naver";
  operation: "create" | "update" | "sync";
  status: "queued" | "running" | "success" | "failed" | "partial" | "cancelled";
  actor?: string;
  draftRevision?: number;
  payloadHash?: string;
  dedupeKey?: string;
  idempotencyKey?: string;
  attempt?: number;
  requestSnapshot?: UnknownRecord;
  responseSnapshot?: UnknownRecord;
  error?: {
    code?: string;
    message?: string;
    stage?: string;
  };
  targetRef?: {
    channelProductNo?: number;
    originProductNo?: number;
    sellerManagementCode?: string;
  };
  traceId?: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  executionLockOwner?: string;
  executionLockAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICommerceDraftPublishPreview {
  createPayload?: UnknownRecord;
  updatePayloads?: {
    channelProduct?: UnknownRecord;
    originProduct?: UnknownRecord;
    status?: UnknownRecord;
    stock?: UnknownRecord;
  };
}

export interface ICommerceDraftGenerateContentResult {
  contents?: string[];
  assetIds?: string[];
  assets?: ContentAssetMetaType[];
  coins?: number;
  provider?: string;
  modelName?: string;
}

export interface ICommerceDraftGenerateImageResult {
  jobId?: string;
  images?: string[];
  assetIds?: string[];
  assets?: ImagePromptMetaType[];
  coins?: number;
  provider?: string;
  modelName?: string;
  executedModelName?: string;
  billedModelName?: string;
}
