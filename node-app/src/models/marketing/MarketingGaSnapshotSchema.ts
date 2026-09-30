import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose GA4 Data API 일별 리포트의 원시(raw) 차원 조합 행 저장 모델
 * @process 수집 배치가 reportKey별 runReport 결과를 snapshotId 멱등 키로 upsert
 * @domain marketing
 * @scope server
 */

export const MARKETING_GA_REPORT_KEYS = [
  "page_traffic", // pagePath × sessionSourceMedium
  "event_funnel", // eventName × template_key × entry_source
  "acquisition", // sessionSource / sessionMedium / sessionCampaignName
  "key_events", // 가입/충전 key event × sourceMedium
  "promo_performance", // promo event × slot/creative/campaign/variant
  "audience_profile", // country × language × deviceCategory × browser (R-118)
] as const;
export type MarketingGaReportKey = (typeof MARKETING_GA_REPORT_KEYS)[number];

export interface IMarketingGaSnapshotDocument extends Document {
  snapshotId: string; // `${universeId}:${propertyId}:${reportKey}:${date}:${dimensionHash}`
  universeId: string;
  propertyId: string;
  reportKey: MarketingGaReportKey;
  date: string; // YYYY-MM-DD (GA 리포트 기준일)
  dimensions: UnknownRecord;
  metrics: UnknownRecord;
  collectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingGaSnapshotSchema = new Schema<IMarketingGaSnapshotDocument>(
  {
    snapshotId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    propertyId: { type: String, required: true, index: true },
    reportKey: { type: String, enum: MARKETING_GA_REPORT_KEYS, required: true, index: true },
    date: { type: String, required: true, index: true },
    dimensions: { type: Schema.Types.Mixed, default: {} },
    metrics: { type: Schema.Types.Mixed, default: {} },
    collectedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "marketing_ga_snapshots" },
);

MarketingGaSnapshotSchema.index({ universeId: 1, reportKey: 1, date: -1 });
