import type {
  AiProviderType,
  ChatImageInputType,
  ChatModelServiceType,
  IMessage,
  IAiResponse,
  RouteHintType,
  SystemPromptOptionsType,
} from "types/ai";
import { chatWithUnifiedTextEndpoint } from "./unifiedChatClient";
import { ensureGuestId, normalizeRouteHint } from "utils/normalize";

export type ChatWithAIOptions = {
  promptOptions?: SystemPromptOptionsType;
} & Record<string, unknown>;

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain ai
 * @scope client
 */

export type ChatWithAIParams = {
  routeHint?: RouteHintType;
  chatModelService?: ChatModelServiceType;
  provider: AiProviderType;
  modelName: string;
  universeId: string;
  npcId: string;
  message: string;
  history?: IMessage[];
  options?: ChatWithAIOptions;
  guestId?: string;
  sessionId?: string;
  userPersonaId?: string;
  userClientId?: string;
  assistantClientId?: string;
  voiceInput?: Record<string, unknown>;
  imageInput?: ChatImageInputType;
  signal?: AbortSignal;
};

// provider 값만 정규화해 반환
export function getAIService(provider: AiProviderType) {
  return String(provider || "")
    .trim()
    .toLowerCase() as AiProviderType;
}

export async function chatWithAI(params: ChatWithAIParams): Promise<IAiResponse> {
  const routeHint = normalizeRouteHint(params.routeHint);
  const provider = getAIService(params.provider);
  const modelName = String(params.modelName || "").trim();

  // 모델명은 서버 preflight가 fail-closed라서 "클라에서"도 빈 값 차단하는 게 좋아
  if (!modelName) {
    return { content: "", isError: true, error: "modelName이 필요합니다.", errorCode: "MODEL_REQUIRED" };
  }

  // commerce면 guestId를 단일 소스(ensureGuestId)로 보장
  const guestId = routeHint === "commerce" ? ensureGuestId(params.guestId) : params.guestId;
  return chatWithUnifiedTextEndpoint({
    routeHint,
    chatModelService: params.chatModelService,
    provider,
    modelName,
    universeId: params.universeId,
    npcId: params.npcId,
    message: params.message,
    history: params.history,
    options: params.options,
    guestId,
    sessionId: params.sessionId,
    userPersonaId: params.userPersonaId,
    userClientId: params.userClientId,
    assistantClientId: params.assistantClientId,
    voiceInput: params.voiceInput,
    imageInput: params.imageInput,
    signal: params.signal,
  });
}
