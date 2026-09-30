import "server-only";

/**
 * @docHint
 * @purpose Tutors Narrative Session 계약 — narrativeMode·session 상태·goal 분리 (OOC-060)
 * @process mode 결정(fail-closed off)  세션 상태 전이 검증  learning goal 우선 분리  story context 게이트
 * @domain tutors-narrative
 * @scope server
 */

export const TUTOR_NARRATIVE_MODES = ["off", "guided", "immersive"] as const;
export type TutorNarrativeMode = (typeof TUTOR_NARRATIVE_MODES)[number];

export const TUTOR_SESSION_STATES = ["active", "exited", "resumed", "completed"] as const;
export type TutorSessionState = (typeof TUTOR_SESSION_STATES)[number];

/** 세션 상태 전이 허용표 — off로 전환해도 세션은 유지되며 학습 상태는 보존된다. */
const SESSION_TRANSITIONS: Record<TutorSessionState, TutorSessionState[]> = {
  active: ["exited", "completed"],
  exited: ["resumed", "completed"],
  resumed: ["exited", "completed"],
  completed: [],
};

export function canTransitionSessionState(from: TutorSessionState, to: TutorSessionState): boolean {
  return (SESSION_TRANSITIONS[from] || []).includes(to);
}

/**
 * narrativeMode 결정 — 기본값은 항상 off(fail-closed).
 * 명시적으로 guided/immersive를 요청한 경우에만 승격되며, 알 수 없는 값은 off로 강등한다.
 */
export function resolveNarrativeMode(input: {
  requestedMode?: unknown;
  storedMode?: unknown;
}): TutorNarrativeMode {
  const candidates = [input.requestedMode, input.storedMode];
  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim().toLowerCase();
    if (normalized === "guided" || normalized === "immersive") return normalized;
    if (normalized === "off") return "off";
  }
  return "off";
}

export type TutorGoalSeparation<TLearning, TStory> = {
  /** 학습 목표 — 항상 우선이며 story 실패·비활성과 무관하게 유지된다 */
  learning: { blueprint: TLearning | null; independentOfStory: true };
  /** 서사 목표 — narrativeMode가 off면 보조 목표로 강등되고 story 진행만 중단된다 */
  story: { blueprint: TStory | null; active: boolean };
};

/**
 * story goal과 learning goal을 분리한다. learning goal은 story와 독립적으로 유지되고,
 * narrativeMode가 off여도 learning blueprint는 그대로 남는다 (기존 Tutors 기능 유지).
 */
export function separateTutorGoals<TLearning, TStory>(input: {
  learningBlueprint: TLearning | null;
  storyBlueprint: TStory | null;
  mode: TutorNarrativeMode;
}): TutorGoalSeparation<TLearning, TStory> {
  return {
    learning: { blueprint: input.learningBlueprint, independentOfStory: true },
    story: { blueprint: input.storyBlueprint, active: input.mode !== "off" },
  };
}

export type TutorStoryProjectionInput = {
  mode: TutorNarrativeMode;
  sessionState: TutorSessionState;
  storyContext: string;
};

/**
 * narrativeMode에 따른 story context 게이트.
 * off → 기존 Tutors 동작 그대로(story context 미포함), guided/immersive → context 포함.
 * story context 생성 실패·공백은 학습에 영향을 주지 않는다 (자유 학습 fallback).
 */
export function projectTutorStoryContext(input: TutorStoryProjectionInput): {
  includeStoryContext: boolean;
  context: string;
  reason: string;
} {
  if (input.mode === "off") return { includeStoryContext: false, context: "", reason: "mode_off" };
  if (input.sessionState === "completed") {
    return { includeStoryContext: false, context: "", reason: "session_completed" };
  }
  const context = String(input.storyContext || "").trim();
  if (!context) return { includeStoryContext: false, context: "", reason: "story_context_empty" };
  return { includeStoryContext: true, context, reason: "projected" };
}
