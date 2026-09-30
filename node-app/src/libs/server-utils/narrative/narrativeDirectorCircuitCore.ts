/**
 * @docHint
 * @purpose Narrative Director circuit breaker의 순수 상태 기계 (G6) — 저장소에 의존하지 않는다
 * @process 실패 누적  임계 초과 시 open  cooldown 후 half-open 단일 probe  성공 시 close
 * @domain narrative-runtime.billing
 * @scope server
 */

export const NARRATIVE_DIRECTOR_CIRCUIT_POLICY = {
  /** failureWindowSeconds 안에서 이 횟수만큼 실패하면 open으로 전이한다. */
  failureThreshold: 3,
  failureWindowSeconds: 60,
  /** open 유지 시간. 지나면 half-open으로 내려온다. */
  openSeconds: 120,
  /** half-open에서 허용하는 시험 호출 수. */
  halfOpenProbes: 1,
} as const;

export type NarrativeDirectorCircuitState = "closed" | "open" | "half-open";

export type NarrativeDirectorCircuitRecord = {
  failures: number;
  firstFailureAt: number;
  lastFailureAt: number;
  openedAt: number | null;
  halfOpenProbes: number;
};

export function emptyNarrativeDirectorCircuit(): NarrativeDirectorCircuitRecord {
  return { failures: 0, firstFailureAt: 0, lastFailureAt: 0, openedAt: null, halfOpenProbes: 0 };
}

export function normalizeNarrativeDirectorCircuit(record: unknown): NarrativeDirectorCircuitRecord {
  if (!record || typeof record !== "object" || Array.isArray(record)) return emptyNarrativeDirectorCircuit();
  const raw = record as Partial<NarrativeDirectorCircuitRecord>;
  const int = (value: unknown) => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0);
  const openedAt = Number.isSafeInteger(Number(raw.openedAt)) && Number(raw.openedAt) > 0 ? Number(raw.openedAt) : null;
  return {
    failures: int(raw.failures),
    firstFailureAt: int(raw.firstFailureAt),
    lastFailureAt: int(raw.lastFailureAt),
    openedAt,
    halfOpenProbes: int(raw.halfOpenProbes),
  };
}

/** 저장된 record와 현재 시각만으로 상태를 판정한다. 외부 I/O가 없다. */
export function evaluateNarrativeDirectorCircuit(
  record: NarrativeDirectorCircuitRecord,
  nowMs: number,
): { state: NarrativeDirectorCircuitState; openUntil: number | null; callAllowed: boolean } {
  const current = normalizeNarrativeDirectorCircuit(record);
  if (current.openedAt === null) return { state: "closed", openUntil: null, callAllowed: true };
  const openUntil = current.openedAt + NARRATIVE_DIRECTOR_CIRCUIT_POLICY.openSeconds * 1000;
  if (nowMs < openUntil) return { state: "open", openUntil, callAllowed: false };
  const callAllowed = current.halfOpenProbes < NARRATIVE_DIRECTOR_CIRCUIT_POLICY.halfOpenProbes;
  return { state: "half-open", openUntil, callAllowed };
}

/** half-open에서 시험 호출을 소비한다. closed에서는 아무것도 바꾸지 않는다. */
export function applyNarrativeDirectorProbe(record: NarrativeDirectorCircuitRecord, nowMs: number): NarrativeDirectorCircuitRecord {
  const current = normalizeNarrativeDirectorCircuit(record);
  const evaluated = evaluateNarrativeDirectorCircuit(current, nowMs);
  if (evaluated.state !== "half-open") return current;
  return { ...current, halfOpenProbes: current.halfOpenProbes + 1 };
}

export function applyNarrativeDirectorFailure(record: NarrativeDirectorCircuitRecord, nowMs: number): NarrativeDirectorCircuitRecord {
  const current = normalizeNarrativeDirectorCircuit(record);
  const evaluated = evaluateNarrativeDirectorCircuit(current, nowMs);
  // half-open 시험 호출이 실패하면 즉시 다시 open한다.
  if (evaluated.state === "half-open") {
    return { failures: NARRATIVE_DIRECTOR_CIRCUIT_POLICY.failureThreshold, firstFailureAt: nowMs, lastFailureAt: nowMs, openedAt: nowMs, halfOpenProbes: 0 };
  }
  const withinWindow = current.lastFailureAt > 0 && nowMs - current.lastFailureAt <= NARRATIVE_DIRECTOR_CIRCUIT_POLICY.failureWindowSeconds * 1000;
  const failures = withinWindow ? current.failures + 1 : 1;
  const next: NarrativeDirectorCircuitRecord = {
    failures,
    firstFailureAt: withinWindow && current.firstFailureAt > 0 ? current.firstFailureAt : nowMs,
    lastFailureAt: nowMs,
    openedAt: current.openedAt,
    halfOpenProbes: current.halfOpenProbes,
  };
  if (failures >= NARRATIVE_DIRECTOR_CIRCUIT_POLICY.failureThreshold) {
    next.openedAt = nowMs;
    next.halfOpenProbes = 0;
  }
  return next;
}

export function applyNarrativeDirectorSuccess(): NarrativeDirectorCircuitRecord {
  return emptyNarrativeDirectorCircuit();
}
