import "server-only";
import { classifyProviderFallbackReason } from "consts/ai";
import { handleUnifiedTextChatRequest } from "libs/server-utils/api/unifiedChat";
import type { IChatModelPolicyResult, IChatModelSelection } from "types/ai";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 일반 AMU 대화에서 provider 일시 장애를 승인 chain으로 복구
 * @process 모델별 provider 호출  재시도 가능 reason code 판별  선택 결과에 fallback 근거 기록
 * @domain ai-chat
 * @scope server
 */

type UnifiedChatRequest = Parameters<typeof handleUnifiedTextChatRequest>[1];
type UnifiedChatUser = Parameters<typeof handleUnifiedTextChatRequest>[2];

export async function handleAmuTextChatWithFallback(args: {
  policy: IChatModelPolicyResult;
  data: UnifiedChatRequest;
  user?: UnifiedChatUser;
}) {
  const chain = args.policy.fallbackChain.length ? args.policy.fallbackChain : [args.policy.selected];
  const seen = new Set<string>();
  let lastError: unknown = null;
  let lastReason: IChatModelSelection["fallbackReason"];
  const first = chain[0];

  for (const candidate of chain) {
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    try {
      const response = await handleUnifiedTextChatRequest(
        candidate.provider,
        {
          ...args.data,
          modelName: candidate.modelName,
          routeHint: "ai",
        },
        args.user,
      );
      const selection: IChatModelSelection =
        candidate.key === args.policy.selected.key
          ? args.policy.selected
          : {
              ...candidate,
              source: "fallback",
              fallbackReason: lastReason || "provider_unavailable",
              fallbackFrom: first,
            };
      return { response, selection };
    } catch (error) {
      const reason = classifyProviderFallbackReason(error);
      if (!reason) throw error;
      lastError = error;
      lastReason = reason;
      const next = chain.find((item) => !seen.has(item.key));
      logger.warn("[amuChatFallback] provider retry", {
        failedProvider: candidate.provider,
        failedModel: candidate.modelName,
        reasonCode: reason,
        nextProvider: next?.provider || null,
        nextModel: next?.modelName || null,
      });
    }
  }

  throw lastError || new Error("일반 AMU 대화 provider가 모두 실패했습니다.");
}
