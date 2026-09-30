import "server-only";
import crypto from "crypto";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  CommerceDraftRevisionSchema,
  CommerceProductDraftSchema,
  type ICommerceDraftRevisionDocument,
  type ICommerceProductDraftDocument,
  type CommerceDraftStatusType,
  type CommerceDraftSourceType,
} from "models/commerce";
import {
  CommerceDraftPublishInProgressError,
  CommerceDraftRevisionConflictError,
  normalizeCommerceDraftRevision,
} from "libs/server-utils/commerce/commerceDraftContract";

const DRAFT_COLLECTION = "commerce_product_drafts";
const REVISION_COLLECTION = "commerce_draft_revisions";
const PUBLISH_LOCK_TTL_MS = 10 * 60 * 1000;
const DRAFT_REVISION_OPERATION_KEY_PATH = "snapshot.__commerceOperationKey";
const MAX_OPERATION_KEY_LENGTH = 240;

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toSafeDate(value?: Date | string | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function toDraftStatus(raw?: string): CommerceDraftStatusType {
  const value = toSafeString(raw).toLowerCase();
  if (
    value === "draft" ||
    value === "needs_review" ||
    value === "ready" ||
    value === "publishing" ||
    value === "published" ||
    value === "publish_failed" ||
    value === "archived"
  ) {
    return value;
  }
  return "draft";
}

function toDraftSource(raw?: string): CommerceDraftSourceType {
  const value = toSafeString(raw).toLowerCase();
  if (
    value === "manual" ||
    value === "imported_from_naver" ||
    value === "generated_by_ai" ||
    value === "mixed"
  ) {
    return value;
  }
  return "manual";
}

function uniqueStrings(list?: string[]) {
  return Array.from(new Set((list || []).map((value) => toSafeString(value)).filter(Boolean)));
}

function toValidationMessages(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeValidationForStorage(validation?: Record<string, unknown>) {
  const raw = validation || {};
  const errorMessages = toValidationMessages(raw.errorMessages ?? raw.errors);
  const rest = { ...raw };
  delete (rest as { errors?: unknown }).errors;

  return {
    ...rest,
    errorMessages,
    warnings: toValidationMessages(raw.warnings),
    ready: Boolean(raw.ready),
    allowlistMatched: Boolean(raw.allowlistMatched),
    lastCheckedAt: toSafeDate(raw.lastCheckedAt as Date | string | null | undefined),
    rulesVersion: toSafeString(raw.rulesVersion),
  };
}

function normalizeDraftForResponse<T>(doc?: T | null): T | null {
  if (!doc) return null;
  const raw = ((doc as { toObject?: () => Record<string, unknown> }).toObject?.() ?? doc) as Record<string, unknown>;
  const validation = (raw.validation && typeof raw.validation === "object" ? raw.validation : {}) as Record<string, unknown>;
  const errors = toValidationMessages(validation.errorMessages ?? validation.errors);
  const warnings = toValidationMessages(validation.warnings);

  return {
    ...raw,
    revision: normalizeCommerceDraftRevision(raw.revision),
    validation: {
      ...validation,
      errors,
      warnings,
      errorMessages: undefined,
    },
  } as T;
}

function revisionFilter(expectedRevision?: number) {
  if (expectedRevision === undefined) return {};
  return expectedRevision === 1
    ? { $or: [{ revision: 1 }, { revision: { $exists: false } }] }
    : { revision: expectedRevision };
}

function toPublishLockDate(value: unknown) {
  return toSafeDate(value as Date | string | null | undefined);
}

function isPublishLockActive(doc: Record<string, unknown> | null | undefined, now = Date.now()) {
  if (!doc) return false;
  const lockAt = toPublishLockDate(doc.publishLockAt);
  if (toSafeString(doc.status) === "publishing") {
    return !lockAt || lockAt.getTime() > now - PUBLISH_LOCK_TTL_MS;
  }
  const lockedBy = toSafeString(doc.lockedBy);
  return Boolean(lockedBy && lockAt && lockAt.getTime() > now - PUBLISH_LOCK_TTL_MS);
}

function publishMutationFilter(expectedRevision?: number) {
  const staleBefore = new Date(Date.now() - PUBLISH_LOCK_TTL_MS);
  const revisionCondition = revisionFilter(expectedRevision);
  return {
    $and: [
      ...(Object.keys(revisionCondition).length > 0 ? [revisionCondition] : []),
      { $or: [{ status: { $ne: "publishing" } }, { status: "publishing", publishLockAt: { $lte: staleBefore } }] },
    ],
  };
}

function normalizeDraftsForResponse<T>(docs: T[]) {
  return docs.map((doc) => normalizeDraftForResponse(doc)).filter(Boolean) as T[];
}

function sanitizeDraftPatch(patch?: Record<string, unknown>) {
  const next = { ...(patch || {}) };
  delete next.draftId;
  delete next.universeId;
  delete next.createdAt;
  delete next.createdBy;
  if (next.validation && typeof next.validation === "object") {
    next.validation = normalizeValidationForStorage(next.validation as Record<string, unknown>);
  }
  if (Array.isArray(next["validation.errors"])) {
    next["validation.errorMessages"] = next["validation.errors"];
    delete next["validation.errors"];
  }
  return next;
}

function pickRevisionSnapshot(doc?: Record<string, unknown> | null) {
  const raw = doc || {};
  return {
    status: raw.status || "",
    display: raw.display || {},
    smartstore: raw.smartstore || {},
    validation: raw.validation || {},
    review: raw.review || {},
    publish: raw.publish || {},
  };
}

async function getCommerceProductDraftModel() {
  return await getModel<ICommerceProductDraftDocument>(
    MONGODB_AMU_URL,
    "CommerceProductDraft",
    CommerceProductDraftSchema,
    DRAFT_COLLECTION,
  );
}

async function getCommerceDraftRevisionModel() {
  return await getModel<ICommerceDraftRevisionDocument>(
    MONGODB_AMU_URL,
    "CommerceDraftRevision",
    CommerceDraftRevisionSchema,
    REVISION_COLLECTION,
  );
}

function normalizeOperationKey(value: unknown) {
  return toSafeString(value).slice(0, MAX_OPERATION_KEY_LENGTH);
}

export function buildCommerceDraftPostprocessOperationKey(args: {
  draftId: string;
  variant: string;
  referenceHash: string;
  attempt?: number;
}) {
  const attempt = Number.isFinite(Number(args.attempt)) && Number(args.attempt) > 0 ? Number(args.attempt) : 1;
  return [
    toSafeString(args.draftId),
    toSafeString(args.variant),
    toSafeString(args.referenceHash) || "noref",
    `a${attempt}`,
  ].join(":");
}

async function findCommerceDraftRevisionByOperationKey(draftId: string, operationKey?: string) {
  const normalizedOperationKey = normalizeOperationKey(operationKey);
  if (!normalizedOperationKey) return null;

  const model = await getCommerceDraftRevisionModel();
  return await model
    .findOne({
      draftId: toSafeString(draftId),
      [DRAFT_REVISION_OPERATION_KEY_PATH]: normalizedOperationKey,
    })
    .lean();
}

export async function createCommerceDraft(input: {
  universeId: string;
  provider?: "naver";
  status?: CommerceDraftStatusType | string;
  source?: CommerceDraftSourceType | string;
  display?: Record<string, unknown>;
  smartstore?: Record<string, unknown>;
  assets?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  publish?: Record<string, unknown>;
  review?: Record<string, unknown>;
  createdBy: string;
  updatedBy?: string;
}) {
  const model = await getCommerceProductDraftModel();
  const doc = await model.create({
    draftId: makeId("commerce_draft"),
    universeId: toSafeString(input.universeId),
    revision: 1,
    provider: "naver",
    status: toDraftStatus(input.status),
    source: toDraftSource(input.source),
    display: input.display || {},
    smartstore: input.smartstore || {},
    assets: {
      imageAssetIds: uniqueStrings((input.assets as Record<string, unknown> | undefined)?.imageAssetIds as string[] | undefined),
      contentAssetIds: uniqueStrings((input.assets as Record<string, unknown> | undefined)?.contentAssetIds as string[] | undefined),
      selectedRepresentativeImageAssetId: toSafeString(
        (input.assets as Record<string, unknown> | undefined)?.selectedRepresentativeImageAssetId,
      ),
      selectedDescriptionContentAssetId: toSafeString(
        (input.assets as Record<string, unknown> | undefined)?.selectedDescriptionContentAssetId,
      ),
      selectedModelReferenceKitIds: uniqueStrings(
        (input.assets as Record<string, unknown> | undefined)?.selectedModelReferenceKitIds as string[] | undefined,
      ),
    },
    validation: {
      ...normalizeValidationForStorage(input.validation),
    },
    publish: {
      publishCount: Number((input.publish as Record<string, unknown> | undefined)?.publishCount || 0),
      failureCount: Number((input.publish as Record<string, unknown> | undefined)?.failureCount || 0),
      ...(input.publish || {}),
    },
    review: {
      factualConfirmed: Boolean((input.review as Record<string, unknown> | undefined)?.factualConfirmed),
      representativeImageConfirmed: Boolean((input.review as Record<string, unknown> | undefined)?.representativeImageConfirmed),
      aiDisclosureChecked: Boolean((input.review as Record<string, unknown> | undefined)?.aiDisclosureChecked),
      lastReviewedAt: toSafeDate((input.review as Record<string, unknown> | undefined)?.lastReviewedAt as Date | string | null | undefined),
      lastReviewedBy: toSafeString((input.review as Record<string, unknown> | undefined)?.lastReviewedBy),
    },
    createdBy: toSafeString(input.createdBy),
    updatedBy: toSafeString(input.updatedBy || input.createdBy),
  });

  return normalizeDraftForResponse(doc) as ICommerceProductDraftDocument;
}

export async function getCommerceDraftByDraftId(draftId: string) {
  const model = await getCommerceProductDraftModel();
  const doc = await model.findOne({ draftId: toSafeString(draftId) }).lean();
  return normalizeDraftForResponse(doc);
}

export async function findCommerceDraftBySmartstoreRef(args: {
  universeId: string;
  channelProductNo?: number | string;
  originProductNo?: number | string;
  includeArchived?: boolean;
}) {
  const model = await getCommerceProductDraftModel();
  const cond: Record<string, unknown> = {
    universeId: toSafeString(args.universeId),
  };

  const refs: Record<string, unknown>[] = [];
  const channelProductNo = Number(args.channelProductNo);
  if (Number.isFinite(channelProductNo) && channelProductNo > 0) {
    refs.push({ "smartstore.channelProductNo": channelProductNo });
  }

  const originProductNo = Number(args.originProductNo);
  if (Number.isFinite(originProductNo) && originProductNo > 0) {
    refs.push({ "smartstore.originProductNo": originProductNo });
  }

  if (refs.length === 0) return null;
  if (!args.includeArchived) cond.status = { $ne: "archived" };

  const doc = await model
    .findOne({
      ...cond,
      $or: refs,
    })
    .sort({ updatedAt: -1 })
    .lean();
  return normalizeDraftForResponse(doc);
}

export async function listCommerceDrafts(params: {
  universeId: string;
  status?: CommerceDraftStatusType | CommerceDraftStatusType[];
  provider?: "naver";
  source?: CommerceDraftSourceType | CommerceDraftSourceType[];
  includeArchived?: boolean;
  limit?: number;
}) {
  const model = await getCommerceProductDraftModel();
  const cond: Record<string, unknown> = {
    universeId: toSafeString(params.universeId),
  };

  const statuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  if (statuses.length > 0) cond.status = { $in: statuses };
  else if (!params.includeArchived) cond.status = { $ne: "archived" };

  const sources = Array.isArray(params.source) ? params.source : params.source ? [params.source] : [];
  if (sources.length > 0) cond.source = { $in: sources };

  const provider = toSafeString(params.provider || "naver");
  if (provider) cond.provider = provider;

  const limit = Math.max(1, Math.min(200, Number(params.limit || 50)));
  const docs = await model.find(cond).sort({ updatedAt: -1 }).limit(limit).lean();
  return normalizeDraftsForResponse(docs);
}

export async function updateCommerceDraft(args: {
  draftId: string;
  patch: Record<string, unknown>;
  updatedBy: string;
  expectedRevision?: number;
}) {
  const model = await getCommerceProductDraftModel();
  const patch = sanitizeDraftPatch(args.patch);
  const expectedRevision =
    args.expectedRevision === undefined ? undefined : normalizeCommerceDraftRevision(args.expectedRevision, 0);
  const doc = await model
    .findOneAndUpdate(
      {
        draftId: toSafeString(args.draftId),
        ...publishMutationFilter(expectedRevision),
      },
      {
        $set: {
          ...patch,
          updatedBy: toSafeString(args.updatedBy),
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true },
    )
    .lean();

  if (!doc && expectedRevision) {
    const current = await model.findOne({ draftId: toSafeString(args.draftId) }).lean();
    if (current) {
      if (isPublishLockActive(current as Record<string, unknown>)) {
        throw new CommerceDraftPublishInProgressError();
      }
      throw new CommerceDraftRevisionConflictError(expectedRevision, normalizeCommerceDraftRevision(current.revision));
    }
  }
  return normalizeDraftForResponse(doc);
}

export async function archiveCommerceDraft(args: { draftId: string; actor: string }) {
  const model = await getCommerceProductDraftModel();
  const doc = await model
    .findOneAndUpdate(
      { draftId: toSafeString(args.draftId) },
      {
        $set: {
          status: "archived",
          archivedAt: new Date(),
          updatedBy: toSafeString(args.actor),
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true },
    )
    .lean();
  return normalizeDraftForResponse(doc);
}

export async function createCommerceDraftRevision(input: {
  draftId: string;
  universeId: string;
  actor: string;
  source?: "manual_edit" | "ai_apply" | "ai_generate" | "import" | "validation" | "publish_result" | "storefront_sync";
  summary: string;
  patchMeta?: Record<string, unknown>;
  snapshot: Record<string, unknown>;
}) {
  const model = await getCommerceDraftRevisionModel();
  const doc = await model.create({
    revisionId: makeId("commerce_revision"),
    draftId: toSafeString(input.draftId),
    universeId: toSafeString(input.universeId),
    actor: toSafeString(input.actor),
    source: input.source || "manual_edit",
    summary: toSafeString(input.summary),
    patchMeta: input.patchMeta || {},
    snapshot: input.snapshot || {},
  });

  return (doc.toObject?.() ?? doc) as ICommerceDraftRevisionDocument;
}

export async function listCommerceDraftRevisions(params: {
  draftId?: string;
  universeId?: string;
  actor?: string;
  limit?: number;
}) {
  const model = await getCommerceDraftRevisionModel();
  const cond: Record<string, unknown> = {};

  const draftId = toSafeString(params.draftId);
  if (draftId) cond.draftId = draftId;

  const universeId = toSafeString(params.universeId);
  if (universeId) cond.universeId = universeId;

  const actor = toSafeString(params.actor);
  if (actor) cond.actor = actor;

  const limit = Math.max(1, Math.min(200, Number(params.limit || 50)));
  return await model.find(cond).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function setCommerceDraftValidation(args: {
  draftId: string;
  updatedBy: string;
  validation: {
    errors?: Array<{ code?: string; field?: string; message?: string }>;
    warnings?: Array<{ code?: string; field?: string; message?: string }>;
    allowlistMatched?: boolean;
    rulesVersion?: string;
  };
  nextStatus?: CommerceDraftStatusType | string;
  expectedRevision?: number;
}) {
  const model = await getCommerceProductDraftModel();
  const errors = Array.isArray(args.validation.errors) ? args.validation.errors : [];
  const warnings = Array.isArray(args.validation.warnings) ? args.validation.warnings : [];
  const ready = errors.length === 0;
  const status = args.nextStatus
    ? toDraftStatus(args.nextStatus)
    : ready
      ? "ready"
      : "needs_review";

  const doc = await model
    .findOneAndUpdate(
      { draftId: toSafeString(args.draftId), ...publishMutationFilter(args.expectedRevision) },
      {
        $set: {
          validation: {
            ready,
            errorMessages: errors,
            warnings,
            allowlistMatched: Boolean(args.validation.allowlistMatched),
            lastCheckedAt: new Date(),
            rulesVersion: toSafeString(args.validation.rulesVersion),
          },
          status,
          updatedBy: toSafeString(args.updatedBy),
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true },
    )
    .lean();
  if (!doc && args.expectedRevision !== undefined) {
    const current = await model.findOne({ draftId: toSafeString(args.draftId) }).lean();
    if (current) {
      if (isPublishLockActive(current as Record<string, unknown>)) {
        throw new CommerceDraftPublishInProgressError();
      }
      throw new CommerceDraftRevisionConflictError(
        normalizeCommerceDraftRevision(args.expectedRevision, 0),
        normalizeCommerceDraftRevision(current.revision),
      );
    }
  }
  return normalizeDraftForResponse(doc);
}

export async function claimCommerceDraftPublish(args: {
  draftId: string;
  expectedRevision: number;
  actor: string;
  validation: {
    errors?: Array<{ code?: string; field?: string; message?: string }>;
    warnings?: Array<{ code?: string; field?: string; message?: string }>;
    allowlistMatched?: boolean;
    rulesVersion?: string;
  };
}) {
  const model = await getCommerceProductDraftModel();
  const expectedRevision = normalizeCommerceDraftRevision(args.expectedRevision, 0);
  const now = new Date();
  const errors = Array.isArray(args.validation.errors) ? args.validation.errors : [];
  const warnings = Array.isArray(args.validation.warnings) ? args.validation.warnings : [];
  const doc = await model
    .findOneAndUpdate(
      {
        draftId: toSafeString(args.draftId),
        ...publishMutationFilter(expectedRevision),
      },
      {
        $set: {
          validation: {
            ready: true,
            errorMessages: errors,
            warnings,
            allowlistMatched: Boolean(args.validation.allowlistMatched),
            lastCheckedAt: now,
            rulesVersion: toSafeString(args.validation.rulesVersion),
          },
          status: "publishing",
          lockedBy: toSafeString(args.actor),
          publishLockAt: now,
          updatedBy: toSafeString(args.actor),
          updatedAt: now,
        },
        $inc: { revision: 1 },
      },
      { new: true },
    )
    .lean();

  if (doc) return normalizeDraftForResponse(doc);

  const current = await model.findOne({ draftId: toSafeString(args.draftId) }).lean();
  if (!current) return null;
  if (isPublishLockActive(current as Record<string, unknown>)) {
    throw new CommerceDraftPublishInProgressError();
  }
  throw new CommerceDraftRevisionConflictError(expectedRevision, normalizeCommerceDraftRevision(current.revision));
}

export async function releaseCommerceDraftPublish(args: {
  draftId: string;
  actor: string;
  status: "ready" | "publish_failed";
}) {
  const model = await getCommerceProductDraftModel();
  const doc = await model
    .findOneAndUpdate(
      { draftId: toSafeString(args.draftId), lockedBy: toSafeString(args.actor) },
      {
        $set: {
          status: args.status,
          updatedBy: toSafeString(args.actor),
          updatedAt: new Date(),
        },
        $unset: { lockedBy: 1, publishLockAt: 1 },
        $inc: { revision: 1 },
      },
      { new: true },
    )
    .lean();
  return normalizeDraftForResponse(doc);
}

export async function setCommerceDraftStatus(args: {
  draftId: string;
  status: CommerceDraftStatusType | string;
  updatedBy: string;
}) {
  const model = await getCommerceProductDraftModel();
  const doc = await model
    .findOneAndUpdate(
      { draftId: toSafeString(args.draftId) },
      {
        $set: {
          status: toDraftStatus(args.status),
          updatedBy: toSafeString(args.updatedBy),
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true },
    )
    .lean();
  return normalizeDraftForResponse(doc);
}

export async function attachCommerceDraftAssets(args: {
  draftId: string;
  updatedBy: string;
  operationKey?: string;
  imageAssetIds?: string[];
  contentAssetIds?: string[];
  selectedRepresentativeImageAssetId?: string;
  selectedDescriptionContentAssetId?: string;
}) {
  const model = await getCommerceProductDraftModel();
  const operationKey = normalizeOperationKey(args.operationKey);
  if (operationKey) {
    const existingRevision = await findCommerceDraftRevisionByOperationKey(args.draftId, operationKey);
    if (existingRevision) return await getCommerceDraftByDraftId(args.draftId);
  }

  const current = await model.findOne({ draftId: toSafeString(args.draftId) }).lean();
  if (!current) return null;

  const nextAssets = {
    imageAssetIds: uniqueStrings([...(current.assets?.imageAssetIds || []), ...(args.imageAssetIds || [])]),
    contentAssetIds: uniqueStrings([...(current.assets?.contentAssetIds || []), ...(args.contentAssetIds || [])]),
    selectedRepresentativeImageAssetId: toSafeString(
      args.selectedRepresentativeImageAssetId || current.assets?.selectedRepresentativeImageAssetId,
    ),
    selectedDescriptionContentAssetId: toSafeString(
      args.selectedDescriptionContentAssetId || current.assets?.selectedDescriptionContentAssetId,
    ),
  };

  const doc = await model
    .findOneAndUpdate(
      { draftId: toSafeString(args.draftId) },
      {
        $set: {
          assets: nextAssets,
          updatedBy: toSafeString(args.updatedBy),
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true },
    )
    .lean();
  return normalizeDraftForResponse(doc);
}

export async function bindCommerceDraftPublishResult(args: {
  draftId: string;
  updatedBy: string;
  operation: "create" | "update" | "sync";
  jobId: string;
  payloadHash: string;
  publishedAt?: Date | string | null;
  channelProductNo?: number;
  originProductNo?: number;
  statusType?: string;
  storefrontSnapshot?: Record<string, unknown>;
  failed?: boolean;
  lockedBy?: string;
}) {
  const model = await getCommerceProductDraftModel();
  const current = await model.findOne({ draftId: toSafeString(args.draftId) }).lean();
  if (!current) return null;

  const nextPublishCount = Number(current.publish?.publishCount || 0) + (args.failed ? 0 : 1);
  const nextFailureCount = Number(current.publish?.failureCount || 0) + (args.failed ? 1 : 0);
  // 실제 등록 시각 — 최초 성공 create 시 한 번만 확정하고 이후 갱신하지 않는다.
  const nextRegisteredAt =
    toSafeString(current.smartstore?.registeredAt) ||
    (!args.failed && args.operation === "create"
      ? (toSafeDate(args.publishedAt) || new Date()).toISOString()
      : "");
  const nextSmartstore = {
    ...(current.smartstore || {}),
    ...(typeof args.channelProductNo === "number" ? { channelProductNo: args.channelProductNo } : {}),
    ...(typeof args.originProductNo === "number" ? { originProductNo: args.originProductNo } : {}),
    ...(args.statusType ? { statusType: toSafeString(args.statusType) } : {}),
    ...(nextRegisteredAt ? { registeredAt: nextRegisteredAt } : {}),
  };
  const nextDisplay = args.storefrontSnapshot ? { ...(current.display || {}), ...args.storefrontSnapshot } : current.display || {};

  const doc = await model
    .findOneAndUpdate(
      {
        draftId: toSafeString(args.draftId),
        ...(args.lockedBy ? { lockedBy: toSafeString(args.lockedBy) } : {}),
      },
      {
        $set: {
          status: args.failed ? "publish_failed" : "published",
          smartstore: nextSmartstore,
          display: nextDisplay,
          publish: {
            ...(current.publish || {}),
            lastOperation: args.operation,
            lastJobId: toSafeString(args.jobId),
            lastPayloadHash: toSafeString(args.payloadHash),
            lastPublishedAt: args.failed ? current.publish?.lastPublishedAt || null : toSafeDate(args.publishedAt) || new Date(),
            lastSyncAt: args.operation === "sync" && !args.failed ? toSafeDate(args.publishedAt) || new Date() : current.publish?.lastSyncAt || null,
            lastPublishedBy: toSafeString(args.updatedBy),
            publishCount: nextPublishCount,
            failureCount: nextFailureCount,
          },
          updatedBy: toSafeString(args.updatedBy),
          updatedAt: new Date(),
        },
        $unset: { lockedBy: 1, publishLockAt: 1 },
        $inc: { revision: 1 },
      },
      { new: true },
    )
    .lean();
  return normalizeDraftForResponse(doc);
}

export async function snapshotCommerceDraftRevision(args: {
  draftId: string;
  actor: string;
  operationKey?: string;
  source?: "manual_edit" | "ai_apply" | "ai_generate" | "import" | "validation" | "publish_result" | "storefront_sync";
  summary: string;
  patchMeta?: Record<string, unknown>;
}) {
  const operationKey = normalizeOperationKey(args.operationKey);
  if (operationKey) {
    const existingRevision = await findCommerceDraftRevisionByOperationKey(args.draftId, operationKey);
    if (existingRevision) return existingRevision;
  }

  const draft = await getCommerceDraftByDraftId(args.draftId);
  if (!draft) return null;

  return await createCommerceDraftRevision({
    draftId: toSafeString(draft.draftId),
    universeId: toSafeString(draft.universeId),
    actor: args.actor,
    source: args.source,
    summary: args.summary,
    patchMeta: args.patchMeta,
    snapshot: {
      ...pickRevisionSnapshot(draft),
      ...(operationKey ? { __commerceOperationKey: operationKey } : {}),
    },
  });
}
