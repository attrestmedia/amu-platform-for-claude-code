import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 소셜 성과 자동 수집 — universe별 수집 설정(단일 문서) + 수집 실행 기록(run) 스키마
 * @process 설정은 universe당 1문서 upsert / 실행 기록은 크론·수동·agent 트리거마다 1건 생성, TTL 180일 자동 정리
 * @domain marketing
 * @scope server
 */

export const MARKETING_COLLECT_RUN_KINDS = ["social_performance"] as const;
export type MarketingCollectRunKind = (typeof MARKETING_COLLECT_RUN_KINDS)[number];

export const MARKETING_COLLECT_RUN_TRIGGERS = ["cron", "manual", "agent"] as const;
export type MarketingCollectRunTrigger = (typeof MARKETING_COLLECT_RUN_TRIGGERS)[number];

// running: 백그라운드 수집 진행 중(응답은 이미 반환됨) / completed·failed: 종료 상태
export const MARKETING_COLLECT_RUN_STATUSES = ["running", "completed", "failed"] as const;
export type MarketingCollectRunStatus = (typeof MARKETING_COLLECT_RUN_STATUSES)[number];

// universe당 1문서: 소셜 성과 자동 수집 설정
export interface IMarketingSocialCollectSettingsDocument extends Document {
  universeId: string;
  enabled: boolean;
  channels: string[];
  rollingDays: number;
  weeklyDeepDays: number;
  linkedinVersion: string;
  linkedinMemberAnalyticsEnabled: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingSocialCollectSettingsSchema = new Schema<IMarketingSocialCollectSettingsDocument>(
  {
    universeId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false, index: true },
    channels: { type: [String], default: [] },
    rollingDays: { type: Number, default: 14, min: 1, max: 30 },
    weeklyDeepDays: { type: Number, default: 90, min: 0, max: 180 },
    // LinkedIn REST(versioned) API의 Linkedin-Version 헤더(YYYYMM) — 빈 값이면 코드 기본값 사용
    linkedinVersion: { type: String, default: "" },
    // Community Management 승인 후에만 켠다. true일 때 OAuth가 member analytics scope를 요청한다.
    linkedinMemberAnalyticsEnabled: { type: Boolean, default: false },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "marketing_social_collect_settings" },
);

// 수집 실행 기록: 트리거마다 1건
export interface IMarketingCollectRunDocument extends Document {
  runId: string;
  universeId: string;
  kind: MarketingCollectRunKind;
  trigger: MarketingCollectRunTrigger;
  status: MarketingCollectRunStatus;
  startedAt: Date;
  finishedAt?: Date;
  params?: UnknownRecord;
  result?: UnknownRecord;
  channelResults?: UnknownRecord[];
  tokenWarnings?: string[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingCollectRunSchema = new Schema<IMarketingCollectRunDocument>(
  {
    runId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    kind: { type: String, enum: MARKETING_COLLECT_RUN_KINDS, default: "social_performance", index: true },
    trigger: { type: String, enum: MARKETING_COLLECT_RUN_TRIGGERS, default: "manual", index: true },
    // 상태 필드가 없는 레거시 문서는 종료 시점에 생성된 기록이므로 completed로 간주한다.
    status: { type: String, enum: MARKETING_COLLECT_RUN_STATUSES, default: "completed", index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    params: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed, default: {} },
    channelResults: { type: [Schema.Types.Mixed], default: [] },
    tokenWarnings: { type: [String], default: [] },
    error: { type: String, default: "" },
  },
  { timestamps: true, collection: "marketing_collect_runs" },
);

MarketingCollectRunSchema.index({ universeId: 1, kind: 1, createdAt: -1 });
// 실행 기록 무한 증식 방지 — 180일 후 자동 삭제
MarketingCollectRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
