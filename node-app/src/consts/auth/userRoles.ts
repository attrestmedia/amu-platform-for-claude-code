// NOTE: "유저 등급별 API 제한" 정책 폐기
// - 서버 안정성/폭주 방지용 "전역 상한"으로만 사용

export const USER_ROLES = {
  ADMINISTRATOR: "administrator",
  EDITOR: "editor",
  AUTHOR: "author",
  CONTRIBUTOR: "contributor",
  SUBSCRIBER: "subscriber",
} as const;

export const USER_ACCOUNT_TYPE = {
  FREE: "free",
  PRO: "pro",
  PREMIUM: "premium",
  ENTERPRISE: "enterprise",
} as const;

// API 요청 제한 (분당 N회)
export const API_RATE_LIMIT = 60; // 60회/분 (초당 1회 수준)

// 프롬프트 제한 설정
export const PROMPT_LIMITS = {
  systemPrompt: 32000, // 최대 시스템 프롬프트 (토큰)
  conversationHistory: 16000, // 최대 대화 기록 (토큰)
  maxMessages: 1500, // 최대 히스토리 메시지
  maxInputMessageLength: 8000, // 입력 메시지 제한 (토큰)
  maxOutputMessageLength: 16000, // 출력 메시지 제한 (토큰)
};

// 메모리 제한 설정
export const MEMORY_LIMITS = {
  MAX_CONVERSATIONS: 10, // 최대 보관할 대화방 수
  MAX_MESSAGES_PER_CONVERSATION: 100, // 대화방당 최대 메시지 수
  MAX_SAVED_MESSAGE_IDS: 1000, // 최대 저장 메시지 ID 수
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5분마다 정리
  MAX_FILTERED_MESSAGES: 200, // 필터링된 메시지 최대 수
  MEMORY_WARNING_THRESHOLD: 10 * 1024, // 10MB
};

export type UserRoles = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type UserAccountType = (typeof USER_ACCOUNT_TYPE)[keyof typeof USER_ACCOUNT_TYPE];
