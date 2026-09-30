import { Schema, Document } from "mongoose";
import type { TextProviderType } from "types/ai";
import type { PromptGenType, PromptVisibilityType, StudioGenerationSourceServiceType } from "types/app";
import type { ContentDeletePolicyType } from "./ContentGenJobSchema";

export type ContentAssetStateType = "active" | "deleted" | "detached";

export interface IContentAssetDocument extends Document {
  assetId: string;
  jobId: string;
  scope: "user" | "universe";
  uid?: string;
  universeId?: string;
  provider: TextProviderType;
  modelName: string;
  templateKey?: string;
  generationMode?: PromptGenType;
  visibility?: PromptVisibilityType;
  sourceService?: StudioGenerationSourceServiceType;
  sourceSurface?: string;
  extraPrompt?: string;
  outputIndex?: number;
  content: {
    text: string;
    chars?: number;
    bytes?: number;
    sha256?: string;
  };
  state: ContentAssetStateType;
  deletePolicy: ContentDeletePolicyType;
  deletedAt?: Date | null;
  deletedBy?: string;
  deleteReason?: string;
  hardDeletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ContentAssetSchema = new Schema<IContentAssetDocument>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    jobId: { type: String, required: true, index: true },
    scope: { type: String, enum: ["user", "universe"], required: true, index: true },
    uid: { type: String, index: true, default: "" },
    universeId: { type: String, index: true, default: "" },
    provider: { type: String, required: true, index: true },
    modelName: { type: String, required: true, index: true },
    templateKey: { type: String, index: true, default: "" },
    generationMode: { type: String, enum: ["template", "custom"], index: true, default: "custom" },
    visibility: { type: String, enum: ["private", "public"], index: true, default: "private" },
    sourceService: { type: String, enum: ["gen-studio", "tutors", "store", "play", "mini-app", "marketing", "admin", "agent", "upload", "unknown"], index: true, default: "unknown" },
    sourceSurface: { type: String, index: true, default: "unknown" },
    extraPrompt: { type: String, default: "" },
    outputIndex: { type: Number, default: 0, index: true },
    content: { type: Schema.Types.Mixed, required: true },
    state: {
      type: String,
      enum: ["active", "deleted", "detached"],
      required: true,
      default: "active",
      index: true,
    },
    deletePolicy: {
      type: String,
      enum: ["soft", "hard", "detach"],
      required: true,
      default: "soft",
      index: true,
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: "" },
    deleteReason: { type: String, default: "" },
    hardDeletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "content_assets" },
);

ContentAssetSchema.index({ jobId: 1, createdAt: -1 });
ContentAssetSchema.index({ scope: 1, uid: 1, state: 1, createdAt: -1 });
ContentAssetSchema.index({ scope: 1, universeId: 1, state: 1, createdAt: -1 });
ContentAssetSchema.index({ templateKey: 1, state: 1, createdAt: -1 });
ContentAssetSchema.index({ templateKey: 1, generationMode: 1, state: 1, createdAt: -1 });
ContentAssetSchema.index({ visibility: 1, state: 1, createdAt: -1 });
ContentAssetSchema.index({ "content.sha256": 1 });
