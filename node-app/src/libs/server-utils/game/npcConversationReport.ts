import { getConversationMessageModel, getConversationSessionModel } from "libs/database/conversations";
import {
  createNpcConversationReportIfAbsent,
  rejectNpcIntimacySettlementIfAbsent,
} from "libs/database/game";
import type { NpcConversationReportReasonType } from "types/game/npc-conversation-report";
import { getKstDateKey } from "utils/app/tutorsEditPolicy";

/**
 * @docHint
 * @purpose 인증 사용자의 실제 Play conversation owner를 확인하고 신고 원장·친밀도 거부를 연결
 * @process owner session 조회  저장 message safety code 요약  report 멱등 생성  미정산 reward reject
 * @domain game.npc-conversation-report
 * @scope server-service
 */

const SAFETY_CODES = new Set(["negative", "end-chat", "end-force"]);

export async function reportNpcConversation(args: {
  uid: string;
  serverUserId: string;
  universeId: string;
  npcId: string;
  userPersonaId: string;
  conversationSessionId: string;
  reason: NpcConversationReportReasonType;
  note?: string;
}) {
  const sessionModel = await getConversationSessionModel(args.serverUserId);
  const session = await sessionModel
    .findOne({
      userId: args.serverUserId,
      personaId: args.npcId,
      userPersonaId: args.userPersonaId,
      sessionId: args.conversationSessionId,
    })
    .lean();
  if (!session) throw Object.assign(new Error("npc_conversation_session_not_found"), { status: 404 });
  const sessionUniverseId = String(session.universeId || "").trim();
  if (sessionUniverseId && sessionUniverseId !== args.universeId) {
    throw Object.assign(new Error("npc_conversation_session_not_found"), { status: 404 });
  }

  const messageModel = await getConversationMessageModel(args.serverUserId);
  const safetyRows = await messageModel
    .find({
      userId: args.serverUserId,
      personaId: args.npcId,
      userPersonaId: args.userPersonaId,
      sessionId: args.conversationSessionId,
      role: "assistant",
    })
    .sort({ timestamp: -1 })
    .limit(50)
    .select({ systemCode: 1 })
    .lean<Array<{ systemCode?: string[] }>>();
  const safetyCodes = Array.from(
    new Set(
      safetyRows
        .flatMap((row) => (Array.isArray(row.systemCode) ? row.systemCode : []))
        .map((code) => String(code || "").trim().toLowerCase().replaceAll("_", "-"))
        .filter((code) => SAFETY_CODES.has(code)),
    ),
  );

  const result = await createNpcConversationReportIfAbsent({
    uid: args.uid,
    universeId: sessionUniverseId || args.universeId,
    npcId: args.npcId,
    userPersonaId: args.userPersonaId,
    conversationSessionId: args.conversationSessionId,
    reason: args.reason,
    note: String(args.note || "").trim().slice(0, 500),
    messageCount: Math.max(0, Number(session.messageCount || 0)),
    safetyCodes,
    lastMessageAt: session.lastMessageAt,
  });

  const settlement = await rejectNpcIntimacySettlementIfAbsent({
    uid: args.uid,
    npcId: args.npcId,
    conversationSessionId: args.conversationSessionId,
    dayKey: getKstDateKey(),
    reason: `user_report:${args.reason}`,
  });

  await sessionModel.updateOne(
    {
      _id: session._id,
      completionStatus: { $ne: "completed" },
    },
    {
      $set: {
        completionStatus: "rejected",
        completedAt: new Date(),
        completionEventKey: `npc-report:${result.report.reportId}`,
      },
    },
  );

  return {
    ...result,
    settlementStatus: settlement.status,
  };
}
