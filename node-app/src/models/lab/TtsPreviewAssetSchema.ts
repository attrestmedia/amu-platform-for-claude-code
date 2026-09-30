import { Schema, Document } from "mongoose";

export type TtsPreviewVisibility = "private" | "public";
export type TtsPreviewState = "generating" | "ready" | "failed" | "deleted";
export type TtsPreviewSource = "default" | "custom";
export type TtsPreviewModerationStatus = "pending" | "approved" | "rejected";

export interface ITtsPreviewAssetDocument extends Document {
  assetId: string;
  ownerUid: string;
  provider: string;
  modelName: string;
  voiceId: string;
  locale: string;
  text: string;
  baseKey: string;
  dedupeKey?: string;
  speed: number;
  visibility: TtsPreviewVisibility;
  source: TtsPreviewSource;
  quotaSlot?: number;
  moderationStatus: TtsPreviewModerationStatus;
  moderatedAt?: Date | null;
  moderatedBy?: string;
  moderationReason?: string;
  state: TtsPreviewState;
  audioData?: Buffer;
  storage?: Record<string, unknown>;
  contentType?: string;
  bytes?: number;
  sha256?: string;
  errorCode?: string;
  deletedAt?: Date | null;
  deletedBy?: string;
  deleteReason?: string;
  generationLeaseUntil?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const TtsPreviewAssetSchema = new Schema<ITtsPreviewAssetDocument>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    ownerUid: { type: String, required: true, index: true },
    provider: { type: String, required: true, index: true },
    modelName: { type: String, required: true, index: true },
    voiceId: { type: String, required: true, index: true },
    locale: { type: String, required: true, index: true },
    text: { type: String, required: true },
    baseKey: { type: String, required: true, index: true },
    dedupeKey: { type: String, default: undefined },
    speed: { type: Number, required: true, min: 0.25, max: 4 },
    visibility: { type: String, enum: ["private", "public"], required: true, index: true },
    source: { type: String, enum: ["default", "custom"], required: true, index: true },
    quotaSlot: { type: Number, min: 0, default: undefined },
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      required: true,
      default: "pending",
      index: true,
    },
    moderatedAt: { type: Date, default: null },
    moderatedBy: { type: String, default: "" },
    moderationReason: { type: String, default: "" },
    state: {
      type: String,
      enum: ["generating", "ready", "failed", "deleted"],
      required: true,
      default: "generating",
      index: true,
    },
    audioData: { type: Buffer, select: false, default: undefined },
    storage: { type: Schema.Types.Mixed, default: undefined },
    contentType: { type: String, default: "audio/mpeg" },
    bytes: { type: Number, default: 0 },
    sha256: { type: String, default: "" },
    errorCode: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: "" },
    deleteReason: { type: String, default: "" },
    generationLeaseUntil: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "tts_preview_assets" },
);

TtsPreviewAssetSchema.index({ voiceId: 1, modelName: 1, locale: 1, visibility: 1, state: 1, createdAt: -1 });
TtsPreviewAssetSchema.index({ ownerUid: 1, state: 1, createdAt: -1 });
TtsPreviewAssetSchema.index({ moderationStatus: 1, visibility: 1, state: 1, createdAt: 1 });
TtsPreviewAssetSchema.index({ baseKey: 1, visibility: 1, ownerUid: 1, state: 1 });
TtsPreviewAssetSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
TtsPreviewAssetSchema.index(
  { ownerUid: 1, visibility: 1, quotaSlot: 1 },
  {
    unique: true,
    name: "tts_preview_active_quota_slot_unique",
    partialFilterExpression: { quotaSlot: { $type: "number" } },
  },
);
TtsPreviewAssetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
TtsPreviewAssetSchema.index({ "storage.key": 1 });
