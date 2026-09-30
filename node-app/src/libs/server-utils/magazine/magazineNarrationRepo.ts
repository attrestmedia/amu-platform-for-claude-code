import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MagazineNarrationSchema,
  type IMagazineNarrationDocument,
} from "models/magazine";
import {
  isMagazineNarrationContentRef,
  MAGAZINE_NARRATION_CONTRACT_TYPE,
  MAGAZINE_NARRATION_SCHEMA_VERSION,
  type MagazineNarrationContentRef,
  type MagazineNarrationInvalidation,
  type MagazineNarrationPlaylist,
  type MagazineNarrationSegment,
  type MagazineNarrationSource,
  type MagazineNarrationState,
} from "./magazineNarrationContract";
import { logger } from "utils/log";

const MODEL_NAME = "MagazineNarration";
const COLLECTION_NAME = "magazine_narrations";
const CONTRACT_FILTER = {
  contractType: MAGAZINE_NARRATION_CONTRACT_TYPE,
  schemaVersion: MAGAZINE_NARRATION_SCHEMA_VERSION,
} as const;

export type MagazineNarrationProjection = {
  narrationId: string;
  contentRefKey: string;
  contentRef: MagazineNarrationContentRef;
  articleRevision: string;
  source: MagazineNarrationSource;
  playlist: MagazineNarrationPlaylist;
  segments: MagazineNarrationSegment[];
  status: MagazineNarrationState;
  publishedBy: string;
  publishedAt: string;
  invalidation?: MagazineNarrationInvalidation;
  invalidatedAt?: string | null;
  updatedAt: string;
};

export type MagazineNarrationReadResult =
  | { ok: true; data: MagazineNarrationProjection }
  | { ok: false; error: "not_found" | "unavailable" };

export type MagazineNarrationListResult =
  | { ok: true; data: MagazineNarrationProjection[] }
  | { ok: false; error: "unavailable" };

export type MagazineNarrationInsertResult =
  | { ok: true; data: MagazineNarrationProjection }
  | { ok: false; error: "conflict" | "unavailable" };

async function getNarrationModel() {
  return getModel<IMagazineNarrationDocument>(MONGODB_AMU_URL, MODEL_NAME, MagazineNarrationSchema, COLLECTION_NAME);
}

function validDate(value: unknown) {
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function projection(raw: unknown): MagazineNarrationProjection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<IMagazineNarrationDocument>;
  if (value.contractType !== MAGAZINE_NARRATION_CONTRACT_TYPE || value.schemaVersion !== MAGAZINE_NARRATION_SCHEMA_VERSION) return null;
  const narrationId = typeof value.narrationId === "string" ? value.narrationId.trim() : "";
  const contentRefKey = typeof value.contentRefKey === "string" ? value.contentRefKey.trim() : "";
  const articleRevision = typeof value.articleRevision === "string" ? value.articleRevision.trim() : "";
  const publishedBy = typeof value.publishedBy === "string" ? value.publishedBy.trim() : "";
  const publishedAt = validDate(value.publishedAt);
  const updatedAt = validDate(value.updatedAt);
  if (!narrationId || !contentRefKey || !/^[a-f0-9]{64}$/.test(articleRevision) || !publishedBy || !publishedAt || !updatedAt) return null;
  if (!isMagazineNarrationContentRef(value.contentRef) || value.contentRef.contentId !== contentRefKey) return null;
  if (!Array.isArray(value.segments) || !value.segments.length) return null;
  if (!["published", "invalidation_pending", "invalidated"].includes(String(value.status))) return null;
  return {
    narrationId,
    contentRefKey,
    contentRef: value.contentRef,
    articleRevision,
    source: value.source as MagazineNarrationSource,
    playlist: value.playlist as MagazineNarrationPlaylist,
    segments: value.segments as MagazineNarrationSegment[],
    status: value.status as MagazineNarrationState,
    publishedBy,
    publishedAt,
    ...(value.invalidation ? { invalidation: value.invalidation as MagazineNarrationInvalidation } : {}),
    invalidatedAt: value.invalidatedAt ? validDate(value.invalidatedAt) : null,
    updatedAt,
  };
}

export async function getMagazineNarration(args: { contentRefKey: string; articleRevision?: string }): Promise<MagazineNarrationReadResult> {
  const contentRefKey = String(args.contentRefKey || "").trim();
  if (!contentRefKey) return { ok: false, error: "not_found" };
  try {
    const model = await getNarrationModel();
    const document = await model.findOne({
      ...CONTRACT_FILTER,
      contentRefKey,
      ...(args.articleRevision ? { articleRevision: args.articleRevision } : {}),
    }).sort({ publishedAt: -1 }).lean();
    const data = projection(document);
    return data ? { ok: true, data } : { ok: false, error: "not_found" };
  } catch (error) {
    logger.error("[magazine-narration] read failed", { error: error instanceof Error ? error.message : "unknown", contentRefKey });
    return { ok: false, error: "unavailable" };
  }
}

export async function getMagazineNarrationById(narrationId: string): Promise<MagazineNarrationReadResult> {
  const value = String(narrationId || "").trim();
  if (!value) return { ok: false, error: "not_found" };
  try {
    const model = await getNarrationModel();
    const data = projection(await model.findOne({ ...CONTRACT_FILTER, narrationId: value }).lean());
    return data ? { ok: true, data } : { ok: false, error: "not_found" };
  } catch (error) {
    logger.error("[magazine-narration] id read failed", { error: error instanceof Error ? error.message : "unknown", narrationId: value });
    return { ok: false, error: "unavailable" };
  }
}

export async function listMagazineNarrationsByContentRefKey(contentRefKey: string): Promise<MagazineNarrationListResult> {
  const key = String(contentRefKey || "").trim();
  if (!key) return { ok: true, data: [] };
  try {
    const model = await getNarrationModel();
    const documents = await model.find({ ...CONTRACT_FILTER, contentRefKey }).sort({ publishedAt: -1 }).lean();
    const data = documents.map(projection).filter((item): item is MagazineNarrationProjection => Boolean(item));
    return { ok: true, data };
  } catch (error) {
    logger.error("[magazine-narration] list failed", { error: error instanceof Error ? error.message : "unknown", contentRefKey: key });
    return { ok: false, error: "unavailable" };
  }
}

export async function insertPublishedMagazineNarration(args: {
  narrationId: string;
  contentRefKey: string;
  contentRef: MagazineNarrationContentRef;
  articleRevision: string;
  source: MagazineNarrationSource;
  playlist: MagazineNarrationPlaylist;
  segments: MagazineNarrationSegment[];
  publishedBy: string;
  publishedAt?: Date;
}): Promise<MagazineNarrationInsertResult> {
  try {
    const model = await getNarrationModel();
    const document = await model.create({
      ...CONTRACT_FILTER,
      narrationId: args.narrationId,
      contentRefKey: args.contentRefKey,
      contentRef: args.contentRef,
      articleRevision: args.articleRevision,
      source: args.source,
      playlist: args.playlist,
      segments: args.segments,
      status: "published" as const,
      publishedBy: args.publishedBy,
      publishedAt: args.publishedAt || new Date(),
      invalidation: null,
      invalidatedAt: null,
    });
    const data = projection(document.toObject());
    return data ? { ok: true, data } : { ok: false, error: "unavailable" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/E11000|duplicate key/i.test(message)) return { ok: false, error: "conflict" };
    logger.error("[magazine-narration] insert failed", { error: message, contentRefKey: args.contentRefKey });
    return { ok: false, error: "unavailable" };
  }
}

export async function requestMagazineNarrationInvalidation(args: {
  narrationId: string;
  reason: MagazineNarrationInvalidation["reason"];
  actor: string;
  now?: Date;
}) {
  const now = args.now || new Date();
  return await (await getNarrationModel()).findOneAndUpdate(
    { ...CONTRACT_FILTER, narrationId: args.narrationId, status: { $in: ["published", "invalidation_pending"] } },
    {
      $set: {
        status: "invalidation_pending" as const,
        invalidation: {
          reason: args.reason,
          requestedBy: args.actor,
          requestedAt: now.toISOString(),
          lastAttemptAt: now.toISOString(),
        },
        updatedAt: now,
      },
    },
    { new: true },
  ).lean<IMagazineNarrationDocument>();
}

export async function markMagazineNarrationInvalidated(args: { narrationId: string; now?: Date }) {
  const now = args.now || new Date();
  return await (await getNarrationModel()).findOneAndUpdate(
    { ...CONTRACT_FILTER, narrationId: args.narrationId, status: "invalidation_pending" },
    { $set: { status: "invalidated" as const, invalidatedAt: now, updatedAt: now } },
    { new: true },
  ).lean<IMagazineNarrationDocument>();
}

export async function recordMagazineNarrationInvalidationFailure(args: { narrationId: string; error: string; now?: Date }) {
  const now = args.now || new Date();
  return await (await getNarrationModel()).findOneAndUpdate(
    { ...CONTRACT_FILTER, narrationId: args.narrationId, status: "invalidation_pending" },
    {
      $set: {
        status: "invalidation_pending" as const,
        "invalidation.lastError": String(args.error || "cleanup_failed").slice(0, 300),
        "invalidation.lastAttemptAt": now.toISOString(),
        updatedAt: now,
      },
    },
    { new: true },
  ).lean<IMagazineNarrationDocument>();
}
