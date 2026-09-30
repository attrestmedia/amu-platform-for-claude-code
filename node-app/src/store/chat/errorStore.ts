"use client";

import { create } from "zustand";
import type { ChatErrorType } from "consts/ai";
import { CHAT_ERROR_TYPE } from "consts/ai";
import type { UserAccountType } from "consts/auth";
import { lang } from "components/module/i18n";
import { useEffect } from "react";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain chat
 * @scope client-store
 */

interface ErrorState {
  error: string | null;
  errorType: ChatErrorType;
  errorTimestamp: Date | null;
  clearTimerId: number | null; // 기존 호환성을 위해 유지
}

interface ErrorActions {
  setError: (message: string | null, type: ChatErrorType, accountType?: UserAccountType) => void;
  clearError: () => void;
  // “실제 에러 메시지” 우선: rawMessage가 있으면 그대로 사용
  getErrorMessage: (type: ChatErrorType, accountType?: UserAccountType, rawMessage?: string | null) => string;
}

export const useErrorStore = create<ErrorState & ErrorActions>((set, get) => ({
  error: null,
  errorType: CHAT_ERROR_TYPE.NONE,
  errorTimestamp: null,
  clearTimerId: null,

  setError: (message, type) => {
    const currentTimerId = get().clearTimerId;
    if (currentTimerId !== null) {
      clearTimeout(currentTimerId);
    }

    set({
      error: message,
      errorType: type,
      errorTimestamp: new Date(),
      clearTimerId: null,
    });
  },

  clearError: () => {
    const { clearTimerId } = get();
    if (clearTimerId !== null) clearTimeout(clearTimerId);
    set({
      error: null,
      errorType: CHAT_ERROR_TYPE.NONE,
      errorTimestamp: null,
      clearTimerId: null,
    });
  },

  getErrorMessage: (type, _accountType, rawMessage) => {
    if (rawMessage && rawMessage.trim()) return rawMessage;
    switch (type) {
      case CHAT_ERROR_TYPE.CONVERSATION_HISTORY_TOKEN_EXCEEDED:
      case CHAT_ERROR_TYPE.TOKEN_LIMIT_EXCEEDED:
        return lang({
          ko: `대화 기록이 제한을 초과합니다. 새로운 대화를 시작하거나 계정을 업그레이드하세요.`,
          en: `Conversation history is too long. Start a new conversation or upgrade your account.`,
        });

      case CHAT_ERROR_TYPE.SYSTEM_PROMPT_TOKEN_EXCEEDED:
      case CHAT_ERROR_TYPE.SYSTEM_ERROR:
        return lang({
          ko: `시스템 설정 오류입니다. 관리자에게 문의해주세요.`,
          en: `System configuration error. Please contact support.`,
        });

      default:
        return lang({
          ko: `일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`,
          en: `A temporary error occurred. Please try again later.`,
        });
    }
  },
}));

// React 컴포넌트에서 사용할 훅
export function useErrorCleanup() {
  const clearError = useErrorStore((state) => state.clearError);

  useEffect(() => {
    return () => clearError();
  }, [clearError]);
}

// 에러 상태를 모니터링하는 훅
export function useErrorMonitor() {
  const { error, errorType, errorTimestamp } = useErrorStore();

  return {
    hasError: !!error,
    errorType,
    errorTimestamp,
    activeTimerCount: 0,
    isRecovering: false,
  };
}
