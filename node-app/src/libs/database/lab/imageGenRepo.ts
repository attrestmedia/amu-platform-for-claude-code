import "server-only";
import crypto from "crypto";
import { getModel } from "libs/database/modelCache";
import {
  ImageGenJobSchema,
  type IImageGenJobDocument,
  ImageAssetSchema,
  type IImageAssetDocument,
  PromptSnapshotSchema,
  type IPromptSnapshotDocument,
} from "models/lab";
import { MONGODB_AI_URL } from "consts/env/server";
import { IMAGE_STUDIO_DATA_ROOT } from "consts/app";
import type { ImageProviderType, UserScopeType } from "types/ai";
import type {
  PromptGenType,
  PromptVisibilityType,
  PromptVisibilityExtendedType,
  StudioImageSearchFieldType,
  StudioGenerationSourceServiceType,
} from "types/app";
import type { ImageDeletePolicyType, ImageGenJobStatusType } from "models/lab/ImageGenJobSchema";
import { escapeRegExp } from "utils/normalize";
import {
  buildR2PublicUrl,
  copyR2Object,
  deleteR2Object,
  deleteR2PublicObjectByUrl,
  getR2PrivateBucket,
  getR2PublicBucket,
  getR2PublicObjectFromUrl,
  headR2Object,
  isR2PrivateStorage,
  isR2PublicStorage,
} from "libs/server-utils/storage/r2Storage";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import {
  deleteLegacyGenStudioImage,
  readLegacyGenStudioImage,
  resolveLegacyGenStudioImagePath,
} from "libs/server-utils/file/genStudioLegacyStorage";
import {
  sanitizeAgentImageRoutingMeta,
  type AgentImageRoutingMetaType,
} from "utils/ai/agentImageRoutingPolicy";

const JOB_COLLECTION = "image_gen_jobs";
const ASSET_COLLECTION = "image_assets";
const SNAPSHOT_COLLECTION = "prompt_snapshots";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toIsoNow() {
  return new Date();
}

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function normalizePublicPrefix(folderRaw?: string) {
  const folder = toSafeString(folderRaw).replace(/\\/g, "/");
  if (!folder) return "";
  if (folder.startsWith("/")) return folder;
  return `${IMAGE_STUDIO_DATA_ROOT}/${folder.replace(/^\/+/, "")}`;
}

function normalizeStorageKeyPrefix(folderRaw?: string) {
  const folder = toSafeString(folderRaw).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!folder) return "";
  if (folder.startsWith("gen-studio/")) return folder;
  if (folder.startsWith("apps/gen-studio/")) return folder.replace(/^apps\//, "");
  if (folder.startsWith(IMAGE_STUDIO_DATA_ROOT.replace(/^\//, ""))) {
    return folder.replace(new RegExp(`^${IMAGE_STUDIO_DATA_ROOT.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), "gen-studio/");
  }
  return `gen-studio/${folder}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toDeletePolicy(raw?: string): ImageDeletePolicyType {
  const p = toSafeString(raw).toLowerCase();
  if (p === "hard") return "hard";
  if (p === "detach") return "detach";
  return "soft";
}

function toJobStatus(raw?: string): ImageGenJobStatusType {
  const s = toSafeString(raw).toLowerCase();
  if (s === "queued" || s === "running" || s === "success" || s === "failed" || s === "partial") return s;
  return "queued";
}

async function getImageGenJobModel() {
  return await getModel<IImageGenJobDocument>(MONGODB_AI_URL, "ImageGenJob", ImageGenJobSchema, JOB_COLLECTION);
}

async function getImageAssetModel() {
  return await getModel<IImageAssetDocument>(MONGODB_AI_URL, "ImageAsset", ImageAssetSchema, ASSET_COLLECTION);
}

async function getPromptSnapshotModel() {
  return await getModel<IPromptSnapshotDocument>(
    MONGODB_AI_URL,
    "PromptSnapshot",
    PromptSnapshotSchema,
    SNAPSHOT_COLLECTION,
  );
}

async function buildFileMeta(url: string) {
  const out: Record<string, unknown> = { url };
  const r2Object = getR2PublicObjectFromUrl(url);
  if (r2Object) {
    return {
      ...out,
      ...r2Object,
      migrationState: "r2",
    };
  }

  const abs = resolveLegacyGenStudioImagePath(url);
  if (!abs) return { ...out, driver: "external", migrationState: "migration-required" };

  try {
    const ext = String(url).split("?")[0].split(".").pop()?.toLowerCase() || "";
    const buf = await readLegacyGenStudioImage(url);
    if (!buf) throw new Error("legacy_image_file_missing");
    out.driver = "local";
    out.access = "public";
    out.migrationState = "migration-required";
    out.ext = ext || undefined;
    out.mimeType = MIME_BY_EXT[ext] || undefined;
    out.bytes = buf.length;

    out.sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    // Keep best-effort metadata collection non-fatal.
  }
  return out;
}

function normalizeImageAssetStorageForTransport(storageRaw: unknown, fallbackUrl = "") {
  const storage = { ...toRecord(storageRaw) };
  const driver = toSafeString(storage.driver);
  const bucket = toSafeString(storage.bucket);
  const key = toSafeString(storage.key);
  const url = toSafeString(storage.url || fallbackUrl);
  if (driver === "r2" && bucket && key) return { ...storage, migrationState: "r2" };

  return {
    ...storage,
    ...(url ? { url } : {}),
    driver: resolveLegacyGenStudioImagePath(url) ? "local" : driver || "external",
    migrationState: "migration-required",
  };
}

function normalizeImageAssetForTransport<T>(asset: T): T {
  const record = toRecord(asset);
  return {
    ...record,
    storage: normalizeImageAssetStorageForTransport(record.storage),
  } as T;
}

async function removeImageObjectByStorage(storageRaw: unknown) {
  const storage = toRecord(storageRaw);
  const bucket = toSafeString(storage.bucket);
  const key = toSafeString(storage.key);
  if (bucket && key) {
    try {
      await deleteR2Object({ bucket, key });
      return true;
    } catch {
      return false;
    }
  }

  return await removeImageFileByUrl(toSafeString(storage.url));
}

async function moveR2StorageForVisibility(storageRaw: unknown, visibility: PromptVisibilityType) {
  const storage = { ...toRecord(storageRaw) };
  const bucket = toSafeString(storage.bucket);
  const key = toSafeString(storage.key);
  const isR2 = toSafeString(storage.driver) === "r2" && Boolean(bucket && key);
  if (!isR2) {
    return {
      storage,
      cleanup: null as null | { bucket: string; key: string },
      rollback: null as null | { bucket: string; key: string },
    };
  }

  const targetBucket = visibility === "public" ? getR2PublicBucket() : getR2PrivateBucket();
  const targetAccess = visibility === "public" ? "public" : "private";
  const sourceIsTarget = bucket === targetBucket && String(storage.access || "") === targetAccess;

  if (!sourceIsTarget) {
    const sourceHead = await headR2Object({ bucket, key });
    const storedBytes = Number(storage.bytes || 0);
    const storedMimeType = toSafeString(storage.mimeType);
    const storedSha256 = toSafeString(storage.sha256);
    const sourceVerified = Boolean(
      sourceHead &&
        (!storedBytes || sourceHead.bytes === storedBytes) &&
        (!storedMimeType || sourceHead.contentType === storedMimeType) &&
        (!storedSha256 || sourceHead.sha256 === storedSha256),
    );
    if (!sourceVerified) throw new Error("r2_visibility_source_verification_failed");

    const expectedBytes = storedBytes || sourceHead?.bytes || 0;
    const expectedMimeType = storedMimeType || sourceHead?.contentType || "";
    const expectedSha256 = storedSha256 || sourceHead?.sha256 || "";
    if (visibility === "public" && (!expectedBytes || !expectedMimeType || !expectedSha256)) {
      throw new Error("r2_public_visibility_metadata_incomplete");
    }

    try {
      await copyR2Object({
        sourceBucket: bucket,
        sourceKey: key,
        targetBucket,
        targetKey: key,
        contentType: expectedMimeType || undefined,
        cacheControl: visibility === "public" ? "public, max-age=31536000, immutable" : "private, max-age=0, no-store",
        sha256: expectedSha256 || undefined,
      });

      const copied = await headR2Object({ bucket: targetBucket, key });
      const verified = Boolean(
        copied &&
          (!expectedBytes || copied.bytes === expectedBytes) &&
          (!expectedMimeType || copied.contentType === expectedMimeType) &&
          (!expectedSha256 || copied.sha256 === expectedSha256),
      );
      if (!verified) throw new Error("r2_visibility_copy_verification_failed");
    } catch (error) {
      await deleteR2Object({ bucket: targetBucket, key }).catch(() => false);
      throw error;
    }
  }

  const nextStorage = {
    ...storage,
    driver: "r2",
    access: targetAccess,
    bucket: targetBucket,
    key,
    ...(visibility === "public" ? { url: buildR2PublicUrl(key) } : {}),
  };
  if (visibility === "private") {
    delete nextStorage.url;
  }

  return {
    storage: nextStorage,
    cleanup: !sourceIsTarget ? { bucket, key } : null,
    rollback: !sourceIsTarget ? { bucket: targetBucket, key } : null,
  };
}

export async function createImageGenJob(input: {
  scope: UserScopeType;
  uid?: string;
  universeId?: string;
  createdBy?: string;
  provider: ImageProviderType;
  modelName: string;
  request?: Record<string, unknown>;
  deletePolicy?: ImageDeletePolicyType | string;
  status?: ImageGenJobStatusType | string;
}) {
  const model = await getImageGenJobModel();
  const now = toIsoNow();
  const doc = await model.create({
    jobId: makeId("job"),
    scope: input.scope,
    uid: toSafeString(input.uid),
    universeId: toSafeString(input.universeId),
    createdBy: toSafeString(input.createdBy || input.uid),
    provider: input.provider,
    modelName: toSafeString(input.modelName),
    request: input.request || {},
    deletePolicy: toDeletePolicy(input.deletePolicy),
    status: toJobStatus(input.status || "queued"),
    startedAt: now,
  });
  return (doc.toObject?.() ?? doc) as IImageGenJobDocument;
}

export async function markImageGenJobSuccess(args: {
  jobId: string;
  outputCount: number;
  billing?: Record<string, unknown>;
  status?: "success" | "partial";
}) {
  const model = await getImageGenJobModel();
  const status = args.status === "partial" ? "partial" : "success";
  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(args.jobId) },
      {
        $set: {
          status,
          outputCount: Math.max(0, Number(args.outputCount || 0)),
          billing: args.billing || {},
          completedAt: toIsoNow(),
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();
}

export async function markImageGenJobRunning(args: {
  jobId: string;
  provider?: ImageProviderType;
  modelName?: string;
  request?: Record<string, unknown>;
}) {
  const model = await getImageGenJobModel();
  const set: Record<string, unknown> = {
    status: "running",
    startedAt: toIsoNow(),
    updatedAt: toIsoNow(),
  };
  if (args.provider) set.provider = args.provider;
  if (toSafeString(args.modelName)) set.modelName = toSafeString(args.modelName);
  if (args.request) set.request = args.request;

  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(args.jobId), status: { $in: ["queued", "running"] } },
      { $set: set },
      { new: true },
    )
    .lean();
}

export async function markImageGenJobFailed(args: { jobId: string; reason?: string; code?: string }) {
  const model = await getImageGenJobModel();
  return await model
    .findOneAndUpdate(
      { jobId: toSafeString(args.jobId) },
      {
        $set: {
          status: "failed",
          error: {
            code: toSafeString(args.code),
            message: toSafeString(args.reason || "generation_failed"),
          },
          completedAt: toIsoNow(),
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();
}

export async function listImageGenJobsByJobIds(jobIds: string[]) {
  const ids = Array.from(new Set((jobIds || []).map((id) => toSafeString(id)).filter(Boolean)));
  if (!ids.length) return [];

  const model = await getImageGenJobModel();
  return await model.find({ jobId: { $in: ids } }).lean();
}

export async function getImageGenJobByJobId(jobId: string) {
  const safeJobId = toSafeString(jobId);
  if (!safeJobId) return null;

  const model = await getImageGenJobModel();
  return await model.findOne({ jobId: safeJobId }).lean();
}

/** 재사용 지평. `listStudioImageJobNotifications`의 기본 조회 창과 같은 값이어야 결과 전달이 보장된다. */
export const STUDIO_IMAGE_JOB_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 같은 clientRequestId로 이미 진행 중이거나 성공한 job을 찾는다 — 재요청의 중복 과금을 막는 조회다.
 *
 * `failed`·`canceled`는 일부러 제외한다. 실패한 생성은 다시 만들 수 있어야 하고,
 * 여기서 실패 job을 재사용하면 같은 조건이 영구히 막힌다 (SSM-203).
 */
export async function getImageGenJobByClientRequestId(args: {
  uid: string;
  clientRequestId: string;
  scope?: "user" | "universe";
  universeId?: string;
}) {
  const uid = toSafeString(args.uid);
  const clientRequestId = toSafeString(args.clientRequestId);
  if (!uid || !clientRequestId) return null;

  const scope = args.scope === "universe" ? "universe" : "user";
  const universeId = toSafeString(args.universeId);
  // universe scope는 같은 유니버스 안에서만 재사용한다. universeId가 없으면 판정 근거가 없으므로 조회하지 않는다.
  if (scope === "universe" && !universeId) return null;

  const model = await getImageGenJobModel();
  return await model
    .findOne({
      scope,
      uid,
      ...(scope === "universe" ? { universeId } : {}),
      "request.clientRequestId": clientRequestId,
      status: { $in: ["queued", "running", "success", "partial"] },
      // 재사용 지평은 알림·자산이 사용자에게 보이는 창과 같게 둔다. 더 오래된 job을 되살리면
      // 중복 과금을 막는 것이 아니라 "옛날 결과를 새 요청의 답으로" 돌려주는 셈이 된다.
      createdAt: { $gte: new Date(Date.now() - STUDIO_IMAGE_JOB_REUSE_WINDOW_MS) },
    })
    .sort({ createdAt: -1 })
    .lean();
}

export async function listStudioImageJobNotifications(args: {
  uid: string;
  limit?: number;
  unreadOnly?: boolean;
  includeRunning?: boolean;
  since?: Date;
  /**
   * 특정 job만 확정 조회한다 (SSM-203).
   *
   * 지정하면 기간·읽음·목록 상한을 적용하지 않는다. 재사용된 job의 결과를 돌려줘야 하는데
   * 그 job이 이미 읽음 처리됐거나 최근 20건 밖으로 밀려나면 알림 목록으로는 영영 잡히지 않는다.
   */
  jobIds?: string[];
}) {
  const uid = toSafeString(args.uid);
  if (!uid) return [];

  const requestedJobIds = Array.from(
    new Set((args.jobIds || []).map((jobId) => toSafeString(jobId)).filter(Boolean)),
  );
  const isTargetedLookup = requestedJobIds.length > 0;

  const model = await getImageGenJobModel();
  const limit = isTargetedLookup
    ? Math.min(20, requestedJobIds.length)
    : Math.max(1, Math.min(20, Number(args.limit || 8)));
  const since =
    args.since instanceof Date && !Number.isNaN(args.since.getTime())
      ? args.since
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const statuses = args.includeRunning
    ? ["queued", "running", "success", "partial", "failed"]
    : ["success", "partial", "failed"];
  const cond: Record<string, unknown> = {
    status: { $in: statuses },
    $or: [{ scope: "user", uid }, { createdBy: uid }],
    ...(isTargetedLookup ? { jobId: { $in: requestedJobIds } } : { createdAt: { $gte: since } }),
  };

  if (args.unreadOnly && !isTargetedLookup) {
    cond.$and = [{ $or: [{ "notification.readAt": null }, { "notification.readAt": { $exists: false } }] }];
  }

  const jobs = await model.find(cond).sort({ createdAt: -1 }).limit(limit).lean();
  const jobIds = jobs.map((job) => toSafeString(job.jobId)).filter(Boolean);
  if (!jobIds.length) return [];

  const [assets, promptMetaByJobId] = await Promise.all([
    listImageAssets({ scope: "all", jobIds, state: "active", limit: limit * 6 }),
    getPromptSnapshotMetaMapByJobIds(jobIds),
  ]);

  const assetsByJobId: Record<string, Array<Record<string, unknown>>> = {};
  await Promise.all(
    (assets || []).map(async (asset) => {
      const assetRec = toRecord(asset);
      const jobId = toSafeString(assetRec.jobId);
      if (!jobId) return;

      const storage = toRecord(assetRec.storage);
      const display = await resolveImageAssetDisplayUrl(assetRec);
      if (!assetsByJobId[jobId]) assetsByJobId[jobId] = [];
      assetsByJobId[jobId].push({
        assetId: toSafeString(assetRec.assetId),
        jobId,
        url: display.url,
        urlKind: display.urlKind,
        urlExpiresAt: display.urlExpiresAt,
        refreshUrl: display.refreshUrl,
        templateKey: toSafeString(assetRec.templateKey),
        templateTitle: toSafeString(promptMetaByJobId[jobId]?.templateTitle),
        visibility: toSafeString(assetRec.visibility) || "private",
        createdAt: assetRec.createdAt || null,
        provider: toSafeString(assetRec.provider),
        modelName: toSafeString(assetRec.modelName),
        generationMode: toSafeString(assetRec.generationMode) || "custom",
        sourceService: toSafeString(assetRec.sourceService) || "unknown",
        sourceSurface: toSafeString(assetRec.sourceSurface) || "unknown",
        outputIndex: Number(assetRec.outputIndex || 0),
        extraPrompt: toSafeString(assetRec.extraPrompt),
        storage: {
          driver: toSafeString(storage.driver),
          access: toSafeString(storage.access),
          mimeType: toSafeString(storage.mimeType),
          ext: toSafeString(storage.ext),
          bytes: Number(storage.bytes || 0),
        },
      });
    }),
  );

  return jobs.map((job) => {
    const jobRec = toRecord(job);
    const jobId = toSafeString(jobRec.jobId);
    const request = toRecord(jobRec.request);
    const billing = toRecord(jobRec.billing);
    const error = toRecord(jobRec.error);
    const meta = promptMetaByJobId[jobId] || { templateTitle: "", templateKey: "", extraPrompt: "" };
    const notification = toRecord(jobRec.notification);
    return {
      jobId,
      status: toSafeString(jobRec.status),
      templateKey: toSafeString(meta.templateKey) || toSafeString(request.templateKey),
      templateTitle: toSafeString(meta.templateTitle) || toSafeString(request.templateTitle),
      generationMode: toSafeString(request.generationMode) || "custom",
      provider: toSafeString(jobRec.provider),
      modelName: toSafeString(jobRec.modelName),
      outputCount: Number(jobRec.outputCount || 0),
      requestedCount: Number(request.n || 0),
      coins: Number(billing.coins || 0),
      errorMessage: toSafeString(error.message),
      readAt: notification.readAt || null,
      createdAt: jobRec.createdAt || null,
      startedAt: jobRec.startedAt || null,
      completedAt: jobRec.completedAt || null,
      assets: (assetsByJobId[jobId] || []).sort((a, b) => Number(a.outputIndex || 0) - Number(b.outputIndex || 0)),
    };
  });
}

export async function markStudioImageJobNotificationRead(args: { uid: string; jobId: string }) {
  const uid = toSafeString(args.uid);
  const jobId = toSafeString(args.jobId);
  if (!uid || !jobId) return null;

  const model = await getImageGenJobModel();
  return await model
    .findOneAndUpdate(
      {
        jobId,
        status: { $in: ["success", "partial", "failed"] },
        $or: [{ scope: "user", uid }, { createdBy: uid }],
      },
      {
        $set: {
          "notification.readAt": toIsoNow(),
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();
}

export async function listAssetIdsByJobIds(args: {
  jobIds: string[];
  visibility?: PromptVisibilityExtendedType;
  state?: "active" | "deleted" | "detached" | "all";
  limit?: number;
}) {
  const ids = Array.from(new Set((args.jobIds || []).map((id) => toSafeString(id)).filter(Boolean)));
  if (!ids.length) return {} as Record<string, string[]>;

  const model = await getImageAssetModel();
  const cond: Record<string, unknown> = { jobId: { $in: ids } };

  const visibility = toSafeString(args.visibility || "all").toLowerCase();
  if (visibility === "private" || visibility === "public") cond.visibility = visibility;

  const state = toSafeString(args.state || "active");
  if (state !== "all") cond.state = state || "active";

  const limit = Math.max(1, Math.min(2000, Number(args.limit || 2000)));
  const rows = await model.find(cond, { _id: 0, jobId: 1, assetId: 1 }).sort({ createdAt: -1 }).limit(limit).lean();

  const out: Record<string, string[]> = {};
  (rows || []).forEach((row: { jobId?: unknown; assetId?: unknown }) => {
    const jobId = toSafeString(row?.jobId);
    const assetId = toSafeString(row?.assetId);
    if (!jobId || !assetId) return;
    if (!out[jobId]) out[jobId] = [];
    out[jobId].push(assetId);
  });

  return out;
}

export async function createPromptSnapshot(input: {
  jobId: string;
  templateKey?: string;
  title?: string;
  templateText?: string;
  defaultParams?: Record<string, unknown>;
  inputPolicy?: Record<string, unknown>;
  tags?: string[];
  categories?: string[];
  version?: number;
  enabled?: boolean;
  renderedPrompt?: string;
  negative?: string;
  variables?: Record<string, unknown>;
  extraPrompt?: string;
}) {
  const model = await getPromptSnapshotModel();
  const prompt = String(input.renderedPrompt || "");
  const promptHash = prompt ? crypto.createHash("sha256").update(prompt, "utf8").digest("hex") : "";

  const doc = await model.create({
    snapshotId: makeId("snapshot"),
    jobId: toSafeString(input.jobId),
    templateKey: toSafeString(input.templateKey),
    templateDocumentSnapshot: {
      templateKey: toSafeString(input.templateKey),
      title: toSafeString(input.title),
      templateText: String(input.templateText || ""),
      defaultParams: input.defaultParams || {},
      inputPolicy: input.inputPolicy || {},
      tags: Array.isArray(input.tags) ? input.tags : [],
      categories: Array.isArray(input.categories) ? input.categories : [],
      version: typeof input.version === "number" ? input.version : undefined,
      enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    },
    rendered: {
      prompt,
      negative: String(input.negative || ""),
      variables: input.variables || {},
      extraPrompt: String(input.extraPrompt || ""),
    },
    promptHash,
  });

  return (doc.toObject?.() ?? doc) as IPromptSnapshotDocument;
}

export async function getPromptExtraPromptMapByJobIds(jobIds: string[]) {
  const metaByJobId = await getPromptSnapshotMetaMapByJobIds(jobIds);
  return Object.entries(metaByJobId).reduce<Record<string, string>>((acc, [jobId, meta]) => {
    if (meta.extraPrompt) acc[jobId] = meta.extraPrompt;
    return acc;
  }, {});
}

export async function getPromptSnapshotMetaMapByJobIds(jobIds: string[]) {
  const ids = Array.from(new Set((jobIds || []).map((id) => toSafeString(id)).filter(Boolean)));
  if (!ids.length) return {} as Record<string, { extraPrompt: string; templateTitle: string; templateKey: string }>;

  const model = await getPromptSnapshotModel();
  const rows = await model
    .find({ jobId: { $in: ids } }, { _id: 0, jobId: 1, templateKey: 1, rendered: 1, templateDocumentSnapshot: 1 })
    .lean();

  return (rows || []).reduce<Record<string, { extraPrompt: string; templateTitle: string; templateKey: string }>>((acc, row) => {
    const jobId = toSafeString(row?.jobId);
    if (!jobId) return acc;

    acc[jobId] = {
      extraPrompt: toSafeString(row?.rendered?.extraPrompt),
      templateTitle: toSafeString(row?.templateDocumentSnapshot?.title),
      templateKey: toSafeString(row?.templateDocumentSnapshot?.templateKey) || toSafeString(row?.templateKey),
    };
    return acc;
  }, {});
}

export async function createImageAssets(input: {
  jobId: string;
  scope: UserScopeType;
  uid?: string;
  universeId?: string;
  urls: string[];
  provider: ImageProviderType | "user-upload";
  modelName: string;
  templateKey?: string;
  generationMode?: PromptGenType;
  sourceService?: StudioGenerationSourceServiceType;
  sourceSurface?: string;
  extraPrompt?: string;
  tags?: string[];
  categories?: string[];
  routingMeta?: AgentImageRoutingMetaType;
  deletePolicy?: ImageDeletePolicyType | string;
  visibility?: PromptVisibilityType;
  storages?: Array<Record<string, unknown> | undefined>;
}) {
  const model = await getImageAssetModel();
  const urls = Array.from(new Set((input.urls || []).map((u) => toSafeString(u)).filter(Boolean)));
  const outputCount = Math.max(urls.length, input.storages?.length || 0);
  if (!outputCount) return [];

  const docs = await Promise.all(
    Array.from({ length: outputCount }).map(async (_, outputIndex) => {
      const url = urls[outputIndex] || "";
      const storage = normalizeImageAssetStorageForTransport(
        input.storages?.[outputIndex] || (await buildFileMeta(url)),
        url,
      );
      return {
        assetId: makeId("asset"),
        jobId: toSafeString(input.jobId),
        scope: input.scope,
        uid: toSafeString(input.uid),
        universeId: toSafeString(input.universeId),
        provider: input.provider,
        modelName: toSafeString(input.modelName),
        templateKey: toSafeString(input.templateKey),
        generationMode: input.generationMode === "template" ? "template" : "custom",
        sourceService: input.sourceService || "unknown",
        sourceSurface: toSafeString(input.sourceSurface) || "unknown",
        outputIndex,
        extraPrompt: String(input.extraPrompt || ""),
        tags: Array.isArray(input.tags) ? input.tags : [],
        categories: Array.isArray(input.categories) ? input.categories : [],
        routingMeta: sanitizeAgentImageRoutingMeta(input.routingMeta),
        storage,
        state: "active",
        deletePolicy: toDeletePolicy(input.deletePolicy),
        visibility: input.visibility === "public" ? "public" : "private",
      };
    }),
  );

  const inserted = await model.insertMany(docs, { ordered: true });
  return inserted.map((d) => ((d as { toObject?: () => IImageAssetDocument }).toObject?.() ?? (d as IImageAssetDocument)) as IImageAssetDocument);
}

export async function listImageAssets(params: {
  scope?: UserScopeType | "all" | "mine";
  uid?: string;
  universeId?: string;
  assetId?: string;
  assetIds?: string[];
  jobId?: string;
  jobIds?: string[];
  templateKey?: string;
  generationMode?: PromptGenType;
  modelName?: string;
  folder?: string;
  state?: "active" | "deleted" | "detached" | "all";
  limit?: number;
  skip?: number;
  visibility?: PromptVisibilityExtendedType;
  q?: string;
  searchField?: StudioImageSearchFieldType;
  sourceService?: StudioGenerationSourceServiceType;
  excludeSourceService?: StudioGenerationSourceServiceType;
  sourceSurface?: string;
  createdFrom?: Date;
  createdBefore?: Date;
}) {
  const model = await getImageAssetModel();
  const cond = buildImageAssetListCondition(params);
  const limit = Math.max(1, Math.min(200, Number(params.limit || 50)));
  const skip = Math.max(0, Number(params.skip || 0));
  const rows = await model.find(cond).sort({ createdAt: -1, outputIndex: 1, _id: 1 }).skip(skip).limit(limit).lean();
  return rows.map(normalizeImageAssetForTransport);
}

function buildImageAssetListCondition(params: {
  scope?: UserScopeType | "all" | "mine";
  uid?: string;
  universeId?: string;
  assetId?: string;
  assetIds?: string[];
  jobId?: string;
  jobIds?: string[];
  templateKey?: string;
  generationMode?: PromptGenType;
  modelName?: string;
  folder?: string;
  state?: "active" | "deleted" | "detached" | "all";
  visibility?: PromptVisibilityExtendedType;
  q?: string;
  searchField?: StudioImageSearchFieldType;
  sourceService?: StudioGenerationSourceServiceType;
  excludeSourceService?: StudioGenerationSourceServiceType;
  sourceSurface?: string;
  createdFrom?: Date;
  createdBefore?: Date;
}) {
  const cond: Record<string, unknown> = {};
  const andConds: Record<string, unknown>[] = [];

  const visibility = toSafeString(params.visibility || "all").toLowerCase();
  if (visibility === "private" || visibility === "public") cond.visibility = visibility;

  const scope = toSafeString(params.scope || "all");
  if (scope === "user" || scope === "universe") cond.scope = scope;
  if (scope === "user") cond.uid = toSafeString(params.uid);
  if (scope === "universe") cond.universeId = toSafeString(params.universeId);
  if (scope === "mine") cond.uid = toSafeString(params.uid);

  const sourceService = toSafeString(params.sourceService);
  if (sourceService === "unknown") {
    andConds.push({ $or: [{ sourceService: "unknown" }, { sourceService: "" }, { sourceService: { $exists: false } }] });
  } else if (sourceService) {
    cond.sourceService = sourceService;
  } else {
    const excludeSourceService = toSafeString(params.excludeSourceService);
    if (excludeSourceService) cond.sourceService = { $ne: excludeSourceService };
  }
  const sourceSurface = toSafeString(params.sourceSurface);
  if (sourceSurface) cond.sourceSurface = sourceSurface;

  const createdFrom = params.createdFrom instanceof Date && Number.isFinite(params.createdFrom.getTime())
    ? params.createdFrom
    : undefined;
  const createdBefore = params.createdBefore instanceof Date && Number.isFinite(params.createdBefore.getTime())
    ? params.createdBefore
    : undefined;
  if (createdFrom || createdBefore) {
    cond.createdAt = {
      ...(createdFrom ? { $gte: createdFrom } : {}),
      ...(createdBefore ? { $lt: createdBefore } : {}),
    };
  }

  const templateKey = toSafeString(params.templateKey);
  if (templateKey) cond.templateKey = templateKey;

  const generationMode = toSafeString(params.generationMode);
  if (generationMode === "template" || generationMode === "custom") cond.generationMode = generationMode;

  const modelName = toSafeString(params.modelName);
  if (modelName) cond.modelName = modelName;

  const assetIds = Array.from(new Set((params.assetIds || []).map((id) => toSafeString(id)).filter(Boolean)));
  if (assetIds.length) {
    cond.assetId = { $in: assetIds };
  } else {
    const assetId = toSafeString(params.assetId);
    if (assetId) cond.assetId = assetId;
  }

  const jobIds = Array.from(new Set((params.jobIds || []).map((id) => toSafeString(id)).filter(Boolean)));
  if (jobIds.length) {
    cond.jobId = { $in: jobIds };
  } else {
    const jobId = toSafeString(params.jobId);
    if (jobId) cond.jobId = jobId;
  }

  const state = toSafeString(params.state || "active");
  if (state !== "all") cond.state = state || "active";

  const prefix = normalizePublicPrefix(params.folder);
  const keyPrefix = normalizeStorageKeyPrefix(params.folder);
  if (prefix || keyPrefix) {
    const folderConds = [];
    if (prefix) folderConds.push({ "storage.url": new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
    if (keyPrefix) {
      const escapedKeyPrefix = keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      folderConds.push({ "storage.key": new RegExp(`^${escapedKeyPrefix}`) });
    }
    andConds.push({ $or: folderConds });
  }

  const q = toSafeString(params.q).slice(0, 120);
  if (q) {
    const re = new RegExp(escapeRegExp(q), "i");
    const searchField = toSafeString(params.searchField || "all") as StudioImageSearchFieldType;
    const searchConds =
      searchField === "assetId"
        ? [{ assetId: re }]
        : searchField === "templateKey"
          ? [{ templateKey: re }]
          : searchField === "prompt"
            ? [{ extraPrompt: re }]
            : [{ assetId: re }, { templateKey: re }, { extraPrompt: re }];
    andConds.push({ $or: searchConds });
  }

  if (andConds.length) cond.$and = andConds;
  return cond;
}

export async function countImageAssets(params: {
  scope?: UserScopeType | "all" | "mine";
  uid?: string;
  universeId?: string;
  assetId?: string;
  assetIds?: string[];
  jobId?: string;
  jobIds?: string[];
  templateKey?: string;
  generationMode?: PromptGenType;
  modelName?: string;
  folder?: string;
  state?: "active" | "deleted" | "detached" | "all";
  visibility?: PromptVisibilityExtendedType;
  q?: string;
  searchField?: StudioImageSearchFieldType;
  sourceService?: StudioGenerationSourceServiceType;
  excludeSourceService?: StudioGenerationSourceServiceType;
  sourceSurface?: string;
  createdFrom?: Date;
  createdBefore?: Date;
}) {
  const model = await getImageAssetModel();
  return await model.countDocuments(buildImageAssetListCondition(params));
}

export async function listLatestPublicImageAssetsByTemplateKeys(args: { templateKeys: string[]; perTemplate?: number }) {
  const model = await getImageAssetModel();
  const templateKeys = Array.from(new Set((args.templateKeys || []).map((key) => toSafeString(key)).filter(Boolean)));
  const perTemplate = Math.max(1, Math.min(12, Number(args.perTemplate || 2)));

  if (!templateKeys.length) return [] as Array<{ templateKey: string; rows: IImageAssetDocument[] }>;

  return await model
    .aggregate([
      {
        $match: {
          templateKey: { $in: templateKeys },
          visibility: "public",
          state: "active",
        },
      },
      {
        $sort: {
          templateKey: 1,
          createdAt: -1,
          outputIndex: 1,
          _id: 1,
        },
      },
      {
        $group: {
          _id: "$templateKey",
          rows: {
            $push: {
              assetId: "$assetId",
              jobId: "$jobId",
              templateKey: "$templateKey",
              visibility: "$visibility",
              scope: "$scope",
              uid: "$uid",
              universeId: "$universeId",
              provider: "$provider",
              modelName: "$modelName",
              generationMode: "$generationMode",
              sourceService: "$sourceService",
              sourceSurface: "$sourceSurface",
              outputIndex: "$outputIndex",
              extraPrompt: "$extraPrompt",
              state: "$state",
              createdAt: "$createdAt",
              storage: "$storage",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          templateKey: "$_id",
          rows: { $slice: ["$rows", perTemplate] },
        },
      },
    ])
    .allowDiskUse(true);
}

export async function getImageAssetByAssetId(assetId: string) {
  const model = await getImageAssetModel();
  const asset = await model.findOne({ assetId: toSafeString(assetId) }).lean();
  return asset ? normalizeImageAssetForTransport(asset) : null;
}

export async function getImageAssetByStorageUrl(url: string) {
  const model = await getImageAssetModel();
  const asset = await model.findOne({ "storage.url": toSafeString(url) }).lean();
  return asset ? normalizeImageAssetForTransport(asset) : null;
}

export async function replaceImageAssetStorageIfCurrent(args: {
  assetId: string;
  expectedBucket: string;
  expectedKey: string;
  storage: Record<string, unknown>;
}) {
  const model = await getImageAssetModel();
  const updated = await model
    .findOneAndUpdate(
      {
        assetId: toSafeString(args.assetId),
        state: "active",
        "storage.bucket": toSafeString(args.expectedBucket),
        "storage.key": toSafeString(args.expectedKey),
      },
      {
        $set: {
          storage: args.storage,
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();

  return updated ? normalizeImageAssetForTransport(updated) : null;
}

export async function softDeleteImageAsset(args: {
  assetId: string;
  deletedBy?: string;
  reason?: string;
  policy?: ImageDeletePolicyType | string;
}) {
  const model = await getImageAssetModel();
  return await model
    .findOneAndUpdate(
      { assetId: toSafeString(args.assetId) },
      {
        $set: {
          state: "deleted",
          deletePolicy: toDeletePolicy(args.policy || "soft"),
          deletedAt: toIsoNow(),
          deletedBy: toSafeString(args.deletedBy),
          deleteReason: toSafeString(args.reason),
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();
}

export async function detachImageAsset(args: { assetId: string; deletedBy?: string; reason?: string }) {
  const model = await getImageAssetModel();
  return await model
    .findOneAndUpdate(
      { assetId: toSafeString(args.assetId) },
      {
        $set: {
          state: "detached",
          deletePolicy: "detach",
          deletedAt: toIsoNow(),
          deletedBy: toSafeString(args.deletedBy),
          deleteReason: toSafeString(args.reason),
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();
}

export async function restoreImageAsset(assetId: string) {
  const model = await getImageAssetModel();
  return await model
    .findOneAndUpdate(
      { assetId: toSafeString(assetId) },
      {
        $set: {
          state: "active",
          updatedAt: toIsoNow(),
        },
        $unset: {
          deletedAt: "",
          deletedBy: "",
          deleteReason: "",
          hardDeletedAt: "",
        },
      },
      { new: true },
    )
    .lean();
}

export async function removeImageFileByUrl(url: string) {
  const removedR2 = await deleteR2PublicObjectByUrl(url).catch(() => false);
  if (removedR2) return true;

  return deleteLegacyGenStudioImage(url);
}

export async function hardDeleteImageAsset(args: { assetId: string; deletedBy?: string; reason?: string }) {
  const model = await getImageAssetModel();
  const found = await model.findOne({ assetId: toSafeString(args.assetId) }).lean();
  if (!found) return null;

  await removeImageObjectByStorage(found?.storage);

  return await model
    .findOneAndUpdate(
      { assetId: toSafeString(args.assetId) },
      {
        $set: {
          state: "deleted",
          deletePolicy: "hard",
          deletedAt: toIsoNow(),
          hardDeletedAt: toIsoNow(),
          deletedBy: toSafeString(args.deletedBy),
          deleteReason: toSafeString(args.reason),
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();
}

export async function markAssetsDeletedByJob(args: {
  jobId: string;
  deletedBy?: string;
  reason?: string;
  policy?: ImageDeletePolicyType | string;
}) {
  const model = await getImageAssetModel();
  await model.updateMany(
    { jobId: toSafeString(args.jobId), state: { $in: ["active", "detached"] } },
    {
      $set: {
        state: "deleted",
        deletePolicy: toDeletePolicy(args.policy || "soft"),
        deletedAt: toIsoNow(),
        deletedBy: toSafeString(args.deletedBy),
        deleteReason: toSafeString(args.reason),
        updatedAt: toIsoNow(),
      },
    },
  );
}

export async function runSoftDeleteGc(args?: { olderThanDays?: number; limit?: number; dryRun?: boolean }) {
  const model = await getImageAssetModel();
  const olderThanDays = Math.max(1, Number(args?.olderThanDays || 7));
  const limit = Math.max(1, Math.min(500, Number(args?.limit || 100)));
  const dryRun = Boolean(args?.dryRun);
  const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const targets = await model
    .find({
      state: "deleted",
      deletePolicy: { $in: ["soft", "hard"] },
      deletedAt: { $lte: threshold },
      $or: [{ hardDeletedAt: null }, { hardDeletedAt: { $exists: false } }],
    })
    .sort({ deletedAt: 1 })
    .limit(limit)
    .lean();

  type ImageAssetCleanupTarget = { assetId?: string; storage?: Record<string, unknown> };
  const typedTargets = targets as ImageAssetCleanupTarget[];

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      candidates: typedTargets.map((t) => String(t.assetId || "")),
      processed: 0,
    };
  }

  let processed = 0;
  for (const t of typedTargets) {
    const removed = await removeImageObjectByStorage(t?.storage);
    if (!removed) continue;

    await model.updateOne(
      { assetId: String(t?.assetId || "") },
      {
        $set: {
          hardDeletedAt: toIsoNow(),
          updatedAt: toIsoNow(),
        },
      },
    );
    processed++;
  }

  return {
    ok: true,
    dryRun: false,
    candidates: typedTargets.map((t) => String(t.assetId || "")),
    processed,
  };
}

export async function setImageAssetVisibility(args: { assetId: string; visibility: PromptVisibilityType }) {
  const model = await getImageAssetModel();
  const assetId = toSafeString(args.assetId);
  const visibility = args.visibility === "public" ? "public" : "private";
  const found = await model.findOne({ assetId }).lean();
  if (!found) return null;

  const storage = toRecord(found.storage);
  const shouldMoveR2 =
    toSafeString(storage.driver) === "r2" &&
    toSafeString(storage.bucket) &&
    toSafeString(storage.key) &&
    ((visibility === "public" && !isR2PublicStorage(storage)) || (visibility === "private" && !isR2PrivateStorage(storage)));

  const moved = shouldMoveR2
    ? await moveR2StorageForVisibility(storage, visibility)
    : {
        storage,
        cleanup: null as null | { bucket: string; key: string },
        rollback: null as null | { bucket: string; key: string },
      };

  try {
    const updated = await model
      .findOneAndUpdate(
        { assetId },
        {
          $set: {
            visibility,
            storage: moved.storage,
            updatedAt: toIsoNow(),
          },
        },
        { new: true },
      )
      .lean();
    if (!updated) throw new Error("image_asset_visibility_update_failed");

    if (moved.cleanup) {
      await deleteR2Object(moved.cleanup).catch(() => false);
    }

    return updated;
  } catch (error) {
    if (moved.rollback) await deleteR2Object(moved.rollback).catch(() => false);
    throw error;
  }
}

export async function setImageAssetTemplateKey(args: { assetId: string; templateKey?: string }) {
  const model = await getImageAssetModel();
  return await model
    .findOneAndUpdate(
      { assetId: toSafeString(args.assetId) },
      {
        $set: {
          templateKey: toSafeString(args.templateKey),
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();
}
