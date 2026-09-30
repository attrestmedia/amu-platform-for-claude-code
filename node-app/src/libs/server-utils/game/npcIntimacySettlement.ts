import "server-only";
import { NPC_INTIMACY_POLICY } from "consts/game";
import {
  getNpcIntimacyForUser,
  getNpcIntimacySettlementByKey,
  rejectNpcIntimacySettlementIfAbsent,
  settleNpcIntimacyGainAtomic,
} from "libs/database/game";
import {
  getConversationMessageModel,
  getConversationSessionModel,
} from "libs/database/conversations";
import type { INpcIntimacySettlementResult } from "types/game/npc-intimacy";
import { estimateTokens } from "utils/ai/tokenUtils";
import { getKstDateKey } from "utils/app/tutorsEditPolicy";

/**
 * @docHint
 * @purpose 서버 저장 Play 대화의 턴·토큰·안전 상태를 판정하고 NPC 친밀도를 멱등 정산
 * @process terminal dedupe  owner 세션/메시지 조회  품질 판정  reject 또는 game DB 원자 정산
 * @domain game.npc-intimacy
 * @scope server
 */

type ConversationQualityMessage = {
  role?: string;
  content?: string;
  systemCode?: string[];
};

export type NpcConversationQuality = {
  eligible: boolean;
  reason: "eligible" | "minimum_turns" | "minimum_tokens" | "unsafe_termination";
  userMessages: number;
  assistantMessages: number;
  totalTokens: number;
  serverComputedGain: number;
};

export function evaluateNpcConversationQuality(
  messages: ConversationQualityMessage[],
): NpcConversationQuality {
  let userMessages = 0;
  let assistantMessages = 0;
  let totalTokens = 0;
  let unsafeTermination = false;

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (message.role === "user") userMessages += 1;
    else assistantMessages += 1;
    totalTokens += estimateTokens(String(message.content || ""));
    const codes = Array.isArray(message.systemCode)
      ? message.systemCode.map((item) => String(item || "").trim().toLowerCase().replace(/_/g, "-"))
      : [];
    if (codes.includes("end-chat") || codes.includes("end-force")) unsafeTermination = true;
  }

  const minimumTurns =
    userMessages >= NPC_INTIMACY_POLICY.minUserMessages &&
    assistantMessages >= NPC_INTIMACY_POLICY.minAssistantMessages;
  const enoughTokens = totalTokens >= NPC_INTIMACY_POLICY.minTotalTokens;
  const eligible = minimumTurns && enoughTokens && !unsafeTermination;
  const reason = unsafeTermination
    ? "unsafe_termination"
    : !minimumTurns
      ? "minimum_turns"
      : !enoughTokens
        ? "minimum_tokens"
        : "eligible";
  const serverComputedGain = eligible
    ? NPC_INTIMACY_POLICY.baseSessionGain +
      (totalTokens >= NPC_INTIMACY_POLICY.bonusTokenThreshold
        ? NPC_INTIMACY_POLICY.bonusTokenGain
        : 0)
    : 0;

  return {
    eligible,
    reason,
    userMessages,
    assistantMessages,
    totalTokens,
    serverComputedGain,
  };
}

export type NpcConversationSettlementOutcome = {
  quality: NpcConversationQuality | null;
  result: INpcIntimacySettlementResult;
};

export async function settleNpcConversationIntimacy(args: {
  uid: string;
  serverUserId: string;
  npcId: string;
  userPersonaId: string;
  conversationSessionId: string;
}): Promise<NpcConversationSettlementOutcome> {
  const uid = String(args.uid || "").trim();
  const serverUserId = String(args.serverUserId || "").trim();
  const npcId = String(args.npcId || "").trim();
  const userPersonaId = String(args.userPersonaId || "").trim();
  const conversationSessionId = String(args.conversationSessionId || "").trim();
  const key = { uid, npcId, conversationSessionId };

  const terminal = await getNpcIntimacySettlementByKey(key);
  if (terminal?.status === "applied" || terminal?.status === "rejected") {
    return {
      quality: null,
      result: {
        settlement: terminal,
        intimacy: await getNpcIntimacyForUser({ uid, npcId }),
        duplicate: true,
        inProgress: false,
      },
    };
  }

  const sessionModel = await getConversationSessionModel(serverUserId);
  const conversationSession = await sessionModel
    .findOne({
      userId: serverUserId,
      personaId: npcId,
      userPersonaId,
      sessionId: conversationSessionId,
    })
    .lean();
  if (!conversationSession) {
    throw Object.assign(new Error("npc_conversation_session_not_found"), { status: 404 });
  }

  const messageModel = await getConversationMessageModel(serverUserId);
  const messages = await messageModel
    .find({
      userId: serverUserId,
      personaId: npcId,
      userPersonaId,
      sessionId: conversationSessionId,
      role: { $in: ["user", "assistant"] },
    })
    .sort({ timestamp: 1 })
    .limit(NPC_INTIMACY_POLICY.maxMessagesEvaluated)
    .select({ role: 1, content: 1, systemCode: 1 })
    .lean<ConversationQualityMessage[]>();
  const quality = evaluateNpcConversationQuality(messages);
  const dayKey = getKstDateKey();

  if (!quality.eligible) {
    const settlement = await rejectNpcIntimacySettlementIfAbsent({
      ...key,
      dayKey,
      reason: quality.reason,
    });
    await sessionModel.updateOne(
      { _id: conversationSession._id, completionStatus: { $exists: false } },
      {
        $set: {
          completionStatus: "rejected",
          completedAt: new Date(),
          completionEventKey: `npc-intimacy:${conversationSessionId}`,
        },
      },
    );
    return {
      quality,
      result: {
        settlement,
        intimacy: await getNpcIntimacyForUser({ uid, npcId }),
        duplicate: settlement.status !== "rejected",
        inProgress: settlement.status === "applying",
      },
    };
  }

  const result = await settleNpcIntimacyGainAtomic({
    ...key,
    dayKey,
    serverComputedGain: quality.serverComputedGain,
    dailyGainLimit: NPC_INTIMACY_POLICY.dailyGainLimit,
    applyingStaleMs: NPC_INTIMACY_POLICY.applyingStaleMs,
  });
  if (result.settlement.status === "applied") {
    await sessionModel.updateOne(
      { _id: conversationSession._id },
      {
        $set: {
          completionStatus: "completed",
          completedAt: new Date(),
          completionEventKey: `npc-intimacy:${conversationSessionId}`,
        },
      },
    );
  }
  return { quality, result };
}
