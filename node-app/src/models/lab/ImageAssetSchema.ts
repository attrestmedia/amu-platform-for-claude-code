import { Schema, Document } from "mongoose";
import type { ImageProviderType } from "types/ai";
import type { PromptGenType, PromptVisibilityType, StudioGenerationSourceServiceType } from "types/app";
import type { ImageDeletePolicyType } from "./ImageGenJobSchema";
import {
  AGENT_IMAGE_PERSISTED_ROUTING_PROFILES,
  AGENT_IMAGE_TEXT_POLICIES,
  type AgentImagePersistedRoutingProfileType,
  type AgentImageTextPolicyType,
} from "utils/ai/agentImageRoutingPolicy";

export type ImageAssetStateType = "active" | "deleted" | "detached";

export type ImageAssetRoutingMetaType = {
  routingProfile: AgentImagePersistedRoutingProfileType;
  effectiveRoutingProfile: AgentImagePersistedRoutingProfileType;
  textPolicy: AgentImageTextPolicyType;
  textPolicyApplied: boolean;
  routingReason: string;
  fallbackApplied: boolean;
};

const ImageAssetRoutingMetaSchema = new Schema<ImageAssetRoutingMetaType>(
  {
    routingProfile: { type: String, enum: AGENT_IMAGE_PERSISTED_ROUTING_PROFILES, required: true },
    effectiveRoutingProfile: { type: String, enum: AGENT_IMAGE_PERSISTED_ROUTING_PROFILES, required: true },
    textPolicy: { type: String, enum: AGENT_IMAGE_TEXT_POLICIES, required: true },
    textPolicyApplied: { type: Boolean, required: true },
    routingReason: { type: String, required: true },
    fallbackApplied: { type: Boolean, required: true },
  },
  { _id: false, strict: true },
);

export interface IImageAssetDocument extends Document {
  assetId: string;
  jobId: string;
  scope: "user" | "universe";
  uid?: string;
  universeId?: string;
  sourceService?: StudioGenerationSourceServiceType;
  sourceSurface?: string;
  provider: ImageProviderType | "user-upload";
  modelName: string;
  templateKey?: string;
  generationMode?: PromptGenType;
  outputIndex?: number;
  visibility?: PromptVisibilityType;
  extraPrompt?: string;
  tags?: string[];
  categories?: string[];
  routingMeta?: ImageAssetRoutingMetaType;
  storage: {
    url?: string;
    driver?: string;
    access?: "public" | "private";
    bucket?: string;
    key?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    bytes?: number;
    sha256?: string;
    ext?: string;
    migrationState?: "r2" | "migration-required";
  };
  state: ImageAssetStateType;
  deletePolicy: ImageDeletePolicyType;
  deletedAt?: Date | null;
  deletedBy?: string;
  deleteReason?: string;
  hardDeletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ImageAssetSchema = new Schema<IImageAssetDocument>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    jobId: { type: String, required: true, index: true },
    scope: { type: String, enum: ["user", "universe"], required: true, index: true },
    uid: { type: String, index: true, default: "" },
    universeId: { type: String, index: true, default: "" },
    sourceService: {
      type: String,
      enum: ["gen-studio", "tutors", "store", "play", "mini-app", "marketing", "admin", "agent", "upload", "unknown"],
      index: true,
      default: "unknown",
    },
    sourceSurface: { type: String, default: "unknown" },
    provider: { type: String, required: true, index: true },
    modelName: { type: String, required: true, index: true },
    templateKey: { type: String, index: true, default: "" },
    generationMode: { type: String, enum: ["template", "custom"], index: true, default: "custom" },
    outputIndex: { type: Number, default: 0, index: true },
    visibility: { type: String, enum: ["private", "public"], index: true, default: "private" },
    extraPrompt: { type: String, default: "" },
    tags: [{ type: String }],
    categories: [{ type: String }],
    routingMeta: { type: ImageAssetRoutingMetaSchema, default: undefined },
    storage: { type: Schema.Types.Mixed, required: true },
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
  { timestamps: true, collection: "image_assets" },
);

ImageAssetSchema.index({ jobId: 1, createdAt: -1, outputIndex: 1 });
ImageAssetSchema.index({ scope: 1, uid: 1, state: 1, createdAt: -1, outputIndex: 1 });
ImageAssetSchema.index({ uid: 1, state: 1, createdAt: -1, outputIndex: 1 });
ImageAssetSchema.index({ uid: 1, sourceService: 1, state: 1, createdAt: -1, outputIndex: 1 });
ImageAssetSchema.index({ scope: 1, universeId: 1, state: 1, createdAt: -1, outputIndex: 1 });
ImageAssetSchema.index({ templateKey: 1, state: 1, createdAt: -1, outputIndex: 1 });
ImageAssetSchema.index({ templateKey: 1, generationMode: 1, state: 1, createdAt: -1, outputIndex: 1 });
ImageAssetSchema.index({ visibility: 1, state: 1, createdAt: -1, outputIndex: 1 });
ImageAssetSchema.index({ "storage.url": 1 });
