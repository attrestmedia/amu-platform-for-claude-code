import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 네이버 데이터랩 검색어트렌드/쇼핑인사이트 원시 시계열 스냅샷 저장 모델
 * @process 트렌드 조회 시 snapshotId 멱등 키로 upsert하고, 최근 스냅샷은 캐시로 재사용
 * @domain marketing
 * @scope server
 */

export const MARKETING_NAVER_SNAPSHOT_KINDS = ["search_trend", "shopping_category", "shopping_keyword"] as const;
export type MarketingNaverSnapshotKind = (typeof MARKETING_NAVER_SNAPSHOT_KINDS)[number];

export interface IMarketingNaverTrendSnapshotDocument extends Document {
  snapshotId: string; // `${universeId}:${kind}:${subjectKey}:${timeUnit}:${startDate}:${endDate}:${anchorHash}`
  universeId: string;
  kind: MarketingNaverSnapshotKind;
  subjectKey: string; // 키워드 또는 cat_id
  timeUnit: string;
  startDate: string;
  endDate: string;
  anchorKeyword?: string;
  series: Array<{ period: string; ratio: number }>;
  summary?: UnknownRecord; // anchorIndex, momentum, seasonality 등
  meta?: UnknownRecord;
  collectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingNaverTrendSnapshotSchema = new Schema<IMarketingNaverTrendSnapshotDocument>(
  {
    snapshotId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    kind: { type: String, enum: MARKETING_NAVER_SNAPSHOT_KINDS, required: true, index: true },
    subjectKey: { type: String, required: true, index: true },
    timeUnit: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    anchorKeyword: { type: String },
    series: { type: [{ period: String, ratio: Number }], default: [] },
    summary: { type: Schema.Types.Mixed, default: {} },
    meta: { type: Schema.Types.Mixed, default: {} },
    collectedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "marketing_naver_trend_snapshots" },
);

MarketingNaverTrendSnapshotSchema.index({ universeId: 1, kind: 1, subjectKey: 1, collectedAt: -1 });
