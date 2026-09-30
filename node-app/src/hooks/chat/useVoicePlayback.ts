"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChatMessage, IMessageAudioMeta, RouteHintType } from "types/ai";
import { lang } from "components/module/i18n";
import { requestSpeechSynthesis } from "libs/api/ai";
import { getTutorsAssistantTtsJob, requestTutorsAssistantTtsJob } from "libs/api/ai/speechClient";
import {
  canStartPlayback,
  commandForInterruption,
  commandForLifecycleState,
  isDuplicateProviderRequest,
  isNativeBridgeAvailable,
  mustStopOnDispose,
  requestIdentity,
  resolveSignedUrlAction,
  subscribeAmuNativeAppLifecycle,
} from "utils/native";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose assistant TTS 재생 훅
 * @process 메시지 기준 synthesize dedupe  오디오 재생/정지  상태 조회  자동 재생
 * @domain chat-voice
 * @scope client
 */

export type VoicePlaybackStatus = "idle" | "loading" | "ready" | "playing" | "failed";

export type VoicePlaybackViewState = {
  available: boolean;
  status: VoicePlaybackStatus;
  errorMessage: string | null;
  deferText: boolean;
};

type VoicePlaybackMessageState = {
  status: VoicePlaybackStatus;
  errorMessage?: string | null;
};

type UseVoicePlaybackArgs = {
  enabled: boolean;
  autoplay: boolean;
  syncDisplay: boolean;
  routeHint: RouteHintType;
  universeId?: string;
  npcId?: string;
  sessionId?: string;
  speed?: number;
  messages: IChatMessage[];
  onAudioMetaResolved?: (message: IChatMessage, audioMeta: IMessageAudioMeta) => Promise<void> | void;
};

function isPlayableAssistantMessage(message?: IChatMessage | null) {
  if (!message || message.isUser) return false;
  if (!String(message.clientId || message.id || "").trim()) return false;
  if (String(message.id || "").startsWith("error-")) return false;
  return Boolean(String(message.text || "").trim());
}

function resolvePlaybackErrorMessage() {
  return lang({
    ko: "음성 재생에 실패했습니다. 다시 시도해 주세요.",
    en: "Voice playback failed. Please try again.",
  });
}

const TUTORS_TTS_POLL_INTERVAL_MS = 1500;
const TUTORS_TTS_POLL_MAX_ATTEMPTS = 30;

/** H4: 메시지에 이미 연결된 재생 가능한 asset URL(예: public R2)을 찾는다. 없으면 빈 문자열. */
function resolvePersistedPlaybackUrl(message: IChatMessage): string {
  const storage = (message?.audioMeta?.storage || {}) as Record<string, unknown>;
  const url = String(storage.url || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

/** EL-702: 오프라인이면 새 provider 요청을 열지 않고 text-only로 수렴한다. */
function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

type PlaybackAttempt = { identity: string; status: "inflight" | "succeeded" | "failed" };

/**
 * EL-602 Tutors Assistant TTS job을 생성하고 ready asset까지 polling한다.
 * 클라이언트는 text/provider/model/uid/audioMeta를 저장하지 않는다.
 */
async function requestTutorsAssistantTtsAudio(args: {
  npcId: string;
  sessionId?: string;
  assistantClientId: string;
  speed?: number;
  autoplay: boolean;
}): Promise<{ audioUrl: string; audioMeta?: IMessageAudioMeta }> {
  const created = await requestTutorsAssistantTtsJob({
    personaId: args.npcId,
    sessionId: String(args.sessionId || ""),
    assistantClientId: args.assistantClientId,
    mode: args.autoplay ? "autoplay" : "playback",
    speed: args.speed,
  });
  const immediateUrl = String(created?.audioUrl || "").trim();
  if (immediateUrl) return { audioUrl: immediateUrl, audioMeta: created?.audioMeta };

  const jobId = String(created?.jobId || "").trim();
  if (!jobId) throw new Error("TUTORS_ASSISTANT_TTS_JOB_MISSING");

  for (let attempt = 0; attempt < TUTORS_TTS_POLL_MAX_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, TUTORS_TTS_POLL_INTERVAL_MS));
    const job = await getTutorsAssistantTtsJob(jobId);
    const audioUrl = String(job?.audioUrl || "").trim();
    if (job?.status === "succeeded" && audioUrl) return { audioUrl, audioMeta: job.audioMeta };
    if (job?.status === "failed" || job?.status === "cancelled" || job?.status === "unknown_outcome") {
      throw new Error(job?.errorCode || "TUTORS_ASSISTANT_TTS_FAILED");
    }
  }
  throw new Error("TUTORS_ASSISTANT_TTS_TIMEOUT");
}

function getMessageId(message?: IChatMessage | null) {
  return String(message?.id || message?.clientId || "").trim();
}

function getSynthesisCacheKey(messageId: string, speed?: number) {
  const normalizedSpeed = typeof speed === "number" && Number.isFinite(speed) ? speed.toFixed(2) : "default";
  return `${messageId}:${normalizedSpeed}`;
}

function isFreshAutoplayCandidate(args: {
  message: IChatMessage | null;
  previousMessage: IChatMessage | null;
  sessionId?: string;
}) {
  const { message, previousMessage, sessionId } = args;
  if (!isPlayableAssistantMessage(message)) return false;
  if (getMessageId(previousMessage) === getMessageId(message)) return false;

  const messageTime = message?.timestamp ? new Date(message.timestamp).getTime() : 0;
  const ageMs = Date.now() - messageTime;
  const isFresh = Number.isFinite(messageTime) && ageMs >= 0 && ageMs < 15_000;
  const isSameSession = !sessionId || !message?.sessionId || message.sessionId === sessionId;
  return isFresh && isSameSession;
}

export function useVoicePlayback(args: UseVoicePlaybackArgs) {
  const {
    enabled,
    autoplay,
    syncDisplay,
    routeHint,
    universeId,
    npcId,
    sessionId,
    speed,
    messages,
    onAudioMetaResolved,
  } = args;

  const [messageStates, setMessageStates] = useState<Record<string, VoicePlaybackMessageState>>({});
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<Record<string, string>>({});
  const inflightRef = useRef<Record<string, Promise<{ audioUrl: string; audioMeta?: IMessageAudioMeta }>>>({});
  const currentMessageIdRef = useRef<string | null>(null);
  const currentCacheKeyRef = useRef<string | null>(null);
  const prevLastMessageRef = useRef<IChatMessage | null>(null);
  const autoplayedMessageIdsRef = useRef<Set<string>>(new Set());
  const syncDisplayMessageIdsRef = useRef<Set<string>>(new Set());
  const enabledRef = useRef(enabled);
  // 브라우저 자동재생 정책: 첫 사용자 제스처 전에는 소리 있는 audio.play()가 NotAllowedError로 거부된다.
  // 제스처 발생 여부와, 제스처 전 도착해 보류된 자동재생 메시지를 추적한다.
  const hasUserGestureRef = useRef(false);
  const pendingAutoplayMessageRef = useRef<IChatMessage | null>(null);
  // EL-702: foreground가 아니면 새 재생/자동재생을 열지 않는다.
  const foregroundRef = useRef(true);
  // EL-702: 같은 요청 identity의 실패 후 자동 재호출(중복 provider 호출/과금)을 억제한다.
  const playbackAttemptRef = useRef<Map<string, PlaybackAttempt>>(new Map());

  const setMessageState = useCallback((messageId: string, next: VoicePlaybackMessageState | null) => {
    setMessageStates((prev) => {
      if (!next) {
        if (!prev[messageId]) return prev;
        const cloned = { ...prev };
        delete cloned[messageId];
        return cloned;
      }
      return {
        ...prev,
        [messageId]: next,
      };
    });
  }, []);

  const stopPlayback = useCallback(() => {
    const audio = audioElementRef.current;
    const currentId = currentMessageIdRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    if (currentId) {
      const currentCacheKey = currentCacheKeyRef.current;
      const cachedAudioUrl = currentCacheKey ? audioUrlRef.current[currentCacheKey] : null;
      setMessageState(currentId, {
        status: cachedAudioUrl ? "ready" : "idle",
        errorMessage: null,
      });
    }

    currentMessageIdRef.current = null;
    currentCacheKeyRef.current = null;
  }, [setMessageState]);

  const ensureSynthesizedAudio = useCallback(
    async (message: IChatMessage) => {
      const messageId = String(message.id || message.clientId || "").trim();
      const assistantClientId = String(message.clientId || message.id || "").trim();

      if (!messageId || !assistantClientId || !npcId || !enabled) return null;

      const synthesisCacheKey = getSynthesisCacheKey(messageId, speed);
      const cachedAudioUrl = audioUrlRef.current[synthesisCacheKey];
      if (cachedAudioUrl) {
        return {
          audioUrl: cachedAudioUrl,
          audioMeta: message.audioMeta,
        };
      }

      const inflight = inflightRef.current[synthesisCacheKey];
      if (inflight) return await inflight;

      // EL-702: 오프라인이면 provider 호출 없이 text-only로 수렴한다.
      const signedUrlAction = resolveSignedUrlAction({
        hasUrl: false,
        expired: false,
        canRefresh: true,
        online: isBrowserOnline(),
      });
      if (signedUrlAction === "text_only_fallback") {
        setMessageState(messageId, {
          status: "failed",
          errorMessage: resolvePlaybackErrorMessage(),
        });
        return null;
      }

      // EL-702: 같은 요청 identity의 이전 실패는 자동 재호출하지 않는다(중복 provider 호출·과금 0).
      const playbackIdentity =
        requestIdentity({
          messageClientId: messageId,
          voiceId: message.audioMeta?.voiceId,
          speed,
          format: undefined,
          contentHash: message.audioMeta?.voiceFingerprint,
        }) ?? getSynthesisCacheKey(messageId, speed);
      const previousAttempt = playbackAttemptRef.current.get(messageId);
      if (
        previousAttempt?.status === "failed" &&
        isDuplicateProviderRequest({
          previousIdentity: previousAttempt.identity,
          nextIdentity: playbackIdentity,
        })
      ) {
        setMessageState(messageId, {
          status: "failed",
          errorMessage: resolvePlaybackErrorMessage(),
        });
        return null;
      }
      playbackAttemptRef.current.set(messageId, { identity: playbackIdentity, status: "inflight" });

      setMessageState(messageId, {
        status: "loading",
        errorMessage: null,
      });

      const request = (async () => {
        let audioUrl = "";
        let audioMeta: IMessageAudioMeta | undefined;

        if (routeHint === "tutors") {
          // Tutors는 비동기 job이 소유한다. 클라이언트는 audioMeta를 별도 저장하지 않는다.
          try {
            const tutorsAudio = await requestTutorsAssistantTtsAudio({
              npcId,
              sessionId,
              assistantClientId,
              speed,
              autoplay,
            });
            audioUrl = String(tutorsAudio.audioUrl || "").trim();
            audioMeta = tutorsAudio.audioMeta;
            if (!audioUrl) throw new Error(resolvePlaybackErrorMessage());
          } catch (error) {
            // H4: job 실패/타임아웃 시 기존 message.audioMeta의 재생 가능한 asset으로 수렴한다.
            // 재생 가능한 asset이 없으면 text-only(기존 failed 상태·안내)로 유지한다.
            const fallbackUrl = resolvePersistedPlaybackUrl(message);
            if (!fallbackUrl) throw error;
            audioUrl = fallbackUrl;
            audioMeta = message.audioMeta;
          }
        } else {
          const response = await requestSpeechSynthesis({
            routeHint,
            universeId,
            npcId,
            sessionId,
            assistantClientId,
            text: message.text,
            speed,
          });
          audioUrl = String(response?.audioUrl || "").trim();
          if (!audioUrl) throw new Error(resolvePlaybackErrorMessage());
          audioMeta = (response?.meta?.audioMeta as IMessageAudioMeta | undefined) || message.audioMeta;
          if (audioMeta && onAudioMetaResolved) {
            await onAudioMetaResolved(message, audioMeta);
          }
        }

        audioUrlRef.current[synthesisCacheKey] = audioUrl;
        playbackAttemptRef.current.set(messageId, { identity: playbackIdentity, status: "succeeded" });
        setMessageState(messageId, {
          status: "ready",
          errorMessage: null,
        });
        return { audioUrl, audioMeta };
      })()
        .catch((error) => {
          playbackAttemptRef.current.set(messageId, { identity: playbackIdentity, status: "failed" });
          logger.error("[useVoicePlayback] synthesize 실패:", error);
          setMessageState(messageId, {
            status: "failed",
            errorMessage: resolvePlaybackErrorMessage(),
          });
          throw error;
        })
        .finally(() => {
          delete inflightRef.current[synthesisCacheKey];
        });

      inflightRef.current[synthesisCacheKey] = request;
      return await request;
    },
    [autoplay, enabled, npcId, onAudioMetaResolved, routeHint, sessionId, speed, universeId, setMessageState],
  );

  const playMessage = useCallback(
    async (message: IChatMessage) => {
      if (!isPlayableAssistantMessage(message) || !enabled) return;
      // EL-702: background에서는 새 재생을 열지 않는다.
      if (!foregroundRef.current) return;

      const messageId = String(message.id || message.clientId || "").trim();
      if (!messageId) return;

      if (currentMessageIdRef.current === messageId) {
        stopPlayback();
        return;
      }

      try {
        const synthesized = await ensureSynthesizedAudio(message);
        const audioUrl = String(synthesized?.audioUrl || "").trim();
        if (!audioUrl || !enabledRef.current) return;

        stopPlayback();

        const audio = audioElementRef.current || new Audio();
        audioElementRef.current = audio;
        currentMessageIdRef.current = messageId;
        currentCacheKeyRef.current = getSynthesisCacheKey(messageId, speed);

        // addEventListener 사용 — property assignment(`audio.onX = ...`)는 ref mutation으로 lint가 오인하므로 회피.
        // 이전 등록 핸들러는 stopPlayback 진행으로 currentTime=0, pause 처리됨. 새 audio src 변경 후의 이벤트만 수신.
        const handleEnded = () => {
          currentMessageIdRef.current = null;
          currentCacheKeyRef.current = null;
          setMessageState(messageId, {
            status: "ready",
            errorMessage: null,
          });
          audio.removeEventListener("ended", handleEnded);
          audio.removeEventListener("error", handleError);
        };
        const handleError = () => {
          currentMessageIdRef.current = null;
          currentCacheKeyRef.current = null;
          setMessageState(messageId, {
            status: "failed",
            errorMessage: resolvePlaybackErrorMessage(),
          });
          audio.removeEventListener("ended", handleEnded);
          audio.removeEventListener("error", handleError);
        };
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);

        // DOM HTMLAudioElement 속성 할당(정상적 ref.current 사용) — lint immutability 규칙은 지나치게 보수적이므로 의도적 disable.
        audio.pause();
        /* eslint-disable react-hooks/immutability */
        audio.src = audioUrl;
        audio.currentTime = 0;
        /* eslint-enable react-hooks/immutability */
        await audio.play();

        setMessageState(messageId, {
          status: "playing",
          errorMessage: null,
        });
      } catch (error) {
        // 첫 사용자 제스처 전 자동재생은 브라우저 정책상 NotAllowedError로 거부된다.
        // 이때는 실패로 두지 않고 보류했다가 첫 제스처에서 재생한다(웹 한정, 네이티브 WebView는 거부되지 않음).
        if ((error as { name?: string })?.name === "NotAllowedError" && !hasUserGestureRef.current) {
          pendingAutoplayMessageRef.current = message;
          return;
        }
        logger.error("[useVoicePlayback] play 실패:", error);
      }
    },
    [enabled, ensureSynthesizedAudio, setMessageState, speed, stopPlayback],
  );

  const togglePlayback = useCallback(
    async (message: IChatMessage) => {
      await playMessage(message);
    },
    [playMessage],
  );

  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) return;
    stopPlayback();
  }, [enabled, stopPlayback]);

  // 첫 사용자 제스처를 1회 수신해 오디오 자동재생을 unlock 하고,
  // 제스처 전에 도착해 보류된 자동재생 메시지가 있으면 즉시 재생한다.
  // (웹 브라우저 전용 보정 — 네이티브 WebView는 setMediaPlaybackRequiresUserGesture(false)로 정책 자체를 우회한다.)
  useEffect(function unlockAutoplayOnFirstGesture() {
    if (!enabled || hasUserGestureRef.current) return;

    const gestureEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    const listenerOptions: AddEventListenerOptions = { passive: true };
    const detach = () => {
      gestureEvents.forEach((eventName) => window.removeEventListener(eventName, handleFirstGesture, listenerOptions));
    };
    const handleFirstGesture = () => {
      if (hasUserGestureRef.current) return;
      hasUserGestureRef.current = true;
      detach();
      const pending = pendingAutoplayMessageRef.current;
      pendingAutoplayMessageRef.current = null;
      if (pending) void playMessage(pending);
    };

    gestureEvents.forEach((eventName) => window.addEventListener(eventName, handleFirstGesture, listenerOptions));
    return detach;
  }, [enabled, playMessage]);

  useEffect(() => {
    return () => {
      if (mustStopOnDispose()) stopPlayback();
      const audio = audioElementRef.current;
      if (audio) {
        audio.src = "";
      }
    };
  }, [stopPlayback]);

  // EL-702: native lifecycle + 브라우저 visibility를 재생 명령으로 변환해 재생을 중단/재개한다.
  useEffect(() => {
    const applyCommand = (command: string) => {
      if (command === "resume") {
        foregroundRef.current = true;
        return;
      }
      if (command === "suspend" || command === "stop") {
        foregroundRef.current = false;
        stopPlayback();
      }
    };

    const unsubscribeNative = subscribeAmuNativeAppLifecycle((detail) => {
      applyCommand(detail.command || commandForLifecycleState(detail.state));
    });

    const onVisibilityChange = () => {
      const visible = typeof document !== "undefined" && document.visibilityState === "visible";
      applyCommand(visible ? commandForLifecycleState("resumed") : commandForInterruption("background"));
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      unsubscribeNative();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [stopPlayback]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1] || null;
    const prevLastMessage = prevLastMessageRef.current;
    prevLastMessageRef.current = lastMessage;

    if (!enabled || !autoplay) return;
    if (!isFreshAutoplayCandidate({ message: lastMessage, previousMessage: prevLastMessage, sessionId })) return;

    const messageId = getMessageId(lastMessage);
    if (!messageId || autoplayedMessageIdsRef.current.has(messageId)) return;

    autoplayedMessageIdsRef.current.add(messageId);
    if (syncDisplay) syncDisplayMessageIdsRef.current.add(messageId);
    if (!foregroundRef.current) return;
    // EL-702: gesture + foreground 조건을 만족할 때만 자동재생한다. gesture가 아직 없으면
    // (웹) 첫 제스처에서 재생하도록 보류한다. 네이티브 WebView는 제스처 요구가 꺼져 있다.
    const gestureReady = hasUserGestureRef.current || isNativeBridgeAvailable();
    if (!canStartPlayback({ hasUserGesture: gestureReady, isForeground: foregroundRef.current, isWebReady: true })) {
      pendingAutoplayMessageRef.current = lastMessage;
      return;
    }
    void playMessage(lastMessage);
  }, [autoplay, enabled, messages, playMessage, sessionId, syncDisplay]);

  const getMessagePlaybackState = useCallback(
    (message: IChatMessage): VoicePlaybackViewState => {
      const messageId = getMessageId(message);
      const localState = messageStates[messageId];
      const fallbackStatus = message.audioMeta?.status === "ready" ? "ready" : message.audioMeta?.status === "failed" ? "failed" : "idle";
      const status = (localState?.status || fallbackStatus) as VoicePlaybackStatus;
      const latestMessage = messages[messages.length - 1] || null;
      const isAwaitingAutoplayEffect =
        getMessageId(latestMessage) === messageId &&
        !autoplayedMessageIdsRef.current.has(messageId) &&
        isFreshAutoplayCandidate({
          message: latestMessage,
          previousMessage: prevLastMessageRef.current,
          sessionId,
        });
      const isSynchronizedMessage =
        syncDisplayMessageIdsRef.current.has(messageId) || isAwaitingAutoplayEffect;

      return {
        available: enabled && isPlayableAssistantMessage(message),
        status,
        errorMessage: localState?.errorMessage || null,
        deferText:
          enabled &&
          autoplay &&
          syncDisplay &&
          isSynchronizedMessage &&
          (status === "idle" || status === "loading"),
      };
    },
    [autoplay, enabled, messageStates, messages, sessionId, syncDisplay],
  );

  return useMemo(
    () => ({
      getMessagePlaybackState,
      togglePlayback,
      stopPlayback,
    }),
    [getMessagePlaybackState, stopPlayback, togglePlayback],
  );
}
