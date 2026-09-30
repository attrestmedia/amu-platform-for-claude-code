import {
  TUTOR_PLAY_PROJECTION_CONSENT_VERSION,
  TUTOR_PLAY_PROJECTION_SCHEMA_VERSION,
  type ServerTutorLearningEvaluation,
  type TutorPlayDerivedSignals,
  type TutorPlayProjectionBlockReason,
  type TutorPlayTimeSummary,
} from "types/game";

export const TUTOR_PLAY_PROJECTION_RUNTIME_POLICY = {
  enabledEnv: "TUTORS_PLAY_EXPERIENCE_PROJECTION_ENABLED",
  dailyCapEnv: "TUTORS_PLAY_DAILY_XP_CAP",
  xpScheduleEnv: "TUTORS_PLAY_XP_SCHEDULE_JSON",
  consentVersion: TUTOR_PLAY_PROJECTION_CONSENT_VERSION,
  defaultEnabled: false,
} as const;

export type TutorPlayProjectionRuntimeConfig = {
  enabled: boolean;
  dailyXpCap: number | null;
  xpSchedule: Record<string, number>;
};

export type TutorPlayProjectionDecision = {
  allowed: boolean;
  reason: TutorPlayProjectionBlockReason | "allowed";
  xp: number;
  dailyBucket: string | null;
  signals: TutorPlayDerivedSignals | null;
};

const FORBIDDEN_EVALUATION_KEYS = new Set([
  "rawConversation",
  "rawTranscript",
  "evaluationDetail",
  "wrongAnswers",
  "answerText",
  "prompt",
  "response",
  "messages",
  "clientXp",
  "clientScore",
]);

function id(value: unknown, max = 160) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max || !/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(normalized)) throw new Error("TUTOR_PLAY_INVALID_SIGNAL");
  return normalized;
}

function date(value: string | Date) {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error("TUTOR_PLAY_INVALID_SIGNAL");
  return result;
}

function timeSummary(seconds: number): TutorPlayTimeSummary {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 24 * 60 * 60) throw new Error("TUTOR_PLAY_INVALID_SIGNAL");
  if (seconds < 15 * 60) return "short";
  if (seconds < 45 * 60) return "standard";
  return "extended";
}

function inspectEvaluationShape(evaluation: ServerTutorLearningEvaluation) {
  for (const key of Object.keys(evaluation as unknown as Record<string, unknown>)) {
    if (FORBIDDEN_EVALUATION_KEYS.has(key)) throw new Error("TUTOR_PLAY_RAW_LEARNING_DATA_FORBIDDEN");
  }
}

function normalizeRelationChange(change: ServerTutorLearningEvaluation["relationChange"]) {
  if (!change || !Number.isFinite(Number(change.delta))) return undefined;
  return {
    targetCharacterId: id(change.targetCharacterId),
    relationType: id(change.relationType, 80),
    delta: Math.max(-10, Math.min(10, Math.trunc(Number(change.delta)))),
  };
}

export function resolveTutorPlayProjectionRuntimeConfig(env: Record<string, string | undefined> = process.env) {
  const rawCap = String(env[TUTOR_PLAY_PROJECTION_RUNTIME_POLICY.dailyCapEnv] || "").trim();
  const parsedCap = Number(rawCap);
  let xpSchedule: Record<string, number> = {};
  try {
    const parsed = JSON.parse(String(env[TUTOR_PLAY_PROJECTION_RUNTIME_POLICY.xpScheduleEnv] || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      xpSchedule = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => Number.isInteger(value) && Number(value) > 0).map(([key, value]) => [id(key, 80), Number(value)]),
      );
    }
  } catch {
    xpSchedule = {};
  }
  return {
    enabled: env[TUTOR_PLAY_PROJECTION_RUNTIME_POLICY.enabledEnv] === "true",
    dailyXpCap: Number.isInteger(parsedCap) && parsedCap > 0 ? parsedCap : null,
    xpSchedule,
  } satisfies TutorPlayProjectionRuntimeConfig;
}

/** 서버 평가 결과를 Play에 허용되는 최소 신호로 줄인다. XP는 입력값이 아니라 schedule에서 계산한다. */
export function deriveTutorPlayProjection(input: {
  evaluation: ServerTutorLearningEvaluation;
  xpSchedule: Record<string, number>;
}): TutorPlayProjectionDecision {
  const evaluation = input.evaluation;
  try {
    inspectEvaluationShape(evaluation);
    if (evaluation.serverDerived !== true) return { allowed: false, reason: "evaluation_not_server_derived", xp: 0, dailyBucket: null, signals: null };
    if (evaluation.passed !== true) return { allowed: false, reason: "evaluation_failed", xp: 0, dailyBucket: null, signals: null };
    const occurredAt = date(evaluation.occurredAt);
    const evaluationId = id(evaluation.evaluationId);
    const sessionId = id(evaluation.sessionId);
    const topicIds = [...new Set((evaluation.topicIds || []).map((topicId) => id(topicId, 80)))].slice(0, 12);
    const achievementKey = id(evaluation.achievementKey, 80);
    const xp = Number(input.xpSchedule[achievementKey]);
    if (!Number.isInteger(xp) || xp <= 0) return { allowed: false, reason: "xp_schedule_missing", xp: 0, dailyBucket: null, signals: null };
    const occurredDay = occurredAt.toISOString().slice(0, 10);
    const relationChange = evaluation.relationChange ? normalizeRelationChange(evaluation.relationChange) : undefined;
    if (evaluation.relationChange && !relationChange) return { allowed: false, reason: "invalid_projection_signal", xp: 0, dailyBucket: null, signals: null };
    const signals: TutorPlayDerivedSignals = {
      schemaVersion: TUTOR_PLAY_PROJECTION_SCHEMA_VERSION,
      source: "learning_evaluation",
      sourceEvaluationId: evaluationId,
      sourceSessionId: sessionId,
      topicIds,
      achievementKey,
      timeSummary: timeSummary(Number(evaluation.sessionDurationSeconds)),
      occurredDay,
      ...(relationChange ? { relationChange } : {}),
    };
    return { allowed: true, reason: "allowed", xp, dailyBucket: occurredDay, signals };
  } catch {
    return { allowed: false, reason: "invalid_projection_signal", xp: 0, dailyBucket: null, signals: null };
  }
}

export type { ServerTutorLearningEvaluation, TutorPlayDerivedSignals, TutorPlayProjectionBlockReason };
