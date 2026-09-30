import "server-only";

import { redisCache } from "libs/cache/redisCacheService";
import {
  emptyDecisionCircuit,
  normalizeDecisionCircuit,
  openDecisionCircuitRecord,
  type DecisionCircuitPolicy,
  type DecisionCircuitRecord,
} from "libs/server-utils/decision/decisionCircuitCore";

/**
 * @docHint
 * @purpose JEV circuit 상태 Redis 어댑터 — narrative namespace와 독립
 * @process scope 검증  상태 조회  closed 상태 삭제  상태 저장
 * @domain decision
 * @scope server
 */

function decisionCircuitKey(scope: string) {
  const normalized = String(scope || "").trim();
  if (!normalized || normalized.length > 300 || /[\s\n\r\t]/.test(normalized)) {
    throw new Error("DECISION_CIRCUIT_SCOPE_INVALID");
  }
  return `decision:jev:circuit:${normalized}`;
}

function isValidCircuitRecord(value: unknown): value is DecisionCircuitRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<DecisionCircuitRecord>;
  const isNonNegativeInteger = (field: unknown) =>
    typeof field === "number" && Number.isSafeInteger(field) && field >= 0;
  return (
    isNonNegativeInteger(record.failures) &&
    isNonNegativeInteger(record.firstFailureAt) &&
    isNonNegativeInteger(record.lastFailureAt) &&
    (record.openedAt === null || (typeof record.openedAt === "number" && Number.isSafeInteger(record.openedAt) && record.openedAt > 0)) &&
    isNonNegativeInteger(record.halfOpenProbes)
  );
}

export async function readDecisionCircuit(
  scope: string,
  policy: DecisionCircuitPolicy,
): Promise<DecisionCircuitRecord> {
  try {
    const cached = await redisCache.get<unknown>(decisionCircuitKey(scope));
    if (cached === null || cached === undefined) return emptyDecisionCircuit();
    if (!isValidCircuitRecord(cached)) return openDecisionCircuitRecord(policy, Date.now());
    return normalizeDecisionCircuit(cached);
  } catch {
    // JEV는 optional intelligence이므로 circuit 저장소를 읽지 못하면 호출하지 않는다.
    return openDecisionCircuitRecord(policy, Date.now());
  }
}

export async function writeDecisionCircuit(
  scope: string,
  record: DecisionCircuitRecord,
  policy: DecisionCircuitPolicy,
): Promise<void> {
  try {
    const key = decisionCircuitKey(scope);
    const normalized = normalizeDecisionCircuit(record);
    if (normalized.failures === 0 && normalized.openedAt === null) {
      await redisCache.del(key);
      return;
    }
    const ttlSeconds = Math.max(policy.openSeconds, policy.failureWindowSeconds) * 4;
    await redisCache.set(key, normalized, ttlSeconds);
  } catch {
    // Circuit 관측 저장 실패는 판단 기능을 활성화시키지 않는다. 다음 read에서 저장소 장애는 open이다.
  }
}
