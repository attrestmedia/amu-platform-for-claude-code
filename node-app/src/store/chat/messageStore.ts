import { create } from "zustand";
import type { IMessage, SystemCodeLikeType } from "types/ai";
import { getConversations, saveConversationMessage } from "libs/api/ai";
import { createTextHash } from "utils/common";
import { logger } from "utils/log";
import { toErrorLike, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";
import { filterConversationHistory } from "utils/ai";
import { v4 as uuidv4 } from "uuid";
import { PROMPT_LIMITS } from "consts/auth";
import fetchClient from "libs/api/fetchClient";
import { MEMORY_LIMITS } from "consts/auth";
import { ensureGuestId } from "utils/normalize";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain chat
 * @scope client
 */

interface MessageState {
  conversations: Record<string, IMessage[]>; // 캐릭터 ID별 대화 기록
  conversationHistoryStatus: Record<string, "loading" | "ready">;
  savedMessageIds: Set<string>; // 이미 저장된 메시지 ID
  savingMessageIds: Set<string>; // 저장 중(in-flight) 메시지 ID
  sessionId: string;
  lastCleanupTime: number; // 마지막 정리 시간
  // 메모리 사용량 추적
  memoryUsage: {
    conversationCount: number;
    totalMessages: number;
    estimatedSize: number; // KB 단위, 근사치 산정
    savedMessageIdsCount: number;
  };
  lastProductFocusByPersona: Record<string, string[]>; // personaId별 후보 코드
}

interface CommonMessageSaveParams {
  personaId: string;
  sessionId: string;
  content: string;
  isUser: boolean;
  location?: string;
  systemCode?: SystemCodeLikeType[];
  translation?: string;
  clientId?: string;
  productCode?: string[];
  timestamp?: Date; // UI timestamp와 동기화 시
}

// 일반 사용자용 메시지 저장 파라미터
interface UserMessageSaveParams extends CommonMessageSaveParams {
  userId: string;
  userPersonaId: string;
}

// 게스트 사용자용 메시지 저장 파라미터
interface GuestMessageSaveParams extends CommonMessageSaveParams {
  guestId: string;
  universeId: string;
}

interface MessageActions {
  addMessage: (characterId: string, message: IMessage) => void;
  patchMessageAudioMeta: (characterId: string, clientId: string, audioMeta: IMessage["audioMeta"]) => void;
  clearMessages: (characterId?: string) => void;
  loadConversationHistory: (personaId: string, userPersonaId: string) => Promise<void>;
  loadConversationHistoryAsGuest: (personaId: string, universeId: string) => Promise<void>;
  saveMessage: (params: UserMessageSaveParams, opts?: { optimisticLocalAdd?: boolean }) => Promise<boolean>;
  saveMessageAsGuest?: (params: GuestMessageSaveParams, opts?: { optimisticLocalAdd?: boolean }) => Promise<boolean>;
  // 메모리 관리 함수들
  forceCleanup: () => void;
  getMemoryUsage: () => MessageState["memoryUsage"];
  trimConversation: (characterId: string, maxMessages?: number) => void;
  startNewSession: () => void; // 새 대화 세션 시작(세션ID 갱신)
  setLastProductFocus: (personaId: string, codes: string[]) => void;
  getLastProductFocus: (personaId: string) => string[];
}

type ConversationHistorySession = {
  sessionId?: string;
  date?: Date | string | number;
  messages?: Partial<IMessage>[];
};

function getConversationSessions(data: unknown): ConversationHistorySession[] {
  const conversation = toUnknownRecord(toUnknownRecord(data).conversation);
  return Array.isArray(conversation.conversations)
    ? (conversation.conversations as ConversationHistorySession[])
    : [];
}

function toMessageTime(value: unknown) {
  if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function toMessageDate(value: unknown) {
  return toMessageTime(value) > 0 ? new Date(value as string | number | Date) : new Date();
}

function mergeCurrentSessionMessages(
  loadedMessages: IMessage[],
  currentMessages: IMessage[] | undefined,
  currentSessionId: string,
) {
  const loadedClientIds = new Set(loadedMessages.map((message) => message.clientId).filter(Boolean));
  const pendingCurrentMessages = (currentMessages || []).filter(
    (message) =>
      message.sessionId === currentSessionId && (!message.clientId || !loadedClientIds.has(message.clientId)),
  );
  return [...loadedMessages, ...pendingCurrentMessages];
}

export const useMessageStore = create<MessageState & MessageActions>((set, get) => ({
  conversations: {},
  conversationHistoryStatus: {},
  savedMessageIds: new Set(),
  savingMessageIds: new Set(),
  sessionId: uuidv4(),
  lastCleanupTime: Date.now(),
  memoryUsage: {
    conversationCount: 0,
    totalMessages: 0,
    estimatedSize: 0,
    savedMessageIdsCount: 0,
  },
  lastProductFocusByPersona: {},
  setLastProductFocus: (personaId: string, codes: string[]) =>
    set((state) => ({
      ...state,
      lastProductFocusByPersona: {
        ...state.lastProductFocusByPersona,
        [personaId]: Array.from(new Set(codes)).slice(0, 6),
      },
    })),
  getLastProductFocus: (personaId: string) => get().lastProductFocusByPersona[personaId] ?? ([] as string[]),
  addMessage: (characterId, message) => {
    set((state) => {
      const newConversations = { ...state.conversations };
      const currentMessages = newConversations[characterId] || [];

      // 메시지 추가
      const updatedMessages = [...currentMessages, message];

      // 메시지 수 제한 확인
      if (updatedMessages.length > MEMORY_LIMITS.MAX_MESSAGES_PER_CONVERSATION) {
        // 오래된 메시지 제거 (system role 레거시 제거 → 그냥 뒤에서 N개 유지)
        newConversations[characterId] = updatedMessages.slice(-MEMORY_LIMITS.MAX_MESSAGES_PER_CONVERSATION);
        logger.debug(
          `대화방 ${characterId} 메시지 트림: ${updatedMessages.length} -> ${newConversations[characterId].length}`,
        );
      } else {
        newConversations[characterId] = updatedMessages;
      }

      // 대화방 수 제한 확인
      const conversationIds = Object.keys(newConversations);
      if (conversationIds.length > MEMORY_LIMITS.MAX_CONVERSATIONS) {
        // 가장 오래된 대화방 제거 (마지막 메시지 시간 기준)
        const sortedIds = conversationIds.sort((a, b) => {
          const aLastMsg = newConversations[a]?.slice(-1)[0];
          const bLastMsg = newConversations[b]?.slice(-1)[0];
          // 타임스탬프가 없으면 현재 시간 사용
          const aRaw = aLastMsg?.timestamp;
          const bRaw = bLastMsg?.timestamp;
          const aTime = aRaw ? new Date(aRaw as Date | string | number).getTime() : Date.now();
          const bTime = bRaw ? new Date(bRaw as Date | string | number).getTime() : Date.now();
          return aTime - bTime;
        });

        // 오래된 대화방 삭제
        const toDelete = sortedIds.slice(0, sortedIds.length - MEMORY_LIMITS.MAX_CONVERSATIONS);
        toDelete.forEach((id) => delete newConversations[id]);

        logger.debug(`메모리 최적화: ${toDelete.length}개 대화방 삭제`);
      }

      const newState = {
        ...state,
        conversations: newConversations,
      };

      // 메모리 사용량 업데이트
      updateMemoryUsage(newState);

      // 주기적 정리 확인
      const now = Date.now();
      if (now - state.lastCleanupTime > MEMORY_LIMITS.CLEANUP_INTERVAL) {
        newState.lastCleanupTime = now;
        performCleanup(newState);
      }

      return newState;
    });
  },

  patchMessageAudioMeta: (characterId, clientId, audioMeta) => {
    if (!characterId || !clientId) return;

    set((state) => {
      const currentMessages = state.conversations[characterId] || [];
      let changed = false;

      const nextMessages = currentMessages.map((message) => {
        if (message.clientId !== clientId) return message;
        changed = true;
        return {
          ...message,
          audioMeta,
        };
      });

      if (!changed) return state;

      const newState = {
        ...state,
        conversations: {
          ...state.conversations,
          [characterId]: nextMessages,
        },
      };

      updateMemoryUsage(newState);
      return newState;
    });
  },

  clearMessages: (characterId) => {
    set((state) => {
      const newConversations = { ...state.conversations };

      if (characterId) {
        delete newConversations[characterId];
      } else {
        // 모든 대화 삭제
        Object.keys(newConversations).forEach((id) => delete newConversations[id]);
      }

      const newState = {
        ...state,
        conversations: newConversations,
      };

      updateMemoryUsage(newState);
      return newState;
    });
  },

  loadConversationHistory: async (personaId, userPersonaId) => {
    if (!personaId || !userPersonaId) return;

    set((state) => ({
      ...state,
      conversationHistoryStatus: {
        ...state.conversationHistoryStatus,
        [personaId]: "loading",
      },
    }));

    try {
      // API 호출 시 제한 개수 전달
      const data = await getConversations(personaId, userPersonaId, {
        maxMessages: PROMPT_LIMITS.maxMessages, // 유저 타입별 최대 메시지 제한
      });

      const allSessions = getConversationSessions(data);
      if (allSessions.length > 0) {

        // API에서 이미 processMessagesWithLimit로 처리된 데이터 활용
        // 모든 세션의 모든 메시지를 시간순으로 병합
        const allMessages: IMessage[] = [];

        // 세션을 날짜순으로 정렬 (오래된 것부터)
        const sortedSessions = [...allSessions].sort((a, b) => toMessageTime(a.date) - toMessageTime(b.date));

        // 모든 세션의 메시지를 순서대로 수집
        sortedSessions.forEach((session) => {
          if (session.messages && Array.isArray(session.messages)) {
            // 세션 내 메시지를 시간순으로 정렬
            const sortedMessages = [...session.messages].sort(
              (a, b) => toMessageTime(a.timestamp) - toMessageTime(b.timestamp),
            );

            // IMessage 형식으로 변환하여 추가
            sortedMessages.forEach((msg: Partial<IMessage>) => {
              if (msg?.role !== "user" && msg?.role !== "assistant") return;
              allMessages.push({
                role: msg.role,
                content: msg.content ?? "",
                sessionId: String(session.sessionId || "").trim() || undefined,
                timestamp: toMessageDate(msg.timestamp),
                translation: msg.translation,
                clientId: msg.clientId,
                systemCode: msg.systemCode,
                productCode: msg.productCode,
                audioMeta: msg.audioMeta,
              } as IMessage);
            });
          }
        });

        // 토큰 기반 추가 필터링 적용
        const filteredMessages = filterConversationHistory(allMessages);

        // 상태 업데이트
        set((state) => {
          const mergedMessages = mergeCurrentSessionMessages(
            filteredMessages,
            state.conversations[personaId],
            state.sessionId,
          );
          const newState = {
            ...state,
            conversations: {
              ...state.conversations,
              [personaId]: mergedMessages,
            },
            conversationHistoryStatus: {
              ...state.conversationHistoryStatus,
              [personaId]: "ready" as const,
            },
          };

          updateMemoryUsage(newState);
          return newState;
        });

        // 디버깅 로그
        logger.debug(
          `[loadConversationHistory] 대화 기록 로드 완료: 총 ${allMessages.length}개 메시지 → 토큰 필터링 후 ${filteredMessages.length}개`,
          {
            maxMessages: PROMPT_LIMITS.maxMessages,
            conversationHistoryTokenLimit: PROMPT_LIMITS.conversationHistory,
          },
        );
      } else {
        // 대화가 없을 경우 빈 배열 반환
        set((state) => ({
          ...state,
          conversations: {
            ...state.conversations,
            [personaId]: mergeCurrentSessionMessages([], state.conversations[personaId], state.sessionId),
          },
          conversationHistoryStatus: {
            ...state.conversationHistoryStatus,
            [personaId]: "ready",
          },
        }));
      }
    } catch (error) {
      logger.error("대화 기록 로드 실패:", error);
      // 대화 로드 실패 시에도 빈 배열 반환
      set((state) => ({
        ...state,
        conversations: {
          ...state.conversations,
          [personaId]: mergeCurrentSessionMessages([], state.conversations[personaId], state.sessionId),
        },
        conversationHistoryStatus: {
          ...state.conversationHistoryStatus,
          [personaId]: "ready",
        },
      }));
    }
  },

  // 커머스에서 활용하기 위한 게스트 모드 대화 로더
  loadConversationHistoryAsGuest: async (personaId, universeId) => {
    if (!personaId || !universeId) return;

    set((state) => ({
      ...state,
      conversationHistoryStatus: {
        ...state.conversationHistoryStatus,
        [personaId]: "loading",
      },
    }));

    try {
      // API 호출 (게스트는 universeId로 조회)
      const data = await getConversations(personaId, undefined, {
        universeId,
        maxMessages: PROMPT_LIMITS.maxMessages,
      });

      const allSessions = getConversationSessions(data);
      if (allSessions.length > 0) {

        // 세션을 날짜순 정렬 후, 모든 메시지를 시간순으로 병합
        const sortedSessions = [...allSessions].sort((a, b) => toMessageTime(a.date) - toMessageTime(b.date));

        const allMessages = sortedSessions.flatMap((session) =>
          [...(session.messages || [])]
            .sort((a, b) => toMessageTime(a.timestamp) - toMessageTime(b.timestamp))
            .filter((msg: Partial<IMessage>) => msg?.role === "user" || msg?.role === "assistant")
            .map((msg: Partial<IMessage>) => ({
              role: msg.role as IMessage["role"],
              content: msg.content ?? "",
              sessionId: String(session.sessionId || "").trim() || undefined,
              timestamp: toMessageDate(msg.timestamp),
              translation: msg.translation,
              clientId: msg.clientId,
              systemCode: msg.systemCode,
              productCode: msg.productCode,
              audioMeta: msg.audioMeta,
            })),
        );

        // 토큰 기반 필터링
        const filteredMessages = filterConversationHistory(allMessages);

        // 상태 업데이트
        set((state) => {
          const mergedMessages = mergeCurrentSessionMessages(
            filteredMessages,
            state.conversations[personaId],
            state.sessionId,
          );
          const newState = {
            ...state,
            conversations: {
              ...state.conversations,
              [personaId]: mergedMessages,
            },
            conversationHistoryStatus: {
              ...state.conversationHistoryStatus,
              [personaId]: "ready" as const,
            },
          };
          updateMemoryUsage(newState);
          return newState;
        });

        logger.debug(
          `[loadConversationHistoryAsGuest] 게스트 대화 기록 로드 완료: 총 ${allMessages.length} → 필터 ${filteredMessages.length}`,
          {
            maxMessages: PROMPT_LIMITS.maxMessages,
            conversationHistoryTokenLimit: PROMPT_LIMITS.conversationHistory,
          },
        );
      } else {
        // 대화가 없을 경우 빈 배열 반환
        set((state) => ({
          ...state,
          conversations: {
            ...state.conversations,
            [personaId]: mergeCurrentSessionMessages([], state.conversations[personaId], state.sessionId),
          },
          conversationHistoryStatus: {
            ...state.conversationHistoryStatus,
            [personaId]: "ready",
          },
        }));
      }
    } catch (error) {
      logger.error("게스트 대화 기록 로드 실패:", error);
      // 대화 로드 실패 시에도 빈 배열 반환
      set((state) => ({
        ...state,
        conversations: {
          ...state.conversations,
          [personaId]: mergeCurrentSessionMessages([], state.conversations[personaId], state.sessionId),
        },
        conversationHistoryStatus: {
          ...state.conversationHistoryStatus,
          [personaId]: "ready",
        },
      }));
    }
  },

  saveMessage: async (params, opts) => {
    const {
      userPersonaId,
      personaId,
      sessionId,
      content,
      isUser,
      location,
      systemCode,
      translation,
      clientId,
      productCode,
      timestamp,
    } = params;

    if (!personaId || !userPersonaId) return false;

    const optimisticLocalAdd = opts?.optimisticLocalAdd ?? true;
    const ts = timestamp ?? new Date();

    // clientId 우선 (정상적인 동일문장 2회 전송도 허용)
    const messageKey =
      clientId ||
      createTextHash(`${personaId}|${sessionId}|${isUser ? "U" : "A"}|${createTextHash(content)}|${ts.getTime()}`);
    const effectiveClientId = clientId || messageKey;

    // 저장 완료된 것만 savedMessageIds로 판단
    if (get().savedMessageIds.has(messageKey)) {
      logger.log("이미 저장된 메시지 무시:", messageKey);
      return true;
    }
    // 저장 진행 중(in-flight) dedupe는 savingMessageIds로만
    if (get().savingMessageIds.has(messageKey)) {
      logger.log("이미 저장 중인 메시지 무시:", messageKey);
      return true;
    }

    try {
      // 낙관적 로컬 반영은 옵션으로 제어
      if (optimisticLocalAdd) {
        get().addMessage(personaId, {
          role: isUser ? "user" : "assistant",
          content,
          sessionId,
          timestamp: ts,
          translation,
          clientId: effectiveClientId,
          ...(systemCode && !isUser ? { systemCode } : {}),
          ...(productCode && !isUser ? { productCode } : {}),
        } as IMessage);
      }

      // in-flight 등록
      set((state) => ({ ...state, savingMessageIds: new Set([...state.savingMessageIds, messageKey]) }));

      const message: IMessage = {
        role: isUser ? "user" : "assistant",
        content,
        timestamp: ts.toISOString(),
        clientId: effectiveClientId,
        ...(translation ? { translation } : {}),
        ...(!isUser && systemCode ? { systemCode } : {}),
        ...(!isUser && productCode ? { productCode } : {}),
      } as IMessage;

      // intimacy 계산은 서버 authoritative, systemCode는 message에도 포함
      let relationshipUpdate: { intimacyDeltaHint: boolean; contentLength: number; systemCode?: SystemCodeLikeType[] } | undefined =
        undefined;
      if (!isUser) {
        relationshipUpdate = {
          intimacyDeltaHint: true,
          contentLength: content.length,
          ...(systemCode ? { systemCode } : {}),
        };
      }

      await saveConversationMessage({
        personaId,
        userPersonaId,
        sessionId,
        message,
        location,
        relationshipUpdate,
      });

      // 성공: in-flight 제거 + saved 등록
      set((state) => {
        const saving = new Set(state.savingMessageIds);
        saving.delete(messageKey);
        const saved = new Set(state.savedMessageIds);
        saved.add(messageKey);
        if (saved.size > MEMORY_LIMITS.MAX_SAVED_MESSAGE_IDS) {
          const arr = Array.from(saved);
          saved.clear();
          arr.slice(-MEMORY_LIMITS.MAX_SAVED_MESSAGE_IDS).forEach((x) => saved.add(x));
        }
        return { ...state, savingMessageIds: saving, savedMessageIds: saved };
      });

      return true;
    } catch (error) {
      logger.error("메시지 저장 실패:", error);
      // 실패: in-flight 제거
      set((state) => {
        const saving = new Set(state.savingMessageIds);
        saving.delete(messageKey);
        return { ...state, savingMessageIds: saving };
      });
      return false;
    }
  },

  saveMessageAsGuest: async (params, opts) => {
    const {
      guestId,
      personaId,
      universeId,
      sessionId,
      content,
      isUser,
      location,
      systemCode,
      translation,
      clientId,
      productCode,
      timestamp,
    } = params;

    if (!guestId || !personaId || !universeId || !sessionId) return false;
    const effectiveGuestId = ensureGuestId(guestId);
    if (!effectiveGuestId) return false;

    const optimisticLocalAdd = opts?.optimisticLocalAdd ?? true;
    const ts = timestamp ?? new Date();

    const messageId =
      clientId ||
      createTextHash(`${personaId}|${sessionId}|${isUser ? "U" : "A"}|${createTextHash(content)}|${ts.getTime()}`);
    const effectiveClientId = clientId || messageId;

    if (get().savedMessageIds.has(messageId)) {
      logger.log("이미 저장된 게스트 메시지 무시:", messageId);
      return true;
    }
    if (get().savingMessageIds.has(messageId)) {
      logger.log("이미 저장 중인 게스트 메시지 무시:", messageId);
      return true;
    }

    try {
      // 옵션에 따라 낙관적 add
      if (optimisticLocalAdd) {
        get().addMessage(personaId, {
          role: isUser ? "user" : "assistant",
          content,
          sessionId,
          timestamp: ts,
          translation,
          clientId: effectiveClientId,
          ...(systemCode && !isUser ? { systemCode } : {}),
          ...(productCode && !isUser ? { productCode } : {}),
        } as IMessage);
      }

      // in-flight 등록
      set((state) => ({ ...state, savingMessageIds: new Set([...state.savingMessageIds, messageId]) }));

      type GuestSavePayload = {
        personaId: string;
        universeId: string;
        sessionId: string;
        guestId: string;
        location: string;
        message: IMessage;
        relationshipUpdate?: { intimacyDeltaHint: boolean; contentLength: number; systemCode?: SystemCodeLikeType[] };
      };
      const payload: GuestSavePayload = {
        personaId,
        universeId,
        sessionId,
        guestId: effectiveGuestId,
        location: location || "chat-window",
        message: {
          role: isUser ? "user" : "assistant",
          content,
          clientId: effectiveClientId,
          timestamp: ts.toISOString(),
          ...(systemCode ? { systemCode } : {}),
          ...(translation ? { translation } : {}),
          ...(productCode ? { productCode } : {}),
        },
      };

      if (!isUser) {
        payload.relationshipUpdate = {
          intimacyDeltaHint: true,
          contentLength: content.length,
          ...(systemCode ? { systemCode } : {}),
        };
      }

      try {
        await fetchClient.post("/conversations", payload, {
          headers: {
            ...(effectiveGuestId ? { "x-guest-id": effectiveGuestId } : {}),
          },
        });
      } catch (e: unknown) {
        const err = toErrorLike(e);
        const response = toUnknownRecord(err.response);
        const data = toUnknownRecord(response.data) as { error?: unknown; message?: unknown };
        logger.warn("게스트 메시지 저장 실패:", data?.error || data?.message || toErrorMessage(e));
        set((state) => {
          const saving = new Set(state.savingMessageIds);
          saving.delete(messageId);
          return { ...state, savingMessageIds: saving };
        });
        return false;
      }

      // 성공: in-flight 제거 + saved 등록
      set((state) => {
        const saving = new Set(state.savingMessageIds);
        saving.delete(messageId);
        const saved = new Set(state.savedMessageIds);
        saved.add(messageId);
        if (saved.size > MEMORY_LIMITS.MAX_SAVED_MESSAGE_IDS) {
          const arr = Array.from(saved);
          saved.clear();
          arr.slice(-MEMORY_LIMITS.MAX_SAVED_MESSAGE_IDS).forEach((x) => saved.add(x));
        }
        return { ...state, savingMessageIds: saving, savedMessageIds: saved };
      });

      return true;
    } catch (e) {
      logger.error("게스트 메시지 저장 네트워크 오류:", e);
      set((state) => {
        const saving = new Set(state.savingMessageIds);
        saving.delete(messageId);
        return { ...state, savingMessageIds: saving };
      });

      return false;
    }
  },

  // 새로운 메모리 관리 함수들
  forceCleanup: () => {
    set((state) => {
      const newState = { ...state };
      performCleanup(newState);
      updateMemoryUsage(newState);
      logger.debug("강제 메모리 정리 수행");
      return newState;
    });
  },

  getMemoryUsage: () => {
    return get().memoryUsage;
  },

  trimConversation: (characterId, maxMessages = MEMORY_LIMITS.MAX_MESSAGES_PER_CONVERSATION) => {
    set((state) => {
      const newConversations = { ...state.conversations };
      const messages = newConversations[characterId];

      if (messages && messages.length > maxMessages) {
        newConversations[characterId] = messages.slice(-maxMessages);
        logger.debug(`대화방 ${characterId} 트림: ${messages.length} -> ${newConversations[characterId].length}`);
      }

      const newState = {
        ...state,
        conversations: newConversations,
      };

      updateMemoryUsage(newState);
      return newState;
    });
  },

  startNewSession: () => {
    set((state) => {
      const newId = uuidv4();
      logger.debug(`[messageStore] 새 대화 세션 시작: ${state.sessionId} -> ${newId}`);
      return { ...state, sessionId: newId };
    });
  },
}));

// 메모리 사용량 계산
function updateMemoryUsage(state: MessageState): void {
  const conversations = state.conversations;
  let totalMessages = 0;
  let estimatedSize = 0;

  // 대화 메시지 크기 계산
  Object.values(conversations).forEach((messages) => {
    totalMessages += messages.length;
    messages.forEach((msg) => {
      // 메시지 크기 추정 (문자열 길이 * 2 바이트 + 오버헤드)
      estimatedSize += (msg.content.length * 2 + 100) / 1024; // KB 단위
    });
  });

  // savedMessageIds 크기 추가
  estimatedSize += (state.savedMessageIds.size * 100) / 1024;

  state.memoryUsage = {
    conversationCount: Object.keys(conversations).length,
    totalMessages,
    estimatedSize: Math.round(estimatedSize * 100) / 100, // 소수점 2자리
    savedMessageIdsCount: state.savedMessageIds.size,
  };

  // 메모리 사용량이 너무 높으면 경고
  if (estimatedSize > MEMORY_LIMITS.MEMORY_WARNING_THRESHOLD) {
    const mb = (estimatedSize / 1024).toFixed(2);
    logger.warn(`높은 메모리 사용량 감지: ${estimatedSize.toFixed(2)}KB (~${mb}MB)`);
  }
}

// 정리 작업 수행
function performCleanup(state: MessageState): void {
  // savedMessageIds 정리
  if (state.savedMessageIds.size > MEMORY_LIMITS.MAX_SAVED_MESSAGE_IDS) {
    const idsArray = Array.from(state.savedMessageIds);
    const toKeep = idsArray.slice(-MEMORY_LIMITS.MAX_SAVED_MESSAGE_IDS);
    state.savedMessageIds = new Set(toKeep);

    logger.debug(`메모리 정리: ${idsArray.length - toKeep.length}개 메시지 ID 삭제`);
  }
}
