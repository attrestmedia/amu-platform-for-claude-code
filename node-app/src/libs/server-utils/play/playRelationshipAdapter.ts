import "server-only";

import { getUserStoryState } from "libs/database/game";

/**
 * @docHint
 * @purpose Play 관계 수치의 단일 canonical owner(story state relationAffinity) 읽기 adapter
 * @process reducer 파이프라인(NarrativeEvent)이 유일한 write 경로  본 adapter는 읽기만 제공
 * @domain play-narrative
 * @scope server
 */

export type PlayRelationEntry = {
  targetCharacterId: string;
  affinity: number;
  source: "story_state";
};

/**
 * 관계 수치 조회 — user_story_states.relationAffinity를 canonical 값으로 읽는다.
 * 이중 write 금지 계약: 친밀도 변경은 NarrativeEvent reducer로만 가능하며,
 * 이 adapter(NpcIntimacy·CharacterRelation 등 타 저장소 포함)는 어떤 곳에도 쓰지 않는다.
 */
export async function getPlayRelationSnapshot(input: {
  uid: string;
  universeId: string;
  narrativeProfileId?: string;
}): Promise<{ relations: PlayRelationEntry[]; stateVersion: number | null }> {
  const state = await getUserStoryState({
    uid: input.uid,
    universeId: input.universeId,
    narrativeProfileId: input.narrativeProfileId || "play-pilot",
  });
  const relations = Object.entries(state?.relationAffinity || {}).map(([targetCharacterId, value]) => ({
    targetCharacterId,
    affinity: Math.max(-100, Math.min(100, Math.round(Number(value || 0)))),
    source: "story_state" as const,
  }));
  return { relations, stateVersion: state ? Number(state.version) : null };
}
