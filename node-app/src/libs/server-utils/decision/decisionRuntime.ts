import "server-only";

import { DECISION_POINT_REGISTRY, getDecisionPoint } from "consts/decision/decisionPointRegistry";
import { DEFAULT_JEV_RUNTIME_CONTROLS, type JevRuntimeControls } from "consts/system/jevRuntimeControls";
import {
  applyDecisionFailure,
  applyDecisionProbe,
  applyDecisionSuccess,
  emptyDecisionCircuit,
  evaluateDecisionCircuit,
  normalizeDecisionCircuit,
  openDecisionCircuitRecord,
  type DecisionCircuitPolicy,
  type DecisionCircuitRecord,
} from "libs/server-utils/decision/decisionCircuitCore";
import { parseDecisionAnswer } from "libs/server-utils/decision/decisionAnswerContract";
import { composeDecisionVerdict } from "libs/server-utils/decision/decisionComposition";
import { resolveDecisionActivation, type DecisionControlsRead } from "libs/server-utils/decision/decisionRuntimePolicy";
import { sanitizeDecisionState } from "libs/server-utils/decision/decisionStateSanitizer";
import type { recordDecisionTrace } from "libs/server-utils/decision/decisionTrace";
import { createJevClient, type JevEvaluateRequest, type JevEvaluateResult } from "libs/server-utils/decision/jevClient";
import { resolveSystem2Escalation } from "libs/server-utils/decision/system2Escalation";
import type { DecisionPoint, DecisionReasonCode, DecisionTraceRef, DecisionVerdict } from "types/decision/decision";

/**
 * @docHint
 * @purpose JEV 결정 오케스트레이션 — 기본값과 모든 실패에서 기존 Standard 경로를 보장
 * @process 지점 조회  운영 게이트  상태 정제  provider 호출  answer 판정·trace
 * @domain decision
 * @scope server
 */

export type RunDecisionInput = {
  pointId: string;
  rawState: unknown;
  userSmartModeEnabled: boolean;
  rolloutKey: string;
  service?: string;
  nowMs?: number;
};

export type DecisionRuntimeClient = {
  evaluate: (
    request: JevEvaluateRequest,
    options: { timeoutMs: number; maxResponseBytes: number },
  ) => Promise<JevEvaluateResult>;
};

export type DecisionCircuitWriter = (
  scope: string,
  record: DecisionCircuitRecord,
  policy: DecisionCircuitPolicy,
) => Promise<void>;

export type DecisionRuntimeDeps = {
  registry?: readonly DecisionPoint[];
  getControls?: () => Promise<DecisionControlsRead>;
  client?: DecisionRuntimeClient;
  readCircuit?: (scope: string, policy: DecisionCircuitPolicy) => Promise<DecisionCircuitRecord>;
  writeCircuit?: DecisionCircuitWriter;
  recordTrace?: typeof recordDecisionTrace;
  isCredentialActive?: () => Promise<boolean>;
};

function fallbackVerdict(
  point: DecisionPoint | null,
  pointId: string,
  reasonCode: DecisionReasonCode,
  traceRef: DecisionTraceRef | null = null,
): DecisionVerdict {
  const outcome = point?.fallback === "human_review" ? "human_review" : "standard";
  let escalation: DecisionVerdict["escalation"] = "standard_path";
  if (point) {
    try {
      escalation = resolveSystem2Escalation({ point, reasonCode });
    } catch {
      escalation = outcome === "human_review" ? "human_review" : "standard_path";
    }
  }

  return { decisionPointId: point?.id ?? pointId, outcome, value: null, escalation, reasonCode, traceRef };
}

async function resolveDefaultCredentialActive(): Promise<boolean> {
  try {
    const { resolvePlatformCredential } = await import("libs/server-utils/secure/platformCredentialResolver");
    const { payload } = await resolvePlatformCredential("ai.typesafe.default");
    return typeof payload.apiKey === "string" && payload.apiKey.trim().length > 0;
  } catch {
    return false;
  }
}

function mapClientFailure(result: Extract<JevEvaluateResult, { ok: false }>): DecisionReasonCode {
  switch (result.failure) {
    case "unavailable":
      return "credential_unavailable";
    case "rate_limited":
      return "rate_limited";
    case "overloaded":
      return "overloaded";
    case "timeout":
      return "timeout";
    default:
      return "provider_error";
  }
}

const lazyRecordDecisionTrace: typeof recordDecisionTrace = async (args) => {
  const { recordDecisionTrace: record } = await import("libs/server-utils/decision/decisionTrace");
  await record(args);
};

function circuitPolicy(controls: JevRuntimeControls): DecisionCircuitPolicy {
  return controls.circuit;
}

async function recordProviderTrace(args: {
  point: DecisionPoint;
  stateDigest: string;
  model: string;
  service: string;
  startedAt: Date;
  ok: boolean;
  returnedModel: string | null;
  inputTokens: number;
  errorCode?: string;
  recordTrace: typeof recordDecisionTrace;
}): Promise<DecisionTraceRef | null> {
  try {
    const { buildDecisionTraceCompletion, buildDecisionTraceDraft } = await import("libs/server-utils/decision/decisionTrace");
    const draft = buildDecisionTraceDraft({
      point: args.point,
      stateDigest: args.stateDigest,
      model: args.model,
      service: args.service,
    });
    const traceRef: DecisionTraceRef = {
      traceId: draft.traceId,
      stateDigest: args.stateDigest,
      questionSetVersion: args.point.questionSetVersion,
      returnedModel: args.returnedModel,
    };

    try {
      const completion = buildDecisionTraceCompletion({
        startedAt: args.startedAt,
        ok: args.ok,
        returnedModel: args.returnedModel,
        inputTokens: args.inputTokens,
        ...(args.errorCode ? { errorCode: args.errorCode } : {}),
      });
      await args.recordTrace({ draft, completion, returnedModel: args.returnedModel });
    } catch {
      // Trace recording is observational and cannot change the safe decision result.
    }

    return traceRef;
  } catch {
    return null;
  }
}

/** Run one optional JEV evaluation. Every denied or failed path returns a safe fallback verdict. */
export async function runDecision(input: RunDecisionInput, deps: DecisionRuntimeDeps = {}): Promise<DecisionVerdict> {
  let point: DecisionPoint | null = null;
  try {
    const nowMs = typeof input.nowMs === "number" && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
    point = getDecisionPoint(input.pointId, deps.registry ?? DECISION_POINT_REGISTRY);

    let controlsRead: DecisionControlsRead;
    try {
      controlsRead = deps.getControls
        ? await deps.getControls()
        : await (await import("libs/server-utils/system/jevRuntimeControls")).getJevRuntimeControls();
    } catch {
      controlsRead = { readable: false };
    }

    const controls = controlsRead.readable ? controlsRead.controls : DEFAULT_JEV_RUNTIME_CONTROLS;
    const policy = circuitPolicy(controls);
    const scope = point?.id ?? input.pointId;
    const readCircuit = deps.readCircuit ?? (async (circuitScope: string, circuitPolicyValue: DecisionCircuitPolicy) => {
      const { readDecisionCircuit } = await import("libs/server-utils/decision/decisionCircuit");
      return readDecisionCircuit(circuitScope, circuitPolicyValue);
    });
    const writeCircuit: DecisionCircuitWriter = deps.writeCircuit ?? (async (circuitScope, record, circuitPolicyValue) => {
      const { writeDecisionCircuit } = await import("libs/server-utils/decision/decisionCircuit");
      await writeDecisionCircuit(circuitScope, record, circuitPolicyValue);
    });
    let circuitRecord = emptyDecisionCircuit();
    try {
      circuitRecord = normalizeDecisionCircuit(await readCircuit(scope, policy));
    } catch {
      circuitRecord = openDecisionCircuitRecord(policy, nowMs);
    }
    const circuitState = evaluateDecisionCircuit(circuitRecord, policy, nowMs);

    let credentialActive = false;
    try {
      credentialActive = await (deps.isCredentialActive ?? resolveDefaultCredentialActive)();
    } catch {
      credentialActive = false;
    }

    const activation = resolveDecisionActivation({
      point,
      controlsRead,
      userSmartModeEnabled: input.userSmartModeEnabled,
      credentialActive,
      circuitState,
      rolloutKey: input.rolloutKey,
    });
    if (!activation.allowed) return fallbackVerdict(point, input.pointId, activation.reason);
    if (!point) return fallbackVerdict(null, input.pointId, "unknown_point");

    const { controls: activeControls, threshold } = activation;
    const sanitized = sanitizeDecisionState(point, input.rawState, nowMs);
    if (!sanitized.ok) return fallbackVerdict(point, input.pointId, "state_rejected");

    if (circuitState === "half-open") {
      const probed = applyDecisionProbe(circuitRecord, policy, nowMs);
      try {
        await writeCircuit(scope, probed, policy);
        circuitRecord = probed;
      } catch {
        return fallbackVerdict(point, input.pointId, "circuit_open");
      }
    }

    const startedAt = new Date();
    const client = deps.client ?? createJevClient();
    const request: JevEvaluateRequest = {
      model: activeControls.modelPin,
      state: sanitized.state,
      questions: { [point.id]: point.question },
    };

    let result: JevEvaluateResult;
    try {
      result = await client.evaluate(request, {
        timeoutMs: activeControls.timeoutMs,
        maxResponseBytes: activeControls.maxResponseBytes,
      });
    } catch {
      const traceRef = await recordProviderTrace({
        point,
        stateDigest: sanitized.digest,
        model: activeControls.modelPin,
        service: input.service || point.service,
        startedAt,
        ok: false,
        returnedModel: null,
        inputTokens: 0,
        errorCode: "provider_error",
        recordTrace: deps.recordTrace ?? lazyRecordDecisionTrace,
      });
      const next = applyDecisionFailure(circuitRecord, policy, nowMs);
      try {
        await writeCircuit(scope, next, policy);
      } catch {
        // The next circuit read fails closed if persistence is unavailable.
      }
      return fallbackVerdict(point, input.pointId, "provider_error", traceRef);
    }

    const reasonCode = result.ok ? null : mapClientFailure(result);
    const traceRef = await recordProviderTrace({
      point,
      stateDigest: sanitized.digest,
      model: activeControls.modelPin,
      service: input.service || point.service,
      startedAt,
      ok: result.ok,
      returnedModel: result.ok ? result.model : null,
      inputTokens: result.ok ? result.usage.inputTokens : 0,
      ...(!result.ok && reasonCode ? { errorCode: reasonCode } : {}),
      recordTrace: deps.recordTrace ?? lazyRecordDecisionTrace,
    });

    if (!result.ok) {
      const next = applyDecisionFailure(circuitRecord, policy, nowMs);
      try {
        await writeCircuit(scope, next, policy);
      } catch {
        // The next circuit read fails closed if persistence is unavailable.
      }
      return fallbackVerdict(point, input.pointId, reasonCode ?? "provider_error", traceRef);
    }

    const parsed = parseDecisionAnswer(point, result.answers[point.id]);
    if (!parsed.ok) return fallbackVerdict(point, input.pointId, "invalid_answer", traceRef);

    const next = applyDecisionSuccess();
    try {
      await writeCircuit(scope, next, policy);
    } catch {
      // Circuit persistence is observational; a failed read remains fail-closed.
    }

    return composeDecisionVerdict({ point, answer: parsed.answer, threshold, traceRef });
  } catch {
    return fallbackVerdict(point, input.pointId, "provider_error");
  }
}
