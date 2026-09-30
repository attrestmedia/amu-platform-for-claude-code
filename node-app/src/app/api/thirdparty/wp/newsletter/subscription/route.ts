import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import { ssoOrigin } from "libs/server-utils/auth/ssoTicketService";
import {
  getNewsletterConsentVersion,
  getNewsletterSubscription,
  isNewsletterSubscriptionEnabled,
  requestNewsletterSubscription,
  unsubscribeNewsletterByIdentity,
  NewsletterSubscriptionError,
} from "libs/server-utils/mail/newsletterSubscriberService";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof NewsletterSubscriptionError) {
    return NextResponse.json({ ok: false, errorCode: error.code, retryable: error.retryable }, { status: error.status });
  }
  return NextResponse.json({ ok: false, errorCode: "NEWSLETTER_SUBSCRIPTION_UNAVAILABLE", retryable: true }, { status: 503 });
}

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  if (verified.site !== ssoOrigin("magazine").hostname.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "site_target_mismatch" }, { status: 403 });
  }

  let body: { action?: unknown; user_id?: unknown; email?: unknown; consent_version?: unknown };
  try {
    body = JSON.parse(bodyText || "{}") as typeof body;
  } catch {
    return NextResponse.json({ ok: false, errorCode: "MALFORMED_JSON" }, { status: 400 });
  }
  const uid = String(body.user_id || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^\d+$/.test(uid) || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ ok: false, errorCode: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    if (body.action === "get") {
      const subscription = isNewsletterSubscriptionEnabled()
        ? await getNewsletterSubscription({ uid, email })
        : { status: "disabled" as const, subscribed: false, pending: false };
      return NextResponse.json({ ok: true, enabled: isNewsletterSubscriptionEnabled(), consentVersion: getNewsletterConsentVersion(), subscription }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!isNewsletterSubscriptionEnabled()) {
      return NextResponse.json({ ok: false, errorCode: "NEWSLETTER_NOT_ACTIVE", retryable: true }, { status: 503 });
    }
    if (body.action === "unsubscribe") {
      const result = await unsubscribeNewsletterByIdentity({ uid, email, source: "magazine", method: "profile_toggle" });
      return NextResponse.json({ ok: true, ...result, message: "뉴스레터 수신거부가 즉시 반영되었습니다." }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "subscribe") return NextResponse.json({ ok: false, errorCode: "INVALID_NEWSLETTER_ACTION" }, { status: 400 });
    const result = await requestNewsletterSubscription({
      uid,
      email,
      consentVersion: String(body.consent_version || ""),
      source: "magazine",
      method: "profile_toggle",
      sourceLocation: "wordpress_account",
      postSlug: "",
    });
    return NextResponse.json({ ok: true, ...result, message: "확인 메일의 링크를 눌러야 뉴스레터 수신이 시작됩니다." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
