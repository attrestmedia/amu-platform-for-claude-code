import mongoose, { Schema } from "mongoose";
import {
  NPC_CONVERSATION_REPORT_REASONS,
  NPC_CONVERSATION_REPORT_STATUSES,
  type INpcConversationReportDoc,
} from "types/game/npc-conversation-report";

/**
 * @docHint
 * @purpose owner Play NPC 대화 신고와 관리자 처리 상태를 원문 복제 없이 멱등 보존
 * @process session 참조·사유·safety code 저장  owner/NPC/session unique  관리자 상태 추적
 * @domain game.npc-conversation-report
 * @scope db-schema
 */

export type INpcConversationReportDocument = INpcConversationReportDoc & mongoose.Document;

export const NpcConversationReportSchema = new Schema<INpcConversationReportDocument>(
  {
    reportId: { type: String, required: true, unique: true, index: true },
    uid: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    npcId: { type: String, required: true, index: true },
    userPersonaId: { type: String, required: true, index: true },
    conversationSessionId: { type: String, required: true, index: true },
    reason: { type: String, enum: NPC_CONVERSATION_REPORT_REASONS, required: true },
    note: { type: String, default: "", maxlength: 500 },
    status: { type: String, enum: NPC_CONVERSATION_REPORT_STATUSES, default: "pending", index: true },
    messageCount: { type: Number, min: 0, default: 0 },
    safetyCodes: { type: [String], default: [] },
    lastMessageAt: { type: Date },
    reviewedBy: { type: String, default: "" },
    reviewedAt: { type: Date },
    resolutionNote: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true },
);

NpcConversationReportSchema.index(
  { uid: 1, npcId: 1, conversationSessionId: 1 },
  { unique: true, name: "uniq_owner_npc_conversation_report" },
);
NpcConversationReportSchema.index({ status: 1, createdAt: 1 });

