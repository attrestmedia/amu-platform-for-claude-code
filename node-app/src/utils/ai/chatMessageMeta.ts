import type { IChatMessage, AiMessageBaseType, ChatMessageMetaType, SystemCodeType } from "types/ai";
import { uniqueMsgId } from "utils/common";

/**
 * @docHint
 * @purpose chatMessageMeta 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ai
 * @scope shared
 */

export function createChatMessageMeta(
  role: AiMessageBaseType,
  opts: { seed?: string; timestamp?: Date; clientId?: string } = {}
): ChatMessageMetaType {
  const ts = opts.timestamp ?? new Date();
  if (opts.clientId) return { clientId: opts.clientId, timestamp: ts };

  // 기본 "시간 + 랜덤"으로 충돌 방지
  const seed = opts.seed ?? `${ts.getTime()}-${Math.random().toString(16).slice(2)}`;
  const prefix = role === "user" ? "user" : "assistant";
  const clientId = uniqueMsgId(prefix, seed);

  return { clientId, timestamp: ts };
}

export function toUiChatMessage(args: {
  role: AiMessageBaseType;
  content: string;
  meta: ChatMessageMetaType;
  translation?: string;
  systemCode?: SystemCodeType[];
  productCode?: string[];
}): IChatMessage {
  const { role, content, meta } = args;

  return {
    id: meta.clientId, // UI id === clientId
    text: content,
    isUser: role === "user",
    translation: args.translation,
    systemCode: args.systemCode,
    productCode: args.productCode,
    timestamp: meta.timestamp,
  };
}
