"use client";

import { useEffect, useMemo, useRef } from "react";
import type { IExtendedNpcData } from "types/game";
import type { IChatMessage, AiMessageType } from "types/ai";
import { useMessageStore } from "store/chat";

/**
 * @docHint
 * @purpose useChatSeedInit 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain chat-seed
 * @scope client
 */

export function useChatSeedInit(args: {
  open: boolean;
  character: IExtendedNpcData | null;
  universeId: string;
  isCommerceUniverse: boolean;
  autoAiResponse: boolean;
  requestGreetingOnOpen?: boolean;
  waitForConversationHistory?: boolean;
  conversationHistoryReady?: boolean;

  initialMessage?: string;
  initialProductCodes?: string[];

  isInitialized: boolean;
  setIsInitialized: (v: boolean) => void;

  messagesLength: number;

  seedAssistantMessage: (
    content: string,
    opts?: { productCode?: string[]; seed?: string; replace?: boolean }
  ) => IChatMessage | null;
  requestGreeting?: () => Promise<{ success?: boolean; content?: string | null } | null>;

  setLastMessageSender: (v: AiMessageType | null) => void;
  setIsFirstMessage: (v: boolean) => void;

  setLastProductCodes: (codes: string[] | null) => void;
  setProductSourceMessageId: (id: string | null) => void;
}) {
  const {
    open,
    character,
    universeId,
    isCommerceUniverse,
    autoAiResponse,
    requestGreetingOnOpen = false,
    waitForConversationHistory = false,
    conversationHistoryReady = false,
    initialMessage,
    initialProductCodes,
    isInitialized,
    setIsInitialized,
    messagesLength,
    seedAssistantMessage,
    requestGreeting,
    setLastMessageSender,
    setIsFirstMessage,
    setLastProductCodes,
    setProductSourceMessageId,
  } = args;

  const initSeedKeyRef = useRef<string | null>(null);
  const didInitProductRef = useRef(false);

  // 복잡 표현식(`initialProductCodes?.join(",")`) deps 요구 회피용 안정 키.
  const initialProductCodesKey = initialProductCodes?.join(",") ?? "";

  const initSeedKey = useMemo(() => {
    return `${character?.pid ?? "no-char"}|${universeId}|${isCommerceUniverse ? 1 : 0}|${
      autoAiResponse ? 1 : 0
    }|${requestGreetingOnOpen ? 1 : 0}|${initialMessage ?? ""}|${initialProductCodesKey}`;
  }, [
    character?.pid,
    universeId,
    isCommerceUniverse,
    autoAiResponse,
    requestGreetingOnOpen,
    initialMessage,
    initialProductCodesKey,
  ]);

  // 닫힐 때 ref 정리
  useEffect(() => {
    if (!open) {
      initSeedKeyRef.current = null;
      didInitProductRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !character) return;
    if (isInitialized) return;
    if (waitForConversationHistory && !conversationHistoryReady) return;

    if (initSeedKeyRef.current === initSeedKey) return;

    const raf = requestAnimationFrame(() => {
      if (!open || !character) return;
      if (isInitialized) return;
      if (
        waitForConversationHistory &&
        useMessageStore.getState().conversationHistoryStatus[character.pid] !== "ready"
      ) {
        return;
      }
      if (initSeedKeyRef.current === initSeedKey) return;

      initSeedKeyRef.current = initSeedKey;

      const hasExistingMessages = messagesLength > 0;

      // 0) 기존 메시지가 있으면 초기화만
      if (hasExistingMessages) {
        setIsInitialized(true);

        // 커머스: 기존 대화가 있어도 ProductList 트리거 seed 1회 append
        if (isCommerceUniverse && initialProductCodes?.length && !didInitProductRef.current) {
          didInitProductRef.current = true;

          const seedText = initialMessage || "추천 상품을 확인해보세요.";
          const seeded = seedAssistantMessage(seedText, {
            productCode: initialProductCodes,
            seed: "product-seed:append",
            replace: false,
          });

          if (seeded) {
            setLastMessageSender("assistant");
            setIsFirstMessage(false);
            setLastProductCodes(initialProductCodes);
            setProductSourceMessageId(seeded.id);
          }
        } else if (isCommerceUniverse && initialProductCodes?.length) {
          setLastProductCodes(initialProductCodes);
        }

        return;
      }

      if (requestGreetingOnOpen && requestGreeting) {
        void requestGreeting().then((result) => {
          if (initSeedKeyRef.current !== initSeedKey) return;

          if (!result?.success && initialMessage) {
            seedAssistantMessage(initialMessage, {
              seed: `msg-ast:${character.pid}:fallback`,
              replace: true,
            });
          }
          setIsInitialized(true);
        });
        return;
      }

      // 1) 게임 유니버스 & 자동응답 OFF => seed 없이 초기화만
      if (!isCommerceUniverse && !autoAiResponse) {
        setIsInitialized(true);
        return;
      }

      // 2) 커머스: initialMessage가 없고 상품코드만 있으면 상품 안내 seed
      if (!initialMessage && isCommerceUniverse && initialProductCodes?.length) {
        setLastProductCodes(initialProductCodes);

        const seeded = seedAssistantMessage("추천 상품을 확인해보세요.", {
          productCode: initialProductCodes,
          seed: "msg-ast-product-intro",
          replace: true,
        });

        if (seeded) {
          setLastMessageSender("assistant");
          setIsFirstMessage(false);
          setProductSourceMessageId(seeded.id);
        }

        setIsInitialized(true);
        return;
      }

      // 3) 초기 메시지 없으면 초기화만
      if (!initialMessage) {
        setIsInitialized(true);
        return;
      }

      // 4) 일반 초기 assistant seed
      if (isCommerceUniverse && initialProductCodes?.length) {
        setLastProductCodes(initialProductCodes);
      }

      const seeded = seedAssistantMessage(initialMessage, {
        productCode: initialProductCodes?.length ? initialProductCodes : undefined,
        seed: `msg-ast:${character.pid}`,
        replace: true,
      });

      if (seeded) {
        setLastMessageSender("assistant");
        setIsFirstMessage(false);

        if (initialProductCodes?.length) {
          setProductSourceMessageId(seeded.id);
        }
      }

      setIsInitialized(true);
    });

    return () => cancelAnimationFrame(raf);
  }, [
    open,
    character,
    universeId,
    isCommerceUniverse,
    autoAiResponse,
    requestGreetingOnOpen,
    waitForConversationHistory,
    conversationHistoryReady,
    initialMessage,
    initialProductCodes,
    initialProductCodesKey,
    initSeedKey,
    isInitialized,
    messagesLength,
    seedAssistantMessage,
    requestGreeting,
    setIsInitialized,
    setLastMessageSender,
    setIsFirstMessage,
    setLastProductCodes,
    setProductSourceMessageId,
  ]);
}
