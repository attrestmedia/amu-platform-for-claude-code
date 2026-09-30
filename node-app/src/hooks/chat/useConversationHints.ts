"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChatMessage, TextProviderType } from "types/ai";
import { requestConversationHints } from "libs/api/ai/conversationHintClient";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Tutors 대화 힌트 상태 관리
 * @process 마지막 assistant 응답 기준 fallback 표시  LLM 힌트 생성  stale 요청 취소
 * @domain tutors
 * @scope client
 */

const MAX_VISIBLE_CONVERSATION_HINTS = 10;

export type ConversationHintRegenerationOutcome = "replaced" | "empty" | "error" | "skipped";

function mergeConversationHints(current: string[], next: string[]) {
  const seen = new Set<string>();
  return [...current, ...next]
    .map((hint) => String(hint || "").trim())
    .filter((hint) => {
      const key = hint.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_VISIBLE_CONVERSATION_HINTS);
}

function buildFallbackHints(targetLanguage: string) {
  const lang = String(targetLanguage || "").trim().toLowerCase();
  if (lang.includes("japanese") || lang === "ja") {
    return ["こんにちは。", "よろしくお願いします。"];
  }
  if (lang.includes("korean") || lang === "ko" || lang.includes("한국")) {
    return ["안녕하세요.", "오늘 무엇을 연습할까요?"];
  }
  return ["Hi, how are you?", "Nice to meet you.", "Can we practice together?"];
}

export function useConversationHints(args: {
  enabled: boolean;
  open: boolean;
  targetLanguage: string;
  topic?: string;
  provider?: TextProviderType;
  modelName?: string;
  messages: IChatMessage[];
}) {
  const { enabled, open, targetLanguage, topic, provider, modelName, messages } = args;
  const [hints, setHints] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const lastMessage = messages[messages.length - 1] || null;
  const hasUserMessages = useMemo(() => messages.some((message) => message.isUser), [messages]);
  const lastAssistantMessage = useMemo(() => {
    const found = [...messages].reverse().find((message) => !message.isUser && message.text?.trim());
    return String(found?.text || "").trim();
  }, [messages]);
  const recentConversation = useMemo(
    () =>
      messages
        .filter((message) => message.text?.trim())
        .slice(-6)
        .map((message) => `${message.isUser ? "Learner" : "Tutor"}: ${message.text.trim()}`)
        .join("\n"),
    [messages],
  );

  const fallbackHints = useMemo(
    () => buildFallbackHints(targetLanguage),
    [targetLanguage],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !open) {
      setHints([]);
      return;
    }
    if (lastMessage?.isUser) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setIsLoading(true);
    setHints((prev) => (hasUserMessages && prev.length ? prev : fallbackHints));

    try {
      const result = await requestConversationHints({
        targetLanguage,
        topic,
        lastAssistantMessage,
        recentConversation,
        provider,
        modelName,
        signal: abort.signal,
      });
      if (result.success && result.hints.length) {
        setHints(mergeConversationHints([], result.hints));
      } else if (!result.success) {
        // 실패가 조용히 삼켜지면 fallback이 영영 유지된다. errorCode를 남겨 근본 원인을 관측 가능하게 한다.
        logger.warn("[useConversationHints] 힌트 생성 응답 실패:", result.errorCode || result.error || "unknown");
      }
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") {
        logger.warn("[useConversationHints] 힌트 생성 실패:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [enabled, fallbackHints, hasUserMessages, lastAssistantMessage, lastMessage?.isUser, modelName, open, provider, recentConversation, targetLanguage, topic]);

  const regenerateHints = useCallback(async (): Promise<ConversationHintRegenerationOutcome> => {
    if (!enabled || !open || lastMessage?.isUser || isLoading) return "skipped";

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setIsLoading(true);
    setHints((prev) => (prev.length ? prev : fallbackHints));

    const existingHints = hints;
    try {
      const result = await requestConversationHints({
        targetLanguage,
        topic,
        lastAssistantMessage,
        recentConversation,
        excludeHints: existingHints,
        provider,
        modelName,
        signal: abort.signal,
      });
      if (!result.success) {
        logger.warn("[useConversationHints] 힌트 다시 생성 응답 실패:", result.errorCode || result.error || "unknown");
        return "error";
      }
      if (!result.hints.length) return "empty";

      // 직전 힌트와 다른 결과를 요청하고, 기존 목록을 새 힌트로 교체한다.
      setHints(mergeConversationHints([], result.hints));
      return "replaced";
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") {
        logger.warn("[useConversationHints] 힌트 다시 생성 실패:", error);
        return "error";
      }
      return "skipped";
    } finally {
      setIsLoading(false);
    }
  }, [enabled, fallbackHints, hints, isLoading, lastAssistantMessage, lastMessage?.isUser, modelName, open, provider, recentConversation, targetLanguage, topic]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [refresh]);

  return { hints, isLoading, refresh, regenerateHints };
}
