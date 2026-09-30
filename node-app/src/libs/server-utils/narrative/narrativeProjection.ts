import "server-only";
import { redisCache } from "libs/cache/redisCacheService";
import { listPublishedUniverseCanon } from "libs/database/universe";
import { getUserStoryState } from "libs/database/game";
import { assertNarrativeCollectionAllowed, isNarrativeRuntimeEnabled } from "libs/server-utils/narrative/narrativeLifecycle";
import { projectNarrativePrompt, type NarrativePromptProjection } from "libs/server-utils/narrative/narrativeProjectionCore";
import type { NarrativeDirective } from "types/game";

/**
 * @docHint
 * @purpose Global Canon·directive·Personal Canon을 권한과 토큰 우선순위에 맞게 prompt projection
 * @process published Canon 조회  사용자 state 조회  안전 section 구성  Redis cache  bounded output
 * @domain narrative-runtime.prompt
 * @scope server
 */

export type { NarrativePromptProjection } from "libs/server-utils/narrative/narrativeProjectionCore";

export { projectNarrativePrompt } from "libs/server-utils/narrative/narrativeProjectionCore";

export async function loadNarrativePromptProjection(input: {
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  directive?: NarrativeDirective | null;
  memory?: string[];
  maxTokens?: number;
}): Promise<NarrativePromptProjection | null> {
  if (!isNarrativeRuntimeEnabled()) return null;
  const preference = await assertNarrativeCollectionAllowed(input.uid);
  const canon = await listPublishedUniverseCanon(input.universeId);
  const state = await getUserStoryState({ uid: input.uid, universeId: input.universeId, narrativeProfileId: input.narrativeProfileId });
  if (!state || preference.personalCanonStatus !== "active") return null;
  const canonRevision = canon.reduce((max, item) => Math.max(max, Number(item.revision || 0)), 0);
  const cacheable = !input.directive && !(input.memory && input.memory.length);
  const cacheKey = `narrative:projection:${input.uid}:${input.universeId}:${input.narrativeProfileId}:${canonRevision}:${state.version}`;
  if (cacheable) {
    const cached = await redisCache.get<NarrativePromptProjection>(cacheKey);
    if (cached?.content) return { ...cached, cacheHit: true };
  }
  const content = projectNarrativePrompt({ canon, state, directive: input.directive, memory: preference.crossServiceMemoryConsent === "granted" ? input.memory : undefined, maxTokens: input.maxTokens });
  const result = { content, canonRevision, stateVersion: state.version, cacheHit: false };
  if (cacheable) await redisCache.set(cacheKey, result, 300);
  return result;
}
