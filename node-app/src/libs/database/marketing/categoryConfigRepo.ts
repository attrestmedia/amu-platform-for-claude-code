import "server-only";
import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingQueueCategoryConfigSchema,
  type IMarketingQueueCategoryConfigDocument,
} from "models/marketing";
import type { MarketingChannel, MarketingJobPriority } from "consts/marketing/queue";
import {
  normalizeMarketingQueueBatchSize,
  normalizeMarketingQueueCategory,
  normalizeMarketingQueueChannels,
  normalizeMarketingQueuePriority,
} from "libs/marketing/queue/categoryConfig";

const CATEGORY_CONFIG_COLLECTION = "marketing_queue_category_configs";

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

async function getMarketingQueueCategoryConfigModel() {
  return await getModel<IMarketingQueueCategoryConfigDocument>(
    MONGODB_MARKETING_URL,
    "MarketingQueueCategoryConfig",
    MarketingQueueCategoryConfigSchema,
    CATEGORY_CONFIG_COLLECTION,
  );
}

export async function upsertMarketingQueueCategoryConfig(input: {
  universeId: string;
  queueCategory: string;
  label?: string;
  enabled?: boolean;
  defaultBatchSize?: number;
  maxConcurrency?: number;
  defaultPriority?: MarketingJobPriority;
  priorityWeight?: number;
  defaultContentTemplateKey?: string;
  defaultImageTemplateKey?: string;
  defaultGenerationMode?: "server_worker" | "local_agent";
  defaultModelProvider?: string;
  defaultModelName?: string;
  defaultReviewMode?: string;
  instructionText?: string;
  siteUrl?: string;
  allowedChannels?: MarketingChannel[];
  updatedBy?: string;
}) {
  const model = await getMarketingQueueCategoryConfigModel();
  const queueCategory = normalizeMarketingQueueCategory(input.queueCategory);

  return await model
    .findOneAndUpdate(
      {
        universeId: toSafeString(input.universeId, 120),
        queueCategory,
      },
      {
        $set: {
          label: toSafeString(input.label, 200),
          enabled: input.enabled !== false,
          defaultBatchSize: normalizeMarketingQueueBatchSize(input.defaultBatchSize),
          maxConcurrency: normalizeMarketingQueueBatchSize(input.maxConcurrency, 1),
          defaultPriority: normalizeMarketingQueuePriority(input.defaultPriority),
          priorityWeight: Math.max(1, Math.min(1000, Number(input.priorityWeight || 100))),
          defaultContentTemplateKey: toSafeString(input.defaultContentTemplateKey, 120),
          defaultImageTemplateKey: toSafeString(input.defaultImageTemplateKey, 120),
          defaultGenerationMode: input.defaultGenerationMode === "local_agent" ? "local_agent" : "server_worker",
          defaultModelProvider: toSafeString(input.defaultModelProvider, 80),
          defaultModelName: toSafeString(input.defaultModelName, 160),
          defaultReviewMode: toSafeString(input.defaultReviewMode, 80) || "review_required",
          instructionText: toSafeString(input.instructionText, 4000),
          siteUrl: toSafeString(input.siteUrl, 500),
          allowedChannels: normalizeMarketingQueueChannels(input.allowedChannels),
          updatedBy: toSafeString(input.updatedBy, 200),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          configId: makeId("marketing_queue_category"),
          universeId: toSafeString(input.universeId, 120),
          queueCategory,
          createdAt: new Date(),
        },
      },
      { new: true, upsert: true },
    )
    .lean();
}

export async function getMarketingQueueCategoryConfig(args: {
  universeId: string;
  queueCategory: string;
  enabledOnly?: boolean;
}) {
  const model = await getMarketingQueueCategoryConfigModel();
  const cond: Record<string, unknown> = {
    universeId: toSafeString(args.universeId, 120),
    queueCategory: normalizeMarketingQueueCategory(args.queueCategory),
  };
  if (args.enabledOnly) cond.enabled = true;
  return await model.findOne(cond).lean();
}

export async function listMarketingQueueCategoryConfigs(params: {
  universeId?: string;
  universeIds?: string[];
  enabled?: boolean;
  limit?: number;
}) {
  const model = await getMarketingQueueCategoryConfigModel();
  const cond: Record<string, unknown> = {};
  const universeIds = Array.from(new Set((params.universeIds || []).map((value) => toSafeString(value, 120)).filter(Boolean)));
  const universeId = toSafeString(params.universeId, 120);
  if (universeIds.length > 0) cond.universeId = { $in: universeIds };
  else if (universeId) cond.universeId = universeId;
  if (typeof params.enabled === "boolean") cond.enabled = params.enabled;

  const limit = Math.max(1, Math.min(200, Number(params.limit || 100)));
  return await model.find(cond).sort({ universeId: 1, queueCategory: 1 }).limit(limit).lean();
}
