"use client";

import fetchClient from "libs/api/fetchClient";
import type {
  NpcConversationReportReasonType,
  NpcConversationReportResponse,
} from "types/game/npc-conversation-report";

export async function reportNpcConversation(args: {
  universeId: string;
  npcId: string;
  userPersonaId: string;
  conversationSessionId: string;
  reason: NpcConversationReportReasonType;
  note?: string;
}) {
  const response = await fetchClient.post<NpcConversationReportResponse>(
    "/game/npc/report",
    args,
    { responseType: "auto" },
  );
  return response.data;
}

