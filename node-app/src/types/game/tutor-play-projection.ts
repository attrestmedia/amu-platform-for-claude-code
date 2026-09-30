/**
 * @docHint
 * @purpose Tutors 평가에서 Play로 전달할 수 있는 최소 파생 신호·XP 원장 계약
 * @process server-derived evaluation allowlist  raw learning data exclusion  consent  daily cap  idempotency
 * @domain tutors-play-projection
 * @scope server
 */

export const TUTOR_PLAY_PROJECTION_SCHEMA_VERSION = 1 as const;
export const TUTOR_PLAY_PROJECTION_CONSENT_VERSION = "tutor-play-projection-v1" as const;

export const TUTOR_PLAY_PROJECTION_LEDGER_STATUS_VALUES = [
  "reserved",
  "applied",
  "capped",
  "released",
  "failed",
] as const;
export type TutorPlayProjectionLedgerStatus = (typeof TUTOR_PLAY_PROJECTION_LEDGER_STATUS_VALUES)[number];

export const TUTOR_PLAY_TIME_SUMMARY_VALUES = ["short", "standard", "extended"] as const;
export type TutorPlayTimeSummary = (typeof TUTOR_PLAY_TIME_SUMMARY_VALUES)[number];

export type TutorPlayRelationChange = {
  targetCharacterId: string;
  relationType: string;
  delta: number;
};

/** 원문·평가 상세·오답·클라이언트 XP를 포함하지 않는 저장용 최소 신호. */
export type TutorPlayDerivedSignals = {
  schemaVersion: typeof TUTOR_PLAY_PROJECTION_SCHEMA_VERSION;
  source: "learning_evaluation";
  sourceEvaluationId: string;
  sourceSessionId: string;
  topicIds: string[];
  achievementKey: string;
  timeSummary: TutorPlayTimeSummary;
  occurredDay: string;
  relationChange?: TutorPlayRelationChange;
};

/** Tutors 서버 평가기가 projection adapter에 넘기는 내부 계약. client request body로 받지 않는다. */
export type ServerTutorLearningEvaluation = {
  serverDerived: true;
  evaluationId: string;
  sessionId: string;
  passed: boolean;
  topicIds: string[];
  achievementKey: string;
  sessionDurationSeconds: number;
  occurredAt: string | Date;
  relationChange?: TutorPlayRelationChange;
};

export interface ITutorPlayProjectionLedgerDoc {
  projectionId: string;
  uid: string;
  universeId: string;
  source: "learning_evaluation";
  sourceEvaluationId: string;
  sourceSessionId: string;
  idempotencyKey: string;
  dailyBucket: string;
  xp: number;
  dailyCap: number;
  status: TutorPlayProjectionLedgerStatus;
  consentVersion: string;
  signals: TutorPlayDerivedSignals;
  reservedAt?: string | Date | null;
  appliedAt?: string | Date | null;
  releasedAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ITutorPlayProjectionDailyUsageDoc {
  usageId: string;
  uid: string;
  dailyBucket: string;
  dailyCap: number;
  reservedXp: number;
  awardedXp: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type TutorPlayProjectionBlockReason =
  | "feature_disabled"
  | "consent_required"
  | "minor_or_account_ineligible"
  | "evaluation_not_server_derived"
  | "evaluation_failed"
  | "daily_cap_required"
  | "daily_cap_reached"
  | "daily_cap_mismatch"
  | "xp_schedule_missing"
  | "invalid_projection_signal"
  | "projection_write_failed";
