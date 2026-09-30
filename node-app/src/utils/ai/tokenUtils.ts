import type { IMessage } from "types/ai";
import { PROMPT_LIMITS } from "consts/auth";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose tokenUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ai
 * @scope shared
 */

export function estimateTokens(text: string): number {
  // 한글은 보통 1글자당 1-2토큰, 영어는 4글자당 1토큰 정도
  const koreanChars = (text.match(/[가-힣]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const otherChars = text.length - koreanChars - englishChars;

  return Math.ceil(koreanChars * 1.5 + englishChars * 0.25 + otherChars * 0.5);
}

// 토큰과 메시지 개수를 고려한 대화 기록 필터링
export function filterConversationHistory<T = unknown>(messages: T[]): T[] {
  // 1. 최근 메시지부터 역순으로 처리 (메시지 개수 제한)
  const recentMessages = messages.slice(-PROMPT_LIMITS.maxMessages);

  // 2. 토큰 제한도 고려하여 추가 필터링 (토큰 수 제한)
  let totalTokens = 0;
  const filteredMessages: T[] = [];

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const getText = (m: unknown): string => {
      const r = toUnknownRecord(m);
      if (typeof r.content === "string") return r.content;
      if (typeof r.text === "string") return r.text;
      return "";
    };
    const messageTokens = estimateTokens(getText(recentMessages[i]));

    if (totalTokens + messageTokens <= PROMPT_LIMITS.conversationHistory) {
      filteredMessages.unshift(recentMessages[i]);
      totalTokens += messageTokens;
    } else {
      break; // 토큰 제한 초과시 중단
    }
  }

  return filteredMessages;
}

// 현재 시각 기준 남은 초 계산
export function secondsUntilExp(exp: number | null): number {
  if (!exp) return -1;
  const now = Math.floor(Date.now() / 1000);
  return exp - now;
}

// 최신 메시지부터 거꾸로 담아 예산을 넘기지 않도록 자르는 함수
export const capHistoryByTokenBudget = (history: IMessage[], budget: number, perMsgPad = 8) => {
  const trimmed: IMessage[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = estimateTokens(history[i].content || "") + perMsgPad;
    if (used + t > budget) break;
    trimmed.push({ role: history[i].role, content: history[i].content });
    used += t;
  }
  return trimmed.reverse(); // 시간 순서 복원
};
