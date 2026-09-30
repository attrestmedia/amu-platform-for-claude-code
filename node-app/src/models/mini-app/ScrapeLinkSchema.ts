import { Document, Schema } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의 (Scrape Links 미니앱 개인화 저장)
 * @process uid/urlHash 복합 유니크 인덱스로 사용자별 URL 중복 방지, OG/Todo 상태 포함
 * @domain mini-app.scrape-links
 * @scope db_schema
 */

export type ScrapeLinkOgStatusType = "idle" | "pending" | "success" | "failed";
export type ScrapeLinkSourceType = "paste" | "manual" | "text-extract";

export interface IScrapeLinkDocument extends Document {
  uid: string;
  url: string;
  normalizedUrl: string;
  urlHash: string;
  domain: string;
  label: string;
  note: string;
  categoryId: string;
  categoryName: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogSiteName: string;
  ogStatus: ScrapeLinkOgStatusType;
  ogFetchedAt: Date | null;
  checked: boolean;
  checkedAt: Date | null;
  source: ScrapeLinkSourceType;
  createdAt: Date;
  updatedAt: Date;
}

export const ScrapeLinkSchema = new Schema<IScrapeLinkDocument>(
  {
    uid: { type: String, required: true, index: true },
    url: { type: String, required: true },
    normalizedUrl: { type: String, required: true },
    urlHash: { type: String, required: true },
    domain: { type: String, default: "" },
    label: { type: String, default: "" },
    note: { type: String, default: "" },
    categoryId: { type: String, default: "", index: true },
    categoryName: { type: String, default: "" },
    ogTitle: { type: String, default: "" },
    ogDescription: { type: String, default: "" },
    ogImage: { type: String, default: "" },
    ogSiteName: { type: String, default: "" },
    ogStatus: { type: String, default: "idle" },
    ogFetchedAt: { type: Date, default: null },
    checked: { type: Boolean, default: false, index: true },
    checkedAt: { type: Date, default: null },
    source: { type: String, default: "paste" },
  },
  { timestamps: true },
);

ScrapeLinkSchema.index({ uid: 1, urlHash: 1 }, { unique: true });
ScrapeLinkSchema.index({ uid: 1, createdAt: -1 });
ScrapeLinkSchema.index({ uid: 1, checked: 1, createdAt: -1 });
ScrapeLinkSchema.index({ uid: 1, categoryId: 1, createdAt: -1 });
