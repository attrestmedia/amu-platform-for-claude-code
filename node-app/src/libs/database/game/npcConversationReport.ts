import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  NpcConversationReportSchema,
  type INpcConversationReportDocument,
} from "models/game/NpcConversationReportSchema";
import type { INpcConversationReportDoc } from "types/game/npc-conversation-report";

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export async function getNpcConversationReportModel(): Promise<Model<INpcConversationReportDocument>> {
  return getModel<INpcConversationReportDocument>(
    MONGODB_GAME_URL,
    "NpcConversationReport",
    NpcConversationReportSchema,
    "npc_conversation_reports",
  );
}

export async function createNpcConversationReportIfAbsent(
  input: Omit<INpcConversationReportDoc, "reportId" | "status" | "createdAt" | "updatedAt">,
): Promise<{ report: INpcConversationReportDoc; created: boolean }> {
  const model = await getNpcConversationReportModel();
  const key = {
    uid: String(input.uid || "").trim(),
    npcId: String(input.npcId || "").trim(),
    conversationSessionId: String(input.conversationSessionId || "").trim(),
  };
  const existing = await model.findOne(key).lean<INpcConversationReportDoc | null>();
  if (existing) return { report: existing, created: false };

  try {
    const doc = await model.create({
      ...input,
      ...key,
      reportId: `ncr_${crypto.randomUUID().replaceAll("-", "")}`,
      status: "pending",
    });
    return { report: (doc.toObject?.() ?? doc) as INpcConversationReportDoc, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await model.findOne(key).lean<INpcConversationReportDoc | null>();
      if (raced) return { report: raced, created: false };
    }
    throw error;
  }
}

