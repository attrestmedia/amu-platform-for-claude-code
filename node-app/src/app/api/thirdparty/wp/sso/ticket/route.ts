import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import {
  assertSsoAccountActive,
  issueSsoTicket,
  ssoOrigin,
  SsoTicketError,
} from "libs/server-utils/auth/ssoTicketService";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose HMAC 검증된 Magazine 회원에게 app 대상 SSO 티켓 발급
 * @process 본문 서명 검증 → site·회원·returnTo 검증 → Redis 티켓 발급
 * @domain auth
 * @scope thirdparty-api
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  if (verified.site !== ssoOrigin("magazine").hostname.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "site_target_mismatch" }, { status: 403 });
  }
  try {
    const body = JSON.parse(bodyText || "{}") as {
      user_id?: unknown;
      email?: unknown;
      display_name?: unknown;
      returnTo?: unknown;
    };
    const identity = await assertSsoAccountActive({
      uid: String(body.user_id || ""),
      email: String(body.email || ""),
      name: String(body.display_name || ""),
    });
    const result = await issueSsoTicket({
      identity,
      source: "magazine",
      target: "app",
      returnTo: body.returnTo,
    });
    const consumeUrl = new URL("/api/auth/sso/consume", ssoOrigin("app"));
    consumeUrl.searchParams.set("ticket", result.ticket);
    consumeUrl.searchParams.set("returnTo", result.returnTo);
    return NextResponse.json(
      { ok: true, ticket: result.ticket, expiresIn: result.expiresIn, consumeUrl: consumeUrl.toString() },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const known = error instanceof SsoTicketError ? error : null;
    logger.warn("[sso] magazine ticket issue rejected", { site: verified.site, code: known?.code || "failed" });
    return NextResponse.json(
      { ok: false, error: known?.status === 400 ? "invalid_request" : "sso_ticket_unavailable" },
      { status: known?.status || 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
