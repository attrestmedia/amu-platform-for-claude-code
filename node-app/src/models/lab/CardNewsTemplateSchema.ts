import { Schema, type Document } from "mongoose";
import type { CardNewsTemplatePreset, CardNewsTemplateRegistryStatus } from "types/card-news";

/**
 * @docHint
 * @purpose CardNews 운영 템플릿 버전 레지스트리 MongoDB 스키마
 * @process immutable preset snapshot·status lifecycle·operator audit metadata
 * @domain card-news
 * @scope db_schema
 */

export interface ICardNewsTemplateDocument extends Document {
  id: string;
  version: number;
  status: CardNewsTemplateRegistryStatus;
  preset: CardNewsTemplatePreset;
  createdBy: string;
  updatedBy: string;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CardNewsTemplateSchema = new Schema<ICardNewsTemplateDocument>(
  {
    id: { type: String, required: true },
    version: { type: Number, required: true, min: 1, max: 100 },
    status: { type: String, enum: ["active", "inactive"], required: true, default: "inactive", index: true },
    // preset은 resolver가 다시 검증하는 immutable snapshot이다.
    preset: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String, required: true, default: "" },
    updatedBy: { type: String, required: true, default: "" },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "card_news_templates" },
);

CardNewsTemplateSchema.index({ id: 1, version: 1 }, { unique: true });
CardNewsTemplateSchema.index({ status: 1, id: 1, version: -1 });
