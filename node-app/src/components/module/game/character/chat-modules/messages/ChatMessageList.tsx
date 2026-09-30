"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { IExtendedNpcData } from "types/game";
import type { IChatMessage, IPersonaSprite } from "types/ai";
import type { ICommerceProduct } from "types/commerce";
import { cn } from "utils/common";
import StartConversationGuide from "../views/StartConversationGuide";
import { ProductList } from "components/module/commerce";
import { ChatMessageBubble } from "./ChatMessageBubble";
import type { VoicePlaybackViewState } from "hooks/chat";

type ChatMessageListProps = {
  character: IExtendedNpcData;

  viewMode: "talk" | "visual";
  isInitialized: boolean;
  isPreparingConversation: boolean;
  autoAiResponse: boolean;
  hasUserMessages: boolean;

  // 번역 기능 ON 여부 (말풍선 번역 토글 버튼 노출)
  translationEnabled: boolean;

  messages: IChatMessage[];
  filteredMessages: IChatMessage[];

  productInlinePrompt: Record<string, string>;
  productSourceMessageId: string | null;

  isUserMessageAnimating: boolean;
  onUserMessageAnimationComplete: () => void | Promise<void>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;

  renderTalkContent: (text: string) => React.ReactNode;

  // refs
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  bottomAnchorRef: React.RefObject<HTMLDivElement | null>;

  // assets
  npcSprite: IPersonaSprite | null;
  npcPortraitSrc: string | null;

  // commerce injection
  commerce: {
    enabled: boolean;
    universeId: string;
    resolvedProducts: ICommerceProduct[];
    onProductClick: (p: ICommerceProduct) => void;
  };
  voicePlayback: {
    enabled: boolean;
    getMessagePlaybackState: (message: IChatMessage) => VoicePlaybackViewState;
    onTogglePlayback: (message: IChatMessage) => void | Promise<void>;
  };
  imageAttachment?: {
    enabled: boolean;
    onRequestImage: () => void;
  };
};

export function ChatMessageList({
  character,
  viewMode,
  isInitialized,
  isPreparingConversation,
  autoAiResponse,
  hasUserMessages,
  translationEnabled,
  messages,
  filteredMessages,
  productInlinePrompt,
  productSourceMessageId,
  isUserMessageAnimating,
  onUserMessageAnimationComplete,
  scrollToBottom,
  renderTalkContent,
  messagesContainerRef,
  bottomAnchorRef,
  npcSprite,
  npcPortraitSrc,
  commerce,
  voicePlayback,
  imageAttachment,
}: ChatMessageListProps) {
  const { enabled: isCommerceUniverse, universeId: commerceUniverseId, resolvedProducts, onProductClick } = commerce;

  return (
    <div
      ref={messagesContainerRef}
      className={cn(
        "character-chat-messages min-h-0 flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative scrollbar-ghost",
        viewMode === "visual" && "justify-end",
      )}
    >
      <AnimatePresence key={viewMode} initial={viewMode !== "talk"} mode="sync">
        {filteredMessages.map((message, i) => {
          const isLast = i === filteredMessages.length - 1;
          const playbackState = voicePlayback.getMessagePlaybackState(message);

          const shouldShowProducts =
            isCommerceUniverse &&
            commerceUniverseId &&
            resolvedProducts.length > 0 &&
            !message.isUser &&
            !playbackState.deferText &&
            message.id === productSourceMessageId;

          const showInlinePrompt =
            viewMode === "visual" &&
            !message.isUser &&
            !playbackState.deferText &&
            productSourceMessageId === message.id &&
            Boolean(productInlinePrompt?.[message.id]);

          return (
            <React.Fragment key={message.id}>
              {shouldShowProducts && (
                <div className="recommend-product-grid">
                  <ProductList products={resolvedProducts} onProductClick={onProductClick} />
                </div>
              )}

              <ChatMessageBubble
                message={message}
                viewMode={viewMode}
                isLast={isLast}
                characterName={character.name || ""}
                npcSprite={npcSprite}
                npcPortraitSrc={npcPortraitSrc}
                translationEnabled={translationEnabled}
                isInitialized={isInitialized}
                autoAiResponse={autoAiResponse}
                hasUserMessages={hasUserMessages}
                inlinePrompt={productInlinePrompt?.[message.id]}
                showInlinePrompt={showInlinePrompt}
                isUserMessageAnimating={isUserMessageAnimating}
                onUserMessageAnimationComplete={onUserMessageAnimationComplete}
                scrollToBottom={scrollToBottom}
                renderTalkContent={renderTalkContent}
                playbackState={playbackState}
                onTogglePlayback={voicePlayback.onTogglePlayback}
                imageAttachmentEnabled={imageAttachment?.enabled}
                onRequestImage={imageAttachment?.onRequestImage}
              />
            </React.Fragment>
          );
        })}
      </AnimatePresence>

      {isPreparingConversation && messages.length === 0 && (
        <motion.div
          key="conversation-preparing"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="message relative max-w-[80%] self-start"
        >
          <div
            className={cn(
              "chat-message-list-preloader relative rounded-[1.15rem] rounded-tl-none z-20",
              viewMode === "visual" &&
                "bg-background/90 shadow-[0_1px_3px_rgba(0,0,0,0.35)] min-w-[8rem] max-h-[calc(100vh-31rem)] overflow-y-auto text-xl p-4",
            )}
          >
            <div role="status" aria-live="polite" className="flex items-center justify-center min-h-7 gap-1 break-keep">
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
          </div>
        </motion.div>
      )}

      {viewMode === "visual" &&
        !isPreparingConversation &&
        !autoAiResponse &&
        !hasUserMessages &&
        messages.length === 0 && <StartConversationGuide character={character} portraitSrc={npcPortraitSrc} />}

      <div ref={bottomAnchorRef} />
    </div>
  );
}
