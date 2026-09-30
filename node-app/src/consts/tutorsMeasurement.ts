/**
 * @docHint
 * @purpose TUTORS-200-D3 비민감 측정 이벤트·중복 제거·기준선 계약
 * @process 기존 이벤트 재사용  신규 이벤트 2종 allowlist  GA4 금지 파라미터 차단  서버 원장 키 고정
 * @domain tutors-measurement
 * @scope analytics-contract
 *
 * 이 파일은 이벤트를 발화하지 않는다. TUTORS-220에서 실제 학습 항목과 발화 배선을 연결한다.
 */

export const TUTORS_REUSED_MEASUREMENT_EVENTS = [
  "tutors_entry",
  "related_article_click",
  "magazine_return",
] as const;

/** TUTORS-200에서 추가하는 GA4 이벤트는 이 두 종류로 제한한다. */
export const TUTORS_NEW_MEASUREMENT_EVENTS = [
  "tutors_learning_action",
  "tutors_session_complete",
] as const;

export const TUTORS_MEASUREMENT_EVENT_NAMES = [
  ...TUTORS_REUSED_MEASUREMENT_EVENTS,
  ...TUTORS_NEW_MEASUREMENT_EVENTS,
] as const;

export type TutorsMeasurementEventName = (typeof TUTORS_MEASUREMENT_EVENT_NAMES)[number];
export type TutorsNewMeasurementEventName = (typeof TUTORS_NEW_MEASUREMENT_EVENTS)[number];

export const TUTORS_LEARNING_ACTION_TYPES = ["question", "save", "practice", "review"] as const;
export type TutorsLearningActionType = (typeof TUTORS_LEARNING_ACTION_TYPES)[number];

/** GA4에는 원문·대화문·음성 원본·PII를 보내지 않는다. */
export const TUTORS_MEASUREMENT_FORBIDDEN_PARAMS = [
  "raw_text",
  "text",
  "conversation",
  "transcript",
  "voice_url",
  "audio_url",
  "free_input",
  "email",
  "name",
  "phone",
  "user_id",
  "uid",
  "client_id",
] as const;

/** 서버 원장 detail에 허용할 수 있는 비민감 bucket·분류 키. 원문은 이 목록에 넣지 않는다. */
export const TUTORS_MEASUREMENT_SAFE_DETAIL_KEYS = [
  "actionType",
  "opaqueId",
  "lengthBucket",
  "timeBucket",
] as const;

type TutorsMeasurementEventContract = {
  requiredParams: readonly string[];
  requiredParamSets?: readonly (readonly string[])[];
  optionalParams: readonly string[];
  forbiddenParams: readonly string[];
  dedupeKey: string;
  measurementStatus: "reconstructable_from_existing_data" | "not_measurable_before_instrumentation";
};

const forbiddenParams = TUTORS_MEASUREMENT_FORBIDDEN_PARAMS;

/**
 * 필수 파라미터와 서버 원장 dedupe key를 함께 고정한 계약이다.
 * `opaque_id`는 이용자 식별자가 아닌 서버가 만든 비가역 이벤트/콘텐츠 식별자다.
 */
export const TUTORS_MEASUREMENT_EVENT_CONTRACT = {
  tutors_entry: {
    // WP 표면은 post 쌍, App 표면은 content 쌍 중 하나를 만족한다.
    requiredParams: ["entry_type", "integration_mode"],
    requiredParamSets: [["post_id", "post_slug"], ["content_id", "content_slug"]],
    optionalParams: ["source_post_id", "experience_level"],
    forbiddenParams,
    dedupeKey: "server_entry_id",
    measurementStatus: "reconstructable_from_existing_data",
  },
  related_article_click: {
    requiredParams: ["from_post_id", "to_post_id"],
    optionalParams: [],
    forbiddenParams,
    dedupeKey: "server_related_article_click_id",
    measurementStatus: "reconstructable_from_existing_data",
  },
  magazine_return: {
    requiredParams: ["from_service", "return_type"],
    optionalParams: ["session_gap_min", "origin_post_id"],
    forbiddenParams,
    dedupeKey: "server_magazine_return_id",
    measurementStatus: "reconstructable_from_existing_data",
  },
  tutors_learning_action: {
    requiredParams: ["action_type", "opaque_id"],
    optionalParams: ["length_bucket", "time_bucket"],
    forbiddenParams,
    dedupeKey: "server_learning_action_id",
    measurementStatus: "not_measurable_before_instrumentation",
  },
  tutors_session_complete: {
    requiredParams: ["opaque_id", "time_bucket"],
    optionalParams: ["length_bucket"],
    forbiddenParams,
    dedupeKey: "server_session_completion_id",
    measurementStatus: "not_measurable_before_instrumentation",
  },
} as const satisfies Record<TutorsMeasurementEventName, TutorsMeasurementEventContract>;

/** 질문·반복은 신규 학습 이벤트 전에는 소급하지 않고, Magazine return은 기존 이벤트로 재구성한다. */
export const TUTORS_MEASUREMENT_RECONSTRUCTABILITY = {
  question: "not_measurable_before_instrumentation",
  repeat: "not_measurable_before_instrumentation",
  magazineReturn: "reconstructable_from_existing_data",
} as const;

/**
 * 실험 수치는 MEASUREMENT-PLAN.md에 아직 Tutor 신규 이벤트 기준으로 등록돼 있지 않다.
 * 계측 배포 전 과거 28일 값을 baseline으로 추정하지 않으며, rollout 전 숫자 등록이 선행돼야 한다.
 */
export const TUTORS_MEASUREMENT_BASELINE = {
  status: "pending_prospective_registration",
  source: ".agent/amu-platform-guide/MEASUREMENT-PLAN.md",
  prospective: true,
  primaryMetric: null,
  mde: null,
  minimumSampleSize: null,
  observationWindowDays: null,
  guardrailNonInferiorityLimit: null,
  note: "계측 배포 후 사전 등록할 값이며 현재 수치를 창작하거나 과거 28일로 추정하지 않는다.",
} as const;
