import "server-only";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process processMessagesWithLimit 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain conversations
 * @scope shared
 */

export type ConversationMessage = {
  timestamp: Date;
  [key: string]: unknown;
};

export type ConversationSession = {
  sessionId: string;
  date: Date;
  location?: string;
  summary?: string;
  messages?: ConversationMessage[];
};

export type MessageItem = {
  message: ConversationMessage;
  sessionId: string;
  sessionDate: Date;
  sessionLocation: string;
  sessionSummary?: string;
};

// 메시지 제한 및 정렬
export function processMessagesWithLimit(conversations: ConversationSession[], messageLimit: number) {
  if (!conversations || conversations.length === 0) {
    return [];
  }

  // 메모리 사용량 체크
  const totalMessages = conversations.reduce((sum, session) => sum + (session.messages?.length || 0), 0);

  if (totalMessages > 10000) {
    logger.warn(`대용량 대화 기록 처리: ${totalMessages}개 메시지`);
  }

  const allMessages: MessageItem[] = [];

  // 모든 세션의 모든 메시지를 수집
  conversations.forEach((session) => {
    if (!session.messages || !Array.isArray(session.messages)) {
      return; // 메시지가 없는 세션은 건너뛰기
    }

    session.messages.forEach((message) => {
      allMessages.push({
        message,
        sessionId: session.sessionId,
        sessionDate: session.date,
        sessionLocation: session.location || "unknown",
        sessionSummary: session.summary,
      });
    });
  });

  if (allMessages.length === 0) {
    return [];
  }

  // 모든 메시지를 최신순으로 정렬 (에러 처리 추가)
  try {
    allMessages.sort((a, b) => {
      const dateA = new Date(a.message.timestamp);
      const dateB = new Date(b.message.timestamp);

      // 유효하지 않은 날짜 체크
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
        logger.warn("잘못된 타임스탬프 형식:", {
          messageA: a.message.timestamp,
          messageB: b.message.timestamp,
        });
        return 0;
      }

      return dateB.getTime() - dateA.getTime();
    });
  } catch (error) {
    logger.error("메시지 정렬 중 오류:", error);
    // 정렬 실패 시 원본 순서 유지
  }

  // 메시지 제한 적용
  const limitedMessages = allMessages.slice(0, messageLimit);

  // 세션별로 다시 그룹화
  const sessionMap = new Map();

  limitedMessages.forEach(({ message, sessionId, sessionDate, sessionLocation, sessionSummary }) => {
    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        sessionId,
        date: sessionDate,
        location: sessionLocation,
        summary: sessionSummary,
        messages: [],
      });
    }
    sessionMap.get(sessionId).messages.push(message);
  });

  // 각 세션의 메시지를 시간순으로 정렬 (오래된 것부터)
  const processedConversations = Array.from(sessionMap.values()).map((session) => ({
    ...session,
    messages: session.messages.sort((a: ConversationMessage, b: ConversationMessage) => {
      try {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);

        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          return 0;
        }

        return dateA.getTime() - dateB.getTime();
      } catch (error) {
        logger.error("세션 메시지 정렬 중 오류:", error);
        return 0;
      }
    }),
  }));

  // 세션들을 날짜순으로 정렬 (오래된 것부터)
  processedConversations.sort((a, b) => {
    try {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);

      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
        return 0;
      }

      return dateA.getTime() - dateB.getTime();
    } catch (error) {
      logger.error("세션 정렬 중 오류:", error);
      return 0;
    }
  });

  return processedConversations;
}
