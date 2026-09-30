/**
 * @docHint
 * @purpose 모델별 reasoning effort 정책 기본값과 지원 여부 정의
 * @process 지원 모델 선언  허용값 목록 제공  저장값 정규화
 * @domain ai
 * @scope shared
 */

export const REASONING_EFFORT_LEVELS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffortLevelType = (typeof REASONING_EFFORT_LEVELS)[number];

type ReasoningEffortPolicy = {
  /** 허용값. 프로바이더가 일부만 지원하면 여기서 좁힌다. */
  levels: readonly ReasoningEffortLevelType[];
  /** 코드 정책 기본값. DB가 비어 있거나 조회에 실패하면 이 값을 쓴다. */
  policyDefault: ReasoningEffortLevelType;
};

/**
 * reasoning effort를 지원하는 모델만 선언한다. 여기 없는 모델은 어드민에서 값을 고를 수 없다.
 * 코드가 capability를 소유하고 DB는 허용된 값 안에서 고르기만 한다.
 *
 * GLM은 thinking을 끌 수 없고(disabled 지정 시 400) 강도만 고를 수 있다. 미지정은 사실상 max로
 * 동작해 단문 답변도 수십 초가 걸리므로 정책 기본값을 low로 둔다.
 * 허용값은 OpenAI 호환 reasoning_effort의 `low`·`high`·`max`다(medium은 지원하지 않음 — 400).
 *
 * 2026-09-01 확정: low. 이관 전 코드 상수는 커밋 이력에서 high였으나 low로 결론냈다.
 * **운영 조정은 코드가 아니라 시스템 컨트롤 화면에서 한다.** 여기 값은 DB가 비었을 때의 폴백이다.
 */
export const REASONING_EFFORT_POLICY: Record<string, ReasoningEffortPolicy> = {
  // GLM의 OpenAI-compatible 확장은 GPT-6와 지원 범위가 다르므로 기존 선택지를 유지한다.
  "zai:glm-5.3:text": { levels: ["low", "high", "max"], policyDefault: "low" },
  "zai:glm-5.3-flash:text": { levels: ["low", "high", "max"], policyDefault: "low" },
  // OpenAI GPT-6 공식 문서: Astra는 none을 지원하지 않고 Sol/Luna는 지원한다.
  "openai:gpt-6-astra:text": { levels: ["low", "medium", "high", "xhigh", "max"], policyDefault: "low" },
  "openai:gpt-6-sol:text": { levels: REASONING_EFFORT_LEVELS, policyDefault: "low" },
  "openai:gpt-6-luna:text": { levels: REASONING_EFFORT_LEVELS, policyDefault: "low" },
};

function policyKey(provider: string, modelName: string, modality: string) {
  return `${String(provider || "").trim().toLowerCase()}:${String(modelName || "").trim()}:${modality}`;
}

export function getReasoningEffortPolicy(provider: string, modelName: string, modality: string) {
  return REASONING_EFFORT_POLICY[policyKey(provider, modelName, modality)] || null;
}

export function supportsReasoningEffort(provider: string, modelName: string, modality: string) {
  return Boolean(getReasoningEffortPolicy(provider, modelName, modality));
}

export function getPolicyReasoningEffort(provider: string, modelName: string, modality: string) {
  return getReasoningEffortPolicy(provider, modelName, modality)?.policyDefault || "";
}

/** 모델이 선언한 허용값 목록. 미지원 모델은 빈 배열. 어드민 UI·검증이 전역 상수 대신 이 값을 쓴다. */
export function getReasoningEffortLevels(
  provider: string,
  modelName: string,
  modality: string,
): readonly ReasoningEffortLevelType[] {
  return getReasoningEffortPolicy(provider, modelName, modality)?.levels ?? [];
}

/** 저장값은 신뢰할 수 없는 입력으로 취급한다. 허용값이 아니면 정책 기본값으로 되돌린다. */
export function normalizeReasoningEffort(args: {
  provider: string;
  modelName: string;
  modality: string;
  value?: unknown;
}): ReasoningEffortLevelType | "" {
  const policy = getReasoningEffortPolicy(args.provider, args.modelName, args.modality);
  if (!policy) return "";
  const raw = typeof args.value === "string" ? args.value.trim().toLowerCase() : "";
  return (policy.levels as readonly string[]).includes(raw)
    ? (raw as ReasoningEffortLevelType)
    : policy.policyDefault;
}
