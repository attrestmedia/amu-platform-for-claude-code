export const NPC_CONVERSATION_REPORT_REASONS = [
  "inappropriate",
  "harassment",
  "sexual",
  "violence",
  "self_harm",
  "minor_safety",
  "misinformation",
  "other",
] as const;

export type NpcConversationReportReasonType = (typeof NPC_CONVERSATION_REPORT_REASONS)[number];

export const NPC_CONVERSATION_REPORT_STATUSES = [
  "pending",
  "reviewing",
  "dismissed",
  "actioned",
] as const;

export type NpcConversationReportStatusType = (typeof NPC_CONVERSATION_REPORT_STATUSES)[number];

export type INpcConversationReportDoc = {
  reportId: string;
  uid: string;
  universeId: string;
  npcId: string;
  userPersonaId: string;
  conversationSessionId: string;
  reason: NpcConversationReportReasonType;
  note: string;
  status: NpcConversationReportStatusType;
  messageCount: number;
  safetyCodes: string[];
  lastMessageAt?: Date | string;
  reviewedBy?: string;
  reviewedAt?: Date | string;
  resolutionNote?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type NpcConversationReportResponse = {
  ok: boolean;
  duplicate: boolean;
  data: {
    reportId: string;
    status: NpcConversationReportStatusType;
    reason: NpcConversationReportReasonType;
    settlementStatus: string;
    createdAt: string;
  };
};

