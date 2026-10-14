/**
 * @docHint
 * @purpose EL-202 speech(audio) 모델 역할·capability·readiness·과금 단위 코드 정책 SSOT
 * @process 역할/capability 선언  모델 정책 조회  역할 기본값 불변식 판정
 * @domain ai
 * @scope shared
 */

import type { ModelLaunchStateType } from "./launchState";
import { AI_PROVIDER_TYPES } from "./modelRole";
import {
  AI_DEFAULT_SPEECH_MODEL_BY_PROVIDER_ROLE,
  AI_SPEECH_MODEL_CATALOG,
} from "./generated/modelCatalog.generated";
import type { AssertAssignable } from "./catalogShapeAssertion";


/**
 * ADR-EL-001 D1 — ElevenLabs는 Voice I/O provider이지 대화 엔진이 아니다.
 * speech 전용 provider는 AI_PROVIDER_TYPES(텍스트/이미지 후보 목록)에 넣지 않는다.
 * 넣는 순간 텍스트 채팅·이미지 셀렉터에 새 provider가 새어 나간다.
 */
export const SPEECH_ONLY_PROVIDER_TYPES = ["elevenlabs"] as const;
export type SpeechOnlyProviderType = (typeof SPEECH_ONLY_PROVIDER_TYPES)[number];

/**
 * EL-203 — 과금 원장이 받아들이는 provider 집합.
 * AI_PROVIDER_TYPES(텍스트/이미지 후보)와 **별개 축**이다. 과금 경로만 이 union을 쓰고
 * 채팅/이미지 셀렉터는 AI_PROVIDER_TYPES를 그대로 쓴다.
 */
export const BILLABLE_PROVIDER_TYPES = [...AI_PROVIDER_TYPES, ...SPEECH_ONLY_PROVIDER_TYPES, "qwen"] as const;

/** audio modality 카탈로그에 등장할 수 있는 provider 전체 */
export const SPEECH_CATALOG_PROVIDER_TYPES = ["openai", "qwen", ...SPEECH_ONLY_PROVIDER_TYPES] as const;
export type SpeechCatalogProviderType = (typeof SPEECH_CATALOG_PROVIDER_TYPES)[number];

/**
 * speech_analysis는 speech_stt/speech_tts와 별개 역할이다(ADR-EL-001 D1).
 * 현행 원음 분석은 OpenAI gpt-audio 경로이며 이 역할을 ElevenLabs에 부여하지 않는다.
 */
export const SPEECH_MODEL_ROLE_TYPES = ["speech_stt", "speech_tts", "speech_analysis"] as const;
export type SpeechModelRoleType = (typeof SPEECH_MODEL_ROLE_TYPES)[number];

export const SPEECH_CAPABILITY_TYPES = [
  "stt_file",
  "stt_realtime",
  "tts_http",
  "tts_websocket",
  "dialogue_websocket",
] as const;
export type SpeechCapabilityType = (typeof SPEECH_CAPABILITY_TYPES)[number];

/**
 * ADR-EL-001 D7 — readiness는 관측 증거이지 활성 상태가 아니다.
 * launchState를 대체하지 않고 launchState 판정의 입력으로만 쓴다.
 */
export const SPEECH_READINESS_STATES = [
  "observed",
  "policy_approved",
  "runtime_verified",
  "public_eligible",
] as const;
export type SpeechReadinessStateType = (typeof SPEECH_READINESS_STATES)[number];

/** ADR-EL-001 D5 — quantity는 언제나 unit과 함께 기록한다. 차원이 다른 환산은 금지한다. */
export const SPEECH_BILLING_UNIT_TYPES = ["character", "audio_second", "generated_second", "credit"] as const;
export type SpeechBillingUnitType = (typeof SPEECH_BILLING_UNIT_TYPES)[number];

export type SpeechModelPolicy = {
  provider: SpeechCatalogProviderType;
  modelName: string;
  roles: readonly SpeechModelRoleType[];
  capabilities: readonly SpeechCapabilityType[];
  readiness: SpeechReadinessStateType;
  /** null이면 단가 단위가 확정되지 않았다는 뜻이다. 0이나 임의 단위로 대체하지 않는다. */
  billingUnit: SpeechBillingUnitType | null;
  billingUnitUnknownReason?: string;
  /** 문서상 표기 후보. API 실측 전에는 upstream 실모델 ID로 승격하지 않는다(EL-101과 동일 계약). */
  documentedModelId?: string;
  upstreamCertainty: "verified" | "unverified";
  /** 실호출 검증(EL-401) 전에는 어떤 항목도 서비스 라우팅 후보가 아니다. */
  routable: boolean;
  launchState: ModelLaunchStateType;
  note?: string;
};

/**
 * audio modality 코드 정책 카탈로그.
 *
 * - openai 항목은 현재 운영에서 실제로 호출되는 모델이므로 `admin_only`(enabled=true)다.
 *   speech 모델은 사용자가 고르는 대상이 아니라 서버가 정하므로 public으로 열지 않는다.
 * - elevenlabs 항목은 계정·자격증명·실호출 검증이 전부 미완이라 `internal`(enabled=false)이다.
 *   EL-201(자격증명)과 G-EL-PAID-SMOKE 통과 전에는 이 상태를 올리지 않는다.
 */
export type SpeechModelCanonicalShape = [
  AssertAssignable<typeof AI_SPEECH_MODEL_CATALOG, readonly SpeechModelPolicy[]>,
  AssertAssignable<typeof AI_DEFAULT_SPEECH_MODEL_BY_PROVIDER_ROLE, Record<string, string>>,
];

function speechModelKey(provider: string, modelName: string) {
  return `${String(provider || "").trim().toLowerCase()}:${String(modelName || "").trim()}`;
}

const SPEECH_MODEL_POLICY_BY_KEY: Record<string, SpeechModelPolicy> = Object.fromEntries(
  AI_SPEECH_MODEL_CATALOG.map((item) => [speechModelKey(item.provider, item.modelName), item as SpeechModelPolicy]),
);

export function getSpeechModelPolicy(provider: string, modelName: string): SpeechModelPolicy | undefined {
  return SPEECH_MODEL_POLICY_BY_KEY[speechModelKey(provider, modelName)];
}

/**
 * audio modality의 출시 상태 조회. **미등록 모델은 fail-closed로 internal**이다.
 * 코드 정책에 없는 audio 모델이 기본 public으로 열리는 사고를 막는다.
 */
export function getSpeechModelLaunchState(provider: string, modelName: string): ModelLaunchStateType {
  return getSpeechModelPolicy(provider, modelName)?.launchState ?? "internal";
}

export function isSpeechOnlyProvider(provider: string): boolean {
  return (SPEECH_ONLY_PROVIDER_TYPES as readonly string[]).includes(
    String(provider || "").trim().toLowerCase(),
  );
}

export function listSpeechModelPolicies(): readonly SpeechModelPolicy[] {
  return AI_SPEECH_MODEL_CATALOG as readonly SpeechModelPolicy[];
}

export function hasSpeechModelRole(provider: string, modelName: string, role: SpeechModelRoleType): boolean {
  const policy = getSpeechModelPolicy(provider, modelName);
  return Boolean(policy?.roles.includes(role));
}

/**
 * 역할별 기본 모델. modality scope 기본값(computeDefaultInvariant)과 **별도 축**이다.
 * speech 모델은 사용자가 고르지 않으므로 adminOnly여도 역할 기본값이 될 수 있다.
 */
export function getDefaultSpeechModelName(provider: string, role: SpeechModelRoleType): string {
  const key = `${String(provider || "").trim().toLowerCase()}:${role}`;
  return (AI_DEFAULT_SPEECH_MODEL_BY_PROVIDER_ROLE as Record<string, string>)[key] || "";
}

export const SPEECH_ROLE_DEFAULT_INVARIANT_REASON_CODES = [
  "role_default_not_registered",
  "role_default_role_missing",
  "role_default_disabled",
  "role_default_deprecated",
  "role_default_not_routable",
] as const;
export type SpeechRoleDefaultInvariantReasonCodeType =
  (typeof SPEECH_ROLE_DEFAULT_INVARIANT_REASON_CODES)[number];

export type SpeechRoleDefaultInvariantViolationType = {
  type: "speech_role_default_unusable";
  reasonCode: SpeechRoleDefaultInvariantReasonCodeType;
};

/**
 * EL-202 역할 기본값 불변식.
 * 역할 기본으로 지정된 speech 모델은 카탈로그에 등록돼 있고, 그 역할을 실제로 가지며,
 * 비활성/deprecated/미검증(routable=false)이 아니어야 한다.
 * 위반 시 조용한 폴백 대신 명시적으로 표기한다.
 */
export function computeSpeechRoleDefaultInvariant(args: {
  provider: string;
  modelName: string;
  role: SpeechModelRoleType;
  enabled: boolean;
  deprecated: boolean;
}): SpeechRoleDefaultInvariantViolationType | undefined {
  const policy = getSpeechModelPolicy(args.provider, args.modelName);
  if (!policy) return { type: "speech_role_default_unusable", reasonCode: "role_default_not_registered" };
  if (!policy.roles.includes(args.role)) {
    return { type: "speech_role_default_unusable", reasonCode: "role_default_role_missing" };
  }
  if (args.deprecated) return { type: "speech_role_default_unusable", reasonCode: "role_default_deprecated" };
  if (!args.enabled) return { type: "speech_role_default_unusable", reasonCode: "role_default_disabled" };
  if (!policy.routable) {
    return { type: "speech_role_default_unusable", reasonCode: "role_default_not_routable" };
  }
  return undefined;
}
