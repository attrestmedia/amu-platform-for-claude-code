import { handleUnifiedTextChatRequest } from "libs/server-utils/api/unifiedChat";
import { handleAmuTextChatWithFallback } from "libs/server-utils/chat/amuChatFallback";
import { validateRequest } from "libs/server-utils/api/apiHelper";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { resolveChatModelPolicy } from "libs/server-utils/chat/chatModelPolicy";

/**
 * @docHint
 * @purpose AI 대화 요청 처리 및 스트리밍/비스트리밍 응답
 * @process 요청 파싱  인증/권한 검증  시스템 프롬프트 구성/안전 가드  모델 호출  메시지 저장  응답 반환
 * @domain ai
 * @scope global
 */

export const POST = withAuth(
  async (data, user) => {
    const requestedService = data?.chatModelService;
    if (requestedService !== undefined && requestedService !== null && requestedService !== "" && requestedService !== "amu") {
      const error = new Error("chatModelService가 유효하지 않습니다.") as Error & { errorCode: string; status: number };
      error.errorCode = "CHAT_MODEL_SERVICE_INVALID";
      error.status = 400;
      throw error;
    }
    const isAmuChat = data?.chatModelService === "amu";
    const resolved = isAmuChat
      ? await resolveChatModelPolicy({
          uid: String(user?.uid || user?.ID || ""),
          service: "amu",
          actor: { user },
          requestedProvider: data?.provider,
          requestedModelName: data?.modelName,
        })
      : await resolveChatModelPolicy({
          uid: String(user?.uid || user?.ID || ""),
          service: "game",
          actor: { user },
          universeId: String(data?.universeId || ""),
          personaId: String(data?.npcId || ""),
        });
    if (isAmuChat) {
      const routed = await handleAmuTextChatWithFallback({ policy: resolved, data, user });
      return {
        ...routed.response,
        meta: {
          modelResolution: routed.selection,
        },
      };
    }
    const response = await handleUnifiedTextChatRequest(
      resolved.selected.provider,
      {
        ...data,
        modelName: resolved.selected.modelName,
        routeHint: "ai",
      },
      user,
    );
    return {
      ...response,
      meta: {
        modelResolution: resolved.selected,
      },
    };
  },
  validateRequest,
  "ai/chat",
);
