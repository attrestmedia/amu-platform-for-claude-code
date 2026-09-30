import { Schema, Document } from "mongoose";
import { DEFAULT_ANCHOR_KEYWORD, type MarketingKeywordClusterScope } from "consts/marketing/keywordCluster";

/**
 * @docHint
 * @purpose 네이버 키워드 전략 설정/프로필/클러스터 원장 스키마 — 기본 앵커 + 동적 클러스터 + 후보 비교 원장
 * @process universe 설정 1문서 + 클러스터 원장(seed 부트스트랩) + 프로필 다문서 관리(soft delete)
 * @domain marketing
 * @scope server
 */

// universe당 1문서: 전역 기본값
export interface IMarketingKeywordSettingsDocument extends Document {
  universeId: string;
  defaultAnchorKeyword: string;
  defaultLookbackDays: number;
  defaultTimeUnit: "date" | "week" | "month";
  defaultDevice: "all" | "pc" | "mo";
  marketingCriteria: {
    goal: string;
    targetPersona: string;
    funnel: "TOFU" | "MOFU" | "BOFU" | "mixed";
    primaryConversion: string;
    coreMessage: string;
    requiredTopics: string[];
    excludedTopics: string[];
    channelGuidance: Record<string, string>;
    uploadPolicy: Record<string, unknown>;
    version: number;
  };
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingKeywordSettingsSchema = new Schema<IMarketingKeywordSettingsDocument>(
  {
    universeId: { type: String, required: true, unique: true, index: true },
    defaultAnchorKeyword: { type: String, default: DEFAULT_ANCHOR_KEYWORD },
    defaultLookbackDays: { type: Number, default: 90, min: 7, max: 730 },
    defaultTimeUnit: { type: String, enum: ["date", "week", "month"], default: "month" },
    defaultDevice: { type: String, enum: ["all", "pc", "mo"], default: "all" },
    marketingCriteria: {
      goal: { type: String, default: "", maxlength: 1000 },
      targetPersona: { type: String, default: "", maxlength: 1000 },
      funnel: { type: String, enum: ["TOFU", "MOFU", "BOFU", "mixed"], default: "mixed" },
      primaryConversion: { type: String, default: "", maxlength: 500 },
      coreMessage: { type: String, default: "", maxlength: 2000 },
      requiredTopics: { type: [String], default: [] },
      excludedTopics: { type: [String], default: [] },
      channelGuidance: { type: Schema.Types.Mixed, default: {} },
      uploadPolicy: { type: Schema.Types.Mixed, default: {} },
      version: { type: Number, default: 0, min: 0 },
    },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "marketing_keyword_settings" },
);

// 클러스터 원장 — 고정 enum 대체. seed는 최초 조회 시 부트스트랩(lazy seeding).
export interface IMarketingKeywordClusterDocument extends Document {
  clusterId: string;
  universeId: string;
  clusterKey: string;
  clusterScope: MarketingKeywordClusterScope;
  label: { ko: string; en: string };
  description?: { ko: string; en: string };
  sortOrder: number;
  enabled: boolean;
  status: "active" | "deprecated";
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingKeywordClusterSchema = new Schema<IMarketingKeywordClusterDocument>(
  {
    clusterId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    clusterKey: { type: String, required: true, index: true },
    clusterScope: { type: String, enum: ["strategy", "topic"], default: "strategy", index: true },
    label: {
      ko: { type: String, required: true },
      en: { type: String, default: "" },
    },
    description: {
      ko: { type: String, default: "" },
      en: { type: String, default: "" },
    },
    sortOrder: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true, index: true },
    status: { type: String, enum: ["active", "deprecated"], default: "active", index: true },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "marketing_keyword_clusters" },
);

MarketingKeywordClusterSchema.index({ universeId: 1, clusterKey: 1 }, { unique: true });
MarketingKeywordClusterSchema.index({ universeId: 1, clusterScope: 1, enabled: 1, sortOrder: 1 });

// 클러스터/캠페인 단위 프로필 — clusterKey는 원장 참조(동적 키)
export interface IMarketingKeywordProfileDocument extends Document {
  profileId: string;
  universeId: string;
  ownerScope: "global" | "universe";
  profileKey: string;
  name: string;
  clusterKey: string;
  clusterScope: MarketingKeywordClusterScope;
  anchorKeyword?: string;
  anchorChangedAt?: Date;
  seedKeywords: string[];
  negativeKeywords: string[];
  selectedKeyword?: string;
  selectedReason?: string;
  targetPersona?: string;
  campaignId?: string;
  note?: string;
  enabled: boolean;
  status: "active" | "deprecated";
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingKeywordProfileSchema = new Schema<IMarketingKeywordProfileDocument>(
  {
    profileId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    ownerScope: { type: String, enum: ["global", "universe"], default: "universe", index: true },
    profileKey: { type: String, required: true, index: true },
    name: { type: String, required: true },
    clusterKey: { type: String, default: "ai-image", index: true },
    clusterScope: { type: String, enum: ["strategy", "topic"], default: "strategy", index: true },
    anchorKeyword: { type: String, default: "" },
    anchorChangedAt: { type: Date },
    seedKeywords: { type: [String], default: [] },
    negativeKeywords: { type: [String], default: [] },
    selectedKeyword: { type: String, default: "" },
    selectedReason: { type: String, default: "" },
    targetPersona: { type: String, default: "" },
    campaignId: { type: String, default: "", index: true },
    note: { type: String, default: "" },
    enabled: { type: Boolean, default: true, index: true },
    status: { type: String, enum: ["active", "deprecated"], default: "active", index: true },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "marketing_keyword_profiles" },
);

MarketingKeywordProfileSchema.index({ universeId: 1, profileKey: 1 }, { unique: true });
MarketingKeywordProfileSchema.index({ universeId: 1, clusterKey: 1, enabled: 1, updatedAt: -1 });
