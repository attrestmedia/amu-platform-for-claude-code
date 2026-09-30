import "server-only";

import { MONGODB_AI_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { CardNewsTemplateSchema, type ICardNewsTemplateDocument } from "models/lab";
import { validateCardNewsTemplatePreset } from "libs/card-news/templateResolver";
import type {
  CardNewsTemplatePreset,
  CardNewsTemplateRegistryEntry,
  CardNewsTemplateRegistryStatus,
} from "types/card-news";

/**
 * @docHint
 * @purpose CardNews 운영 템플릿 버전 레지스트리 저장소
 * @process immutable snapshot 등록·새 버전 발행·status lifecycle·operator audit
 * @domain card-news
 * @scope server
 */

export const CARD_NEWS_TEMPLATE_COLLECTION = "card_news_templates";

export type CardNewsTemplateMutationResult =
  | { kind: "ok"; entry: CardNewsTemplateRegistryEntry }
  | { kind: "not_found" }
  | { kind: "duplicate" }
  | { kind: "version_conflict"; latestVersion: number };

function safeString(value: unknown) {
  return String(value || "").trim();
}

function safeDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

async function getCardNewsTemplateModel() {
  return getModel<ICardNewsTemplateDocument>(
    MONGODB_AI_URL,
    "CardNewsTemplate",
    CardNewsTemplateSchema,
    CARD_NEWS_TEMPLATE_COLLECTION,
  );
}

function toEntry(value: ICardNewsTemplateDocument | Record<string, unknown>): CardNewsTemplateRegistryEntry {
  const row = value as Record<string, unknown>;
  const preset = validateCardNewsTemplatePreset(row.preset);
  const id = safeString(row.id);
  const version = Number(row.version);
  if (preset.id !== id || preset.version !== version) {
    throw new Error("CARD_NEWS_TEMPLATE_SNAPSHOT_REFERENCE_MISMATCH");
  }
  return {
    id,
    version,
    status: row.status === "active" ? "active" : "inactive",
    source: "database",
    preset,
    createdBy: safeString(row.createdBy),
    updatedBy: safeString(row.updatedBy),
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
    publishedAt: row.publishedAt ? safeDate(row.publishedAt) : null,
  };
}

export async function listCardNewsTemplateRegistry(params?: {
  status?: CardNewsTemplateRegistryStatus;
  id?: string;
}) {
  const model = await getCardNewsTemplateModel();
  const query: Record<string, unknown> = {};
  if (params?.status) query.status = params.status;
  if (params?.id) query.id = params.id;
  const rows = await model.find(query).sort({ id: 1, version: -1 }).lean();
  return rows.map((row) => toEntry(row as unknown as Record<string, unknown>));
}

export async function getCardNewsTemplateRegistryEntry(input: { id: string; version: number }) {
  const model = await getCardNewsTemplateModel();
  const row = await model.findOne({ id: safeString(input.id), version: input.version }).lean();
  return row ? toEntry(row as unknown as Record<string, unknown>) : null;
}

export async function registerCardNewsTemplate(input: {
  preset: CardNewsTemplatePreset;
  actor: string;
}): Promise<CardNewsTemplateMutationResult> {
  const preset = validateCardNewsTemplatePreset(input.preset);
  const model = await getCardNewsTemplateModel();
  const existing = await model.findOne({ id: preset.id, version: preset.version }).lean();
  if (existing) return { kind: "duplicate" };
  const row = await model.create({
    id: preset.id,
    version: preset.version,
    status: "inactive",
    preset,
    createdBy: safeString(input.actor),
    updatedBy: safeString(input.actor),
    publishedAt: null,
  });
  return { kind: "ok", entry: toEntry(row.toObject() as unknown as Record<string, unknown>) };
}

export async function publishCardNewsTemplateVersion(input: {
  preset: CardNewsTemplatePreset;
  actor: string;
}): Promise<CardNewsTemplateMutationResult> {
  const preset = validateCardNewsTemplatePreset(input.preset);
  const model = await getCardNewsTemplateModel();
  const latest = await model.findOne({ id: preset.id }).sort({ version: -1 }).lean();
  if (!latest) return { kind: "version_conflict", latestVersion: 0 };
  const latestVersion = Number(latest.version);
  if (preset.version !== latestVersion + 1) return { kind: "version_conflict", latestVersion };
  const row = await model.create({
    id: preset.id,
    version: preset.version,
    status: "inactive",
    preset,
    createdBy: safeString(input.actor),
    updatedBy: safeString(input.actor),
    publishedAt: null,
  });
  return { kind: "ok", entry: toEntry(row.toObject() as unknown as Record<string, unknown>) };
}

export async function setCardNewsTemplateStatus(input: {
  id: string;
  version: number;
  status: CardNewsTemplateRegistryStatus;
  actor: string;
}): Promise<CardNewsTemplateMutationResult> {
  const model = await getCardNewsTemplateModel();
  const current = await model.findOne({ id: safeString(input.id), version: input.version }).lean();
  if (!current) return { kind: "not_found" };

  if (input.status === "active") {
    await model.updateMany(
      { id: safeString(input.id), status: "active", version: { $ne: input.version } },
      { $set: { status: "inactive", updatedBy: safeString(input.actor), updatedAt: new Date() } },
    );
  }

  const row = await model.findOneAndUpdate(
    { id: safeString(input.id), version: input.version },
    {
      $set: {
        status: input.status,
        updatedBy: safeString(input.actor),
        updatedAt: new Date(),
        ...(input.status === "active" ? { publishedAt: current.publishedAt || new Date() } : {}),
      },
    },
    { new: true },
  ).lean();
  return row ? { kind: "ok", entry: toEntry(row as unknown as Record<string, unknown>) } : { kind: "not_found" };
}
