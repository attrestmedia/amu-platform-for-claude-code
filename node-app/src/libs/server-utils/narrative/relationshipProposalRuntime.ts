import "server-only";

import { createHash } from "node:crypto";
import { redisCache } from "libs/cache/redisCacheService";
import { billAIUsageOrThrow } from "libs/services/aiUsageBilling";
import {
  applyNarrativeDirectorFailure,
  applyNarrativeDirectorProbe,
  applyNarrativeDirectorSuccess,
  evaluateNarrativeDirectorCircuit,
  readNarrativeDirectorCircuit,
  writeNarrativeDirectorCircuit,
} from "libs/server-utils/narrative/narrativeDirectorCircuit";
import { buildNarrativeDirectorUsage, preflightNarrativeDirectorCost } from "libs/server-utils/narrative/narrativeDirectorCostGate";
import { isNarrativeDirectorConsumerEnabled } from "libs/server-utils/narrative/narrativeRuntimePolicy";
import {
  reserveNarrativeDirectorValidationBudget,
  settleNarrativeDirectorValidationBudget,
} from "libs/server-utils/narrative/narrativeDirectorValidationBudget";
import {
  buildManualRelationshipProposal,
  parseRelationshipProposalOutput,
} from "libs/server-utils/narrative/relationshipProposal";
import {
  RELATIONSHIP_PROPOSAL_POLICY,
  type RelationshipProposal,
  type RelationshipProposalContext,
} from "types/game";
import type { TextProviderType } from "types/ai";
import {
  isClaudeLongContextTieredTextModel,
  isXaiLongContextTieredTextModel,
  pickClaudePricingVariantByInputTokens,
  pickXaiPricingVariantByInputTokens,
} from "utils/ai/providerHelper";
import { logger } from "utils/log";
import { readEmptyTextUsage } from "libs/server-utils/api/emptyTextUsage";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose AI 관계 제안의 단일 실행 경계
 * @process flag  cache  session cap  circuit  cost preflight  provider  proposal-only parse  manual fallback
 * @domain narrative-canon.relationship-proposal
 * @scope server
 */

export type RelationshipProposalRuntimeInput = {
  uid: string;
  personalUniverseId: string;
  sessionId: string;
  provider: TextProviderType;
  modelName: string;
  prompt: string;
  context: RelationshipProposalContext;
  callsInSession?: number;
  reserveSessionCall?: () => Promise<number>;
  invoke: () => Promise<{ rawText: string; promptTokens: number; outputTokens: number }>;
  recordUnbilledUsage?: (
    usage: { promptTokens: number; outputTokens: number },
    details?: { reason: string; errorCode: string },
  ) => Promise<void> | void;
  now?: number;
  env?: Record<string, string | undefined>;
};

function safeKeyPart(value: string) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 180);
}
function cacheKey(input: RelationshipProposalRuntimeInput) {
  const digest = createHash("sha256").update(input.prompt, "utf8").digest("hex").slice(0, 24);
  return `narrative:relationship-proposal:${safeKeyPart(input.uid)}:${safeKeyPart(input.personalUniverseId)}:${safeKeyPart(input.sessionId)}:${digest}`;
}

function circuitScope(input: RelationshipProposalRuntimeInput) {
  return `relationship-proposal:${safeKeyPart(input.personalUniverseId)}:${safeKeyPart(input.modelName)}`;
}

function fallback(input: RelationshipProposalRuntimeInput, reason: string, telemetry?: Partial<RelationshipProposal["telemetry"]>): RelationshipProposal {
  const proposal = buildManualRelationshipProposal(input.context, reason);
  return {
    ...proposal,
    telemetry: { ...proposal.telemetry, ...telemetry },
  };
}

async function defaultRecordUsage(input: RelationshipProposalRuntimeInput, usage: { promptTokens: number; outputTokens: number }) {
  await billAIUsageOrThrow({
    uid: input.uid,
    app: "narrative_canon_assistant",
    provider: input.provider,
    modelName: input.modelName,
    ...((input.provider === "xai" && isXaiLongContextTieredTextModel(input.modelName)) ||
    (input.provider === "claude" && isClaudeLongContextTieredTextModel(input.modelName))
      ? {
          variant:
            input.provider === "claude"
              ? pickClaudePricingVariantByInputTokens(usage.promptTokens)
              : pickXaiPricingVariantByInputTokens(usage.promptTokens),
        }
      : {}),
    modality: "text",
    usage: { text: { input: usage.promptTokens, output: usage.outputTokens } },
    meta: {
      route: "narrative/personal-universe/relationship-proposals",
      personalUniverseId: input.personalUniverseId,
      sessionId: input.sessionId,
    },
  });
}

async function defaultRecordUnbilledUsage(
  input: RelationshipProposalRuntimeInput,
  usage: { promptTokens: number; outputTokens: number },
  details: { reason: string; errorCode: string } = {
    reason: "parse_failed_unbilled",
    errorCode: "NARRATIVE_DIRECTOR_PARSE_FAILED_UNBILLED",
  },
) {
  const { recordAiCostObservation } = await import("libs/server-utils/ai/aiCostObservationService");
  await recordAiCostObservation({
    provider: input.provider,
    modelName: input.modelName,
    modality: "text",
    usage: { text: { input: usage.promptTokens, output: usage.outputTokens } },
    meta: {
      route: "narrative/personal-universe/relationship-proposals",
      consumer: "relationship_proposal",
      reason: details.reason,
    },
    result: { ok: false, coins: 0, errorCode: details.errorCode },
  });
}

function logUnbilledRecordingFailure(error: unknown, source: "observation" | "settlement") {
  logger.error("[NARRATIVE_DIRECTOR_UNBILLED_COST_ALERT]", {
    alertCode: "NARRATIVE_DIRECTOR_UNBILLED_COST_FAILED",
    source,
    errorName: error instanceof Error ? error.name : "UNKNOWN",
  });
}

export async function resolveRelationshipProposals(input: RelationshipProposalRuntimeInput): Promise<RelationshipProposal> {
  const nowMs = Number.isSafeInteger(Number(input.now)) ? Number(input.now) : Date.now();
  if (!isNarrativeDirectorConsumerEnabled("relationship_proposal", input.env)) return fallback(input, "runtime_disabled");

  const cached = await redisCache.get<RelationshipProposal>(cacheKey(input));
  if (cached?.status === "proposal" && cached.candidates.length > 0) {
    return { ...cached, telemetry: { ...cached.telemetry, cacheHit: true } };
  }

  let callsInSession = Number(input.callsInSession || 0);
  if (input.reserveSessionCall) {
    try {
      callsInSession = await input.reserveSessionCall();
    } catch {
      return fallback(input, "session_counter_unavailable");
    }
  }
  if (!Number.isSafeInteger(callsInSession) || callsInSession < 1 || callsInSession > RELATIONSHIP_PROPOSAL_POLICY.maxCallsPerSession) {
    return fallback(input, "session_call_cap");
  }

  const scope = circuitScope(input);
  const circuitRecord = await readNarrativeDirectorCircuit(scope);
  const circuit = evaluateNarrativeDirectorCircuit(circuitRecord, nowMs);
  if (!circuit.callAllowed) return fallback(input, "circuit_open", { gateReason: "circuit_open" });

  let costGate;
  try {
    costGate = await preflightNarrativeDirectorCost({
      uid: input.uid,
      provider: input.provider,
      modelName: input.modelName,
      prompt: input.prompt,
      maxOutputTokens: RELATIONSHIP_PROPOSAL_POLICY.maxOutputTokens,
      thinkingBudgetTokens: RELATIONSHIP_PROPOSAL_POLICY.thinkingBudgetTokens,
      universeId: input.personalUniverseId,
      sessionId: input.sessionId,
      env: input.env,
    });
  } catch {
    return fallback(input, "cost_gate:preflight_error", { gateReason: "estimated_cost_unavailable" });
  }
  if (!costGate.allowed) {
    return fallback(input, `cost_gate:${costGate.reason || "blocked"}`, {
      estimatedCoins: costGate.estimatedCoins,
      budgetCapCoins: costGate.budgetCapCoins,
      gateReason: costGate.reason,
    });
  }

  const validationBudgetReservation = await reserveNarrativeDirectorValidationBudget({
    consumer: "relationship_proposal",
    provider: input.provider,
    modelName: input.modelName,
    prompt: input.prompt,
    maxOutputTokens: RELATIONSHIP_PROPOSAL_POLICY.maxOutputTokens,
    thinkingBudgetTokens: RELATIONSHIP_PROPOSAL_POLICY.thinkingBudgetTokens,
    env: input.env,
  });
  if (!validationBudgetReservation.allowed) {
    return fallback(input, `validation_budget:${validationBudgetReservation.reason || "budget_blocked"}`, {
      estimatedCoins: costGate.estimatedCoins,
      budgetCapCoins: costGate.budgetCapCoins,
      gateReason: "validation_budget_blocked",
    });
  }

  if (circuit.state === "half-open") await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorProbe(circuitRecord, nowMs));

  let output: Awaited<ReturnType<RelationshipProposalRuntimeInput["invoke"]>>;
  try {
    output = await input.invoke();
  } catch (error) {
    const emptyTextUsage = readEmptyTextUsage(error);
    if (emptyTextUsage) {
      const usage = { promptTokens: emptyTextUsage.input, outputTokens: emptyTextUsage.output };
      const details = {
        reason: "provider_empty_unbilled",
        errorCode: String(toUnknownRecord(error).errorCode),
      };
      if (validationBudgetReservation.enabled) {
        try {
          const settlement = await settleNarrativeDirectorValidationBudget({ reservation: validationBudgetReservation, usage });
          if (!settlement.settled || settlement.outcome === "settlement_overrun") {
            logUnbilledRecordingFailure(new Error(settlement.reason || "settlement_overrun"), "settlement");
          }
        } catch (settlementError) {
          logUnbilledRecordingFailure(settlementError, "settlement");
        }
      }
      try {
        if (input.recordUnbilledUsage) await input.recordUnbilledUsage(usage, details);
        else await defaultRecordUnbilledUsage(input, usage, details);
      } catch (observationError) {
        logUnbilledRecordingFailure(observationError, "observation");
      }
    }
    await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorFailure(circuitRecord, nowMs));
    const reason = error instanceof Error ? error.message : "provider_failed";
    return fallback(input, reason, {
      estimatedCoins: costGate.estimatedCoins,
      budgetCapCoins: costGate.budgetCapCoins,
      gateReason: "provider_failed",
      modelName: input.modelName,
    });
  }

  const upperBound = buildNarrativeDirectorUsage({
    provider: input.provider,
    modelName: input.modelName,
    prompt: input.prompt,
    maxOutputTokens: RELATIONSHIP_PROPOSAL_POLICY.maxOutputTokens,
    thinkingBudgetTokens: RELATIONSHIP_PROPOSAL_POLICY.thinkingBudgetTokens,
  });
  const actualUsageValid = Number.isSafeInteger(output.promptTokens) && output.promptTokens > 0 &&
    Number.isSafeInteger(output.outputTokens) && output.outputTokens > 0;
  const usage = actualUsageValid
    ? { promptTokens: output.promptTokens, outputTokens: output.outputTokens }
    : { promptTokens: upperBound.promptTokens, outputTokens: upperBound.outputTokens };

  let proposal: ReturnType<typeof parseRelationshipProposalOutput>;
  try {
    proposal = parseRelationshipProposalOutput(output.rawText, input.context);
    if (!proposal) throw new Error("RELATIONSHIP_PROPOSAL_OUTPUT_INVALID");
  } catch (error) {
    if (validationBudgetReservation.enabled) {
      try {
        const settlement = await settleNarrativeDirectorValidationBudget({ reservation: validationBudgetReservation, usage });
        if (!settlement.settled || settlement.outcome === "settlement_overrun") {
          logUnbilledRecordingFailure(new Error(settlement.reason || "settlement_overrun"), "settlement");
        }
      } catch (settlementError) {
        logUnbilledRecordingFailure(settlementError, "settlement");
      }
    }
    try {
      if (input.recordUnbilledUsage) await input.recordUnbilledUsage(usage);
      else await defaultRecordUnbilledUsage(input, usage);
    } catch (observationError) {
      logUnbilledRecordingFailure(observationError, "observation");
    }
    await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorFailure(circuitRecord, nowMs));
    const reason = error instanceof Error ? error.message : "RELATIONSHIP_PROPOSAL_OUTPUT_INVALID";
    return fallback(input, `parse_failed_unbilled:${reason}`, {
      estimatedCoins: costGate.estimatedCoins,
      budgetCapCoins: costGate.budgetCapCoins,
      gateReason: "provider_failed",
      modelName: input.modelName,
    });
  }

  try {
    const settlement = validationBudgetReservation.enabled
      ? await settleNarrativeDirectorValidationBudget({ reservation: validationBudgetReservation, usage })
      : { settled: true as const };
    await defaultRecordUsage(input, usage);
    const settlementOutcome = "outcome" in settlement ? settlement.outcome : undefined;
    const settlementReason = "reason" in settlement ? settlement.reason : undefined;
    if (!settlement.settled || settlementOutcome === "settlement_overrun") {
      throw new Error(`validation_budget:${settlementReason || "settlement_overrun"}`);
    }
    const result: RelationshipProposal = {
      ...proposal,
      telemetry: {
        ...proposal.telemetry,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        modelName: input.modelName,
        estimatedCoins: costGate.estimatedCoins,
        budgetCapCoins: costGate.budgetCapCoins,
      },
    };
    await redisCache.set(cacheKey(input), result, RELATIONSHIP_PROPOSAL_POLICY.cacheTtlSeconds);
    await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorSuccess());
    return result;
  } catch (error) {
    await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorFailure(circuitRecord, nowMs));
    const reason = error instanceof Error ? error.message : "provider_failed";
    return fallback(input, reason, {
      estimatedCoins: costGate.estimatedCoins,
      budgetCapCoins: costGate.budgetCapCoins,
      gateReason: "provider_failed",
      modelName: input.modelName,
    });
  }
}

export function relationshipProposalSessionKey(input: { uid: string; personalUniverseId: string; sessionId: string }) {
  return `narrative:relationship-proposal:calls:${safeKeyPart(input.uid)}:${safeKeyPart(input.personalUniverseId)}:${safeKeyPart(input.sessionId)}`;
}
