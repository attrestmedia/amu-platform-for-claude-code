"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, BookOpen, ImagePlus, Keyboard, Mic, Square, X } from "lucide-react";
import type { ChatImagePreviewType, IPersonaSprite, SpeechProviderType } from "types/ai";
import { Button } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import { ELEVENLABS_STT_DISCLOSURE } from "consts/legal/elevenlabsSttDisclosure";
import { ACCOUNT_POLICY_LINKS } from "consts/legal/accountPolicy";
import {
  isQwenPrivacyPolicyReleaseReady,
  VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
  VOICE_DATA_CONSENT_NOTICE,
  VOICE_DATA_CONSENT_PURPOSE_ID,
  VOICE_DATA_CONSENT_VERSION,
} from "consts/legal/voiceDataConsent";
import { cn } from "utils/common";
import { CharacterSpriteAvatar } from "../CharacterSpriteAvatar";
import { ConversationHintBar } from "./ConversationHintBar";
import { VoiceInputUnavailableNotice } from "./VoiceInputUnavailableNotice";

type ChatInputBarProps = {
  // auth/state
  isLoggedIn: boolean;
  isCommerceUniverse: boolean;
  hasUserMessages: boolean;
  hasKnowledgeContext: boolean;

  // translation UI
  isTranslating: boolean;

  // input
  currentInput: string;
  displayInput?: string;
  limitMsgLength: number;
  remainingChars: number;
  isOverLimit: boolean;
  isSendDisabled: boolean;
  isPreparingConversation: boolean;
  showAIEndRequest: boolean;
  isRestricted: boolean;
  voice: {
    provider: SpeechProviderType | "qwen";
    tutorsExperience: boolean;
    enabled: boolean;
    isSupported: boolean;
    canUseInterimTranscript: boolean;
    isRecording: boolean;
    isSubmitting: boolean;
    permissionState: "idle" | "prompt" | "granted" | "denied";
    errorMessage: string | null;
    inputMode: "voice" | "text";
    onChangeInputMode: (mode: "voice" | "text") => void;
    onToggleInputMode: () => void;
    onPressStart: () => void | Promise<void>;
    onPressEnd: () => void | Promise<void>;
    onToggle?: () => void | Promise<void>;
    unavailableNotice?: {
      supportedLanguages: readonly string[];
    };
    disclosure?: {
      required: boolean;
      version: string;
      notice: string;
      acknowledged: boolean;
      onAcknowledge: () => void;
      onDecline: () => void;
    };
  };
  conversationHints?: {
    hints: string[];
    isLoading?: boolean;
    onPick: (hint: string) => void;
    onRegenerate?: () => void;
  };

  // refs/handlers
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onClearKnowledgeContext: () => void;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void | Promise<void>;
  imageAttachment?: {
    enabled: boolean;
    disabled: boolean;
    preview: ChatImagePreviewType | null;
    preparing: boolean;
    onOpenPicker: () => void;
    onClear: () => void;
  };

  // user portrait toggle
  userSprite: IPersonaSprite | null;
  userPortraitSrc: string | null;
  userCharacterName: string;
  showUserCharacter: boolean;
  setShowUserCharacter: (v: boolean) => void;
};

export function ChatInputBar(props: ChatInputBarProps) {
  const qwenPolicyReleaseReady = isQwenPrivacyPolicyReleaseReady(VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION);
  return (
    <ChatInputBarContent
      key={`${props.voice.provider}:${qwenPolicyReleaseReady ? "ready" : "blocked"}`}
      {...props}
    />
  );
}

function ChatInputBarContent({
  isLoggedIn,
  isCommerceUniverse,
  hasUserMessages,
  hasKnowledgeContext,
  isTranslating,
  currentInput,
  displayInput,
  limitMsgLength,
  remainingChars,
  isOverLimit,
  isSendDisabled,
  isPreparingConversation,
  showAIEndRequest,
  isRestricted,
  voice,
  conversationHints,
  chatInputRef,
  onClearKnowledgeContext,
  onChange,
  onKeyDown,
  onSend,
  imageAttachment,
  userSprite,
  userPortraitSrc,
  userCharacterName,
  showUserCharacter,
  setShowUserCharacter,
}: ChatInputBarProps) {
  const resolvedInput = displayInput ?? currentInput;
  const suppressVoiceClickRef = React.useRef(false);
  const voiceHoldActiveRef = React.useRef(false);
  const isQwenAsrProvider = voice.provider === "qwen";
  const qwenPolicyReleaseReady = isQwenPrivacyPolicyReleaseReady(VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION);
  const [purposeConsentState, setPurposeConsentState] = React.useState<"loading" | "required" | "granted" | "error">("loading");
  const purposeConsentDisplayState = !isQwenAsrProvider
    ? "inactive"
    : !qwenPolicyReleaseReady
      ? "unavailable"
      : purposeConsentState;
  const [purposeConsentBusy, setPurposeConsentBusy] = React.useState(false);
  const [purposeConsentError, setPurposeConsentError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isQwenAsrProvider || !qwenPolicyReleaseReady) return;

    let active = true;
    void fetch(`/api/account/voice-data-consent?purposeId=${VOICE_DATA_CONSENT_PURPOSE_ID}`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        const consent = (payload as { consent?: { granted?: boolean } }).consent;
        if (!response.ok || (payload as { ok?: boolean }).ok !== true || typeof consent?.granted !== "boolean") {
          throw new Error("VOICE_DATA_CONSENT_STATUS_UNAVAILABLE");
        }
        if (active) setPurposeConsentState(consent.granted ? "granted" : "required");
      })
      .catch(() => {
        if (active) {
          setPurposeConsentState("error");
          setPurposeConsentError(lang({ ko: "음성 동의 상태를 확인하지 못했습니다. 음성 입력을 사용할 수 없습니다.", en: "Could not check voice consent. Voice input is unavailable." }));
        }
      });

    return () => {
      active = false;
    };
  }, [isQwenAsrProvider, qwenPolicyReleaseReady]);

  const updatePurposeConsent = async (action: "agree" | "revoke") => {
    if (action === "revoke" && (voice.isRecording || voice.isSubmitting)) return;
    setPurposeConsentBusy(true);
    setPurposeConsentError(null);
    if (action === "revoke") {
      setPurposeConsentState("required");
      voice.onChangeInputMode("text");
    }
    try {
      const response = await fetch(`/api/account/voice-data-consent?purposeId=${VOICE_DATA_CONSENT_PURPOSE_ID}`, {
        method: action === "agree" ? "POST" : "DELETE",
        credentials: "same-origin",
        headers: action === "agree" ? { "Content-Type": "application/json" } : undefined,
        body: action === "agree" ? JSON.stringify({ purposeId: VOICE_DATA_CONSENT_PURPOSE_ID, agreed: true }) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      const consent = (payload as { consent?: { granted?: boolean } }).consent;
      if (!response.ok || (payload as { ok?: boolean }).ok !== true || typeof consent?.granted !== "boolean") {
        throw new Error("VOICE_DATA_CONSENT_UPDATE_FAILED");
      }
      setPurposeConsentState(consent.granted ? "granted" : "required");
    } catch {
      setPurposeConsentError(
        lang({ ko: "동의 상태를 저장하지 못했습니다. 음성 입력은 계속 차단됩니다.", en: "Could not save consent. Voice input remains blocked." }),
      );
      setPurposeConsentState(action === "agree" ? "required" : "error");
    } finally {
      setPurposeConsentBusy(false);
    }
  };

  // 음성 사용 가능 = 유니버스 음성 기능 on(voice.enabled) + 브라우저 녹음 지원(voice.isSupported)
  // 둘 중 하나라도 불가하면 키보드/마이크 토글 없이 순수 텍스트 입력만 노출 (요청 3)
  const voiceAvailable = voice.enabled && voice.isSupported;

  // 입력 모드: voice(자판 비노출 음성 대화) / text(직접 타이핑) — 상태는 상위(CharacterChat)가 보유
  const inputMode = voice.inputMode;
  // 음성 사용 불가 환경이면 inputMode 값과 무관하게 항상 text 모드로 파생 — 기존 동작 보존
  const isVoiceMode = voiceAvailable && inputMode === "voice";
  const isTutorVoiceMode = voice.tutorsExperience && isVoiceMode;
  const isDisclosureBlocking = Boolean(
    isTutorVoiceMode && voice.disclosure?.required && !voice.disclosure.acknowledged,
  );
  const isPurposeConsentBlocking =
    isQwenAsrProvider && (purposeConsentDisplayState !== "granted" || purposeConsentBusy);

  const trimmed = resolvedInput.trim();
  const hasImage = Boolean(imageAttachment?.preview);
  const hasUserVisual = Boolean(userSprite?.url || userPortraitSrc);
  const progressPct =
    limitMsgLength > 0 ? Math.min(100, Math.max(0, (resolvedInput.length / limitMsgLength) * 100)) : 0;
  const isConversationHintDisabled = isPreparingConversation || isRestricted || voice.isSubmitting;
  const isVoiceControlDisabled =
    (!isLoggedIn && !isCommerceUniverse) || isPreparingConversation || isRestricted || voice.isSubmitting || isDisclosureBlocking || isPurposeConsentBlocking;

  const placeholder =
    !isLoggedIn && !isCommerceUniverse
      ? lang({ ko: "로그인이 필요해요.", en: "Please sign in." })
      : isPreparingConversation
        ? lang({ ko: "대화를 준비 중이에요", en: "Getting ready to chat..." })
        : voice.isSubmitting
          ? // 음성 분석 중 표시 메세지
            lang({ ko: "대화 내용에 대해 생각하고 있어요.", en: "Thinking about what you said..." })
          : voice.isRecording
            ? // 녹음 대기 중 표시 메세지
              lang({ ko: "편하게 이야기해 주세요.", en: "Feel free to speak." })
            : !hasUserMessages
              ? lang({ ko: "대화를 시작해보세요.", en: "Start a conversation." })
              : lang({ ko: "대화를 입력하세요.", en: "Type a message." });

  const voiceStatus = voice.errorMessage
    ? voice.errorMessage
    : voice.isSubmitting
      ? lang({ ko: "음성과 발음을 분석하고 있어요.", en: "Analyzing your speech and pronunciation." })
      : voice.permissionState === "prompt"
        ? lang({ ko: "마이크 권한을 확인해 주세요.", en: "Allow microphone access to continue." })
        : resolvedInput
          ? resolvedInput
          : voice.isRecording
            ? lang({ ko: "듣고 있어요. 편하게 말해 주세요.", en: "Listening. Speak naturally." })
            : null;

  const handleVoicePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "touch") return;
    if (!voice.enabled || !voice.isSupported || voice.isSubmitting || isDisclosureBlocking || isPurposeConsentBlocking) return;
    e.preventDefault();
    voiceHoldActiveRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    void voice.onPressStart();
  };

  const handleVoicePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "touch") return;
    if (!voiceHoldActiveRef.current) return;
    e.preventDefault();
    voiceHoldActiveRef.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    suppressVoiceClickRef.current = true;
    void voice.onPressEnd();
  };

  const handleVoicePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "touch") return;
    if (!voiceHoldActiveRef.current) return;
    e.preventDefault();
    voiceHoldActiveRef.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    void voice.onPressEnd();
  };

  const handleVoiceClick = () => {
    if (suppressVoiceClickRef.current) {
      suppressVoiceClickRef.current = false;
      return;
    }

    if (!voice.enabled || !voice.isSupported || voice.isSubmitting || isDisclosureBlocking || isPurposeConsentBlocking) return;
    if (voice.onToggle) {
      void voice.onToggle();
      return;
    }

    void (voice.isRecording ? voice.onPressEnd() : voice.onPressStart());
  };

  return (
    <div className="character-chat-input-container px-4 pt-3 pb-4">
      <div className="flex flex-col gap-1">
        {voice.unavailableNotice ? (
          <VoiceInputUnavailableNotice supportedLanguages={voice.unavailableNotice.supportedLanguages} />
        ) : null}

        {conversationHints ? (
          <ConversationHintBar
            hints={conversationHints.hints}
            isLoading={conversationHints.isLoading}
            disabled={isConversationHintDisabled}
            onPick={conversationHints.onPick}
            onRegenerate={conversationHints.onRegenerate}
          />
        ) : null}

        {/* 번역 상태 */}
        {isTranslating && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-center gap-2 text-xs text-blue-300 mb-2"
          >
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              <span className="size-2 animate-loading-dot rounded-full bg-current" />
              <span
                className="size-2 animate-loading-dot rounded-full bg-current"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="size-2 animate-loading-dot rounded-full bg-current"
                style={{ animationDelay: "300ms" }}
              />
            </span>
            <span>
              <Lang text={{ ko: "번역 중...", en: "Translating..." }} />
            </span>
          </motion.div>
        )}

        {/* 문자 제한 */}
        {!isTutorVoiceMode && (remainingChars === 0 || isOverLimit) && (
          <div className="flex items-center justify-between px-2">
            <div className={`text-xs ${isOverLimit ? "text-red-500" : "text-primary"}`}>
              {isOverLimit && (
                <span className="flex items-center">
                  {lang({
                    ko: `메시지는 최대 ${limitMsgLength}자까지 입력 가능합니다`,
                    en: `Message can be up to ${limitMsgLength} characters long`,
                  })}
                </span>
              )}
            </div>
            <div className={`text-xs ${remainingChars < 20 ? "text-red-400" : "text-primary"}`}>
              {resolvedInput.length}/{limitMsgLength}
            </div>
          </div>
        )}

        {imageAttachment?.preview ? (
          <div className="relative ml-2 mb-1 w-fit rounded-xl border border-white/15 bg-black/35 p-1">
            <ImageBox
              src={imageAttachment.preview.url}
              alt={lang({ ko: "전송할 사진 미리보기", en: "Photo preview" })}
              width={72}
              height={72}
              objectFit="object-cover"
              className="rounded-lg"
            />
            <Button
              variant="blank"
              rounded="full"
              size="icon-xs"
              className="absolute -right-2 -top-2 bg-black/80 text-white hover:bg-black"
              aria-label={lang({ ko: "사진 제거", en: "Remove photo" })}
              onClick={imageAttachment.onClear}
            >
              <X size={14} />
            </Button>
          </div>
        ) : null}

        {isTutorVoiceMode && voiceStatus ? (
          <p
            className={cn(
              "flex min-h-11 items-center justify-center px-3 text-center text-sm leading-relaxed text-white/80",
              voice.errorMessage && "font-medium text-red-200",
            )}
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="line-clamp-2 break-words">{voiceStatus}</span>
          </p>
        ) : null}

        {isDisclosureBlocking && voice.disclosure ? (
          <div
            role="group"
            aria-label={lang({ ko: "음성 전송 고지", en: "Voice transfer notice" })}
            className="rounded-2xl border border-white/15 bg-black/40 p-3 text-white"
          >
            <p className="text-sm leading-relaxed text-white/85">
              {voice.disclosure.notice || ELEVENLABS_STT_DISCLOSURE.notice}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="accent" className="min-h-11 px-4" onClick={voice.disclosure.onAcknowledge}>
                <Lang text={{ ko: "동의하고 계속", en: "Agree and continue" }} />
              </Button>
              <Button
                variant="blank"
                className="min-h-11 border border-white/15 px-4"
                onClick={voice.disclosure.onDecline}
              >
                <Lang text={{ ko: "음성 입력 사용 안 함", en: "Do not use voice input" }} />
              </Button>
            </div>
          </div>
        ) : null}

        {isQwenAsrProvider ? (
          purposeConsentDisplayState === "unavailable" ? (
            <p role="status" aria-live="polite" className="rounded-2xl border border-white/15 bg-black/40 p-3 text-sm leading-relaxed text-white/85">
              <Lang text={{ ko: "Qwen ASR 음성 입력은 개인정보처리방침 공고·시행 및 공개본 대조가 끝난 뒤 사용할 수 있습니다. 그때까지 텍스트 입력을 이용해 주세요.", en: "Qwen ASR voice input will be available after the privacy notice is published, effective, and checked against its public copy. Use text input until then." }} />
            </p>
          ) : purposeConsentDisplayState === "loading" ? (
            <p role="status" aria-live="polite" className="rounded-2xl border border-white/15 bg-black/40 p-3 text-sm text-white/75">
              <Lang text={{ ko: "음성 동의 상태를 확인하고 있어요.", en: "Checking voice consent." }} />
            </p>
          ) : purposeConsentDisplayState === "required" ? (
            <div role="group" aria-label={lang({ ko: "Qwen ASR 음성 처리 동의", en: "Qwen ASR voice processing consent" })} className="rounded-2xl border border-white/15 bg-black/40 p-3 text-white">
              <p className="text-sm font-semibold">
                <Lang text={{ ko: `음성 처리 선택 동의 v${VOICE_DATA_CONSENT_VERSION}`, en: `Optional voice processing consent v${VOICE_DATA_CONSENT_VERSION}` }} />
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/85">{VOICE_DATA_CONSENT_NOTICE}</p>
              <a className="mt-2 inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80" href={ACCOUNT_POLICY_LINKS.privacy} target="_blank" rel="noreferrer">
                <Lang text={{ ko: `개인정보처리방침 v${VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION} 보기`, en: `View privacy policy v${VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION}` }} />
              </a>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="accent" className="min-h-11 px-4" disabled={purposeConsentBusy} loading={purposeConsentBusy} onClick={() => void updatePurposeConsent("agree")}>
                  <Lang text={{ ko: "동의하고 음성 입력 사용", en: "Agree and use voice input" }} />
                </Button>
                <Button variant="blank" className="min-h-11 border border-white/15 px-4" disabled={purposeConsentBusy} onClick={() => voice.onChangeInputMode("text")}>
                  <Lang text={{ ko: "동의하지 않고 텍스트 사용", en: "Continue with text" }} />
                </Button>
              </div>
            </div>
          ) : purposeConsentDisplayState === "granted" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white/80">
              <span><Lang text={{ ko: `Qwen ASR 음성 처리에 v${VOICE_DATA_CONSENT_VERSION} 동의가 적용 중입니다.`, en: `Consent v${VOICE_DATA_CONSENT_VERSION} is active for Qwen ASR voice processing.` }} /></span>
              <Button variant="blank" className="min-h-11 border border-white/15 px-3" disabled={purposeConsentBusy || voice.isRecording || voice.isSubmitting} loading={purposeConsentBusy} onClick={() => void updatePurposeConsent("revoke")}>
                <Lang text={{ ko: "동의 철회", en: "Withdraw consent" }} />
              </Button>
            </div>
          ) : null
        ) : null}
        {purposeConsentError ? <p role="alert" className="text-sm text-red-200">{purposeConsentError}</p> : null}

        {/* 입력 필드 */}
        <div
          className={cn(
            "text-white",
            isTutorVoiceMode
              ? "flex items-center justify-center gap-8"
              : "flex items-center gap-2 rounded-full bg-black/40 p-2 shadow-[0_1px_0_rgba(255,255,255,0.1)]",
          )}
        >
          {imageAttachment?.enabled ? (
            <Button
              variant="blank"
              rounded="full"
              size="icon-lg"
              disabled={imageAttachment.disabled || imageAttachment.preparing}
              loading={imageAttachment.preparing}
              className="shrink-0 border border-white/10 bg-white/5 text-white/80"
              aria-label={lang({ ko: "사진 추가", en: "Add a photo" })}
              onClick={imageAttachment.onOpenPicker}
            >
              <ImagePlus size={18} />
            </Button>
          ) : isTutorVoiceMode ? (
            <span className="size-12" aria-hidden="true" />
          ) : null}

          {/* 지식 컨텍스트 아이콘 */}
          <AnimatePresence>
            {!isTutorVoiceMode && hasKnowledgeContext && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -10 }}
                className="flex items-center gap-2"
              >
                <div className="relative group">
                  <BookOpen
                    size={20}
                    className="text-primary cursor-pointer hover:text-primary/80 transition-colors"
                    onClick={onClearKnowledgeContext}
                  />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    <Lang text={{ ko: "지식 컨텍스트 제거하기", en: "Remove knowledge context" }} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isTutorVoiceMode ? (
            <>
              <Button
                variant="blank"
                rounded="full"
                disabled={isVoiceControlDisabled}
                className={cn(
                  "relative flex size-20 touch-manipulation items-center justify-center justify-self-center border bg-white/5 text-white/80 transition-colors hover:bg-white/10",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                  voice.isRecording
                    ? "border-red-200/70 bg-white/10 text-red-100 hover:bg-white/15"
                    : "border-white/15",
                  isVoiceControlDisabled && "cursor-not-allowed opacity-55",
                )}
                aria-label={lang({
                  ko: voice.isRecording ? "음성 녹음 종료" : "음성 녹음 시작",
                  en: voice.isRecording ? "Stop voice recording" : "Start voice recording",
                })}
                aria-pressed={voice.isRecording}
                onClick={handleVoiceClick}
                onPointerDown={handleVoicePointerDown}
                onPointerUp={handleVoicePointerUp}
                onPointerCancel={handleVoicePointerCancel}
              >
                {voice.isRecording ? (
                  <Square className="size-6 fill-current" aria-hidden="true" />
                ) : (
                  <Mic className="size-8" aria-hidden="true" />
                )}
              </Button>

              <Button
                variant="blank"
                rounded="full"
                size="icon-lg"
                className="justify-self-end border border-white/10 bg-white/5 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={lang({ ko: "키보드 입력 모드로 전환", en: "Switch to keyboard input" })}
                onClick={() => voice.onChangeInputMode("text")}
              >
                <Keyboard className="size-5" aria-hidden="true" />
              </Button>
            </>
          ) : isVoiceMode ? (
            <>
              <div
                className="flex min-h-12 min-w-0 flex-1 items-center overflow-y-auto py-3 text-lg leading-relaxed"
                aria-live="polite"
              >
                {resolvedInput ? (
                  <span className="whitespace-pre-wrap break-words">{resolvedInput}</span>
                ) : (
                  <span className="text-gray/30">{placeholder}</span>
                )}
              </div>

              {hasImage ? (
                <Button
                  variant="accent"
                  rounded="full"
                  size="icon-lg"
                  onClick={() => void onSend()}
                  disabled={isSendDisabled}
                  aria-label={lang({ ko: "사진 보내기", en: "Send photo" })}
                >
                  <Send className="icon-xs" />
                </Button>
              ) : null}

              <Button
                variant="blank"
                rounded="full"
                size="icon-lg"
                className={cn(
                  "flex-center border transition-colors",
                  voice.isRecording
                    ? "border-red-400 bg-red-500/20 text-red-200"
                    : "border-white/10 bg-white/5 text-white/80",
                  isVoiceControlDisabled && "cursor-not-allowed opacity-55",
                )}
                disabled={isVoiceControlDisabled}
                aria-label={lang({
                  ko: voice.isRecording ? "녹음 종료" : "음성 입력 시작",
                  en: voice.isRecording ? "Stop recording" : "Start voice input",
                })}
                aria-pressed={voice.isRecording}
                onClick={handleVoiceClick}
                onPointerDown={handleVoicePointerDown}
                onPointerUp={handleVoicePointerUp}
                onPointerCancel={handleVoicePointerCancel}
              >
                <Mic size={18} />
              </Button>
            </>
          ) : (
            <>
              <textarea
                ref={chatInputRef}
                value={resolvedInput}
                onChange={onChange}
                onKeyDown={onKeyDown}
                className="flex-1 bg-transparent outline-none placeholder-gray/30 text-lg resize-none py-3 min-h-[48px] max-h-[144px] overflow-y-auto"
                placeholder={placeholder}
                disabled={
                  (!isLoggedIn && !isCommerceUniverse) ||
                  isPreparingConversation ||
                  isTranslating ||
                  showAIEndRequest ||
                  isRestricted ||
                  voice.isRecording ||
                  voice.isSubmitting
                }
                rows={1}
              />

              {(!isLoggedIn && !isCommerceUniverse) || (!trimmed && !hasImage) || isOverLimit ? (
                hasUserVisual ? (
                  <CharacterSpriteAvatar
                    sprite={userSprite}
                    portraitSrc={userPortraitSrc}
                    alt={userCharacterName}
                    className="border-primary w-12 h-12 rounded-full border-[3px]"
                    imageClassName="bg-primary object-cover"
                    onClick={() => setShowUserCharacter(!showUserCharacter)}
                  />
                ) : (
                  <Button
                    variant="blank"
                    rounded="full"
                    size="icon-lg"
                    disabled={true}
                    loading={isTranslating}
                    className="border transition-colors border-white/10 bg-white/5 text-white/80 text-white/40 cursor-not-allowed"
                  >
                    <Send className="icon-xs" />
                  </Button>
                )
              ) : (
                <Button
                  variant="accent"
                  rounded="full"
                  size="icon-lg"
                  onClick={() => void onSend()}
                  disabled={isSendDisabled}
                  loading={isTranslating}
                >
                  <Send className="icon-xs" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* 진행 표시줄 */}
        {!isTutorVoiceMode ? (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray/10">
            <div
              className={`h-full transition-all duration-300 ${
                remainingChars < 20 ? "bg-red-500" : "bg-gradient-purple-cyan-tr"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
