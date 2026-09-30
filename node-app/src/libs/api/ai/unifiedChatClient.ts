import type { AiProviderType, ChatImageInputType, ChatModelServiceType, IMessage, IAiResponse, RouteHintType } from "types/ai";
import fetchClient from "libs/api/fetchClient";
import { parseJsonSafe } from "utils/data";
import { toErrorLike, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";
import type { ChatWithAIOptions } from "./aiChatHelper";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain ai
 * @scope client
 */

export type UnifiedTextChatRequest = {
  routeHint: RouteHintType;
  chatModelService?: ChatModelServiceType;
  provider: AiProviderType;
  modelName: string; // 실제 모델명 (서버에서 pricing preflight)
  universeId: string;
  npcId: string;
  message: string;
  history?: IMessage[];
  options?: ChatWithAIOptions; // promptOptions 등 (서버 authoritative지만 입력은 전달)
  guestId?: string; // commerce 비로그인용
  sessionId?: string;
  userPersonaId?: string;
  userClientId?: string;
  assistantClientId?: string;
  voiceInput?: Record<string, unknown>;
  imageInput?: ChatImageInputType;
  signal?: AbortSignal;
};

export async function chatWithUnifiedTextEndpoint(req: UnifiedTextChatRequest): Promise<IAiResponse> {
  try {
    const endpoint =
      req.routeHint === "commerce" ? "commerce/chat" : req.routeHint === "tutors" ? "tutors/chat" : "ai/chat";
    const path = `/${endpoint}`;

    const headers: Record<string, string> = {};
    // commerce 게스트: 필요 시 x-guest-id를 직접 붙여 전송(미들웨어가 그대로 전달)
    if (req.routeHint === "commerce" && req.guestId) headers["x-guest-id"] = String(req.guestId);

    let status = 0;
    let rawText = "";
    let data: Record<string, unknown> = {};

    try {
      const out = await fetchClient.post<string>(
        path,
        {
          provider: req.provider,
          modelName: req.modelName,
          chatModelService: req.chatModelService,
          universeId: req.universeId,
          npcId: req.npcId,
          message: req.message,
          history: Array.isArray(req.history) ? req.history : [],
          options: req.options,
          sessionId: req.sessionId,
          userPersonaId: req.userPersonaId,
          userClientId: req.userClientId,
          assistantClientId: req.assistantClientId,
          voiceInput: req.voiceInput,
          imageInput: req.imageInput,
        },
        { headers, signal: req.signal, responseType: "text" },
      );
      status = out.status;
      rawText = typeof out.data === "string" ? out.data : "";
      data = (parseJsonSafe(rawText) as Record<string, unknown>) || {};
    } catch (e: unknown) {
      const err = toErrorLike(e);
      const response = toUnknownRecord(err.response);
      status = typeof response.status === "number" ? response.status : 0;
      const respData = response.data as unknown;
      if (typeof respData === "string") {
        rawText = respData;
        data = (parseJsonSafe(rawText) as Record<string, unknown>) || {};
      } else if (respData && typeof respData === "object") {
        data = respData as Record<string, unknown>;
        rawText = "";
      } else {
        rawText = toErrorMessage(e);
        data = (parseJsonSafe(rawText) as Record<string, unknown>) || {};
      }
      return {
        content: "",
        isError: true,
        error: (data?.error as string) || rawText || "알 수 없는 오류가 발생했습니다.",
        errorCode: (data?.errorCode as string) || (status === 401 ? "UNAUTHORIZED" : undefined),
      };
    }

    // 방어적으로 HTTP 200이라도 ok:false면 에러로 처리
    if (data?.ok === false) {
      return {
        content: "",
        isError: true,
        error: (data?.error as string) || rawText || "알 수 없는 오류가 발생했습니다.",
        errorCode: data?.errorCode as string | undefined,
      };
    }

    return {
      content: String(data.result ?? data.content ?? ""),
      translation: data.translation as string | undefined,
      systemCode: data.systemCode as IAiResponse["systemCode"],
      productCode: data.productCode as IAiResponse["productCode"],
      model: data.model as string | undefined,
      isValidJson: data.isValidJson as boolean | undefined,
      meta: data.meta as IAiResponse["meta"],
      isError: false,
    };
  } catch (err: unknown) {
    return {
      content: "",
      isError: true,
      error: toErrorMessage(err, "알 수 없는 오류가 발생했습니다."),
    };
  }
}
