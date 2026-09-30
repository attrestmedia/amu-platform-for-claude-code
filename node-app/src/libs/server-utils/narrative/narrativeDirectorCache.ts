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

export async function runCachedNarrativeDirector(input: Parameters<typeof runNarrativeDirector>[0] & { cacheKey: string }): Promise<NarrativeDirectiveProposal> {
  const key = cacheKey(input.cacheKey);
  const cached = await redisCache.get<NarrativeDirectiveProposal>(key);
  if (cached?.directive && cached.status === "proposal") return { ...cached, telemetry: { ...cached.telemetry, cacheHit: true } };
  const result = await runNarrativeDirector({ ...input, cacheHit: false });
  if (result.status === "proposal" && result.directive) await redisCache.set(key, result, NARRATIVE_DIRECTOR_POLICY.cacheTtlSeconds);
  return result;
}
