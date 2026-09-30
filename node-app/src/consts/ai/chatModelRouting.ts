import type { TextProviderType } from "types/ai";

/**
 * @docHint
 * @purpose 일반 AMU 대화의 승인된 텍스트 모델 fallback 정책
 * @process 카탈로그·자격증명 상태와 승인 chain을 교집합으로 계산하고 provider 장애 reason code를 정규화
 * @domain ai-chat
 * @scope shared
 */

export type AmuChatFallbackCandidate = {
  key: string;
  provider: TextProviderType;
  modelName: string;
};

// 서비스 역할 기본값과 사용자의 선호 모델은 분리한다. 이 순서는 운영 승인 정책이다.
export const AMU_CHAT_APPROVED_FALLBACK_CHAIN = [
  { key: "zai:glm-5.3-flash", provider: "zai", modelName: "glm-5.3-flash" },
  { key: "openai:gpt-5.6-luna", provider: "openai", modelName: "gpt-5.6-luna" },
  { key: "google:gemini-3.5-flash-lite", provider: "google", modelName: "gemini-3.5-flash-lite" },
] as const satisfies readonly AmuChatFallbackCandidate[];

type CatalogCandidate = { provider: string; modelName: string; key?: string };

export function buildAmuChatFallbackChain(
  catalog: readonly CatalogCandidate[],
  availableProviders: ReadonlySet<string>,
): AmuChatFallbackCandidate[] {
  const catalogKeys = new Set(
    catalog.map((item) => item.key || `${String(item.provider).toLowerCase()}:${String(item.modelName)}`),
  );
  return AMU_CHAT_APPROVED_FALLBACK_CHAIN.filter(
    (candidate) => catalogKeys.has(candidate.key) && availableProviders.has(candidate.provider),
  ).map((candidate) => ({ ...candidate }));
}

export type ProviderFallbackReasonCode =
  | "provider_credential_unavailable"
  | "provider_rate_limited"
  | "provider_unavailable";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readErrorField(error: unknown, field: string): unknown {
  const root = asRecord(error);
  const response = asRecord(root.response);
  const responseData = asRecord(response.data);
  return root[field] ?? responseData[field] ?? asRecord(root.data)[field];
}

export function classifyProviderFallbackReason(error: unknown): ProviderFallbackReasonCode | null {
  const code = String(readErrorField(error, "errorCode") || readErrorField(error, "code") || "")
    .trim()
    .toUpperCase();
  const status = Number(readErrorField(error, "status") || asRecord(asRecord(error).response).status);

  if (code === "PLATFORM_CREDENTIAL_UNAVAILABLE") return "provider_credential_unavailable";
  if (["RATE_LIMITED", "PROVIDER_RATE_LIMITED", "UPSTREAM_RATE_LIMITED", "AI_PROVIDER_RATE_LIMITED"].includes(code)) {
    return "provider_rate_limited";
  }
  if (status === 429) return "provider_rate_limited";
  if (code === "AI_PROVIDER_REQUEST_FAILED" || readErrorField(error, "providerFailure") === true) {
    return "provider_unavailable";
  }

  // 네트워크/timeout은 unifiedChat이 provider 단계에서 이 코드로 감싼다.
  return null;
}
