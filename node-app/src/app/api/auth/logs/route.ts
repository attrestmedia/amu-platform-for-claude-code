import { NextRequest, NextResponse } from "next/server";
import * as cookie from "cookie";
import { getUserLogs } from "models/auth";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(auth / logs) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain auth
 * @scope admin-api
 */

export async function GET(req: NextRequest) {
  try {
    // 인증 확인
    const cookies = req.headers.get("cookie") || "";
    const parsedCookies = cookie.parse(cookies);
    const authToken = parsedCookies.authToken;

    if (!authToken) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    // 쿼리 파라미터
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "사용자 ID가 필요합니다" }, { status: 400 });
    }

    // 추가 옵션
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const skip = (page - 1) * limit;

    // 날짜 범위
    const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate") as string) : undefined;

    const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate") as string) : undefined;

    // 로그 조회
    const logs = await getUserLogs(uid, {
      limit,
      skip,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total: logs.length,
      },
    });
  } catch (error) {
    logger.error("로그인 로그 조회 오류:", error);
    return NextResponse.json({ error: "로그인 로그 조회 중 오류가 발생했습니다" }, { status: 500 });
  }
}
