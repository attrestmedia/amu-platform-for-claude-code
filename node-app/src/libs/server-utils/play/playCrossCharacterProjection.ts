import "server-only";

import { listPublishedUniverseCanon } from "libs/database/universe/universeCanonRepo";
import { getUserStoryState } from "libs/database/game";

/**
 * @docHint
 * @purpose 한 캐릭터의 발견 사건을 다른 캐릭터 대화에 반영할 때 지식 경계를 강제하는 projection
 * @process 완료 beat → 학습 지식 토큰  캐릭터별 allowed/forbidden 경계 필터  공유 섹션 생성
 * @domain play-narrative
 * @scope server
 */

/**
 * 완료한 beat에서 플레이어가 얻는 지식 토큰 (canon character payload의
 * allowedKnowledge/forbiddenKnowledge ID 토큰과 같은 체계).
 */
export const COMPLETED_BEAT_KNOWLEDGE: Record<string, string[]> = {
  "beat-plaza-first-clue": ["kn-gate-motifs", "kn-outer-signals"],
};

export type CrossCharacterProjection = {
  characterId: string;
  learnedTokens: string[];
  shareableTokens: string[];
  hiddenTokens: string[];
  /** 캐릭터 대화 프롬프트에 주입할 섹션 (허용 지식만 포함, 비밀 토큰 미포함) */
  section: string;
};

/**
 * 순수 함수 — 캐릭터 지식 경계와 플레이어가 완료한 beat로부터
 * 공유 가능한 토큰만 추려 대화 프롬프트 섹션을 만든다.
 * forbiddenKnowledge에 걸린 토큰은 절대 section에 포함되지 않는다 (비밀 누출 0).
 */
export function buildCrossCharacterProjection(input: {
  characterId: string;
  boundary: { allowedKnowledge: string[]; forbiddenKnowledge: string[] };
  completedBeatIds: string[];
  relationAffinity: Record<string, number>;
}): CrossCharacterProjection {
  const allowed = new Set(input.boundary.allowedKnowledge || []);
  const forbidden = new Set(input.boundary.forbiddenKnowledge || []);
  const learnedTokens: string[] = [];
  for (const beatId of input.completedBeatIds || []) {
    for (const token of COMPLETED_BEAT_KNOWLEDGE[beatId] || []) {
      if (!learnedTokens.includes(token)) learnedTokens.push(token);
    }
  }
  const shareableTokens = learnedTokens.filter((token) => allowed.has(token) && !forbidden.has(token));
  const hiddenTokens = learnedTokens.filter((token) => !shareableTokens.includes(token));

  const lines: string[] = [];
  for (const token of shareableTokens) {
    lines.push(`- 공유된 단서: ${token}`);
  }
  for (const [characterId, value] of Object.entries(input.relationAffinity || {})) {
    const numeric = Math.max(-100, Math.min(100, Number(value || 0)));
    lines.push(`- 플레이어와의 관계 지표(${characterId}): ${numeric > 0 ? `+${numeric}` : numeric}`);
  }
  const section = lines.length
    ? ["다른 캐릭터와의 사건에서 파생된 최신 정보(허용 지식만):", ...lines].join("\n")
    : "";
  return { characterId: input.characterId, learnedTokens, shareableTokens, hiddenTokens, section };
}

/** published canon character payload에서 지식 경계를 읽는다. */
export async function getCharacterKnowledgeBoundary(universeId: string, characterId: string) {
  const published = await listPublishedUniverseCanon(universeId);
  const character = published.find((row) => row.entityType === "character" && row.entityId === characterId);
  if (!character) return null;
  const payload = character.payload as {
    allowedKnowledge?: string[];
    forbiddenKnowledge?: string[];
    goal?: string;
    secret?: string;
    relationRole?: string;
  };
  return {
    characterId,
    allowedKnowledge: Array.isArray(payload.allowedKnowledge) ? payload.allowedKnowledge.map(String) : [],
    forbiddenKnowledge: Array.isArray(payload.forbiddenKnowledge) ? payload.forbiddenKnowledge.map(String) : [],
    goal: typeof payload.goal === "string" ? payload.goal : "",
    secret: typeof payload.secret === "string" ? payload.secret : "",
    relationRole: typeof payload.relationRole === "string" ? payload.relationRole : "",
  };
}

/**
 * 캐릭터별 cross-character projection — 플레이어 story state(단일 canonical owner)에서
 * 완료 beat와 관계 수치를 읽어 경계 필터를 적용한다. 이 함수는 어떤 곳에도 쓰기를 하지 않는다.
 */
export async function projectCrossCharacterForCharacter(input: {
  uid: string;
  universeId: string;
  characterId: string;
  narrativeProfileId?: string;
}): Promise<CrossCharacterProjection | null> {
  const boundary = await getCharacterKnowledgeBoundary(input.universeId, input.characterId);
  if (!boundary) return null;
  const state = await getUserStoryState({
    uid: input.uid,
    universeId: input.universeId,
    narrativeProfileId: input.narrativeProfileId || "play-pilot",
  });
  return buildCrossCharacterProjection({
    characterId: input.characterId,
    boundary,
    completedBeatIds: state?.completedBeatIds || [],
    relationAffinity: state?.relationAffinity || {},
  });
}
