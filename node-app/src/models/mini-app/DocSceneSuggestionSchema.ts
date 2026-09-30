import { Document, Schema } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(uid, category, intent, scenePrompt, provider, modelName) 및 인덱스/기본값 선언
 * @domain mini-app
 * @scope db_schema
 */

export interface IDocSceneSuggestionDocument extends Document {
  uid: string;
  category: string;
  intent: string;
  intentHash: string;
  titleKo: string;
  titleEn: string;
  scenePrompt: string;
  recommendedMood?: string;
  recommendedCamera?: string;
  provider: string;
  modelName: string;
  source: "ai-assist";
  createdAt: Date;
  updatedAt: Date;
}

export const DocSceneSuggestionSchema = new Schema<IDocSceneSuggestionDocument>(
  {
    uid: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    intent: { type: String, required: true },
    intentHash: { type: String, required: true, index: true },
    titleKo: { type: String, required: true },
    titleEn: { type: String, required: true },
    scenePrompt: { type: String, required: true },
    recommendedMood: { type: String, default: "" },
    recommendedCamera: { type: String, default: "" },
    provider: { type: String, required: true, default: "google" },
    modelName: { type: String, required: true },
    source: { type: String, default: "ai-assist" },
  },
  { timestamps: true },
);

DocSceneSuggestionSchema.index({ category: 1, createdAt: -1 });
DocSceneSuggestionSchema.index({ intentHash: 1, createdAt: -1 });
