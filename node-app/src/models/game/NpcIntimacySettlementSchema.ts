import { Schema, type Document } from "mongoose";
import {
  NPC_INTIMACY_SETTLEMENT_STATUSES,
  type INpcIntimacySettlementDoc,
} from "types/game/npc-intimacy";

/**
 * @docHint
 * @purpose 대화 세션별 NPC 친밀도 정산을 영구 멱등 처리하는 이력 원장
 * @process uid/npcId/conversationSessionId unique  applying/applied 상태 전이와 서버 판정 결과 기록
 * @domain game.npc-intimacy
 * @scope db-schema
 */

export interface INpcIntimacySettlementDocument extends Document, INpcIntimacySettlementDoc {}

export const NpcIntimacySettlementSchema = new Schema<INpcIntimacySettlementDocument>(
  {
    uid: { type: String, required: true, index: true },
    npcId: { type: String, required: true, index: true },
    conversationSessionId: { type: String, required: true },
    status: {
      type: String,
      enum: NPC_INTIMACY_SETTLEMENT_STATUSES,
      required: true,
      default: "prepared",
      index: true,
    },
    serverComputedGain: { type: Number, required: true, default: 0, min: 0, max: 999 },
    appliedGain: { type: Number, required: true, default: 0, min: 0, max: 999 },
    dayKey: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    applyingAt: { type: Date },
    appliedAt: { type: Date },
  },
  { timestamps: true, collection: "npc_intimacy_settlements" },
);

NpcIntimacySettlementSchema.index(
  { uid: 1, npcId: 1, conversationSessionId: 1 },
  { unique: true },
);
NpcIntimacySettlementSchema.index({ uid: 1, status: 1, updatedAt: -1 });
