import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(key, title, categories, templateText, defaultParams, default) 및 인덱스/기본값 선언
 * @domain lab
 * @scope db_schema
 */

export interface IContentPromptDocument extends Document {
  key: string;
  title: string;
  categories: string[];
  templateText: string;
  accessLevel?: "public" | "admin";
  defaultParams?: {
    platform?: string;
    language?: string;
    length?: string;
    outputFormat?: string;
    [k: string]: unknown;
  };
  tags?: string[];
  enabled: boolean;
  version?: number;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ContentPromptSchema = new Schema<IContentPromptDocument>(
  {
    key: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    categories: { type: [String], default: ["general"], index: true },
    templateText: { type: String, required: true },
    accessLevel: { type: String, enum: ["public", "admin"], default: "public", index: true },
    defaultParams: { type: Schema.Types.Mixed, default: {} },
    tags: [{ type: String }],
    enabled: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);
