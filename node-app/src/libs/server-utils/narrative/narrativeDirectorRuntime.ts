import "server-only";

import type { BillableProviderType } from "types/ai";
import type { NarrativeDirectiveProposal } from "types/game";
import { buildStaticNarrativeDirective, NARRATIVE_DIRECTOR_POLICY } from "libs/server-utils/narrative/narrativeDirector";
import { runCachedNarrativeDirector } from "libs/server-utils/narrative/narrativeDirectorCache";
import {
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
import { isNarrativeRuntimeEnabled } from "libs/server-utils/narrative/narrativeRuntimePolicy";

/**
 * @docHint
 * @purpose Narrative Director 호출의 단일 진입점 — flag·circuit·비용 preflight·cache·과금·정적 폴백을 한 경로로 묶는다
 * @process flag 확인  circuit 판정  가격표/잔액/cap preflight  session·beat cache  provider 호출  usage 과금  실패 시 static fallback
 * @domain narrative-runtime
 * @scope server
 */

export type NarrativeDirectorGateTelemetry = {
  runtimeEnabled: boolean;
  circuitState: NarrativeDirectorCircuitState;
  circuitCallAllowed: boolean;
  costGate: Pick<NarrativeDirectorCostGateResult, "allowed" | "reason" | "errorCode" | "estimatedCoins" | "budgetCapCoins"> | null;
  billed: boolean;
};

export type NarrativeDirectorRuntimeResult = NarrativeDirectiveProposal & { gate: NarrativeDirectorGateTelemetry };

export type NarrativeDirectorRuntimeInput = {
  uid: string;
  universeId: string;
  characterId: string;
  sceneId: string;
  sessionId: string;
  beatId?: string;
  prompt: string;
  callsInSession: number;
  provider: BillableProviderType;
  modelName: string;
  /** 실제 provider 호출. 이 함수는 preflight를 통과하고 circuit이 열려 있지 않을 때만 실행된다. */
  invoke: () => Promise<unknown>;
  /** 성공한 호출의 실제 사용량 과금. 기본값은 aiUsageBilling의 코인 차감이다. */
  recordUsage?: (usage: { promptTokens: number; outputTokens: number }) => Promise<void> | void;
  narrativeProfileId?: string;
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

/**
 * Director 결과를 해석한다. 이 함수는 절대 throw하지 않으며, 어떤 실패에서도
 * static directive를 돌려줘 채팅 경로가 계속 동작하게 한다(G6 정적 폴백 계약).
 */
export async function resolveNarrativeDirective(input: NarrativeDirectorRuntimeInput): Promise<NarrativeDirectorRuntimeResult> {
  const nowMs = Number.isSafeInteger(Number(input.now)) ? Number(input.now) : Date.now();
  const expected = { universeId: input.universeId, characterId: input.characterId, sceneId: input.sceneId };
  const staticResult = (reason: string, gate: NarrativeDirectorGateTelemetry): NarrativeDirectorRuntimeResult => ({
    status: "fallback",
    directive: buildStaticNarrativeDirective(expected),
    fallbackReason: reason,
    telemetry: { promptTokens: 0, outputTokens: 0, cacheHit: false, modelName: input.modelName },
    gate,
  });

  const runtimeEnabled = isNarrativeRuntimeEnabled();
  if (!runtimeEnabled) {
    return staticResult("runtime_disabled", { runtimeEnabled, circuitState: "closed", circuitCallAllowed: false, costGate: null, billed: false });
  }

  const scope = circuitScope(input);
  const record = await readNarrativeDirectorCircuit(scope);
  const circuit = evaluateNarrativeDirectorCircuit(record, nowMs);
  if (!circuit.callAllowed) {
    return staticResult("circuit_open", { runtimeEnabled, circuitState: circuit.state, circuitCallAllowed: false, costGate: null, billed: false });
  }

  let costGate: NarrativeDirectorCostGateResult;
  try {
    costGate = await preflightNarrativeDirectorCost({
      uid: input.uid,
      provider: input.provider,
      modelName: input.modelName,
      prompt: input.prompt,
      maxOutputTokens: NARRATIVE_DIRECTOR_POLICY.maxOutputTokens,
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
      circuitState: circuit.state,
      circuitCallAllowed: true,
      costGate: { allowed: false, reason: "estimated_cost_unavailable", estimatedCoins: null, budgetCapCoins: null },
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
      circuitState: circuit.state,
      circuitCallAllowed: true,
      costGate: costTelemetry,
      billed: false,
    });
  }

  if (circuit.state === "half-open") {
    await writeNarrativeDirectorCircuit(scope, applyNarrativeDirectorProbe(record, nowMs));
  }

  let billed = false;
  const proposal = await runCachedNarrativeDirector({
    cacheKey: directorCacheKey(input),
    prompt: input.prompt,
    callsInSession: input.callsInSession,
    expected,
    invoke: input.invoke,
    budgetCheck: () => costGate.allowed,
    recordUsage: async (usage) => {
      if (input.recordUsage) await input.recordUsage(usage);
      else await defaultRecordUsage(input, usage);
      billed = true;
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
    directive: proposal.directive || buildStaticNarrativeDirective(expected),
    gate: { runtimeEnabled, circuitState: circuit.state, circuitCallAllowed: true, costGate: costTelemetry, billed },
  };
}
