import { Schema, type Document } from "mongoose";
import { MARKETING_JOB_PRIORITY } from "consts/marketing/queue";
import type { MarketingJobPriority } from "consts/marketing/queue";
import type { UnknownRecord } from "utils/common/typeUtils";

export type MarketingSourceInventoryKind =
  | "csv"
  | "json"
  | "url_list"
  | "sitemap"
  | "rss"
  | "web_page"
  | "naver_blog"
  | "commerce_product";
export type MarketingSourceRewriteStatus =
  | "candidate"
  | "queued"
  | "drafted"
  | "waiting_review"
  | "applied_manually"
  | "verified"
  | "rejected"
  | "failed";

export interface IMarketingSourceInventoryDocument extends Document {
  itemId: string;
  universeId: string;
  sourceKind: MarketingSourceInventoryKind;
  providerKey?: string;
  sourceUrl: string;
  canonicalUrl?: string;
  title?: string;
  excerptText?: string;
  contentText?: string;
  tags?: string[];
  sourceFingerprint: string;
  contentHash?: string;
  rewriteStatus: MarketingSourceRewriteStatus;
  queueCategory?: string;
  priority?: MarketingJobPriority;
  lastJobId?: string;
  batchKey?: string;
  templateKey?: string;
  appliedUrl?: string;
  appliedAt?: Date | null;
  appliedBy?: string;
  note?: string;
  meta?: UnknownRecord;
  createdAt: Date;
  updatedAt: Date;
}

export const MARKETING_SOURCE_INVENTORY_KINDS = [
  "csv",
  "json",
  "url_list",
  "sitemap",
  "rss",
  "web_page",
  "naver_blog",
  "commerce_product",
] as const;
export const MARKETING_SOURCE_REWRITE_STATUS = [
  "candidate",
  "queued",
  "drafted",
  "waiting_review",
  "applied_manually",
  "verified",
  "rejected",
  "failed",
] as const;

export const MarketingSourceInventorySchema = new Schema<IMarketingSourceInventoryDocument>(
  {
    itemId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    sourceKind: { type: String, enum: MARKETING_SOURCE_INVENTORY_KINDS, required: true, default: "web_page", index: true },
    providerKey: { type: String, default: "", index: true },
    sourceUrl: { type: String, required: true },
    canonicalUrl: { type: String, default: "" },
    title: { type: String, default: "" },
    excerptText: { type: String, default: "" },
    contentText: { type: String, default: "" },
    tags: { type: [String], default: [] },
    sourceFingerprint: { type: String, required: true, index: true },
    contentHash: { type: String, default: "", index: true },
    rewriteStatus: { type: String, enum: MARKETING_SOURCE_REWRITE_STATUS, required: true, default: "candidate", index: true },
    queueCategory: { type: String, default: "general", index: true },
    priority: { type: String, enum: MARKETING_JOB_PRIORITY, default: "normal", index: true },
    lastJobId: { type: String, default: "", index: true },
    batchKey: { type: String, default: "", index: true },
    templateKey: { type: String, default: "", index: true },
    appliedUrl: { type: String, default: "" },
    appliedAt: { type: Date, default: null },
    appliedBy: { type: String, default: "" },
    note: { type: String, default: "" },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "marketing_source_inventory" },
);

MarketingSourceInventorySchema.index({ universeId: 1, rewriteStatus: 1, updatedAt: -1 });
MarketingSourceInventorySchema.index({ universeId: 1, queueCategory: 1, rewriteStatus: 1, updatedAt: -1 });
MarketingSourceInventorySchema.index({ universeId: 1, providerKey: 1, updatedAt: -1 });
MarketingSourceInventorySchema.index({ universeId: 1, sourceFingerprint: 1 }, { unique: true });
