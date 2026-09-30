import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

export const COMMERCE_PUBLISH_JOB_STATUSES = ["queued", "running", "success", "failed", "partial", "cancelled"] as const;
export const COMMERCE_PUBLISH_OPERATIONS = ["create", "update", "sync"] as const;

export type CommercePublishJobStatusType = (typeof COMMERCE_PUBLISH_JOB_STATUSES)[number];
export type CommercePublishOperationType = (typeof COMMERCE_PUBLISH_OPERATIONS)[number];

export interface ICommercePublishJobDocument extends Document {
  jobId: string;
  draftId: string;
  universeId: string;
  provider: "naver";
  operation: CommercePublishOperationType;
  status: CommercePublishJobStatusType;
  actor: string;
  draftRevision: number;
  payloadHash: string;
  dedupeKey: string;
  idempotencyKey?: string;
  attempt: number;
  requestSnapshot: UnknownRecord;
  responseSnapshot?: UnknownRecord;
  error?: {
    code?: string;
    message?: string;
    stage?: "validate" | "image_upload" | "publish" | "sync";
  };
  targetRef?: {
    channelProductNo?: number;
    originProductNo?: number;
    sellerManagementCode?: string;
  };
  traceId?: string;
  queuedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  executionLockOwner?: string;
  executionLockAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PublishJobErrorSchema = new Schema(
  {
    code: { type: String, default: "" },
    message: { type: String, default: "" },
    stage: { type: String, enum: ["validate", "image_upload", "publish", "sync"], default: undefined },
  },
  { _id: false },
);

const PublishJobTargetRefSchema = new Schema(
  {
    channelProductNo: { type: Number, default: undefined },
    originProductNo: { type: Number, default: undefined },
    sellerManagementCode: { type: String, default: "" },
  },
  { _id: false },
);

export const CommercePublishJobSchema = new Schema<ICommercePublishJobDocument>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    draftId: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    provider: { type: String, enum: ["naver"], required: true, default: "naver", index: true },
    operation: { type: String, enum: COMMERCE_PUBLISH_OPERATIONS, required: true, index: true },
    status: { type: String, enum: COMMERCE_PUBLISH_JOB_STATUSES, required: true, default: "queued", index: true },
    actor: { type: String, required: true, index: true },
    draftRevision: { type: Number, required: true, default: 1, index: true },
    payloadHash: { type: String, required: true, index: true },
    dedupeKey: { type: String, required: true, index: true },
    idempotencyKey: { type: String, default: undefined, index: true },
    attempt: { type: Number, required: true, default: 1 },
    requestSnapshot: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
    responseSnapshot: { type: Schema.Types.Mixed, default: () => ({}) },
    error: { type: PublishJobErrorSchema, default: () => ({}) },
    targetRef: { type: PublishJobTargetRefSchema, default: () => ({}) },
    traceId: { type: String, default: "", index: true },
    queuedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    executionLockOwner: { type: String, default: "" },
    executionLockAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "commerce_publish_jobs" },
);

CommercePublishJobSchema.index({ draftId: 1, createdAt: -1 });
CommercePublishJobSchema.index({ universeId: 1, status: 1, createdAt: -1 });
CommercePublishJobSchema.index({ universeId: 1, operation: 1, createdAt: -1 });
CommercePublishJobSchema.index({ universeId: 1, payloadHash: 1, createdAt: -1 });
CommercePublishJobSchema.index({ dedupeKey: 1, createdAt: -1 });
CommercePublishJobSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
CommercePublishJobSchema.index({ "targetRef.channelProductNo": 1, createdAt: -1 });
