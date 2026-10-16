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
import {
  resolveDecisionControlsGate,
  resolveDecisionPostIoGate,
  resolveDecisionPreIoGate,
  type DecisionControlsRead,
} from "libs/server-utils/decision/decisionRuntimePolicy";
import { sanitizeDecisionState } from "libs/server-utils/decision/decisionStateSanitizer";
import type { recordDecisionTrace } from "libs/server-utils/decision/decisionTrace";
import { createJevClient, type JevEvaluateRequest, type JevEvaluateResult } from "libs/server-utils/decision/jevClient";
import { resolveSystem2Escalation } from "libs/server-utils/decision/system2Escalation";
import type { DecisionPoint, DecisionQuestion, DecisionReasonCode, DecisionTraceRef, DecisionVerdict } from "types/decision/decision";

/**
 * @docHint
 * @purpose JEV 결정 오케스트레이션 — 기본값과 모든 실패에서 기존 Standard 경로를 보장
 * @process I/O 없는 게이트  controls 게이트  credential·circuit 게이트  상태 정제  provider 호출  answer 판정·trace
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

export type RunDecisionBatchInput = Omit<RunDecisionInput, "pointId"> & { pointIds: readonly string[] };

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
  /**
   * 응답 경로 밖에서 끝낼 관측 작업(trace 저장)을 맡긴다. route handler 는 next/server 의 after 를 넘길 수 있다.
   * 기본값은 결과를 기다리지 않는 fire-and-forget 이다.
   */
  defer?: (task: () => Promise<void>) => void;
};

type ResolvedRuntimeDeps = Required<Omit<DecisionRuntimeDeps, "client">> & { client: DecisionRuntimeClient | null };

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

function fireAndForget(task: () => Promise<void>) {
  void task().catch(() => {
    // Deferred observation work cannot change a returned decision.
  });
}

function resolveDeps(deps: DecisionRuntimeDeps): ResolvedRuntimeDeps {
  return {
    registry: deps.registry ?? DECISION_POINT_REGISTRY,
    getControls:
      deps.getControls ??
      (async () => (await import("libs/server-utils/system/jevRuntimeControls")).getCachedJevRuntimeControls()),
    client: deps.client ?? null,
    readCircuit:
      deps.readCircuit ??
      (async (scope, policy) => {
        const { readDecisionCircuit } = await import("libs/server-utils/decision/decisionCircuit");
        return readDecisionCircuit(scope, policy);
      }),
    writeCircuit:
      deps.writeCircuit ??
      (async (scope, record, policy) => {
        const { writeDecisionCircuit } = await import("libs/server-utils/decision/decisionCircuit");
        await writeDecisionCircuit(scope, record, policy);
      }),
    recordTrace: deps.recordTrace ?? lazyRecordDecisionTrace,
    isCredentialActive: deps.isCredentialActive ?? resolveDefaultCredentialActive,
    defer: deps.defer ?? fireAndForget,
  };
}

function circuitPolicy(controls: JevRuntimeControls): DecisionCircuitPolicy {
  return controls.circuit;
}

function isEmptyCircuitRecord(record: DecisionCircuitRecord): boolean {
  return record.failures === 0 && record.openedAt === null && record.halfOpenProbes === 0;
}

/**
 * trace 참조는 동기로 만들어 verdict 에 싣고, 저장(DB 2회)은 응답 경로 밖으로 미룬다(JEV-116 R3).
 */
async function buildProviderTrace(args: {
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
  defer: (task: () => Promise<void>) => void;
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
      args.defer(() => args.recordTrace({ draft, completion, returnedModel: args.returnedModel }));
    } catch {
      // Trace recording is observational and cannot change the safe decision result.
    }

    return traceRef;
  } catch {
    return null;
  }
}

/** batch 는 지점별 allowlist 의 교집합만 보낸다(INV-7). 한도는 가장 엄격한 값을 쓴다. */
function buildBatchProjectionPoint(points: readonly DecisionPoint[]): DecisionPoint | null {
  if (points.length === 1) return points[0];
  const [first, ...rest] = points;
  const allowlist = first.stateAllowlist.filter((key) => rest.every((point) => point.stateAllowlist.includes(key)));
  if (allowlist.length === 0) return null;
  return {
    ...first,
    stateAllowlist: allowlist,
    stateLimits: {
      maxBytes: Math.min(...points.map((point) => point.stateLimits.maxBytes)),
      maxAgeMs: Math.min(...points.map((point) => point.stateLimits.maxAgeMs)),
      maxStringLength: Math.min(...points.map((point) => point.stateLimits.maxStringLength)),
    },
    stateSchemaVersion: points.map((point) => `${point.id}@${point.stateSchemaVersion}`).sort().join("|"),
  };
}

type ActiveDecisionPoint = {
  point: DecisionPoint;
  threshold: number | null;
  circuitRecord: DecisionCircuitRecord;
  circuitState: "closed" | "open" | "half-open";
};

/**
 * 같은 서비스·같은 rawState 를 쓰는 지점들을 한 번의 provider 호출로 평가한다(JEV-116 R6).
 * 지점이 하나면 기존 runDecision 과 같은 경로다. 이 함수는 throw 하지 않는다 — 호출부가 감싼다.
 */
async function runDecisionCore(
  pointIds: readonly string[],
  input: Omit<RunDecisionInput, "pointId">,
  rawDeps: DecisionRuntimeDeps,
): Promise<Map<string, DecisionVerdict>> {
  const deps = resolveDeps(rawDeps);
  const verdicts = new Map<string, DecisionVerdict>();
  const nowMs = typeof input.nowMs === "number" && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();

  // 1단계 — I/O 없음.
  const candidates: DecisionPoint[] = [];
  for (const pointId of pointIds) {
    const point = getDecisionPoint(pointId, deps.registry);
    const gate = resolveDecisionPreIoGate({ point, userSmartModeEnabled: input.userSmartModeEnabled });
    if (!gate.allowed || !point) {
      verdicts.set(pointId, fallbackVerdict(point, pointId, gate.allowed ? "unknown_point" : gate.reason));
      continue;
    }
    candidates.push(point);
  }
  if (candidates.length === 0) return verdicts;

  // 2단계 — controls 1회.
  let controlsRead: DecisionControlsRead;
  try {
    controlsRead = await deps.getControls();
  } catch {
    controlsRead = { readable: false };
  }
  const controls = controlsRead.readable ? controlsRead.controls : DEFAULT_JEV_RUNTIME_CONTROLS;
  const policy = circuitPolicy(controls);

  const controlled: Array<{ point: DecisionPoint; threshold: number | null }> = [];
  for (const point of candidates) {
    const gate = resolveDecisionControlsGate({ point, controlsRead, rolloutKey: input.rolloutKey });
    if (!gate.allowed) {
      verdicts.set(point.id, fallbackVerdict(point, point.id, gate.reason));
      continue;
    }
    controlled.push({ point, threshold: gate.threshold });
  }
  if (controlled.length === 0) return verdicts;

  // 3단계 — credential 1회 + 지점별 circuit, 병렬.
  const [credentialActive, circuitRecords] = await Promise.all([
    Promise.resolve()
      .then(() => deps.isCredentialActive())
      .catch(() => false),
    Promise.all(
      controlled.map(({ point }) =>
        Promise.resolve()
          .then(() => deps.readCircuit(point.id, policy))
          .then((record) => normalizeDecisionCircuit(record))
          .catch(() => openDecisionCircuitRecord(policy, nowMs)),
      ),
    ),
  ]);

  const active: ActiveDecisionPoint[] = [];
  controlled.forEach(({ point, threshold }, index) => {
    const circuitRecord = circuitRecords[index] ?? emptyDecisionCircuit();
    const circuitState = evaluateDecisionCircuit(circuitRecord, policy, nowMs);
    const gate = resolveDecisionPostIoGate({ credentialActive, circuitState });
    if (!gate.allowed) {
      verdicts.set(point.id, fallbackVerdict(point, point.id, gate.reason));
      return;
    }
    active.push({ point, threshold, circuitRecord, circuitState });
  });
  if (active.length === 0) return verdicts;

  const projectionPoint = buildBatchProjectionPoint(active.map((entry) => entry.point));
  if (!projectionPoint) {
    // 교집합 projection 이 비면 묶지 않는다. 지점별로 다시 평가한다.
    const separate = await Promise.all(
      active.map((entry) => runDecisionCore([entry.point.id], input, rawDeps)),
    );
    for (const result of separate) result.forEach((verdict, id) => verdicts.set(id, verdict));
    return verdicts;
  }

  const sanitized = sanitizeDecisionState(projectionPoint, input.rawState, nowMs);
  if (!sanitized.ok) {
    for (const { point } of active) verdicts.set(point.id, fallbackVerdict(point, point.id, "state_rejected"));
    return verdicts;
  }

  // half-open 지점은 probe 를 먼저 기록한다. 기록하지 못하면 그 지점은 호출하지 않는다.
  const dispatched: ActiveDecisionPoint[] = [];
  await Promise.all(
    active.map(async (entry) => {
      if (entry.circuitState !== "half-open") {
        dispatched.push(entry);
        return;
      }
      const probed = applyDecisionProbe(entry.circuitRecord, policy, nowMs);
      try {
        await deps.writeCircuit(entry.point.id, probed, policy);
        dispatched.push({ ...entry, circuitRecord: probed });
      } catch {
        verdicts.set(entry.point.id, fallbackVerdict(entry.point, entry.point.id, "circuit_open"));
      }
    }),
  );
  if (dispatched.length === 0) return verdicts;

  const activeControls = controlsRead.readable ? controlsRead.controls : DEFAULT_JEV_RUNTIME_CONTROLS;
  const startedAt = new Date();
  const client = deps.client ?? createJevClient();
  const questions: Record<string, DecisionQuestion> = {};
  for (const { point } of dispatched) questions[point.id] = point.question;
  const request: JevEvaluateRequest = { model: activeControls.modelPin, state: sanitized.state, questions };

  let result: JevEvaluateResult;
  try {
    result = await client.evaluate(request, {
      timeoutMs: activeControls.timeoutMs,
      maxResponseBytes: activeControls.maxResponseBytes,
    });
  } catch {
    result = { ok: false, failure: "network", status: null, retryAfterMs: null };
  }

  const reasonCode = result.ok ? null : mapClientFailure(result);
  await Promise.all(
    dispatched.map(async (entry, index) => {
      const { point } = entry;
      // provider 호출은 1회다. 토큰은 첫 지점 trace 에만 귀속해 이중 집계하지 않는다.
      const traceRef = await buildProviderTrace({
        point,
        stateDigest: sanitized.digest,
        model: activeControls.modelPin,
        service: input.service || point.service,
        startedAt,
        ok: result.ok,
        returnedModel: result.ok ? result.model : null,
        inputTokens: result.ok && index === 0 ? result.usage.inputTokens : 0,
        ...(!result.ok && reasonCode ? { errorCode: reasonCode } : {}),
        recordTrace: deps.recordTrace,
        defer: deps.defer,
      });

      if (!result.ok) {
        try {
          await deps.writeCircuit(point.id, applyDecisionFailure(entry.circuitRecord, policy, nowMs), policy);
        } catch {
          // The next circuit read fails closed if persistence is unavailable.
        }
        verdicts.set(point.id, fallbackVerdict(point, point.id, reasonCode ?? "provider_error", traceRef));
        return;
      }

      const parsed = parseDecisionAnswer(point, result.answers[point.id]);
      if (!parsed.ok) {
        verdicts.set(point.id, fallbackVerdict(point, point.id, "invalid_answer", traceRef));
        return;
      }

      // 이미 닫힌 빈 circuit 이면 쓰지 않는다(JEV-116 R4).
      if (!isEmptyCircuitRecord(entry.circuitRecord)) {
        try {
          await deps.writeCircuit(point.id, applyDecisionSuccess(), policy);
        } catch {
          // Circuit persistence is observational; a failed read remains fail-closed.
        }
      }

      verdicts.set(point.id, composeDecisionVerdict({ point, answer: parsed.answer, threshold: entry.threshold, traceRef }));
    }),
  );

  return verdicts;
}

/** Run one optional JEV evaluation. Every denied or failed path returns a safe fallback verdict. */
export async function runDecision(input: RunDecisionInput, deps: DecisionRuntimeDeps = {}): Promise<DecisionVerdict> {
  try {
    const verdicts = await runDecisionCore([input.pointId], input, deps);
    const verdict = verdicts.get(input.pointId);
    if (verdict) return verdict;
  } catch {
    // fall through to the safe verdict below
  }
  let point: DecisionPoint | null = null;
  try {
    point = getDecisionPoint(input.pointId, deps.registry ?? DECISION_POINT_REGISTRY);
  } catch {
    point = null;
  }
  return fallbackVerdict(point, input.pointId, "provider_error");
}

/**
 * 같은 rawState 를 쓰는 여러 지점을 서비스별로 묶어 provider 호출을 줄인다.
 * 반환 Record 에는 요청한 모든 pointId 가 들어 있다.
 */
export async function runDecisionBatch(
  input: RunDecisionBatchInput,
  deps: DecisionRuntimeDeps = {},
): Promise<Record<string, DecisionVerdict>> {
  const pointIds = [...new Set(input.pointIds)];
  const registry = deps.registry ?? DECISION_POINT_REGISTRY;
  const groups = new Map<string, string[]>();
  for (const pointId of pointIds) {
    let service = `__unknown:${pointId}`;
    try {
      service = getDecisionPoint(pointId, registry)?.service ?? service;
    } catch {
      // unknown points are evaluated alone and resolve to unknown_point
    }
    groups.set(service, [...(groups.get(service) ?? []), pointId]);
  }

  const output: Record<string, DecisionVerdict> = {};
  await Promise.all(
    [...groups.values()].map(async (ids) => {
      try {
        const verdicts = await runDecisionCore(ids, input, deps);
        for (const id of ids) output[id] = verdicts.get(id) ?? fallbackVerdict(null, id, "provider_error");
      } catch {
        for (const id of ids) output[id] = fallbackVerdict(null, id, "provider_error");
      }
    }),
  );
  return output;
}

/**
 * 호출부가 최대 deadlineMs 만 기다리게 한다(JEV-116 R5). 초과하면 deadline_exceeded Standard 를 돌려주고,
 * provider 호출은 abort 하지 않고 백그라운드에서 끝나 trace·circuit 을 정상 기록한다.
 * deadline 초과 자체는 provider 실패가 아니므로 circuit 에 누적하지 않는다.
 */
export async function runDecisionWithDeadline(
  input: RunDecisionInput,
  deps: DecisionRuntimeDeps = {},
  options: { deadlineMs?: number } = {},
): Promise<DecisionVerdict> {
  let point: DecisionPoint | null = null;
  try {
    point = getDecisionPoint(input.pointId, deps.registry ?? DECISION_POINT_REGISTRY);
  } catch {
    point = null;
  }
  const deadlineMs = options.deadlineMs ?? point?.deadlineMs;
  const pending = runDecision(input, deps);
  if (typeof deadlineMs !== "number" || !Number.isFinite(deadlineMs) || deadlineMs <= 0) return pending;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<DecisionVerdict>((resolve) => {
    timer = setTimeout(() => resolve(fallbackVerdict(point, input.pointId, "deadline_exceeded")), deadlineMs);
  });
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
