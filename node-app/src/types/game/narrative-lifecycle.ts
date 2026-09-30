/**
 * @docHint
 * @purpose Personal Canon 데이터 lifecycle·동의 계약
 * @process 수집 상태  cross-service memory 동의  파일럿 eligibility 표현
 * @domain narrative-privacy
 * @scope server
 */

export const NARRATIVE_PERSONAL_CANON_STATUS_VALUES = ["active", "opted_out", "deleted"] as const;
export type NarrativePersonalCanonStatus = (typeof NARRATIVE_PERSONAL_CANON_STATUS_VALUES)[number];

export const CROSS_SERVICE_MEMORY_CONSENT_VALUES = ["not_granted", "granted", "withdrawn"] as const;
export type CrossServiceMemoryConsent = (typeof CROSS_SERVICE_MEMORY_CONSENT_VALUES)[number];

export interface INarrativePrivacyPreferenceDoc {
  uid: string;
  personalCanonStatus: NarrativePersonalCanonStatus;
  crossServiceMemoryConsent: CrossServiceMemoryConsent;
  crossServiceConsentVersion?: string | null;
  consentVersion: string;
  consentedAt?: string | Date | null;
  withdrawnAt?: string | Date | null;
  history?: Array<{
    personalCanonStatus: NarrativePersonalCanonStatus;
    crossServiceMemoryConsent: CrossServiceMemoryConsent;
    crossServiceConsentVersion?: string | null;
    consentVersion: string;
    changedAt: string | Date;
  }>;
  updatedAt?: string | Date;
  createdAt?: string | Date;
}

export interface NarrativePilotEligibilityInput {
  narrativeRuntimeEnabled: boolean;
  pilotCohortEnabled: boolean;
  isMinor: boolean;
  accountStatus?: string | null;
  personalCanonStatus: NarrativePersonalCanonStatus;
}

export const NARRATIVE_LIFECYCLE_POLICY = {
  version: "narrative-lifecycle-v1",
  defaultStatus: "opted_out" as const,
  personalCanon: {
    purpose: "Play·Tutors의 사용자별 Story State, Story Beat, Narrative Event, 관계 투영 및 Cross-Universe 동의·Bridge 안전 기록",
    retention: "회원 탈퇴 또는 사용자의 삭제 요청 시까지; opt-out 후 신규 수집·투영 중지",
    deletionScope: [
      "narrative_privacy_preferences",
      "user_story_states",
      "story_arcs",
      "story_beats",
      "narrative_events",
      "character_relations",
      "personal_universes",
      "personal_universe_canon_revisions",
      "personal_universe_public_snapshots",
      "personal_universe_public_snapshot_reports",
      "tutor_play_projection_ledger",
      "tutor_play_projection_daily_usage",
      "cross_universe_share_preferences",
      "cross_universe_bridge_events",
      "cross_universe_user_blocks",
      "cross_universe_reports",
    ],
  },
  crossServiceMemory: {
    purpose: "동의한 경우에만 Play·Tutors 간 최소 서사 맥락 투영",
    default: "not_granted" as const,
    consentVersion: "tutor-play-projection-v1",
    minimumData: ["topicIds", "achievementKey", "timeSummary", "occurredDay", "relationChange", "serverDerivedXp"],
    excludedData: ["rawConversation", "evaluationDetail", "wrongAnswers", "clientProvidedXp", "playToTutorsSignals"],
    withdrawal: "철회 이후 신규 cross-service memory projection을 생성하지 않음",
  },
  crossUniverse: {
    default: "withdrawn" as const,
    consentVersion: "cross-universe-consent-v1",
    withdrawal: "철회 이후 신규 교차 등장·Bridge 요청을 생성하지 않으며, 계정 삭제는 기존 Bridge snapshot보다 우선한다",
    excludedData: ["characterDefinitionMutation", "originMutation", "death", "permanentState", "longTermJoining"],
  },
  minors: {
    pilotAllowed: false,
    rule: "G5 통과 전 미성년 계정은 narrative pilot cohort에 포함하지 않음",
  },
} as const;
