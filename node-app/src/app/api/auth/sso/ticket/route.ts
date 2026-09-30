import { NextRequest, NextResponse } from "next/server";
import { logger } from "utils/log";
import { resolveSsoRequestIdentity } from "libs/server-utils/auth/ssoRequestIdentity";
import { issueSsoTicket, ssoOrigin, SsoTicketError } from "libs/server-utils/auth/ssoTicketService";

/**
 * @docHint
 * @purpose 앱 세션으로 Magazine 대상 1회용 SSO 티켓 발급
 * @process 인증 식별자 확인 → 활성 계정 확인 → returnTo 검증 → Redis 티켓 발급
 * @domain auth
 * @scope api
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { returnTo?: unknown };
    const identity = await resolveSsoRequestIdentity(request);
    const result = await issueSsoTicket({
      identity,
      source: "app",
      target: "magazine",
      returnTo: body.returnTo,
    });
    const consumeUrl = new URL("/wp-json/amu/v1/sso/consume", ssoOrigin("magazine"));
    consumeUrl.searchParams.set("ticket", result.ticket);
    consumeUrl.searchParams.set("returnTo", result.returnTo);
    return NextResponse.json(
      { ok: true, ticket: result.ticket, expiresIn: result.expiresIn, consumeUrl: consumeUrl.toString() },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const known = error instanceof SsoTicketError ? error : null;
    logger.warn("[sso] app ticket issue rejected", { code: known?.code || "ticket_issue_failed" });
    return NextResponse.json(
      { ok: false, error: known?.status === 400 ? "invalid_request" : "sso_ticket_unavailable" },
      { status: known?.status || 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
