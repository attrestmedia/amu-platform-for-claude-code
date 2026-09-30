import { Document, Schema } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의 (Scrape Links 사용자별 카테고리)
 * @process uid/nameKey 복합 유니크 인덱스로 사용자별 카테고리 이름 중복 방지
 * @domain mini-app.scrape-links
 * @scope db_schema
 */

export interface IScrapeLinkCategoryDocument extends Document {
  uid: string;
  name: string;
  nameKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ScrapeLinkCategorySchema = new Schema<IScrapeLinkCategoryDocument>(
  {
    uid: { type: String, required: true, index: true },
    name: { type: String, required: true },
    nameKey: { type: String, required: true },
  },
  { timestamps: true },
);

ScrapeLinkCategorySchema.index({ uid: 1, nameKey: 1 }, { unique: true });
ScrapeLinkCategorySchema.index({ uid: 1, createdAt: -1 });
