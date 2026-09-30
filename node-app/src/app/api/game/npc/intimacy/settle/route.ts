import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { settleNpcConversationIntimacy } from "libs/server-utils/game/npcIntimacySettlement";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Play 대화 종료 시 서버 저장 세션 품질을 판정하고 NPC 친밀도를 멱등 정산
 * @process 인증  ID allowlist 검증  owner 대화 조회  턴/토큰/안전 판정  applying/applied 원자 정산
 * @domain game.npc-intimacy
 * @scope user-api
 */

const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export const POST = withAuth(
  async (body, user) => {
    const authenticatedUser = user as AuthenticatedUserType;
    const uid = getAuthenticatedUid(authenticatedUser);
    const serverUserId = String(authenticatedUser?.ID || "").trim();
    const npcId = String(body?.npcId || "").trim();
    const userPersonaId = String(body?.userPersonaId || "").trim();
    const conversationSessionId = String(body?.conversationSessionId || "").trim();

    if (!uid || !serverUserId) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (
      !SAFE_ID_PATTERN.test(npcId) ||
      !SAFE_ID_PATTERN.test(userPersonaId) ||
      !SAFE_ID_PATTERN.test(conversationSessionId)
    ) {
      return NextResponse.json(
        { ok: false, error: "npc_settlement_input_invalid", errorCode: "NPC_SETTLEMENT_INPUT_INVALID" },
        { status: 400 },
      );
    }

    try {
      const outcome = await settleNpcConversationIntimacy({
        uid,
        serverUserId,
        npcId,
        userPersonaId,
        conversationSessionId,
      });
      const settlement = outcome.result.settlement;
      const status = outcome.result.inProgress
        ? 202
        : settlement.status === "rejected"
          ? 409
          : 200;
      return NextResponse.json(
        {
          ok: settlement.status === "applied",
          duplicate: outcome.result.duplicate,
          inProgress: outcome.result.inProgress,
          data: {
            status: settlement.status,
            conversationSessionId,
            appliedGain: Number(settlement.appliedGain || 0),
            intimacy: outcome.result.intimacy,
            quality: outcome.quality,
            rejectionReason: String(settlement.rejectionReason || ""),
          },
        },
        { status },
      );
    } catch (error) {
      const status =
        error && typeof error === "object" && Number((error as { status?: number }).status) === 404
          ? 404
          : 500;
      if (status === 404) logger.warn("[NpcIntimacy][SETTLE] owner session not found");
      else logger.error("[NpcIntimacy][SETTLE] failed:", error);
      return NextResponse.json(
        {
          ok: false,
          error: status === 404 ? "npc_conversation_session_not_found" : "npc_intimacy_settlement_failed",
          errorCode: status === 404 ? "NPC_CONVERSATION_SESSION_NOT_FOUND" : "NPC_INTIMACY_SETTLEMENT_FAILED",
        },
        { status },
      );
    }
  },
  undefined,
  "game/npc/intimacy/settle",
  { bodyParser: "json" },
);
