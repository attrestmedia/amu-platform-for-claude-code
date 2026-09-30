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
import { preflightNarrativeDirectorCost } from "libs/server-utils/narrative/narrativeDirectorCostGate";
import { isNarrativeRuntimeEnabled } from "libs/server-utils/narrative/narrativeRuntimePolicy";
import {
  buildManualRelationshipProposal,
  parseRelationshipProposalOutput,
} from "libs/server-utils/narrative/relationshipProposal";
import {
  RELATIONSHIP_PROPOSAL_POLICY,
  type RelationshipProposal,
  type RelationshipProposalContext,
} from "types/game";
import type { BillableProviderType } from "types/ai";
import { isXaiLongContextTieredTextModel, pickXaiPricingVariantByInputTokens } from "utils/ai/providerHelper";

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
  provider: BillableProviderType;
  modelName: string;
  prompt: string;
  context: RelationshipProposalContext;
  callsInSession?: number;
  reserveSessionCall?: () => Promise<number>;
  invoke: () => Promise<{ rawText: string; promptTokens: number; outputTokens: number }>;
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
    ...(input.provider === "xai" && isXaiLongContextTieredTextModel(input.modelName)
      ? { variant: pickXaiPricingVariantByInputTokens(usage.promptTokens) }
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

export async function resolveRelationshipProposals(input: RelationshipProposalRuntimeInput): Promise<RelationshipProposal> {
  const nowMs = Number.isSafeInteger(Number(input.now)) ? Number(input.now) : Date.now();
  if (!isNarrativeRuntimeEnabled()) return fallback(input, "runtime_disabled");

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

  if (circuit.state === "half-open") await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorProbe(circuitRecord, nowMs));

  try {
    const output = await input.invoke();
    const proposal = parseRelationshipProposalOutput(output.rawText, input.context);
    if (!proposal) throw new Error("RELATIONSHIP_PROPOSAL_OUTPUT_INVALID");
    await defaultRecordUsage(input, {
      promptTokens: Math.max(1, Number(output.promptTokens || 0)),
      outputTokens: Math.max(1, Number(output.outputTokens || 0)),
    });
    const result: RelationshipProposal = {
      ...proposal,
      telemetry: {
        ...proposal.telemetry,
        promptTokens: Math.max(1, Number(output.promptTokens || 0)),
        outputTokens: Math.max(1, Number(output.outputTokens || 0)),
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
    return fallback(input, error instanceof Error ? error.message : "provider_failed", {
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
