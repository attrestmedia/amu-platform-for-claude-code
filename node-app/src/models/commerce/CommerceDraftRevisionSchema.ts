import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

export const COMMERCE_DRAFT_REVISION_SOURCES = [
  "manual_edit",
  "ai_apply",
  "ai_generate",
  "import",
  "validation",
  "publish_result",
  "storefront_sync",
] as const;

export type CommerceDraftRevisionSourceType = (typeof COMMERCE_DRAFT_REVISION_SOURCES)[number];

export interface ICommerceDraftRevisionDocument extends Document {
  revisionId: string;
  draftId: string;
  universeId: string;
  actor: string;
  source: CommerceDraftRevisionSourceType;
  summary: string;
  patchMeta?: {
    changedPaths?: string[];
    fromStatus?: string;
    toStatus?: string;
  };
  snapshot: UnknownRecord;
  createdAt: Date;
  updatedAt: Date;
}

const DraftRevisionPatchMetaSchema = new Schema(
  {
    changedPaths: { type: [String], default: [] },
    fromStatus: { type: String, default: "" },
    toStatus: { type: String, default: "" },
  },
  { _id: false },
);

export const CommerceDraftRevisionSchema = new Schema<ICommerceDraftRevisionDocument>(
  {
    revisionId: { type: String, required: true, unique: true, index: true },
    draftId: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    actor: { type: String, required: true, index: true },
    source: {
      type: String,
      enum: COMMERCE_DRAFT_REVISION_SOURCES,
      required: true,
      default: "manual_edit",
      index: true,
    },
    summary: { type: String, required: true },
    patchMeta: { type: DraftRevisionPatchMetaSchema, default: () => ({}) },
    snapshot: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
  },
  { timestamps: true, collection: "commerce_draft_revisions" },
);

CommerceDraftRevisionSchema.index({ draftId: 1, createdAt: -1 });
CommerceDraftRevisionSchema.index({ universeId: 1, createdAt: -1 });
CommerceDraftRevisionSchema.index({ actor: 1, createdAt: -1 });
