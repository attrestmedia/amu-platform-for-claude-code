import { Schema, type Document } from "mongoose";

export type AudioAssetStateType = "active" | "deleted" | "detached" | "pending_delete";
export type AudioAssetDeletePolicyType = "soft" | "hard" | "detach";

export type AudioAssetStorageType = {
  driver: "r2";
  access: "private" | "public";
  bucket: string;
  key: string;
  url?: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  ext: string;
};

export type AudioAssetMetadataType = {
  durationMs: number | null;
  codec: string;
  sampleRateHz: number | null;
  channels: number | null;
  sourceTextVersion: string;
  voiceProvenance: {
    provider: string;
    voiceId: string;
    voiceRevision: string;
    rightsStatus: string;
    source: string;
  };
};

export interface IAudioAssetDocument extends Document {
  assetId: string;
  jobId: string;
  scope: "user" | "universe";
  uid: string;
  universeId?: string;
  createdBy?: string;
  provider: string;
  modelName: string;
  templateKey?: string;
  visibility: "private" | "public";
  sourceService?: string;
  sourceSurface?: string;
  sourceRevision: string;
  sourceHash: string;
  segmentIndex: number;
  segmentCount: number;
  segmentHash: string;
  manifestHash: string;
  audio: AudioAssetMetadataType;
  storage: AudioAssetStorageType;
  state: AudioAssetStateType;
  deletePolicy: AudioAssetDeletePolicyType;
  deletedAt?: Date | null;
  deletedBy?: string;
  deleteReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AudioAssetVoiceProvenanceSchema = new Schema(
  {
    provider: { type: String, required: true },
    voiceId: { type: String, required: true },
    voiceRevision: { type: String, required: true },
    rightsStatus: { type: String, required: true },
    source: { type: String, required: true },
  },
  { _id: false, strict: true },
);

const AudioAssetMetadataSchema = new Schema(
  {
    durationMs: { type: Number, min: 0, default: null },
    codec: { type: String, required: true },
    sampleRateHz: { type: Number, min: 1, default: null },
    channels: { type: Number, min: 1, default: null },
    sourceTextVersion: { type: String, required: true },
    voiceProvenance: { type: AudioAssetVoiceProvenanceSchema, required: true },
  },
  { _id: false, strict: true },
);

export const AudioAssetSchema = new Schema<IAudioAssetDocument>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    jobId: { type: String, required: true, index: true },
    scope: { type: String, enum: ["user", "universe"], required: true, index: true },
    uid: { type: String, required: true, index: true },
    universeId: { type: String, default: "", index: true },
    createdBy: { type: String, default: "", index: true },
    provider: { type: String, required: true, index: true },
    modelName: { type: String, required: true, index: true },
    templateKey: { type: String, default: "", index: true },
    visibility: { type: String, enum: ["private", "public"], required: true, default: "private", index: true },
    sourceService: { type: String, default: "gen-studio", index: true },
    sourceSurface: { type: String, default: "unknown" },
    sourceRevision: { type: String, required: true, index: true },
    sourceHash: { type: String, required: true, index: true },
    segmentIndex: { type: Number, required: true, min: 0 },
    segmentCount: { type: Number, required: true, min: 1 },
    segmentHash: { type: String, required: true },
    manifestHash: { type: String, required: true, index: true },
    audio: { type: AudioAssetMetadataSchema, required: true },
    storage: { type: Schema.Types.Mixed, required: true },
    state: { type: String, enum: ["active", "deleted", "detached", "pending_delete"], required: true, default: "active", index: true },
    deletePolicy: { type: String, enum: ["soft", "hard", "detach"], required: true, default: "soft", index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: "" },
    deleteReason: { type: String, default: "" },
  },
  { timestamps: true, collection: "audio_assets" },
);

AudioAssetSchema.index({ jobId: 1, segmentIndex: 1 }, { unique: true });
AudioAssetSchema.index({ uid: 1, state: 1, createdAt: -1 });
AudioAssetSchema.index({ sourceHash: 1, segmentHash: 1, state: 1 });
