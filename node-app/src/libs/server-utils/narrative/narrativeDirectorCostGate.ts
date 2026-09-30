import "server-only";

import type { BillableProviderType } from "types/ai";
import type { ITokenUsageBreakdown } from "types/payment";
import { estimateTokens } from "utils/ai/tokenUtils";
import { isXaiLongContextTieredTextModel } from "utils/ai/providerHelper";

/**
 * @docHint
 * @purpose Narrative Director 외부 호출 전 가격표·잔액·budget cap 계약
 * @process circuit 확인  cap 설정 확인  provider pricing 확인  잔액 preview  cap 판정
 * @domain narrative-runtime.billing
 * @scope server
 */

export const NARRATIVE_DIRECTOR_BUDGET_CAP_ENV = "DIRECTOR_BUDGET_CAP_COINS";

export type NarrativeDirectorCostGateReason =
  | "circuit_open"
  | "budget_cap_unconfigured"
  | "pricing_preflight_failed"
  | "balance_preflight_failed"
  | "budget_cap_exceeded"
  | "estimated_cost_unavailable";

export type NarrativeDirectorCostGateResult = {
  allowed: boolean;
  reason?: NarrativeDirectorCostGateReason;
  errorCode?: string;
  promptTokens: number;
  outputTokens: number;
  estimatedCoins: number | null;
  budgetCapCoins: number | null;
};

export function readNarrativeDirectorBudgetCapCoins(env: Record<string, string | undefined> = process.env) {
  const raw = String(env[NARRATIVE_DIRECTOR_BUDGET_CAP_ENV] || "").trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function buildNarrativeDirectorUsage(input: { prompt: string; maxOutputTokens: number }): {
  promptTokens: number;
  outputTokens: number;
  usage: ITokenUsageBreakdown;
} {
  const promptTokens = Math.max(1, estimateTokens(input.prompt));
  const outputTokens = Math.max(1, Math.floor(Number(input.maxOutputTokens)));
  if (!Number.isSafeInteger(outputTokens)) throw new Error("NARRATIVE_DIRECTOR_OUTPUT_BUDGET_INVALID");
  return {
    promptTokens,
    outputTokens,
    usage: { text: { input: promptTokens, output: outputTokens } },
  };
}

export function evaluateNarrativeDirectorCostGate(input: {
  circuitOpen?: boolean;
  budgetCapCoins: number | null;
  estimatedCoins: number | null;
  promptTokens: number;
  outputTokens: number;
}): NarrativeDirectorCostGateResult {
  const base = {
    promptTokens: input.promptTokens,
    outputTokens: input.outputTokens,
    estimatedCoins: input.estimatedCoins,
    budgetCapCoins: input.budgetCapCoins,
  };

  if (input.circuitOpen === true) return { ...base, allowed: false, reason: "circuit_open" };
  if (input.budgetCapCoins === null) return { ...base, allowed: false, reason: "budget_cap_unconfigured" };
  if (input.estimatedCoins === null || !Number.isSafeInteger(input.estimatedCoins) || input.estimatedCoins < 0) {
    return { ...base, allowed: false, reason: "estimated_cost_unavailable" };
  }
  if (input.estimatedCoins > input.budgetCapCoins) {
    return { ...base, allowed: false, reason: "budget_cap_exceeded" };
  }
  return { ...base, allowed: true };
}

function errorCodeOf(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const code = (error as { errorCode?: unknown }).errorCode;
  return typeof code === "string" && /^[A-Z0-9_:-]{1,80}$/.test(code) ? code : "UNKNOWN";
}

/**
 * Read-only G6 preflight. It never reserves or charges coins and must run before
 * the provider invocation. The caller still supplies the circuit state and must
 * pass the resulting `allowed` value to runNarrativeDirector's budgetCheck.
 */
export async function preflightNarrativeDirectorCost(input: {
  uid: string;
  provider: BillableProviderType;
  modelName: string;
  prompt: string;
  maxOutputTokens: number;
  circuitOpen?: boolean;
  universeId?: string;
  characterId?: string;
  sessionId?: string;
  skipWhenNoUid?: boolean;
  env?: Record<string, string | undefined>;
}) : Promise<NarrativeDirectorCostGateResult> {
  const usage = buildNarrativeDirectorUsage({ prompt: input.prompt, maxOutputTokens: input.maxOutputTokens });
  const budgetCapCoins = readNarrativeDirectorBudgetCapCoins(input.env);
  const early = evaluateNarrativeDirectorCostGate({
    circuitOpen: input.circuitOpen,
    budgetCapCoins,
    estimatedCoins: null,
    promptTokens: usage.promptTokens,
    outputTokens: usage.outputTokens,
  });
  if (early.reason === "circuit_open" || early.reason === "budget_cap_unconfigured") return early;
  const needsXaiTieredVariants =
    input.provider === "xai" && isXaiLongContextTieredTextModel(input.modelName);

  try {
    const { assertPricingPreflightOrThrow } = await import("libs/services/aiUsageBilling");
    await assertPricingPreflightOrThrow({
      provider: input.provider,
      modelName: input.modelName,
      modality: "text",
      kind: "token",
      ...(needsXaiTieredVariants ? { variants: ["short", "long"] } : {}),
    });
  } catch (error) {
    return {
      ...early,
      allowed: false,
      reason: "pricing_preflight_failed",
      errorCode: errorCodeOf(error),
    };
  }

  try {
    const { assertAIUsageBalanceOrThrow } = await import("libs/services/aiUsageBilling");
    const balance = await assertAIUsageBalanceOrThrow({
      uid: input.uid,
      app: "narrative_director",
      provider: input.provider,
      modelName: input.modelName,
      ...(needsXaiTieredVariants ? { variant: "long" } : {}),
      modality: "text",
      usage: usage.usage,
      meta: {
        route: "narrative/director:preflight",
        ...(input.universeId ? { universeId: input.universeId } : {}),
        ...(input.characterId ? { characterId: input.characterId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      },
      skipWhenNoUid: input.skipWhenNoUid,
    });
    const estimatedCoins = Number(balance.coins);
    return evaluateNarrativeDirectorCostGate({
      circuitOpen: input.circuitOpen,
      budgetCapCoins,
      estimatedCoins: Number.isSafeInteger(estimatedCoins) ? estimatedCoins : null,
      promptTokens: usage.promptTokens,
      outputTokens: usage.outputTokens,
    });
  } catch (error) {
    return {
      ...early,
      allowed: false,
      reason: "balance_preflight_failed",
      errorCode: errorCodeOf(error),
    };
  }
}
