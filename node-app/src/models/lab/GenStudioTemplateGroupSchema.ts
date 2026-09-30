import { Schema, type Document } from "mongoose";

export interface IGenStudioTemplateGroupDocument extends Document {
  key: string;
  promptType: "image" | "content" | "audio";
  title: string;
  description: string;
  visibility: "public" | "private";
  serviceKeys: string[];
  templateKeys: string[];
  coverTemplateKey: string;
  recommendedTemplateKeys: string[];
  recommendedDescription: { ko: string; en: string };
  enabled: boolean;
  sortOrder: number;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const GenStudioTemplateGroupSchema = new Schema<IGenStudioTemplateGroupDocument>(
  {
    key: { type: String, required: true, unique: true, index: true },
    promptType: { type: String, enum: ["image", "content", "audio"], default: "image", index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    visibility: { type: String, enum: ["public", "private"], default: "private", index: true },
    serviceKeys: { type: [String], default: [], index: true },
    templateKeys: { type: [String], default: [] },
    coverTemplateKey: { type: String, default: "" },
    // 추천 섹션 노출 대상 — templateKeys의 부분집합 유지 (repo/route에서 검증·정리)
    recommendedTemplateKeys: { type: [String], default: [] },
    recommendedDescription: {
      ko: { type: String, default: "" },
      en: { type: String, default: "" },
    },
    enabled: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 100, index: true },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);
