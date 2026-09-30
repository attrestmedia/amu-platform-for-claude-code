import { NextResponse } from "next/server";
import { logger } from "utils/log";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { getNpcUsageModel } from "models/game";
import type { IUpdateUserData } from "types/user";

/**
 * @docHint
 * @purpose API 라우트(admin / user-stats) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain payment
 * @scope admin-api
 */

async function getUserStatsHandler(data: { userId?: string }, userData: IUpdateUserData) {
  // 관리자 권한 확인
  if (userData.roles && !userData.roles.includes("administrator")) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { userId } = data;
  if (!userId) {
    return NextResponse.json({ error: "사용자 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const NpcUsageModel = await getNpcUsageModel();

    // 사용자의 NPC 사용량 통계
    const npcStats = await NpcUsageModel.find({ userId });
    const totalInteractions = npcStats.reduce((sum, record) => sum + record.interactionCount, 0);
    const uniqueNpcs = npcStats.length;

    // 많이 사용한 NPC TOP 5
    const topNpcs = await NpcUsageModel.find({ userId }).sort({ interactionCount: -1 }).limit(5);

    return {
      userId,
      totalInteractions,
      uniqueNpcs,
      topNpcs,
      userRole: getUserRole(userData),
    };
  } catch (error) {
    logger.error("사용자 통계 조회 오류:", error);
    return NextResponse.json({ error: "통계 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export const POST = withAuth(getUserStatsHandler, undefined, "admin/user-stats", { requireAdmin: true });
