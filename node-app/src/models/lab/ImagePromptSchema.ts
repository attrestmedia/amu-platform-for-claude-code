import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(key, title, categories, templateText, defaultParams, default) 및 인덱스/기본값 선언
 * @domain lab
 * @scope db_schema
 */

export interface IImagePromptDocument extends Document {
  key: string; // ex) 'hyper-real-portrait'
  title: string; // 관리자용 이름
  categories: string[];
  templateText: string;
  sceneTemplate?: string;
  accessLevel?: "public" | "admin";
  usageTip?: string;
  defaultParams?: {
    aspectRatio?: string; // ex) "9:16" | "1:1"
    size?: string; // ex) "1024x1792"
    negative?: string; // 네거티브 프롬프트
    previewImage?: string;
    modelSamples?: Record<string, string[]>;
    [k: string]: unknown;
  };
  inputPolicy?: {
    referenceImage?: {
      required?: boolean;
      minCount?: number;
      maxCount?: number;
      enforceInCustomMode?: boolean;
    };
    [k: string]: unknown;
  };
  tags?: string[];
  enabled: boolean;
  version?: number;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ImagePromptSchema = new Schema<IImagePromptDocument>(
  {
    key: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    categories: { type: [String], default: ["general"], index: true },
    templateText: { type: String, required: true },
    sceneTemplate: { type: String, default: "" },
    accessLevel: { type: String, enum: ["public", "admin"], default: "public", index: true },
    usageTip: { type: String, default: "", maxlength: 140 },
    defaultParams: { type: Schema.Types.Mixed, default: {} },
    inputPolicy: { type: Schema.Types.Mixed, default: {} },
    tags: [{ type: String }],
    enabled: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);
