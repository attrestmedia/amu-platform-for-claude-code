/**
 * @docHint
 * @purpose G-MCG-01 정책 기본 불변식 — defaultModel ∧ ¬selectable 조합 탐지(순수 로직)
 * @process 불변식 위반 판정  reason code 산출
 * @domain ai
 * @scope shared
 */

export const DEFAULT_INVARIANT_REASON_CODES = [
  "default_model_internal",
  "default_model_admin_only",
  "default_model_deprecated",
] as const;
export type DefaultInvariantReasonCodeType = (typeof DEFAULT_INVARIANT_REASON_CODES)[number];

export type DefaultInvariantViolationType = {
  type: "default_unselectable";
  reasonCode: DefaultInvariantReasonCodeType;
};

function defaultInvariantReasonCode(args: {
  enabled: boolean;
  adminOnly: boolean;
  deprecated: boolean;
}): DefaultInvariantReasonCodeType {
  if (!args.enabled) return "default_model_internal";
  if (args.adminOnly) return "default_model_admin_only";
  return "default_model_deprecated";
}

/**
 * G-MCG-01: 기본으로 지정된 항목(활성 defaultModel 또는 코드 정책 policyDefaultModel)은
 * 반드시 런타임 선택 가능해야 한다(public ∧ active). 위반 시 조용한 폴백 대신 명시적으로 표기한다.
 * - video는 catalog-only(실행 job 미구현)라 검사 대상에서 제외한다.
 * - audio(speech)는 사용자가 modality 단위로 고르는 대상이 아니라 서버가 역할별로 정한다.
 *   기본값 판정은 computeSpeechRoleDefaultInvariant(consts/ai/speechModel.ts)가 별도로 수행한다.
 * - 기본 지정이 없는 항목은 검사 대상이 아니다.
 */
export function computeDefaultInvariant(args: {
  modality: string;
  enabled: boolean;
  adminOnly: boolean;
  deprecated: boolean;
  defaultModel: boolean;
  policyDefaultModel: boolean;
}): DefaultInvariantViolationType | undefined {
  if (args.modality === "video") return undefined;
  if (args.modality === "audio") return undefined;
  if (!args.defaultModel && !args.policyDefaultModel) return undefined;
  if (args.enabled && !args.adminOnly && !args.deprecated) return undefined;
  return { type: "default_unselectable", reasonCode: defaultInvariantReasonCode(args) };
}
