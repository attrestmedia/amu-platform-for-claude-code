"use client";

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import type { IExtendedNpcData } from "types/game";
import type {
  ChatImageInputType,
  ChatImagePreviewType,
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
import { TUTORS_NAMESPACE_KEY } from "consts/app";
import {
  DEFAULT_TUTOR_TARGET_LANGUAGE,
  normalizeTutorConversationLevel,
  normalizeTutorTargetLanguage,
  type TutorConversationLevel,
} from "consts/tutors";
import fetchClient from "libs/api/fetchClient";
import { getTutorsSttStatus, saveAssistantAudioMeta, type TutorsSttStatus } from "libs/api/ai";
import { updateTutorsPersonaConversationLevel } from "libs/api/tutors/personas";
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
  useConversationHints,
  useTutorsChatImageInput,
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
import { normalizeChatTranslationLanguage, normalizeTutorLanguageForComparison } from "store/chat/translationStore";
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
  tutorsConversationHint?: {
    enabled?: boolean;
    targetLanguage?: string;
    topic?: string;
  };
  tutorsConversationLevel?: string;
  tutorsImageInputEnabled?: boolean;
}

function normalizeLanguageBase(value: unknown) {
  return normalizeTutorLanguageForComparison(value).split(/[-_]/, 1)[0];
}

function isTutorSttLanguageSupported(languages: unknown, targetLanguageCode: string) {
  if (!targetLanguageCode) return true;
  if (!Array.isArray(languages) || languages.length === 0) return false;

  const target = normalizeLanguageBase(targetLanguageCode);
  return languages.some((language) => normalizeLanguageBase(language) === target);
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
  tutorsConversationHint,
  tutorsConversationLevel,
  tutorsImageInputEnabled = false,
}: CharacterChatProps) => {
  const MESSAGE_SEND_DELAY = 300;
  const pathname = usePathname();

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
  const isTutorsRoute = pathname.startsWith("/tutors");
  const conversationUserPersonaId = isTutorsRoute ? TUTORS_NAMESPACE_KEY : userPersonaId;
  const effectiveChatUniverseId = isTutorsRoute
    ? String(character?.universeId || universeId || "").trim()
    : String(universeId || "").trim();
  const modelSelection = useChatModelSelection({
    enabled: open && isLoggedIn && !isCommerceUniverse && Boolean(character?.pid),
    service: isTutorsRoute ? "tutors" : "game",
    universeId: effectiveChatUniverseId,
    personaId: character?.pid,
  });
  const selectedModelOption = modelSelection.policy?.options.find(
    (option) => option.key === modelSelection.policy?.selected.key,
  );
  const chatImageInputEnabled =
    isTutorsRoute && tutorsImageInputEnabled && selectedModelOption?.supportsImageInput === true;
  const {
    pending: pendingChatImage,
    preparing: isPreparingChatImage,
    prepare: prepareChatImage,
    discard: discardChatImage,
    take: takeChatImage,
  } = useTutorsChatImageInput(chatImageInputEnabled);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const handleSelectChatModel = useCallback(
    async (provider: TextProviderType, modelName: string) => {
      setImagePickerOpen(false);
      discardChatImage();
      await modelSelection.selectModel(provider, modelName);
    },
    [discardChatImage, modelSelection],
  );
  const reloadModelSelection = modelSelection.reload;

  // auto AI response setting
  const storedAutoAiResponse = useUiControlStore((state) => state.autoAiResponse);
  const autoAiResponse = autoAiResponseOverride ?? storedAutoAiResponse;
  const assistantVoiceEnabled = useUiControlStore((state) => state.assistantVoiceEnabled);
  const assistantVoiceAutoplay = useUiControlStore((state) => state.assistantVoiceAutoplay);
  const assistantVoiceSpeed = useUiControlStore((state) => state.assistantVoiceSpeed);
  const voiceAnalysisEnabled = useUiControlStore((state) => state.voiceAnalysisEnabled);
  const conversationHintsEnabled = useUiControlStore((state) => state.conversationHintsEnabled);
  const setConversationHintsEnabled = useUiControlStore((state) => state.setConversationHintsEnabled);

  // 지식 프롬프트 저장/읽기
  const knowledgeContext = usePromptStore((state) => state.knowledgeContext);
  const setKnowledgeContext = usePromptStore((state) => state.setKnowledgeContext);
  const tutorTargetLanguage = usePromptStore((state) => state.tutorTargetLanguage);
  const setTutorTargetLanguage = usePromptStore((state) => state.setTutorTargetLanguage);
  const tutorConversationLevel = usePromptStore((state) => state.tutorConversationLevel);
  const setTutorConversationLevel = usePromptStore((state) => state.setTutorConversationLevel);
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

  const tutorTargetLanguageCode = useMemo(() => {
    if (!isTutorsRoute) return "";
    return normalizeTutorLanguageForComparison(
      tutorTargetLanguage || tutorsConversationHint?.targetLanguage || character?.language || "",
    );
  }, [character?.language, isTutorsRoute, tutorTargetLanguage, tutorsConversationHint?.targetLanguage]);
  const setTranslationEnabled = translationSettings.setEnabled;

  const defaultTutorTargetLanguage = useMemo(() => {
    if (!isTutorsRoute) return "";
    return normalizeTutorTargetLanguage(
      tutorsConversationHint?.targetLanguage || character?.language || DEFAULT_TUTOR_TARGET_LANGUAGE,
      DEFAULT_TUTOR_TARGET_LANGUAGE,
    );
  }, [character?.language, isTutorsRoute, tutorsConversationHint?.targetLanguage]);

  useEffect(() => {
    if (!isTutorsRoute) {
      setTutorTargetLanguage("");
      return;
    }
    if (open) setTutorTargetLanguage(defaultTutorTargetLanguage);
  }, [defaultTutorTargetLanguage, isTutorsRoute, open, setTutorTargetLanguage]);

  const defaultTutorConversationLevel = useMemo(() => {
    if (!isTutorsRoute) return "";
    const policy = toUnknownRecord(character?.tutorsPolicy);
    return normalizeTutorConversationLevel(tutorsConversationLevel || policy.conversationLevel);
  }, [character?.tutorsPolicy, isTutorsRoute, tutorsConversationLevel]);

  useEffect(() => {
    if (!isTutorsRoute) {
      setTutorConversationLevel("");
      return;
    }
    if (open) setTutorConversationLevel(defaultTutorConversationLevel);
  }, [defaultTutorConversationLevel, isTutorsRoute, open, setTutorConversationLevel]);

  const tutorPersonaId = character?.pid || "";
  const canPersistTutorConversationLevel =
    isTutorsRoute && Boolean(tutorPersonaId) && toUnknownRecord(character?.tutorsAccess).canEdit !== false;

  const handleTutorConversationLevelChange = useCallback(
    (conversationLevel: TutorConversationLevel) => {
      setTutorConversationLevel(conversationLevel);
      if (!tutorPersonaId || !canPersistTutorConversationLevel) return;

      void updateTutorsPersonaConversationLevel(tutorPersonaId, conversationLevel).catch((error) => {
        logger.warn("[CharacterChat] 튜터 대화 수준 저장 실패:", error);
        toast.error(
          lang({
            ko: "대화 수준을 저장하지 못했습니다. 이번 대화에는 임시로 적용됩니다.",
            en: "Could not save the conversation level. It is applied temporarily for this chat.",
          }),
        );
      });
    },
    [canPersistTutorConversationLevel, setTutorConversationLevel, tutorPersonaId],
  );

  const translationConflictKeyRef = useRef("");
  useEffect(() => {
    if (!open || !isTutorsRoute || !tutorTargetLanguageCode) return;
    if (!translationSettings.enabled) {
      translationConflictKeyRef.current = "";
      return;
    }

    const translationLanguage = normalizeChatTranslationLanguage(translationSettings.targetLanguage);
    if (translationLanguage !== tutorTargetLanguageCode) {
      translationConflictKeyRef.current = "";
      return;
    }

    const conflictKey = `${character?.pid || "tutor"}:${translationLanguage}`;
    setTranslationEnabled(false);
    if (translationConflictKeyRef.current === conflictKey) return;

    translationConflictKeyRef.current = conflictKey;
    toast.info(
      lang({
        ko: "학습 언어와 번역 언어가 같아 이 튜터 채팅에서는 번역을 껐습니다.",
        en: "Translation was turned off because it matches this tutor's learning language.",
      }),
    );
  }, [
    character?.pid,
    isTutorsRoute,
    open,
    setTranslationEnabled,
    translationSettings.enabled,
    translationSettings.targetLanguage,
    tutorTargetLanguageCode,
  ]);

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
        imageInput?: ChatImageInputType;
        imagePreview?: ChatImagePreviewType;
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

  const handleSendWithPendingImage = useCallback(
    async (overrideText?: string, opts?: { preserveInput?: boolean; voiceInput?: Record<string, unknown> }) => {
      const pendingImage = takeChatImage();
      await handleSendWithMessage(overrideText, {
        ...opts,
        imageInput: pendingImage?.input,
        imagePreview: pendingImage?.preview,
      });
    },
    [handleSendWithMessage, takeChatImage],
  );

  const handlePrepareChatImage = useCallback(
    async (file: File, source: ChatImageInputType["source"]) => {
      try {
        await prepareChatImage(file, source);
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        toast.error(
          code === "unsupported_image_type"
            ? lang({ ko: "PNG, JPG, WebP 사진만 선택할 수 있어요.", en: "Choose a PNG, JPG, or WebP image." })
            : code === "image_too_large" || code === "prepared_image_too_large"
              ? lang({ ko: "사진이 너무 커요. 더 작은 사진을 선택해 주세요.", en: "The image is too large." })
              : lang({ ko: "사진을 읽지 못했어요. 다른 사진을 선택해 주세요.", en: "Couldn't read the image." }),
          { id: "tutors-chat-image" },
        );
        throw error;
      }
    },
    [prepareChatImage],
  );

  useEffect(() => {
    if (open) return;
    discardChatImage();
    // 채팅 닫힘은 외부 open 상태와 이미지 선택 시트의 로컬 상태를 동기화해야 한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImagePickerOpen(false);
  }, [discardChatImage, open]);

  const effectiveVoiceRouteHint = useMemo(() => {
    if (isTutorsRoute) return "tutors" as const;
    return isCommerceUniverse ? ("commerce" as const) : ("ai" as const);
  }, [isCommerceUniverse, isTutorsRoute]);

  const effectiveVoiceUniverseId = useMemo(() => {
    if (isTutorsRoute) return String(character?.universeId || universeId || "").trim();
    return String(universeId || "").trim();
  }, [character?.universeId, isTutorsRoute, universeId]);

  const universeMetadata = useMemo(
    () => toUnknownRecord(toUnknownRecord(universeInfo?.data).metadata),
    [universeInfo?.data],
  );
  const voiceConfig = useMemo(() => toUnknownRecord(universeMetadata.voiceConfig), [universeMetadata]);
  const voiceInputProvider: SpeechProviderType = voiceConfig.defaultSttProvider === "qwen" ? "qwen" : "openai";

  const isVoiceUiEnabled = useMemo(() => {
    const voiceEnabled = universeMetadata.voiceEnabled;
    const authEnabled = isLoggedIn || isCommerceUniverse;
    return Boolean(character?.pid) && authEnabled && voiceEnabled !== false;
  }, [character?.pid, isCommerceUniverse, isLoggedIn, universeMetadata]);

  // EL-601/TUTORS-192: Tutors STT는 서버가 활성 상태를 광고할 때만 노출한다.
  // 활성 상태가 없으면 기존처럼 text-only를 유지하고, Assistant TTS 재생은 별도 capability로 유지한다.
  const [tutorsSttStatus, setTutorsSttStatus] = useState<TutorsSttStatus | null>(null);
  const [tutorsSttAcknowledged, setTutorsSttAcknowledged] = useState(false);
  useEffect(() => {
    if (!isTutorsRoute || !isLoggedIn) return;
    let active = true;
    void getTutorsSttStatus()
      .then((status) => {
        if (active) setTutorsSttStatus(status);
      })
      .catch(() => {
        if (active) setTutorsSttStatus(null);
      });
    return () => {
      active = false;
    };
  }, [isLoggedIn, isTutorsRoute]);

  const tutorsSttEnabled = isTutorsRoute && Boolean(tutorsSttStatus?.enabled);
  const tutorsSttLanguageSupported = isTutorSttLanguageSupported(
    tutorsSttStatus?.languages,
    tutorTargetLanguageCode,
  );
  const tutorsSttLanguageNotice =
    isTutorsRoute && tutorsSttStatus && tutorTargetLanguageCode && !tutorsSttLanguageSupported
      ? { supportedLanguages: tutorsSttStatus.languages }
      : undefined;
  const isVoiceInputUiEnabled =
    isVoiceUiEnabled &&
    (!isTutorsRoute || tutorsSttEnabled) &&
    (!isTutorsRoute || tutorsSttLanguageSupported);

  const isAssistantVoiceEnabled = isVoiceUiEnabled && assistantVoiceEnabled;

  // 입력 모드(음성 대화 / 키보드 입력) — 상단 토글과 하단 입력바가 공유하는 단일 소스
  const [voiceInputMode, setVoiceInputMode] = useState<"voice" | "text">(() => (isTutorsRoute ? "text" : "voice"));
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
    // TUTORS-192: 서버 STT 게이트가 language를 요구한다. Tutors 경로는 튜터 목표 언어 코드를
    // 그대로 넘겨 fail-closed 게이트(language_not_allowed)를 통과시킨다.
    language: isTutorsRoute ? tutorTargetLanguageCode || undefined : undefined,
    disclosureAcknowledged: tutorsSttAcknowledged,
    disclosureVersion: tutorsSttStatus?.disclosureVersion,
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
        if (isLoggedIn && conversationUserPersonaId) {
          await saveAssistantAudioMeta({
            personaId,
            userPersonaId: conversationUserPersonaId,
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
      conversationUserPersonaId,
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
  const conversationHints = useConversationHints({
    enabled: Boolean(isTutorsRoute && tutorsConversationHint?.enabled && conversationHintsEnabled),
    open,
    targetLanguage: tutorTargetLanguage || tutorsConversationHint?.targetLanguage || character?.language || "English",
    topic: tutorsConversationHint?.topic,
    provider: translationSettings.helperModelProvider,
    modelName: translationSettings.helperModelName,
    messages,
  });

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
    if ((!currentInput.trim() && !pendingChatImage) || isOverLimit) return true;
    if (translationSettings.enabled && isTranslating) return true;
    return false;
  }, [
    currentInput,
    pendingChatImage,
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
        if ((currentText || pendingChatImage) && !isTranslating) {
          void handleSendWithPendingImage();
        }
      }
    },
    [handleSendWithPendingImage, isTranslating, isSendDisabled, pendingChatImage],
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
            imageAttachment: {
              enabled: chatImageInputEnabled,
              disabled:
                isPreparingConversation ||
                isLoading ||
                showAIEndRequest ||
                isRestricted ||
                isUserMessageAnimating ||
                Boolean(pendingApiRequest) ||
                voiceInput.isRecording ||
                voiceInput.isSubmitting ||
                isTranslating,
              preview: pendingChatImage?.preview ?? null,
              preparing: isPreparingChatImage,
              pickerOpen: imagePickerOpen,
              onPickerOpenChange: setImagePickerOpen,
              onPrepare: handlePrepareChatImage,
              onClear: discardChatImage,
            },
          },
          voice: {
            provider: voiceInputProvider,
            tutorsExperience: isTutorsRoute,
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
            disclosure:
              isTutorsRoute && tutorsSttStatus
                ? {
                    required: true,
                    version: tutorsSttStatus.disclosureVersion,
                    notice: tutorsSttStatus.notice,
                    acknowledged: tutorsSttAcknowledged,
                    onAcknowledge: () => setTutorsSttAcknowledged(true),
                    onDecline: () => {
                      setTutorsSttAcknowledged(false);
                      setVoiceInputMode("text");
                    },
                  }
                : undefined,
            unavailableNotice: tutorsSttLanguageNotice,
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
          tutorTargetLanguage,
          onTutorTargetLanguageChange: isTutorsRoute ? setTutorTargetLanguage : undefined,
          tutorConversationLevel,
          onTutorConversationLevelChange:
            isTutorsRoute && canPersistTutorConversationLevel ? handleTutorConversationLevelChange : undefined,
          conversationHintsAvailable: Boolean(isTutorsRoute && tutorsConversationHint?.enabled),
          conversationHintsEnabled,
          onConversationHintsEnabledChange: setConversationHintsEnabled,
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
        conversationHints={
          isTutorsRoute && tutorsConversationHint?.enabled && conversationHintsEnabled
            ? {
                hints: conversationHints.hints,
                isLoading: conversationHints.isLoading,
                onPick: (hint) => {
                  setCurrentInput(hint);
                  window.setTimeout(() => chatInputRef.current?.focus(), 0);
                },
                onRegenerate: async () => {
                  const outcome = await conversationHints.regenerateHints();
                  if (outcome === "empty") {
                    toast(lang({ ko: "새로운 힌트를 생성하지 못했어요.", en: "Couldn't generate new hints." }), {
                      id: "hint-regenerate",
                    });
                  } else if (outcome === "error") {
                    toast.error(
                      lang({
                        ko: "힌트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
                        en: "Couldn't load hints. Please try again.",
                      }),
                      { id: "hint-regenerate" },
                    );
                  }
                },
              }
            : undefined
        }
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

          handleSendWithMessage: handleSendWithPendingImage,
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
