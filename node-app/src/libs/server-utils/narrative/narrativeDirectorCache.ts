import "server-only";
import { redisCache } from "libs/cache/redisCacheService";
import { runNarrativeDirector, NARRATIVE_DIRECTOR_POLICY } from "libs/server-utils/narrative/narrativeDirector";
import type { NarrativeDirectiveProposal } from "types/game";

/**
 * @docHint
 * @purpose session/beat 단위 Director proposal cache
 * @process 안전한 cache key 확인  Redis hit  structured Director 실행  성공 proposal TTL 저장
 * @domain narrative-runtime.cache
 * @scope server
 */

function cacheKey(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 300 || /[\s\n\r\t]/.test(normalized)) throw new Error("NARRATIVE_CACHE_KEY_INVALID");
  return `narrative:director:${normalized}`;
}

/** 성공 proposal 만 hit 으로 본다. Redis 장애는 miss 로 취급한다. */
export async function peekNarrativeDirectorCache(rawKey: string): Promise<NarrativeDirectiveProposal | null> {
  try {
    const cached = await redisCache.get<NarrativeDirectiveProposal>(cacheKey(rawKey));
    if (cached?.directive && cached.status === "proposal") return { ...cached, telemetry: { ...cached.telemetry, cacheHit: true } };
  } catch {
    // cache read failure is a miss
  }
  return null;
}

export async function runCachedNarrativeDirector(
  input: Parameters<typeof runNarrativeDirector>[0] & { cacheKey: string; cacheTtlSeconds?: number },
): Promise<NarrativeDirectiveProposal> {
  const key = cacheKey(input.cacheKey);
  const cached = await redisCache.get<NarrativeDirectiveProposal>(key);
  if (cached?.directive && cached.status === "proposal") return { ...cached, telemetry: { ...cached.telemetry, cacheHit: true } };
  const result = await runNarrativeDirector({ ...input, cacheHit: false });
  if (result.status === "proposal" && result.directive) {
    await redisCache.set(key, result, input.cacheTtlSeconds ?? NARRATIVE_DIRECTOR_POLICY.cacheTtlSeconds);
  }
  return result;
}
