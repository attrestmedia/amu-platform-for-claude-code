import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { reportNpcConversation } from "libs/server-utils/game/npcConversationReport";
import { getUniverseById } from "libs/database/universe";
import {
  NPC_CONVERSATION_REPORT_REASONS,
  type NpcConversationReportReasonType,
} from "types/game/npc-conversation-report";
import { logger } from "utils/log";

export const runtime = "nodejs";

const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const REASON_SET = new Set<string>(NPC_CONVERSATION_REPORT_REASONS);

/**
 * @docHint
 * @purpose 로그인 사용자가 소유한 Play NPC conversation을 원문 복제 없이 신고
 * @process 인증  allowlist  owner session 검증  report 멱등 생성  미정산 친밀도 reject
 * @domain game.npc-conversation-report
 * @scope user-api
 */

export const POST = withAuth(
  async (body, user) => {
    const authenticatedUser = user as AuthenticatedUserType;
    const uid = getAuthenticatedUid(authenticatedUser);
    const serverUserId = String(authenticatedUser?.ID || "").trim();
    const universeId = String(body?.universeId || "").trim();
    const npcId = String(body?.npcId || "").trim();
    const userPersonaId = String(body?.userPersonaId || "").trim();
    const conversationSessionId = String(body?.conversationSessionId || "").trim();
    const reason = String(body?.reason || "").trim();
    const note = String(body?.note || "").trim();

    if (!uid || !serverUserId) {
      return NextResponse.json({ ok: false, error: "unauthorized", errorCode: "UNAUTHORIZED" }, { status: 401 });
    }
    if (
      !SAFE_ID_PATTERN.test(universeId) ||
      !SAFE_ID_PATTERN.test(npcId) ||
      !SAFE_ID_PATTERN.test(userPersonaId) ||
      !SAFE_ID_PATTERN.test(conversationSessionId) ||
      !REASON_SET.has(reason)
    ) {
      return NextResponse.json(
        { ok: false, error: "npc_report_input_invalid", errorCode: "NPC_REPORT_INPUT_INVALID" },
        { status: 400 },
      );
    }
    if (note.length > 500) {
      return NextResponse.json(
        { ok: false, error: "npc_report_note_too_long", errorCode: "NPC_REPORT_NOTE_TOO_LONG" },
        { status: 400 },
      );
    }

    try {
      const universe = await getUniverseById(universeId);
      if (!universe) {
        return NextResponse.json(
          { ok: false, error: "universe_not_found", errorCode: "UNIVERSE_NOT_FOUND" },
          { status: 404 },
        );
      }
      const outcome = await reportNpcConversation({
        uid,
        serverUserId,
        universeId,
        npcId,
        userPersonaId,
        conversationSessionId,
        reason: reason as NpcConversationReportReasonType,
        note,
      });
      const report = outcome.report;
      return NextResponse.json(
        {
          ok: true,
          duplicate: !outcome.created,
          data: {
            reportId: report.reportId,
            status: report.status,
            reason: report.reason,
            settlementStatus: outcome.settlementStatus,
            createdAt: new Date(report.createdAt || Date.now()).toISOString(),
          },
        },
        { status: outcome.created ? 201 : 200 },
      );
    } catch (error) {
      const status =
        error && typeof error === "object" && Number((error as { status?: number }).status) === 404
          ? 404
          : 500;
      if (status === 404) logger.warn("[NpcConversationReport][POST] owner session not found");
      else logger.error("[NpcConversationReport][POST] failed:", error);
      return NextResponse.json(
        {
          ok: false,
          error: status === 404 ? "npc_conversation_session_not_found" : "npc_report_failed",
          errorCode: status === 404 ? "NPC_CONVERSATION_SESSION_NOT_FOUND" : "NPC_REPORT_FAILED",
        },
        { status },
      );
    }
  },
  undefined,
  "game/npc/report:create",
  { bodyParser: "json" },
);
