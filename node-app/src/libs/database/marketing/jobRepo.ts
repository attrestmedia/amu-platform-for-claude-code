import "server-only";
import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingAssetSchema,
  MarketingJobSchema,
  MarketingJobStepSchema,
  type IMarketingAssetDocument,
  type IMarketingJobDocument,
  type IMarketingJobStepDocument,
} from "models/marketing";
import type {
  MarketingAssetState,
  MarketingChannel,
  MarketingJobPriority,
  MarketingJobSource,
  MarketingJobStatus,
  MarketingStepStatus,
  MarketingStepType,
} from "consts/marketing/queue";
import { MARKETING_ACTIVE_JOB_STATUS } from "consts/marketing/queue";
import { normalizeMarketingQueueCategory } from "libs/marketing/queue/categoryConfig";

const JOB_COLLECTION = "marketing_jobs";
const STEP_COLLECTION = "marketing_job_steps";
const ASSET_COLLECTION = "marketing_assets";

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createMarketingAssetId() {
  return makeId("marketing_asset");
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toDateOrNull(value?: string | Date | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function normalizeStringArray(values?: string[]) {
  return Array.from(new Set((values || []).map((value) => toSafeString(value)).filter(Boolean)));
}

function dateOrIsoAtMost(path: string, date: Date) {
  return {
    $or: [
      { [path]: { $type: "date", $lte: date } },
      { [path]: { $type: "string", $lte: date.toISOString() } },
    ],
  };
}

function nullableDateOrIsoAtMost(path: string, date: Date) {
  return {
    $or: [
      { [path]: null },
      { [path]: "" },
      { [path]: { $exists: false } },
      { [path]: { $type: "date", $lte: date } },
      { [path]: { $type: "string", $lte: date.toISOString() } },
    ],
  };
}

async function getMarketingJobModel() {
  return await getModel<IMarketingJobDocument>(MONGODB_MARKETING_URL, "MarketingJob", MarketingJobSchema, JOB_COLLECTION);
}

async function getMarketingJobStepModel() {
  return await getModel<IMarketingJobStepDocument>(
    MONGODB_MARKETING_URL,
    "MarketingJobStep",
    MarketingJobStepSchema,
    STEP_COLLECTION,
  );
}

async function getMarketingAssetModel() {
  return await getModel<IMarketingAssetDocument>(MONGODB_MARKETING_URL, "MarketingAsset", MarketingAssetSchema, ASSET_COLLECTION);
}

export async function createMarketingJob(input: {
  universeId: string;
  source: MarketingJobSource;
  sourceRef?: Record<string, unknown>;
  status?: MarketingJobStatus;
  priority?: MarketingJobPriority;
  queueCategory?: string;
  channels?: MarketingChannel[];
  currentStepKey?: string;
  dedupeKey?: string;
  idempotencyKey?: string;
  requestedBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  scheduledAt?: string | Date | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  canceledAt?: string | Date | null;
  canceledBy?: string;
  archivedAt?: string | Date | null;
  archivedBy?: string;
  dryRun?: boolean;
  request?: Record<string, unknown>;
  featureFlags?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  lastError?: Record<string, unknown> | null;
}) {
  const model = await getMarketingJobModel();
  const doc = await model.create({
    jobId: makeId("marketing_job"),
    scope: "universe",
    universeId: toSafeString(input.universeId),
    source: input.source,
    sourceRef: input.sourceRef || {},
    status: input.status || "queued",
    priority: input.priority || "normal",
    queueCategory: normalizeMarketingQueueCategory(input.queueCategory),
    channels: normalizeStringArray(input.channels) as MarketingChannel[],
    currentStepKey: toSafeString(input.currentStepKey),
    dedupeKey: toSafeString(input.dedupeKey),
    ...(toSafeString(input.idempotencyKey) ? { idempotencyKey: toSafeString(input.idempotencyKey) } : {}),
    requestedBy: toSafeString(input.requestedBy),
    reviewedBy: toSafeString(input.reviewedBy),
    approvedBy: toSafeString(input.approvedBy),
    scheduledAt: toDateOrNull(input.scheduledAt),
    startedAt: toDateOrNull(input.startedAt),
    completedAt: toDateOrNull(input.completedAt),
    canceledAt: toDateOrNull(input.canceledAt),
    canceledBy: toSafeString(input.canceledBy),
    archivedAt: toDateOrNull(input.archivedAt),
    archivedBy: toSafeString(input.archivedBy),
    dryRun: typeof input.dryRun === "boolean" ? input.dryRun : true,
    request: input.request || {},
    featureFlags: input.featureFlags || {},
    metrics: input.metrics || {},
    lastError: input.lastError || null,
  });

  return (doc.toObject?.() ?? doc) as IMarketingJobDocument;
}

export async function getMarketingJobByJobId(jobId: string) {
  const model = await getMarketingJobModel();
  return await model.findOne({ jobId: toSafeString(jobId) }).lean();
}

export async function findMarketingJobByIdempotencyKey(args: { universeId: string; idempotencyKey: string }) {
  const universeId = toSafeString(args.universeId);
  const idempotencyKey = toSafeString(args.idempotencyKey);
  if (!universeId || !idempotencyKey) return null;
  const model = await getMarketingJobModel();
  return await model.findOne({ universeId, idempotencyKey }).lean();
}

export async function findActiveMarketingJobByDedupeKey(args: { universeId: string; dedupeKey: string; excludeJobId?: string }) {
  const model = await getMarketingJobModel();
  const cond: Record<string, unknown> = {
    universeId: toSafeString(args.universeId),
    dedupeKey: toSafeString(args.dedupeKey),
    status: { $in: ["queued", "ready", "running", "waiting_review", "approved"] },
  };

  const excludeJobId = toSafeString(args.excludeJobId);
  if (excludeJobId) {
    cond.jobId = { $ne: excludeJobId };
  }

  return await model.findOne(cond).sort({ createdAt: -1 }).lean();
}

export async function updateMarketingJob(args: {
  jobId: string;
  set?: Record<string, unknown>;
  unset?: Record<string, unknown>;
}) {
  const model = await getMarketingJobModel();
  const update: Record<string, unknown> = {
    $set: {
      ...(args.set || {}),
      updatedAt: new Date(),
    },
  };

  if (args.unset && Object.keys(args.unset).length > 0) {
    update.$unset = args.unset;
  }

  return await model.findOneAndUpdate({ jobId: toSafeString(args.jobId) }, update, { new: true }).lean();
}

export async function listMarketingJobsByJobIds(jobIds: string[]) {
  const ids = Array.from(new Set(jobIds.map(toSafeString).filter(Boolean)));
  if (ids.length === 0) return [];
  const model = await getMarketingJobModel();
  return await model.find({ jobId: { $in: ids } }).lean();
}

/**
 * 채널별 추천 업로드 슬롯을 job에 고정한다.
 * 이미 배정된 채널은 건드리지 않는다 — 추천은 "지금 계산한 값"이 아니라 "처음 배정된 값"이어야 한다.
 */
export async function appendMarketingJobUploadRecommendations(args: {
  jobId: string;
  recommendations: Array<{
    channel: string;
    date: string;
    recommendedHour: number;
    hourSource: "topic_performance" | "channel_performance" | "benchmark";
    hourScore: number;
    topicClass: string;
    policyVersion: number;
  }>;
}) {
  const jobId = toSafeString(args.jobId);
  const recommendations = args.recommendations.filter((item) => toSafeString(item.channel) && toSafeString(item.date));
  if (!jobId || recommendations.length === 0) return null;

  const model = await getMarketingJobModel();
  const assignedAt = new Date();
  // $ne 조건으로 동시 요청이 같은 채널을 두 번 배정하지 못하게 막는다(read-modify-write 경합 방지).
  for (const item of recommendations) {
    await model.updateOne(
      { jobId, "uploadRecommendations.channel": { $ne: item.channel } },
      {
        $push: {
          uploadRecommendations: {
            channel: item.channel,
            date: item.date,
            recommendedHour: item.recommendedHour,
            hourSource: item.hourSource,
            hourScore: item.hourScore,
            topicClass: item.topicClass,
            policyVersion: item.policyVersion,
            assignedAt,
          },
        },
      },
    );
  }

  return await model.findOne({ jobId }).lean();
}

export async function updateMarketingJobStatus(args: {
  jobId: string;
  status: MarketingJobStatus;
  currentStepKey?: string;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  lastError?: Record<string, unknown> | null;
  metrics?: Record<string, unknown>;
}) {
  const nextSet: Record<string, unknown> = {
    status: args.status,
  };

  if (typeof args.currentStepKey !== "undefined") nextSet.currentStepKey = toSafeString(args.currentStepKey);
  if (typeof args.startedAt !== "undefined") nextSet.startedAt = toDateOrNull(args.startedAt);
  if (typeof args.completedAt !== "undefined") nextSet.completedAt = toDateOrNull(args.completedAt);
  if (typeof args.lastError !== "undefined") nextSet.lastError = args.lastError;
  if (typeof args.metrics !== "undefined") nextSet.metrics = args.metrics || {};

  return await updateMarketingJob({ jobId: args.jobId, set: nextSet });
}

export async function listMarketingJobs(params: {
  universeId?: string;
  universeIds?: string[];
  status?: MarketingJobStatus | MarketingJobStatus[];
  source?: MarketingJobSource | MarketingJobSource[];
  priority?: MarketingJobPriority | MarketingJobPriority[];
  queueCategory?: string;
  channel?: MarketingChannel | MarketingChannel[];
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
}) {
  const model = await getMarketingJobModel();
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

  const statuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  if (statuses.length > 0) cond.status = { $in: statuses };

  const sources = Array.isArray(params.source) ? params.source : params.source ? [params.source] : [];
  if (sources.length > 0) cond.source = { $in: sources };

  const priorities = Array.isArray(params.priority) ? params.priority : params.priority ? [params.priority] : [];
  if (priorities.length > 0) cond.priority = { $in: priorities };

  const queueCategory = params.queueCategory ? normalizeMarketingQueueCategory(params.queueCategory) : "";
  if (queueCategory) cond.queueCategory = queueCategory;

  const channels = Array.isArray(params.channel) ? params.channel : params.channel ? [params.channel] : [];
  if (channels.length > 0) cond.channels = { $in: channels };

  const dateFrom = toDateOrNull(params.dateFrom);
  const dateTo = toDateOrNull(params.dateTo);
  if (dateFrom || dateTo) {
    const createdAt: { $gte?: Date; $lte?: Date } = {};
    if (dateFrom) createdAt.$gte = dateFrom;
    if (dateTo) createdAt.$lte = dateTo;
    cond.createdAt = createdAt;
  }

  if (!params.includeArchived) {
    cond.$or = [{ archivedAt: null }, { archivedAt: { $exists: false } }];
  }

  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.max(1, Math.min(100, Number(params.limit || 20)));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    model.find(cond).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(cond),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function createMarketingJobStep(input: {
  jobId: string;
  universeId: string;
  stepKey: MarketingStepType;
  status?: MarketingStepStatus;
  channel?: MarketingChannel | "";
  attempt?: number;
  workerId?: string;
  leaseExpiresAt?: string | Date | null;
  inputRef?: Record<string, unknown>;
  outputRef?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  lastError?: Record<string, unknown> | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
}) {
  const model = await getMarketingJobStepModel();
  const doc = await model.create({
    stepId: makeId("marketing_step"),
    jobId: toSafeString(input.jobId),
    universeId: toSafeString(input.universeId),
    stepKey: input.stepKey,
    status: input.status || "queued",
    channel: toSafeString(input.channel),
    attempt: Math.max(0, Number(input.attempt || 0)),
    workerId: toSafeString(input.workerId),
    leaseExpiresAt: toDateOrNull(input.leaseExpiresAt),
    inputRef: input.inputRef || {},
    outputRef: input.outputRef || {},
    meta: input.meta || {},
    lastError: input.lastError || null,
    startedAt: toDateOrNull(input.startedAt),
    completedAt: toDateOrNull(input.completedAt),
  });

  return (doc.toObject?.() ?? doc) as IMarketingJobStepDocument;
}

export async function updateMarketingJobStep(args: {
  stepId: string;
  set?: Record<string, unknown>;
  unset?: Record<string, unknown>;
}) {
  const model = await getMarketingJobStepModel();
  const update: Record<string, unknown> = {
    $set: {
      ...(args.set || {}),
      updatedAt: new Date(),
    },
  };

  if (args.unset && Object.keys(args.unset).length > 0) {
    update.$unset = args.unset;
  }

  return await model.findOneAndUpdate({ stepId: toSafeString(args.stepId) }, update, { new: true }).lean();
}

export async function updateMarketingJobStepStatus(args: {
  stepId: string;
  status: MarketingStepStatus;
  expectedStatus?: MarketingStepStatus | MarketingStepStatus[];
  workerId?: string;
  leaseExpiresAt?: string | Date | null;
  outputRef?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  lastError?: Record<string, unknown> | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  attempt?: number;
}) {
  const nextSet: Record<string, unknown> = {
    status: args.status,
  };

  if (typeof args.workerId !== "undefined") nextSet.workerId = toSafeString(args.workerId);
  if (typeof args.leaseExpiresAt !== "undefined") nextSet.leaseExpiresAt = toDateOrNull(args.leaseExpiresAt);
  if (typeof args.outputRef !== "undefined") nextSet.outputRef = args.outputRef || {};
  if (typeof args.meta !== "undefined") nextSet.meta = args.meta || {};
  if (typeof args.lastError !== "undefined") nextSet.lastError = args.lastError;
  if (typeof args.startedAt !== "undefined") nextSet.startedAt = toDateOrNull(args.startedAt);
  if (typeof args.completedAt !== "undefined") nextSet.completedAt = toDateOrNull(args.completedAt);
  if (typeof args.attempt !== "undefined") nextSet.attempt = Math.max(0, Number(args.attempt || 0));

  const expectedStatuses = Array.isArray(args.expectedStatus)
    ? args.expectedStatus
    : args.expectedStatus
      ? [args.expectedStatus]
      : [];

  if (expectedStatuses.length === 0) {
    return await updateMarketingJobStep({ stepId: args.stepId, set: nextSet });
  }

  const model = await getMarketingJobStepModel();
  return await model
    .findOneAndUpdate(
      {
        stepId: toSafeString(args.stepId),
        status: { $in: expectedStatuses },
      },
      {
        $set: {
          ...nextSet,
          updatedAt: new Date(),
        },
      },
      { new: true },
    )
    .lean();
}

export async function listMarketingJobSteps(params: {
  jobId?: string;
  jobIds?: string[];
  universeId?: string;
  status?: MarketingStepStatus | MarketingStepStatus[];
  channel?: MarketingChannel | MarketingChannel[];
  scheduledPublishBefore?: string | Date;
  limit?: number;
}) {
  const model = await getMarketingJobStepModel();
  const cond: Record<string, unknown> = {};

  const jobId = toSafeString(params.jobId);
  const jobIds = Array.from(new Set((params.jobIds || []).map((value) => toSafeString(value)).filter(Boolean)));
  if (jobIds.length > 0) {
    cond.jobId = { $in: jobIds };
  } else if (jobId) {
    cond.jobId = jobId;
  }

  const universeId = toSafeString(params.universeId);
  if (universeId) cond.universeId = universeId;

  const statuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  if (statuses.length > 0) cond.status = { $in: statuses };

  const channels = Array.isArray(params.channel) ? params.channel : params.channel ? [params.channel] : [];
  if (channels.length > 0) cond.channel = { $in: channels };

  const scheduledPublishBefore = toDateOrNull(params.scheduledPublishBefore);
  if (scheduledPublishBefore) cond["meta.scheduledPublishAt"] = { $lte: scheduledPublishBefore.toISOString() };

  const limit = Math.max(1, Math.min(2000, Number(params.limit || 100)));
  const sort: [string, "asc"][] = scheduledPublishBefore
    ? [
        ["meta.scheduledPublishAt", "asc"],
        ["createdAt", "asc"],
      ]
    : [["createdAt", "asc"]];
  return await model.find(cond).sort(sort).limit(limit).lean();
}

export async function getMarketingJobStepByStepId(stepId: string) {
  const model = await getMarketingJobStepModel();
  return await model.findOne({ stepId: toSafeString(stepId) }).lean();
}

export async function createMarketingAsset(input: {
  assetId?: string;
  jobId: string;
  universeId: string;
  kind: string;
  stepId?: string;
  channel?: MarketingChannel | "";
  title?: string;
  mimeType?: string;
  state?: MarketingAssetState;
  content?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}) {
  const model = await getMarketingAssetModel();
  const doc = await model.create({
    assetId: toSafeString(input.assetId) || createMarketingAssetId(),
    jobId: toSafeString(input.jobId),
    stepId: toSafeString(input.stepId),
    universeId: toSafeString(input.universeId),
    kind: toSafeString(input.kind),
    channel: toSafeString(input.channel),
    title: toSafeString(input.title),
    mimeType: toSafeString(input.mimeType),
    state: input.state || "active",
    content: input.content || {},
    meta: input.meta || {},
  });

  return (doc.toObject?.() ?? doc) as IMarketingAssetDocument;
}

export async function updateMarketingAsset(args: {
  assetId: string;
  set?: Record<string, unknown>;
  unset?: Record<string, unknown>;
}) {
  const model = await getMarketingAssetModel();
  const update: Record<string, unknown> = {
    $set: {
      ...(args.set || {}),
      updatedAt: new Date(),
    },
  };

  if (args.unset && Object.keys(args.unset).length > 0) {
    update.$unset = args.unset;
  }

  return await model.findOneAndUpdate({ assetId: toSafeString(args.assetId) }, update, { new: true }).lean();
}

export async function listMarketingAssets(params: {
  universeId?: string;
  assetIds?: string[];
  jobId?: string;
  stepId?: string;
  kind?: string;
  channel?: MarketingChannel | MarketingChannel[];
  state?: MarketingAssetState | MarketingAssetState[];
  beforeCreatedAt?: string | Date | null;
  beforeAssetId?: string;
  limit?: number;
}) {
  const model = await getMarketingAssetModel();
  const cond: Record<string, unknown> = {};

  const universeId = toSafeString(params.universeId);
  if (universeId) cond.universeId = universeId;

  const assetIds = Array.from(new Set((params.assetIds || []).map(toSafeString).filter(Boolean)));
  if (assetIds.length > 0) cond.assetId = { $in: assetIds };

  const jobId = toSafeString(params.jobId);
  if (jobId) cond.jobId = jobId;

  const stepId = toSafeString(params.stepId);
  if (stepId) cond.stepId = stepId;

  const kind = toSafeString(params.kind);
  if (kind) cond.kind = kind;

  const channels = Array.isArray(params.channel) ? params.channel : params.channel ? [params.channel] : [];
  if (channels.length > 0) cond.channel = { $in: channels };

  const states = Array.isArray(params.state) ? params.state : params.state ? [params.state] : [];
  if (states.length > 0) cond.state = { $in: states };

  const beforeCreatedAt = toDateOrNull(params.beforeCreatedAt);
  const beforeAssetId = toSafeString(params.beforeAssetId);
  if (beforeCreatedAt && beforeAssetId) {
    cond.$or = [
      { createdAt: { $lt: beforeCreatedAt } },
      { createdAt: beforeCreatedAt, assetId: { $lt: beforeAssetId } },
    ];
  }

  const limit = Math.max(1, Math.min(200, Number(params.limit || 100)));
  return await model.find(cond).sort({ createdAt: -1, assetId: -1 }).limit(limit).lean();
}

export async function updateMarketingAssetsByIds(args: {
  universeId: string;
  assetIds: string[];
  kind?: string;
  state?: MarketingAssetState;
  set?: Record<string, unknown>;
  max?: Record<string, unknown>;
}) {
  const model = await getMarketingAssetModel();
  const assetIds = Array.from(new Set((args.assetIds || []).map(toSafeString).filter(Boolean)));
  if (!assetIds.length) return { matchedCount: 0, modifiedCount: 0 };

  const cond: Record<string, unknown> = {
    universeId: toSafeString(args.universeId),
    assetId: { $in: assetIds },
  };
  const kind = toSafeString(args.kind);
  if (kind) cond.kind = kind;
  if (args.state) cond.state = args.state;

  const update: Record<string, unknown> = {};
  if (args.set && Object.keys(args.set).length > 0) update.$set = { ...args.set, updatedAt: new Date() };
  if (args.max && Object.keys(args.max).length > 0) update.$max = args.max;
  if (!Object.keys(update).length) return { matchedCount: 0, modifiedCount: 0 };

  return await model.updateMany(cond, update);
}

export async function listExpiredMarketingAssets(args: { kind: string; now: Date; limit?: number }) {
  const model = await getMarketingAssetModel();
  const leaseAvailable = nullableDateOrIsoAtMost("meta.cleanupLeaseExpiresAt", args.now);
  const cond = {
    kind: toSafeString(args.kind),
    "content.retentionMode": "temporary",
    $and: [
      dateOrIsoAtMost("content.expiresAt", args.now),
      nullableDateOrIsoAtMost("content.protectedUntil", args.now),
      {
        $or: [
          { $and: [{ state: "active" }, leaseAvailable] },
          {
            $and: [
              { state: "archived" },
              { "meta.cleanupLeaseToken": { $type: "string", $ne: "" } },
              leaseAvailable,
            ],
          },
        ],
      },
    ],
  };
  const limit = Math.max(1, Math.min(100, Number(args.limit || 50)));
  return await model.find(cond).sort({ "content.expiresAt": 1, createdAt: 1 }).limit(limit).lean();
}

export async function claimExpiredMarketingAsset(args: {
  assetId: string;
  kind: string;
  now: Date;
  leaseToken: string;
  leaseExpiresAt: Date;
}) {
  const model = await getMarketingAssetModel();
  const leaseAvailable = nullableDateOrIsoAtMost("meta.cleanupLeaseExpiresAt", args.now);
  return await model
    .findOneAndUpdate(
      {
        assetId: toSafeString(args.assetId),
        kind: toSafeString(args.kind),
        "content.retentionMode": "temporary",
        $and: [
          dateOrIsoAtMost("content.expiresAt", args.now),
          nullableDateOrIsoAtMost("content.protectedUntil", args.now),
          {
            $or: [
              { $and: [{ state: "active" }, leaseAvailable] },
              {
                $and: [
                  { state: "archived" },
                  { "meta.cleanupLeaseToken": { $type: "string", $ne: "" } },
                  leaseAvailable,
                ],
              },
            ],
          },
        ],
      },
      {
        $set: {
          state: "archived",
          "meta.cleanupLeaseToken": toSafeString(args.leaseToken),
          "meta.cleanupLeaseClaimedAt": args.now.toISOString(),
          "meta.cleanupLeaseExpiresAt": args.leaseExpiresAt.toISOString(),
          updatedAt: new Date(),
        },
        $inc: { "meta.cleanupAttempts": 1 },
      },
      { new: true },
    )
    .lean();
}

export async function hasActiveMarketingAssetReference(args: { assetId: string }) {
  const assetId = toSafeString(args.assetId);
  if (!assetId) return false;

  const assetModel = await getMarketingAssetModel();
  const referencedJobIds = await assetModel.distinct("jobId", {
      kind: { $in: ["channel_draft", "channel_image"] },
      state: "active",
      "content.marketingUploadAssetIds": assetId,
    });
  const jobIds = normalizeStringArray(referencedJobIds);
  if (!jobIds.length) return false;

  const jobModel = await getMarketingJobModel();
  return Boolean(
    await jobModel.exists({
      jobId: { $in: jobIds },
      status: { $in: MARKETING_ACTIVE_JOB_STATUS },
    }),
  );
}

export async function completeMarketingAssetCleanup(args: {
  assetId: string;
  leaseToken: string;
  completedAt: Date;
  reason: string;
}) {
  const model = await getMarketingAssetModel();
  const completedAt = args.completedAt.toISOString();
  return await model
    .findOneAndUpdate(
      {
        assetId: toSafeString(args.assetId),
        state: "archived",
        "meta.cleanupLeaseToken": toSafeString(args.leaseToken),
      },
      {
        $set: {
          state: "deleted",
          "content.hardDeletedAt": completedAt,
          "meta.deleteReason": toSafeString(args.reason),
          "meta.cleanupCompletedAt": completedAt,
          "meta.cleanupObjectDeleted": true,
          "meta.cleanupRegistryUpdated": true,
          updatedAt: new Date(),
        },
        $unset: {
          "meta.cleanupLeaseToken": "",
          "meta.cleanupLeaseClaimedAt": "",
          "meta.cleanupLeaseExpiresAt": "",
          "meta.cleanupLastError": "",
        },
      },
      { new: true },
    )
    .lean();
}

export async function releaseMarketingAssetCleanup(args: {
  assetId: string;
  leaseToken: string;
  releasedAt: Date;
  error: string;
}) {
  const model = await getMarketingAssetModel();
  return await model
    .findOneAndUpdate(
      {
        assetId: toSafeString(args.assetId),
        state: "archived",
        "meta.cleanupLeaseToken": toSafeString(args.leaseToken),
      },
      {
        $set: {
          state: "active",
          "meta.cleanupLastFailedAt": args.releasedAt.toISOString(),
          "meta.cleanupLastError": toSafeString(args.error).slice(0, 500),
          updatedAt: new Date(),
        },
        $unset: {
          "meta.cleanupLeaseToken": "",
          "meta.cleanupLeaseClaimedAt": "",
          "meta.cleanupLeaseExpiresAt": "",
        },
      },
      { new: true },
    )
    .lean();
}
