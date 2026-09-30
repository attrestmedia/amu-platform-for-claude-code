import "server-only";
import crypto from "crypto";
import { getModel } from "libs/database/modelCache";
import {
  ContentGenJobSchema,
  type IContentGenJobDocument,
  ContentAssetSchema,
  type IContentAssetDocument,
} from "models/lab";
import { MONGODB_AI_URL } from "consts/env/server";
import type { TextProviderType, UserScopeType } from "types/ai";
import type { PromptGenType, PromptVisibilityType, PromptVisibilityExtendedType, StudioGenerationSourceServiceType } from "types/app";
import type { ContentDeletePolicyType, ContentGenJobStatusType } from "models/lab/ContentGenJobSchema";
import { CONTENT_ASSET_CARD_PREVIEW_MAX_CHARS } from "utils/lab/contentAssetPreview";
import { buildContentAssetPreviewMatch } from "utils/lab/contentAssetPolicy";
import { listContentPrompts } from "./contentPromptRepo";

const JOB_COLLECTION = "content_gen_jobs";
const ASSET_COLLECTION = "content_assets";

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toIsoNow() {
  return new Date();
}

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function toDeletePolicy(raw?: string): ContentDeletePolicyType {
  const p = toSafeString(raw).toLowerCase();
  if (p === "hard") return "hard";
  if (p === "detach") return "detach";
  return "soft";
}

function toJobStatus(raw?: string): ContentGenJobStatusType {
  const s = toSafeString(raw).toLowerCase();
  if (s === "queued" || s === "running" || s === "success" || s === "failed" || s === "partial") return s;
  return "queued";
}

function toVisibility(raw?: string): PromptVisibilityType {
  return toSafeString(raw).toLowerCase() === "public" ? "public" : "private";
}

function isDuplicateKeyError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate?.code === 11000 || String(candidate?.message || "").includes("E11000");
}

async function getContentGenJobModel() {
  return await getModel<IContentGenJobDocument>(MONGODB_AI_URL, "ContentGenJob", ContentGenJobSchema, JOB_COLLECTION);
}

async function getContentAssetModel() {
  return await getModel<IContentAssetDocument>(MONGODB_AI_URL, "ContentAsset", ContentAssetSchema, ASSET_COLLECTION);
}

function buildContentMeta(text: string) {
  const safeText = String(text || "");
  return {
    text: safeText,
    chars: safeText.length,
    bytes: Buffer.byteLength(safeText, "utf8"),
    sha256: safeText ? crypto.createHash("sha256").update(safeText, "utf8").digest("hex") : "",
  };
}

export async function createContentGenJob(input: {
  scope: UserScopeType;
  uid?: string;
  universeId?: string;
  createdBy?: string;
  provider: TextProviderType;
  modelName: string;
  request?: Record<string, unknown>;
  deletePolicy?: ContentDeletePolicyType | string;
  status?: ContentGenJobStatusType | string;
}) {
  const model = await getContentGenJobModel();
  const now = toIsoNow();
  const doc = await model.create({
    jobId: makeId("content_job"),
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
  return (doc.toObject?.() ?? doc) as IContentGenJobDocument;
}

export type ContentGenJobClaimResult = {
  owner: boolean;
  job: IContentGenJobDocument;
};

/**
 * clientRequestId가 있는 유료 콘텐츠 요청의 단일 owner를 Mongo 원자 연산으로 정한다.
 * 새 요청과 failed 재시도만 running으로 전이할 수 있고, queued/running/terminal Job은 재사용된다.
 */
export async function claimContentGenJob(input: {
  scope: UserScopeType;
  uid?: string;
  universeId?: string;
  createdBy?: string;
  provider: TextProviderType;
  modelName: string;
  clientRequestId: string;
  request?: Record<string, unknown>;
  deletePolicy?: ContentDeletePolicyType | string;
}): Promise<ContentGenJobClaimResult> {
  const clientRequestId = toSafeString(input.clientRequestId);
  if (!clientRequestId) throw new Error("clientRequestId_required");

  const uid = toSafeString(input.uid);
  const universeId = toSafeString(input.universeId);
  const identity = {
    scope: input.scope,
    uid,
    universeId,
    "request.kind": "commerce-product-content",
    "request.clientRequestId": clientRequestId,
  };
  const claimToken = makeId("content_claim");
  const now = toIsoNow();
  const request = { ...(input.request || {}), clientRequestId, claimToken };

  let job: unknown;
  try {
    job = await (await getContentGenJobModel())
      .findOneAndUpdate(
        { ...identity, status: "failed" },
        {
          $set: {
            provider: input.provider,
            modelName: toSafeString(input.modelName),
            request,
            status: "running",
            outputCount: 0,
            billing: {},
            error: null,
            startedAt: now,
            completedAt: null,
            updatedAt: now,
          },
          $setOnInsert: {
            jobId: makeId("content_job"),
            scope: input.scope,
            uid,
            universeId,
            createdBy: toSafeString(input.createdBy || input.uid),
            deletePolicy: toDeletePolicy(input.deletePolicy),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean();
  } catch (error) {
    // 다른 요청이 unique key를 먼저 insert한 경우에만 기존 문서를 읽는다.
    // 그 외 DB 오류는 owner로 간주하지 않고 그대로 fail-closed 한다.
    if (!isDuplicateKeyError(error)) throw error;
    job = await (await getContentGenJobModel()).findOne(identity).lean();
    if (!job) throw error;
  }

  const claimed = job as IContentGenJobDocument;
  const storedClaimToken = toSafeString(claimed.request?.claimToken);
  return {
    owner: storedClaimToken === claimToken && claimed.status === "running",
    job: claimed,
  };
}

export async function markContentGenJobSuccess(args: {
  jobId: string;
  outputCount: number;
  billing?: Record<string, unknown>;
  status?: "success" | "partial";
}) {
  const model = await getContentGenJobModel();
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

export async function markContentGenJobRunning(args: {
  jobId: string;
  provider?: TextProviderType;
  modelName?: string;
  request?: Record<string, unknown>;
}) {
  const model = await getContentGenJobModel();
  const set: Record<string, unknown> = {
    status: "running",
    startedAt: toIsoNow(),
    updatedAt: toIsoNow(),
  };
  if (args.provider) set.provider = args.provider;
  if (toSafeString(args.modelName)) set.modelName = toSafeString(args.modelName);
  // enqueue 시점 request는 최소 정보만 담기므로 실제 실행 시점 값으로 덮어쓴다.
  if (args.request) set.request = args.request;

  return await model.findOneAndUpdate({ jobId: toSafeString(args.jobId) }, { $set: set }, { new: true }).lean();
}

export async function getContentGenJobByJobId(jobId: string) {
  const id = toSafeString(jobId);
  if (!id) return null;

  const model = await getContentGenJobModel();
  return await model.findOne({ jobId: id }).lean();
}

export async function listContentGenJobsByJobIds(jobIds: string[]) {
  const ids = Array.from(new Set((jobIds || []).map((id) => toSafeString(id)).filter(Boolean)));
  if (!ids.length) return [];

  const model = await getContentGenJobModel();
  return await model.find({ jobId: { $in: ids } }).lean();
}

export async function getContentGenJobByClientRequestId(args: { uid: string; clientRequestId: string }) {
  const uid = toSafeString(args.uid);
  const clientRequestId = toSafeString(args.clientRequestId);
  if (!uid || !clientRequestId) return null;

  const model = await getContentGenJobModel();
  return await model
    .findOne({ "request.clientRequestId": clientRequestId, $or: [{ scope: "user", uid }, { createdBy: uid }] })
    .sort({ createdAt: -1 })
    .lean();
}

export async function markContentGenJobFailed(args: { jobId: string; reason?: string; code?: string }) {
  const model = await getContentGenJobModel();
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

export async function createContentAssets(input: {
  jobId: string;
  scope: UserScopeType;
  uid?: string;
  universeId?: string;
  contents: string[];
  provider: TextProviderType;
  modelName: string;
  templateKey?: string;
  generationMode?: PromptGenType;
  extraPrompt?: string;
  deletePolicy?: ContentDeletePolicyType | string;
  visibility?: PromptVisibilityType;
  sourceService?: StudioGenerationSourceServiceType;
  sourceSurface?: string;
}) {
  const model = await getContentAssetModel();
  const contents = (input.contents || []).map((v) => String(v || "").trim()).filter(Boolean);
  if (!contents.length) return [];

  const docs = contents.map((text, index) => ({
    assetId: makeId("content_asset"),
    jobId: toSafeString(input.jobId),
    scope: input.scope,
    uid: toSafeString(input.uid),
    universeId: toSafeString(input.universeId),
    provider: input.provider,
    modelName: toSafeString(input.modelName),
    templateKey: toSafeString(input.templateKey),
    generationMode: input.generationMode === "template" ? "template" : "custom",
    extraPrompt: toSafeString(input.extraPrompt),
    outputIndex: index,
    content: buildContentMeta(text),
    state: "active",
    deletePolicy: toDeletePolicy(input.deletePolicy),
    visibility: toVisibility(input.visibility),
    sourceService: input.sourceService || "unknown",
    sourceSurface: toSafeString(input.sourceSurface) || "unknown",
  }));

  const inserted = await model.insertMany(docs, { ordered: true });
  return inserted.map((d) => ((d as { toObject?: () => IContentAssetDocument }).toObject?.() ?? (d as IContentAssetDocument)) as IContentAssetDocument);
}

export async function listContentAssets(params: {
  scope?: UserScopeType | "all";
  uid?: string;
  universeId?: string;
  assetId?: string;
  assetIds?: string[];
  jobId?: string;
  jobIds?: string[];
  templateKey?: string;
  modelName?: string;
  state?: "active" | "deleted" | "detached" | "all";
  limit?: number;
  visibility?: PromptVisibilityExtendedType;
}) {
  const model = await getContentAssetModel();
  const cond: Record<string, unknown> = {};

  const visibility = toSafeString(params.visibility || "all").toLowerCase();
  if (visibility === "private" || visibility === "public") cond.visibility = visibility;

  const scope = toSafeString(params.scope || "all");
  if (scope === "user" || scope === "universe") cond.scope = scope;
  if (scope === "universe") cond.universeId = toSafeString(params.universeId);
  const uid = toSafeString(params.uid);
  if (uid) cond.uid = uid;

  const templateKey = toSafeString(params.templateKey);
  if (templateKey) cond.templateKey = templateKey;

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

  const limit = Math.max(1, Math.min(200, Number(params.limit || 50)));
  return await model.find(cond).sort({ createdAt: -1, outputIndex: 1 }).limit(limit).lean();
}

export async function listContentAssetPreviewsByTemplateKeys(args: {
  templateKeys: string[];
  perTemplate?: number;
  scope?: UserScopeType | "all";
  uid?: string;
  universeId?: string;
  visibility?: PromptVisibilityExtendedType;
}) {
  const model = await getContentAssetModel();
  const templateKeys = Array.from(new Set((args.templateKeys || []).map((key) => toSafeString(key)).filter(Boolean)));
  const perTemplate = Math.max(1, Math.min(6, Number(args.perTemplate || 2)));

  if (!templateKeys.length) {
    return [] as Array<{
      templateKey: string;
      rows: Array<{
        assetId: string;
        templateKey: string;
        visibility: PromptVisibilityType;
        uid?: string;
        createdAt: Date | string | null;
        textPreview: string;
        chars: number;
      }>;
    }>;
  }

  const match = buildContentAssetPreviewMatch({ ...args, templateKeys });

  return await model
    .aggregate([
      {
        $match: match,
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
              templateKey: "$templateKey",
              visibility: "$visibility",
              uid: "$uid",
              createdAt: "$createdAt",
              textPreview: {
                $substrCP: [{ $ifNull: ["$content.text", ""] }, 0, CONTENT_ASSET_CARD_PREVIEW_MAX_CHARS],
              },
              chars: { $ifNull: ["$content.chars", 0] },
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

export async function getContentAssetByAssetId(assetId: string) {
  const model = await getContentAssetModel();
  return await model.findOne({ assetId: toSafeString(assetId) }).lean();
}

export async function softDeleteContentAsset(args: {
  assetId: string;
  deletedBy?: string;
  reason?: string;
  policy?: ContentDeletePolicyType | string;
}) {
  const model = await getContentAssetModel();
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

export async function detachContentAsset(args: { assetId: string; deletedBy?: string; reason?: string }) {
  const model = await getContentAssetModel();
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

export async function restoreContentAsset(assetId: string) {
  const model = await getContentAssetModel();
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

export async function hardDeleteContentAsset(args: { assetId: string; deletedBy?: string; reason?: string }) {
  const model = await getContentAssetModel();
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

export async function setContentAssetVisibility(args: { assetId: string; visibility: PromptVisibilityType }) {
  const model = await getContentAssetModel();
  return await model
    .findOneAndUpdate(
      { assetId: toSafeString(args.assetId) },
      {
        $set: {
          visibility: toVisibility(args.visibility),
          updatedAt: toIsoNow(),
        },
      },
      { new: true },
    )
    .lean();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function getContentTemplateTitleMap(templateKeys: string[]) {
  const keys = Array.from(new Set(templateKeys.map((key) => toSafeString(key)).filter(Boolean)));
  if (!keys.length) return {} as Record<string, string>;

  const rows = await listContentPrompts({ keys, limit: keys.length });
  return (rows || []).reduce<Record<string, string>>((acc, row) => {
    const rec = toRecord(row);
    const key = toSafeString(rec.key);
    if (key) acc[key] = toSafeString(rec.title);
    return acc;
  }, {});
}

/**
 * 알림 센터용 콘텐츠 생성 Job 목록.
 * 이미지 Job 알림과 동일한 계약을 따르되 결과물은 URL이 아니라 텍스트 미리보기다.
 */
export async function listStudioContentJobNotifications(args: {
  uid: string;
  limit?: number;
  unreadOnly?: boolean;
  includeRunning?: boolean;
  since?: Date;
  /** 특정 job만 확정 조회한다. 지정 시 기간·읽음·목록 상한을 적용하지 않는다. */
  jobIds?: string[];
}) {
  const uid = toSafeString(args.uid);
  if (!uid) return [];

  const requestedJobIds = Array.from(new Set((args.jobIds || []).map((jobId) => toSafeString(jobId)).filter(Boolean)));
  const isTargetedLookup = requestedJobIds.length > 0;
  const model = await getContentGenJobModel();
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
  const jobIds = jobs.map((job) => toSafeString(toRecord(job).jobId)).filter(Boolean);
  if (!jobIds.length) return [];

  const [assets, titleByTemplateKey] = await Promise.all([
    listContentAssets({ scope: "all", jobIds, state: "active", limit: limit * 6 }),
    getContentTemplateTitleMap(jobs.map((job) => toSafeString(toRecord(toRecord(job).request).templateKey))),
  ]);

  const assetsByJobId: Record<string, Array<Record<string, unknown>>> = {};
  (assets || []).forEach((asset) => {
    const assetRec = toRecord(asset);
    const jobId = toSafeString(assetRec.jobId);
    if (!jobId) return;

    const content = toRecord(assetRec.content);
    const text = String(content.text || "");
    if (!assetsByJobId[jobId]) assetsByJobId[jobId] = [];
    assetsByJobId[jobId].push({
      assetId: toSafeString(assetRec.assetId),
      jobId,
      templateKey: toSafeString(assetRec.templateKey),
      visibility: toSafeString(assetRec.visibility) || "private",
      createdAt: assetRec.createdAt || null,
      provider: toSafeString(assetRec.provider),
      modelName: toSafeString(assetRec.modelName),
      generationMode: toSafeString(assetRec.generationMode) || "custom",
      outputIndex: Number(assetRec.outputIndex || 0),
      textPreview: text.slice(0, CONTENT_ASSET_CARD_PREVIEW_MAX_CHARS),
      chars: Number(content.chars || 0),
      bytes: Number(content.bytes || 0),
    });
  });

  return jobs.map((job) => {
    const jobRec = toRecord(job);
    const jobId = toSafeString(jobRec.jobId);
    const request = toRecord(jobRec.request);
    const billing = toRecord(jobRec.billing);
    const error = toRecord(jobRec.error);
    const notification = toRecord(jobRec.notification);
    const templateKey = toSafeString(request.templateKey);
    return {
      jobId,
      status: toSafeString(jobRec.status),
      templateKey,
      templateTitle: toSafeString(request.templateTitle) || toSafeString(titleByTemplateKey[templateKey]),
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

export async function markStudioContentJobNotificationRead(args: { uid: string; jobId: string }) {
  const uid = toSafeString(args.uid);
  const jobId = toSafeString(args.jobId);
  if (!uid || !jobId) return null;

  const model = await getContentGenJobModel();
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
