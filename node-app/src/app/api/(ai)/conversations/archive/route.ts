import { NextRequest, NextResponse } from "next/server";
import { getConversationArchiveModel } from "libs/database/conversations";
import { withGuestOrAuth } from "libs/server-utils/api/apiMiddleware";
import { toTimestamp } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

type ArchiveQuery = {
  userId: string;
  personaId: string;
  userPersonaId: string;
  universeId?: string;
};

type DailySummaryItem = {
  date: Date | string | number;
  [key: string]: unknown;
};

/**
 * @docHint
 * @purpose API 라우트((ai) / conversations / archive) 기능 요청 처리
 * @process 요청 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain conversations
 * @scope global
 */

// 대화 아카이브 조회 API
async function handleGet(_data: unknown, user: AuthenticatedUserType, request?: NextRequest) {
  if (!request) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const serverUserId = String(user?.ID || "");
  const isGuest = serverUserId.startsWith("guest:");
  if (!serverUserId || isGuest) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const personaId = searchParams.get("personaId");
  const userPersonaId = searchParams.get("userPersonaId");
  const universeId = (searchParams.get("universeId") || "").trim();
  const limitRaw = parseInt(searchParams.get("limit") || "100", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 100;

  if (!personaId || !userPersonaId) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const ArchiveModel = await getConversationArchiveModel(serverUserId);

  // universeId가 있으면 정확히 매칭, 없으면 가장 최근 문서 1개(호환/안전)
  const query: ArchiveQuery = { userId: serverUserId, personaId, userPersonaId };
  if (universeId) query.universeId = universeId;

  const archive = await ArchiveModel.findOne(query).lean();
  if (!archive) {
    return NextResponse.json({
      dailySummaries: [],
      weeklySummaries: [],
      monthlySummaries: [],
      yearlySummaries: [],
      importantFacts: [],
      totalArchivedMessages: 0,
    });
  }

  // 최근 limit개까지 일별 요약 반환
  const recentDailySummaries = ((archive.dailySummaries || []) as DailySummaryItem[])
    .sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date))
    .slice(0, limit);

  return NextResponse.json({
    dailySummaries: recentDailySummaries,
    weeklySummaries: archive.weeklySummaries,
    monthlySummaries: archive.monthlySummaries,
    yearlySummaries: archive.yearlySummaries,
    importantFacts: archive.importantFacts,
    totalArchivedMessages: archive.totalArchivedMessages,
    lastProcessedDate: archive.lastProcessedDate,
  });
}
export const GET = withGuestOrAuth(handleGet, undefined, "conversations/archive/get");
