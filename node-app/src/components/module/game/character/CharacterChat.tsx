"use client";

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import type { IExtendedNpcData } from "types/game";
import type {
  IChatMessage,
  IMessageAudioMeta,
  IPersonaItem,
  PersonaImageLibraryAssetType,
  SystemCodeLikeType,
  SpeechProviderType,
  TextProviderType,
  IKnowledgeContextSource,
} from "types/ai";
import type { ICommerceProduct } from "types/commerce";
import { PROMPT_LIMITS } from "consts/auth";
import fetchClient from "libs/api/fetchClient";
import { saveAssistantAudioMeta } from "libs/api/ai";
import { lang } from "components/module/i18n";

import { useGameCharacterStore, useUserDataStore, useUiControlStore } from "store/game";
import { useAuthStore } from "store/auth";
import { useMessageStore, usePromptStore, useTranslationStore } from "store/chat";

import { useUniverseData } from "hooks/game/core";
import { useNicknameManager } from "hooks/game/input";
import { useTranslation, useChat } from "hooks/ai";
import {
  useCharacterChatCallbacks,
  useMessageRenderers,
  useChatSessionReset,
  useChatScrollAnchor,
  useChatRestriction,
  useChatTranslationBridge,
  useChatMessagePipeline,
  useChatSeedInit,
  useChatCommerce,
  useChatSystemCodeEffects,
  useVoiceInput,
  useVoicePlayback,
  useChatModelSelection,
} from "hooks/chat";

import { convertHtmlToString, isMobileEnvironment, toUnknownRecord } from "utils/common";
import { logger } from "utils/log";
import { normalizeForTalk } from "utils/ai";
import { buildSelectedProductDetailPrompt } from "utils/commerce";
import { fromPersona, getPersonaProfileFramePaths } from "utils/game";
import { ensureGuestId } from "utils/normalize";

import { CharacterChatView } from "./chat-modules/CharacterChatView";
import NpcConversationResultDialog from "./chat-modules/overlays/NpcConversationResultDialog";
import NpcConversationReportDialog from "./chat-modules/overlays/NpcConversationReportDialog";
import type { NpcConversationResult } from "types/game/npc-conversation-result";

type ResetReason = "close" | "pid-change";

interface CharacterChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: IExtendedNpcData | null;
  initialMessage?: string;
  initialProductCodes?: string[];
  autoAskOnOpen?: boolean;
  personaArtifacts?: PersonaImageLibraryAssetType[];
  startSessionOnOpen?: boolean;
  autoAiResponseOverride?: boolean;
}

const CharacterChat = ({
  open,
  onOpenChange,
  character,
  initialMessage,
  initialProductCodes,
  autoAskOnOpen,
  personaArtifacts = [],
  startSessionOnOpen = false,
  autoAiResponseOverride,
}: CharacterChatProps) => {
  const MESSAGE_SEND_DELAY = 300;

  const { universeId, universeInfo, isCommerceUniverse } = useUniverseData();

  const user = useAuthStore((state) => state.user);
  const isLoggedIn = useAuthStore((state) => state.isLogged());

  const selectedCharacter = useGameCharacterStore((state) => state.selectedCharacter);

  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

  // KnowledgeSearchPanel을 제어하기 위한 ref
  const knowledgeSearchPanelRef = useRef<{
    minimize: () => void;
    maximize: () => void;
    toggle: () => void;
  }>(null);

  const userData = useUserDataStore((state) => state.userData);
  const userProfileImageSrc = String(userData?.userInfo?.profileImageUrl || "").trim() || null;
  const userCharacterName = selectedCharacter?.name || userData?.userInfo?.name || "";
  const getPersonaType = useUserDataStore((state) => state.getPersonaType);
  const getPersonaData = useUserDataStore((state) => state.getPersonaData);
  const updatePersonaStats = useUserDataStore((state) => state.updatePersonaStats);
  const flushPendingPersonaPatches = useUserDataStore((s) => s.flushPendingPersonaPatches);

  const userPersonaId = userData?.selectedPersonas ? userData?.selectedPersonas[universeId] : "";
  const limitMsgLength = PROMPT_LIMITS.maxInputMessageLength;
  const sessionId = useMessageStore((state) => state.sessionId);
  const effectiveChatUniverseId = String(universeId || "").trim();
  const modelSelection = useChatModelSelection({
    enabled: open && isLoggedIn && !isCommerceUniverse && Boolean(character?.pid),
    service: "game",
    universeId: effectiveChatUniverseId,
    personaId: character?.pid,
  });
  const handleSelectChatModel = useCallback(
    async (provider: TextProviderType, modelName: string) => modelSelection.selectModel(provider, modelName),
    [modelSelection],
  );
  const reloadModelSelection = modelSelection.reload;

  // auto AI response setting
  const storedAutoAiResponse = useUiControlStore((state) => state.autoAiResponse);
  const autoAiResponse = autoAiResponseOverride ?? storedAutoAiResponse;
  const assistantVoiceEnabled = useUiControlStore((state) => state.assistantVoiceEnabled);
  const assistantVoiceAutoplay = useUiControlStore((state) => state.assistantVoiceAutoplay);
  const assistantVoiceSpeed = useUiControlStore((state) => state.assistantVoiceSpeed);
  const voiceAnalysisEnabled = useUiControlStore((state) => state.voiceAnalysisEnabled);

  // 지식 프롬프트 저장/읽기
  const knowledgeContext = usePromptStore((state) => state.knowledgeContext);
  const setKnowledgeContext = usePromptStore((state) => state.setKnowledgeContext);
  const hasKnowledgeContext = useMemo(() => Boolean(knowledgeContext?.trim()), [knowledgeContext]);

  // view mode / ui flags
  const [chatViewMode, setChatViewMode] = useState<"talk" | "visual">("visual");
  const [chatMode, setChatMode] = useState(true);
  const [infoHidden, setInfoHidden] = useState(true);

  const [artifactOpen, setArtifactOpen] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const [panelType, setPanelType] = useState<"info" | "settings" | null>(null);
  const [showKnowledgeSearch, setShowKnowledgeSearch] = useState(false);
  const [showConversationHistory, setShowConversationHistory] = useState(false);
  // 아이템 박스 표시 토글 setter만 유지 (값은 더 이상 UI에서 사용하지 않음 — 자막 디스플레이 제거에 따른 정리)
  const [, setShowChatItemBox] = useState(false);

  const [showAIEndRequest, setShowAIEndRequest] = useState(false);
  const [aiEndRequestMessage, setAIEndRequestMessage] = useState<string>("");
  const [isForceEnd, setIsForceEnd] = useState(false);
  const [conversationResult, setConversationResult] = useState<NpcConversationResult | null>(null);
  const [showNpcReport, setShowNpcReport] = useState(false);

  useEffect(() => {
    if (panelType !== "settings" || !isLoggedIn || isCommerceUniverse) return;
    void reloadModelSelection();
  }, [panelType, isLoggedIn, isCommerceUniverse, reloadModelSelection]);

  // 무드 인디케이터용 최신 systemCode 보관
  const [currentSystemCodes, setCurrentSystemCodes] = useState<SystemCodeLikeType[] | null>(null);

  // currentPersonaData
  const [currentPersonaData, setCurrentPersonaData] = useState<IPersonaItem | null>(null);

  // background portraits (session-fixed)
  const prevOpenRef = useRef<boolean>(false);
  const [randomNpcPortraitSrc, setRandomNpcPortraitSrc] = useState<string | null>(null);
  const [randomUserPortraitSrc, setRandomUserPortraitSrc] = useState<string | null>(null);
  const [showUserCharacter, setShowUserCharacter] = useState(false);

  // nickname helpers
  const { getDisplayName, getCharacterPersona } = useNicknameManager();

  // useChat
  const {
    messages,
    conversationHistoryMessages,
    isConversationHistoryReady,
    hasConversationHistory,
    setMessages,
    currentInput,
    isLoading,
    isOverLimit,
    lastMessageSender,
    setLastMessageSender,
    handleInputChange,
    handleSendMessage,
    requestGreeting,
    isInitialized,
    setIsInitialized,
    handleConversationEnd,
    setCurrentInput,
    setIsFirstMessage,
    updateIntimacy,
  } = useChat(character, modelSelection.policy?.selected);
  const isPreparingConversation = startSessionOnOpen && !isInitialized;

  const startedOpenSessionPidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!startSessionOnOpen || !open || !character?.pid) {
      if (!open) startedOpenSessionPidRef.current = null;
      return;
    }
    if (startedOpenSessionPidRef.current === character.pid) return;

    startedOpenSessionPidRef.current = character.pid;
    useMessageStore.getState().startNewSession();
    setMessages([]);
    setIsInitialized(false);
  }, [startSessionOnOpen, open, character?.pid, setMessages, setIsInitialized]);

  // restriction hook
  const { isRestricted, warningStatus } = useChatRestriction({
    open,
    characterPid: character?.pid ?? null,
    onOpenChange,
  });

  // renderer helpers
  const { renderTalkContent } = useMessageRenderers();

  // npc/user paths (portrait/sprites)
  const npcPaths = useMemo(
    () => (character ? fromPersona(character, { universeId, type: "npc", isCommerceUniverse }) : null),
    [character, universeId, isCommerceUniverse],
  );

  const userPaths = useMemo(
    () => (selectedCharacter ? fromPersona(selectedCharacter, { universeId, type: "user", isCommerceUniverse }) : null),
    [selectedCharacter, universeId, isCommerceUniverse],
  );

  // translation settings + hook
  const translationSettings = useTranslationStore();
  const { isTranslating, translateImmediately, getTranslation, clearTranslations } = useTranslation({
    targetLanguage: translationSettings.targetLanguage,
    provider: translationSettings.helperModelProvider,
    modelName: translationSettings.helperModelName,
    enabled: translationSettings.enabled,
    autoTranslate: false,
    debounceMs: 1500,
  });

  // Commerce 상태를 훅/콜백/pipeline 어디서든 최신값으로 참조할 수 있게 ref로 브릿지
  // - pipeline은 commerce hook보다 먼저 생성되어야 하기 때문에(=sendWithMessage 의존), ref가 필수
  const lastProductCodesRef = useRef<string[] | null>(null);
  const resolvedProductsRef = useRef<ICommerceProduct[]>([]);

  // callbacks hook (single source; includes withEphemeralAdditional)
  const {
    handleToggleKnowledgeSearchPanel,
    handleFocusInput,
    handleShowConversationHistory,
    handleCloseConversationHistory,
    handleToggleInfoPanel,
    handleToggleSettingsPanel,
    handleClosePanels,
    handleArtifactOpen,
    handleArtifactClose,
    handleCloseClick,
    handleConfirmClose,
    handleCancelClose,
    handleAIEndClose,
    handleContinueChat,
    withEphemeralAdditional,
  } = useCharacterChatCallbacks({
    chatInputRef,
    knowledgeSearchPanelRef,

    onOpenChange,
    character,
    messagesLength: messages.length,
    handleConversationEnd,
    flushPendingPersonaPatches,
    onConversationResult: setConversationResult,

    panelType,
    setPanelType,
    setShowKnowledgeSearch,
    setShowChatItemBox,

    setArtifactOpen,
    setShowCloseConfirm,

    setShowAIEndRequest,
    setAIEndRequestMessage,
    setIsForceEnd,

    setShowConversationHistory,
    getMessages: () => messages,
    getLastProductCodes: () => lastProductCodesRef.current, // ref 기반으로 최신값 보장
  });

  // pipeline이 실제 API send 시 사용하는 함수 (talk/visual 모두 동일)
  // - commerce universe면 product additional prompt를 ephemeral로만 추가
  const handleSendMessageWithError = useCallback(
    async (
      messageText?: string,
      meta?: {
        clientId?: string;
        translation?: string;
        timestamp?: Date;
        voiceInput?: Record<string, unknown>;
      },
    ) => {
      const exec = () =>
        handleSendMessage(messageText, {
          ...meta,
          optimisticLocalAdd: false, // CharacterChat(pipeline)가 addMessage 해뒀으면 save만
        });

      if (!isCommerceUniverse) return await exec();

      const codes = lastProductCodesRef.current;
      const resolved = resolvedProductsRef.current;

      const additional =
        codes?.length && resolved?.length
          ? buildSelectedProductDetailPrompt(resolved, {
              maxProducts: 6,
              maxSpecItems: 8,
              maxValueLen: 80,
            })
          : "";

      return await withEphemeralAdditional(additional, exec);
    },
    [handleSendMessage, isCommerceUniverse, withEphemeralAdditional],
  );

  // pipeline (send/input/seed + visual pending)
  const pipeline = useChatMessagePipeline({
    open,
    character,

    currentInput,
    setCurrentInput,
    setMessages,
    setLastMessageSender,
    handleInputChange,

    chatViewMode,
    isLoading,

    // pipeline에 "최종 send"를 그대로 주입 (talk/visual 일관성 확보)
    handleSendMessageWithError,

    knowledgeSearchPanelRef,

    translation: {
      enabled: translationSettings.enabled,
      isTranslating,
      getTranslation,
      translateImmediately,
    },

    limitMsgLength,

    clearCurrentSystemCodes: () => setCurrentSystemCodes(null),

    MESSAGE_SEND_DELAY,
  });

  const {
    seedAssistantMessage,
    isUserMessageAnimating,
    pendingApiRequest,
    handleSendWithMessage,
    handleUserMessageAnimationComplete,
    handleInputChangeTranslation,
  } = pipeline;

  const effectiveVoiceRouteHint = isCommerceUniverse ? ("commerce" as const) : ("ai" as const);
  const effectiveVoiceUniverseId = String(universeId || "").trim();

  const universeMetadata = useMemo(
    () => toUnknownRecord(toUnknownRecord(universeInfo?.data).metadata),
    [universeInfo?.data],
  );
  const voiceConfig = useMemo(() => toUnknownRecord(universeMetadata.voiceConfig), [universeMetadata]);
  const voiceInputProvider: SpeechProviderType = voiceConfig.defaultSttProvider === "qwen" ? "qwen" : "elevenlabs";

  const isVoiceUiEnabled = useMemo(() => {
    const voiceEnabled = universeMetadata.voiceEnabled;
    const authEnabled = isLoggedIn || isCommerceUniverse;
    return Boolean(character?.pid) && authEnabled && voiceEnabled !== false;
  }, [character?.pid, isCommerceUniverse, isLoggedIn, universeMetadata]);

  const isVoiceInputUiEnabled = isVoiceUiEnabled;

  const isAssistantVoiceEnabled = isVoiceUiEnabled && assistantVoiceEnabled;

  // 입력 모드(음성 대화 / 키보드 입력) — 상단 토글과 하단 입력바가 공유하는 단일 소스
  const [voiceInputMode, setVoiceInputMode] = useState<"voice" | "text">("voice");
  // 음성 대화 모드에서만 무음 자동 종료(핸즈프리) 가동
  const voiceAutoSubmit = isVoiceInputUiEnabled && voiceInputMode === "voice";

  const shouldAutoplayAssistantVoice = useMemo(() => {
    if (!isAssistantVoiceEnabled) return false;
    return voiceConfig.autoplayAssistant !== false && assistantVoiceAutoplay;
  }, [assistantVoiceAutoplay, isAssistantVoiceEnabled, voiceConfig]);

  const shouldSyncAssistantVoiceDisplay = shouldAutoplayAssistantVoice && voiceConfig.voiceSyncDisplay !== false;
  const voiceAssessmentContext = useMemo(() => {
    const lastAssistantMessage = [...messages].reverse().find((message) => !message.isUser && message.text?.trim());
    return String(lastAssistantMessage?.text || "")
      .trim()
      .slice(0, 1200);
  }, [messages]);

  const voiceInput = useVoiceInput({
    enabled: isVoiceInputUiEnabled && !showAIEndRequest && !isRestricted && !isLoading,
    baseInput: currentInput,
    maxChars: limitMsgLength,
    analysisEnabled: voiceAnalysisEnabled,
    autoSubmitOnSilence: voiceAutoSubmit,
    routeHint: effectiveVoiceRouteHint,
    universeId: effectiveVoiceUniverseId || undefined,
    npcId: character?.pid || undefined,
    sessionId,
    assessmentContext: voiceAssessmentContext,
    provider: voiceInputProvider,
    onResolvedInput: async (nextInput, _transcript, voiceInput) => {
      setCurrentInput(nextInput);
      await handleSendWithMessage(nextInput, { voiceInput });
    },
  });

  const isVoiceInputAvailable =
    isVoiceInputUiEnabled &&
    voiceInput.isSupported &&
    voiceInput.microphoneAvailability === "available" &&
    voiceInput.permissionState !== "denied";

  const toggleVoiceInputMode = useCallback(() => {
    setVoiceInputMode((mode) => (mode === "voice" ? "text" : isVoiceInputAvailable ? "voice" : "text"));
  }, [isVoiceInputAvailable]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isVoiceInputAvailable || voiceInputMode !== "voice") return;
    setVoiceInputMode("text");
  }, [isVoiceInputAvailable, voiceInputMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAssistantAudioMetaResolved = useCallback(
    async (message: IChatMessage, audioMeta: IMessageAudioMeta) => {
      const personaId = character?.pid;
      const clientId = String(message?.clientId || message?.id || "").trim();
      const content = String(message?.text || "").trim();
      if (!personaId || !clientId || !content || !audioMeta) return;

      useMessageStore.getState().patchMessageAudioMeta(personaId, clientId, audioMeta);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id || item.clientId === clientId
            ? {
                ...item,
                clientId,
                audioMeta,
              }
            : item,
        ),
      );

      try {
        if (isLoggedIn && userPersonaId) {
          await saveAssistantAudioMeta({
            personaId,
            userPersonaId,
            sessionId,
            clientId,
            content,
            audioMeta,
          });
          return;
        }

        if (!isLoggedIn && isCommerceUniverse && effectiveVoiceUniverseId) {
          const effectiveGuestId = ensureGuestId();
          if (!effectiveGuestId) return;

          await saveAssistantAudioMeta({
            personaId,
            universeId: effectiveVoiceUniverseId,
            guestId: effectiveGuestId,
            sessionId,
            clientId,
            content,
            audioMeta,
          });
        }
      } catch (error) {
        logger.warn("[CharacterChat] assistant audioMeta 저장 실패:", error);
      }
    },
    [
      character?.pid,
      userPersonaId,
      effectiveVoiceUniverseId,
      isCommerceUniverse,
      isLoggedIn,
      sessionId,
      setMessages,
    ],
  );

  const voicePlayback = useVoicePlayback({
    enabled: isAssistantVoiceEnabled,
    autoplay: shouldAutoplayAssistantVoice,
    syncDisplay: shouldSyncAssistantVoiceDisplay,
    routeHint: effectiveVoiceRouteHint,
    universeId: effectiveVoiceUniverseId || undefined,
    npcId: character?.pid || undefined,
    sessionId,
    speed: assistantVoiceSpeed ?? undefined,
    messages,
    onAudioMetaResolved: handleAssistantAudioMetaResolved,
  });

  // 음성 입력 상태 안내 — 인라인 푸터 텍스트 대신 토스트로 표시(요청 3)
  useEffect(
    function notifyVoiceState() {
      const id = "voice-state";
      if (voiceInput.isRecording) {
        toast(
          lang({
            ko: voiceAutoSubmit
              ? "녹음 중입니다. 말이 끝나면 자동으로 전송돼요."
              : "녹음 중입니다. 버튼을 다시 누르면 전송돼요.",
            en: voiceAutoSubmit
              ? "Recording. It will be sent automatically when you stop speaking."
              : "Recording. Press the button again to send.",
          }),
          { id },
        );
      } else if (voiceInput.isSubmitting) {
        toast.loading(
          lang({
            ko: voiceAnalysisEnabled ? "음성과 발음을 분석 중입니다." : "음성을 분석 중입니다.",
            en: voiceAnalysisEnabled ? "Analyzing your speech and pronunciation." : "Processing your speech.",
          }),
          { id },
        );
      } else {
        toast.dismiss(id);
      }
    },
    [voiceInput.isRecording, voiceInput.isSubmitting, voiceAutoSubmit, voiceAnalysisEnabled],
  );

  // 음성 입력 에러 토스트
  useEffect(
    function notifyVoiceError() {
      if (voiceInput.errorMessage) toast.error(voiceInput.errorMessage, { id: "voice-error" });
    },
    [voiceInput.errorMessage],
  );

  // 음성 대화 모드 진입 시 사용법과 비용 안내를 1회 노출
  const voiceIntroNoticeShownRef = useRef(false);
  useEffect(
    function notifyVoiceIntroOnce() {
      if (!voiceAutoSubmit || voiceIntroNoticeShownRef.current) return;
      voiceIntroNoticeShownRef.current = true;
      toast.warning(
        lang({
          ko: "마이크 버튼을 눌러 말해보세요. 음성은 전사 후 바로 전송되며 추가 코인이 사용될 수 있어요.",
          en: "Press the microphone and start speaking. Voice is sent after transcription and may use additional coins.",
        }),
        {
          id: "voice-coin-notice",
          duration: 5000,
          classNames: {
            content: "w-full",
          },
        },
      );
    },
    [voiceAutoSubmit],
  );

  // messages filter (talk vs visual)
  const hasUserMessages = useMemo(() => messages.some((m) => m.isUser), [messages]);

  const filteredMessages = useMemo(() => {
    if (chatViewMode === "talk") return normalizeForTalk(messages);

    const systemFiltered = messages;
    if (systemFiltered.length === 0) return systemFiltered;

    const last = systemFiltered[systemFiltered.length - 1];
    const currentLastSender = last.isUser ? "user" : "assistant";

    // 유저 메시지 애니메이션 중일 때 유저 메시지 1개만
    if (isUserMessageAnimating && currentLastSender === "user") {
      const userMessages = systemFiltered.filter((m) => m.isUser);
      return userMessages.slice(-1);
    }

    if (currentLastSender === "user") {
      const userMessages = systemFiltered.filter((m) => m.isUser);
      return userMessages.slice(-1);
    } else {
      const assistantMessages = systemFiltered.filter((m) => !m.isUser);
      return assistantMessages.slice(-1);
    }
  }, [chatViewMode, messages, isUserMessageAnimating]);

  // scroll hook
  const { scrollToBottom } = useChatScrollAnchor({
    open,
    chatMode,
    viewMode: chatViewMode,
    messagesContainerRef,
    bottomAnchorRef,
    scrollKey: `${chatViewMode}|${filteredMessages.length}`,
  });

  // commerce hook (products / autoAsk / window events / tracking)
  const commerce = useChatCommerce({
    open,
    enabled: isCommerceUniverse,
    universeId,

    messages,
    scrollToBottom,

    initialProductCodes,
    initialMessage,
    autoAskOnOpen,
    isInitialized,

    sendWithMessage: handleSendWithMessage,
  });

  const {
    allProducts,
    resolvedProducts,

    lastProductCodes,
    setLastProductCodes,

    productSourceMessageId,
    setProductSourceMessageId,

    productInlinePrompt,
    setProductInlinePrompt,

    showAllProducts,
    setShowAllProducts,

    handleProductClick,
  } = commerce;

  // commerce 상태를 ref에 동기화 (pipeline/callbacks 에서 최신값 참조)
  useEffect(() => {
    lastProductCodesRef.current = lastProductCodes;
  }, [lastProductCodes]);

  useEffect(() => {
    resolvedProductsRef.current = resolvedProducts ?? [];
  }, [resolvedProducts]);

  // seed init hook (initial message/product seed)
  useChatSeedInit({
    open,
    character,
    universeId,
    isCommerceUniverse,
    autoAiResponse,
    requestGreetingOnOpen: startSessionOnOpen && (hasConversationHistory || autoAiResponse),
    waitForConversationHistory: startSessionOnOpen,
    conversationHistoryReady: isConversationHistoryReady,

    initialMessage,
    initialProductCodes,

    isInitialized,
    setIsInitialized,

    messagesLength: messages.length,

    seedAssistantMessage,
    requestGreeting,

    setLastMessageSender,
    setIsFirstMessage,

    setLastProductCodes,
    setProductSourceMessageId,
  });

  // systemCode effects hook
  useChatSystemCodeEffects({
    open,
    messages,
    character,

    universeId,
    isCommerceUniverse,

    showAIEndRequest,

    setCurrentSystemCodes,

    setShowAIEndRequest,
    setAIEndRequestMessage,
    setIsForceEnd,

    updateIntimacy,
    setCurrentPersonaData,
  });

  // translation 캐시 정리 브릿지 (표시는 말풍선 번역 토글이 담당)
  useChatTranslationBridge({
    open,
    enabled: translationSettings.enabled,
    targetLanguage: translationSettings.targetLanguage,
    autoTranslate: false,
    clearTranslations,
  });

  // UI 리셋
  const resetUiOnClose = useCallback(() => {
    setIsInitialized(false);

    setChatMode(true);
    setInfoHidden(true);

    setPanelType(null);
    setShowKnowledgeSearch(false);
    setShowConversationHistory(false);
    setShowChatItemBox(false);
    setArtifactOpen(false);

    setShowAIEndRequest(false);
    setAIEndRequestMessage("");
    setIsForceEnd(false);

    setShowCloseConfirm(false);

    setProductInlinePrompt({});
    setCurrentSystemCodes(null);
  }, [setIsInitialized, setProductInlinePrompt]);

  // commerce hard reset
  const resetCommerceOnPidChange = useCallback(() => {
    setLastProductCodes(null);
    setProductSourceMessageId(null);
    setProductInlinePrompt({});
    setShowAllProducts(false);

    // ref도 같이 리셋 (stale 방지)
    lastProductCodesRef.current = null;
    resolvedProductsRef.current = [];
  }, [setLastProductCodes, setProductSourceMessageId, setProductInlinePrompt, setShowAllProducts]);

  // 리셋 책임 단일화
  const resetSession = useCallback(
    (reason: ResetReason) => {
      resetUiOnClose();
      setMessages([]);
      setLastMessageSender(null);

      if (reason === "pid-change") {
        resetCommerceOnPidChange();
        setCurrentPersonaData(null);
      }
    },
    [resetUiOnClose, setMessages, setLastMessageSender, resetCommerceOnPidChange],
  );

  // 리셋 트리거
  useChatSessionReset({
    open,
    characterPid: character?.pid ?? null,
    onReset: (r) => resetSession(r === "close" ? "close" : "pid-change"),
  });

  const [trackedOpenForPersona, setTrackedOpenForPersona] = useState(open);
  if (trackedOpenForPersona !== open) {
    setTrackedOpenForPersona(open);
    if (!open) setCurrentPersonaData(null);
  }

  // currentPersonaData fetch (initial load)
  useEffect(() => {
    if (!open || !character?.pid || !universeId || !isInitialized) {
      return;
    }

    let cancelled = false;
    const pid = character.pid;

    const fetchPersonaData = async () => {
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 500;

      while (retryCount < maxRetries) {
        try {
          const personaData = await getCharacterPersona(pid);
          if (cancelled) return;
          if (personaData) {
            setCurrentPersonaData(personaData);
            return;
          }

          retryCount++;
          if (retryCount < maxRetries) await new Promise((r) => setTimeout(r, retryDelay));
        } catch (e) {
          retryCount++;
          if (!cancelled) logger.error("currentPersonaData 가져오기 실패:", e);
        }
      }

      logger.warn("currentPersonaData를 가져올 수 없습니다.");
      if (!cancelled) setCurrentPersonaData(null);
    };

    fetchPersonaData();
    return () => {
      cancelled = true;
    };
  }, [open, character?.pid, universeId, isInitialized, getCharacterPersona]);

  // 시트가 "닫힌 상태"에서 character pid가 바뀌는 경우 선택만 바꾸고 다시 열기
  // - pid-change reset 훅이 트리거되지 않기 때문에 commerce 상태 누수가 발생할 수 있음
  const prevPidWhenClosedRef = useRef<string | null>(null);
  useEffect(() => {
    const pid = character?.pid ?? null;

    if (!open && prevPidWhenClosedRef.current && pid && prevPidWhenClosedRef.current !== pid) {
      resetCommerceOnPidChange();
      setCurrentPersonaData(null);
      setCurrentSystemCodes(null);
    }

    prevPidWhenClosedRef.current = pid;
  }, [open, character?.pid, resetCommerceOnPidChange]);

  // 시트가 열릴 때 랜덤 배경 설정
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const unique = (values: Array<string | null | undefined>) =>
        Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

      const npcProfileFrames = character
        ? getPersonaProfileFramePaths(character, { universeId, type: "npc", isCommerceUniverse })
        : [];
      const userProfileFrames = selectedCharacter
        ? getPersonaProfileFramePaths(selectedCharacter, { universeId, type: "user", isCommerceUniverse })
        : [];

      const npcCandidates = unique([...npcProfileFrames, npcPaths?.portrait]);
      const userCharacterCandidates = unique([...userProfileFrames, userPaths?.portrait]);
      const userCandidates = userCharacterCandidates.length ? userCharacterCandidates : unique([userProfileImageSrc]);

      const pickOne = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

      setRandomNpcPortraitSrc(npcCandidates.length ? pickOne(npcCandidates) : npcPaths?.portrait || null);
      setRandomUserPortraitSrc(userCandidates.length ? pickOne(userCandidates) : userPaths?.portrait || null);
      setShowUserCharacter(Boolean(selectedCharacter) && Math.random() < 0.5);
    }

    if (!open && prevOpenRef.current) {
      setRandomNpcPortraitSrc(null);
      setRandomUserPortraitSrc(null);
    }

    prevOpenRef.current = open;
  }, [
    open,
    character,
    selectedCharacter,
    universeId,
    isCommerceUniverse,
    npcPaths?.portrait,
    userPaths?.portrait,
    userProfileImageSrc,
  ]);

  // 대화가 시작된 후 배경을 화자에 맞춰 전환
  const [trackedSpeakerState, setTrackedSpeakerState] = useState({ hasUserMessages, lastMessageSender });
  if (
    trackedSpeakerState.hasUserMessages !== hasUserMessages ||
    trackedSpeakerState.lastMessageSender !== lastMessageSender
  ) {
    setTrackedSpeakerState({ hasUserMessages, lastMessageSender });
    if (hasUserMessages) setShowUserCharacter(lastMessageSender === "user");
  }

  // 텍스트 입력 시 높이 자동 조절
  useEffect(() => {
    const textarea = chatInputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = lineHeight * 5;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [currentInput]);

  // 대화 모드 전환
  const toggleChatMode = useCallback(() => {
    setChatMode((prev) => {
      const next = !prev;
      setInfoHidden(next);
      return next;
    });
  }, []);

  // info panel hidden callback
  const handleInfoVisibilityChange = useCallback((hidden: boolean) => {
    setInfoHidden(hidden);
  }, []);

  // 지식 추가 핸들러
  const handleKnowledgeAdd = useCallback(
    async (knowledgeSource: IKnowledgeContextSource) => {
      if (!character) return;

      const knowledgeTitle = knowledgeSource.title;
      const rawContent = knowledgeSource.contentHtml || knowledgeSource.content;
      const knowledgeContent = convertHtmlToString(rawContent);
      const knowledge = `${knowledgeTitle}\n${knowledgeContent}`;

      setKnowledgeContext(knowledge);

      if (
        knowledgeSource.sourceType !== "wp-post" ||
        !knowledgeSource.wpPostId ||
        !isLoggedIn ||
        !universeId ||
        !user?.id ||
        !userPersonaId
      ) {
        return;
      }

      try {
        await fetchClient.post(
          "/conversations/knowledge",
          {
            userId: user.id,
            userPersonaId,
            personaId: character.pid,
            universeId,
            action: "add",
            postId: knowledgeSource.wpPostId,
          },
          { timeout: 12_000, responseType: "auto" },
        );

        const personaType = await getPersonaType(universeId, character.pid);
        if (personaType) {
          const currentPersona = await getPersonaData(universeId, character.pid, personaType);
          await updatePersonaStats(
            universeId,
            character.pid,
            { iq: Math.min(150, (currentPersona?.iq || 50) + 1) },
            personaType,
          );
        }
      } catch (e) {
        logger.error("지식 추가 실패:", e);
      }
    },
    [
      isLoggedIn,
      character,
      universeId,
      user,
      userPersonaId,
      getPersonaType,
      getPersonaData,
      updatePersonaStats,
      setKnowledgeContext,
    ],
  );

  const handleClearKnowledgeContext = useCallback(() => {
    setKnowledgeContext("");
  }, [setKnowledgeContext]);

  // Send 버튼 disabled 조건
  const isSendDisabled = useMemo(() => {
    const hardDisabled =
      isPreparingConversation ||
      isLoading ||
      showAIEndRequest ||
      isRestricted ||
      isUserMessageAnimating ||
      !!pendingApiRequest ||
      voiceInput.isRecording ||
      voiceInput.isSubmitting;
    if (hardDisabled) return true;
    if (!currentInput.trim() || isOverLimit) return true;
    if (translationSettings.enabled && isTranslating) return true;
    return false;
  }, [
    currentInput,
    isPreparingConversation,
    isLoading,
    isOverLimit,
    showAIEndRequest,
    isRestricted,
    translationSettings.enabled,
    isTranslating,
    isUserMessageAnimating,
    pendingApiRequest,
    voiceInput.isRecording,
    voiceInput.isSubmitting,
  ]);

  // Enter send (shift + enter: newline)
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isSendDisabled) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const currentText = (e.target as HTMLTextAreaElement).value.trim();
        if (currentText && !isTranslating) {
          void handleSendWithMessage();
        }
      }
    },
    [handleSendWithMessage, isTranslating, isSendDisabled],
  );

  // 자동 포커스
  useEffect(() => {
    if (!open || !chatMode) return;
    if (
      isPreparingConversation ||
      isLoading ||
      isRestricted ||
      showAIEndRequest ||
      isTranslating ||
      voiceInput.isRecording ||
      voiceInput.isSubmitting
    ) {
      return;
    }

    const el = chatInputRef.current;
    if (!el || el.disabled) return;

    const id = window.setTimeout(
      () => {
        // 이미 포커스면 스킵 (불필요한 focus 재호출 방지)
        if (document.activeElement !== el) el.focus();
      },
      isMobileEnvironment() ? 120 : 60,
    );

    return () => window.clearTimeout(id);
  }, [
    open,
    chatMode,
    isPreparingConversation,
    isLoading,
    isRestricted,
    showAIEndRequest,
    isTranslating,
    voiceInput.isRecording,
    voiceInput.isSubmitting,
  ]);

  if (!character) return null;

  const remainingChars = limitMsgLength - (voiceInput.displayInput?.length || currentInput.length);

  return (
    <>
      <CharacterChatView
        open={open}
        onOpenChange={onOpenChange}
        character={character}
        personaArtifacts={personaArtifacts}
        auth={{ isLoggedIn }}
        participants={{
          userCharacterName,
          npcPaths,
          userPaths,
          randomNpcPortraitSrc,
          randomUserPortraitSrc,
          showUserCharacter,
          setShowUserCharacter,
        }}
        ui={{
          chatMode,
          infoHidden,
          artifactOpen,
          panelType,
          showKnowledgeSearch,
          showConversationHistory,
          showCloseConfirm,
          hasKnowledgeContext,
        }}
        chat={{
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
          lastMessageSender,
          viewMode: chatViewMode,
          isUserMessageAnimating,
          aiEnd: {
            showAIEndRequest,
            aiEndRequestMessage,
            isForceEnd,
            warningStatus,
          },
          input: {
            currentInput,
            displayInput: voiceInput.displayInput,
            limitMsgLength,
            remainingChars,
            isOverLimit,
            isSendDisabled,
            isRestricted,
          },
          voice: {
            provider: voiceInputProvider,
            enabled: isVoiceInputUiEnabled,
            isSupported: voiceInput.isSupported,
            microphoneAvailability: voiceInput.microphoneAvailability,
            canUseInterimTranscript: voiceInput.canUseInterimTranscript,
            isRecording: voiceInput.isRecording,
            isSubmitting: voiceInput.isSubmitting,
            permissionState: voiceInput.permissionState,
            errorMessage: voiceInput.errorMessage,
            inputMode: voiceInputMode,
            onChangeInputMode: setVoiceInputMode,
            onToggleInputMode: toggleVoiceInputMode,
          },
          voicePlayback: {
            available: isVoiceUiEnabled,
            enabled: isAssistantVoiceEnabled,
            getMessagePlaybackState: voicePlayback.getMessagePlaybackState,
            onTogglePlayback: voicePlayback.togglePlayback,
          },
          modelSelection:
            isLoggedIn && !isCommerceUniverse
              ? {
                  policy: modelSelection.policy,
                  loading: modelSelection.loading,
                  saving: modelSelection.saving,
                  onSelect: handleSelectChatModel,
                }
              : undefined,
        }}
        commerce={{
          enabled: isCommerceUniverse,
          universeId,
          resolvedProducts,
          productSourceMessageId,
          allProducts: allProducts ?? [],
          showAllProducts,
        }}
        translation={{
          isTranslating,
          settings: translationSettings,
        }}
        refs={{
          messagesContainerRef,
          bottomAnchorRef,
          chatInputRef,
          knowledgeSearchPanelRef,
        }}
        renderers={{
          renderTalkContent,
        }}
        actions={{
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
          handleOpenNpcReport:
            isLoggedIn && !isCommerceUniverse && Boolean(userPersonaId) && Boolean(sessionId)
              ? () => setShowNpcReport(true)
              : undefined,

          handleSendWithMessage,
          handleInputChangeTranslation,
          handleKeyPress,
          handleVoicePressStart: voiceInput.startRecording,
          handleVoicePressEnd: voiceInput.stopRecording,

          // pipeline 기본 complete 사용
          handleUserMessageAnimationComplete,

          setShowCloseConfirm,
          handleCloseClick,
          handleConfirmClose,
          handleCancelClose,

          handleAIEndClose,
          handleContinueChat,

          getDisplayName,
        }}
      />
      <NpcConversationResultDialog
        open={Boolean(conversationResult)}
        result={conversationResult}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setConversationResult(null);
          onOpenChange(false);
        }}
      />
      <NpcConversationReportDialog
        open={showNpcReport}
        onOpenChange={setShowNpcReport}
        universeId={universeId}
        npcId={character.pid}
        npcName={character.name}
        userPersonaId={userPersonaId || ""}
        conversationSessionId={sessionId}
        onReported={() => {
          setShowNpcReport(false);
          onOpenChange(false);
        }}
      />
    </>
  );
};

export default CharacterChat;
