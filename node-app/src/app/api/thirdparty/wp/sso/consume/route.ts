import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import {
  assertSsoAccountActive,
  consumeSsoTicket,
  ssoOrigin,
  SsoTicketError,
} from "libs/server-utils/auth/ssoTicketService";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose HMAC 검증된 Magazine 서버가 app 발급 티켓을 1회 소비
 * @process 본문 서명 검증 → 대상·returnTo 비교 후 원자 소비 → 활성 계정 재검증 → 최소 식별자 반환
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
    const body = JSON.parse(bodyText || "{}") as { ticket?: unknown; returnTo?: unknown };
    const consumed = await consumeSsoTicket({
      ticket: body.ticket,
      target: "magazine",
      returnTo: body.returnTo,
    });
    const identity = await assertSsoAccountActive(consumed.identity);
    return NextResponse.json(
      { ok: true, user: { id: identity.uid, email: identity.email }, returnTo: consumed.returnTo },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const known = error instanceof SsoTicketError ? error : null;
    logger.warn("[sso] magazine ticket consume rejected", { site: verified.site, code: known?.code || "failed" });
    return NextResponse.json(
      { ok: false, error: "sso_ticket_unavailable" },
      { status: known?.status || 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
