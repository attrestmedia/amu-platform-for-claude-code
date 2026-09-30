import { Schema, type Document } from "mongoose";
import {
  MARKETING_JOB_PRIORITY,
  MARKETING_JOB_SOURCE,
  MARKETING_JOB_STATUS,
  MARKETING_CHANNELS,
} from "consts/marketing/queue";
import type { MarketingChannel, MarketingJobPriority, MarketingJobSource, MarketingJobStatus } from "consts/marketing/queue";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * 검수 목록에 처음 올라온 시점에 확정되는 채널별 추천 업로드 슬롯.
 * 날짜가 지나도 재계산하지 않기 위해 job 문서에 고정 저장한다(추천은 조회 시점 상태가 아니라 배정 기록이다).
 */
export interface IMarketingJobUploadRecommendation {
  channel: string;
  date: string;
  recommendedHour: number;
  /** 시간대 결정 근거: 주제 성과 / 채널 성과 / 벤치마크 사전확률 */
  hourSource: "topic_performance" | "channel_performance" | "benchmark";
  hourScore: number;
  topicClass: string;
  policyVersion: number;
  assignedAt: Date;
}

export interface IMarketingJobDocument extends Document {
  jobId: string;
  scope: "universe";
  universeId: string;
  source: MarketingJobSource;
  sourceRef?: UnknownRecord;
  status: MarketingJobStatus;
  priority: MarketingJobPriority;
  queueCategory?: string;
  channels?: MarketingChannel[];
  currentStepKey?: string;
  dedupeKey?: string;
  idempotencyKey?: string;
  requestedBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  scheduledAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  canceledAt?: Date | null;
  canceledBy?: string;
  archivedAt?: Date | null;
  archivedBy?: string;
  dryRun?: boolean;
  request?: UnknownRecord;
  featureFlags?: UnknownRecord;
  metrics?: UnknownRecord;
  lastError?: UnknownRecord | null;
  uploadRecommendations?: IMarketingJobUploadRecommendation[];
  createdAt: Date;
  updatedAt: Date;
}

const MarketingJobUploadRecommendationSchema = new Schema<IMarketingJobUploadRecommendation>(
  {
    channel: { type: String, required: true },
    date: { type: String, required: true },
    recommendedHour: { type: Number, required: true, min: 0, max: 23 },
    hourSource: {
      type: String,
      enum: ["topic_performance", "channel_performance", "benchmark"],
      default: "benchmark",
    },
    hourScore: { type: Number, default: 0 },
    topicClass: { type: String, default: "general" },
    policyVersion: { type: Number, default: 1 },
    assignedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

export const MarketingJobSchema = new Schema<IMarketingJobDocument>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    scope: { type: String, enum: ["universe"], required: true, default: "universe", index: true },
    universeId: { type: String, required: true, index: true },
    source: { type: String, enum: MARKETING_JOB_SOURCE, required: true, default: "manual", index: true },
    sourceRef: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: MARKETING_JOB_STATUS, required: true, default: "queued", index: true },
    priority: { type: String, enum: MARKETING_JOB_PRIORITY, required: true, default: "normal", index: true },
    queueCategory: { type: String, default: "general", index: true },
    channels: { type: [String], enum: MARKETING_CHANNELS, default: [] },
    currentStepKey: { type: String, default: "", index: true },
    dedupeKey: { type: String, default: "", index: true },
    // Pattern 기반 Marketing Oops handoff만 값을 채운다. 기존 job은 sparse unique index에서 제외한다.
    idempotencyKey: { type: String, sparse: true, index: true },
    requestedBy: { type: String, default: "", index: true },
    reviewedBy: { type: String, default: "" },
    approvedBy: { type: String, default: "" },
    scheduledAt: { type: Date, default: null, index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null, index: true },
    canceledBy: { type: String, default: "" },
    archivedAt: { type: Date, default: null, index: true },
    archivedBy: { type: String, default: "" },
    dryRun: { type: Boolean, default: true, index: true },
    request: { type: Schema.Types.Mixed, default: {} },
    featureFlags: { type: Schema.Types.Mixed, default: {} },
    metrics: { type: Schema.Types.Mixed, default: {} },
    lastError: { type: Schema.Types.Mixed, default: null },
    // 한 번 배정되면 갱신하지 않는다. 정책 변경/채널 추가로 "없는 채널"이 생겼을 때만 추가 배정한다.
    uploadRecommendations: { type: [MarketingJobUploadRecommendationSchema], default: [] },
  },
  { timestamps: true, collection: "marketing_jobs" },
);

MarketingJobSchema.index({ universeId: 1, status: 1, createdAt: -1 });
MarketingJobSchema.index({ universeId: 1, source: 1, createdAt: -1 });
MarketingJobSchema.index({ universeId: 1, priority: 1, createdAt: -1 });
MarketingJobSchema.index({ universeId: 1, queueCategory: 1, status: 1, createdAt: -1 });
MarketingJobSchema.index({ universeId: 1, scheduledAt: 1, createdAt: -1 });
MarketingJobSchema.index({ universeId: 1, archivedAt: 1, createdAt: -1 });
MarketingJobSchema.index({ universeId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
