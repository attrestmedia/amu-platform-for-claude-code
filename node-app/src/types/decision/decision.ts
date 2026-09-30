/**
 * @docHint
 * @purpose JEV Decision Fabric 공용 타입 — 판단 전용이며 생성 모델 타입과 교환되지 않는다(INV-4)
 * @domain decision
 * @scope shared
 */
import type { ServiceKey } from "consts/system/serviceAvailability";

export const DECISION_PRIMITIVES = ["choice", "score", "noul"] as const;
export type DecisionPrimitive = (typeof DECISION_PRIMITIVES)[number];

export const DECISION_EFFECT_CLASSES = ["observe", "rank", "draft", "execute"] as const;
export type DecisionEffectClass = (typeof DECISION_EFFECT_CLASSES)[number];

export const SYSTEM2_ESCALATION_LEVELS = ["none", "standard_path", "cheap_llm", "strong_llm", "human_review"] as const;
export type System2EscalationLevel = (typeof SYSTEM2_ESCALATION_LEVELS)[number];

/** `<service>.<name>.v<N>` — 소문자·숫자·하이픈. */
export type DecisionPointId = `${string}.${string}.v${number}`;
export type DecisionService = ServiceKey | "platform";

export type DecisionQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Readonly<Record<string, string | null>> }
  | { type: "score"; instructions: string; criteria: readonly string[] };

export type DecisionStateValue = string | number | boolean | null;
export type DecisionState = Readonly<Record<string, DecisionStateValue>>;

export type DecisionPoint = {
  id: DecisionPointId;
  service: DecisionService;
  primitive: DecisionPrimitive;
  effectClass: DecisionEffectClass;
  questionSetVersion: string;
  stateSchemaVersion: string;
  /** 원자적 단일 판단. questions map 의 key 는 id 를 쓴다. */
  question: DecisionQuestion;
  /** 전송 가능한 state key 목록(allowlist projection). 이 밖의 key 는 버린다. */
  stateAllowlist: readonly string[];
  stateLimits: { maxBytes: number; maxAgeMs: number; maxStringLength: number };
  /** runtime controls 에 값이 없을 때 쓰는 코드 기본 threshold(0~1). */
  defaultThreshold: number;
  smartMode: { supported: boolean; defaultEnabled: false; fallbackToStandard: true };
  /** 실패·불확실 시 귀결. 이 두 값 외에는 없다. */
  fallback: "standard" | "human_review";
};

export type DecisionNoulAnswer = { type: "noul"; noul: number };
export type DecisionChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Readonly<Record<string, number>>;
  confidence: number;
};
export type DecisionScoreAnswer = {
  type: "score";
  score: number;
  legend: Readonly<Record<string, string>>;
  probabilities: Readonly<Record<string, number>>;
  confidence: number;
};
export type DecisionAnswer = DecisionNoulAnswer | DecisionChoiceAnswer | DecisionScoreAnswer;

export const DECISION_REASON_CODES = [
  "decided",
  "unknown_point",
  "controls_unreadable",
  "kill_switch",
  "provider_disabled",
  "service_disabled",
  "point_disabled",
  "user_opt_out",
  "credential_unavailable",
  "circuit_open",
  "rollout_miss",
  "cogs_cap_zero",
  "state_rejected",
  "rate_limited",
  "overloaded",
  "timeout",
  "provider_error",
  "invalid_answer",
  "below_threshold",
  "effect_requires_human",
] as const;
export type DecisionReasonCode = (typeof DECISION_REASON_CODES)[number];

export type DecisionTraceRef = {
  traceId: string;
  stateDigest: string;
  questionSetVersion: string;
  returnedModel: string | null;
};

export type DecisionVerdict = {
  decisionPointId: string;
  /** decided 만 모델 결과를 반영한다. 나머지는 호출 서비스가 기존 경로로 처리한다. */
  outcome: "decided" | "standard" | "human_review";
  value: string | number | boolean | null;
  escalation: System2EscalationLevel;
  reasonCode: DecisionReasonCode;
  traceRef: DecisionTraceRef | null;
};
