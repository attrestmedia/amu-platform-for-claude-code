import "server-only";
import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingKeywordCandidateSchema,
  MarketingCollectRunSchema,
  MarketingPerformanceDailySchema,
  MarketingPublishLogSchema,
  type IMarketingCollectRunDocument,
  type IMarketingKeywordCandidateDocument,
  type IMarketingPerformanceDailyDocument,
  type IMarketingPublishLogDocument,
} from "models/marketing";
import type { MarketingChannel, MarketingKeywordStatus, MarketingPerformanceEntityType, MarketingPublishStatus } from "consts/marketing/queue";

const PUBLISH_LOG_COLLECTION = "marketing_publish_logs";
const KEYWORD_COLLECTION = "marketing_keyword_candidates";
const PERFORMANCE_COLLECTION = "marketing_performance_daily";
const COLLECT_RUN_COLLECTION = "marketing_collect_runs";

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toDateOrNull(value?: string | Date | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

async function getMarketingPublishLogModel() {
  return await getModel<IMarketingPublishLogDocument>(
    MONGODB_MARKETING_URL,
    "MarketingPublishLog",
    MarketingPublishLogSchema,
    PUBLISH_LOG_COLLECTION,
  );
}

async function getMarketingKeywordCandidateModel() {
  return await getModel<IMarketingKeywordCandidateDocument>(
    MONGODB_MARKETING_URL,
    "MarketingKeywordCandidate",
    MarketingKeywordCandidateSchema,
    KEYWORD_COLLECTION,
  );
}

async function getMarketingPerformanceDailyModel() {
  return await getModel<IMarketingPerformanceDailyDocument>(
    MONGODB_MARKETING_URL,
    "MarketingPerformanceDaily",
    MarketingPerformanceDailySchema,
    PERFORMANCE_COLLECTION,
  );
}

async function getMarketingCollectRunModel() {
  return await getModel<IMarketingCollectRunDocument>(
    MONGODB_MARKETING_URL,
    "MarketingCollectRun",
    MarketingCollectRunSchema,
    COLLECT_RUN_COLLECTION,
  );
}

export async function createMarketingPublishLog(input: {
  universeId: string;
  jobId: string;
  channel: MarketingChannel;
  stepId?: string;
  status?: MarketingPublishStatus;
  targetRef?: Record<string, unknown>;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  completedBy?: string;
  publishedAt?: string | Date | null;
  completedAt?: string | Date | null;
}) {
  const model = await getMarketingPublishLogModel();
  const doc = await model.create({
    publishLogId: makeId("marketing_publish"),
    universeId: toSafeString(input.universeId),
    jobId: toSafeString(input.jobId),
    stepId: toSafeString(input.stepId),
    channel: input.channel,
    status: input.status || "draft",
    targetRef: input.targetRef || {},
    request: input.request || {},
    response: input.response || {},
    completedBy: toSafeString(input.completedBy),
    publishedAt: toDateOrNull(input.publishedAt),
    completedAt: toDateOrNull(input.completedAt),
  });

  return (doc.toObject?.() ?? doc) as IMarketingPublishLogDocument;
}

export async function listMarketingPublishLogs(params: {
  universeId?: string;
  universeIds?: string[];
  jobId?: string;
  channel?: MarketingChannel | MarketingChannel[];
  status?: MarketingPublishStatus | MarketingPublishStatus[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  const model = await getMarketingPublishLogModel();
  const cond: Record<string, unknown> = {};

  const universeIds = Array.from(
    new Set((params.universeIds || []).map((value) => toSafeString(value)).filter(Boolean)),
  );
  const universeId = toSafeString(params.universeId);
  if (Array.isArray(params.universeIds)) {
    cond.universeId = { $in: universeIds };
  } else if (universeIds.length > 0) {
    cond.universeId = { $in: universeIds };
  } else if (universeId) {
    cond.universeId = universeId;
  }

  const jobId = toSafeString(params.jobId);
  if (jobId) cond.jobId = jobId;

  const channels = Array.isArray(params.channel) ? params.channel : params.channel ? [params.channel] : [];
  if (channels.length > 0) cond.channel = { $in: channels };

  const statuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  if (statuses.length > 0) cond.status = { $in: statuses };

  const dateFrom = toSafeString(params.dateFrom);
  const dateTo = toSafeString(params.dateTo);
  if (dateFrom || dateTo) {
    const range: { $gte?: Date | null; $lte?: Date | null } = {};
    if (dateFrom) range.$gte = toDateOrNull(dateFrom);
    if (dateTo) range.$lte = toDateOrNull(dateTo);
    cond.completedAt = range;
  }

  const limit = Math.max(1, Math.min(200, Number(params.limit || 100)));
  return await model.find(cond).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function createMarketingKeywordCandidate(input: {
  universeId: string;
  keyword: string;
  jobId?: string;
  sourceAssetId?: string;
  channel?: MarketingChannel | "";
  language?: string;
  score?: number;
  status?: MarketingKeywordStatus;
  metrics?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}) {
  const model = await getMarketingKeywordCandidateModel();
  const doc = await model.create({
    keywordId: makeId("marketing_keyword"),
    universeId: toSafeString(input.universeId),
    jobId: toSafeString(input.jobId),
    sourceAssetId: toSafeString(input.sourceAssetId),
    keyword: toSafeString(input.keyword),
    channel: toSafeString(input.channel),
    language: toSafeString(input.language) || "ko",
    score: Number(input.score || 0),
    status: input.status || "candidate",
    metrics: input.metrics || {},
    meta: input.meta || {},
  });

  return (doc.toObject?.() ?? doc) as IMarketingKeywordCandidateDocument;
}

export async function listMarketingKeywordCandidates(params: {
  universeId: string;
  jobId?: string;
  channel?: MarketingChannel | MarketingChannel[];
  status?: MarketingKeywordStatus | MarketingKeywordStatus[];
  limit?: number;
}) {
  const model = await getMarketingKeywordCandidateModel();
  const cond: Record<string, unknown> = {
    universeId: toSafeString(params.universeId),
  };

  const jobId = toSafeString(params.jobId);
  if (jobId) cond.jobId = jobId;

  const channels = Array.isArray(params.channel) ? params.channel : params.channel ? [params.channel] : [];
  if (channels.length > 0) cond.channel = { $in: channels };

  const statuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  if (statuses.length > 0) cond.status = { $in: statuses };

  const limit = Math.max(1, Math.min(200, Number(params.limit || 100)));
  return await model.find(cond).sort({ score: -1, createdAt: -1 }).limit(limit).lean();
}

export async function upsertMarketingPerformanceDaily(input: {
  universeId: string;
  channel: MarketingChannel;
  date: string;
  entityType: MarketingPerformanceEntityType;
  entityId: string;
  metrics?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}) {
  const model = await getMarketingPerformanceDailyModel();
  return await model
    .findOneAndUpdate(
      {
        universeId: toSafeString(input.universeId),
        channel: input.channel,
        date: toSafeString(input.date),
        entityType: input.entityType,
        entityId: toSafeString(input.entityId),
      },
      {
        $set: {
          metrics: input.metrics || {},
          meta: input.meta || {},
          updatedAt: new Date(),
        },
        $setOnInsert: {
          performanceId: makeId("marketing_perf"),
          universeId: toSafeString(input.universeId),
          channel: input.channel,
          date: toSafeString(input.date),
          entityType: input.entityType,
          entityId: toSafeString(input.entityId),
        },
      },
      { new: true, upsert: true },
    )
    .lean();
}

/**
 * 이벤트 수집기가 동일한 일별 원장 행의 카운터를 원자적으로 증가시킨다.
 * 지표 전체를 교체하는 upsertMarketingPerformanceDaily와 분리해 이벤트 유실을 막는다.
 */
export async function incrementMarketingPerformanceDaily(input: {
  universeId: string;
  channel: MarketingChannel;
  date: string;
  entityType: MarketingPerformanceEntityType;
  entityId: string;
  metric: string;
  amount?: number;
  meta?: Record<string, unknown>;
}) {
  const model = await getMarketingPerformanceDailyModel();
  const metric = toSafeString(input.metric);
  if (!metric || !/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(metric)) throw new Error("INVALID_MARKETING_METRIC");
  const amount = Number(input.amount ?? 1);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_MARKETING_METRIC_AMOUNT");
  const meta = input.meta
    ? {
        source: input.meta.source,
        metricBasis: input.meta.metricBasis,
        ...(input.meta.issueId ? { issueId: input.meta.issueId } : {}),
      }
    : undefined;
  return await model
    .findOneAndUpdate(
      {
        universeId: toSafeString(input.universeId),
        channel: input.channel,
        date: toSafeString(input.date),
        entityType: input.entityType,
        entityId: toSafeString(input.entityId),
      },
      {
        $inc: { [`metrics.${metric}`]: amount },
        ...(meta ? { $set: { meta } } : {}),
        $setOnInsert: {
          performanceId: makeId("marketing_perf"),
          universeId: toSafeString(input.universeId),
          channel: input.channel,
          date: toSafeString(input.date),
          entityType: input.entityType,
          entityId: toSafeString(input.entityId),
        },
      },
      { new: true, upsert: true },
    )
    .lean();
}

export async function listMarketingPerformanceDaily(params: {
  universeId: string;
  channel?: MarketingChannel | MarketingChannel[];
  entityType?: MarketingPerformanceEntityType | MarketingPerformanceEntityType[];
  entityId?: string;
  propertyKey?: string;
  propertyId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  const model = await getMarketingPerformanceDailyModel();
  const cond: Record<string, unknown> = {
    universeId: toSafeString(params.universeId),
  };

  const channels = Array.isArray(params.channel) ? params.channel : params.channel ? [params.channel] : [];
  if (channels.length > 0) cond.channel = { $in: channels };

  const entityTypes = Array.isArray(params.entityType) ? params.entityType : params.entityType ? [params.entityType] : [];
  if (entityTypes.length > 0) cond.entityType = { $in: entityTypes };

  const entityId = toSafeString(params.entityId);
  if (entityId) cond.entityId = entityId;

  const propertyKey = toSafeString(params.propertyKey);
  if (propertyKey) cond["meta.propertyKey"] = propertyKey;

  const propertyId = toSafeString(params.propertyId);
  if (propertyId) cond["meta.propertyId"] = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;

  const dateFrom = toSafeString(params.dateFrom);
  const dateTo = toSafeString(params.dateTo);
  if (dateFrom || dateTo) {
    const range: { $gte?: string; $lte?: string } = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    cond.date = range;
  }

  const limit = Math.max(1, Math.min(5000, Number(params.limit || 90)));
  const offset = Math.max(0, Math.min(50_000, Number(params.offset || 0)));
  return await model.find(cond).sort({ date: -1, createdAt: -1, _id: -1 }).skip(offset).limit(limit).lean();
}

/** Meta 삭제 요청으로 특정 유니버스들의 채널 유래 성과·발행 응답 데이터를 완전 삭제 */
export async function deleteMarketingChannelProviderData(args: {
  universeIds: string[];
  channel: MarketingChannel;
}) {
  const universeIds = Array.from(new Set(args.universeIds.map(toSafeString).filter(Boolean)));
  if (universeIds.length === 0) {
    return { performanceDeleted: 0, publishLogsDeleted: 0, collectRunsScrubbed: 0 };
  }

  const [performanceModel, publishLogModel, collectRunModel] = await Promise.all([
    getMarketingPerformanceDailyModel(),
    getMarketingPublishLogModel(),
    getMarketingCollectRunModel(),
  ]);
  const filter = { universeId: { $in: universeIds }, channel: args.channel };
  const [performance, publishLogs, collectRuns] = await Promise.all([
    performanceModel.deleteMany(filter),
    publishLogModel.deleteMany(filter),
    collectRunModel.updateMany(
      { universeId: { $in: universeIds }, "channelResults.channel": args.channel },
      { $pull: { channelResults: { channel: args.channel } } },
    ),
  ]);
  return {
    performanceDeleted: performance.deletedCount ?? 0,
    publishLogsDeleted: publishLogs.deletedCount ?? 0,
    collectRunsScrubbed: collectRuns.modifiedCount ?? 0,
  };
}
