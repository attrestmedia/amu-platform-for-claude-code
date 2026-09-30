import { NextRequest, NextResponse } from "next/server";
import { COOKIE_CONFIG } from "consts/token";
import { getJwtExpServer } from "libs/server-utils/auth/loginUtils";
import * as cookie from "cookie";
import { getServerSession } from "next-auth";
import { authOptions } from "src/auth";
import fetchClient from "libs/api/fetchClient";
import { setAuthTokenCookie, setSessionHintCookie } from "libs/server-utils/auth/authCookie";
import { extractWpJwtToken, getWpJwtEndpointWithToken } from "libs/server-utils/auth/wpJwt";

import { toErrorMessage } from "utils/common";
/**
 * @docHint
 * @purpose API 라우트(auth / refresh) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain auth
 * @scope api
 */

export async function GET(req: NextRequest) {
  try {
    // **NextAuth 세션 우선 (소셜 로그인)**
    const session = (await getServerSession(authOptions)) as
      | (Awaited<ReturnType<typeof getServerSession>> & {
          user?: { id?: string; email?: string | null; name?: string | null };
          expires?: string;
        })
      | null;
    if (session?.user?.id) {
      const expSec = session?.expires ? Math.floor(new Date(session.expires).getTime() / 1000) : null;
      // 소셜 세션은 쿠키를 재발급할 필요 없음(NextAuth가 관리)
      const res = NextResponse.json({
        authenticated: true,
        user: {
          data: {
            user: session.user,
            roles: [], // 클라이언트에선 필요시 /api/auth/me로 상세 조회
          },
        },
        data: { tokenExp: expSec },
      });
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.headers.set("Pragma", "no-cache");
      return res;
    }

    // **(폴백) WP 토큰 검증**
    // 쿠키에서 authToken 추출
    const rawCookie = req.headers.get("cookie") || "";
    const parsed = cookie.parse(rawCookie);
    const authToken = parsed[COOKIE_CONFIG.AUTH_TOKEN.name];

    if (!authToken) {
      return NextResponse.json({ authenticated: false, message: "토큰 없음" }, { status: 401 });
    }

    let refreshData: unknown;
    try {
      const refreshUrl = getWpJwtEndpointWithToken("refresh", authToken);
      const r = await fetchClient.post<unknown>(refreshUrl, undefined, {
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        timeout: 15_000,
        cache: "no-store",
      });
      refreshData = r.data;
    } catch {
      return NextResponse.json(
        { authenticated: false, message: "토큰이 만료되었거나 올바르지 않습니다.", status: 401 },
        { status: 401 },
      );
    }

    const nextToken = extractWpJwtToken(refreshData);
    if (!nextToken) {
      return NextResponse.json(
        { authenticated: false, message: "갱신된 토큰을 찾지 못했습니다.", status: 502 },
        { status: 502 },
      );
    }

    const tokenExp = getJwtExpServer(nextToken);

    const res = NextResponse.json({
      authenticated: true,
      data: {
        jwt: [{ token: nextToken }],
        tokenExp,
      },
    });

    setAuthTokenCookie(res, nextToken);
    setSessionHintCookie(res);

    // 캐시 금지 헤더
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");

    return res;
  } catch (e) {
    return NextResponse.json(
      { authenticated: false, message: "refresh failed", error: toErrorMessage(e, "unknown") },
      { status: 500 },
    );
  }
}
