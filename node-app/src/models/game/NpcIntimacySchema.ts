import { Schema, type Document } from "mongoose";
import type { INpcIntimacyDoc } from "types/game/npc-intimacy";

/**
 * @docHint
 * @purpose 사용자별 NPC 발견·친밀도와 일일 증가량을 보관하는 Play 진행 원장
 * @process uid/npcId 단일 상태  intimacy 범위 제한  dayKey/dayGainCount 일일 상한 상태 기록
 * @domain game.npc-intimacy
 * @scope db-schema
 */

export interface INpcIntimacyDocument extends Document, INpcIntimacyDoc {}

export const NpcIntimacySchema = new Schema<INpcIntimacyDocument>(
  {
    uid: { type: String, required: true, index: true },
    npcId: { type: String, required: true, index: true },
    intimacy: { type: Number, required: true, default: 0, min: 0, max: 999 },
    discovered: { type: Boolean, required: true, default: false, index: true },
    dayKey: { type: String, default: "" },
    dayGainCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, collection: "npc_intimacies" },
);

NpcIntimacySchema.index({ uid: 1, npcId: 1 }, { unique: true });
NpcIntimacySchema.index({ uid: 1, discovered: 1, updatedAt: -1 });
