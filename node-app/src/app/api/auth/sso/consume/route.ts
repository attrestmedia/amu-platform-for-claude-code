import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { NEXTAUTH_SECRET } from "consts/env/server";
import { isProduct } from "utils/common";
import { logger } from "utils/log";
import {
  assertSsoAccountActive,
  consumeSsoTicket,
  ssoOrigin,
  SsoTicketError,
} from "libs/server-utils/auth/ssoTicketService";
import { setSessionHintCookie } from "libs/server-utils/auth/authCookie";

/**
 * @docHint
 * @purpose Magazine 발급 티켓을 소비해 기존 등급의 NextAuth 앱 세션 수립
 * @process 티켓 원자 소비 → 계정 활성 재검증 → NextAuth JWT 쿠키 설정 → allowlist 경로 이동
 * @domain auth
 * @scope api
 */

export const runtime = "nodejs";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const consumed = await consumeSsoTicket({
      ticket: url.searchParams.get("ticket"),
      target: "app",
      returnTo: url.searchParams.get("returnTo"),
    });
    const identity = await assertSsoAccountActive(consumed.identity);
    const token = await encode({
      secret: NEXTAUTH_SECRET,
      maxAge: SESSION_MAX_AGE,
      token: {
        sub: identity.uid,
        uid: identity.uid,
        email: identity.email,
        name: identity.name || "",
        signupCompleted: true,
        registrationSource: "magazine_sso",
      },
    });
    const response = NextResponse.redirect(consumed.returnTo, { status: 303 });
    response.cookies.set(isProduct ? "__Host-na.session" : "na.session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduct,
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    setSessionHintCookie(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const known = error instanceof SsoTicketError ? error : null;
    logger.warn("[sso] app ticket consume rejected", { code: known?.code || "ticket_consume_failed" });
    const fallback = new URL("/login", ssoOrigin("app"));
    return NextResponse.redirect(fallback, { status: 303, headers: { "Cache-Control": "no-store" } });
  }
}
