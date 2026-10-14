import "server-only";

import { randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import type { TextProviderType } from "types/ai";
import { calculateProviderCogs } from "consts/ai/providerCost";
import {
  NarrativeDirectorValidationBudgetSchema,
  type INarrativeDirectorValidationBudgetDocument,
  type INarrativeDirectorValidationBudgetEntry,
} from "models/game/NarrativeDirectorValidationBudgetSchema";
import { getModel } from "libs/database/modelCache";
import {
  buildNarrativeDirectorUsage,
  isNarrativeDirectorThinkingBudgetControllable,
} from "libs/server-utils/narrative/narrativeDirectorCostGate";
import type { NarrativeDirectorConsumer } from "libs/server-utils/narrative/narrativeRuntimePolicy";
import {
  isGoogleProTextModel,
  isClaudeLongContextTieredTextModel,
  isOpenAIGpt6TextModel,
  isXaiLongContextTieredTextModel,
  pickOpenAIGpt6PricingVariantByInputTokens,
  pickClaudePricingVariantByInputTokens,
  pickXaiPricingVariantByInputTokens,
} from "utils/ai/providerHelper";

/**
 * @docHint
 * @purpose Narrative Director 비운영 validation budget을 provider dispatch 직전에 원자 예약하고 usage 기준으로 정산한다
 * @process catalog 가격 확인  동시 요청 상한 예약  provider dispatch 후 actual USD 정산  설정·DB 오류 시 fail-closed
 * @domain narrative-runtime.validation-budget
 * @scope server
 */

export const NARRATIVE_DIRECTOR_VALIDATION_BUDGET_ENV = "NARRATIVE_DIRECTOR_VALIDATION_BUDGET_ID";
export const NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS = {
  maxAttempts: 20,
  maxTotalUsd: 10,
  maxPerRequestUsd: 1,
} as const;

export type NarrativeDirectorProviderUsage = { promptTokens: number; outputTokens: number };

export type NarrativeDirectorValidationBudgetReservation = {
  enabled: boolean;
  allowed: boolean;
  reason?: string;
  budgetId?: string;
  reservationId?: string;
  estimatedUsd?: number;
  provider?: string;
  model?: string;
  consumer?: NarrativeDirectorConsumer;
};

type ValidationBudgetModel = Pick<Model<INarrativeDirectorValidationBudgetDocument>, "findOne" | "findOneAndUpdate">;

type ValidationBudgetDependencies = {
  model?: ValidationBudgetModel;
  idFactory?: () => string;
  now?: () => Date;
};

function providerVariant(provider: string, modelName: string, promptTokens: number) {
  if (provider === "google" && isGoogleProTextModel(modelName)) return promptTokens > 200_000 ? "long" : "short";
  if (provider === "xai" && isXaiLongContextTieredTextModel(modelName)) return pickXaiPricingVariantByInputTokens(promptTokens);
  if (provider === "openai" && isOpenAIGpt6TextModel(modelName)) return pickOpenAIGpt6PricingVariantByInputTokens(promptTokens);
  if (provider === "claude" && isClaudeLongContextTieredTextModel(modelName)) return pickClaudePricingVariantByInputTokens(promptTokens);
  return undefined;
}

function normalizedUsd(value: number) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.ceil(value * 100_000_000) / 100_000_000;
}

function hasVerifiedCatalogRate(cost: ReturnType<typeof calculateProviderCogs>) {
  return (
    cost.source === "catalog" &&
    typeof cost.amount === "number" &&
    Number.isFinite(cost.amount) &&
    cost.amount >= 0 &&
    typeof cost.rateRevision === "string" &&
    Boolean(cost.rateRevision.trim()) &&
    typeof cost.verifiedAt === "string" &&
    Number.isFinite(Date.parse(cost.verifiedAt))
  );
}

export function calculateNarrativeDirectorProviderCost(input: {
  provider: string;
  modelName: string;
  usage: NarrativeDirectorProviderUsage;
}) {
  const promptTokens = Number(input.usage.promptTokens);
  const outputTokens = Number(input.usage.outputTokens);
  if (!Number.isSafeInteger(promptTokens) || promptTokens < 1 || !Number.isSafeInteger(outputTokens) || outputTokens < 1) return null;
  const cost = calculateProviderCogs({
    provider: input.provider,
    modelName: input.modelName,
    variant: providerVariant(input.provider, input.modelName, promptTokens),
    usage: { text: { input: promptTokens, output: outputTokens } },
  });
  if (!hasVerifiedCatalogRate(cost) || typeof cost.amount !== "number") return null;
  const amountUsd = normalizedUsd(cost.amount);
  if (amountUsd === null) return null;
  return {
    amountUsd,
    rateRevision: cost.rateRevision,
    verifiedAt: cost.verifiedAt,
    variant: providerVariant(input.provider, input.modelName, promptTokens) || null,
  };
}

export function estimateNarrativeDirectorProviderCost(input: {
  provider: TextProviderType;
  modelName: string;
  prompt: string;
  maxOutputTokens: number;
  thinkingBudgetTokens?: number;
}) {
  try {
    const usage = buildNarrativeDirectorUsage({
      provider: input.provider,
      modelName: input.modelName,
      prompt: input.prompt,
      maxOutputTokens: input.maxOutputTokens,
      thinkingBudgetTokens: input.thinkingBudgetTokens,
    });
    const estimate = calculateNarrativeDirectorProviderCost({
      provider: input.provider,
      modelName: input.modelName,
      usage: { promptTokens: usage.promptTokens, outputTokens: usage.outputTokens },
    });
    return estimate ? { ...estimate, promptTokens: usage.promptTokens, outputTokens: usage.outputTokens } : null;
  } catch {
    return null;
  }
}

export async function getNarrativeDirectorValidationBudgetModel(): Promise<Model<INarrativeDirectorValidationBudgetDocument>> {
  const { MONGODB_GAME_URL } = await import("consts/env/server");
  return getModel<INarrativeDirectorValidationBudgetDocument>(
    MONGODB_GAME_URL,
    "NarrativeDirectorValidationBudget",
    NarrativeDirectorValidationBudgetSchema,
    "narrative_director_validation_budgets",
  );
}

function selectedModel(dependencies?: ValidationBudgetDependencies) {
  return dependencies?.model ? Promise.resolve(dependencies.model) : getNarrativeDirectorValidationBudgetModel();
}

function budgetIdFrom(env: Record<string, string | undefined>) {
  const budgetId = String(env[NARRATIVE_DIRECTOR_VALIDATION_BUDGET_ENV] || "").trim();
  if (!budgetId) return null;
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(budgetId) ? budgetId : undefined;
}

/**
 * The script is the only caller allowed to seed a budget. `$setOnInsert` reuses an
 * existing budget without resetting its counters; mismatched caps are rejected.
 */
export async function ensureNarrativeDirectorValidationBudget(budgetIdInput: string, dependencies?: ValidationBudgetDependencies) {
  const budgetId = String(budgetIdInput || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(budgetId)) throw new Error("validation_budget_id_invalid");
  const now = dependencies?.now?.() || new Date();
  const model = await selectedModel(dependencies);
  const document = await model.findOneAndUpdate(
    { budgetId },
    {
      $setOnInsert: {
        budgetId,
        ...NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS,
        attempts: 0,
        reservedUsd: 0,
        settledUsd: 0,
        entries: [],
        createdAt: now,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: false },
  ).lean<INarrativeDirectorValidationBudgetDocument | null>();
  if (!document) throw new Error("validation_budget_unavailable");
  if (
    document.maxAttempts !== NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS.maxAttempts ||
    document.maxTotalUsd !== NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS.maxTotalUsd ||
    document.maxPerRequestUsd !== NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS.maxPerRequestUsd
  ) {
    throw new Error("validation_budget_cap_mismatch");
  }
  return document;
}

export async function readNarrativeDirectorValidationBudget(budgetIdInput: string, dependencies?: ValidationBudgetDependencies) {
  const budgetId = String(budgetIdInput || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(budgetId)) return null;
  const model = await selectedModel(dependencies);
  return model.findOne({ budgetId }).lean<INarrativeDirectorValidationBudgetDocument | null>();
}

export async function reserveNarrativeDirectorValidationBudget(input: {
  consumer: NarrativeDirectorConsumer;
  provider: TextProviderType;
  modelName: string;
  prompt: string;
  maxOutputTokens: number;
  thinkingBudgetTokens?: number;
  env?: Record<string, string | undefined>;
}, dependencies?: ValidationBudgetDependencies): Promise<NarrativeDirectorValidationBudgetReservation> {
  const env = input.env || process.env;
  if (!isNarrativeDirectorThinkingBudgetControllable(input.provider, input.modelName)) {
    return { enabled: Boolean(env[NARRATIVE_DIRECTOR_VALIDATION_BUDGET_ENV]), allowed: false, reason: "thinking_budget_uncontrollable" };
  }
  const budgetId = budgetIdFrom(env);
  if (budgetId === null) return { enabled: false, allowed: true };
  if (budgetId === undefined) return { enabled: true, allowed: false, reason: "budget_id_invalid" };
  if (env.NODE_ENV === "production" || process.env.NODE_ENV === "production") {
    return { enabled: true, allowed: false, budgetId, reason: "production_forbidden" };
  }

  const estimate = estimateNarrativeDirectorProviderCost(input);
  if (!estimate) return { enabled: true, allowed: false, budgetId, reason: "verified_provider_price_unavailable" };
  if (estimate.amountUsd > NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS.maxPerRequestUsd) {
    return { enabled: true, allowed: false, budgetId, estimatedUsd: estimate.amountUsd, reason: "per_request_limit_exceeded" };
  }

  const reservationId = (dependencies?.idFactory || randomUUID)();
  const reservedAt = dependencies?.now?.() || new Date();
  const entry: INarrativeDirectorValidationBudgetEntry = {
    reservationId,
    reservedAt,
    settledAt: null,
    consumer: input.consumer,
    provider: input.provider,
    model: input.modelName,
    estimatedUsd: estimate.amountUsd,
    actualUsd: null,
    outcome: "reserved",
  };

  try {
    const model = await selectedModel(dependencies);
    const result = await model.findOneAndUpdate(
      {
        budgetId,
        $expr: {
          $and: [
            { $eq: ["$maxAttempts", NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS.maxAttempts] },
            { $eq: ["$maxTotalUsd", NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS.maxTotalUsd] },
            { $eq: ["$maxPerRequestUsd", NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS.maxPerRequestUsd] },
            { $lt: ["$attempts", NARRATIVE_DIRECTOR_VALIDATION_BUDGET_LIMITS.maxAttempts] },
            { $lte: [{ $literal: estimate.amountUsd }, "$maxPerRequestUsd"] },
            {
              $lte: [
                {
                  $add: [
                    { $ifNull: ["$reservedUsd", 0] },
                    { $ifNull: ["$settledUsd", 0] },
                    { $literal: estimate.amountUsd },
                  ],
                },
                "$maxTotalUsd",
              ],
            },
          ],
        },
      },
      { $inc: { attempts: 1, reservedUsd: estimate.amountUsd }, $push: { entries: entry } },
      { new: true, runValidators: true },
    );
    if (!result) return { enabled: true, allowed: false, budgetId, estimatedUsd: estimate.amountUsd, reason: "budget_exhausted_or_unavailable" };
    return {
      enabled: true,
      allowed: true,
      budgetId,
      reservationId,
      estimatedUsd: estimate.amountUsd,
      provider: input.provider,
      model: input.modelName,
      consumer: input.consumer,
    };
  } catch {
    return { enabled: true, allowed: false, budgetId, estimatedUsd: estimate.amountUsd, reason: "budget_storage_unavailable" };
  }
}

export async function settleNarrativeDirectorValidationBudget(input: {
  reservation: NarrativeDirectorValidationBudgetReservation;
  usage: NarrativeDirectorProviderUsage | null;
}, dependencies?: ValidationBudgetDependencies) {
  const { reservation } = input;
  if (!reservation.enabled) return { settled: true, skipped: true };
  if (
    !reservation.allowed ||
    !reservation.budgetId ||
    !reservation.reservationId ||
    reservation.estimatedUsd === undefined ||
    !reservation.provider ||
    !reservation.model
  ) {
    return { settled: false, reason: "reservation_invalid" };
  }
  if (!input.usage) return { settled: false, reason: "provider_usage_unavailable", reservationRetained: true };
  const actual = calculateNarrativeDirectorProviderCost({
    provider: reservation.provider,
    modelName: reservation.model,
    usage: input.usage,
  });
  if (!actual) return { settled: false, reason: "actual_provider_price_unavailable" };

  try {
    const model = await selectedModel(dependencies);
    const reservationFilter = {
      budgetId: reservation.budgetId,
      entries: { $elemMatch: { reservationId: reservation.reservationId, outcome: "reserved" } },
    };
    const update = {
      $inc: { reservedUsd: -reservation.estimatedUsd, settledUsd: actual.amountUsd },
      $set: {
        "entries.$.actualUsd": actual.amountUsd,
        "entries.$.settledAt": dependencies?.now?.() || new Date(),
        "entries.$.outcome": "settled",
      },
    };
    const withinCap = await model.findOneAndUpdate(
      {
        ...reservationFilter,
        $expr: {
          $lte: [
            {
              $add: [
                { $subtract: ["$reservedUsd", reservation.estimatedUsd] },
                "$settledUsd",
                { $literal: actual.amountUsd },
              ],
            },
            "$maxTotalUsd",
          ],
        },
      },
      update,
      { new: true, runValidators: true },
    );
    if (withinCap) return { settled: true, actualUsd: actual.amountUsd, outcome: "settled" as const };

    const overrun = await model.findOneAndUpdate(
      reservationFilter,
      {
        ...update,
        $set: {
          ...update.$set,
          "entries.$.outcome": "settlement_overrun",
        },
      },
      { new: true, runValidators: true },
    );
    if (overrun) return { settled: true, actualUsd: actual.amountUsd, outcome: "settlement_overrun" as const };
    return { settled: false, reason: "reservation_missing_or_already_settled" };
  } catch {
    return { settled: false, reason: "budget_storage_unavailable" };
  }
}
