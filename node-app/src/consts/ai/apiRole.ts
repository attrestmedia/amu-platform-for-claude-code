// NOTE: provider ↔ model allowlist(강제 매핑) 정책 폐기함
// - provider/model 정합성은 (1) provider prefix가 명시된 경우에만 mismatch 차단
// - 그 외는 pricing 설정(assertPricingConfigured)에서 fail-closed로 보증

// 에러 상태 코드
export const statusMap: Record<string, number> = {
  COIN_INSUFFICIENT: 402,
  DIALOG_LIMIT_EXCEEDED: 403,
  NPC_LIMIT_EXCEEDED: 403,

  SYSTEM_PROMPT_TOKEN_EXCEEDED: 413,
  CONVERSATION_HISTORY_TOKEN_EXCEEDED: 413,
  MESSAGE_TOO_LONG: 413,
  MESSAGE_TOKEN_EXCEEDED: 413,
  PROMPT_OPTIONS_TOO_LONG: 413,

  UNIVERSE_NOT_FOUND: 404,
  NOT_COMMERCE_UNIVERSE: 400,
  MODEL_PROVIDER_MISMATCH: 400,
  ROUTE_UNIVERSE_MISMATCH: 400,

  // model / pricing
  MODEL_REQUIRED: 400,
  UNSUPPORTED_MODEL: 400,
  INVALID_MODEL_FORMAT: 400,
  PRICING_NOT_FOUND: 503,
  MODEL_TEMP_UNAVAILABLE: 503,

  // billing
  BILLING_FAILED: 500,

  // system prompt compose
  SYSTEM_PROMPT_COMPOSE_FAILED: 503,

  RATE_LIMIT_EXCEEDED: 429,

  // sharedRequestUtils / request-base fail-closed
  UNIVERSE_ID_REQUIRED: 400,
  NPC_ID_REQUIRED: 400,
  GUEST_ID_REQUIRED: 400,
  MESSAGE_REQUIRED: 400,
  PROVIDER_REQUIRED: 400,
};
