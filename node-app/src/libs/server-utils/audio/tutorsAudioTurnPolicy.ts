/**
 * @docHint
 * @purpose TUTORS-193 audio 턴(선택된 Tutor 모델에 원음을 전달하는 대화 턴) 서버 허용 판정
 * @process inputModality 정규화  게이트/모델 판정(fail-closed)  outcome 반환
 * @domain chat
 * @scope server
 */

/**
 * 이 모듈은 provider, 저장소, 과금, 사용자 문서에 의존하지 않는 순수 판정만 담당한다.
 * `tutorsSttSafety.ts`와 같은 사상이다 — outcome 열거 + 단일 순수 함수.
 *
 * TUTORS-GATE-VOICE-MODEL이 blocked인 동안 audio 턴은 어떤 경로로도 열리지 않아야 한다.
 * 판정은 두 겹으로 닫혀 있다: (1) 런타임 게이트(`gateOpen`), (2) 카탈로그에 audio-capable 모델이
 * 실제로 존재하는지. 게이트만 열려도 적격 모델이 0개면 여전히 닫힌다 — 지금은 항상 그렇다
 * (TEXT_MODEL_CAPABILITIES의 supportsAudioUnderstanding이 전부 false이기 때문).
 */
export const TUTORS_AUDIO_TURN_OUTCOMES = [
  "allowed",
  "gate_closed",
  "modality_invalid",
  "model_not_selectable",
  "model_not_audio_capable",
] as const;
export type TutorsAudioTurnOutcome = (typeof TUTORS_AUDIO_TURN_OUTCOMES)[number];

export type TutorsAudioTurnPolicy = { gateOpen: boolean };

export type TutorsAudioTurnRequest = {
  /** 클라이언트 값. 신뢰하지 않고 서버가 normalizeChatInputModality로 정규화한다. */
  inputModality?: unknown;
  selectedModel?: { provider?: unknown; modelName?: unknown } | null;
  /** 서버가 카탈로그에서 계산한 적격 키 목록(`${provider}:${modelName}`). */
  audioCapableModelKeys?: readonly string[];
};

export type TutorsAudioTurnDecision =
  | { allowed: true; outcome: "allowed" }
  | { allowed: false; outcome: Exclude<TutorsAudioTurnOutcome, "allowed"> };

/** 기본값은 항상 닫힘이다. TUTORS-GATE-VOICE-MODEL 통과 전까지 이 값을 열지 않는다. */
export function getDefaultTutorsAudioTurnPolicy(): TutorsAudioTurnPolicy {
  return { gateOpen: false };
}

/**
 * 저장값을 신뢰하지 않는다. `null`/`undefined`/형식 불명은 전부 닫힘(fail-closed)이다.
 * 저장값이 `{ enabled: true }` 형태일 때만 게이트를 연다 — 그래도 evaluateTutorsAudioTurn의
 * 4단계(적격 모델 존재)를 통과해야 실제로 열린다(이중 잠금).
 */
export function resolveTutorsAudioTurnPolicy(controls: unknown): TutorsAudioTurnPolicy {
  if (!controls || typeof controls !== "object" || Array.isArray(controls)) return getDefaultTutorsAudioTurnPolicy();
  try {
    // 상속 프로퍼티·Proxy 예외는 저장된 설정의 유효한 enabled 값으로 취급하지 않는다.
    if (!Object.prototype.hasOwnProperty.call(controls, "enabled")) return getDefaultTutorsAudioTurnPolicy();
    return { gateOpen: (controls as { enabled?: unknown }).enabled === true };
  } catch {
    return getDefaultTutorsAudioTurnPolicy();
  }
}

export const CHAT_INPUT_MODALITY_AUDIO_LITERAL = "audio" as const;

/**
 * 위조 modality(대소문자·공백·배열·객체 등)는 전부 "text"로 정규화한다(fail-closed 방향).
 * 정확히 문자열 "audio"인 경우만 audio로 인정한다. `trim()`을 적용하지 않는다 —
 * `" audio "`처럼 공백이 섞인 값을 정규화해 통과시키는 것 자체가 위조 허용 경로가 된다.
 */
export function normalizeChatInputModality(value: unknown): "text" | "audio" {
  return value === CHAT_INPUT_MODALITY_AUDIO_LITERAL ? "audio" : "text";
}

/**
 * text modality를 곧 textOutput 보유로 읽는 기존 카탈로그의 의미를 그대로 재사용한다.
 * 새 textInput/textOutput 불리언을 만들지 않는 이유: 기존 전 모델에 대한 데이터 마이그레이션 없이
 * 같은 결론이 나오고, 잘못 채워진 새 필드가 텍스트 경로를 깨뜨릴 위험이 없다.
 */
export function isAudioCapableChatModel(item: {
  modality: string;
  enabled: boolean;
  deprecated: boolean;
  supportsAudioInput: boolean;
  supportsAudioUnderstanding: boolean;
}): boolean {
  return (
    item.modality === "text" &&
    item.enabled &&
    !item.deprecated &&
    item.supportsAudioInput &&
    item.supportsAudioUnderstanding
  );
}

function toSelectedModelKey(selectedModel: TutorsAudioTurnRequest["selectedModel"]): string | null {
  const provider = selectedModel?.provider;
  const modelName = selectedModel?.modelName;
  if (typeof provider !== "string" || typeof modelName !== "string") return null;
  const trimmedProvider = provider.trim();
  const trimmedModelName = modelName.trim();
  if (!trimmedProvider || !trimmedModelName) return null;
  return `${trimmedProvider}:${trimmedModelName}`;
}

/**
 * audio 턴을 provider 호출보다 앞에서 fail-closed로 판정한다.
 *
 * 호출자 책임: `normalizeChatInputModality(request.inputModality)`가 `"audio"`가 아니면
 * 이 함수를 호출하지 않는다. 호출된 상태에서 값이 `"audio"`가 아니면 `modality_invalid`를 돌려준다
 * (방어적 이중 판정 — 호출자가 정규화를 건너뛰어도 여기서 다시 막는다).
 */
export function evaluateTutorsAudioTurn(
  policy: TutorsAudioTurnPolicy,
  request: TutorsAudioTurnRequest,
): TutorsAudioTurnDecision {
  if (normalizeChatInputModality(request.inputModality) !== "audio") {
    return { allowed: false, outcome: "modality_invalid" };
  }

  if (policy.gateOpen !== true) return { allowed: false, outcome: "gate_closed" };

  const selectedKey = toSelectedModelKey(request.selectedModel);
  if (!selectedKey) return { allowed: false, outcome: "model_not_selectable" };

  const audioCapableModelKeys = Array.isArray(request.audioCapableModelKeys) ? request.audioCapableModelKeys : [];
  if (!audioCapableModelKeys.includes(selectedKey)) {
    return { allowed: false, outcome: "model_not_audio_capable" };
  }

  return { allowed: true, outcome: "allowed" };
}
