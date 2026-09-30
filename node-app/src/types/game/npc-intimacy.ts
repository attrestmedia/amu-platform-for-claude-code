export const NPC_INTIMACY_SETTLEMENT_STATUSES = [
  "prepared",
  "applying",
  "applied",
  "rejected",
  "failed",
] as const;

export type NpcIntimacySettlementStatusType = (typeof NPC_INTIMACY_SETTLEMENT_STATUSES)[number];

export interface INpcIntimacyDoc {
  uid: string;
  npcId: string;
  intimacy: number;
  discovered: boolean;
  dayKey: string;
  dayGainCount: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface INpcIntimacySettlementDoc {
  uid: string;
  npcId: string;
  conversationSessionId: string;
  status: NpcIntimacySettlementStatusType;
  serverComputedGain: number;
  appliedGain: number;
  dayKey: string;
  rejectionReason?: string;
  applyingAt?: string | Date;
  appliedAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface INpcIntimacyView {
  npcId: string;
  intimacy: number;
  discovered: boolean;
  dayKey: string;
  dayGainCount: number;
}

export interface INpcIntimacySettlementResult {
  settlement: INpcIntimacySettlementDoc;
  intimacy: INpcIntimacyView;
  duplicate: boolean;
  inProgress: boolean;
}
