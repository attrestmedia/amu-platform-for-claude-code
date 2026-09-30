"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { IChatMessage, IPersonaSprite } from "types/ai";
import { cn } from "utils/common";
import { Button } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import type { VoicePlaybackViewState } from "hooks/chat";
import TextMotionMessage from "../../TextMotionMessage";
import { ImagePlus, Languages, Volume2 } from "lucide-react";

const VISUAL_MESSAGE_BUBBLE_MAX_HEIGHT_CLASS =
  "max-h-[clamp(12rem,calc(var(--chat-stable-h,100dvh)-27rem),28rem)]";
const VISUAL_MESSAGE_CONTENT_SCROLL_CLASS =
  "max-h-[clamp(10rem,calc(var(--chat-stable-h,100dvh)-29rem),26rem)] overflow-y-auto overscroll-contain pr-1 scrollbar-ghost";

type ChatMessageBubbleProps = {
  message: IChatMessage;
  viewMode: "talk" | "visual";
  isLast: boolean;
  characterName: string;
  npcSprite?: IPersonaSprite | null;
  npcPortraitSrc?: string | null;

  // 번역 기능 ON 여부 (말풍선 번역 토글 버튼 노출 게이트)
  translationEnabled?: boolean;

  // render rule gates
  isInitialized: boolean;
  autoAiResponse: boolean;
  hasUserMessages: boolean;

  // visual inline prompt (commerce)
  inlinePrompt?: string;
  showInlinePrompt: boolean;

  // animation callbacks
  isUserMessageAnimating: boolean;
  onUserMessageAnimationComplete: () => void | Promise<void>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;

  // renderers
  renderTalkContent: (text: string) => React.ReactNode;

  playbackState: VoicePlaybackViewState;
  onTogglePlayback: (message: IChatMessage) => void | Promise<void>;
  imageAttachmentEnabled?: boolean;
  onRequestImage?: () => void;
};

export function ChatMessageBubble({
  message,
  viewMode,
  isLast,
  characterName,
  npcSprite,
  npcPortraitSrc,
  translationEnabled = false,
  isInitialized,
  autoAiResponse,
  hasUserMessages,
  inlinePrompt,
  showInlinePrompt,
  isUserMessageAnimating,
  onUserMessageAnimationComplete,
  scrollToBottom,
  renderTalkContent,
  playbackState,
  onTogglePlayback,
  imageAttachmentEnabled = false,
  onRequestImage,
}: ChatMessageBubbleProps) {
  const animateThis = viewMode === "talk" ? isLast : true;

  // 말풍선별 번역 표시 토글 (기본 숨김 → 버튼 클릭 시 해당 말풍선 번역을 인라인 표시)
  const [showTranslation, setShowTranslation] = useState(false);

  const showPlaybackButton = playbackState.available;
  const npcAvatar = !message.isUser
    ? {
        sprite: npcSprite,
        portraitSrc: npcPortraitSrc,
        alt: characterName,
        className: "w-10 h-10 rounded-full",
        imageClassName: "object-cover object-top",
      }
    : null;

  // 번역 토글 노출 조건: 번역 기능 ON + 해당 메시지에 번역 결과 존재 + 로딩(생각 중) 상태 아님
  const canToggleTranslation = translationEnabled && Boolean(message.translation) && !playbackState.deferText;
  const visualMessageAnimationType = playbackState.available ? "typewriter" : "subtitle";
  const visualMessageContentClass = viewMode === "visual" ? VISUAL_MESSAGE_CONTENT_SCROLL_CLASS : undefined;
  const previewWidth = message.imagePreview
    ? Math.min(280, Math.max(160, Number(message.imagePreview.width || 160)))
    : 0;
  const previewHeight = message.imagePreview
    ? Math.min(
        280,
        Math.max(
          120,
          Math.round(
            previewWidth * (Number(message.imagePreview.height || 1) / Number(message.imagePreview.width || 1)),
          ),
        ),
      )
    : 0;

  const playbackLabel =
    playbackState.status === "loading"
      ? lang({ ko: "음성 생성 중", en: "Generating voice" })
      : playbackState.status === "playing"
        ? lang({ ko: "음성 정지", en: "Stop voice" })
        : playbackState.status === "failed"
          ? lang({ ko: "음성 다시 시도", en: "Retry voice" })
          : lang({ ko: "음성 듣기", en: "Play voice" });

  useEffect(() => {
    if (
      viewMode !== "visual" ||
      !message.isUser ||
      message.text.trim() ||
      !message.imagePreview ||
      !isUserMessageAnimating
    ) {
      return;
    }
    const timer = window.setTimeout(() => void onUserMessageAnimationComplete(), 250);
    return () => window.clearTimeout(timer);
  }, [
    isUserMessageAnimating,
    message.imagePreview,
    message.isUser,
    message.text,
    onUserMessageAnimationComplete,
    viewMode,
  ]);

  if (!(isInitialized || autoAiResponse || hasUserMessages)) return null;

  return (
    <motion.div
      className={cn("message relative max-w-[80%]", message.isUser ? "self-end" : "self-start")}
      initial={animateThis ? { opacity: 0, scale: 0.8, y: 20, x: message.isUser ? 30 : -30 } : false}
      animate={
        animateThis
          ? {
              opacity: 1,
              scale: 1,
              y: 0,
              x: 0,
              transition: { type: "spring", stiffness: 260, damping: 20, mass: 0.8 },
            }
          : { opacity: 1 }
      }
      exit={animateThis ? { opacity: 0, scale: 0.9, transition: { duration: 0.15 } } : undefined}
      layout={animateThis ? true : false}
    >
      <div>
        <motion.div
          className={cn(
            "message-bubble relative break-keep leading-normal",
            viewMode === "visual" &&
              "before:absolute before:-inset-[2px] before:z-1 before:rounded-[1.25rem] before:p-[2px] before:content-['']",
            message.isUser
              ? "before:bg-gradient-purple-cyan-tr before:rounded-tr-none"
              : "before:bg-gradient-blue-cyan-tr before:rounded-tl-none",
          )}
          initial={animateThis ? { opacity: 0 } : false}
          animate={animateThis ? { opacity: 1, transition: { delay: 0.1 } } : { opacity: 1 }}
        >
          <div
            className={cn(
              "relative rounded-[1.15rem] z-20",
              viewMode === "visual" &&
                cn(
                  "bg-background/90 shadow-[0_1px_3px_rgba(0,0,0,0.35)] min-w-[8rem] overflow-hidden text-xl p-4",
                  VISUAL_MESSAGE_BUBBLE_MAX_HEIGHT_CLASS,
                ),
              viewMode === "talk" && `${message.isUser ? "bg-primary/85 text-white" : "bg-background/85"} text-lg p-4`,
              message.isUser ? "rounded-tr-none" : "rounded-tl-none",
            )}
          >
            {message.imagePreview ? (
              <ImageBox
                src={message.imagePreview.url}
                alt={lang({ ko: "사용자가 보낸 사진", en: "Photo sent by the user" })}
                width={previewWidth}
                height={previewHeight}
                objectFit="object-cover"
                className={cn("rounded-xl", message.text.trim() && "mb-3")}
              />
            ) : null}

            {playbackState.deferText ? (
              <TextMotionMessage
                text=""
                animate={false}
                messageId={`${message.id}-defer`}
                className="break-keep"
                contentClassName={visualMessageContentClass}
                avatar={npcAvatar}
                renderContent={() => (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center justify-center min-h-7 gap-1 break-keep"
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
                  </div>
                )}
              />
            ) : !message.text.trim() ? null : viewMode === "talk" ? (
              <TextMotionMessage
                text={message.text}
                animate={false}
                messageId={message.id}
                className="break-keep"
                contentClassName={visualMessageContentClass}
                avatar={npcAvatar}
                renderContent={renderTalkContent}
              />
            ) : showInlinePrompt ? (
              <TextMotionMessage
                text={inlinePrompt || ""}
                animate={false}
                messageId={`${message.id}-inline-prompt`}
                className="text-lg leading-relaxed"
                contentClassName={visualMessageContentClass}
                avatar={npcAvatar}
              />
            ) : (
              <TextMotionMessage
                text={message.text}
                messageId={message.id}
                animationType={visualMessageAnimationType}
                className="break-keep"
                contentClassName={visualMessageContentClass}
                avatar={npcAvatar}
                onComplete={() => {
                  if (message.isUser && isUserMessageAnimating) {
                    void onUserMessageAnimationComplete();
                  }
                  scrollToBottom("auto");
                }}
              />
            )}
          </div>
        </motion.div>

        {imageAttachmentEnabled &&
        !message.isUser &&
        message.systemCode?.includes("request-image") &&
        onRequestImage ? (
          <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={onRequestImage}>
            <ImagePlus size={16} />
            <Lang text={{ ko: "사진 보여주기", en: "Show a photo" }} />
          </Button>
        ) : null}

        {/* 번역 툴팁: 토글 버튼으로만 노출 → 원문 말풍선과 겹치지 않도록 흐름 내부에 배치 */}
        <AnimatePresence initial={false}>
          {canToggleTranslation && showTranslation && (
            <motion.div
              key="translation-tooltip"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className={cn("relative z-30 mt-1.5 flex", message.isUser ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "relative rounded-[0.9rem] border px-3 py-2 text-sm leading-snug break-keep shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
                  message.isUser
                    ? "rounded-tr-none border-primary/40 bg-primary/15 text-white/90"
                    : "rounded-tl-none border-white/15 bg-background/95 text-foreground/85",
                )}
              >
                <span className="mb-0.5 flex items-center gap-1 text-xxs font-medium uppercase tracking-wide opacity-60">
                  <Languages className="icon-xxs" />
                  <Lang text={{ ko: "번역", en: "Translation" }} />
                </span>
                {message.translation}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(showPlaybackButton || canToggleTranslation || (message?.timestamp && viewMode === "talk")) && (
          <div
            className={cn("mt-1 flex items-center gap-2", message.isUser ? "justify-end mr-1" : "justify-start ml-1")}
          >
            {message?.timestamp && viewMode === "talk" && (
              <div className="text-xs text-white/50">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}

            {canToggleTranslation && (
              <Button
                variant="blank"
                rounded="full"
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 text-xxs leading-none mt-2 transition-colors",
                  showTranslation ? "bg-primary/20 text-primary" : "bg-black/20 text-white/80",
                )}
                aria-pressed={showTranslation}
                onClick={() => setShowTranslation((prev) => !prev)}
              >
                <Languages className="icon-xxs" />
                {showTranslation
                  ? lang({ ko: "번역 숨기기", en: "Hide translation" })
                  : lang({ ko: "번역 보기", en: "Show translation" })}
              </Button>
            )}

            {showPlaybackButton && (
              <Button
                variant="blank"
                rounded="full"
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 text-xxs leading-none mt-2",
                  playbackState.status === "failed"
                    ? "bg-red-500/15 text-red-200"
                    : playbackState.status === "playing"
                      ? "bg-primary/20 text-primary"
                      : "bg-black/20 text-white/80",
                )}
                loading={playbackState.status === "loading"}
                onClick={() => void onTogglePlayback(message)}
              >
                <Volume2 className="icon-xxs" />
                {playbackLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
