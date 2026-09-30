import "server-only";

import { redisCache } from "libs/cache/redisCacheService";
import {
  NARRATIVE_DIRECTOR_CIRCUIT_POLICY,
  emptyNarrativeDirectorCircuit,
  normalizeNarrativeDirectorCircuit,
  type NarrativeDirectorCircuitRecord,
} from "libs/server-utils/narrative/narrativeDirectorCircuitCore";

/**
 * @docHint
 * @purpose Narrative Director circuit breaker의 Redis 영속 어댑터 (G6)
 * @process 안전한 scope key 확인  상태 읽기  닫힌 회로는 키 삭제  열린 회로는 TTL 저장
 * @domain narrative-runtime.billing
 * @scope server
 */

export * from "libs/server-utils/narrative/narrativeDirectorCircuitCore";

function circuitKey(scope: string) {
  const normalized = String(scope || "").trim();
  if (!normalized || normalized.length > 300 || /[\s\n\r\t]/.test(normalized)) throw new Error("NARRATIVE_CIRCUIT_SCOPE_INVALID");
  return `narrative:director:circuit:${normalized}`;
}

const CIRCUIT_TTL_SECONDS = Math.max(
  NARRATIVE_DIRECTOR_CIRCUIT_POLICY.openSeconds,
  NARRATIVE_DIRECTOR_CIRCUIT_POLICY.failureWindowSeconds,
) * 4;

/**
 * Redis에 저장된 circuit 상태를 읽는다.
 * 저장소 장애는 "닫힌 회로"로 간주한다 — cap·가격표·잔액 preflight가 여전히 fail-closed로 남기 때문에
 * 여기서 fail-closed로 만들면 캐시 장애만으로 Director가 영구 차단된다.
 */
export async function readNarrativeDirectorCircuit(scope: string): Promise<NarrativeDirectorCircuitRecord> {
  try {
    const cached = await redisCache.get<NarrativeDirectorCircuitRecord>(circuitKey(scope));
    return normalizeNarrativeDirectorCircuit(cached);
  } catch {
    return emptyNarrativeDirectorCircuit();
  }
}

export async function writeNarrativeDirectorCircuit(scope: string, record: NarrativeDirectorCircuitRecord): Promise<void> {
  try {
    const normalized = normalizeNarrativeDirectorCircuit(record);
    if (normalized.failures === 0 && normalized.openedAt === null) {
      await redisCache.del(circuitKey(scope));
      return;
    }
    await redisCache.set(circuitKey(scope), normalized, CIRCUIT_TTL_SECONDS);
  } catch {
    // 관측 실패가 채팅을 막지 않는다. 다음 호출은 닫힌 회로로 재평가된다.
  }
}
