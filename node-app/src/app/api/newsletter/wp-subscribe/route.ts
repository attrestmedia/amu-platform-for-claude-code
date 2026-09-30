import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import { checkRateLimit } from "libs/server-utils/auth/authUtils";
import { ssoOrigin } from "libs/server-utils/auth/ssoTicketService";
import { CREDENTIALS_KMS_KEY } from "consts/env/server";
import { getMailRecipientHash } from "libs/server-utils/mail/emailHash";
import {
  getNewsletterConsentVersion,
  isNewsletterSubscriptionEnabled,
  normalizeNewsletterEmail,
  requestNewsletterSubscription,
  NewsletterSubscriptionError,
} from "libs/server-utils/mail/newsletterSubscriberService";

export const runtime = "nodejs";

function clientIp(request: NextRequest) {
  return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
}

function errorResponse(error: unknown) {
  if (error instanceof NewsletterSubscriptionError) {
    return NextResponse.json(
      { ok: false, errorCode: error.code, retryable: error.retryable },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, errorCode: "NEWSLETTER_SUBSCRIPTION_UNAVAILABLE", retryable: true },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
  );
}

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  if (verified.site !== ssoOrigin("magazine").hostname.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "site_target_mismatch" }, { status: 403 });
  }
  if (!isNewsletterSubscriptionEnabled()) {
    return NextResponse.json(
      { ok: false, errorCode: "NEWSLETTER_NOT_ACTIVE", retryable: true },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }

  let body: { email?: unknown; consent?: unknown; consent_version?: unknown; placement?: unknown; post_slug?: unknown };
  try {
    body = JSON.parse(bodyText || "{}") as typeof body;
  } catch {
    return NextResponse.json({ ok: false, errorCode: "MALFORMED_JSON" }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ ok: false, errorCode: "NEWSLETTER_CONSENT_REQUIRED" }, { status: 400 });
  }

  try {
    const email = normalizeNewsletterEmail(String(body.email || ""));
    const rateLimit = await checkRateLimit(
      `newsletter:wp:${getMailRecipientHash(email, CREDENTIALS_KMS_KEY)}`,
      "newsletter:subscribe",
      {} as Parameters<typeof checkRateLimit>[2],
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, errorCode: "RATE_LIMITED", retryable: true },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
      );
    }

    const result = await requestNewsletterSubscription({
      email,
      consentVersion: String(body.consent_version || getNewsletterConsentVersion()),
      source: "magazine",
      method: "checkbox",
      ip: clientIp(request),
      sourceLocation: String(body.placement || "") || "newsletter_page",
      postSlug: String(body.post_slug || ""),
    });
    return NextResponse.json(
      { ok: true, ...result, message: "확인 메일의 링크를 눌러야 뉴스레터 수신이 시작됩니다." },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
