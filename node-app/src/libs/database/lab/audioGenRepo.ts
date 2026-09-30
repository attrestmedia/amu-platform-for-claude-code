import "server-only";

import crypto from "node:crypto";
import { MONGODB_AI_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  AudioAssetSchema,
  AudioGenJobSchema,
  type AudioAssetDeletePolicyType,
  type AudioAssetStateType,
  type AudioAssetStorageType,
  type AudioGenJobStatusType,
  type IAudioAssetDocument,
  type IAudioGenJobDocument,
} from "models/lab";
import { resolveVoiceAssetPlaybackUrl, deleteVoiceAssetByStorage } from "libs/server-utils/audio/voiceAssetStorage";
import { buildStudioAudioPlaylist, isStudioAudioStorageShared, type StudioAudioManifest } from "libs/server-utils/lab/studioAudioContract";

const JOB_COLLECTION = "audio_gen_jobs";
const ASSET_COLLECTION = "audio_assets";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function safe(value: unknown) {
  return String(value || "").trim();
}

function uniqueStrings(values: unknown) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(safe).filter(Boolean)));
}

function uniqueNumbers(values: unknown) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => Number(value)).filter(Number.isInteger)));
}

function storageDeleteError(errorCode = "AUDIO_ASSET_STORAGE_DELETE_FAILED", message = "audio asset storage deletion failed") {
  const error = new Error(message) as Error & { errorCode?: string; status?: number };
  error.errorCode = errorCode;
  error.status = 503;
  return error;
}

async function getJobModel() {
  return await getModel<IAudioGenJobDocument>(MONGODB_AI_URL, "AudioGenJob", AudioGenJobSchema, JOB_COLLECTION);
}

async function getAssetModel() {
  return await getModel<IAudioAssetDocument>(MONGODB_AI_URL, "AudioAsset", AudioAssetSchema, ASSET_COLLECTION);
}

export async function createAudioGenJob(args: {
  scope: "user" | "universe";
  uid: string;
  universeId?: string;
  createdBy?: string;
  provider: string;
  modelName: string;
  clientRequestId: string;
  requestHash: string;
  request: Record<string, unknown>;
  sourceRevision: string;
  sourceHash: string;
  manifestHash: string;
  segmentCount: number;
  billing?: Record<string, unknown>;
}) {
  const model = await getJobModel();
  const doc = await model.create({
    jobId: id("audio_job"),
    scope: args.scope,
    uid: safe(args.uid),
    universeId: safe(args.universeId),
    createdBy: safe(args.createdBy || args.uid),
    provider: safe(args.provider),
    modelName: safe(args.modelName),
    clientRequestId: safe(args.clientRequestId),
    requestHash: safe(args.requestHash),
    request: args.request,
    sourceRevision: safe(args.sourceRevision),
    sourceHash: safe(args.sourceHash),
    manifestHash: safe(args.manifestHash),
    segmentCount: Math.max(1, Number(args.segmentCount || 1)),
    status: "queued",
    billing: args.billing || {},
    assets: [],
    completedSegments: [],
  });
  return (doc.toObject?.() ?? doc) as IAudioGenJobDocument;
}

export async function getAudioGenJobByJobId(jobId: string) {
  const value = safe(jobId);
  if (!value) return null;
  return await (await getJobModel()).findOne({ jobId: value }).lean<IAudioGenJobDocument>();
}

export async function getAudioGenJobByClientRequestId(args: {
  uid: string;
  clientRequestId: string;
  scope?: "user" | "universe";
  universeId?: string;
}) {
  const uid = safe(args.uid);
  const clientRequestId = safe(args.clientRequestId);
  if (!uid || !clientRequestId) return null;
  return await (await getJobModel()).findOne({
    uid,
    clientRequestId,
    ...(args.scope ? { scope: args.scope } : {}),
    ...(args.scope === "universe" ? { universeId: safe(args.universeId) } : {}),
  }).sort({ createdAt: -1 }).lean<IAudioGenJobDocument>();
}

export async function listAudioGenJobsForUser(args: {
  uid: string;
  jobIds?: string[];
  limit?: number;
}) {
  const ids = uniqueStrings(args.jobIds).slice(0, 20);
  return await (await getJobModel()).find({
    uid: safe(args.uid),
    ...(ids.length ? { jobId: { $in: ids } } : {}),
  }).sort({ createdAt: -1 }).limit(Math.max(1, Math.min(50, Number(args.limit || 20)))).lean<IAudioGenJobDocument[]>();
}

export async function listRecoverableAudioGenJobs(args: { staleBefore: Date; limit?: number }) {
  return await (await getJobModel()).find({
    status: { $in: ["queued", "running"] },
    updatedAt: { $lte: args.staleBefore },
  }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(50, Number(args.limit || 20)))).lean<IAudioGenJobDocument[]>();
}

export async function requeueRecoverableAudioGenJob(args: { jobId: string; staleBefore: Date }) {
  return await (await getJobModel()).findOneAndUpdate(
    {
      jobId: safe(args.jobId),
      // queued는 provider를 시작하지 않았으므로 queue loss 뒤 재수집할 수 있다.
      status: "queued",
      updatedAt: { $lte: args.staleBefore },
    },
    {
      $set: {
        status: "queued",
        error: null,
        startedAt: null,
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioGenJobDocument>();
}

export async function markAudioGenJobRunning(args: { jobId: string }) {
  return await (await getJobModel()).findOneAndUpdate(
    { jobId: safe(args.jobId), status: "queued" },
    { $set: { status: "running", startedAt: new Date(), updatedAt: new Date() } },
    { new: true },
  ).lean<IAudioGenJobDocument>();
}

export async function heartbeatAudioGenJob(args: { jobId: string; generatedCharacters?: number; completedCharacters?: number }) {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  const generatedCharacters = Number(args.generatedCharacters);
  const completedCharacters = Number(args.completedCharacters);
  const $inc: Record<string, number> = {};
  if (Number.isFinite(generatedCharacters) && generatedCharacters > 0) $inc["billing.generatedCharacters"] = Math.floor(generatedCharacters);
  if (Number.isFinite(completedCharacters) && completedCharacters > 0) $inc["billing.completedCharacters"] = Math.floor(completedCharacters);
  return await (await getJobModel()).findOneAndUpdate(
    { jobId: safe(args.jobId), status: "running" },
    { $set, ...(Object.keys($inc).length ? { $inc } : {}) },
    { new: true },
  ).lean<IAudioGenJobDocument>();
}

export async function markStaleRunningAudioGenJobUnknown(args: { jobId: string; staleBefore: Date }) {
  return await (await getJobModel()).findOneAndUpdate(
    {
      jobId: safe(args.jobId),
      status: "running",
      updatedAt: { $lte: args.staleBefore },
    },
    {
      $set: {
        status: "unknown_outcome",
        error: { code: "AUDIO_STALE_RUNNING_UNKNOWN_OUTCOME", message: "stale running audio job was not retried automatically" },
        "billing.reconciliationRequired": true,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioGenJobDocument>();
}

export async function updateAudioGenJobBilling(args: {
  jobId: string;
  reserveOperationId?: string;
  reservedCoins?: number;
  reservedCharacters?: number;
  reservationCycle?: number;
  generatedCharacters?: number;
  settledCharacters?: number;
  settlementOperationId?: string;
  settlementOperationIds?: string[];
  actualCoins?: number;
  refundedCoins?: number;
  reconciliationRequired?: boolean;
}) {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(args)) {
    if (key !== "jobId" && value !== undefined) $set[`billing.${key}`] = value;
  }
  return await (await getJobModel()).findOneAndUpdate({ jobId: safe(args.jobId) }, { $set }, { new: true }).lean<IAudioGenJobDocument>();
}

export async function markAudioGenJobSuccess(args: {
  jobId: string;
  assetIds: string[];
  completedSegments: number[];
  actualCoins?: number;
  refundedCoins?: number;
  generatedCharacters?: number;
  settledCharacters?: number;
  settlementOperationId?: string;
  settlementOperationIds?: string[];
}) {
  return await (await getJobModel()).findOneAndUpdate(
    { jobId: safe(args.jobId), status: { $in: ["queued", "running"] } },
    {
      $set: {
        status: "success",
        assets: uniqueStrings(args.assetIds),
        completedSegments: uniqueNumbers(args.completedSegments).sort((left, right) => left - right),
        ...(args.actualCoins === undefined ? {} : { "billing.actualCoins": Math.max(0, Number(args.actualCoins)) }),
        ...(args.refundedCoins === undefined ? {} : { "billing.refundedCoins": Math.max(0, Number(args.refundedCoins)) }),
        ...(args.generatedCharacters === undefined ? {} : { "billing.generatedCharacters": Math.max(0, Math.floor(Number(args.generatedCharacters))) }),
        ...(args.settledCharacters === undefined ? {} : { "billing.settledCharacters": Math.max(0, Math.floor(Number(args.settledCharacters))) }),
        ...(args.settlementOperationId ? { "billing.settlementOperationId": safe(args.settlementOperationId) } : {}),
        ...(args.settlementOperationIds ? { "billing.settlementOperationIds": uniqueStrings(args.settlementOperationIds) } : {}),
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioGenJobDocument>();
}

export async function markAudioGenJobFailed(args: {
  jobId: string;
  code: string;
  message: string;
  status?: Extract<AudioGenJobStatusType, "failed" | "cancelled" | "unknown_outcome">;
  billing?: Pick<IAudioGenJobDocument["billing"], "actualCoins" | "refundedCoins" | "generatedCharacters" | "settledCharacters" | "settlementOperationId" | "settlementOperationIds">;
}) {
  return await (await getJobModel()).findOneAndUpdate(
    { jobId: safe(args.jobId), status: { $in: ["queued", "running"] } },
    {
      $set: {
        status: args.status || "failed",
        error: { code: safe(args.code), message: safe(args.message) },
        ...(args.billing?.actualCoins === undefined ? {} : { "billing.actualCoins": Math.max(0, Number(args.billing.actualCoins)) }),
        ...(args.billing?.refundedCoins === undefined ? {} : { "billing.refundedCoins": Math.max(0, Number(args.billing.refundedCoins)) }),
        ...(args.billing?.generatedCharacters === undefined ? {} : { "billing.generatedCharacters": Math.max(0, Math.floor(Number(args.billing.generatedCharacters))) }),
        ...(args.billing?.settledCharacters === undefined ? {} : { "billing.settledCharacters": Math.max(0, Math.floor(Number(args.billing.settledCharacters))) }),
        ...(args.billing?.settlementOperationId ? { "billing.settlementOperationId": safe(args.billing.settlementOperationId) } : {}),
        ...(args.billing?.settlementOperationIds ? { "billing.settlementOperationIds": uniqueStrings(args.billing.settlementOperationIds) } : {}),
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioGenJobDocument>();
}

export async function cancelQueuedAudioGenJob(args: { uid: string; jobId: string }) {
  return await (await getJobModel()).findOneAndUpdate(
    { uid: safe(args.uid), jobId: safe(args.jobId), status: "queued" },
    {
      $set: {
        status: "cancelled",
        error: { code: "AUDIO_CANCELLED", message: "사용자가 생성을 취소했습니다." },
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioGenJobDocument>();
}

export async function requeueFailedAudioGenJob(args: {
  uid: string;
  jobId: string;
  billing?: Record<string, unknown>;
}) {
  const billing = args.billing || {};
  const $set: Record<string, unknown> = {
    status: "queued",
    "billing.reservedCoins": 0,
    "billing.reserveOperationId": "",
    "billing.settlementOperationId": "",
    error: null,
    startedAt: null,
    completedAt: null,
    updatedAt: new Date(),
  };
  for (const [key, value] of Object.entries(billing)) {
    if (value !== undefined) $set[`billing.${key}`] = value;
  }
  return await (await getJobModel()).findOneAndUpdate(
    { uid: safe(args.uid), jobId: safe(args.jobId), status: "failed" },
    { $set },
    { new: true },
  ).lean<IAudioGenJobDocument>();
}

export async function createAudioAsset(args: {
  assetId?: string;
  jobId: string;
  scope: "user" | "universe";
  uid: string;
  universeId?: string;
  createdBy?: string;
  provider: string;
  modelName: string;
  templateKey?: string;
  visibility: "private" | "public";
  sourceService?: string;
  sourceSurface?: string;
  sourceRevision: string;
  sourceHash: string;
  segmentIndex: number;
  segmentCount: number;
  segmentHash: string;
  manifestHash: string;
  audio: IAudioAssetDocument["audio"];
  storage: AudioAssetStorageType;
  deletePolicy?: AudioAssetDeletePolicyType;
}) {
  const doc = await (await getAssetModel()).create({
    assetId: safe(args.assetId) || id("audio_asset"),
    jobId: safe(args.jobId),
    scope: args.scope,
    uid: safe(args.uid),
    universeId: safe(args.universeId),
    createdBy: safe(args.createdBy || args.uid),
    provider: safe(args.provider),
    modelName: safe(args.modelName),
    templateKey: safe(args.templateKey),
    visibility: args.visibility,
    sourceService: safe(args.sourceService || "gen-studio"),
    sourceSurface: safe(args.sourceSurface || "unknown"),
    sourceRevision: safe(args.sourceRevision),
    sourceHash: safe(args.sourceHash),
    segmentIndex: Math.max(0, Number(args.segmentIndex)),
    segmentCount: Math.max(1, Number(args.segmentCount)),
    segmentHash: safe(args.segmentHash),
    manifestHash: safe(args.manifestHash),
    audio: args.audio,
    storage: args.storage,
    state: "active",
    deletePolicy: args.deletePolicy || "soft",
  });
  return (doc.toObject?.() ?? doc) as IAudioAssetDocument;
}

export async function getAudioAssetByAssetId(assetId: string) {
  const value = safe(assetId);
  if (!value) return null;
  return await (await getAssetModel()).findOne({ assetId: value }).lean<IAudioAssetDocument>();
}

export async function listAudioAssetsByJobId(jobId: string) {
  return await (await getAssetModel()).find({ jobId: safe(jobId), state: "active" }).sort({ segmentIndex: 1 }).lean<IAudioAssetDocument[]>();
}

export async function findReusableAudioAsset(args: {
  uid: string;
  segmentHash: string;
  provider: string;
  voiceId: string;
  visibility?: "private" | "public";
}) {
  return await (await getAssetModel()).findOne({
    uid: safe(args.uid),
    provider: safe(args.provider),
    segmentHash: safe(args.segmentHash),
    state: "active",
    "audio.voiceProvenance.voiceId": safe(args.voiceId),
    ...(args.visibility ? { visibility: args.visibility } : {}),
  }).sort({ createdAt: -1 }).lean<IAudioAssetDocument>();
}

export async function listAudioAssetsForUser(args: {
  uid: string;
  assetIds?: string[];
  jobIds?: string[];
  limit?: number;
}) {
  const assetIds = uniqueStrings(args.assetIds).slice(0, 50);
  const jobIds = uniqueStrings(args.jobIds).slice(0, 50);
  const selectors = [
    ...(assetIds.length ? [{ assetId: { $in: assetIds } }] : []),
    ...(jobIds.length ? [{ jobId: { $in: jobIds } }] : []),
  ];
  return await (await getAssetModel()).find({
    uid: safe(args.uid),
    state: "active",
    ...(selectors.length === 1 ? selectors[0] : selectors.length > 1 ? { $or: selectors } : {}),
  }).sort({ createdAt: -1 }).limit(Math.max(1, Math.min(100, Number(args.limit || 20)))).lean<IAudioAssetDocument[]>();
}

export async function softDeleteAudioAsset(args: { assetId: string; deletedBy: string; reason?: string }) {
  return await (await getAssetModel()).findOneAndUpdate(
    { assetId: safe(args.assetId), state: "active" },
    {
      $set: {
        state: "deleted" as AudioAssetStateType,
        deletedAt: new Date(),
        deletedBy: safe(args.deletedBy),
        deleteReason: safe(args.reason || "user_delete"),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioAssetDocument>();
}

export async function hardDeleteAudioAsset(args: { assetId: string; deletedBy: string; reason?: string }) {
  const assetId = safe(args.assetId);
  const assetModel = await getAssetModel();
  const asset = await getAudioAssetByAssetId(assetId);
  if (!asset) return null;
  if (asset.state === "deleted") return asset;
  if (asset.state === "detached") return asset;
  const sharedAssets = await assetModel.find({
    assetId: { $ne: assetId },
    state: "active",
    "storage.driver": asset.storage.driver,
    "storage.bucket": asset.storage.bucket,
    "storage.key": asset.storage.key,
  }).limit(1).lean<IAudioAssetDocument[]>();
  if (isStudioAudioStorageShared({ assetId, storage: asset.storage, activeAssets: sharedAssets })) {
    throw storageDeleteError("AUDIO_ASSET_STORAGE_SHARED", "audio asset storage is shared by another active asset");
  }

  const enteredPending = asset.state === "active";
  if (enteredPending) {
    const pending = await assetModel.findOneAndUpdate(
      { assetId, state: "active" },
      {
        $set: {
          state: "pending_delete" as AudioAssetStateType,
          deletedAt: new Date(),
          deletedBy: safe(args.deletedBy),
          deleteReason: "hard_delete_pending",
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).lean<IAudioAssetDocument>();
    if (!pending) {
      const current = await getAudioAssetByAssetId(assetId);
      if (current?.state === "deleted") return current;
      if (current?.state !== "pending_delete") throw storageDeleteError("AUDIO_ASSET_DELETE_STATE_RACE", "audio asset delete state changed during hard delete");
    }
  }

  const restorePending = async () => await assetModel.findOneAndUpdate(
    { assetId, state: "pending_delete" },
    {
      $set: {
        state: "active" as AudioAssetStateType,
        deletedAt: null,
        deletedBy: "",
        deleteReason: "",
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioAssetDocument>();

  let storageDeleted = false;
  try {
    storageDeleted = await deleteVoiceAssetByStorage(asset.storage);
  } catch {
    if (enteredPending && !(await restorePending())) throw storageDeleteError("AUDIO_ASSET_DELETE_RECONCILIATION_REQUIRED", "audio asset delete rollback failed");
    throw storageDeleteError();
  }
  if (!storageDeleted) {
    if (enteredPending && !(await restorePending())) throw storageDeleteError("AUDIO_ASSET_DELETE_RECONCILIATION_REQUIRED", "audio asset delete rollback failed");
    throw storageDeleteError();
  }
  const deleted = await assetModel.findOneAndUpdate(
    { assetId, state: "pending_delete" },
    {
      $set: {
        state: "deleted" as AudioAssetStateType,
        deletedAt: new Date(),
        deletedBy: safe(args.deletedBy),
        deleteReason: safe(args.reason || "hard_delete"),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioAssetDocument>();
  if (deleted) return deleted;
  const current = await getAudioAssetByAssetId(assetId);
  if (current?.state === "deleted") return current;
  throw storageDeleteError("AUDIO_ASSET_DELETE_FINALIZE_FAILED", "audio asset delete finalization failed");
}

export async function detachAudioAsset(args: { assetId: string; deletedBy: string; reason?: string }) {
  return await (await getAssetModel()).findOneAndUpdate(
    { assetId: safe(args.assetId), state: "active" },
    {
      $set: {
        state: "detached" as AudioAssetStateType,
        deletedAt: new Date(),
        deletedBy: safe(args.deletedBy),
        deleteReason: safe(args.reason || "detach"),
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean<IAudioAssetDocument>();
}

export async function toAudioAssetTransport(asset: IAudioAssetDocument) {
  const playback = await resolveVoiceAssetPlaybackUrl(asset.storage).catch(() => null);
  return {
    assetId: asset.assetId,
    jobId: asset.jobId,
    segmentIndex: asset.segmentIndex,
    segmentCount: asset.segmentCount,
    sourceRevision: asset.sourceRevision,
    sourceHash: asset.sourceHash,
    segmentHash: asset.segmentHash,
    manifestHash: asset.manifestHash,
    provider: asset.provider,
    modelName: asset.modelName,
    templateKey: safe(asset.templateKey),
    visibility: asset.visibility,
    audio: asset.audio,
    storage: {
      driver: asset.storage.driver,
      access: asset.storage.access,
      mimeType: asset.storage.mimeType,
      bytes: asset.storage.bytes,
      sha256: asset.storage.sha256,
    },
    url: playback?.url || null,
    urlKind: playback?.urlKind || "none",
    createdAt: asset.createdAt,
  };
}

export async function toAudioJobTransport(job: IAudioGenJobDocument) {
  const assets = await listAudioAssetsByJobId(job.jobId);
  const request = job.request && typeof job.request === "object" ? { ...job.request } : {};
  delete request.text;
  const manifest = request.manifest && typeof request.manifest === "object"
    ? request.manifest as unknown as StudioAudioManifest
    : null;
  const playlist = manifest?.segmentCount
    ? buildStudioAudioPlaylist({
        manifest,
        assets,
        silenceMs: Number(request.silenceMs || 0),
        pronunciationDictionary: Array.isArray(request.pronunciationDictionary) ? request.pronunciationDictionary : [],
      })
    : null;
  return {
    jobId: job.jobId,
    scope: job.scope,
    uid: job.uid,
    universeId: safe(job.universeId),
    provider: job.provider,
    modelName: job.modelName,
    clientRequestId: job.clientRequestId,
    requestHash: job.requestHash,
    request,
    sourceRevision: job.sourceRevision,
    sourceHash: job.sourceHash,
    manifestHash: job.manifestHash,
    segmentCount: job.segmentCount,
    completedSegments: uniqueNumbers(job.completedSegments).sort((left, right) => left - right),
    status: job.status,
    billing: job.billing,
    assets: await Promise.all(assets.map(toAudioAssetTransport)),
    playlist,
    error: job.error || null,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
