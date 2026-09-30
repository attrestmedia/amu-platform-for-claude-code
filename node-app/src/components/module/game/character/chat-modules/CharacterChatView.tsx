"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

import type { IExtendedNpcData } from "types/game";
import type {
  IPersonaItem,
  ChatImageInputType,
  ChatImagePreviewType,
  IChatMessage,
  SystemCodeLikeType,
  AiMessageType,
  IPersonaSprite,
  IKnowledgeContextSource,
  IChatModelPolicyResult,
  PersonaImageLibraryAssetType,
  SpeechProviderType,
  TextProviderType,
} from "types/ai";
import type { ICommerceProduct } from "types/commerce";
import type { TutorConversationLevel } from "consts/tutors";
import type { VoicePlaybackViewState } from "hooks/chat";

// modules
import { MessageSquare } from "lucide-react";
import { Button, Sheet, SheetContent, SheetTitle, SheetHeader, SheetDescription } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useChatViewportLock } from "hooks/common";
import CharacterCard from "../CharacterCard";
import CharacterChatHeader from "./views/CharacterChatHeader";
import { CharacterChatControls } from "./controls/CharacterChatControls";
import { ChatBackground } from "./views/ChatBackground";
import { ChatMessageList } from "./messages/ChatMessageList";
import { ChatInputBar } from "./controls/ChatInputBar";
import { TutorImageAttachSheet } from "./controls/TutorImageAttachSheet";
import { ChatOverlays } from "./overlays/ChatOverlays";

type KnowledgeSearchPanelHandle = {
  minimize: () => void;
  maximize: () => void;
  toggle: () => void;
};

type CharacterAssetPaths = {
  portrait?: string | null;
  sprite?: IPersonaSprite | null;
} | null;

type ChatWarningStatusType = {
  warningCount: number;
  lastRestrictionTime: number | null;
  isRestricted: boolean;
} | null;

type CharacterChatViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: IExtendedNpcData;
  personaArtifacts: PersonaImageLibraryAssetType[];
  auth: { isLoggedIn: boolean };
  participants: {
    userCharacterName: string;
    npcPaths: CharacterAssetPaths;
    userPaths: CharacterAssetPaths;
    randomNpcPortraitSrc: string | null;
    randomUserPortraitSrc: string | null;
    showUserCharacter: boolean;
    setShowUserCharacter: React.Dispatch<React.SetStateAction<boolean>>;
  };

  ui: {
    chatMode: boolean;
    infoHidden: boolean;
    artifactOpen: boolean;
    panelType: "info" | "settings" | null;
    showKnowledgeSearch: boolean;
    showConversationHistory: boolean;
    showCloseConfirm: boolean;
    hasKnowledgeContext: boolean;
  };

  chat: {
    currentPersonaData: IPersonaItem | null;
    currentSystemCodes: SystemCodeLikeType[] | null;
    messages: IChatMessage[];
    conversationHistoryMessages: IChatMessage[];
    filteredMessages: IChatMessage[];
    productInlinePrompt: Record<string, string>;
    isInitialized: boolean;
    isPreparingConversation: boolean;
    autoAiResponse: boolean;
    hasUserMessages: boolean;
    lastMessageSender: AiMessageType | null;
    viewMode: "talk" | "visual";
    isUserMessageAnimating: boolean;
    aiEnd: {
      showAIEndRequest: boolean;
      aiEndRequestMessage: string;
      isForceEnd: boolean;
      warningStatus: ChatWarningStatusType;
    };
    input: {
      currentInput: string;
      displayInput?: string;
      limitMsgLength: number;
      remainingChars: number;
      isOverLimit: boolean;
      isSendDisabled: boolean;
      isRestricted: boolean;
      imageAttachment?: {
        enabled: boolean;
        disabled: boolean;
        preview: ChatImagePreviewType | null;
        preparing: boolean;
        pickerOpen: boolean;
        onPickerOpenChange: (open: boolean) => void;
        onPrepare: (file: File, source: ChatImageInputType["source"]) => void | Promise<void>;
        onClear: () => void;
      };
    };
    voice: {
      provider: SpeechProviderType | "qwen";
      tutorsExperience: boolean;
      enabled: boolean;
      isSupported: boolean;
      microphoneAvailability: "checking" | "available" | "unavailable" | "unsupported";
      canUseInterimTranscript: boolean;
      isRecording: boolean;
      isSubmitting: boolean;
      permissionState: "idle" | "prompt" | "granted" | "denied";
      errorMessage: string | null;
      inputMode: "voice" | "text";
      onChangeInputMode: (mode: "voice" | "text") => void;
      onToggleInputMode: () => void;
      disclosure?: {
        required: boolean;
        version: string;
        notice: string;
        acknowledged: boolean;
        onAcknowledge: () => void;
        onDecline: () => void;
      };
      unavailableNotice?: {
        supportedLanguages: readonly string[];
      };
    };
    voicePlayback: {
      available: boolean;
      enabled: boolean;
      getMessagePlaybackState: (message: IChatMessage) => VoicePlaybackViewState;
      onTogglePlayback: (message: IChatMessage) => void | Promise<void>;
    };
    modelSelection?: {
      policy: IChatModelPolicyResult | null;
      loading: boolean;
      saving: boolean;
      onSelect: (provider: TextProviderType, modelName: string) => void | Promise<void>;
    };
    tutorTargetLanguage?: string;
    onTutorTargetLanguageChange?: (language: string) => void;
    tutorConversationLevel?: string;
    onTutorConversationLevelChange?: (conversationLevel: TutorConversationLevel) => void;
    conversationHintsAvailable?: boolean;
    conversationHintsEnabled?: boolean;
    onConversationHintsEnabledChange?: (enabled: boolean) => void;
  };

  commerce: {
    enabled: boolean;
    universeId: string;
    resolvedProducts: ICommerceProduct[];
    productSourceMessageId: string | null;
    allProducts: ICommerceProduct[];
    showAllProducts: boolean;
  };

  translation: {
    isTranslating: boolean;
    settings: { enabled: boolean };
  };
  conversationHints?: {
    hints: string[];
    isLoading?: boolean;
    onPick: (hint: string) => void;
    onRegenerate?: () => void;
  };

  refs: {
    messagesContainerRef: React.RefObject<HTMLDivElement | null>;
    bottomAnchorRef: React.RefObject<HTMLDivElement | null>;
    chatInputRef: React.RefObject<HTMLTextAreaElement | null>;
    knowledgeSearchPanelRef: React.RefObject<KnowledgeSearchPanelHandle | null>;
  };

  renderers: {
    renderTalkContent: (text: string) => React.ReactNode;
  };

  actions: {
    toggleChatMode: () => void;
    handleInfoVisibilityChange: (hidden: boolean) => void;
    handleArtifactOpen: () => void;
    handleArtifactClose: () => void;
    setShowKnowledgeSearch: React.Dispatch<React.SetStateAction<boolean>>;
    setChatViewMode: React.Dispatch<React.SetStateAction<"talk" | "visual">>;
    scrollToBottom: (behavior?: ScrollBehavior) => void;
    handleProductClick: (p: ICommerceProduct) => void;
    setShowAllProducts: React.Dispatch<React.SetStateAction<boolean>>;
    handleClearKnowledgeContext: () => void;
    handleKnowledgeAdd: (knowledge: IKnowledgeContextSource) => Promise<void>;
    handleFocusInput: () => void;
    handleShowConversationHistory: () => void;
    handleCloseConversationHistory: () => void;
    handleClosePanels: () => void;
    handleToggleKnowledgeSearchPanel: () => void;
    handleToggleInfoPanel: () => void;
    handleToggleSettingsPanel: () => void;
    handleOpenNpcReport?: () => void;
    handleSendWithMessage: (
      overrideText?: string,
      opts?: { preserveInput?: boolean; voiceInput?: Record<string, unknown> },
    ) => Promise<void>;
    handleInputChangeTranslation: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handleVoicePressStart: () => void | Promise<void>;
    handleVoicePressEnd: () => void | Promise<void>;
    handleUserMessageAnimationComplete: () => Promise<void>;
    setShowCloseConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    handleCloseClick: () => void;
    handleConfirmClose: () => void;
    handleCancelClose: () => void;
    handleAIEndClose: () => void;
    handleContinueChat: () => void;
    getDisplayName: (character: IExtendedNpcData) => string;
  };
};

export function CharacterChatView(props: CharacterChatViewProps) {
  const {
    open,
    onOpenChange,
    character,
    personaArtifacts,
    auth,
    participants,
    ui,
    chat,
    commerce,
    translation,
    conversationHints,
    refs,
    renderers,
    actions,
  } = props;

  const { isLoggedIn } = auth;

  const {
    userCharacterName,
    npcPaths,
    userPaths,
    randomNpcPortraitSrc,
    randomUserPortraitSrc,
    showUserCharacter,
    setShowUserCharacter,
  } = participants;

  const {
    chatMode,
    infoHidden,
    artifactOpen,
    panelType,
    showKnowledgeSearch,
    showConversationHistory,
    showCloseConfirm,
    hasKnowledgeContext,
  } = ui;

  const {
    currentPersonaData,
    currentSystemCodes,
    messages,
    conversationHistoryMessages,
    filteredMessages,
    productInlinePrompt,
    isInitialized,
    isPreparingConversation,
    autoAiResponse,
    hasUserMessages,
    viewMode: chatViewMode,
    isUserMessageAnimating,
    voice,
    voicePlayback,
    modelSelection,
    tutorTargetLanguage,
    onTutorTargetLanguageChange,
    tutorConversationLevel,
    onTutorConversationLevelChange,
    conversationHintsAvailable,
    conversationHintsEnabled,
    onConversationHintsEnabledChange,
    aiEnd: { showAIEndRequest, aiEndRequestMessage, isForceEnd, warningStatus },
    input: {
      currentInput,
      displayInput,
      limitMsgLength,
      remainingChars,
      isOverLimit,
      isSendDisabled,
      isRestricted,
      imageAttachment,
    },
  } = chat;

  const {
    enabled: isCommerceUniverse,
    universeId,
    resolvedProducts,
    productSourceMessageId,
    allProducts,
    showAllProducts,
  } = commerce;

  const { isTranslating, settings: translationSettings } = translation;

  const { messagesContainerRef, bottomAnchorRef, chatInputRef, knowledgeSearchPanelRef } = refs;
  const { renderTalkContent } = renderers;

  const {
    toggleChatMode,
    handleInfoVisibilityChange,
    handleArtifactOpen,
    handleArtifactClose,
    setShowKnowledgeSearch,
    setChatViewMode,
    scrollToBottom,
    handleProductClick,
    setShowAllProducts,
    handleClearKnowledgeContext,
    handleKnowledgeAdd,
    handleFocusInput,
    handleShowConversationHistory,
    handleCloseConversationHistory,
    handleClosePanels,
    handleToggleKnowledgeSearchPanel,
    handleToggleInfoPanel,
    handleToggleSettingsPanel,
    handleOpenNpcReport,
    handleSendWithMessage,
    handleInputChangeTranslation,
    handleKeyPress,
    handleVoicePressStart,
    handleVoicePressEnd,
    handleUserMessageAnimationComplete,
    setShowCloseConfirm,
    handleCloseClick,
    handleConfirmClose,
    handleCancelClose,
    handleAIEndClose,
    handleContinueChat,
    getDisplayName,
  } = actions;

  // 텍스트 입력(키보드) 시 배경 고정 + 전경만 가시영역 정합
  const { stableHeight, visibleHeight, offsetTop } = useChatViewportLock(open && chatMode);

  const npcPortraitSrc = randomNpcPortraitSrc ?? npcPaths?.portrait ?? null;
  const userPortraitSrc = randomUserPortraitSrc ?? userPaths?.portrait ?? null;
  const npcSprite = npcPaths?.sprite ?? null;
  const userSprite = userPaths?.sprite ?? null;

  const canContinue = !isForceEnd && Boolean(warningStatus && warningStatus.warningCount < 3);
  const isVoiceAvailable =
    voice.enabled &&
    voice.isSupported &&
    voice.microphoneAvailability === "available" &&
    voice.permissionState !== "denied";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader className="sr-only">
        <SheetTitle>{lang({ ko: `${character.name}와 대화하기`, en: `Talk to ${character.name}` })}</SheetTitle>
        <SheetDescription>
          {lang({ ko: `${character.name}와 대화를 하고 있습니다.`, en: `You are talking to ${character.name}` })}
        </SheetDescription>
      </SheetHeader>

      <SheetContent
        side="bottom"
        hideClose={true}
        disableOutsideClick
        disableEscKeyDown
        className="character-chat-container h-full p-0 overflow-hidden max-w-[35rem] mx-auto border-0"
      >
        <div className="relative w-full h-full">
          <AnimatePresence>
            {chatMode && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 bg-black/85"
              >
                <div
                  className="relative w-full h-full overflow-hidden"
                  style={
                    stableHeight
                      ? ({ ["--chat-stable-h" as string]: `${stableHeight}px` } as React.CSSProperties)
                      : undefined
                  }
                >
                  <ChatBackground
                    character={character}
                    userName={userCharacterName}
                    showUserCharacter={showUserCharacter}
                    npcSrc={npcPortraitSrc}
                    userSrc={userPortraitSrc}
                  />

                  <div
                    className="character-chat-front absolute inset-x-0 top-0 z-10 w-full overflow-hidden flex flex-col"
                    style={{
                      height: visibleHeight ? `${visibleHeight}px` : "100%",
                      transform: offsetTop ? `translateY(${offsetTop}px)` : undefined,
                    }}
                  >
                    <CharacterChatHeader
                      character={character}
                      npcSprite={npcSprite}
                      npcPortraitSrc={npcPortraitSrc}
                      currentPersonaData={currentPersonaData}
                      systemCodes={currentSystemCodes}
                    />

                    <CharacterChatControls
                      className="absolute top-4 right-4 z-10"
                      onToggleKnowledgeSearch={handleToggleKnowledgeSearchPanel}
                      onToggleInfoPanel={handleToggleInfoPanel}
                      onToggleSettingsPanel={handleToggleSettingsPanel}
                      onReport={handleOpenNpcReport}
                      onShowAllProducts={() => setShowAllProducts((v) => !v)}
                      onBack={toggleChatMode}
                      voiceModeToggle={{
                        enabled: voice.enabled,
                        available: isVoiceAvailable,
                        checking: voice.microphoneAvailability === "checking",
                        mode: voice.inputMode,
                        onToggle: voice.onToggleInputMode,
                      }}
                    />

                    <ChatMessageList
                      character={character}
                      viewMode={chatViewMode}
                      isInitialized={isInitialized}
                      isPreparingConversation={isPreparingConversation}
                      autoAiResponse={autoAiResponse}
                      hasUserMessages={hasUserMessages}
                      translationEnabled={translationSettings.enabled}
                      messages={messages}
                      filteredMessages={filteredMessages}
                      productInlinePrompt={productInlinePrompt}
                      productSourceMessageId={productSourceMessageId}
                      isUserMessageAnimating={isUserMessageAnimating}
                      onUserMessageAnimationComplete={handleUserMessageAnimationComplete}
                      scrollToBottom={scrollToBottom}
                      renderTalkContent={renderTalkContent}
                      messagesContainerRef={messagesContainerRef}
                      bottomAnchorRef={bottomAnchorRef}
                      npcSprite={npcSprite}
                      npcPortraitSrc={npcPortraitSrc}
                      commerce={{
                        enabled: isCommerceUniverse,
                        universeId,
                        resolvedProducts,
                        onProductClick: handleProductClick,
                      }}
                      voicePlayback={voicePlayback}
                      imageAttachment={
                        imageAttachment?.enabled
                          ? {
                              enabled: true,
                              onRequestImage: () => imageAttachment.onPickerOpenChange(true),
                            }
                          : undefined
                      }
                    />

                    <ChatInputBar
                      key={voice.provider}
                      isLoggedIn={isLoggedIn}
                      isCommerceUniverse={isCommerceUniverse}
                      hasUserMessages={hasUserMessages}
                      hasKnowledgeContext={hasKnowledgeContext}
                      isTranslating={isTranslating}
                      currentInput={currentInput}
                      displayInput={displayInput}
                      limitMsgLength={limitMsgLength}
                      remainingChars={remainingChars}
                      isOverLimit={isOverLimit}
                      isSendDisabled={isSendDisabled}
                      isPreparingConversation={isPreparingConversation}
                      showAIEndRequest={showAIEndRequest}
                      isRestricted={isRestricted}
                      voice={{
                        ...voice,
                        onPressStart: handleVoicePressStart,
                        onPressEnd: handleVoicePressEnd,
                      }}
                      conversationHints={conversationHints}
                      chatInputRef={chatInputRef}
                      onClearKnowledgeContext={handleClearKnowledgeContext}
                      onChange={handleInputChangeTranslation}
                      onKeyDown={handleKeyPress}
                      onSend={() => handleSendWithMessage()}
                      imageAttachment={
                        imageAttachment
                          ? {
                              enabled: imageAttachment.enabled,
                              disabled: imageAttachment.disabled,
                              preview: imageAttachment.preview,
                              preparing: imageAttachment.preparing,
                              onOpenPicker: () => imageAttachment.onPickerOpenChange(true),
                              onClear: imageAttachment.onClear,
                            }
                          : undefined
                      }
                      userSprite={userSprite}
                      userPortraitSrc={userPortraitSrc}
                      userCharacterName={userCharacterName}
                      showUserCharacter={showUserCharacter}
                      setShowUserCharacter={setShowUserCharacter}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!chatMode && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30"
              >
                <CharacterCard
                  character={character}
                  personaArtifacts={personaArtifacts}
                  hideInfo={infoHidden}
                  footerButtons={[]}
                  onInfoVisibilityChange={handleInfoVisibilityChange}
                  onArtifactOpen={handleArtifactOpen}
                  onArtifactClose={handleArtifactClose}
                />

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="absolute top-2 right-[3rem] z-40"
                >
                  <Button
                    variant="blank"
                    size="sm"
                    rounded="full"
                    onClick={toggleChatMode}
                    className="text-white bg-[rgba(0,0,0,0.5)] hover:bg-[rgba(0,0,0,0.7)] flex items-center gap-1.5"
                  >
                    <MessageSquare className="icon-xs" />
                    <span className="text-xs">
                      <Lang text={{ ko: "돌아가기", en: "Back to talk" }} />
                    </span>
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {imageAttachment?.enabled ? (
          <TutorImageAttachSheet
            open={imageAttachment.pickerOpen}
            disabled={imageAttachment.disabled}
            onOpenChange={imageAttachment.onPickerOpenChange}
            onPick={imageAttachment.onPrepare}
          />
        ) : null}

        <ChatOverlays
          panelType={panelType}
          currentPersonaData={currentPersonaData}
          character={character}
          getDisplayName={getDisplayName}
          chatViewMode={chatViewMode}
          onClosePanels={handleClosePanels}
          onShowConversationHistory={handleShowConversationHistory}
          onToggleViewMode={(mode) => setChatViewMode(mode)}
          modelSelection={modelSelection}
          knowledgeSearchPanelRef={knowledgeSearchPanelRef}
          showKnowledgeSearch={showKnowledgeSearch}
          setShowKnowledgeSearch={setShowKnowledgeSearch}
          chatMode={chatMode}
          hasKnowledgeContext={hasKnowledgeContext}
          onKnowledgeAdd={handleKnowledgeAdd}
          onDiscuss={handleFocusInput}
          isCommerceUniverse={isCommerceUniverse}
          canUseTranslation={!isCommerceUniverse}
          voicePlaybackAvailable={voicePlayback.available}
          voiceInputAvailable={isVoiceAvailable}
          tutorTargetLanguage={tutorTargetLanguage}
          onTutorTargetLanguageChange={onTutorTargetLanguageChange}
          tutorConversationLevel={tutorConversationLevel}
          onTutorConversationLevelChange={onTutorConversationLevelChange}
          conversationHintsAvailable={conversationHintsAvailable}
          conversationHintsEnabled={conversationHintsEnabled}
          onConversationHintsEnabledChange={onConversationHintsEnabledChange}
          showAIEndRequest={showAIEndRequest}
          aiEndRequestMessage={aiEndRequestMessage}
          canContinue={canContinue}
          onEnd={handleAIEndClose}
          onContinue={handleContinueChat}
          showConversationHistory={showConversationHistory}
          onCloseConversationHistory={handleCloseConversationHistory}
          messages={conversationHistoryMessages}
          userCharacterName={userCharacterName}
          npcSprite={npcSprite}
          userSprite={userSprite}
          npcPortraitSrc={npcPortraitSrc}
          userPortraitSrc={userPortraitSrc}
          showAllProducts={showAllProducts}
          setShowAllProducts={setShowAllProducts}
          allProducts={allProducts}
          onProductClick={handleProductClick}
          artifactOpen={artifactOpen}
          onCloseClick={handleCloseClick}
          showCloseConfirm={showCloseConfirm}
          setShowCloseConfirm={setShowCloseConfirm}
          onConfirmClose={handleConfirmClose}
          onCancelClose={handleCancelClose}
        />
      </SheetContent>
    </Sheet>
  );
}
