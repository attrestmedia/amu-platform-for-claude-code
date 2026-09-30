import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

export interface IPromptSnapshotDocument extends Document {
  snapshotId: string;
  jobId: string;
  templateKey?: string;
  templateDocumentSnapshot?: {
    templateKey?: string;
    title?: string;
    templateText?: string;
    defaultParams?: UnknownRecord;
    inputPolicy?: UnknownRecord;
    tags?: string[];
    categories?: string[];
    version?: number;
    enabled?: boolean;
  };
  rendered?: {
    prompt?: string;
    negative?: string;
    variables?: UnknownRecord;
    extraPrompt?: string;
  };
  promptHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PromptSnapshotSchema = new Schema<IPromptSnapshotDocument>(
  {
    snapshotId: { type: String, required: true, unique: true, index: true },
    jobId: { type: String, required: true, unique: true, index: true },
    templateKey: { type: String, default: "", index: true },
    templateDocumentSnapshot: { type: Schema.Types.Mixed, default: {} },
    rendered: { type: Schema.Types.Mixed, default: {} },
    promptHash: { type: String, default: "", index: true },
  },
  { timestamps: true, collection: "prompt_snapshots" },
);

PromptSnapshotSchema.index({ templateKey: 1, createdAt: -1 });
