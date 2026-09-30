import { Schema, type Document } from "mongoose";

export type VideoAssetStateType = "active" | "deleted";

export interface IVideoAssetDocument extends Document {
  assetId: string;
  jobId: string;
  scope: "user" | "universe";
  uid: string;
  provider: string;
  modelName: string;
  outputIndex: number;
  durationSeconds?: number;
  mimeType: "video/mp4" | "video/webm";
  storage: {
    driver: "r2";
    access: "private" | "public";
    bucket: string;
    key: string;
    url?: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    ext: "mp4" | "webm";
    migrationState: "r2";
  };
  moderation?: { providerApproved?: boolean; raw?: Record<string, unknown> };
  state: VideoAssetStateType;
  createdAt: Date;
  updatedAt: Date;
}

export const VideoAssetSchema = new Schema<IVideoAssetDocument>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    jobId: { type: String, required: true, index: true },
    scope: { type: String, enum: ["user", "universe"], required: true, index: true },
    uid: { type: String, required: true, index: true },
    provider: { type: String, required: true, index: true },
    modelName: { type: String, required: true, index: true },
    outputIndex: { type: Number, required: true, min: 0, default: 0 },
    durationSeconds: { type: Number, min: 0, default: null },
    mimeType: { type: String, enum: ["video/mp4", "video/webm"], required: true },
    storage: { type: Schema.Types.Mixed, required: true },
    moderation: { type: Schema.Types.Mixed, default: undefined },
    state: { type: String, enum: ["active", "deleted"], required: true, default: "active", index: true },
  },
  { timestamps: true, collection: "video_assets" },
);

VideoAssetSchema.index({ uid: 1, state: 1, createdAt: -1 });
VideoAssetSchema.index({ jobId: 1, outputIndex: 1 });
