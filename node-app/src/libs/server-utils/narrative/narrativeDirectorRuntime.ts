import "server-only";

import type { TextProviderType } from "types/ai";
import type { NarrativeDirectiveProposal } from "types/game";
import { buildStaticNarrativeDirective, NARRATIVE_DIRECTOR_POLICY } from "libs/server-utils/narrative/narrativeDirector";
import { peekNarrativeDirectorCache, runCachedNarrativeDirector } from "libs/server-utils/narrative/narrativeDirectorCache";
import {
  buildNarrativeDirectorUsage,
  preflightNarrativeDirectorCost,
  type NarrativeDirectorCostGateResult,
} from "libs/server-utils/narrative/narrativeDirectorCostGate";
import {
  applyNarrativeDirectorFailure,
  applyNarrativeDirectorProbe,
  applyNarrativeDirectorSuccess,
  evaluateNarrativeDirectorCircuit,
  readNarrativeDirectorCircuit,
  writeNarrativeDirectorCircuit,
  type NarrativeDirectorCircuitState,
} from "libs/server-utils/narrative/narrativeDirectorCircuit";
import {
  isNarrativeDirectorConsumerEnabled,
  isNarrativeRuntimeEnabled,
  type NarrativeDirectorConsumer,
} from "libs/server-utils/narrative/narrativeRuntimePolicy";
import {
  reserveNarrativeDirectorValidationBudget,
  settleNarrativeDirectorValidationBudget,
  type NarrativeDirectorProviderUsage,
  type NarrativeDirectorValidationBudgetReservation,
} from "libs/server-utils/narrative/narrativeDirectorValidationBudget";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Narrative Director 호출의 단일 진입점 — flag·circuit·비용 preflight·cache·과금·정적 폴백을 한 경로로 묶는다
 * @process flag 확인  circuit 판정  가격표/잔액/cap preflight  session·beat cache  provider 호출  usage 과금  실패 시 static fallback
 * @domain narrative-runtime
 * @scope server
 */

export type NarrativeDirectorGateTelemetry = {
  runtimeEnabled: boolean;
  consumer: NarrativeDirectorConsumer;
  consumerEnabled: boolean;
  circuitState: NarrativeDirectorCircuitState;
  circuitCallAllowed: boolean;
  costGate: Pick<NarrativeDirectorCostGateResult, "allowed" | "reason" | "errorCode" | "estimatedCoins" | "budgetCapCoins"> | null;
  validationBudget: { enabled: boolean; allowed: boolean; reason?: string; estimatedUsd?: number };
  billed: boolean;
};

export type NarrativeDirectorRuntimeResult = NarrativeDirectiveProposal & { gate: NarrativeDirectorGateTelemetry };

export type NarrativeDirectorRuntimeInput = {
  consumer: NarrativeDirectorConsumer;
  uid: string;
  universeId: string;
  characterId: string;
  sceneId: string;
  sessionId: string;
  beatId?: string;
  prompt: string;
  callsInSession: number;
  provider: TextProviderType;
  modelName: string;
  thinkingBudgetTokens?: number;
  /** 실제 provider 호출. 이 함수는 preflight를 통과하고 circuit이 열려 있지 않을 때만 실행된다. */
  invoke: () => Promise<unknown>;
  /** 성공한 호출의 실제 사용량 과금. 기본값은 aiUsageBilling의 코인 차감이다. */
  recordUsage?: (usage: { promptTokens: number; outputTokens: number }) => Promise<void> | void;
  /** Provider cost observation for a returned response rejected by directive validation. */
  recordUnbilledUsage?: (usage: { promptTokens: number; outputTokens: number }) => Promise<void> | void;
  /** Provider-reported token usage. Required to settle an enabled validation budget. */
  readProviderUsage?: () => NarrativeDirectorProviderUsage | null;
  narrativeProfileId?: string;
  /**
   * 사용자와 무관한 입력(캐릭터 canon)으로 만든 directive 를 여러 사용자·세션이 공유할 때의 cache key.
   * 있으면 circuit·비용 preflight 전에 cache 를 먼저 보고, hit 이면 provider·과금 경로를 타지 않는다(JEV-117 F1).
   */
  sharedCacheKey?: string;
  sharedCacheTtlSeconds?: number;
  skipWhenNoUid?: boolean;
  env?: Record<string, string | undefined>;
  now?: number;
};

function circuitScope(input: { universeId: string; modelName: string }) {
  return `${input.universeId}:${input.modelName}`.replace(/\s+/g, "_");
}

function directorCacheKey(input: { uid: string; universeId: string; characterId: string; sessionId: string; beatId?: string }) {
  return [input.uid, input.universeId, input.characterId, input.sessionId, input.beatId || "no-beat"].join(":").replace(/\s+/g, "_");
}

async function defaultRecordUsage(
  input: NarrativeDirectorRuntimeInput,
  usage: { promptTokens: number; outputTokens: number },
) {
  const { billAIUsageOrThrow } = await import("libs/services/aiUsageBilling");
  await billAIUsageOrThrow({
    uid: input.uid,
    app: "narrative_director",
    provider: input.provider,
    modelName: input.modelName,
    modality: "text",
    usage: { text: { input: usage.promptTokens, output: usage.outputTokens } },
    meta: {
      route: "narrative/director",
      universeId: input.universeId,
      characterId: input.characterId,
      sessionId: input.sessionId,
      ...(input.beatId ? { beatId: input.beatId } : {}),
      ...(input.narrativeProfileId ? { narrativeProfileId: input.narrativeProfileId } : {}),
    },
    skipWhenNoUid: input.skipWhenNoUid,
  });
}

async function defaultRecordUnbilledUsage(
  input: NarrativeDirectorRuntimeInput,
  usage: { promptTokens: number; outputTokens: number },
) {
  const { recordAiCostObservation } = await import("libs/server-utils/ai/aiCostObservationService");
  await recordAiCostObservation({
    provider: input.provider,
    modelName: input.modelName,
    modality: "text",
    usage: { text: { input: usage.promptTokens, output: usage.outputTokens } },
    meta: {
      route: "narrative/director",
      consumer: input.consumer,
      reason: "parse_failed_unbilled",
    },
    result: { ok: false, coins: 0, errorCode: "NARRATIVE_DIRECTOR_PARSE_FAILED_UNBILLED" },
  });
}

function logUnbilledRecordingFailure(error: unknown, source: "observation" | "settlement") {
  logger.error("[NARRATIVE_DIRECTOR_UNBILLED_COST_ALERT]", {
    alertCode: "NARRATIVE_DIRECTOR_UNBILLED_COST_FAILED",
    source,
    errorName: error instanceof Error ? error.name : "UNKNOWN",
  });
}

/**
 * Director 결과를 해석한다. 이 함수는 절대 throw하지 않으며, 어떤 실패에서도
 * static directive를 돌려줘 채팅 경로가 계속 동작하게 한다(G6 정적 폴백 계약).
 */
export async function resolveNarrativeDirective(input: NarrativeDirectorRuntimeInput): Promise<NarrativeDirectorRuntimeResult> {
  const nowMs = Number.isSafeInteger(Number(input.now)) ? Number(input.now) : Date.now();
  const expected = { universeId: input.universeId, characterId: input.characterId, sceneId: input.sceneId };
  const thinkingBudgetTokens = input.thinkingBudgetTokens ?? NARRATIVE_DIRECTOR_POLICY.thinkingBudgetTokens;
  const staticResult = (reason: string, gate: NarrativeDirectorGateTelemetry): NarrativeDirectorRuntimeResult => ({
    status: "fallback",
    directive: buildStaticNarrativeDirective(expected),
    fallbackReason: reason,
    telemetry: { promptTokens: 0, outputTokens: 0, cacheHit: false, modelName: input.modelName },
    gate,
  });

  const runtimeEnabled = isNarrativeRuntimeEnabled(input.env);
  const consumerEnabled = isNarrativeDirectorConsumerEnabled(input.consumer, input.env);
  const noBudget = { enabled: false, allowed: true };
  if (!runtimeEnabled) {
    return staticResult("runtime_disabled", {
      runtimeEnabled,
      consumer: input.consumer,
      consumerEnabled,
      circuitState: "closed",
      circuitCallAllowed: false,
      costGate: null,
      validationBudget: noBudget,
      billed: false,
    });
  }
  if (!consumerEnabled) {
    return staticResult("consumer_disabled", {
      runtimeEnabled,
      consumer: input.consumer,
      consumerEnabled,
      circuitState: "closed",
      circuitCallAllowed: false,
      costGate: null,
      validationBudget: noBudget,
      billed: false,
    });
  }

  if (input.sharedCacheKey) {
    const shared = await peekNarrativeDirectorCache(input.sharedCacheKey);
    if (shared?.directive) {
      return {
        ...shared,
        gate: {
          runtimeEnabled,
          consumer: input.consumer,
          consumerEnabled,
          circuitState: "closed",
          circuitCallAllowed: false,
          costGate: null,
          validationBudget: noBudget,
          billed: false,
        },
      };
    }
  }

  const scope = circuitScope(input);
  const record = await readNarrativeDirectorCircuit(scope);
  const circuit = evaluateNarrativeDirectorCircuit(record, nowMs);
  if (!circuit.callAllowed) {
    return staticResult("circuit_open", {
      runtimeEnabled,
      consumer: input.consumer,
      consumerEnabled,
      circuitState: circuit.state,
      circuitCallAllowed: false,
      costGate: null,
      validationBudget: noBudget,
      billed: false,
    });
  }

  let costGate: NarrativeDirectorCostGateResult;
  try {
    costGate = await preflightNarrativeDirectorCost({
      uid: input.uid,
      provider: input.provider,
      modelName: input.modelName,
      prompt: input.prompt,
      maxOutputTokens: NARRATIVE_DIRECTOR_POLICY.maxOutputTokens,
      thinkingBudgetTokens,
      circuitOpen: false,
      universeId: input.universeId,
      characterId: input.characterId,
      sessionId: input.sessionId,
      skipWhenNoUid: input.skipWhenNoUid,
      env: input.env,
    });
  } catch {
    // preflight 자체가 예외로 끝나면 비용을 확인하지 못한 것이므로 호출하지 않는다.
    return staticResult("cost_gate:preflight_error", {
      runtimeEnabled,
      consumer: input.consumer,
      consumerEnabled,
      circuitState: circuit.state,
      circuitCallAllowed: true,
      costGate: { allowed: false, reason: "estimated_cost_unavailable", estimatedCoins: null, budgetCapCoins: null },
      validationBudget: noBudget,
      billed: false,
    });
  }

  const costTelemetry = {
    allowed: costGate.allowed,
    reason: costGate.reason,
    errorCode: costGate.errorCode,
    estimatedCoins: costGate.estimatedCoins,
    budgetCapCoins: costGate.budgetCapCoins,
  };
  if (!costGate.allowed) {
    return staticResult(`cost_gate:${costGate.reason || "blocked"}`, {
      runtimeEnabled,
      consumer: input.consumer,
      consumerEnabled,
      circuitState: circuit.state,
      circuitCallAllowed: true,
      costGate: costTelemetry,
      validationBudget: noBudget,
      billed: false,
    });
  }

  if (circuit.state === "half-open") {
    await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorProbe(record, nowMs));
  }

  let billed = false;
  let validationBudgetReservation: NarrativeDirectorValidationBudgetReservation = noBudget;
  let validationBudgetReason = "";
  let settlementFailure = "";
  const proposal = await runCachedNarrativeDirector({
    cacheKey: input.sharedCacheKey || directorCacheKey(input),
    ...(input.sharedCacheKey && input.sharedCacheTtlSeconds ? { cacheTtlSeconds: input.sharedCacheTtlSeconds } : {}),
    prompt: input.prompt,
    callsInSession: input.callsInSession,
    expected,
    invoke: input.invoke,
    budgetCheck: async () => {
      if (!costGate.allowed) return false;
      validationBudgetReservation = await reserveNarrativeDirectorValidationBudget({
        consumer: input.consumer,
        provider: input.provider,
        modelName: input.modelName,
        prompt: input.prompt,
        maxOutputTokens: NARRATIVE_DIRECTOR_POLICY.maxOutputTokens,
        thinkingBudgetTokens,
        env: input.env,
      });
      if (!validationBudgetReservation.allowed) {
        validationBudgetReason = validationBudgetReservation.reason || "budget_blocked";
        return false;
      }
      return true;
    },
    recordUsage: async (usage) => {
      let providerUsage: NarrativeDirectorProviderUsage | null = null;
      try {
        providerUsage = input.readProviderUsage?.() || null;
      } catch {
        if (validationBudgetReservation.enabled) settlementFailure = "provider_usage_unavailable";
      }
      const providerUsageValid = Boolean(
        providerUsage &&
          Number.isSafeInteger(providerUsage.promptTokens) &&
          providerUsage.promptTokens > 0 &&
          Number.isSafeInteger(providerUsage.outputTokens) &&
          providerUsage.outputTokens > 0,
      );
      const billedUsage = providerUsageValid && providerUsage ? providerUsage : usage;
      if (validationBudgetReservation.enabled) {
        const settlement = await settleNarrativeDirectorValidationBudget({
          reservation: validationBudgetReservation,
          usage: providerUsageValid ? providerUsage : null,
        });
        if (!settlement.settled || settlement.outcome === "settlement_overrun") {
          settlementFailure ||= settlement.reason || "settlement_overrun";
        }
      }
      if (input.recordUsage) await input.recordUsage(billedUsage);
      else await defaultRecordUsage(input, billedUsage);
      billed = true;
      if (settlementFailure) throw new Error(`validation_budget:${settlementFailure}`);
    },
    recordUnbilledUsage: async () => {
      const upperBound = buildNarrativeDirectorUsage({
        provider: input.provider,
        modelName: input.modelName,
        prompt: input.prompt,
        maxOutputTokens: NARRATIVE_DIRECTOR_POLICY.maxOutputTokens,
        thinkingBudgetTokens,
      });
      let providerUsage: NarrativeDirectorProviderUsage | null = null;
      try {
        providerUsage = input.readProviderUsage?.() || null;
      } catch {
        providerUsage = null;
      }
      const providerUsageValid = Boolean(
        providerUsage &&
          Number.isSafeInteger(providerUsage.promptTokens) &&
          providerUsage.promptTokens > 0 &&
          Number.isSafeInteger(providerUsage.outputTokens) &&
          providerUsage.outputTokens > 0,
      );
      const unbilledUsage = providerUsageValid && providerUsage
        ? providerUsage
        : { promptTokens: upperBound.promptTokens, outputTokens: upperBound.outputTokens };

      if (validationBudgetReservation.enabled) {
        try {
          const settlement = await settleNarrativeDirectorValidationBudget({
            reservation: validationBudgetReservation,
            usage: unbilledUsage,
          });
          if (!settlement.settled || settlement.outcome === "settlement_overrun") {
            logUnbilledRecordingFailure(new Error(settlement.reason || "settlement_overrun"), "settlement");
          }
        } catch (error) {
          logUnbilledRecordingFailure(error, "settlement");
        }
      }

      try {
        if (input.recordUnbilledUsage) await input.recordUnbilledUsage(unbilledUsage);
        else await defaultRecordUnbilledUsage(input, unbilledUsage);
      } catch (error) {
        logUnbilledRecordingFailure(error, "observation");
      }
    },
    circuitOpen: false,
    modelName: input.modelName,
  });

  if (proposal.status === "proposal") {
    await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorSuccess());
  } else if (proposal.fallbackReason !== "preflight_blocked") {
    // provider·파싱·과금 실패만 circuit에 누적한다. 정책상 차단은 장애가 아니다.
    await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorFailure(record, nowMs));
  }

  return {
    ...proposal,
    ...(validationBudgetReason && proposal.fallbackReason === "preflight_blocked"
      ? { fallbackReason: `validation_budget:${validationBudgetReason}` }
      : {}),
    directive: proposal.directive || buildStaticNarrativeDirective(expected),
    gate: {
      runtimeEnabled,
      consumer: input.consumer,
      consumerEnabled,
      circuitState: circuit.state,
      circuitCallAllowed: true,
      costGate: costTelemetry,
      validationBudget: {
        enabled: validationBudgetReservation.enabled,
        allowed: validationBudgetReservation.allowed,
        ...(validationBudgetReservation.reason ? { reason: validationBudgetReservation.reason } : {}),
        ...(validationBudgetReservation.estimatedUsd !== undefined ? { estimatedUsd: validationBudgetReservation.estimatedUsd } : {}),
      },
      billed,
    },
  };
}
