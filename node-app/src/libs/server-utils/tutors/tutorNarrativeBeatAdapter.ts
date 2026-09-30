import "server-only";

import { applyNarrativeOutcome } from "libs/server-utils/narrative/narrativeReducer";
import { assertNarrativeCollectionAllowed } from "libs/server-utils/narrative/narrativeLifecycle";
import {
  createStoryArcIfAbsent,
  createStoryBeatIfAbsent,
  getUserStoryState,
} from "libs/database/game";
import {
  projectTutorStoryContext,
  resolveNarrativeMode,
  type TutorNarrativeMode,
  type TutorSessionState,
} from "./tutorNarrativeSession";
import { recordTutorPilotMetric } from "./tutorPilotMetrics";

/**
 * @docHint
 * @purpose 학습 평가 결과를 허용된 Story Beat transition으로 변환하는 Tutors adapter (OOC-061)
 * @process learning 결과 통과(재채점 없음)  mode·세션 게이트  story failure 격리  세션 연속성(질문 id 멱등)
 * @domain tutors-narrative
 * @scope server
 */

export const TUTOR_PILOT = {
  universeId: "the-universe",
  arcId: "tarc-learning",
  arcCharacterId: "tu-scholar",
  goalKey: "tutors.learning-basics",
  firstBeat: { beatId: "tbeat-conversation-basics", sequence: 1 },
  narrativeProfileId: "tutors-pilot",
  canonRevision: 1,
} as const;

export type TutorLearningBeatResult = {
  learning: { passed: boolean; mode: TutorNarrativeMode; independentOfStory: true };
  story: {
    applied: boolean;
    duplicate: boolean;
    reason: string;
    stateVersion: number | null;
  };
};

function safeId(value: string, code: string) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 120 || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

/**
 * 학습 평가 결과를 Story Beat transition으로 변환한다.
 * - learning 결과(passed)는 인자로 받은 그대로 반환한다 (adapter가 재채점하지 않음).
 * - narrativeMode off 또는 story 게이트 실패 시 story만 중단되고 학습은 영향받지 않는다.
 * - 세션 연속성: questionId를 idempotencyKey로 사용해 같은 문제의 재평가는 이벤트 중복 없이 흡수된다.
 */
export async function applyTutorLearningBeat(input: {
  uid: string;
  narrativeMode?: unknown;
  sessionState?: unknown;
  beatId?: string;
  questionId: string;
  passed: boolean;
  storyContext?: string;
}): Promise<TutorLearningBeatResult> {
  const mode = resolveNarrativeMode({ requestedMode: input.narrativeMode });
  const sessionState = (["active", "exited", "resumed", "completed"].includes(
    String(input.sessionState || ""),
  )
    ? (String(input.sessionState) as TutorSessionState)
    : "active") as TutorSessionState;
  const learning = { passed: input.passed === true, mode, independentOfStory: true as const };

  // OOC-063 계측 — learning 완료·교정 품질(프록시)은 story 게이트와 무관하게 기록한다 (fail-open, 비차단).
  const questionKey = String(input.questionId || "").trim();
  if (questionKey) {
    void recordTutorPilotMetric({
      uid: input.uid,
      universeId: TUTOR_PILOT.universeId,
      metric: "learning_completion",
      idempotencyKey: `tutor:${questionKey}:learning`,
      detail: { mode, passed: learning.passed, sessionState },
    });
    void recordTutorPilotMetric({
      uid: input.uid,
      universeId: TUTOR_PILOT.universeId,
      metric: "correction_quality",
      idempotencyKey: `tutor:${questionKey}:correction`,
      detail: { corrected: learning.passed, score: learning.passed ? 1 : 0, mode },
    });
  }

  const gate = projectTutorStoryContext({
    mode,
    sessionState,
    storyContext: input.storyContext || "학습 세션의 서사 맥락(기본 제공)",
  });
  if (!gate.includeStoryContext) {
    return {
      learning,
      story: { applied: false, duplicate: false, reason: gate.reason, stateVersion: null },
    };
  }

  const beatId = safeId(input.beatId || TUTOR_PILOT.firstBeat.beatId, "TUTORS_BEAT_INVALID");
  const questionId = safeId(input.questionId, "TUTORS_QUESTION_INVALID");

  try {
    // tutors 서사는 Play↔Tutors cross-service 맥락이므로 cross-service consent를 함께 요구한다 (OOC-062).
    await assertNarrativeCollectionAllowed(input.uid, { crossService: true });
    const outcome = learning.passed
      ? {
          source: "learning_evaluation" as const,
          transition: "story.beat.complete" as const,
          payload: { beatId },
          resolverVersion: 1 as const,
        }
      : null;
    if (!outcome) {
      // 오답은 story transition을 만들지 않는다 — 학습 재시도는 story와 무관하게 가능
      return { learning, story: { applied: false, duplicate: false, reason: "answer_failed_no_transition", stateVersion: null } };
    }
    const applied = await applyNarrativeOutcome({
      uid: input.uid,
      universeId: TUTOR_PILOT.universeId,
      narrativeProfileId: TUTOR_PILOT.narrativeProfileId,
      canonRevision: TUTOR_PILOT.canonRevision,
      idempotencyKey: `tutor:${questionId}`,
      outcome,
    });
    await createStoryArcIfAbsent({
      arcId: TUTOR_PILOT.arcId,
      uid: input.uid,
      universeId: TUTOR_PILOT.universeId,
      narrativeProfileId: TUTOR_PILOT.narrativeProfileId,
      characterId: TUTOR_PILOT.arcCharacterId,
      canonRevision: TUTOR_PILOT.canonRevision,
      goalKey: TUTOR_PILOT.goalKey,
      status: "active",
    });
    await createStoryBeatIfAbsent({
      beatId,
      arcId: TUTOR_PILOT.arcId,
      uid: input.uid,
      universeId: TUTOR_PILOT.universeId,
      narrativeProfileId: TUTOR_PILOT.narrativeProfileId,
      sequence: TUTOR_PILOT.firstBeat.sequence,
      canonRevision: TUTOR_PILOT.canonRevision,
      transitionKey: "story.beat.complete",
      status: "completed",
    });
    void recordTutorPilotMetric({
      uid: input.uid,
      universeId: TUTOR_PILOT.universeId,
      metric: "narrative_continuation",
      idempotencyKey: `tutor:${questionId}:story`,
      detail: { mode, beatId },
    });
    return {
      learning,
      story: {
        applied: true,
        duplicate: applied.duplicate,
        reason: applied.duplicate ? "already_applied" : "applied",
        stateVersion: applied.state.version,
      },
    };
  } catch (error) {
    // story failure는 학습 session을 실패시키지 않는다 — 학습 결과를 그대로 반환한다.
    const reason = `degraded:${error instanceof Error ? error.message : String(error)}`.slice(0, 160);
    // 동의 철회·opt-out으로 story projection이 차단되면 opt_out을 계측한다 (OOC-063).
    if (/NARRATIVE_CROSS_SERVICE_CONSENT_REQUIRED|NARRATIVE_CONSENT_REQUIRED/.test(reason)) {
      void recordTutorPilotMetric({
        uid: input.uid,
        universeId: TUTOR_PILOT.universeId,
        metric: "opt_out",
        idempotencyKey: `tutor:${questionId}:optout`,
        detail: { reason: "consent_withdrawn", mode },
      });
    }
    return {
      learning,
      story: {
        applied: false,
        duplicate: false,
        reason,
        stateVersion: null,
      },
    };
  }
}

/** 세션 연속성 조회 — tutors-pilot story state (읽기 전용) */
export async function getTutorStoryState(input: { uid: string }) {
  return getUserStoryState({
    uid: input.uid,
    universeId: TUTOR_PILOT.universeId,
    narrativeProfileId: TUTOR_PILOT.narrativeProfileId,
  });
}
