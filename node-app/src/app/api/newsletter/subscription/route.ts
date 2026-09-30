import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { toUnknownRecord } from "utils/common";
import {
  getNewsletterConsentVersion,
  getNewsletterSubscription,
  isNewsletterSubscriptionEnabled,
  requestNewsletterSubscription,
  unsubscribeNewsletterByIdentity,
  NewsletterSubscriptionError,
} from "libs/server-utils/mail/newsletterSubscriberService";

export const runtime = "nodejs";

function identity(user: unknown) {
  const record = toUnknownRecord(user);
  return {
    uid: String(record.uid || record.ID || "").trim(),
    email: String(record.userEmail || record.user_email || record.email || "").trim().toLowerCase(),
  };
}

function errorResponse(error: unknown) {
  if (error instanceof NewsletterSubscriptionError) {
    return NextResponse.json({ ok: false, errorCode: error.code, retryable: error.retryable }, { status: error.status });
  }
  return NextResponse.json({ ok: false, errorCode: "NEWSLETTER_SUBSCRIPTION_UNAVAILABLE", retryable: true }, { status: 503 });
}

async function handleGET(_data: unknown, user: unknown) {
  const account = identity(user);
  const subscription = isNewsletterSubscriptionEnabled()
    ? await getNewsletterSubscription(account)
    : { status: "disabled" as const, subscribed: false, pending: false };
  return NextResponse.json(
    { ok: true, enabled: isNewsletterSubscriptionEnabled(), consentVersion: getNewsletterConsentVersion(), subscription },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type SubscriptionBody = { action?: unknown; consentVersion?: unknown };

async function handlePOST(data: SubscriptionBody, user: unknown, request: Request) {
  if (!isNewsletterSubscriptionEnabled()) {
    return NextResponse.json({ ok: false, errorCode: "NEWSLETTER_NOT_ACTIVE", retryable: true }, { status: 503 });
  }
  const account = identity(user);
  if (!account.uid || !account.email) return NextResponse.json({ ok: false, errorCode: "ACCOUNT_IDENTITY_REQUIRED" }, { status: 409 });
  try {
    if (data.action === "unsubscribe") {
      const result = await unsubscribeNewsletterByIdentity({
        ...account,
        source: "platform",
        method: "profile_toggle",
        ip: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
      });
      return NextResponse.json({ ok: true, ...result, message: "뉴스레터 수신거부가 즉시 반영되었습니다." }, { headers: { "Cache-Control": "no-store" } });
    }
    if (data.action !== "subscribe") return NextResponse.json({ ok: false, errorCode: "INVALID_NEWSLETTER_ACTION" }, { status: 400 });
    const result = await requestNewsletterSubscription({
      ...account,
      consentVersion: String(data.consentVersion || ""),
      source: "platform",
      method: "profile_toggle",
      ip: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
      sourceLocation: "profile",
      postSlug: "",
    });
    return NextResponse.json({ ok: true, ...result, message: "확인 메일의 링크를 눌러야 뉴스레터 수신이 시작됩니다." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withAuth(handleGET, undefined, "newsletter:subscription:get", {
  bodyParser: "none",
  allowStalePolicyConsent: true,
});
export const POST = withAuth<SubscriptionBody>(handlePOST, undefined, "newsletter:subscription:post", {
  bodyParser: "json",
  allowStalePolicyConsent: true,
});
