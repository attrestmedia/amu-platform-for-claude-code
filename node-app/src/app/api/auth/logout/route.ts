import { NextRequest, NextResponse } from "next/server";
import fetchClient from "libs/api/fetchClient";
import { wpAuthUri } from "consts/env/runtime";
import { COOKIE_CONFIG } from "consts/token";
import { logger } from "utils/log";
import { serializeClearedAuthTokenCookie, serializeClearedSessionHintCookie } from "libs/server-utils/auth/authCookie";
import { extractApiErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(auth / logout) 기능 요청 처리
 * @process POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain auth
 * @scope api
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // 클라이언트 쿠키에서 JWT 토큰 추출
  const token = req.cookies.get(COOKIE_CONFIG.AUTH_TOKEN.name)?.value;
  const cleared = serializeClearedAuthTokenCookie();
  const clearedHint = serializeClearedSessionHintCookie();

  if (!token) {
    const response = new NextResponse(JSON.stringify({ message: "로그아웃 성공" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    response.headers.append("Set-Cookie", cleared);
    response.headers.append("Set-Cookie", clearedHint);
    return response;
  }

  try {
    // 토큰 폐기를 위한 revoke 엔드포인트 호출
    const revokeEndpoint = `${wpAuthUri()}/revoke`;
    await fetchClient.post(revokeEndpoint, { JWT: token }, { timeout: 10000, credentials: "omit" });
  } catch (error) {
    logger.error("토큰 폐기 오류:", extractApiErrorMessage(error, "unknown_error"));
    // 토큰 폐기 실패 시에도 로그아웃 처리 진행
  }

  // 클라이언트 쿠키에서 authToken 삭제
  const logoutResponse = new NextResponse(JSON.stringify({ message: "로그아웃 성공" }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  logoutResponse.headers.append("Set-Cookie", cleared);
  logoutResponse.headers.append("Set-Cookie", clearedHint);
  return logoutResponse;
}
