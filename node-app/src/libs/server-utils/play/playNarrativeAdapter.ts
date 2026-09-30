import "server-only";

import { applyNarrativeOutcome } from "libs/server-utils/narrative/narrativeReducer";
import { assertNarrativeCollectionAllowed } from "libs/server-utils/narrative/narrativeLifecycle";
import {
  createStoryArcIfAbsent,
  createStoryBeatIfAbsent,
  getCharacterGenesisProfile,
  getUserStoryState,
} from "libs/database/game";
import { type NarrativeOutcome, type NarrativeStatValues } from "types/game";
import { recordPilotMetric } from "./playPilotMetrics";

/**
 * @docHint
 * @purpose Play 파일럿 발견(discovery) 이벤트를 Personal Canon NarrativeEvent로 연결하는 adapter
 * @process consent 게이트  arc/beat 시드  attribute·affinity·stat 서버 판정  멱등 event 적용
 * @domain play-narrative
 * @scope server
 */

export const PLAY_PILOT = {
  universeId: "the-universe",
  arcId: "arc-gate-mystery",
  arcCharacterId: "tu-warden",
  goalKey: "play.gate-mystery",
  firstBeat: {
    beatId: "beat-plaza-first-clue",
    sequence: 1,
    transitionKey: "story.arc.activate" as const,
  },
  targetCharacterId: "tu-scholar",
  canonRevision: 1,
} as const;

/** ruleset the-universe v1: attribute → 판정에 사용하는 stat 매핑 */
export const ATTRIBUTE_STAT_MAP: Record<string, keyof NarrativeStatValues> = {
  resolve: "focus",
  wonder: "insight",
};

export type DiscoveryJudgment = {
  passed: boolean;
  score: number;
  difficulty: number;
  statId: string;
  statValue: number;
  affinityBonus: number;
};

/**
 * attribute·stat·affinity를 사용한 서버 권위 판정 (결정론).
 * score = 관련 stat + affinity 보너스(±10 clamp), 기준 이상이면 성공.
 */
export function judgeDiscoveryEvent(input: {
  playerAttributeId: string;
  playerStats: NarrativeStatValues;
  relationAffinity: number;
  difficulty: number;
}): DiscoveryJudgment {
  const statId = ATTRIBUTE_STAT_MAP[input.playerAttributeId] || "adaptability";
  const statValue = Math.max(0, Math.min(100, Math.round(Number(input.playerStats[statId] || 0))));
  const rawAffinity = Number.isFinite(input.relationAffinity) ? Number(input.relationAffinity) : 0;
  const affinityBonus = Math.max(-10, Math.min(10, rawAffinity * 0.1));
  const score = Math.round(statValue + affinityBonus);
  const difficulty = Math.max(0, Math.min(100, Math.round(Number(input.difficulty || 0))));
  return { passed: score >= difficulty, score, difficulty, statId, statValue, affinityBonus };
}

function clampBeatPayloadId(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 120 || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized)) {
    throw new Error("PLAY_INPUT_INVALID");
  }
  return normalized;
}

/**
 * 발견(discovery) 활성화 — Stage/Character discovery 트리거가 StoryArc activation으로 이어진다.
 * 동일 idempotencyKey 재호출 시 event·상태 전이가 중복되지 않는다 (applyNarrativeOutcome 계약).
 */
export async function activatePlayDiscoveryArc(input: { uid: string; idempotencyKey: string }) {
  await assertNarrativeCollectionAllowed(input.uid);
  const outcome: NarrativeOutcome = {
    source: "user_action",
    transition: "story.arc.activate",
    payload: { arcId: PLAY_PILOT.arcId },
    resolverVersion: 1,
  };
  const applied = await applyNarrativeOutcome({
    uid: input.uid,
    universeId: PLAY_PILOT.universeId,
    narrativeProfileId: "play-pilot",
    canonRevision: PLAY_PILOT.canonRevision,
    idempotencyKey: clampBeatPayloadId(input.idempotencyKey),
    outcome,
  });
  // arc/beat 시드는 사용자 namespace 데이터로, activation 성공 후 존재를 보장한다.
  await createStoryArcIfAbsent({
    arcId: PLAY_PILOT.arcId,
    uid: input.uid,
    universeId: PLAY_PILOT.universeId,
    narrativeProfileId: "play-pilot",
    characterId: PLAY_PILOT.arcCharacterId,
    canonRevision: PLAY_PILOT.canonRevision,
    goalKey: PLAY_PILOT.goalKey,
    status: "active",
  });
  await createStoryBeatIfAbsent({
    beatId: PLAY_PILOT.firstBeat.beatId,
    arcId: PLAY_PILOT.arcId,
    uid: input.uid,
    universeId: PLAY_PILOT.universeId,
    narrativeProfileId: "play-pilot",
    sequence: PLAY_PILOT.firstBeat.sequence,
    canonRevision: PLAY_PILOT.canonRevision,
    transitionKey: PLAY_PILOT.firstBeat.transitionKey,
    status: "active",
  });
  void recordPilotMetric({
    uid: input.uid,
    universeId: PLAY_PILOT.universeId,
    metric: "story_continuation",
    idempotencyKey: `activate:${input.idempotencyKey}`,
  });
  return { state: applied.state, event: applied.event, duplicate: applied.duplicate };
}

/**
 * 발견 시도(discovery attempt) — attribute·stat·affinity 판정 결과를 NarrativeEvent로만 반영한다.
 * 성공: story.beat.complete / 실패: 친밀도 -3(재시도 가능, beat 미완료).
 * 판정은 서버가 하며 클라이언트 결과는 신뢰하지 않는다.
 */
export async function resolvePlayDiscoveryEvent(input: {
  uid: string;
  playerCharacterId: string;
  idempotencyKey: string;
  difficulty?: number;
}) {
  await assertNarrativeCollectionAllowed(input.uid);
  const playerCharacterId = clampBeatPayloadId(input.playerCharacterId);
  const genesis = await getCharacterGenesisProfile({ uid: input.uid, characterId: playerCharacterId });
  if (!genesis || genesis.sourceType !== "user-random") {
    // 파일럿 판정은 사용자 생성(random) 캐릭터의 genesis stat으로만 한다.
    throw new Error("PLAY_PLAYER_GENESIS_REQUIRED");
  }
  const state = await getUserStoryState({
    uid: input.uid,
    universeId: PLAY_PILOT.universeId,
    narrativeProfileId: "play-pilot",
  });
  if (!state || !state.activeArcIds.includes(PLAY_PILOT.arcId)) {
    throw new Error("PLAY_DISCOVERY_NOT_ACTIVATED");
  }
  if (state.completedBeatIds.includes(PLAY_PILOT.firstBeat.beatId)) {
    return { judgment: null, state, event: null, duplicate: true };
  }
  const judgment = judgeDiscoveryEvent({
    playerAttributeId: genesis.primaryAttributeId,
    playerStats: genesis.stats,
    relationAffinity: Number(state.relationAffinity[PLAY_PILOT.targetCharacterId] || 0),
    difficulty: input.difficulty ?? 45,
  });
  void recordPilotMetric({
    uid: input.uid,
    universeId: PLAY_PILOT.universeId,
    metric: "discovery_attempt",
    idempotencyKey: `${input.idempotencyKey}:attempt`,
    detail: { difficulty: input.difficulty ?? 45 },
  });
  const outcome: NarrativeOutcome = judgment.passed
    ? {
        source: "game_judgement",
        transition: "story.beat.complete",
        payload: { beatId: PLAY_PILOT.firstBeat.beatId },
        resolverVersion: 1,
      }
    : {
        source: "game_judgement",
        transition: "relation.affinity.adjust",
        payload: { targetCharacterId: PLAY_PILOT.targetCharacterId, delta: -3 },
        resolverVersion: 1,
      };
  const applied = await applyNarrativeOutcome({
    uid: input.uid,
    universeId: PLAY_PILOT.universeId,
    narrativeProfileId: "play-pilot",
    canonRevision: PLAY_PILOT.canonRevision,
    idempotencyKey: clampBeatPayloadId(input.idempotencyKey),
    outcome,
  });
  let reward = null;
  if (judgment.passed) {
    await createStoryBeatIfAbsent({
      beatId: PLAY_PILOT.firstBeat.beatId,
      arcId: PLAY_PILOT.arcId,
      uid: input.uid,
      universeId: PLAY_PILOT.universeId,
      narrativeProfileId: "play-pilot",
      sequence: PLAY_PILOT.firstBeat.sequence,
      canonRevision: PLAY_PILOT.canonRevision,
      transitionKey: "story.beat.complete",
      status: "completed",
    });
    // 성공 보상: 관계 친밀도 +5 (별도 멱등 event로 적용 — 중복 보상 없음)
    reward = await applyNarrativeOutcome({
      uid: input.uid,
      universeId: PLAY_PILOT.universeId,
      narrativeProfileId: "play-pilot",
      canonRevision: PLAY_PILOT.canonRevision,
      idempotencyKey: clampBeatPayloadId(`${input.idempotencyKey}:reward`),
      outcome: {
        source: "game_judgement",
        transition: "relation.affinity.adjust",
        payload: { targetCharacterId: PLAY_PILOT.targetCharacterId, delta: 5 },
        resolverVersion: 1,
      },
    });
    void recordPilotMetric({
      uid: input.uid,
      universeId: PLAY_PILOT.universeId,
      metric: "discovery_completed",
      idempotencyKey: `${input.idempotencyKey}:completed`,
      detail: { beatId: PLAY_PILOT.firstBeat.beatId },
    });
  }
  return { judgment, state: reward?.state || applied.state, event: applied.event, duplicate: applied.duplicate };
}

/** 상태 UI용 bundle — story state + 관계 수치 */
export async function getPlayNarrativeBundle(input: { uid: string }) {
  const state = await getUserStoryState({
    uid: input.uid,
    universeId: PLAY_PILOT.universeId,
    narrativeProfileId: "play-pilot",
  });
  return {
    activated: Boolean(state),
    state: state
      ? {
          version: state.version,
          activeArcIds: state.activeArcIds,
          activeBeatIds: state.activeBeatIds,
          completedBeatIds: state.completedBeatIds,
          flags: state.flags,
          relationAffinity: state.relationAffinity,
        }
      : null,
  };
}
