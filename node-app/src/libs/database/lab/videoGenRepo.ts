import "server-only";

import crypto from "node:crypto";
import { MONGODB_AI_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { getR2SignedGetUrl } from "libs/server-utils/storage/r2Storage";
import {
  VideoAssetSchema,
  VideoGenJobSchema,
  type IVideoAssetDocument,
  type IVideoGenJobDocument,
  type VideoGenJobStatusType,
} from "models/lab";
import type { VideoAsset, VideoGenJob, VideoGenerationRequest } from "types/ai";

const JOB_COLLECTION = "video_gen_jobs";
const ASSET_COLLECTION = "video_assets";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function safe(value: unknown) {
  return String(value || "").trim();
}

async function getJobModel() {
  return await getModel<IVideoGenJobDocument>(MONGODB_AI_URL, "VideoGenJob", VideoGenJobSchema, JOB_COLLECTION);
}

async function getAssetModel() {
  return await getModel<IVideoAssetDocument>(MONGODB_AI_URL, "VideoAsset", VideoAssetSchema, ASSET_COLLECTION);
}

export async function createVideoGenJob(args: {
  uid: string;
  request: VideoGenerationRequest;
  estimatedCoins: number;
  pricingRevision: string;
  billingPlan: Record<string, unknown>;
}) {
  const model = await getJobModel();
  const doc = await model.create({
    jobId: id("video_job"),
    scope: "user",
    uid: safe(args.uid),
    createdBy: safe(args.uid),
    provider: safe(args.request.provider),
    modelName: safe(args.request.modelName),
    clientRequestId: safe(args.request.clientRequestId),
    request: args.request,
    status: "queued",
    requestedDurationSeconds: Math.max(1, Number(args.request.durationSeconds || 0)),
    estimatedCoins: Math.max(0, Number(args.estimatedCoins || 0)),
    pricingRevision: safe(args.pricingRevision),
    billing: { pricingPlan: args.billingPlan },
  });
  return (doc.toObject?.() ?? doc) as IVideoGenJobDocument;
}

export async function getVideoGenJobByJobId(jobId: string) {
  const model = await getJobModel();
  return await model.findOne({ jobId: safe(jobId) }).lean<IVideoGenJobDocument>();
}

export async function getVideoGenJobByClientRequestId(args: { uid: string; clientRequestId: string }) {
  if (!safe(args.uid) || !safe(args.clientRequestId)) return null;
  const model = await getJobModel();
  return await model
    .findOne({ uid: safe(args.uid), clientRequestId: safe(args.clientRequestId), status: { $in: ["queued", "running", "success", "partial"] } })
    .sort({ createdAt: -1 })
    .lean<IVideoGenJobDocument>();
}

export async function listVideoGenJobs(args: { uid: string; jobIds?: string[]; limit?: number }) {
  const ids = Array.from(new Set((args.jobIds || []).map(safe).filter(Boolean))).slice(0, 20);
  const model = await getJobModel();
  return await model
    .find({ uid: safe(args.uid), ...(ids.length ? { jobId: { $in: ids } } : {}) })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(20, Number(args.limit || 8))))
    .lean<IVideoGenJobDocument[]>();
}

export async function markVideoGenJobRunning(args: { jobId: string; providerRequestId?: string }) {
  const model = await getJobModel();
  const $set: Record<string, unknown> = { status: "running", startedAt: new Date(), updatedAt: new Date() };
  if (safe(args.providerRequestId)) $set.providerRequestId = safe(args.providerRequestId);
  return await model.findOneAndUpdate(
    { jobId: safe(args.jobId), status: { $in: ["queued", "running"] } },
    { $set },
    { new: true },
  ).lean<IVideoGenJobDocument>();
}

export async function markVideoGenJobProviderRequestId(args: { jobId: string; providerRequestId: string }) {
  const model = await getJobModel();
  return await model.findOneAndUpdate(
    { jobId: safe(args.jobId), status: { $in: ["queued", "running"] }, providerRequestId: { $in: ["", null] } },
    { $set: { providerRequestId: safe(args.providerRequestId), status: "running", startedAt: new Date(), updatedAt: new Date() } },
    { new: true },
  ).lean<IVideoGenJobDocument>();
}

export async function updateVideoGenJobBilling(args: {
  jobId: string;
  reserveOperationId?: string;
  reservedCoins?: number;
  settlementOperationId?: string;
  settledCoins?: number;
  refundedCoins?: number;
  reconciliationRequired?: boolean;
}) {
  const model = await getJobModel();
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(args)) {
    if (key === "jobId" || value === undefined) continue;
    $set[`billing.${key}`] = value;
  }
  return await model.findOneAndUpdate({ jobId: safe(args.jobId) }, { $set }, { new: true }).lean<IVideoGenJobDocument>();
}

export async function markVideoGenJobCompleted(args: {
  jobId: string;
  status: Extract<VideoGenJobStatusType, "success" | "partial">;
  actualDurationSeconds: number;
  actualCoins: number;
  assetIds: string[];
}) {
  const model = await getJobModel();
  return await model.findOneAndUpdate(
    { jobId: safe(args.jobId), status: { $in: ["queued", "running"] } },
    {
      $set: {
        status: args.status,
        actualDurationSeconds: Math.max(0, Number(args.actualDurationSeconds || 0)),
        actualCoins: Math.max(0, Number(args.actualCoins || 0)),
        assets: Array.from(new Set(args.assetIds.map(safe).filter(Boolean))),
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IVideoGenJobDocument>();
}

export async function markVideoGenJobFailed(args: { jobId: string; code: string; message: string; status?: "failed" | "expired" | "cancelled" }) {
  const model = await getJobModel();
  return await model.findOneAndUpdate(
    { jobId: safe(args.jobId), status: { $in: ["queued", "running"] } },
    {
      $set: {
        status: args.status || "failed",
        error: { code: safe(args.code), message: safe(args.message) },
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IVideoGenJobDocument>();
}

export async function cancelQueuedVideoGenJob(args: { uid: string; jobId: string }) {
  const model = await getJobModel();
  return await model.findOneAndUpdate(
    { uid: safe(args.uid), jobId: safe(args.jobId), status: "queued", providerRequestId: { $in: ["", null] } },
    {
      $set: {
        status: "cancelled",
        error: { code: "VIDEO_CANCELLED", message: "사용자가 생성을 취소했습니다." },
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IVideoGenJobDocument>();
}

export async function createVideoAsset(args: {
  assetId?: string;
  jobId: string;
  uid: string;
  provider: string;
  modelName: string;
  durationSeconds?: number;
  mimeType: "video/mp4" | "video/webm";
  storage: IVideoAssetDocument["storage"];
  moderation?: IVideoAssetDocument["moderation"];
}) {
  const model = await getAssetModel();
  const doc = await model.create({
    assetId: safe(args.assetId) || id("video_asset"),
    jobId: safe(args.jobId),
    scope: "user",
    uid: safe(args.uid),
    provider: safe(args.provider),
    modelName: safe(args.modelName),
    outputIndex: 0,
    durationSeconds: args.durationSeconds,
    mimeType: args.mimeType,
    storage: args.storage,
    moderation: args.moderation,
    state: "active",
  });
  return (doc.toObject?.() ?? doc) as IVideoAssetDocument;
}

export async function listVideoAssetsByJobId(jobId: string) {
  const model = await getAssetModel();
  return await model.find({ jobId: safe(jobId), state: "active" }).sort({ outputIndex: 1 }).lean<IVideoAssetDocument[]>();
}

export async function listVideoAssetsForUser(args: { uid: string; assetIds?: string[]; jobIds?: string[]; limit?: number }) {
  const assetIds = Array.from(new Set((args.assetIds || []).map(safe).filter(Boolean))).slice(0, 20);
  const jobIds = Array.from(new Set((args.jobIds || []).map(safe).filter(Boolean))).slice(0, 20);
  const model = await getAssetModel();
  const selectors = [
    ...(assetIds.length ? [{ assetId: { $in: assetIds } }] : []),
    ...(jobIds.length ? [{ jobId: { $in: jobIds } }] : []),
  ];
  return await model
    .find({
      uid: safe(args.uid),
      state: "active",
      ...(selectors.length === 1 ? selectors[0] : selectors.length > 1 ? { $or: selectors } : {}),
    })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(20, Number(args.limit || 20))))
    .lean<IVideoAssetDocument[]>();
}

export async function toVideoAssetTransport(asset: IVideoAssetDocument): Promise<VideoAsset> {
  const storage = asset.storage;
  const url = storage.url || (await getR2SignedGetUrl({ bucket: storage.bucket, key: storage.key })).url;
  return {
    assetId: asset.assetId,
    url,
    mimeType: asset.mimeType,
    durationSeconds: asset.durationSeconds,
  };
}

export async function toVideoJobTransport(job: IVideoGenJobDocument, assets?: IVideoAssetDocument[]): Promise<VideoGenJob> {
  const resolvedAssets = assets || (await listVideoAssetsByJobId(job.jobId));
  return {
    jobId: job.jobId,
    scope: job.scope,
    uid: job.uid,
    providerRequestId: safe(job.providerRequestId) || undefined,
    status: job.status,
    requestedDurationSeconds: job.requestedDurationSeconds,
    actualDurationSeconds: job.actualDurationSeconds,
    provider: job.provider,
    modelName: job.modelName,
    assets: await Promise.all(resolvedAssets.map(toVideoAssetTransport)),
    estimatedCoins: job.estimatedCoins,
    actualCoins: job.actualCoins,
    pricingRevision: job.pricingRevision,
    reserveOperationId: safe(job.billing?.reserveOperationId) || undefined,
    settlementOperationId: safe(job.billing?.settlementOperationId) || undefined,
    errorCode: safe(job.error?.code) || undefined,
    errorMessage: safe(job.error?.message) || undefined,
  };
}
