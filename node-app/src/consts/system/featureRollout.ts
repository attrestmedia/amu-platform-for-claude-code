/**
 * @docHint
 * @purpose 중앙 기능별 Admin-First 롤아웃 선언과 단계 검증
 * @process 선언 상수 제공  기능 키·롤아웃 단계 검증
 * @domain system
 * @scope server-policy
 */

export const FEATURE_ROLLOUT_STAGES = ["admin_only", "verified_cohort", "public"] as const;
export type FeatureRolloutStage = (typeof FEATURE_ROLLOUT_STAGES)[number];

/** `<domain>.<name>` — 소문자·숫자·하이픈으로 된 두 조각 이상. */
export const FEATURE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

export const FEATURE_ROLLOUT_POLICY_REF = "compliance-guardrails §3-2" as const;

export type FeatureRolloutDeclaration = {
  stage: FeatureRolloutStage;
  /** 공개 전에 통과해야 할 원장 게이트 ID 목록. */
  publicLaunchGates: readonly string[];
  policyRef: typeof FEATURE_ROLLOUT_POLICY_REF;
  /** 이 기능을 소유하는 로드맵 원장 행. */
  ledgerRef: string;
  /** admin_only 이후 단계에 필요한 공개 승인 근거. */
  launchApprovalRef?: string;
};

/** AFR-102 발음 평가 rollout key. */
export const VOICE_FEATURE_KEYS = {
  pronunciationAssessment: "speech.pronunciation-assessment",
} as const;

/** PTU-011 성인 확인 step-up key. admin mock 라우트와 verifier가 같은 상수를 사용한다. */
export const AGE_ASSURANCE_FEATURE_KEYS = {
  stepUp: "identity.age-step-up",
} as const;

/** PTU-002 Interactive Story runtime; Home and Play use the same server gate. */
export const STORY_FEATURE_KEYS = {
  runtime: "story.runtime",
} as const;

/** PTU-002 discovery route; server access remains admin-only during development. */
export const PLAY_FEATURE_KEYS = {
  narrativeDiscovery: "play.narrative-discovery",
  characterChatVoice: "play.character-chat-voice",
} as const;

/** ASC-03 uploaded image source for character creation. */
export const CHARACTER_FEATURE_KEYS = {
  uploadSource: "play.character-upload-source",
} as const;

/** PTU-002 Director provider dispatch; server-side Admin Only gate. */
export const NARRATIVE_FEATURE_KEYS = {
  directorChat: "narrative.director-chat",
} as const;

const AFR_102_LEDGER_REF = "todo-admin-first-rollout.json#AFR-102";
const PTU_011_LEDGER_REF = "todo-amu-play-tutors-unification.json#PTU-011";
const PTU_002_LEDGER_REF = "todo-amu-play-tutors-unification.json#PTU-002";
const TGI_110_LEDGER_REF = "todo-for-tutors-improvement.json#TGI-110";
const ASC_03_LEDGER_REF = "todo-assets-studio-character-creation.json#ASC-03";

/** 기능 선언은 명시 승인 후 추가한다. 단계 변경은 코드 리뷰를 거친다(AFR-G-ROLLOUT-STATE-OWNER). */
export const FEATURE_ROLLOUT_DECLARATIONS: Readonly<Record<string, FeatureRolloutDeclaration>> = Object.freeze({
  [VOICE_FEATURE_KEYS.pronunciationAssessment]: Object.freeze({
    stage: "admin_only",
    publicLaunchGates: Object.freeze(["VOICE-001"]),
    policyRef: FEATURE_ROLLOUT_POLICY_REF,
    ledgerRef: AFR_102_LEDGER_REF,
  }),
  [AGE_ASSURANCE_FEATURE_KEYS.stepUp]: Object.freeze({
    stage: "admin_only",
    publicLaunchGates: Object.freeze([
      "PTU-G-AGE-ASSURANCE-SCOPE",
      "PTU-G-AGE-ASSURANCE-CONTRACT",
      "PTU-G-AGE-ASSURANCE-POLICY-PARITY",
      "PTU-G-AGE-ASSURANCE-LAUNCH",
      "PTU-G-PILOT-LEGAL-EVIDENCE",
    ]),
    policyRef: FEATURE_ROLLOUT_POLICY_REF,
    ledgerRef: PTU_011_LEDGER_REF,
  }),
  [STORY_FEATURE_KEYS.runtime]: Object.freeze({
    stage: "admin_only",
    publicLaunchGates: Object.freeze(["PTU-G-PILOT-LEGAL-EVIDENCE", "PTU-G-PLAY-FOUNDATION"]),
    policyRef: FEATURE_ROLLOUT_POLICY_REF,
    ledgerRef: PTU_002_LEDGER_REF,
  }),
  [PLAY_FEATURE_KEYS.narrativeDiscovery]: Object.freeze({
    stage: "admin_only",
    publicLaunchGates: Object.freeze(["PTU-G-PILOT-LEGAL-EVIDENCE", "PTU-G-PLAY-FOUNDATION"]),
    policyRef: FEATURE_ROLLOUT_POLICY_REF,
    ledgerRef: PTU_002_LEDGER_REF,
  }),
  [PLAY_FEATURE_KEYS.characterChatVoice]: Object.freeze({
    stage: "admin_only",
    publicLaunchGates: Object.freeze(["TGI-GATE-VOICE-DEFAULT"]),
    policyRef: FEATURE_ROLLOUT_POLICY_REF,
    ledgerRef: TGI_110_LEDGER_REF,
  }),
  [CHARACTER_FEATURE_KEYS.uploadSource]: Object.freeze({
    stage: "admin_only",
    publicLaunchGates: Object.freeze(["G-ASC-PRIVACY"]),
    policyRef: FEATURE_ROLLOUT_POLICY_REF,
    ledgerRef: ASC_03_LEDGER_REF,
  }),
  [NARRATIVE_FEATURE_KEYS.directorChat]: Object.freeze({
    stage: "admin_only",
    publicLaunchGates: Object.freeze(["PTU-G-PILOT-LEGAL-EVIDENCE", "PTU-G-PLAY-FOUNDATION"]),
    policyRef: FEATURE_ROLLOUT_POLICY_REF,
    ledgerRef: PTU_002_LEDGER_REF,
  }),
});

export function isFeatureRolloutStage(value: unknown): value is FeatureRolloutStage {
  return typeof value === "string" && (FEATURE_ROLLOUT_STAGES as readonly string[]).includes(value);
}

export function isFeatureKey(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && FEATURE_KEY_PATTERN.test(value);
}
