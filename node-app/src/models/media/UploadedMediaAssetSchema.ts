import { Schema, type Document } from "mongoose";

export type UploadedMediaScope = "user" | "guest" | "universe";

export interface IUploadedMediaAssetDocument extends Document {
  assetId: string;
  scope: UploadedMediaScope;
  ownerId: string;
  universeId?: string;
  kind: string;
  pid: string;
  originalFilename: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  storage: Record<string, unknown>;
  state: "active" | "deleted";
  createdBy: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const UploadedMediaAssetSchema = new Schema<IUploadedMediaAssetDocument>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    scope: { type: String, required: true, enum: ["user", "guest", "universe"], index: true },
    ownerId: { type: String, required: true, index: true },
    universeId: { type: String, default: "", index: true },
    kind: { type: String, required: true, index: true },
    pid: { type: String, required: true, index: true },
    originalFilename: { type: String, default: "" },
    mimeType: { type: String, required: true },
    bytes: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    storage: { type: Schema.Types.Mixed, required: true },
    state: { type: String, required: true, enum: ["active", "deleted"], default: "active", index: true },
    createdBy: { type: String, required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true, collection: "uploaded_media_assets" },
);

UploadedMediaAssetSchema.index({ scope: 1, ownerId: 1, state: 1, createdAt: -1 });
UploadedMediaAssetSchema.index({ "storage.url": 1, scope: 1, ownerId: 1, state: 1 });
