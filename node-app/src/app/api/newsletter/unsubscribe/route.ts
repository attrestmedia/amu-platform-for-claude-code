import { NextRequest, NextResponse } from "next/server";
import {
  NewsletterSubscriptionError,
  unsubscribeNewsletterByToken,
} from "libs/server-utils/mail/newsletterSubscriberService";

export const runtime = "nodejs";

function clientIp(request: NextRequest) {
  return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0].trim();
}

export async function POST(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") || "";
  try {
    await unsubscribeNewsletterByToken(token, { ip: clientIp(request) });
    return NextResponse.json(
      { ok: true, status: "unsubscribed", message: "뉴스레터 수신거부가 즉시 반영되었습니다." },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof NewsletterSubscriptionError) {
      return NextResponse.json({ ok: false, errorCode: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, errorCode: "NEWSLETTER_UNSUBSCRIBE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") || "";
  try {
    await unsubscribeNewsletterByToken(token, { ip: clientIp(request) });
    return new Response(
      "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>수신거부 완료</title></head><body><main style=\"max-width:600px;margin:64px auto;padding:24px;font-family:Arial,sans-serif;line-height:1.6\"><h1>뉴스레터 수신거부가 완료되었습니다</h1><p>뉴스레터 수신거부가 즉시 반영되었습니다. 서비스 이용에 필요한 트랜잭션 메일은 계속 발송될 수 있습니다.</p></main></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof NewsletterSubscriptionError ? error.status : 503;
    return new Response(
      "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>수신거부 처리 실패</title></head><body><main style=\"max-width:600px;margin:64px auto;padding:24px;font-family:Arial,sans-serif;line-height:1.6\"><h1>수신거부를 처리할 수 없습니다</h1><p>잠시 후 다시 시도해 주세요.</p></main></body></html>",
      { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
}
