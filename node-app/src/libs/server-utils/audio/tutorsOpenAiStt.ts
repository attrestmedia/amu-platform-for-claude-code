import { CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";
import {
  DEFAULT_SPEECH_RUNTIME_CONTROLS,
  normalizeSpeechRuntimeControls,
  type SpeechRuntimeControls,
} from "consts/system/speechRuntimeControls";
import {
  SPEECH_DEFAULT_MAX_DURATION_MS,
  SPEECH_MAX_AUDIO_BYTES,
  assertSpeechAudioInputOrThrow,
} from "./guards";
import { assertTutorsSttDailyLimitOrThrow, type TutorsSttDailyLimitOutcome } from "./tutorsSttDailyLimit";
import {
  evaluateTutorsSttSafety,
  getDefaultTutorsSttSafetyPolicy,
  type TutorsSttSafetyDecision,
  type TutorsSttSafetyOutcome,
  type TutorsSttSafetyPolicy,
  type TutorsSttSafetyRequest,
  type TutorsTrustedAudienceEligibility,
} from "./tutorsSttSafety";
import type {
  ISpeechAudioInput,
  ISpeechBillingContext,
  ISpeechTranscribeRequest,
  IValidatedSpeechAudioInput,
} from "./types";
import type { ISpeechTranscribeResponse } from "types/ai";

/**
 * @docHint
 * @purpose Tutors OpenAI STT의 비활성 서버 어댑터
 * @process 서버 정책 해석  순수 안전 판정  일일 한도  서버 duration 검증  기존 transcribeSpeech 재사용
 * @domain speech
 * @scope server
 *
 * 기본 정책은 계속 닫혀 있다. 이 모듈은 승인된 서버 base가 주입될 때만 provider까지 도달하는
 * 경로를 준비하며, 클라이언트 주장(provider/model/uid/duration/동의)은 판정 근거가 아니다.
 * 원음과 전용 전사 결과는 어떤 저장 포트로도 전달하지 않는다.
 */

export const TUTORS_OPENAI_STT_MODEL = "gpt-4o-transcribe" as const;
export const TUTORS_OPENAI_STT_ALLOWED_LANGUAGES = ["ko", "en"] as const;
export const TUTORS_OPENAI_STT_ERROR_CODE = "TUTORS_SPEECH_GATE_CLOSED" as const;
export const TUTORS_OPENAI_STT_FALLBACK = "text_only" as const;

export type TutorsOpenAiSttDeniedOutcome =
  | Exclude<TutorsSttSafetyOutcome, "allowed">
  | TutorsSttDailyLimitOutcome
  | "daily_limit_blocked";

export type TutorsOpenAiSttDenied = {
  allowed: false;
  outcome: TutorsOpenAiSttDeniedOutcome;
  status: number;
  errorCode: typeof TUTORS_OPENAI_STT_ERROR_CODE;
  fallback: typeof TUTORS_OPENAI_STT_FALLBACK;
};

export type TutorsOpenAiSttAllowed = {
  allowed: true;
  outcome: "allowed";
  transcript: string;
  language?: string;
  confidence?: number;
  usage?: ISpeechTranscribeResponse["usage"];
  billing?: ISpeechTranscribeResponse["billing"];
  meta?: Record<string, unknown>;
};

export type TutorsOpenAiSttResult = TutorsOpenAiSttAllowed | TutorsOpenAiSttDenied;

export type TutorsOpenAiSttDeps = {
  assertDailyLimit?: typeof assertTutorsSttDailyLimitOrThrow;
  assertAudioInput?: typeof assertSpeechAudioInputOrThrow;
  transcribe?: (args: ISpeechTranscribeRequest) => Promise<ISpeechTranscribeResponse>;
};

export type RunTutorsOpenAiSttArgs = {
  policy: TutorsSttSafetyPolicy;
  request: TutorsSttSafetyRequest;
  uid?: unknown;
  file: ISpeechAudioInput;
  language?: string;
  billing?: ISpeechBillingContext;
  user?: unknown;
  now?: Date;
};

function positiveCap(value: unknown): boolean {
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

/**
 * owner=tutors 예산이 양의 per-request/daily/monthly 상한으로 확정됐는지.
 * OpenAI는 std budget enforced 대상이 아니므로 Tutors 경로가 이 값을 직접 fail-closed 조건으로 쓴다.
 */
export function isTutorsSttBudgetConfigured(controls: SpeechRuntimeControls): boolean {
  const limits = controls.budgetByOwner?.tutors;
  if (!limits) return false;
  return (
    positiveCap(limits.perRequestUsdCap) &&
    positiveCap(limits.dailyUsdCap) &&
    positiveCap(limits.monthlyUsdCap)
  );
}

/**
 * TUTORS-192 — 서버 런타임 컨트롤에서 Tutors STT 정책을 구성한다.
 * provider는 openai 고정이며, 설정(모델·언어·길이·byte·일일 cap·owner 예산)이 하나라도
 * 미비하면 capability를 열지 않는다(fail-closed). 클라이언트 값은 입력이 아니다.
 */
export function buildTutorsSttPolicyFromControls(
  controls: SpeechRuntimeControls = DEFAULT_SPEECH_RUNTIME_CONTROLS,
  user?: unknown,
): TutorsSttSafetyPolicy {
  const normalized = normalizeSpeechRuntimeControls(controls);
  const tutorsStt = normalized.tutorsStt;
  const configured =
    tutorsStt.enabled === true &&
    tutorsStt.modelName === TUTORS_OPENAI_STT_MODEL &&
    tutorsStt.allowedLanguages.length > 0 &&
    positiveCap(tutorsStt.maxDurationMs) &&
    positiveCap(tutorsStt.maxAudioBytes) &&
    positiveCap(tutorsStt.maxRequestsPerUserPerDay);

  return {
    capabilityEnabled: configured,
    providerAllowlist: configured ? ["openai"] : [],
    modelAllowlist: configured ? [TUTORS_OPENAI_STT_MODEL] : [],
    approvedPrivacyPolicyVersion: CURRENT_ACCOUNT_POLICY.privacy.version,
    privacyPolicyEffectiveAt: CURRENT_ACCOUNT_POLICY.privacy.effectiveDate,
    trustedAudienceEligibility: resolveTrustedTutorsAudienceEligibility(user),
    minorProtectionReady: tutorsStt.minorProtectionReady === true,
    allowUnknownAudience: tutorsStt.allowUnknownAudience === true,
    allowedLanguages: tutorsStt.allowedLanguages.length
      ? tutorsStt.allowedLanguages
      : TUTORS_OPENAI_STT_ALLOWED_LANGUAGES,
    maxAudioBytes: tutorsStt.maxAudioBytes ?? SPEECH_MAX_AUDIO_BYTES,
    maxDurationMs: tutorsStt.maxDurationMs ?? SPEECH_DEFAULT_MAX_DURATION_MS,
    maxRequestsPerUserPerDay: tutorsStt.maxRequestsPerUserPerDay,
    dailyBudgetAvailable: configured && isTutorsSttBudgetConfigured(normalized),
  };
}

/**
 * 서버 정책 resolver.
 * - `{ controls, user }`를 넘기면 런타임 컨트롤에서 정책을 구성한다(라우트 경로).
 * - `TutorsSttSafetyPolicy`를 넘기면 기존처럼 언어/용량/길이 상한만 채운다(주입 seam·테스트).
 */
export function resolveTutorsSttServerPolicy(
  baseOrArgs:
    | TutorsSttSafetyPolicy
    | { controls?: SpeechRuntimeControls; user?: unknown } = getDefaultTutorsSttSafetyPolicy(),
): TutorsSttSafetyPolicy {
  if (
    baseOrArgs &&
    typeof baseOrArgs === "object" &&
    ("controls" in baseOrArgs || "user" in baseOrArgs)
  ) {
    const args = baseOrArgs as { controls?: SpeechRuntimeControls; user?: unknown };
    return buildTutorsSttPolicyFromControls(
      args.controls ?? DEFAULT_SPEECH_RUNTIME_CONTROLS,
      args.user,
    );
  }

  return {
    ...(baseOrArgs as TutorsSttSafetyPolicy),
    allowedLanguages: TUTORS_OPENAI_STT_ALLOWED_LANGUAGES,
    maxAudioBytes: SPEECH_MAX_AUDIO_BYTES,
    maxDurationMs: SPEECH_DEFAULT_MAX_DURATION_MS,
  };
}

/** 서버 신뢰 출처가 확정되기 전에는 자기 신고·클라이언트 나이를 승격하지 않는다. */
export function resolveTrustedTutorsAudienceEligibility(_user?: unknown): TutorsTrustedAudienceEligibility {
  return "unknown";
}

/** 순수 안전 판정을 그대로 재사용해 요청 상태를 하나의 outcome으로 정규화한다. */
export function evaluateTutorsOpenAiStt(args: {
  policy: TutorsSttSafetyPolicy;
  request: TutorsSttSafetyRequest;
}): TutorsSttSafetyDecision {
  return evaluateTutorsSttSafety(args.policy, args.request);
}

function denied(outcome: TutorsOpenAiSttDeniedOutcome, status = 403): TutorsOpenAiSttDenied {
  return {
    allowed: false,
    outcome,
    status,
    errorCode: TUTORS_OPENAI_STT_ERROR_CODE,
    fallback: TUTORS_OPENAI_STT_FALLBACK,
  };
}

function resolveDailyLimitFailure(error: unknown): TutorsOpenAiSttDenied {
  const record = error as { status?: unknown; detail?: { outcome?: unknown } } | null;
  const outcome = typeof record?.detail?.outcome === "string" ? record.detail.outcome : "daily_limit_blocked";
  const status = typeof record?.status === "number" ? record.status : 403;
  return denied(outcome as TutorsOpenAiSttDeniedOutcome, status);
}

async function defaultTranscribe(args: ISpeechTranscribeRequest): Promise<ISpeechTranscribeResponse> {
  const { transcribeSpeech } = await import("./transcribeSpeech");
  return transcribeSpeech(args);
}

/**
 * 판정이 허용일 때만 provider를 호출한다.
 * (1) duration 제외 안전 판정 → (2) 일일 한도 → (3) 서버 bytes/decoder duration →
 * (4) 신뢰 duration 포함 재판정 → (5) 기존 transcribeSpeech 1회.
 */
export async function runTutorsOpenAiStt(
  args: RunTutorsOpenAiSttArgs,
  deps: TutorsOpenAiSttDeps = {},
): Promise<TutorsOpenAiSttResult> {
  const baseRequest: TutorsSttSafetyRequest = { ...args.request, trustedDurationMs: undefined };
  const preDecision = evaluateTutorsSttSafety(args.policy, baseRequest);
  if (!preDecision.allowed && preDecision.outcome !== "duration_too_long") {
    return denied(preDecision.outcome);
  }

  const assertDailyLimit = deps.assertDailyLimit ?? assertTutorsSttDailyLimitOrThrow;
  try {
    await assertDailyLimit({ uid: args.uid, now: args.now });
  } catch (error) {
    return resolveDailyLimitFailure(error);
  }

  const assertAudioInput = deps.assertAudioInput ?? assertSpeechAudioInputOrThrow;
  let validated: IValidatedSpeechAudioInput;
  try {
    validated = assertAudioInput(args.file, {
      maxBytes: args.policy.maxAudioBytes,
      maxDurationMs: args.policy.maxDurationMs,
    });
  } catch (error) {
    const errorCode = String((error as { errorCode?: string })?.errorCode || "");
    if (errorCode === "AUDIO_DURATION_EXCEEDED") return denied("duration_too_long", 413);
    if (errorCode === "AUDIO_FILE_TOO_LARGE") return denied("audio_too_large", 413);
    throw error;
  }

  const finalDecision = evaluateTutorsSttSafety(args.policy, {
    ...baseRequest,
    fileSizeBytes: validated.sizeBytes,
    trustedDurationMs: validated.actualDurationMs,
  });
  if (!finalDecision.allowed) {
    return denied(finalDecision.outcome);
  }
  if (
    finalDecision.selectedProvider !== "openai" ||
    finalDecision.selectedModel !== TUTORS_OPENAI_STT_MODEL
  ) {
    return denied("not_activated");
  }

  const transcribe = deps.transcribe ?? defaultTranscribe;
  const response = await transcribe({
    provider: "openai",
    modelName: TUTORS_OPENAI_STT_MODEL,
    language: args.language,
    maxDurationMs: args.policy.maxDurationMs,
    file: validated,
    billing: args.billing,
    user: args.user,
  });

  return {
    allowed: true,
    outcome: "allowed",
    transcript: response.transcript,
    language: response.language,
    confidence: response.confidence,
    usage: response.usage,
    billing: response.billing,
    meta: {
      ...response.meta,
      provider: "openai",
      modelName: TUTORS_OPENAI_STT_MODEL,
      voiceIntent: "chat_transcript",
      audioRetention: "transient",
    },
  };
}
