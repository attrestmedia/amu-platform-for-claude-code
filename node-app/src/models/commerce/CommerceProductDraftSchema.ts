import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

export const COMMERCE_DRAFT_STATUSES = [
  "draft",
  "needs_review",
  "ready",
  "publishing",
  "published",
  "publish_failed",
  "archived",
] as const;

export const COMMERCE_DRAFT_SOURCES = ["manual", "imported_from_naver", "generated_by_ai", "mixed"] as const;

export type CommerceDraftStatusType = (typeof COMMERCE_DRAFT_STATUSES)[number];
export type CommerceDraftSourceType = (typeof COMMERCE_DRAFT_SOURCES)[number];

export interface ICommerceProductDraftDocument extends Document {
  draftId: string;
  universeId: string;
  revision: number;
  provider: "naver";
  status: CommerceDraftStatusType;
  source: CommerceDraftSourceType;
  display: UnknownRecord;
  smartstore: UnknownRecord;
  assets: {
    imageAssetIds: string[];
    contentAssetIds: string[];
    selectedRepresentativeImageAssetId?: string;
    selectedDescriptionContentAssetId?: string;
    selectedModelReferenceKitIds?: string[];
    variantAssetIds?: Record<string, string[]>;
    variantQuality?: Record<string, UnknownRecord>;
  };
  validation: {
    ready: boolean;
    errorMessages: Array<{ code?: string; field?: string; message?: string }>;
    errors?: Array<{ code?: string; field?: string; message?: string }>;
    warnings: Array<{ code?: string; field?: string; message?: string }>;
    allowlistMatched: boolean;
    lastCheckedAt?: Date | null;
    rulesVersion?: string;
  };
  publish: UnknownRecord;
  review: {
    factualConfirmed: boolean;
    representativeImageConfirmed: boolean;
    aiDisclosureChecked: boolean;
    lastReviewedAt?: Date | null;
    lastReviewedBy?: string;
  };
  createdBy: string;
  updatedBy: string;
  lockedBy?: string;
  publishLockAt?: Date | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DraftAssetsSchema = new Schema(
  {
    imageAssetIds: { type: [String], default: [] },
    contentAssetIds: { type: [String], default: [] },
    selectedRepresentativeImageAssetId: { type: String, default: "" },
    selectedDescriptionContentAssetId: { type: String, default: "" },
    selectedModelReferenceKitIds: { type: [String], default: [] },
    // variant가 늘어도 마이그레이션이 필요 없게 Mixed로 둔다 (SSM-203).
    variantAssetIds: { type: Schema.Types.Mixed, default: () => ({}) },
    // assetId별 모델 일관성 수동 검수 기록 (SSM-203). 항목이 늘어도 마이그레이션이 없도록 Mixed.
    variantQuality: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false },
);

const DraftValidationMessageSchema = new Schema(
  {
    code: { type: String, default: "" },
    field: { type: String, default: "" },
    message: { type: String, default: "" },
  },
  { _id: false },
);

const DraftValidationSchema = new Schema(
  {
    ready: { type: Boolean, default: false, index: true },
    errorMessages: { type: [DraftValidationMessageSchema], default: [] },
    warnings: { type: [DraftValidationMessageSchema], default: [] },
    allowlistMatched: { type: Boolean, default: false },
    lastCheckedAt: { type: Date, default: null },
    rulesVersion: { type: String, default: "" },
  },
  { _id: false },
);

const DraftReviewSchema = new Schema(
  {
    factualConfirmed: { type: Boolean, default: false },
    representativeImageConfirmed: { type: Boolean, default: false },
    aiDisclosureChecked: { type: Boolean, default: false },
    lastReviewedAt: { type: Date, default: null },
    lastReviewedBy: { type: String, default: "" },
  },
  { _id: false },
);

export const CommerceProductDraftSchema = new Schema<ICommerceProductDraftDocument>(
  {
    draftId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    revision: { type: Number, required: true, min: 1, default: 1, index: true },
    provider: { type: String, enum: ["naver"], required: true, default: "naver", index: true },
    status: { type: String, enum: COMMERCE_DRAFT_STATUSES, required: true, default: "draft", index: true },
    source: { type: String, enum: COMMERCE_DRAFT_SOURCES, required: true, default: "manual", index: true },
    display: { type: Schema.Types.Mixed, default: () => ({}) },
    smartstore: { type: Schema.Types.Mixed, default: () => ({}) },
    assets: { type: DraftAssetsSchema, default: () => ({}) },
    validation: { type: DraftValidationSchema, default: () => ({}) },
    publish: { type: Schema.Types.Mixed, default: () => ({ publishCount: 0, failureCount: 0 }) },
    review: { type: DraftReviewSchema, default: () => ({}) },
    createdBy: { type: String, required: true, index: true },
    updatedBy: { type: String, required: true, index: true },
    lockedBy: { type: String, default: "", index: true },
    publishLockAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "commerce_product_drafts" },
);

CommerceProductDraftSchema.index({ universeId: 1, status: 1, updatedAt: -1 });
CommerceProductDraftSchema.index({ universeId: 1, provider: 1, updatedAt: -1 });
CommerceProductDraftSchema.index({ universeId: 1, source: 1, updatedAt: -1 });
CommerceProductDraftSchema.index({ universeId: 1, "validation.ready": 1, status: 1, updatedAt: -1 });
CommerceProductDraftSchema.index({ universeId: 1, "smartstore.channelProductNo": 1 });
CommerceProductDraftSchema.index({ universeId: 1, "smartstore.originProductNo": 1 });
CommerceProductDraftSchema.index({ universeId: 1, "smartstore.sellerManagementCode": 1 });
CommerceProductDraftSchema.index({ "publish.lastJobId": 1 });
CommerceProductDraftSchema.index({ "assets.imageAssetIds": 1 });
CommerceProductDraftSchema.index({ "assets.contentAssetIds": 1 });
CommerceProductDraftSchema.index({ "assets.selectedModelReferenceKitIds": 1 });
