import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "libs/server-utils/auth/authUtils";
import { CREDENTIALS_KMS_KEY } from "consts/env/server";
import { getMailRecipientHash } from "libs/server-utils/mail/emailHash";
import {
  isNewsletterSubscriptionEnabled,
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
  if (!isNewsletterSubscriptionEnabled()) {
    return NextResponse.json(
      { ok: false, errorCode: "NEWSLETTER_NOT_ACTIVE", retryable: true },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }

  const ip = clientIp(request);
  const rateLimit = await checkRateLimit(
    `newsletter:${getMailRecipientHash(ip || "unknown", CREDENTIALS_KMS_KEY)}`,
    "newsletter:subscribe",
    {} as Parameters<typeof checkRateLimit>[2],
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, errorCode: "RATE_LIMITED", retryable: true },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }

  let body: { email?: unknown; consent?: unknown; consentVersion?: unknown; source?: unknown; source_location?: unknown; post_slug?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, errorCode: "MALFORMED_JSON" }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ ok: false, errorCode: "NEWSLETTER_CONSENT_REQUIRED" }, { status: 400 });
  }

  try {
    const result = await requestNewsletterSubscription({
      email: String(body.email || ""),
      consentVersion: String(body.consentVersion || ""),
      source: body.source === "platform" ? "platform" : "magazine",
      method: "checkbox",
      ip,
      sourceLocation: String(body.source_location || "") || "newsletter_page",
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
