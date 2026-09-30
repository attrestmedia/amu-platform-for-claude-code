"use client";

import fetchClient from "libs/api/fetchClient";
import type { INpcIntimacyView, NpcIntimacySettlementStatusType } from "types/game/npc-intimacy";

export type NpcIntimacySettlementResponse = {
  ok: boolean;
  duplicate: boolean;
  inProgress: boolean;
  data: {
    status: NpcIntimacySettlementStatusType;
    conversationSessionId: string;
    appliedGain: number;
    intimacy: INpcIntimacyView;
    rejectionReason: string;
  };
};

export async function settleNpcConversation(args: {
  npcId: string;
  userPersonaId: string;
  conversationSessionId: string;
}) {
  const response = await fetchClient.post<NpcIntimacySettlementResponse>(
    "/game/npc/intimacy/settle",
    args,
    { responseType: "auto" },
  );
  return response.data;
}
