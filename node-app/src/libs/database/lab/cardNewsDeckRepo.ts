import "server-only";

import crypto from "crypto";
import { MONGODB_AI_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { CardNewsDeckSchema, type ICardNewsDeckDocument } from "models/lab";
import { logger } from "utils/log";
import {
  CARD_NEWS_DOCUMENT_VERSION,
  getDefaultCardNewsDeckPayload,
  migrateCardNewsDeckDocument,
  mergeCardNewsDeckPayload,
  parseCardNewsDeckPayload,
  pickCardNewsDeckPayload,
  type CardNewsDeck,
  type CardNewsDeckPayload,
  type CardNewsAgentDeckMetadata,
} from "types/card-news";

/**
 * @docHint
 * @purpose CardNews 사용자 덱 저장소
 * @process ownerUid 범위 조회  revision 낙관적 잠금  autosave 업데이트  soft-delete
 * @domain card-news
 * @scope server
 */

export const CARD_NEWS_DECK_COLLECTION = "card_news_decks";

export class CardNewsDeckValidationError extends Error {
  readonly errorCode = "INVALID_CARD_NEWS_DECK";
  readonly status = 400;
  readonly issues: Array<{ path: string; message: string }>;

  constructor(issues: Array<{ path: string; message: string }>) {
    super(issues[0]?.message || "CardDeck 문서가 유효하지 않습니다.");
    this.name = "CardNewsDeckValidationError";
    this.issues = issues;
  }
}

export class CardNewsDeckCorruptionError extends Error {
  readonly errorCode = "CORRUPT_CARD_NEWS_DECK";
  readonly status = 500;
  readonly deckId: string;
  readonly documentVersion: unknown;
  readonly issues: Array<{ path: string; message: string }>;

  constructor(input: { deckId: string; documentVersion: unknown; issues: Array<{ path: string; message: string }> }) {
    super("저장된 CardNews 덱을 현재 문서 계약으로 읽을 수 없습니다.");
    this.name = "CardNewsDeckCorruptionError";
    this.deckId = input.deckId;
    this.documentVersion = input.documentVersion;
    this.issues = input.issues;
  }
}

export type CardNewsDeckMutationResult =
  | { kind: "updated"; deck: CardNewsDeck }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "conflict"; current: CardNewsDeck };

function makeId() {
  return `carddeck_${crypto.randomUUID().replace(/-/g, "")}`;
}

function safeString(value: unknown) {
  return String(value || "").trim();
}

function safeDate(value: unknown, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function rawObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    const candidate = value as { toObject?: () => unknown };
    const objectValue = typeof candidate.toObject === "function" ? candidate.toObject() : value;
    if (objectValue && typeof objectValue === "object" && !Array.isArray(objectValue)) {
      return objectValue as Record<string, unknown>;
    }
  }
  return {};
}

function requireOwnerUid(value: unknown) {
  const uid = safeString(value);
  if (!uid) {
    const error = new Error("CARD_NEWS_OWNER_REQUIRED") as Error & { errorCode: string; status: number };
    error.errorCode = "CARD_NEWS_OWNER_REQUIRED";
    error.status = 401;
    throw error;
  }
  return uid;
}

function parseOrThrow(value: unknown): CardNewsDeckPayload {
  const parsed = parseCardNewsDeckPayload(value);
  if (!parsed.success) throw new CardNewsDeckValidationError(parsed.issues);
  return parsed.data;
}

function toDeck(value: unknown): CardNewsDeck {
  const raw = rawObject(value);
  const payload = payloadFromDocument(raw);
  return {
    ...payload,
    documentVersion: CARD_NEWS_DOCUMENT_VERSION,
    deckId: safeString(raw.deckId),
    ownerUid: safeString(raw.ownerUid),
    revision: Number.isInteger(raw.revision) && Number(raw.revision) > 0 ? Number(raw.revision) : 1,
    state: raw.state === "deleted" ? "deleted" : "active",
    createdAt: safeDate(raw.createdAt).toISOString(),
    updatedAt: safeDate(raw.updatedAt).toISOString(),
    ...(raw.deletedAt ? { deletedAt: safeDate(raw.deletedAt).toISOString() } : { deletedAt: null }),
    ...(raw.agentMetadata && typeof raw.agentMetadata === "object" && !Array.isArray(raw.agentMetadata)
      ? { agentMetadata: raw.agentMetadata as CardNewsAgentDeckMetadata }
      : {}),
  };
}

async function getCardNewsDeckModel() {
  return getModel<ICardNewsDeckDocument>(MONGODB_AI_URL, "CardNewsDeck", CardNewsDeckSchema, CARD_NEWS_DECK_COLLECTION);
}

function payloadFromDocument(value: unknown) {
  const raw = rawObject(value);
  const migrated = migrateCardNewsDeckDocument(raw);
  if (!migrated.success) {
    throw new CardNewsDeckCorruptionError({
      deckId: safeString(raw.deckId),
      documentVersion: raw.documentVersion,
      issues: migrated.issues,
    });
  }
  return migrated.data;
}

export async function createCardNewsDeck(input: { ownerUid: string; payload?: unknown }) {
  const ownerUid = requireOwnerUid(input.ownerUid);
  const model = await getCardNewsDeckModel();
  const payload = parseOrThrow(mergeCardNewsDeckPayload(getDefaultCardNewsDeckPayload(), input.payload));
  const doc = await model.create({
    ...payload,
    documentVersion: CARD_NEWS_DOCUMENT_VERSION,
    deckId: makeId(),
    ownerUid,
    revision: 1,
    state: "active",
    updatedBy: ownerUid,
  });
  return toDeck(doc);
}

export async function createCardNewsAgentDeck(input: {
  ownerUid: string;
  payload: unknown;
  agentMetadata: CardNewsAgentDeckMetadata;
}) {
  const ownerUid = requireOwnerUid(input.ownerUid);
  const model = await getCardNewsDeckModel();
  const payload = parseOrThrow(input.payload);
  const doc = await model.create({
    ...payload,
    documentVersion: CARD_NEWS_DOCUMENT_VERSION,
    deckId: makeId(),
    ownerUid,
    revision: 1,
    state: "active",
    agentMetadata: input.agentMetadata,
    updatedBy: ownerUid,
  });
  return toDeck(doc);
}

export async function getCardNewsDeck(input: { ownerUid: string; deckId: string }) {
  const ownerUid = requireOwnerUid(input.ownerUid);
  const deckId = safeString(input.deckId);
  if (!deckId) return null;
  const model = await getCardNewsDeckModel();
  const doc = await model.findOne({ deckId, state: "active" }).lean();
  if (!doc) return null;
  if (safeString(doc.ownerUid) !== ownerUid) return "forbidden" as const;
  return toDeck(doc);
}

export async function listCardNewsDecks(input: {
  ownerUid: string;
  sort?: "updatedAt" | "createdAt" | "title";
  order?: "asc" | "desc";
  limit?: number;
  skip?: number;
}) {
  const ownerUid = requireOwnerUid(input.ownerUid);
  const model = await getCardNewsDeckModel();
  const sortKey = input.sort === "createdAt" || input.sort === "title" ? input.sort : "updatedAt";
  const direction = input.order === "asc" ? 1 : -1;
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit || 20)));
  const skip = Math.max(0, Math.min(10_000, Math.trunc(input.skip || 0)));
  const condition = { ownerUid, state: "active" as const };
  const [rows, total] = await Promise.all([
    model.find(condition).sort({ [sortKey]: direction }).skip(skip).limit(limit).lean(),
    model.countDocuments(condition),
  ]);
  const items: CardNewsDeck[] = [];
  let invalidCount = 0;
  for (const row of rows) {
    try {
      items.push(toDeck(row));
    } catch (error) {
      if (!(error instanceof CardNewsDeckCorruptionError)) throw error;
      invalidCount += 1;
      const raw = rawObject(row);
      logger.warn("[card-news] invalid deck row isolated", {
        deckId: safeString(raw.deckId),
        documentVersion: raw.documentVersion,
        issuePaths: error.issues.map((item) => item.path).slice(0, 10),
      });
    }
  }
  return { items, total, limit, skip, invalidCount };
}

export async function updateCardNewsDeck(input: {
  ownerUid: string;
  deckId: string;
  patch: unknown;
  expectedRevision: number;
}): Promise<CardNewsDeckMutationResult> {
  const ownerUid = requireOwnerUid(input.ownerUid);
  const deckId = safeString(input.deckId);
  const model = await getCardNewsDeckModel();
  const current = await model.findOne({ deckId, state: "active" }).lean();
  if (!current) return { kind: "not_found" };
  if (safeString(current.ownerUid) !== ownerUid) return { kind: "forbidden" };
  const currentDeck = toDeck(current);
  if (currentDeck.revision !== input.expectedRevision) return { kind: "conflict", current: currentDeck };

  const payload = parseOrThrow(mergeCardNewsDeckPayload(payloadFromDocument(current), pickCardNewsDeckPayload(input.patch)));
  const updated = await model
    .findOneAndUpdate(
      { deckId, ownerUid, state: "active", revision: input.expectedRevision },
      {
        $set: {
          ...payload,
          documentVersion: CARD_NEWS_DOCUMENT_VERSION,
          updatedBy: ownerUid,
        },
        $inc: { revision: 1 },
      },
      { new: true, runValidators: true },
    )
    .lean();
  if (updated) return { kind: "updated", deck: toDeck(updated) };

  const latest = await model.findOne({ deckId, state: "active" }).lean();
  if (latest && safeString(latest.ownerUid) !== ownerUid) return { kind: "forbidden" };
  return latest ? { kind: "conflict", current: toDeck(latest) } : { kind: "not_found" };
}

export async function softDeleteCardNewsDeck(input: {
  ownerUid: string;
  deckId: string;
  expectedRevision: number;
}): Promise<CardNewsDeckMutationResult> {
  const ownerUid = requireOwnerUid(input.ownerUid);
  const deckId = safeString(input.deckId);
  const model = await getCardNewsDeckModel();
  const current = await model.findOne({ deckId, state: "active" }).lean();
  if (!current) return { kind: "not_found" };
  if (safeString(current.ownerUid) !== ownerUid) return { kind: "forbidden" };
  const currentDeck = toDeck(current);
  if (currentDeck.revision !== input.expectedRevision) return { kind: "conflict", current: currentDeck };

  const deletedAt = new Date();
  const deleted = await model
    .findOneAndUpdate(
      { deckId, ownerUid, state: "active", revision: input.expectedRevision },
      { $set: { state: "deleted", deletedAt, deletedBy: ownerUid, updatedBy: ownerUid }, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    )
    .lean();
  if (deleted) return { kind: "updated", deck: toDeck(deleted) };

  const latest = await model.findOne({ deckId, state: "active" }).lean();
  if (latest && safeString(latest.ownerUid) !== ownerUid) return { kind: "forbidden" };
  return latest ? { kind: "conflict", current: toDeck(latest) } : { kind: "not_found" };
}
