import {
  ELEVENLABS_STT_ALLOWED_LANGUAGES,
  ELEVENLABS_STT_MAX_AUDIO_BYTES,
  ELEVENLABS_STT_MAX_DURATION_MS,
  ELEVENLABS_STT_MODEL,
} from "consts/legal/elevenlabsSttDisclosure";
import { assertSpeechAudioInputOrThrow } from "./guards";
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
 * @purpose EL-601 Tutors ElevenLabs Scribe STT의 비활성 서버 어댑터
 * @process 서버 정책 해석  순수 안전 판정  일일 한도  서버 duration 검증  기존 transcribeSpeech 재사용
 * @domain speech
 * @scope server
 *
 * 기본 정책은 계속 닫혀 있다. 이 모듈은 승인된 서버 base가 주입될 때만 provider까지 도달하는
 * 경로를 준비하며, 클라이언트 주장(provider/model/uid/duration/동의)은 판정 근거가 아니다.
 * 원음과 전용 전사 결과는 어떤 저장 포트로도 전달하지 않는다.
 */

export const TUTORS_ELEVENLABS_STT_ERROR_CODE = "TUTORS_SPEECH_GATE_CLOSED" as const;
export const TUTORS_ELEVENLABS_STT_FALLBACK = "text_only" as const;

export type TutorsElevenLabsSttDeniedOutcome =
  | Exclude<TutorsSttSafetyOutcome, "allowed">
  | TutorsSttDailyLimitOutcome
  | "daily_limit_blocked";

export type TutorsElevenLabsSttDenied = {
  allowed: false;
  outcome: TutorsElevenLabsSttDeniedOutcome;
  status: number;
  errorCode: typeof TUTORS_ELEVENLABS_STT_ERROR_CODE;
  fallback: typeof TUTORS_ELEVENLABS_STT_FALLBACK;
};

export type TutorsElevenLabsSttAllowed = {
  allowed: true;
  outcome: "allowed";
  transcript: string;
  language?: string;
  confidence?: number;
  usage?: ISpeechTranscribeResponse["usage"];
  billing?: ISpeechTranscribeResponse["billing"];
  meta?: Record<string, unknown>;
};

export type TutorsElevenLabsSttResult = TutorsElevenLabsSttAllowed | TutorsElevenLabsSttDenied;

export type TutorsElevenLabsSttDeps = {
  assertDailyLimit?: typeof assertTutorsSttDailyLimitOrThrow;
  assertAudioInput?: typeof assertSpeechAudioInputOrThrow;
  transcribe?: (args: ISpeechTranscribeRequest) => Promise<ISpeechTranscribeResponse>;
};

export type RunTutorsElevenLabsSttArgs = {
  policy: TutorsSttSafetyPolicy;
  request: TutorsSttSafetyRequest;
  uid?: unknown;
  file: ISpeechAudioInput;
  language?: string;
  billing?: ISpeechBillingContext;
  user?: unknown;
  now?: Date;
};

/**
 * 기본 정책을 그대로 두고 ElevenLabs 계약의 언어/용량/길이 상한만 채운다.
 * capability/provider/model/trustedAudience/dailyBudget은 승인 전 닫힘을 유지하며
 * 클라이언트 값으로 열 수 없다. `base`는 미래의 서버 설정 주입 seam이다.
 */
export function resolveTutorsSttServerPolicy(
  base: TutorsSttSafetyPolicy = getDefaultTutorsSttSafetyPolicy(),
): TutorsSttSafetyPolicy {
  return {
    ...base,
    allowedLanguages: ELEVENLABS_STT_ALLOWED_LANGUAGES,
    maxAudioBytes: ELEVENLABS_STT_MAX_AUDIO_BYTES,
    maxDurationMs: ELEVENLABS_STT_MAX_DURATION_MS,
  };
}

/** 서버 신뢰 출처가 확정되기 전에는 자기 신고·클라이언트 나이를 승격하지 않는다. */
export function resolveTrustedTutorsAudienceEligibility(_user?: unknown): TutorsTrustedAudienceEligibility {
  return "unknown";
}

/** 순수 안전 판정을 그대로 재사용해 요청 상태를 하나의 outcome으로 정규화한다. */
export function evaluateTutorsElevenLabsStt(args: {
  policy: TutorsSttSafetyPolicy;
  request: TutorsSttSafetyRequest;
}): TutorsSttSafetyDecision {
  return evaluateTutorsSttSafety(args.policy, args.request);
}

function denied(outcome: TutorsElevenLabsSttDeniedOutcome, status = 403): TutorsElevenLabsSttDenied {
  return {
    allowed: false,
    outcome,
    status,
    errorCode: TUTORS_ELEVENLABS_STT_ERROR_CODE,
    fallback: TUTORS_ELEVENLABS_STT_FALLBACK,
  };
}

function resolveDailyLimitFailure(error: unknown): TutorsElevenLabsSttDenied {
  const record = error as { status?: unknown; detail?: { outcome?: unknown } } | null;
  const outcome = typeof record?.detail?.outcome === "string" ? record.detail.outcome : "daily_limit_blocked";
  const status = typeof record?.status === "number" ? record.status : 403;
  return denied(outcome as TutorsElevenLabsSttDeniedOutcome, status);
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
export async function runTutorsElevenLabsStt(
  args: RunTutorsElevenLabsSttArgs,
  deps: TutorsElevenLabsSttDeps = {},
): Promise<TutorsElevenLabsSttResult> {
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

  const transcribe = deps.transcribe ?? defaultTranscribe;
  const response = await transcribe({
    provider: "elevenlabs",
    modelName: ELEVENLABS_STT_MODEL,
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
      provider: "elevenlabs",
      modelName: ELEVENLABS_STT_MODEL,
      voiceIntent: "chat_transcript",
      audioRetention: "transient",
    },
  };
}
