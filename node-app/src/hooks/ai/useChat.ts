"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useUniverseData } from "hooks/game/core";
import type { IExtendedNpcData } from "types/game";
import type { IPersonaItem, IPersona, AiMessageType, IMessage } from "types/ai";
import type { ChatImageInputType, ChatImagePreviewType, IChatMessage, SystemCodeLikeType } from "types/ai";
import { CHAT_ERROR_TYPE } from "consts/ai";
import { GAME_CONSTANTS as GC } from "consts/game";
import { lang } from "components/module/i18n";
import { useAuthStore } from "store/auth";
import { usePromptStore, useMessageStore, useErrorStore, useAIChatStore } from "store/chat";
import { useUserDataStore } from "store/game";
import { useGlobalStore } from "store/global";
import { stableMsgId, toDate } from "utils/common";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";
import { calculateIntimacyIncrease, createChatMessageMeta } from "utils/ai";
import { ensureGuestId } from "utils/normalize";
import type { SendGuestOptions } from "store/chat/aiChatStore";
import { DEFAULT_WORLD_UNIVERSE, TUTORS_NAMESPACE_KEY } from "consts/app";
import { completeTutorsSession } from "libs/api/tutors/progress";
import { settleNpcConversation } from "libs/api/game/npcIntimacyClient";
import { buildNpcConversationResult } from "utils/game/npcConversationResult";
import type { NpcConversationResult } from "types/game/npc-conversation-result";
import { trackPlayEvent } from "utils/analytics/play";

/**
 * @docHint
 * @purpose useChat 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain ai
 * @scope global
 */

export function useChat(
  character: IExtendedNpcData | null,
  modelOverride?: { provider?: SendGuestOptions["provider"]; modelName?: string },
) {
  const pathname = usePathname();
  const isTutorsRoute = pathname.startsWith("/tutors");
  const isPlayRoute = pathname === "/play" || pathname.startsWith("/play/");
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [conversationHistoryMessages, setConversationHistoryMessages] = useState<IChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isOverLimit, setIsOverLimit] = useState(false);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [lastMessageSender, setLastMessageSender] = useState<AiMessageType | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // 로그인 상태 확인
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const user = useAuthStore((state) => state.user);
  const language = useGlobalStore((state) => state.language);

  const { universeId, isCommerceUniverse } = useUniverseData();
  const userData = useUserDataStore((state) => state.userData);
  const userPersonaId = userData?.selectedPersonas ? userData?.selectedPersonas[universeId] : "";
  const effectiveUniverseId = isTutorsRoute ? String(character?.universeId || universeId || "").trim() : universeId;
  const conversationUserPersonaId = isTutorsRoute ? TUTORS_NAMESPACE_KEY : userPersonaId;

  // 게스트 ID는 "커머스 + 비로그인"일 때만 필요 (부작용/불필요한 storage write 줄이기)
  const guestId = useMemo(() => {
    if (!isCommerceUniverse || isLoggedIn) return undefined;
    return ensureGuestId();
  }, [isCommerceUniverse, isLoggedIn]);

  const updatePersonaInteraction = useUserDataStore((state) => state.updatePersonaInteraction);
  const updatePersonaIntimacy = useUserDataStore((state) => state.updatePersonaIntimacy);
  const updatePersonaStats = useUserDataStore((state) => state.updatePersonaStats);
  const getPersonaData = useUserDataStore((state) => state.getPersonaData);
  const addPersonaFromNPC = useUserDataStore((state) => state.addPersonaFromNPC);
  const getPersonaType = useUserDataStore((state) => state.getPersonaType);

  // 선택된 캐릭터 설정
  const setCurrentCharacter = usePromptStore((state) => state.setCurrentCharacter);
  const setAllowNative = usePromptStore((state) => state.setAllowNative);

  // 메시지 관련 상태
  const conversations = useMessageStore((state) => state.conversations);
  const conversationHistoryStatus = useMessageStore((state) => state.conversationHistoryStatus);
  const sessionId = useMessageStore((state) => state.sessionId);
  const isConversationHistoryReady = character?.pid
    ? conversationHistoryStatus[character.pid] === "ready"
    : false;
  const hasConversationHistory = character?.pid
    ? (conversations[character.pid] || []).some(
        (message) => message.sessionId !== sessionId && !isInternalAutoPromptMessage(message),
      )
    : false;

  // 에러 관련 상태
  const errorType = useErrorStore((state) => state.errorType);
  const errorMessage = useErrorStore((state) => state.error);

  // AI 통신 관련 상태
  const isLoading = useAIChatStore((state) => state.isLoading);
  const sendMessageToAI = useAIChatStore((state) => state.sendMessage);

  const prevPidRef = useRef<string | null>(null);

  // ----------------------------------
  // 공통: 게스트 ID / AI 옵션 / 저장 헬퍼
  // ----------------------------------
  const buildAiRequestOptions = useCallback(
    (overrides: Partial<SendGuestOptions> = {}): SendGuestOptions => {
      const routeHint: SendGuestOptions["routeHint"] = isTutorsRoute
        ? "tutors"
        : isCommerceUniverse
          ? "commerce"
          : "ai";

      return {
        // 게스트는 커머스 + 비로그인일 때만
        guestId: !isLoggedIn && isCommerceUniverse ? guestId : undefined,
        routeHint,
        universeId: effectiveUniverseId || undefined,
        sessionId: useMessageStore.getState().sessionId,
        userPersonaId: conversationUserPersonaId || undefined,
        promptOptions: usePromptStore.getState().getPromptOptions(), // 최신값을 매번 읽는 구조 OK
        provider: modelOverride?.provider,
        modelName: modelOverride?.modelName,
        ...overrides,
      };
    },
    [
      isLoggedIn,
      isTutorsRoute,
      isCommerceUniverse,
      effectiveUniverseId,
      conversationUserPersonaId,
      guestId,
      modelOverride?.provider,
      modelOverride?.modelName,
    ],
  );

  const sendToAI = useCallback(
    (prompt: string, personaId: string, overrides: Partial<SendGuestOptions> = {}) => {
      return sendMessageToAI(prompt, personaId, buildAiRequestOptions(overrides));
    },
    [sendMessageToAI, buildAiRequestOptions],
  );

  const persistAssistantMessage = useCallback(
    async (args: {
      personaId: string;
      content: string;
      location: string;
      systemCode?: SystemCodeLikeType[];
      translation?: string;
      productCode?: string[];
      timestamp?: Date;
      clientId?: string;
    }) => {
      const { personaId, content, location, systemCode, translation, productCode } = args;
      const meta = createChatMessageMeta("assistant", {
        clientId: args.clientId,
        timestamp: args.timestamp,
        seed: "persist-assistant",
      });

      const ts = meta.timestamp;
      const clientId = meta.clientId;
      const sessionId = useMessageStore.getState().sessionId;

      if (isTutorsRoute) {
        // Tutors의 영속 저장 소유자는 tutors/chat route다. 클라이언트는 응답을 로컬에만 반영한다.
        const alreadyPresent = useMessageStore
          .getState()
          .conversations[personaId]?.some((message) => message.sessionId === sessionId && message.clientId === clientId);
        if (!alreadyPresent) {
          useMessageStore.getState().addMessage(personaId, {
            role: "assistant",
            content,
            sessionId,
            timestamp: ts,
            clientId,
            ...(translation ? { translation } : {}),
            ...(systemCode ? { systemCode } : {}),
            ...(productCode ? { productCode } : {}),
          });
        }
        return true;
      }

      if (isLoggedIn && user?.id && conversationUserPersonaId) {
        await useMessageStore.getState().saveMessage({
          userId: user.id,
          personaId,
          userPersonaId: conversationUserPersonaId,
          sessionId,
          content,
          isUser: false,
          location: isTutorsRoute ? TUTORS_NAMESPACE_KEY : location,
          systemCode,
          translation,
          productCode,
          timestamp: ts,
          clientId,
        });
        return true;
      }

      if (!isLoggedIn && isCommerceUniverse && effectiveUniverseId && guestId) {
        await useMessageStore.getState().saveMessageAsGuest?.({
          guestId,
          personaId,
          universeId: effectiveUniverseId,
          sessionId,
          content,
          isUser: false,
          location,
          systemCode,
          translation,
          productCode,
          timestamp: ts,
          clientId,
        });
        return true;
      }

      return false;
    },
    // React Compiler 의존성 추론(`user`)과 정합성을 맞추기 위해 `user?.id` 대신 `user` 사용
    [isTutorsRoute, isLoggedIn, user, conversationUserPersonaId, isCommerceUniverse, effectiveUniverseId, guestId],
  );

  // 실시간 친밀도 업데이트
  const updateIntimacy = useCallback(
    async (
      character: IExtendedNpcData,
      systemCode: SystemCodeLikeType[],
      messageText?: string,
      isFirstInteraction?: boolean,
    ) => {
      if (isPlayRoute || isTutorsRoute || !isLoggedIn || !effectiveUniverseId || !character.pid) return null;

      try {
        const personaType = await getPersonaType(effectiveUniverseId, character.pid);
        if (!personaType) return null;

        const currentPersona = await getPersonaData(effectiveUniverseId, character.pid, personaType);
        if (!currentPersona) return null;

        // personas 데이터의 친밀도만 계산
        const messageLength = messageText ? messageText.length : 0;
        const isFirstChat = isFirstInteraction ?? (currentPersona.totalInteractions || 0) === 0;

        // personas 친밀도는 별도 로직으로 계산 (conversation과 독립)
        const personasIntimacyIncrease = calculateIntimacyIncrease(messageLength, isFirstChat, systemCode);

        // personas 데이터의 현재 친밀도에서만 변화량 적용
        const newPersonasIntimacy = Math.max(
          0,
          Math.min(999, (currentPersona.intimacy || 0) + personasIntimacyIncrease),
        );

        // personas 친밀도만 업데이트 (conversation과 분리)
        const updatedPersona = await updatePersonaIntimacy(
          effectiveUniverseId,
          character.pid,
          newPersonasIntimacy,
          personaType,
          true,
          { silent: true },
        );

        logger.log(
          `[useChat] 친밀도 업데이트:`,
          {
            characterName: character.name,
            systemCode,
            messageLength,
            isFirstChat,
            previousPersonasIntimacy: currentPersona.intimacy || 0,
            personasIntimacyIncrease,
            newPersonasIntimacy,
            updatedPersona,
          },
          {
            color: "blue",
            fontWeight: "bold",
          },
        );

        return updatedPersona;
      } catch (error) {
        logger.error("systemCode 기반 친밀도 업데이트 실패:", error);
        return null;
      }
    },
    [isPlayRoute, isTutorsRoute, isLoggedIn, effectiveUniverseId, getPersonaType, getPersonaData, updatePersonaIntimacy],
  );

  // 유저 캐릭터 능력치 업데이트 함수 (updatePersonaOnMessage 함수 내부에 추가)
  const updateUserCharacterStats = useCallback(
    async (messageText: string, intimacyIncrease: number, isFirstInteraction: boolean) => {
      if (isTutorsRoute || !isLoggedIn || !effectiveUniverseId || !userPersonaId) return;

      try {
        // 유저 캐릭터는 항상 userPersonas에 포함
        const userPersonaType = await getPersonaType(effectiveUniverseId, userPersonaId);
        if (!userPersonaType) {
          logger.warn("유저 캐릭터를 찾을 수 없습니다:", userPersonaId);
          return;
        }

        const currentUserPersona = await getPersonaData(
          effectiveUniverseId,
          userPersonaId,
          userPersonaType || "userPersonas",
        );
        if (!currentUserPersona) {
          logger.warn("유저 캐릭터 데이터를 찾을 수 없습니다:", userPersonaId);
          return;
        }

        // 유저 캐릭터 능력치 업데이트 계산
        const userUpdates: Partial<IPersonaItem> = {};

        // 대화를 통한 기본 경험치 획득
        const baseXpGain = Math.floor(messageText.length / 10) + 1; // 10글자당 1xp
        userUpdates.xp = Math.min(999, (currentUserPersona.xp || 0) + baseXpGain);

        // 레벨업 체크 (경험치 100당 레벨 1 증가)
        const newLevel = Math.min(999, Math.floor((userUpdates.xp || 0) / 100) + 1);
        if (newLevel > (currentUserPersona.level || 1)) {
          userUpdates.level = newLevel;
          logger.log(`유저 캐릭터 레벨업: ${currentUserPersona.level} → ${newLevel}`);
        }

        // 대화를 통한 감성(EQ) 증가
        const baseEqIncrease = messageText.length > 50 ? 1 : 0.5;
        userUpdates.eq = Math.min(150, (currentUserPersona.eq || 50) + baseEqIncrease);

        // 첫 대화일 때 지성(IQ) 소폭 증가
        if (isFirstInteraction) {
          userUpdates.iq = Math.min(150, (currentUserPersona.iq || 50) + 0.5);
        }

        // 장기간 대화할 때 정신력(MP) 소모
        if (messageText.length > 100) {
          userUpdates.mp = Math.max(50, (currentUserPersona.mp || 100) - 1);
        }

        // 대화 횟수에 따른 행운 증가 (10회마다 +1, 최대 10)
        const totalInteractions = (currentUserPersona.totalInteractions || 0) + 1;
        if (totalInteractions % 10 === 0) {
          userUpdates.luck = Math.min(10, (currentUserPersona.luck || 0) + 1);
        }

        // 분위기 업데이트 (감성 수치에 따라)
        // const newEq = userUpdates.eq || currentUserPersona.eq || 50;
        // if (newEq >= 120) {
        //   userUpdates.mood = "cheerful";
        // } else if (newEq >= 100) {
        //   userUpdates.mood = "optimistic";
        // } else if (newEq >= 80) {
        //   userUpdates.mood = "confident";
        // }

        // 상호작용 정보 업데이트
        userUpdates.lastInteraction = new Date().toISOString();

        // 업데이트 적용
        if (Object.keys(userUpdates).length > 0) {
          await updatePersonaStats(effectiveUniverseId, userPersonaId, userUpdates, userPersonaType, {
            silent: true,
          });
          logger.log(`유저 캐릭터 능력치 업데이트:`, userUpdates);
        }

        // 유저 캐릭터 상호작용 수 증가
        await updatePersonaInteraction(effectiveUniverseId, userPersonaId, userPersonaType, { silent: true });
      } catch (error) {
        logger.error("유저 캐릭터 능력치 업데이트 실패:", error);
      }
    },
    [
      isTutorsRoute,
      isLoggedIn,
      effectiveUniverseId,
      userPersonaId,
      getPersonaType,
      getPersonaData,
      updatePersonaStats,
      updatePersonaInteraction,
    ],
  );

  // 메시지 전송 시 능력치 업데이트 함수
  const updatePersonaOnMessage = useCallback(
    async (character: IExtendedNpcData, messageText: string) => {
      if (isTutorsRoute || !isLoggedIn || !effectiveUniverseId || !character.pid) return;

      try {
        // 먼저 캐릭터가 어디에 존재하는지 확인
        const checkPersonaExists = useUserDataStore.getState().checkPersonaExists;
        const existsCheck = await checkPersonaExists(effectiveUniverseId, character.pid);

        let finalPersonaType: "personas" | "userPersonas";

        if (!existsCheck.exists) {
          // 처음 만난 NPC라면 personas에 추가
          logger.log("처음 만난 NPC, personas에 추가:", character.name);
          await addPersonaFromNPC(effectiveUniverseId, character);
          finalPersonaType = "personas";
        } else {
          // 이미 존재하는 경우 해당 위치 사용
          finalPersonaType = existsCheck.location as "personas" | "userPersonas";
          logger.log(`기존 캐릭터 발견 (${finalPersonaType}):`, character.name);
        }

        // 상호작용 증가 먼저 수행, 그 결과 totalInteractions로 XP 타이밍 결정
        const afterInteraction = await updatePersonaInteraction(effectiveUniverseId, character.pid, finalPersonaType, {
          silent: true,
        });

        const totalInteractions = afterInteraction?.totalInteractions ?? 0;
        const isFirstInteraction = totalInteractions === 1; // 증가 후 1이면 "첫 상호작용"

        // 5회마다 XP +1 (증가 후 기준으로 판정)
        if (totalInteractions > 0 && totalInteractions % 5 === 0) {
          await updatePersonaStats(effectiveUniverseId, character.pid, {}, finalPersonaType, {
            silent: true,
            inc: { xp: 1 },
          });
        }

        // 유저 캐릭터 능력치 업데이트 (silent)
        await updateUserCharacterStats(messageText, 0, isFirstInteraction);
      } catch (error) {
        logger.error("페르소나 능력치 업데이트 실패:", error);
      }
    },
    [
      isTutorsRoute,
      isLoggedIn,
      effectiveUniverseId,
      addPersonaFromNPC,
      updatePersonaInteraction,
      updatePersonaStats,
      updateUserCharacterStats,
    ],
  );

  // 언어 설정 변경 시 allowNative 업데이트
  useEffect(() => {
    // 기본적으로 한국어면 true, 영어면 false
    let shouldAllowNative = language === "ko";

    // `DEFAULT_WORLD_UNIVERSE` 유니버스이고 administrator 권한이 없으면 false로 설정
    if (
      effectiveUniverseId === DEFAULT_WORLD_UNIVERSE &&
      (!userData?.roles || !userData.roles.includes("administrator"))
    ) {
      shouldAllowNative = false;
    }

    setAllowNative(shouldAllowNative);
  }, [language, effectiveUniverseId, userData?.roles, setAllowNative]);

  // 캐릭터가 변경될 때 설정 업데이트
  useEffect(() => {
    if (character) {
      setCurrentCharacter(character);

      // 로그인 상태 확인 후 대화 히스토리 및 아카이브 데이터 로드
      if (isLoggedIn && user?.id && conversationUserPersonaId && character.pid) {
        // 게임 타입, 로그인 상태일 경우
        useMessageStore.getState().loadConversationHistory(character.pid, conversationUserPersonaId);
      } else if (!isLoggedIn && isCommerceUniverse && guestId && character.pid && effectiveUniverseId) {
        // 커머스 타입일 경우
        useMessageStore.getState().loadConversationHistoryAsGuest(character.pid, effectiveUniverseId);
      }
      logger.log(`캐릭터 설정 완료: ${character.name}`);
    }
  }, [
    character,
    isLoggedIn,
    isCommerceUniverse,
    user,
    effectiveUniverseId,
    conversationUserPersonaId,
    guestId,
    setCurrentCharacter,
  ]);

  // 대화 내역 변경 시 메시지 업데이트
  useEffect(() => {
    const pid = character?.pid ?? null;

    // 캐릭터가 없으면 완전 초기화
    if (!pid) {
      // 캐릭터 미선택 상태에서 외부 store(character)에 동기화하기 위한 초기화 — 파생 상태로 대체 시
      // setMessages가 외부에 노출되어 있어 호출부 변경 범위가 커지므로 현 패턴 유지
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      setLastMessageSender(null);
      setIsFirstMessage(true);
      prevPidRef.current = null;
      return;
    }

    const pidChanged = prevPidRef.current && prevPidRef.current !== pid;
    prevPidRef.current = pid;

    const raw = conversations[pid] ?? []; // 없으면 빈 배열
    const historyMessages = raw
      .filter((msg: IMessage) => msg?.role === "user" || msg?.role === "assistant")
      .filter((msg: IMessage) => !isInternalAutoPromptMessage(msg))
      .map((msg: IMessage, i: number) => {
        const timeStamp = toDate(msg.timestamp);
        const stableId =
          msg.clientId || stableMsgId(msg.role === "user" ? "user" : "assistant", timeStamp, msg.content, i);

        return {
          id: stableId,
          text: msg.content,
          isUser: msg.role === "user",
          translation: msg.translation,
          clientId: msg.clientId,
          systemCode: msg.systemCode,
          productCode: msg.productCode,
          audioMeta: msg.audioMeta,
          imagePreview: msg.imagePreview,
          sessionId: msg.sessionId,
          timestamp: timeStamp,
        };
      });
    const storeMessages = historyMessages.filter((message) => message.sessionId === sessionId);
    setConversationHistoryMessages(historyMessages);

    setMessages((prev) => {
      // 캐릭터가 바뀌면 이전 캐릭터의 error - 버블/임시메시지 제거
      if (pidChanged) return storeMessages;

      const ephemeral = prev.filter((m) => m.id.startsWith("error-"));
      const storeIds = new Set(storeMessages.map((m) => m.id));
      const keptEphemeral = ephemeral.filter((m) => !storeIds.has(m.id));
      return [...storeMessages, ...keptEphemeral];
    });

    if (storeMessages.length > 0) {
      const last = storeMessages[storeMessages.length - 1];
      setLastMessageSender(last.isUser ? "user" : "assistant");
      setIsFirstMessage(false);
    } else {
      setLastMessageSender(null);
      setIsFirstMessage(true);
    }
  }, [character?.pid, conversations, sessionId]);

  // 입력 처리 함수
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>, limitMsgLength: number) => {
    const text = e.target.value;

    // 유저 등급별 제한 글자수를 초과하면 입력을 제한
    if (text.length <= limitMsgLength) {
      setCurrentInput(text);
      setIsOverLimit(false);
    } else {
      // 제한된 글자수까지만 잘라서 입력
      setCurrentInput(text.slice(0, limitMsgLength));
      setIsOverLimit(true);
    }
  }, []);

  // 메시지 전송 처리
  const errorMsg = lang({ ko: "로그인이 필요합니다.", en: "Login is required." });
  const handleSendMessage = useCallback(
    async (
      messageText?: string,
      meta?: {
        clientId?: string;
        translation?: string;
        timestamp?: Date;
        optimisticLocalAdd?: boolean;
        voiceInput?: Record<string, unknown>;
        imageInput?: ChatImageInputType;
        imagePreview?: ChatImagePreviewType;
      },
    ) => {
      const visibleText = messageText?.trim() || currentInput.trim();
      const textToSend =
        visibleText ||
        (meta?.imageInput
          ? lang({
              ko: "사진을 보냈어요.",
              en: "I sent a photo.",
            })
          : "");

      // ai 유니버스는 비로그인 호출 불가능(withAuth)하기 때문에 조기 차단 처리
      if (!isCommerceUniverse && !isLoggedIn) {
        useErrorStore.getState().setError?.(errorMsg, CHAT_ERROR_TYPE.SYSTEM_ERROR);
        return { success: false, error: errorMsg, errorType: CHAT_ERROR_TYPE.SYSTEM_ERROR };
      }

      // (버그 방지) 로그인인데 userPersonaId가 없으면 저장/표시가 모두 깨질 수 있음
      if (isLoggedIn && user?.id && !conversationUserPersonaId) {
        const msg = lang({
          ko: "유저 페르소나가 선택되지 않았습니다. (userPersonaId 누락)",
          en: "No user persona selected. (userPersonaId missing)",
        });
        useErrorStore.getState().setError?.(msg, CHAT_ERROR_TYPE.SYSTEM_ERROR);
        return { success: false, error: msg, errorType: CHAT_ERROR_TYPE.SYSTEM_ERROR };
      }

      // (UX) 이전 error-* 버블은 다음 전송에서 정리
      setMessages((prev) => prev.filter((m) => !String(m.id || "").startsWith("error-")));

      if ((!visibleText && !meta?.imageInput) || !character) {
        return {
          success: false,
          error: lang({
            ko: "메시지가 비어있거나 캐릭터가 선택되지 않았습니다.",
            en: "Message is empty or no character was selected.",
          }),
        };
      }

      useErrorStore.getState().clearError();

      if (!messageText) setCurrentInput("");

      setIsOverLimit(false);
      setLastMessageSender("user");

      const sessionId = useMessageStore.getState().sessionId;
      const fixed = createChatMessageMeta("user", {
        clientId: meta?.clientId,
        timestamp: meta?.timestamp,
        seed: "send-user",
      });

      const ts = fixed.timestamp;
      const clientId = fixed.clientId;
      const assistantClientId = isTutorsRoute
        ? `tutors-assistant:${clientId}`.slice(0, 160)
        : createChatMessageMeta("assistant", { seed: "send-assistant" }).clientId;

      try {
        // 유저 메시지 저장
        if (!isTutorsRoute && isLoggedIn && user?.id && conversationUserPersonaId && character.pid) {
          const saved = await useMessageStore.getState().saveMessage(
            {
              userId: user.id,
              personaId: character.pid,
              userPersonaId: conversationUserPersonaId,
              sessionId,
              content: textToSend,
              isUser: true,
              location: isTutorsRoute ? TUTORS_NAMESPACE_KEY : "chat-window",
              translation: meta?.translation,
              clientId,
              timestamp: ts,
            },
            { optimisticLocalAdd: meta?.optimisticLocalAdd ?? true },
          );

          // 저장 성공 이후에 persona 업데이트
          if (saved && !isTutorsRoute) {
            updatePersonaOnMessage(character, textToSend).catch((error) => {
              logger.warn("페르소나 능력치 업데이트 실패 (무시됨):", error);
            });
          }
        } else if (!isLoggedIn && isCommerceUniverse && character.pid && effectiveUniverseId) {
          const effectiveGuestId = ensureGuestId(guestId);
          if (effectiveGuestId) {
            await useMessageStore.getState().saveMessageAsGuest?.(
              {
                guestId: effectiveGuestId,
                personaId: character.pid,
                universeId: effectiveUniverseId,
                sessionId,
                content: textToSend,
                isUser: true,
                location: "chat-window",
                translation: meta?.translation,
                clientId,
                timestamp: ts,
              },
              { optimisticLocalAdd: meta?.optimisticLocalAdd ?? true },
            );
          }
        }

        let response = await sendToAI(textToSend, character.pid, {
          userClientId: clientId,
          assistantClientId,
          voiceInput: meta?.voiceInput,
          imageInput: meta?.imageInput,
        });

        // provider operationId는 같은 userClientId에 묶여 있으므로, 저장 실패 때만 route를 재호출해
        // provider 재호출·재과금 없이 message upsert를 한 번 재시도한다.
        if (!response.isError && isTutorsRoute && toUnknownRecord(response.meta).saveOk === false) {
          response = await sendToAI(textToSend, character.pid, {
            userClientId: clientId,
            assistantClientId,
            voiceInput: meta?.voiceInput,
            imageInput: meta?.imageInput,
          });
        }

        const tutorPersistenceFailed =
          isTutorsRoute && !response.isError && toUnknownRecord(response.meta).saveOk === false;

        if (!response.isError && !tutorPersistenceFailed) {
          await persistAssistantMessage({
            personaId: character.pid,
            content: response.content,
            location: "chat-window",
            systemCode: response.systemCode,
            translation: response.translation,
            productCode: response.productCode,
            timestamp: new Date(),
            clientId: assistantClientId,
          });

        }

        if (!response.isError && !tutorPersistenceFailed) {
          // 성공 시 error-* 잔존 방지
          setMessages((prev) => prev.filter((m) => !String(m.id || "").startsWith("error-")));
          setLastMessageSender("assistant");
          setIsFirstMessage(false);
          return { success: true };
        }

        // 에러 메시지는 “rawMessage 우선”
        const latestType = useErrorStore.getState().errorType;
        const errorMsg = tutorPersistenceFailed
          ? lang({
              ko: "메시지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
              en: "The message could not be saved. Please try again shortly.",
            })
          : useErrorStore.getState().getErrorMessage(latestType, undefined, response.error);

        setMessages((prev) => [
          ...prev,
          { id: `error-${Date.now()}`, text: errorMsg, isUser: false, timestamp: new Date() },
        ]);

        setLastMessageSender("assistant");
        return { success: false, error: errorMsg, errorType: latestType };
      } catch (error) {
        logger.error("메시지 전송 중 오류:", error);

        const errorMsg = lang({
          ko: "메시지 전송 중 오류가 발생했습니다.",
          en: "An error occurred while sending the message.",
        });

        setMessages((prev) => [
          ...prev,
          { id: `error-${Date.now()}`, text: errorMsg, isUser: false, timestamp: new Date() },
        ]);

        setLastMessageSender("assistant");
        return { success: false, error: errorMsg };
      }
    },
    [
      character,
      currentInput,
      isLoggedIn,
      user,
      conversationUserPersonaId,
      effectiveUniverseId,
      isTutorsRoute,
      isCommerceUniverse,
      guestId,
      sendToAI,
      persistAssistantMessage,
      updatePersonaOnMessage,
      errorMsg,
    ],
  );

  // 대화 종료 시 호출
  const handleConversationEnd = useCallback(async (): Promise<NpcConversationResult | null> => {
    if (isPlayRoute) {
      trackPlayEvent("npc_talk_end", {
        universeId: effectiveUniverseId,
        messageCount: messages.length,
        outcome: isLoggedIn ? "completed" : "guest",
      });
    }
    if (!character || !isLoggedIn) return null;

    if (isTutorsRoute) {
      if (!sessionId) return null;
      try {
        const result = await completeTutorsSession({ personaId: character.pid, sessionId });
        logger.log("Tutors 세션 정산 완료", result.data);
      } catch (error) {
        logger.warn("Tutors 세션 정산 보류", error);
      }
      return null;
    }

    if (!effectiveUniverseId) return null;

    let playResult: NpcConversationResult | null = null;
    if (isPlayRoute && conversationUserPersonaId && sessionId) {
      try {
        const settlement = await settleNpcConversation({
          npcId: character.pid,
          userPersonaId: conversationUserPersonaId,
          conversationSessionId: sessionId,
        });
        logger.log("Play NPC 친밀도 서버 정산 완료", settlement.data);
        if (
          settlement.ok &&
          !settlement.duplicate &&
          !settlement.inProgress &&
          settlement.data.status === "applied"
        ) {
          playResult = buildNpcConversationResult({
            npcId: character.pid,
            npcName: character.name,
            appliedGain: settlement.data.appliedGain,
            intimacy: settlement.data.intimacy.intimacy,
          });
          trackPlayEvent("intimacy_gain", {
            universeId: effectiveUniverseId,
            intimacyGain: settlement.data.appliedGain,
            outcome: "applied",
          });
        }
      } catch (error) {
        logger.warn("Play NPC 친밀도 서버 정산 보류", error);
      }
    }

    try {
      const personaType = await getPersonaType(effectiveUniverseId, character.pid);
      if (!personaType) return playResult;

      // 최종 상호작용 시간 업데이트
      await updatePersonaInteraction(effectiveUniverseId, character.pid, personaType);

      // 대화 세션 완료에 따른 보너스 (옵션)
      const currentPersona = await getPersonaData(effectiveUniverseId, character.pid, personaType);
      if (currentPersona && messages.length > 5) {
        // 5번 이상 대화했을 때
        await updatePersonaStats(
          effectiveUniverseId,
          character.pid,
          {
            eq: Math.min(150, (currentPersona.eq || 50) + 1), // 감성 +1
          },
          personaType,
          { silent: true },
        );
      }

      logger.log(`대화 종료 처리 완료: ${character.name}`);
    } catch (error) {
      logger.error("대화 종료 처리 실패:", error);
    }
    return playResult;
  }, [
    character,
    isPlayRoute,
    isTutorsRoute,
    isLoggedIn,
    effectiveUniverseId,
    conversationUserPersonaId,
    getPersonaType,
    updatePersonaInteraction,
    getPersonaData,
    updatePersonaStats,
    messages.length,
    sessionId,
  ]);

  // 캐릭터에게 인사 메시지 요청 - 프롬프트 준비 확인
  const requestGreeting = useCallback(async () => {
    if (!character) return null;

    // ai 유니버스는 비로그인 호출 불가능(withAuth)하기 때문에 조기 차단 처리
    if (!isCommerceUniverse && !isLoggedIn) {
      useErrorStore.getState().setError?.(errorMsg, CHAT_ERROR_TYPE.SYSTEM_ERROR);
      return { success: false, error: errorMsg, errorType: CHAT_ERROR_TYPE.SYSTEM_ERROR };
    }

    try {
      // 이전 대화 기록 확인(호출 시점의 최신 스토어 값)
      const storeConversations = useMessageStore.getState().conversations;
      const existing = storeConversations[character.pid] || [];
      const hasConversationHistory = existing.some((message) => !isInternalAutoPromptMessage(message));

      // 이전 대화 기록 여부 판단
      let promptMessage: string;

      if (hasConversationHistory) {
        // 이전 대화 기록이 있을 경우
        promptMessage = `**상대방과 시간이 지난 뒤 다시 만났습니다. 이전 대화 기록의 핵심 맥락을 참고하되 마지막 문장을 그대로 반복하지 말고, ${GC.UI.SMALL_TALK_LIMIT}자 이내의 자연스러운 질문이나 후속 화제로 새 대화를 시작하세요.**`;
      } else {
        // 이전 대화 기록이 없을 경우 유니버스 타입에 따라 초기 인사말 프롬프트 사용
        let roleName = lang({
          ko: "상담원",
          en: "advisor",
        });

        if (character.personaType === "human") {
          const human = character as IPersona;
          if (human.job && human.job.trim().length > 0) {
            roleName = human.job;
          }
        }

        promptMessage = isCommerceUniverse
          ? `**당신은 ${universeId}의 ${roleName}입니다. ${GC.UI.SMALL_TALK_LIMIT}자 이내로 정중하고 상냥하게 상대방에게 인사를 건네세요.**`
          : `**상대방과 처음 만났습니다. ${GC.UI.SMALL_TALK_LIMIT}자 이내로 당신의 역할과 성격에 맞게 인사 또는 대화를 건네세요.**`;
      }

      logger.log("[useChat] requestGreeting 프롬프트 결정:", {
        hasConversationHistory,
        isCommerceUniverse,
        selectedPrompt: hasConversationHistory ? "이전 대화 기록 기반" : "초기 인사말",
        promptMessage,
      });

      const response = await sendToAI(promptMessage, character.pid);

      // 오류 정보를 포함한 응답 반환
      if (response.isError) {
        return {
          success: false,
          content: null,
          error: response.error,
          errorType: useErrorStore.getState().errorType, // 호출 시점 최신
        };
      }

      await persistAssistantMessage({
        personaId: character.pid,
        content: response.content,
        location: "initial-greeting",
        systemCode: response.systemCode,
        translation: response.translation,
        productCode: response.productCode,
        timestamp: new Date(),
        clientId: `ast-greet-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });

      return { success: true, content: response.content };
    } catch (error) {
      logger.error("인사 메시지 요청 중 오류:", error);
      return {
        success: false,
        content: null,
        error:
          error instanceof Error
            ? error.message
            : lang({
                ko: "인사 메시지 요청 중 오류가 발생했습니다",
                en: "An error occurred while requesting a greeting message",
              }),
      };
    }
  }, [character, isLoggedIn, isCommerceUniverse, sendToAI, persistAssistantMessage, errorMsg, universeId]);

  // 메시지 초기화
  const clearMessages = useCallback(() => {
    if (character?.pid) {
      useMessageStore.getState().clearMessages(character.pid);
      setMessages([]);
      setLastMessageSender(null);
      setIsFirstMessage(true);
    }
    // React Compiler 의존성 추론(`character`)과 정합성을 맞추기 위해 `character?.pid` 대신 `character` 사용
  }, [character]);

  return {
    messages,
    conversationHistoryMessages,
    isConversationHistoryReady,
    hasConversationHistory,
    setMessages,
    currentInput,
    isLoading,
    isOverLimit,
    isFirstMessage,
    setIsFirstMessage,
    lastMessageSender,
    setLastMessageSender,
    errorType,
    errorMessage,
    setCurrentInput,
    handleInputChange,
    handleSendMessage,
    requestGreeting,
    clearMessages,
    setIsInitialized,
    isInitialized,
    handleConversationEnd,
    getPersonaData: (personaId: string, type?: "personas" | "userPersonas") =>
      getPersonaData(effectiveUniverseId || "", personaId, type),
    updateIntimacy,
  };
}

function isInternalAutoPromptMessage(message: Pick<IMessage, "role" | "content">) {
  if (message.role !== "user") return false;

  const content = String(message.content || "").trim();
  const normalized = content.replace(/\s+/g, " ");
  return (
    normalized.startsWith("**상대방과 시간이 지난 뒤") ||
    normalized.startsWith("**상대방과 처음 만났습니다") ||
    (normalized.startsWith("**당신은 ") && normalized.includes("정중하고 상냥하게 상대방에게 인사를 건네세요"))
  );
}
