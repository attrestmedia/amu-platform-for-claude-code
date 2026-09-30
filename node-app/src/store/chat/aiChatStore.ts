import { create } from "zustand";
import type { ChatImageInputType, ChatModelServiceType, IMessage, RouteHintType, TextProviderType } from "types/ai";
import { chatWithAI } from "libs/api/ai";
import { useAuthStore } from "store/auth";
import { useGameStore } from "store/game";
import { useProductStore } from "store/commerce";
import { useMessageStore } from "./messageStore";
import { useErrorStore } from "./errorStore";
import type { IAiResponse, SystemPromptOptionsType } from "types/ai";
import { CHAT_ERROR_TYPE, errorCodeToType } from "consts/ai";
import { GAME_CONSTANTS as GC } from "consts/game";
import { PROMPT_LIMITS } from "consts/auth";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common/typeUtils";
import { filterConversationHistory, capHistoryByTokenBudget } from "utils/ai";
import { resolveIsCommerce } from "utils/game";
import { dispatchCoinUpdated } from "utils/payment";
import { PROMPT_OPTION_CHAR_CAPS } from "consts/ai/promptCaps";
import { promptLimitCap } from "utils/ai";
import { ensureGuestId, normalizeRouteHint } from "utils/normalize";
import { DEFAULT_TEXT_MODEL_BY_PROVIDER, TEXT_MODEL_MAP } from "consts/ai";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain chat
 * @scope client-store
 */

export interface SendGuestOptions {
  guestId?: string;
  routeHint?: RouteHintType;
  chatModelService?: ChatModelServiceType;
  universeId?: string;
  promptOptions?: SystemPromptOptionsType;
  modelName?: string;
  provider?: TextProviderType;
  sessionId?: string;
  userPersonaId?: string;
  userClientId?: string;
  assistantClientId?: string;
  voiceInput?: Record<string, unknown>;
  imageInput?: ChatImageInputType;
}

interface AIChatState {
  currentModel: TextProviderType;
  isLoading: boolean;
}

interface AIChatActions {
  switchModel: (model: TextProviderType) => void;
  sendMessage: (message: string, npcId?: string, guest?: string | SendGuestOptions) => Promise<IAiResponse>;
}

export const useAIChatStore = create<AIChatState & AIChatActions>((set, get) => ({
  currentModel: "google",
  isLoading: false,

  switchModel: (model) => {
    set({ currentModel: model });
  },

  sendMessage: async (message, npcId, guest) => {
    const { currentModel } = get();
    const { conversations } = useMessageStore.getState();
    const { setError } = useErrorStore.getState();

    const guestOptions: SendGuestOptions = typeof guest === "string" ? { guestId: guest } : guest || {};
    const rawHint = guestOptions.routeHint;
    const routeHint = rawHint === "tutors" ? "tutors" : normalizeRouteHint(rawHint);
    const universeId = guestOptions.universeId ?? useGameStore.getState().universeId;
    const loggedIn = Boolean(useAuthStore.getState().user?.id);

    // routeHint가 없으면 무조건 ai (guestId만으로 commerce 추론 금지)
    const derivedRouteHint: RouteHintType = (routeHint ?? "ai") as RouteHintType;

    const isCommerce = resolveIsCommerce(derivedRouteHint);
    const effectiveRoute: RouteHintType = isCommerce ? "commerce" : derivedRouteHint;

    // commerce를 제외한 모든 라우트(ai/tutors 등)는 비로그인 호출 불가(withAuth) → 클라 조기 차단
    if (effectiveRoute !== "commerce" && !loggedIn) {
      setError("로그인이 필요합니다.", CHAT_ERROR_TYPE.SYSTEM_ERROR);
      return { content: "", isError: true, error: "로그인이 필요합니다.", errorCode: "LOGIN_REQUIRED" };
    }

    // npcId는 서버 validateRequest에서 필수 → 클라 조기 차단
    const effectiveNpcId = String(npcId || "").trim();
    if (!effectiveNpcId) {
      setError("NPC ID가 필요합니다.", CHAT_ERROR_TYPE.SYSTEM_ERROR);
      return { content: "", isError: true, error: "NPC ID가 필요합니다.", errorCode: "NPC_ID_REQUIRED" };
    }

    // commerce면 universeId 필수
    if (effectiveRoute === "commerce" && !universeId) {
      setError("universeId가 필요합니다.", CHAT_ERROR_TYPE.SYSTEM_ERROR);
      return { content: "", isError: true, error: "universeId가 필요합니다.", errorCode: "UNIVERSE_ID_REQUIRED" };
    }

    // commerce + 비로그인 => guestId는 단일 소스(ensureGuestId)로 항상 보장
    const effectiveGuestId =
      effectiveRoute === "commerce" && !loggedIn ? ensureGuestId(guestOptions.guestId) : guestOptions.guestId;

    if (effectiveRoute === "commerce" && !loggedIn && !effectiveGuestId) {
      setError("guestId가 필요합니다.", CHAT_ERROR_TYPE.SYSTEM_ERROR);
      return { content: "", isError: true, error: "guestId가 필요합니다.", errorCode: "GUEST_ID_REQUIRED" };
    }

    const isGuestMode = Boolean(effectiveGuestId) && !loggedIn;

    const effectiveProvider = guestOptions.provider || currentModel;

    logger.log("[aiChatStore] sendMessage:", {
      currentModel: effectiveProvider,
      message,
      effectiveNpcId,
      isGuestMode,
      guestIdMasked: isGuestMode ? "***" : null,
      effectiveRoute,
      imageAttached: Boolean(guestOptions.imageInput),
    });

    if (!message.trim() && !guestOptions.imageInput) {
      return { content: "", isError: true, error: "메시지가 비어있습니다." };
    }

    set({ isLoading: true });
    setError(null, CHAT_ERROR_TYPE.NONE);

    try {
      const characterId = effectiveNpcId;
      const currentMessages = conversations[characterId] || [];

      const filteredMessages = filterConversationHistory(currentMessages);
      const historyTokens = PROMPT_LIMITS.conversationHistory;

      // system role은 클라에서 제거하고 전달 (서버 authoritative 고정)
      const baseHistory = filteredMessages
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role, content: m.content }));

      // (중요) useChat에서 유저 메시지를 먼저 optimistic 저장한 뒤 sendMessage를 호출하면
      // history의 마지막 user 메시지가 현재 message와 동일해져 "중복 전송"이 발생할 수 있음.
      const trimmed = String(message || "").trim();
      if (trimmed && baseHistory.length > 0) {
        const last = baseHistory[baseHistory.length - 1];
        if (last.role === "user" && String(last.content || "").trim() === trimmed) {
          baseHistory.pop();
        }
      }

      const cappedHistory = capHistoryByTokenBudget(baseHistory, historyTokens);

      logger.log("[aiChatStore] history token cap:", {
        isCommerce,
        historyTokens,
        beforeCount: filteredMessages.length,
        afterCount: cappedHistory.length,
      });

      const historyToSend: IMessage[] = cappedHistory;

      logger.log("✔️[aiChatStore] sendMessage:", {
        npcId,
        message,
        currentModel: effectiveProvider,
        historyCount: historyToSend.length,
      });

      // promptOptions 캡(방어적 가드)
      const safePromptOptions = guestOptions.promptOptions
        ? {
            ...guestOptions.promptOptions,
            additionalInstructions: promptLimitCap(
              guestOptions.promptOptions.additionalInstructions ?? "",
              PROMPT_OPTION_CHAR_CAPS.additionalInstructions,
            ),
            knowledgeContext: promptLimitCap(
              guestOptions.promptOptions.knowledgeContext ?? "",
              PROMPT_OPTION_CHAR_CAPS.knowledgeContext,
            ),
          }
        : undefined;

      // modelName은 서버 pricing preflight가 fail-closed라서 반드시 필요
      const requestedModelName = String(guestOptions.modelName || "").trim();
      const allowedProviderModels =
        (TEXT_MODEL_MAP as Record<string, readonly string[] | undefined>)[effectiveProvider] || [];
      const modelName = allowedProviderModels.includes(requestedModelName)
        ? requestedModelName
        : (DEFAULT_TEXT_MODEL_BY_PROVIDER as Record<string, string | undefined>)[effectiveProvider] ||
          DEFAULT_TEXT_MODEL_BY_PROVIDER.google;

      const response = await chatWithAI({
        routeHint: effectiveRoute,
        chatModelService: guestOptions.chatModelService,
        provider: effectiveProvider,
        modelName,
        universeId: universeId || "",
        npcId: effectiveNpcId,
        message,
        history: historyToSend,
        guestId: effectiveGuestId,
        sessionId: guestOptions.sessionId,
        userPersonaId: guestOptions.userPersonaId,
        userClientId: guestOptions.userClientId,
        assistantClientId: guestOptions.assistantClientId,
        voiceInput: guestOptions.voiceInput,
        imageInput: guestOptions.imageInput,
        options: {
          promptOptions: safePromptOptions,
        },
      });

      if (!response?.isError) {
        if (isCommerce && universeId) dispatchCoinUpdated({ scope: "universe", universeId });
        else dispatchCoinUpdated({ scope: "user" });
      }

      if (response.isError) {
        // errorCode 기반으로 타입 결정, 메시지는 “실제 메시지” 우선
        const t = errorCodeToType(response.errorCode);
        const msg = response.error || "응답을 받는 중 오류가 발생했습니다.";
        setError(msg, t);
      } else {
        // 성공이면 어떤 에러든 무조건 clear
        setError(null, CHAT_ERROR_TYPE.NONE);
        if (isCommerce && universeId) {
          try {
            await useProductStore.getState().ensureLoaded(universeId);

            const noCodes =
              !response.productCode || (Array.isArray(response.productCode) && response.productCode.length === 0);
            if (noCodes && universeId) {
              const contentText = response.content || "";
              const joined = [message, contentText].join("\n");
              const fallbackCodes = useProductStore
                .getState()
                .findProductCodesByText(universeId, joined, { limit: 6, minScore: GC.COMMERCE.SEARCH_MIN_SCORE });

              if (fallbackCodes.length > 0) {
                response.productCode = fallbackCodes;
                logger.log("[aiChatStore] productCode 보정됨 (유저+응답 텍스트):", fallbackCodes);
              }
            }
          } catch (e) {
            logger.warn("[aiChatStore] productCode 보정 실패:", e);
          }
        }

        if (isCommerce && npcId && Array.isArray(response.productCode) && response.productCode.length > 0) {
          useMessageStore.getState().setLastProductFocus(npcId, response.productCode);
        }
      }

      return response;
    } catch (err: unknown) {
      const errorMessage = toErrorMessage(err, "알 수 없는 오류가 발생했습니다.");
      setError(errorMessage, CHAT_ERROR_TYPE.OTHER);
      return { content: "", isError: true, error: errorMessage };
    } finally {
      set({ isLoading: false });
    }
  },
}));
