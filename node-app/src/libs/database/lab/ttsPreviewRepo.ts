import "server-only";
import { getModel } from "libs/database/modelCache";
import { MONGODB_AI_URL } from "consts/env/server";
import {
  TtsPreviewAssetSchema,
  type ITtsPreviewAssetDocument,
  type TtsPreviewModerationStatus,
  type TtsPreviewSource,
  type TtsPreviewVisibility,
} from "models/lab";
import {
  TTS_PREVIEW_DELETED_RETENTION_MS,
  TTS_PREVIEW_FAILED_RETENTION_MS,
  TTS_PREVIEW_GENERATION_LEASE_MS,
} from "consts/ai";

const COLLECTION = "tts_preview_assets";
const QUOTA_INDEX_NAME = "tts_preview_active_quota_slot_unique";
let quotaIndexPromise: Promise<string> | null = null;

export class TtsPreviewQuotaError extends Error {
  readonly code = "VOICE_PREVIEW_LIMIT_EXCEEDED";
  readonly limit: number;

  constructor(limit: number) {
    super("VOICE_PREVIEW_LIMIT_EXCEEDED");
    this.name = "TtsPreviewQuotaError";
    this.limit = limit;
  }
}

export class TtsPreviewQuotaUnavailableError extends Error {
  readonly code = "VOICE_PREVIEW_QUOTA_UNAVAILABLE";

  constructor(cause: unknown) {
    super("VOICE_PREVIEW_QUOTA_UNAVAILABLE", { cause });
    this.name = "TtsPreviewQuotaUnavailableError";
  }
}

async function getTtsPreviewAssetModel() {
  return await getModel<ITtsPreviewAssetDocument>(
    MONGODB_AI_URL,
    "TtsPreviewAsset",
    TtsPreviewAssetSchema,
    COLLECTION,
  );
}

async function ensureTtsPreviewQuotaIndex() {
  if (quotaIndexPromise) return await quotaIndexPromise;
  const Model = await getTtsPreviewAssetModel();
  quotaIndexPromise = Model.collection.createIndex(
    { ownerUid: 1, visibility: 1, quotaSlot: 1 },
    {
      unique: true,
      name: QUOTA_INDEX_NAME,
      partialFilterExpression: { quotaSlot: { $type: "number" } },
    },
  );
  try {
    return await quotaIndexPromise;
  } catch (error) {
    quotaIndexPromise = null;
    throw new TtsPreviewQuotaUnavailableError(error);
  }
}

function isDuplicateKeyError(error: unknown) {
  return Number((error as { code?: number })?.code) === 11000;
}

function activeAssetQuery(now: Date) {
  return { $or: [{ state: "ready" }, { state: "generating", generationLeaseUntil: { $gt: now } }] };
}

async function releaseExpiredQuotaSlots(args: { uid: string; visibility: TtsPreviewVisibility }) {
  const Model = await getTtsPreviewAssetModel();
  const now = new Date();
  await Model.updateMany(
    {
      ownerUid: args.uid,
      visibility: args.visibility,
      source: "custom",
      state: "generating",
      generationLeaseUntil: { $lte: now },
    },
    {
      $set: {
        state: "failed",
        errorCode: "VOICE_PREVIEW_GENERATION_LEASE_EXPIRED",
        expiresAt: new Date(now.getTime() + TTS_PREVIEW_FAILED_RETENTION_MS),
      },
      $unset: { dedupeKey: 1, generationLeaseUntil: 1, quotaSlot: 1 },
    },
  ).exec();
}

async function getQuotaAllocationState(args: {
  uid: string;
  visibility: TtsPreviewVisibility;
  excludeAssetId?: string;
}) {
  const Model = await getTtsPreviewAssetModel();
  const rows = await Model.find({
    ownerUid: args.uid,
    visibility: args.visibility,
    source: "custom",
    ...(args.excludeAssetId ? { assetId: { $ne: args.excludeAssetId } } : {}),
    ...activeAssetQuery(new Date()),
  })
    .select("quotaSlot")
    .lean()
    .exec();
  const occupiedSlots = new Set<number>();
  let legacyCount = 0;
  for (const row of rows) {
    const quotaSlot = Number(row.quotaSlot);
    if (Number.isInteger(quotaSlot) && quotaSlot >= 0) occupiedSlots.add(quotaSlot);
    else legacyCount += 1;
  }
  return { legacyCount, occupiedSlots, activeCount: legacyCount + occupiedSlots.size };
}

export async function listTtsPreviewAssets(args: {
  uid: string;
  voiceId: string;
  modelName?: string;
  locale?: string;
  limit?: number;
}) {
  const Model = await getTtsPreviewAssetModel();
  const query: Record<string, unknown> = {
    voiceId: args.voiceId,
    state: "ready",
    $or: [
      { visibility: "public", $or: [{ moderationStatus: "approved" }, { source: "default" }] },
      { ownerUid: args.uid },
    ],
  };
  if (args.modelName) query.modelName = args.modelName;
  if (args.locale) query.locale = args.locale;
  return await Model.find(query)
    .select("-audioData")
    .sort({ source: -1, createdAt: -1 })
    .limit(Math.max(1, Math.min(50, args.limit || 20)))
    .lean()
    .exec();
}

export async function findReusableTtsPreviewAsset(args: {
  uid: string;
  baseKey: string;
  visibility: TtsPreviewVisibility;
}) {
  const Model = await getTtsPreviewAssetModel();
  const ownerQuery =
    args.visibility === "public"
      ? { $or: [{ moderationStatus: "approved" }, { source: "default" }] }
      : { ownerUid: args.uid };
  return await Model.findOne({
    baseKey: args.baseKey,
    visibility: args.visibility,
    state: "ready",
    ...ownerQuery,
  })
    .select("-audioData")
    .lean()
    .exec();
}

export function buildTtsPreviewDedupeKey(args: {
  uid: string;
  baseKey: string;
  visibility: TtsPreviewVisibility;
}) {
  return args.visibility === "public" ? `public:${args.baseKey}` : `private:${args.uid}:${args.baseKey}`;
}

export async function findGeneratingTtsPreviewAsset(dedupeKey: string) {
  const Model = await getTtsPreviewAssetModel();
  return await Model.findOne({ dedupeKey, state: "generating", generationLeaseUntil: { $gt: new Date() } })
    .select("-audioData")
    .lean()
    .exec();
}

export async function getTtsPreviewAssetByDedupeKey(dedupeKey: string) {
  const Model = await getTtsPreviewAssetModel();
  return await Model.findOne({ dedupeKey, state: { $in: ["generating", "ready"] } })
    .select("-audioData")
    .lean()
    .exec();
}

export async function releaseExpiredTtsPreviewGeneration(dedupeKey: string) {
  const Model = await getTtsPreviewAssetModel();
  const now = new Date();
  await Model.updateMany(
    { dedupeKey, state: "generating", generationLeaseUntil: { $lte: now } },
    {
      $set: {
        state: "failed",
        errorCode: "VOICE_PREVIEW_GENERATION_LEASE_EXPIRED",
        expiresAt: new Date(now.getTime() + TTS_PREVIEW_FAILED_RETENTION_MS),
      },
      $unset: { dedupeKey: 1, generationLeaseUntil: 1, quotaSlot: 1 },
    },
  ).exec();
}

export async function createGeneratingTtsPreviewAsset(args: {
  assetId: string;
  ownerUid: string;
  modelName: string;
  voiceId: string;
  locale: string;
  text: string;
  baseKey: string;
  speed: number;
  visibility: TtsPreviewVisibility;
  source: TtsPreviewSource;
  dedupeKey: string;
  limit: number;
}) {
  const Model = await getTtsPreviewAssetModel();
  const now = new Date();
  const { limit: _limit, ...asset } = args;
  const document = {
    ...asset,
    provider: "openai",
    moderationStatus: args.visibility === "public" && args.source === "custom" ? "pending" : "approved",
    state: "generating",
    generationLeaseUntil: new Date(now.getTime() + TTS_PREVIEW_GENERATION_LEASE_MS),
  };
  if (args.source === "default") return await Model.create(document);

  await ensureTtsPreviewQuotaIndex();
  await releaseExpiredQuotaSlots({ uid: args.ownerUid, visibility: args.visibility });
  for (let attempt = 0; attempt <= args.limit; attempt += 1) {
    const quota = await getQuotaAllocationState({ uid: args.ownerUid, visibility: args.visibility });
    if (quota.activeCount >= args.limit) throw new TtsPreviewQuotaError(args.limit);
    const quotaSlot = Array.from({ length: args.limit }, (_, slot) => slot).find(
      (slot) => !quota.occupiedSlots.has(slot),
    );
    if (quotaSlot === undefined) throw new TtsPreviewQuotaError(args.limit);
    try {
      return await Model.create({ ...document, quotaSlot });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const duplicateDedupe = await Model.exists({
        dedupeKey: args.dedupeKey,
        state: { $in: ["generating", "ready"] },
      });
      if (duplicateDedupe) throw error;
    }
  }
  throw new TtsPreviewQuotaError(args.limit);
}

export async function markTtsPreviewAssetReady(args: {
  assetId: string;
  storage: Record<string, unknown>;
  contentType: string;
  bytes: number;
  sha256: string;
}) {
  const Model = await getTtsPreviewAssetModel();
  const setPayload: Record<string, unknown> = {
    state: "ready",
    contentType: args.contentType,
    bytes: args.bytes,
    sha256: args.sha256,
    errorCode: "",
  };
  setPayload.storage = args.storage;

  return await Model.findOneAndUpdate(
    { assetId: args.assetId, state: "generating" },
    {
      $set: setPayload,
      $unset: { generationLeaseUntil: 1, expiresAt: 1 },
    },
    { new: true },
  ).exec();
}

export async function markTtsPreviewAssetFailed(assetId: string, errorCode: string) {
  const Model = await getTtsPreviewAssetModel();
  const now = new Date();
  return await Model.findOneAndUpdate(
    { assetId },
    {
      $set: {
        state: "failed",
        errorCode: String(errorCode || "PREVIEW_GENERATION_FAILED").slice(0, 120),
        expiresAt: new Date(now.getTime() + TTS_PREVIEW_FAILED_RETENTION_MS),
      },
      $unset: { dedupeKey: 1, generationLeaseUntil: 1, quotaSlot: 1 },
    },
    { new: true },
  ).exec();
}

export async function getTtsPreviewAsset(assetId: string, includeAudio = false) {
  const Model = await getTtsPreviewAssetModel();
  const query = Model.findOne({ assetId });
  if (includeAudio) query.select("+audioData");
  else query.select("-audioData");
  return await query.exec();
}

export async function setTtsPreviewAssetVisibility(args: {
  assetId: string;
  visibility: TtsPreviewVisibility;
  dedupeKey: string;
  storage?: Record<string, unknown>;
  moderationStatus: TtsPreviewModerationStatus;
  source: TtsPreviewSource;
  ownerUid: string;
  limit: number;
}) {
  const Model = await getTtsPreviewAssetModel();
  const setPayload: Record<string, unknown> = {
    visibility: args.visibility,
    dedupeKey: args.dedupeKey,
    moderationStatus: args.moderationStatus,
  };
  if (args.storage) setPayload.storage = args.storage;
  if (args.source === "default") {
    return await Model.findOneAndUpdate(
      { assetId: args.assetId, state: "ready" },
      {
        $set: setPayload,
        $unset: { moderatedAt: 1, moderatedBy: 1, moderationReason: 1, quotaSlot: 1 },
      },
      { new: true },
    ).exec();
  }

  await ensureTtsPreviewQuotaIndex();
  await releaseExpiredQuotaSlots({ uid: args.ownerUid, visibility: args.visibility });
  for (let attempt = 0; attempt <= args.limit; attempt += 1) {
    const quota = await getQuotaAllocationState({
      uid: args.ownerUid,
      visibility: args.visibility,
      excludeAssetId: args.assetId,
    });
    if (quota.activeCount >= args.limit) throw new TtsPreviewQuotaError(args.limit);
    const quotaSlot = Array.from({ length: args.limit }, (_, slot) => slot).find(
      (slot) => !quota.occupiedSlots.has(slot),
    );
    if (quotaSlot === undefined) throw new TtsPreviewQuotaError(args.limit);
    try {
      const updated = await Model.findOneAndUpdate(
        { assetId: args.assetId, state: "ready" },
        {
          $set: { ...setPayload, quotaSlot },
          $unset: { moderatedAt: 1, moderatedBy: 1, moderationReason: 1 },
        },
        { new: true },
      ).exec();
      if (!updated) throw new Error("VOICE_PREVIEW_DB_UPDATE_FAILED");
      return updated;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const duplicateDedupe = await Model.exists({
        dedupeKey: args.dedupeKey,
        assetId: { $ne: args.assetId },
        state: { $in: ["generating", "ready"] },
      });
      if (duplicateDedupe) throw error;
    }
  }
  throw new TtsPreviewQuotaError(args.limit);
}

export async function listTtsPreviewAssetsForModeration(args: {
  status?: TtsPreviewModerationStatus;
  limit?: number;
  cursor?: { createdAt: Date; assetId: string };
}) {
  const Model = await getTtsPreviewAssetModel();
  const query: Record<string, unknown> = { visibility: "public", state: "ready", source: "custom" };
  if (args.status) query.moderationStatus = args.status;
  if (args.cursor) {
    query.$or = [
      { createdAt: { $gt: args.cursor.createdAt } },
      { createdAt: args.cursor.createdAt, assetId: { $gt: args.cursor.assetId } },
    ];
  }
  return await Model.find(query)
    .select("-audioData")
    .sort({ createdAt: 1, assetId: 1 })
    .limit(Math.max(2, Math.min(101, (args.limit || 24) + 1)))
    .lean()
    .exec();
}

export async function setTtsPreviewAssetModeration(args: {
  assetId: string;
  moderationStatus: Exclude<TtsPreviewModerationStatus, "pending">;
  moderatedBy: string;
  reason?: string;
  storage?: Record<string, unknown>;
}) {
  const Model = await getTtsPreviewAssetModel();
  const setPayload: Record<string, unknown> = {
    moderationStatus: args.moderationStatus,
    moderatedAt: new Date(),
    moderatedBy: args.moderatedBy,
    moderationReason: String(args.reason || "").slice(0, 240),
  };
  if (args.storage) setPayload.storage = args.storage;
  return await Model.findOneAndUpdate(
    { assetId: args.assetId, state: "ready", visibility: "public", source: "custom" },
    { $set: setPayload },
    { new: true },
  ).exec();
}

export async function softDeleteTtsPreviewAsset(args: { assetId: string; deletedBy: string; reason?: string }) {
  const Model = await getTtsPreviewAssetModel();
  const now = new Date();
  return await Model.findOneAndUpdate(
    { assetId: args.assetId, state: { $ne: "deleted" } },
    {
      $set: {
        state: "deleted",
        deletedAt: now,
        deletedBy: args.deletedBy,
        deleteReason: String(args.reason || "user_delete").slice(0, 240),
        expiresAt: new Date(now.getTime() + TTS_PREVIEW_DELETED_RETENTION_MS),
      },
      $unset: { audioData: 1, storage: 1, dedupeKey: 1, generationLeaseUntil: 1, quotaSlot: 1 },
    },
    { new: true },
  ).exec();
}
