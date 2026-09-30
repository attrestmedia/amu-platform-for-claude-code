import { logger } from "utils/log";
import type { IMessage, IMessageAudioMeta, SystemCodeLikeType } from "types/ai";
import fetchClient from "libs/api/fetchClient";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/conversations) 호출 구성  응답/에러 정리 반환
 * @domain ai
 * @scope client
 */

interface ConversationOptions {
  maxMessages?: number;
  universeId?: string; // 게스트 조회용
}

// 특정 NPC와의 대화 기록을 가져오기
export async function getConversations(personaId?: string, userPersonaId?: string, options?: ConversationOptions) {
  const out = await fetchClient.get<UnknownRecord>("/conversations", {
    params: {
      ...(personaId ? { personaId } : {}),
      ...(userPersonaId ? { userPersonaId } : {}),
      ...(options?.universeId ? { universeId: options.universeId } : {}),
      ...(options?.maxMessages ? { maxMessages: options.maxMessages } : {}),
    },
    responseType: "auto",
  });
  return out.data;
}

// 새 메시지를 저장
export async function saveConversationMessage({
  personaId,
  userPersonaId,
  sessionId,
  message,
  location,
  relationshipUpdate,
}: {
  personaId: string;
  userPersonaId: string;
  sessionId: string;
  message: IMessage;
  location?: string;
  relationshipUpdate?: {
    intimacy?: number;
    intimacyDeltaHint?: boolean;
    contentLength?: number;
    reason?: string;
    systemCode?: SystemCodeLikeType[];
    event?: {
      type: string;
      description: string;
    };
  };
}) {
  try {
    const out = await fetchClient.post<UnknownRecord>(
      "/conversations",
      {
        personaId,
        userPersonaId,
        sessionId,
        message,
        location,
        relationshipUpdate,
      },
      { responseType: "auto" },
    );
    return out.data;
  } catch (error: unknown) {
    logger.error("메시지 저장 오류:", error);
    throw error;
  }
}

export async function saveAssistantAudioMeta(args: {
  personaId: string;
  sessionId: string;
  clientId: string;
  content: string;
  audioMeta: IMessageAudioMeta;
  userPersonaId?: string;
  universeId?: string;
  guestId?: string;
  location?: string;
}) {
  const payload = {
    personaId: args.personaId,
    ...(args.userPersonaId ? { userPersonaId: args.userPersonaId } : {}),
    ...(args.universeId ? { universeId: args.universeId } : {}),
    sessionId: args.sessionId,
    location: args.location || "chat-window",
    message: {
      role: "assistant" as const,
      content: args.content,
      clientId: args.clientId,
      timestamp: new Date().toISOString(),
      audioMeta: args.audioMeta,
    },
  };

  try {
    const out = await fetchClient.post<UnknownRecord>("/conversations", payload, {
      headers: args.guestId ? { "x-guest-id": args.guestId } : undefined,
      responseType: "auto",
    });
    return out.data;
  } catch (error: unknown) {
    logger.error("assistant audioMeta 저장 오류:", error);
    throw error;
  }
}
