/**
 * @docHint
 * @purpose JEV 전용 circuit breaker 순수 상태 기계
 * @process 실패 창 누적  임계 도달 시 open  cooldown 후 단일 half-open probe
 * @domain decision
 * @scope server
 */

export type DecisionCircuitPolicy = {
  failureThreshold: number;
  failureWindowSeconds: number;
  openSeconds: number;
};

export type DecisionCircuitState = "closed" | "open" | "half-open";

export type DecisionCircuitRecord = {
  failures: number;
  firstFailureAt: number;
  lastFailureAt: number;
  openedAt: number | null;
  halfOpenProbes: number;
};

export function emptyDecisionCircuit(): DecisionCircuitRecord {
  return { failures: 0, firstFailureAt: 0, lastFailureAt: 0, openedAt: null, halfOpenProbes: 0 };
}

export function normalizeDecisionCircuit(record: unknown): DecisionCircuitRecord {
  if (!record || typeof record !== "object" || Array.isArray(record)) return emptyDecisionCircuit();
  const raw = record as Partial<DecisionCircuitRecord>;
  const int = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const openedAt = typeof raw.openedAt === "number" && Number.isSafeInteger(raw.openedAt) && raw.openedAt > 0
    ? raw.openedAt
    : null;
  return {
    failures: int(raw.failures),
    firstFailureAt: int(raw.firstFailureAt),
    lastFailureAt: int(raw.lastFailureAt),
    openedAt,
    halfOpenProbes: int(raw.halfOpenProbes),
  };
}

/** 저장된 상태·운영 정책·현재 시각만 사용한다. 외부 I/O는 없다. */
export function evaluateDecisionCircuit(
  record: DecisionCircuitRecord,
  policy: DecisionCircuitPolicy,
  nowMs: number,
): DecisionCircuitState {
  const current = normalizeDecisionCircuit(record);
  if (current.openedAt === null) return "closed";
  const openUntil = current.openedAt + policy.openSeconds * 1000;
  if (nowMs < openUntil || current.halfOpenProbes > 0) return "open";
  return "half-open";
}

/** 저장소 읽기 장애는 주어진 cooldown 동안 회로를 확실히 닫아 둔다. */
export function openDecisionCircuitRecord(policy: DecisionCircuitPolicy, nowMs: number): DecisionCircuitRecord {
  return {
    failures: Math.max(1, policy.failureThreshold),
    firstFailureAt: nowMs,
    lastFailureAt: nowMs,
    openedAt: nowMs,
    halfOpenProbes: 0,
  };
}

/** cooldown이 지난 half-open 구간에서 한 번만 시험 호출을 소비한다. */
export function applyDecisionProbe(
  record: DecisionCircuitRecord,
  policy: DecisionCircuitPolicy,
  nowMs: number,
): DecisionCircuitRecord {
  const current = normalizeDecisionCircuit(record);
  if (evaluateDecisionCircuit(current, policy, nowMs) !== "half-open") return current;
  return { ...current, halfOpenProbes: current.halfOpenProbes + 1 };
}

export function applyDecisionFailure(
  record: DecisionCircuitRecord,
  policy: DecisionCircuitPolicy,
  nowMs: number,
): DecisionCircuitRecord {
  const current = normalizeDecisionCircuit(record);
  const cooldownElapsed = current.openedAt !== null &&
    nowMs >= current.openedAt + policy.openSeconds * 1000;
  if (cooldownElapsed && current.failures >= policy.failureThreshold) {
    return openDecisionCircuitRecord(policy, nowMs);
  }
  if (evaluateDecisionCircuit(current, policy, nowMs) === "half-open") {
    return openDecisionCircuitRecord(policy, nowMs);
  }

  const withinWindow = current.lastFailureAt > 0 &&
    nowMs - current.lastFailureAt <= policy.failureWindowSeconds * 1000;
  const failures = withinWindow ? current.failures + 1 : 1;
  const next: DecisionCircuitRecord = {
    failures,
    firstFailureAt: withinWindow && current.firstFailureAt > 0 ? current.firstFailureAt : nowMs,
    lastFailureAt: nowMs,
    openedAt: current.openedAt,
    halfOpenProbes: current.halfOpenProbes,
  };
  if (failures >= policy.failureThreshold) {
    next.openedAt = nowMs;
    next.halfOpenProbes = 0;
  }
  return next;
}

export function applyDecisionSuccess(): DecisionCircuitRecord {
  return emptyDecisionCircuit();
}
