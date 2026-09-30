"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RouteHintType, SpeechProviderType } from "types/ai";
import { createChatMessageMeta } from "utils/ai";
import { logger } from "utils/log";
import { lang } from "components/module/i18n";
import { requestSpeechTranscription } from "libs/api/ai/speechClient";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";
import { convertRecordedAudioToWav } from "utils/audio/browserAudio";

/**
 * @docHint
 * @purpose push-to-talk 음성 입력 훅
 * @process 브라우저 녹음 상태 관리  WAV 변환  서버 STT/gpt-audio 원음 분석  기존 채팅 입력으로 반환
 * @domain chat-voice
 * @scope client
 */

type BrowserSpeechRecognitionAlternative = {
  transcript?: string;
};

type BrowserSpeechRecognitionResult = {
  isFinal?: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
};

type BrowserSpeechRecognitionEvent = {
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognitionErrorEvent = {
  error?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type VoiceInputErrorCode =
  | "UNSUPPORTED_BROWSER"
  | "MIC_PERMISSION_DENIED"
  | "MIC_NOT_FOUND"
  | "EMPTY_AUDIO"
  | "EMPTY_TRANSCRIPT"
  | "TRANSCRIBE_FAILED"
  | "AUTH_REQUIRED"
  | "COIN_INSUFFICIENT"
  | "VOICE_DISABLED"
  | "TUTORS_PERSONA_NOT_SELECTED"
  | "SPEECH_CONTEXT_MISSING"
  | "SPEECH_TIMEOUT"
  | "UNSUPPORTED_AUDIO_FORMAT"
  | "SPEECH_BILLING_FAILED"
  | "SPEECH_MODEL_UNAVAILABLE";

export type VoiceResolvedInputMeta = {
  source: "microphone_transcript";
  transcriptSource: "speech_transcribe";
  audioRetention: "transient";
  audioForwarding: "gpt_audio_direct" | "derived_acoustic_evidence";
  durationMs?: number;
  transcriptLanguage?: string;
  pronunciationAssessment: {
    enabled: boolean;
    basis: "gpt_audio_direct" | "transcription_logprobs";
    provider?: "openai";
    modelName?: string;
    heardText?: string;
    summary?: string;
    overallConfidence?: number;
    overallScore?: number;
    clarityScore?: number;
    fluencyScore?: number;
    paceScore?: number;
    intonationScore?: number;
    strengths?: string[];
    improvements?: string[];
    uncertainWords?: Array<{ word: string; issue?: string; suggestion?: string }>;
    unclearTokens: Array<{ text: string; confidence: number }>;
  };
};

export type MicrophoneAvailability = "checking" | "available" | "unavailable" | "unsupported";

type UseVoiceInputArgs = {
  enabled: boolean;
  baseInput: string;
  maxChars?: number;
  analysisEnabled?: boolean; // 원음(발음) 분석 사용 여부. 미지정 시 기존 동작(분석 시도) 유지
  autoSubmitOnSilence?: boolean; // 무음 자동 종료(핸즈프리). true면 말이 끝나면 자동 전사·전송
  routeHint: RouteHintType;
  universeId?: string;
  npcId?: string;
  sessionId?: string;
  language?: string;
  assessmentContext?: string;
  provider?: SpeechProviderType;
  disclosureAcknowledged?: boolean;
  disclosureVersion?: string;
  onResolvedInput: (nextInput: string, transcript: string, meta: VoiceResolvedInputMeta) => Promise<void> | void;
};

const MIN_RECORDING_MS = 650;

// VAD(무음 자동 종료) 튜닝값 — 기기/마이크/소음 환경에 따라 조정 필요
const VAD_START_THRESHOLD = 0.03; // 발화 시작으로 판단하는 RMS 진폭
const VAD_SILENCE_THRESHOLD = 0.012; // 무음으로 판단하는 RMS 진폭
const VAD_SILENCE_HOLD_MS = 1200; // 발화 후 무음이 이 시간 이상 지속되면 자동 종료

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function mergeVoiceChatInput(baseInput: string, transcript: string) {
  const base = String(baseInput || "").trim();
  const voice = String(transcript || "").trim();

  if (!voice) return base;
  if (!base) return voice;
  return `${base}\n${voice}`;
}

function clampVoiceChatInput(text: string, maxChars?: number) {
  if (!maxChars || maxChars <= 0) return text;
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;

  const recognitionWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return recognitionWindow.SpeechRecognition || recognitionWindow.webkitSpeechRecognition || null;
}

function resolveRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const candidate of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

function resolveAudioFileName(mimeType: string) {
  if (mimeType.includes("mp4")) return "voice-input.mp4";
  if (mimeType.includes("ogg")) return "voice-input.ogg";
  return "voice-input.webm";
}

function resolveServerVoiceErrorCode(error: unknown): VoiceInputErrorCode {
  const record = toUnknownRecord(error);
  const response = toUnknownRecord(record.response);
  const data = toUnknownRecord(response.data || record.data);
  const errorCode = String(data.errorCode || record.errorCode || "").trim();
  const transportCode = String(record.code || "").trim();

  if (errorCode === "AUTH_REQUIRED") return "AUTH_REQUIRED";
  if (errorCode === "COIN_INSUFFICIENT") return "COIN_INSUFFICIENT";
  if (errorCode === "VOICE_DISABLED") return "VOICE_DISABLED";
  if (errorCode === "TUTORS_PERSONA_NOT_SELECTED") return "TUTORS_PERSONA_NOT_SELECTED";
  if (errorCode === "UNSUPPORTED_AUDIO_FORMAT") return "UNSUPPORTED_AUDIO_FORMAT";
  if (errorCode === "PRICING_PREFLIGHT_FAILED" || errorCode === "SPEECH_BILLING_CONTEXT_REQUIRED") {
    return "SPEECH_BILLING_FAILED";
  }
  if (
    errorCode === "MODEL_DISABLED" ||
    errorCode === "UNSUPPORTED_MODEL" ||
    errorCode === "UNSUPPORTED_SPEECH_MODEL" ||
    errorCode === "SPEECH_MODEL_NOT_AVAILABLE" ||
    errorCode === "UNSUPPORTED_SPEECH_PROVIDER"
  ) {
    return "SPEECH_MODEL_UNAVAILABLE";
  }
  if (
    errorCode === "SESSIONID_REQUIRED" ||
    errorCode === "UNIVERSEID_REQUIRED" ||
    errorCode === "NPCID_REQUIRED" ||
    errorCode === "CLIENT_ID_REQUIRED" ||
    errorCode === "NPC_NOT_FOUND"
  ) {
    return "SPEECH_CONTEXT_MISSING";
  }
  if (errorCode === "TIMEOUT" || transportCode === "ECONNABORTED") return "SPEECH_TIMEOUT";

  return "TRANSCRIBE_FAILED";
}

function resolveVoiceErrorMessage(errorCode: VoiceInputErrorCode | null) {
  switch (errorCode) {
    case "UNSUPPORTED_BROWSER":
      return lang({ ko: "이 브라우저에서는 마이크 녹음을 지원하지 않습니다.", en: "This browser does not support microphone recording." });
    case "MIC_PERMISSION_DENIED":
      return lang({ ko: "마이크 권한이 거부되었습니다. 브라우저 설정을 확인해 주세요.", en: "Microphone permission was denied. Check your browser settings." });
    case "MIC_NOT_FOUND":
      return lang({ ko: "사용 가능한 마이크를 찾지 못했습니다.", en: "No available microphone was found." });
    case "EMPTY_AUDIO":
      return lang({ ko: "녹음된 음성이 없습니다. 다시 시도해 주세요.", en: "No audio was recorded. Please try again." });
    case "EMPTY_TRANSCRIPT":
      return lang({ ko: "음성을 텍스트로 변환하지 못했습니다. 다시 시도해 주세요.", en: "Failed to convert speech to text. Please try again." });
    case "TRANSCRIBE_FAILED":
      return lang({ ko: "음성 전송 또는 전사에 실패했습니다.", en: "Failed to upload or transcribe the recording." });
    case "AUTH_REQUIRED":
      return lang({ ko: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.", en: "Your login session expired. Please sign in again." });
    case "COIN_INSUFFICIENT":
      return lang({ ko: "음성 전사를 위한 코인이 부족합니다.", en: "Not enough coins for voice transcription." });
    case "VOICE_DISABLED":
      return lang({ ko: "이 튜터에서는 음성 기능을 사용할 수 없습니다.", en: "Voice is disabled for this tutor." });
    case "TUTORS_PERSONA_NOT_SELECTED":
      return lang({
        ko: "선택된 선생님 상태가 동기화되지 않았습니다. 선생님을 다시 선택해 주세요.",
        en: "The selected tutor state is out of sync. Please select the tutor again.",
      });
    case "SPEECH_CONTEXT_MISSING":
      return lang({
        ko: "음성 대화 준비 정보가 누락되었습니다. 화면을 새로고침하거나 선생님을 다시 선택해 주세요.",
        en: "Voice chat context is missing. Refresh the screen or select the tutor again.",
      });
    case "SPEECH_TIMEOUT":
      return lang({ ko: "음성 처리 시간이 초과되었습니다. 짧게 다시 말해 주세요.", en: "Voice processing timed out. Please try a shorter recording." });
    case "UNSUPPORTED_AUDIO_FORMAT":
      return lang({
        ko: "앱에서 녹음된 오디오 형식을 서버가 처리하지 못했습니다.",
        en: "The server could not process this recorded audio format.",
      });
    case "SPEECH_BILLING_FAILED":
      return lang({
        ko: "음성 전사 과금 설정을 확인해야 합니다.",
        en: "Voice transcription billing settings need to be checked.",
      });
    case "SPEECH_MODEL_UNAVAILABLE":
      return lang({
        ko: "현재 음성 전사 모델을 사용할 수 없습니다.",
        en: "The current speech transcription model is unavailable.",
      });
    default:
      return null;
  }
}

export function useVoiceInput(args: UseVoiceInputArgs) {
  const {
    enabled,
    baseInput,
    maxChars,
    analysisEnabled = true,
    autoSubmitOnSilence = false,
    routeHint,
    universeId,
    npcId,
    sessionId,
    language,
    assessmentContext,
    provider,
    disclosureAcknowledged,
    disclosureVersion,
    onResolvedInput,
  } = args;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const stopPromiseRef = useRef<Promise<Blob> | null>(null);
  const finalizedRef = useRef(false);
  const startAtRef = useRef<number>(0);

  // VAD(무음 자동 종료)용 Web Audio 자원
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const vadBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const speechSeenRef = useRef(false);
  const silenceStartRef = useRef<number>(0);
  // startVad가 참조하는 자동 전송 함수 — stopAndTranscribe와의 순환 의존을 ref로 우회
  const autoStopRef = useRef<() => void>(() => {});

  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [permissionState, setPermissionState] = useState<"idle" | "prompt" | "granted" | "denied">("idle");
  const [errorCode, setErrorCode] = useState<VoiceInputErrorCode | null>(null);
  const [microphoneAvailability, setMicrophoneAvailability] = useState<
    Exclude<MicrophoneAvailability, "unsupported">
  >("checking");
  // 녹음 시작 시점의 baseInput 스냅샷 — ref가 아닌 state로 보관해
  // displayInput useMemo에서 render 중 ref 접근 경고(react-hooks/refs)를 피한다.
  const [baseInputSnapshot, setBaseInputSnapshot] = useState("");

  const isBrowserRecordingSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      Boolean(window.navigator?.mediaDevices?.getUserMedia) &&
      typeof window.navigator.mediaDevices.enumerateDevices === "function" &&
      typeof MediaRecorder !== "undefined"
    );
  }, []);

  const recognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);
  const canUseInterimTranscript = Boolean(recognitionCtor);

  useEffect(() => {
    if (!isBrowserRecordingSupported) return;

    const mediaDevices = window.navigator.mediaDevices;
    let disposed = false;

    const detectMicrophone = async () => {
      try {
        const devices = await mediaDevices.enumerateDevices();
        if (!disposed) {
          setMicrophoneAvailability(devices.some((device) => device.kind === "audioinput") ? "available" : "unavailable");
        }
      } catch (error) {
        logger.warn("[useVoiceInput] 마이크 장치 확인 실패:", error);
        if (!disposed) setMicrophoneAvailability("unavailable");
      }
    };

    void detectMicrophone();
    mediaDevices.addEventListener?.("devicechange", detectMicrophone);

    return () => {
      disposed = true;
      mediaDevices.removeEventListener?.("devicechange", detectMicrophone);
    };
  }, [isBrowserRecordingSupported]);

  useEffect(() => {
    if (!isBrowserRecordingSupported || !window.navigator.permissions?.query) return;

    let disposed = false;
    let microphonePermission: PermissionStatus | null = null;

    const syncPermission = () => {
      if (disposed || !microphonePermission) return;
      if (microphonePermission.state === "denied") setPermissionState("denied");
      else if (microphonePermission.state === "granted") setPermissionState("granted");
      else setPermissionState("idle");
    };

    void window.navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((permission) => {
        if (disposed) return;
        microphonePermission = permission;
        syncPermission();
        microphonePermission.addEventListener("change", syncPermission);
      })
      .catch(() => {
        // 일부 브라우저는 microphone 권한 조회를 지원하지 않는다. 실제 녹음 요청 시 확인한다.
      });

    return () => {
      disposed = true;
      microphonePermission?.removeEventListener("change", syncPermission);
    };
  }, [isBrowserRecordingSupported]);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopRecognition = useCallback((mode: "stop" | "abort" = "stop") => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (!recognition) return;

    try {
      if (mode === "abort") recognition.abort();
      else recognition.stop();
    } catch {}
  }, []);

  const cleanupRecorder = useCallback(() => {
    recorderRef.current = null;
    stopPromiseRef.current = null;
    recordChunksRef.current = [];
    finalizedRef.current = false;
    startAtRef.current = 0;
  }, []);

  const resetVoiceState = useCallback(() => {
    setInterimTranscript("");
    setErrorCode(null);
  }, []);

  // VAD 루프/오디오 컨텍스트 정리 — 모든 종료 경로에서 호출해 누수 방지
  const stopVad = useCallback(() => {
    if (vadRafRef.current != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(vadRafRef.current);
    }
    vadRafRef.current = null;
    analyserRef.current = null;
    vadBufferRef.current = null;
    speechSeenRef.current = false;
    silenceStartRef.current = 0;

    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => {});
    }
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const recorder = recorderRef.current;
    const stopPromise = stopPromiseRef.current;

    if (!recorder || !stopPromise || finalizedRef.current) return;
    finalizedRef.current = true;
    setIsRecording(false);
    stopVad();
    stopRecognition("stop");

    const elapsedMs = startAtRef.current > 0 ? Date.now() - startAtRef.current : 0;
    if (elapsedMs > 0 && elapsedMs < MIN_RECORDING_MS) {
      await sleep(MIN_RECORDING_MS - elapsedMs);
    }

    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {}

    try {
      const audioBlob = await stopPromise;
      cleanupStream();

      if (!audioBlob || audioBlob.size <= 0) {
        setErrorCode("EMPTY_AUDIO");
        cleanupRecorder();
        return;
      }

      if (!enabled || !npcId) {
        cleanupRecorder();
        return;
      }

      if (!universeId || !sessionId) {
        logger.warn("[useVoiceInput] speech transcribe context missing:", {
          hasUniverseId: Boolean(universeId),
          hasSessionId: Boolean(sessionId),
          npcId,
          routeHint,
        });
        setErrorCode("SPEECH_CONTEXT_MISSING");
        cleanupRecorder();
        return;
      }

      setIsSubmitting(true);

      const durationMs = startAtRef.current > 0 ? Math.max(0, Date.now() - startAtRef.current) : undefined;
      let uploadBlob = audioBlob;
      let mimeType = String(audioBlob.type || resolveRecordingMimeType() || "audio/webm").trim() || "audio/webm";
      let fileName = resolveAudioFileName(mimeType);
      let directAudioAnalysisEnabled = false;
      try {
        uploadBlob = await convertRecordedAudioToWav(audioBlob);
        mimeType = "audio/wav";
        fileName = "voice-input.wav";
        directAudioAnalysisEnabled = analysisEnabled; // 사용자 설정에 따라 원음 분석 on/off
      } catch (error) {
        logger.warn("[useVoiceInput] WAV 변환 실패, STT 전용 경로로 fallback:", error);
      }
      const userClientId = createChatMessageMeta("user", { seed: `voice-user:${npcId}` }).clientId;
      // TUTORS-192: Tutors 경로는 OpenAI STT + chat_transcript로 고정한다. 클라이언트 provider/원음 분석
      // 요청은 서버 판정 근거가 아니며, ElevenLabs/발음 분석 경로로 새지 않게 한다.
      const isTutorsRoute = routeHint === "tutors";
      const effectiveProvider = isTutorsRoute ? "openai" : provider || "openai";
      const effectiveAudioAnalysisEnabled = isTutorsRoute ? false : directAudioAnalysisEnabled;
      const response = await requestSpeechTranscription({
        file: uploadBlob,
        fileName,
        mimeType,
        routeHint,
        universeId,
        npcId,
        sessionId,
        userClientId,
        provider: effectiveProvider,
        language,
        durationMs,
        voiceIntent: effectiveAudioAnalysisEnabled ? "pronunciation_assessment" : "chat_transcript",
        audioRetention: "transient",
        assessmentConsent: effectiveAudioAnalysisEnabled,
        analysisContext: assessmentContext,
        disclosureAcknowledged,
        disclosureVersion,
      });

      const transcript = String(response?.transcript || "").trim();
      if (!transcript) {
        setErrorCode("EMPTY_TRANSCRIPT");
        cleanupRecorder();
        return;
      }

      const nextInput = clampVoiceChatInput(mergeVoiceChatInput(baseInputSnapshot, transcript), maxChars);
      const responseMeta = toUnknownRecord(response?.meta);
      const acousticEvidence = toUnknownRecord(responseMeta.acousticEvidence);
      const audioAnalysis = toUnknownRecord(responseMeta.audioAnalysis);
      const unclearTokens = Array.isArray(acousticEvidence.unclearTokens)
        ? acousticEvidence.unclearTokens
            .map((item) => {
              const record = toUnknownRecord(item);
              return {
                text: String(record.text || "").trim().slice(0, 40),
                confidence: Number(record.confidence),
              };
            })
            .filter((item) => item.text && Number.isFinite(item.confidence))
            .slice(0, 8)
        : [];
      const voiceMeta: VoiceResolvedInputMeta = {
        source: "microphone_transcript",
        transcriptSource: "speech_transcribe",
        audioRetention: "transient",
        audioForwarding: audioAnalysis.basis === "gpt_audio_direct" ? "gpt_audio_direct" : "derived_acoustic_evidence",
        durationMs,
        transcriptLanguage: String(response?.language || language || "").trim() || undefined,
        pronunciationAssessment: {
          enabled:
            audioAnalysis.basis === "gpt_audio_direct" ||
            (typeof response?.confidence === "number" && Number.isFinite(response.confidence)) ||
            unclearTokens.length > 0,
          basis: audioAnalysis.basis === "gpt_audio_direct" ? "gpt_audio_direct" : "transcription_logprobs",
          provider: audioAnalysis.provider === "openai" ? "openai" : undefined,
          modelName: String(audioAnalysis.modelName || "").trim().slice(0, 80) || undefined,
          heardText: String(audioAnalysis.heardText || "").trim().slice(0, 1000) || undefined,
          summary: String(audioAnalysis.summary || "").trim().slice(0, 600) || undefined,
          overallConfidence:
            typeof response?.confidence === "number" && Number.isFinite(response.confidence)
              ? response.confidence
              : undefined,
          overallScore: Number.isFinite(Number(audioAnalysis.overallScore)) ? Number(audioAnalysis.overallScore) : undefined,
          clarityScore: Number.isFinite(Number(audioAnalysis.clarityScore)) ? Number(audioAnalysis.clarityScore) : undefined,
          fluencyScore: Number.isFinite(Number(audioAnalysis.fluencyScore)) ? Number(audioAnalysis.fluencyScore) : undefined,
          paceScore: Number.isFinite(Number(audioAnalysis.paceScore)) ? Number(audioAnalysis.paceScore) : undefined,
          intonationScore: Number.isFinite(Number(audioAnalysis.intonationScore))
            ? Number(audioAnalysis.intonationScore)
            : undefined,
          strengths: Array.isArray(audioAnalysis.strengths)
            ? audioAnalysis.strengths.map((item) => String(item).slice(0, 240)).slice(0, 5)
            : undefined,
          improvements: Array.isArray(audioAnalysis.improvements)
            ? audioAnalysis.improvements.map((item) => String(item).slice(0, 240)).slice(0, 5)
            : undefined,
          uncertainWords: Array.isArray(audioAnalysis.uncertainWords)
            ? audioAnalysis.uncertainWords
                .map((item) => {
                  const word = toUnknownRecord(item);
                  return {
                    word: String(word.word || "").trim().slice(0, 40),
                    issue: String(word.issue || "").trim().slice(0, 160) || undefined,
                    suggestion: String(word.suggestion || "").trim().slice(0, 160) || undefined,
                  };
                })
                .filter((item) => item.word)
                .slice(0, 8)
            : undefined,
          unclearTokens,
        },
      };
      setInterimTranscript(transcript);
      await onResolvedInput(nextInput, transcript, voiceMeta);
      setInterimTranscript("");
      setErrorCode(null);
    } catch (error: unknown) {
      logger.error("[useVoiceInput] 음성 전사 실패:", error);
      setErrorCode(resolveServerVoiceErrorCode(error));
    } finally {
      setIsSubmitting(false);
      cleanupRecorder();
    }
  }, [
    enabled,
    analysisEnabled,
    language,
    assessmentContext,
    provider,
    disclosureAcknowledged,
    disclosureVersion,
    maxChars,
    npcId,
    onResolvedInput,
    routeHint,
    sessionId,
    universeId,
    baseInputSnapshot,
    cleanupRecorder,
    cleanupStream,
    stopRecognition,
    stopVad,
  ]);

  // 최신 stopAndTranscribe를 ref에 보관 — VAD 콜백에서 안전하게 호출(render 중 ref mutation 회피)
  useEffect(
    function syncAutoStopRef() {
      autoStopRef.current = () => {
        void stopAndTranscribe();
      };
    },
    [stopAndTranscribe],
  );

  // VAD 기동: 동일 MediaStream에 AnalyserNode를 연결해 RMS 진폭으로 발화/무음을 판정
  const startVad = useCallback(
    function startVad(stream: MediaStream) {
      try {
        const AudioContextCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;

        const ctx = new AudioContextCtor();
        void ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        vadBufferRef.current = new Float32Array(analyser.fftSize);
        speechSeenRef.current = false;
        silenceStartRef.current = 0;

        const tick = () => {
          const activeAnalyser = analyserRef.current;
          const buffer = vadBufferRef.current;
          if (!activeAnalyser || !buffer) return;

          activeAnalyser.getFloatTimeDomainData(buffer);
          let sumSquares = 0;
          for (let i = 0; i < buffer.length; i += 1) sumSquares += buffer[i] * buffer[i];
          const rms = Math.sqrt(sumSquares / buffer.length);
          const now = Date.now();

          if (rms >= VAD_START_THRESHOLD) {
            speechSeenRef.current = true;
            silenceStartRef.current = 0;
          } else if (speechSeenRef.current && rms < VAD_SILENCE_THRESHOLD) {
            if (silenceStartRef.current === 0) {
              silenceStartRef.current = now;
            } else if (
              now - silenceStartRef.current >= VAD_SILENCE_HOLD_MS &&
              now - startAtRef.current >= MIN_RECORDING_MS
            ) {
              autoStopRef.current(); // 무음 자동 종료 → 전사·전송 (내부에서 stopVad 호출)
              return;
            }
          }

          vadRafRef.current = requestAnimationFrame(tick);
        };

        vadRafRef.current = requestAnimationFrame(tick);
      } catch (error) {
        logger.warn("[useVoiceInput] VAD 시작 실패:", error);
      }
    },
    [],
  );

  const startRecording = useCallback(async () => {
    if (!enabled || isRecording || isSubmitting) return;

    if (!isBrowserRecordingSupported) {
      setErrorCode("UNSUPPORTED_BROWSER");
      return;
    }

    try {
      resetVoiceState();
      setPermissionState("prompt");
      setBaseInputSnapshot(baseInput);

      const stream = await window.navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
        },
      });

      streamRef.current = stream;
      setPermissionState("granted");

      const mimeType = resolveRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordChunksRef.current = [];

      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) recordChunksRef.current.push(event.data);
        };

        recorder.onerror = (event: Event) => {
          // MediaRecorderErrorEvent는 `error` 필드를 가지지만 모든 브라우저에서 정의된 타입이 동일하지 않음.
          const innerError = (event as Event & { error?: unknown }).error;
          reject(innerError instanceof Error ? innerError : new Error("media recorder error"));
        };

        recorder.onstop = () => {
          resolve(new Blob(recordChunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" }));
        };
      });

      recorderRef.current = recorder;
      stopPromiseRef.current = stopped;
      recorder.start();
      startAtRef.current = Date.now();
      setIsRecording(true);

      // 핸즈프리(음성 대화) 모드에서만 무음 자동 종료 가동 — push-to-talk는 기존 동작 유지
      if (autoSubmitOnSilence) startVad(stream);

      if (recognitionCtor) {
        try {
          const recognition = new recognitionCtor();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = language || window.navigator.language || "ko-KR";
          recognition.onresult = (event) => {
            let nextFinal = "";
            let nextInterim = "";

            for (let i = 0; i < event.results.length; i += 1) {
              const result = event.results[i];
              let chunk = "";

              for (let j = 0; j < result.length; j += 1) {
                const transcript = String(result[j]?.transcript || "").trim();
                if (!transcript) continue;
                chunk = chunk ? `${chunk} ${transcript}` : transcript;
              }

              if (!chunk) continue;
              if (result.isFinal) nextFinal = nextFinal ? `${nextFinal} ${chunk}` : chunk;
              else nextInterim = nextInterim ? `${nextInterim} ${chunk}` : chunk;
            }

            setInterimTranscript([nextFinal, nextInterim].filter(Boolean).join(" ").trim());
          };
          recognition.onerror = (event) => {
            const recognitionError = String(event?.error || "").trim();
            if (!recognitionError || recognitionError === "aborted" || recognitionError === "no-speech") return;
            logger.warn("[useVoiceInput] interim transcript 비활성 오류:", recognitionError);
          };
          recognition.onend = () => {
            recognitionRef.current = null;
          };
          recognition.start();
          recognitionRef.current = recognition;
        } catch (error) {
          logger.warn("[useVoiceInput] 브라우저 interim transcript 시작 실패:", error);
        }
      }
    } catch (error: unknown) {
      cleanupStream();
      cleanupRecorder();
      setIsRecording(false);

      const errLike = toErrorLike(error);
      const errorName = typeof errLike.name === "string" ? errLike.name.trim() : "";
      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        setPermissionState("denied");
        setErrorCode("MIC_PERMISSION_DENIED");
        return;
      }

      if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
        setPermissionState("idle");
        setErrorCode("MIC_NOT_FOUND");
        return;
      }

      logger.error("[useVoiceInput] 마이크 시작 실패:", error);
      setPermissionState("idle");
      setErrorCode("TRANSCRIBE_FAILED");
    }
  }, [
    baseInput,
    enabled,
    language,
    autoSubmitOnSilence,
    cleanupRecorder,
    cleanupStream,
    isBrowserRecordingSupported,
    isRecording,
    isSubmitting,
    recognitionCtor,
    resetVoiceState,
    startVad,
  ]);

  const cancelRecording = useCallback(() => {
    stopVad();
    stopRecognition("abort");

    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch {}

    cleanupStream();
    cleanupRecorder();
    setIsRecording(false);
    setIsSubmitting(false);
    setInterimTranscript("");
  }, [cleanupRecorder, cleanupStream, stopRecognition, stopVad]);

  // enabled flag가 false로 전환되면 진행 중 녹음을 취소 — cancelRecording 내부 setState는 정당한 cleanup.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (enabled) return;
    if (!isRecording && !isSubmitting) return;
    cancelRecording();
  }, [enabled, cancelRecording, isRecording, isSubmitting]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return () => {
      cancelRecording();
    };
  }, [cancelRecording]);

  const displayInput = useMemo(() => {
    if (!isRecording && !isSubmitting) return baseInput;
    return clampVoiceChatInput(mergeVoiceChatInput(baseInputSnapshot, interimTranscript), maxChars);
  }, [baseInput, maxChars, interimTranscript, isRecording, isSubmitting, baseInputSnapshot]);

  const resolvedMicrophoneAvailability: MicrophoneAvailability = isBrowserRecordingSupported
    ? microphoneAvailability
    : "unsupported";

  return {
    isSupported: isBrowserRecordingSupported,
    microphoneAvailability: resolvedMicrophoneAvailability,
    canUseInterimTranscript,
    isRecording,
    isSubmitting,
    permissionState,
    errorCode,
    errorMessage: resolveVoiceErrorMessage(errorCode),
    displayInput,
    startRecording,
    stopRecording: stopAndTranscribe,
  };
}
