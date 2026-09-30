"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IExtendedNpcData } from "types/game";
import type {
  AiMessageType,
  ChatImageInputType,
  ChatImagePreviewType,
  ChatMessageMetaType,
  IChatMessage,
  IMessage,
} from "types/ai";
import { createChatMessageMeta } from "utils/ai";
import { useMessageStore } from "store/chat";
import { logger } from "utils/log";

type SendMessageResultType = { success?: boolean } | null | undefined | void;
type TranslationResultType = { translatedText?: string } | null | undefined;
type ChatSendMetaType = ChatMessageMetaType & {
  voiceInput?: Record<string, unknown>;
  imageInput?: ChatImageInputType;
  imagePreview?: ChatImagePreviewType;
};

/**
 * @docHint
 * @purpose useChatMessagePipeline 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain chat-pipeline
 * @scope client
 */

export function useChatMessagePipeline(args: {
  open: boolean;

  character: IExtendedNpcData | null;

  currentInput: string;
  setCurrentInput: (v: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<IChatMessage[]>>;
  setLastMessageSender: (v: AiMessageType | null) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>, limit: number) => void;

  chatViewMode: "talk" | "visual";
  isLoading: boolean;

  handleSendMessageWithError: (
    messageText?: string,
    meta?: {
      clientId?: string;
      translation?: string;
      timestamp?: Date;
      voiceInput?: Record<string, unknown>;
      imageInput?: ChatImageInputType;
      imagePreview?: ChatImagePreviewType;
    },
  ) => Promise<SendMessageResultType>;

  knowledgeSearchPanelRef: React.RefObject<{ minimize?: () => void } | null>;

  translation: {
    enabled: boolean;
    isTranslating: boolean;
    getTranslation: (text: string) => TranslationResultType;
    translateImmediately: (text: string) => Promise<TranslationResultType>;
  };

  limitMsgLength: number;

  clearCurrentSystemCodes: () => void;

  MESSAGE_SEND_DELAY: number;
}) {
  const {
    open,
    character,
    currentInput,
    setCurrentInput,
    setMessages,
    setLastMessageSender,
    handleInputChange,
    chatViewMode,
    isLoading,
    handleSendMessageWithError,
    knowledgeSearchPanelRef,
    translation,
    limitMsgLength,
    clearCurrentSystemCodes,
    MESSAGE_SEND_DELAY,
  } = args;

  const [isUserMessageAnimating, setIsUserMessageAnimating] = useState(false);
  const [pendingApiRequest, setPendingApiRequest] = useState<{ text: string; meta: ChatSendMetaType } | null>(null);

  // pending 레이스(Flush + AnimationComplete 동시 호출)로 인한 2중 전송 방지
  const pendingRef = useRef<{ text: string; meta: ChatSendMetaType } | null>(null);
  const flushInFlightRef = useRef(false);

  const setPending = useCallback((v: { text: string; meta: ChatSendMetaType } | null) => {
    pendingRef.current = v;
    setPendingApiRequest(v);
  }, []);

  const clearPending = useCallback(() => {
    setPending(null);
  }, [setPending]);

  const takePendingOnce = useCallback(() => {
    const req = pendingRef.current;
    if (!req) return null;
    if (flushInFlightRef.current) return null;
    flushInFlightRef.current = true;
    clearPending(); // state/ref 모두 먼저 비움
    setIsUserMessageAnimating(false);
    return req;
  }, [clearPending]);

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // close / pid-change 시 pending/anim 확실히 정리 — 외부 prop 변화에 대응한 정당한 cleanup 패턴.
  // set-state-in-effect rule은 cascading render 회피용 권고이며 여기는 단방향 동기화이므로 의도적 disable.
  const prevPidRef = useRef<string | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const pid = character?.pid ?? null;

    // 닫힘/캐릭터 없음 => 무조건 정리
    if (!open || !pid) {
      setIsUserMessageAnimating(false);
      clearPending();
      flushInFlightRef.current = false;
      prevPidRef.current = pid;
      return;
    }

    // pid 교체 => 정리
    if (prevPidRef.current && prevPidRef.current !== pid) {
      setIsUserMessageAnimating(false);
      clearPending();
      flushInFlightRef.current = false;
    }

    prevPidRef.current = pid;
  }, [open, character?.pid, clearPending]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const seedAssistantMessage = useCallback(
    (
      content: string,
      opts?: { productCode?: string[]; seed?: string; replace?: boolean; clientId?: string; timestamp?: Date },
    ) => {
      if (!character) return null;

      const meta = createChatMessageMeta("assistant", {
        seed: opts?.seed,
        clientId: opts?.clientId,
        timestamp: opts?.timestamp,
      });

      const fixedClientId = meta.clientId || `ast-seed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const fixedTs = meta.timestamp || new Date();

      const uiMsg: IChatMessage = {
        id: fixedClientId,
        text: content,
        isUser: false,
        timestamp: fixedTs,
        productCode: opts?.productCode,
      };

      const storeMessage: IMessage = {
        role: "assistant",
        content,
        sessionId: useMessageStore.getState().sessionId,
        timestamp: fixedTs,
        clientId: fixedClientId,
        ...(opts?.productCode?.length ? { productCode: opts.productCode } : {}),
      };
      useMessageStore.getState().addMessage(character.pid, storeMessage);

      if (opts?.replace) setMessages([uiMsg]);
      else setMessages((prev) => [...prev, uiMsg]);

      return uiMsg;
    },
    [character, setMessages],
  );

  const handleInputChangeTranslation = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(e, limitMsgLength);
    },
    [handleInputChange, limitMsgLength],
  );

  // viewMode 전환 시 visual pending을 talk로 즉시 flush
  const flushPendingToTalk = useCallback(async () => {
    const req = takePendingOnce();
    if (!req) return;

    // 닫힌 상태면 폐기
    if (!open) {
      flushInFlightRef.current = false;
      return;
    }

    try {
      const result = await handleSendMessageWithError(req.text, req.meta);
      if (!result?.success) logger.error("메시지 전송 실패:", result);
    } finally {
      flushInFlightRef.current = false;
    }
  }, [open, handleSendMessageWithError, takePendingOnce]);

  useEffect(() => {
    // talk 모드로 넘어오면 pending이 남아있을 수 있으므로 즉시 처리
    if (chatViewMode !== "talk") return;
    if (!pendingApiRequest) return;
    void flushPendingToTalk();
  }, [chatViewMode, pendingApiRequest, flushPendingToTalk]);

  const handleSendWithMessage = useCallback(
    async (
      overrideText?: string,
      opts?: {
        preserveInput?: boolean;
        voiceInput?: Record<string, unknown>;
        imageInput?: ChatImageInputType;
        imagePreview?: ChatImagePreviewType;
      },
    ) => {
      // 닫힌 상태 방어(늦게 들어온 이벤트/콜백 방지)
      if (!open) return;

      if (isLoading || isUserMessageAnimating || pendingApiRequest) return;
      if (!character) return;
      if (translation.enabled && translation.isTranslating) return;

      const raw = overrideText ?? currentInput;
      const messageToSend = raw.trim();
      if (!messageToSend && !opts?.imageInput) return;

      if (!opts?.preserveInput) setCurrentInput("");

      knowledgeSearchPanelRef.current?.minimize?.();

      let finalUserTranslation: string | null = null;
      if (translation.enabled && messageToSend) {
        try {
          const existing = translation.getTranslation(messageToSend);
          if (existing?.translatedText) finalUserTranslation = existing.translatedText;
          else
            finalUserTranslation = (await translation.translateImmediately(messageToSend))?.translatedText || null;
        } catch {}
      }
      if (!openRef.current) return;

      const meta: ChatSendMetaType = {
        ...createChatMessageMeta("user", { seed: `msg-user:${character.pid}` }),
        voiceInput: opts?.voiceInput,
        imageInput: opts?.imageInput,
        imagePreview: opts?.imagePreview,
      };
      const ts = meta.timestamp;
      const clientId = meta.clientId;

      const userMessage: IChatMessage = {
        id: clientId,
        text: messageToSend,
        isUser: true,
        timestamp: ts,
        translation: finalUserTranslation || undefined,
        imagePreview: opts?.imagePreview,
      };

      setMessages((prev) => [...prev, userMessage]);
      setLastMessageSender("user");

      const storeMessage: IMessage = {
        role: "user",
        content: messageToSend,
        sessionId: useMessageStore.getState().sessionId,
        timestamp: ts,
        translation: finalUserTranslation || undefined,
        clientId,
        imagePreview: opts?.imagePreview,
      };
      useMessageStore.getState().addMessage(character.pid, storeMessage);

      if (chatViewMode === "talk") {
        try {
          const result = await handleSendMessageWithError(messageToSend, meta);
          if (!result?.success) logger.error("메시지 전송 실패:", result);
        } catch (e) {
          logger.error("메시지 전송 예외:", e);
        }
      } else {
        setIsUserMessageAnimating(true);
        setPending({ text: messageToSend, meta });
      }
      clearCurrentSystemCodes();
    },
    [
      open,
      character,
      currentInput,
      isLoading,
      chatViewMode,
      setCurrentInput,
      setMessages,
      setLastMessageSender,
      handleSendMessageWithError,
      translation,
      knowledgeSearchPanelRef,
      isUserMessageAnimating,
      pendingApiRequest,
      clearCurrentSystemCodes,
      setPending,
    ],
  );

  // 중복 전송 방지 + 안정성: 완료 콜백도 pending을 "먼저" 비움
  const handleUserMessageAnimationComplete = useCallback(async () => {
    const req = takePendingOnce();
    if (!req) return;

    if (!open) {
      flushInFlightRef.current = false;
      return;
    }

    try {
      await new Promise((r) => setTimeout(r, MESSAGE_SEND_DELAY));
      const result = await handleSendMessageWithError(req.text, req.meta);
      if (!result?.success) logger.error("메시지 전송 실패:", result);
    } finally {
      flushInFlightRef.current = false;
    }
  }, [takePendingOnce, open, MESSAGE_SEND_DELAY, handleSendMessageWithError]);

  return {
    seedAssistantMessage,
    isUserMessageAnimating,
    pendingApiRequest,
    handleSendWithMessage,
    handleUserMessageAnimationComplete,
    handleInputChangeTranslation,
  };
}
