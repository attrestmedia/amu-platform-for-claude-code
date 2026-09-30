import { NextRequest } from "next/server";
import {
  confirmNewsletterSubscription,
  NewsletterSubscriptionError,
} from "libs/server-utils/mail/newsletterSubscriberService";
import { NEXTAUTH_URL } from "consts/env/server";

export const runtime = "nodejs";

function resultPage(title: string, message: string, status: number) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main style="max-width:600px;margin:64px auto;padding:24px;font-family:Arial,sans-serif;line-height:1.6"><h1>${title}</h1><p>${message}</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") || "";
  try {
    const result = await confirmNewsletterSubscription(token, {
      ip: (request.headers.get("x-forwarded-for") || "").split(",")[0].trim(),
    });
    const redirectUrl = new URL("/newsletter/confirmed", NEXTAUTH_URL);
    if (result.sourceLocation) redirectUrl.searchParams.set("source_location", result.sourceLocation);
    if (result.postSlug) redirectUrl.searchParams.set("post_slug", result.postSlug);
    return Response.redirect(redirectUrl, 303);
  } catch (error) {
    if (error instanceof NewsletterSubscriptionError) {
      const message =
        error.code === "NEWSLETTER_CONFIRMATION_EXPIRED"
          ? "확인 링크가 만료되었습니다. 뉴스레터 수신을 다시 신청해 주세요."
          : "확인 링크가 유효하지 않거나 이미 처리되었습니다.";
      return resultPage("뉴스레터 수신을 확인할 수 없습니다", message, error.status);
    }
    return resultPage("뉴스레터 수신을 확인할 수 없습니다", "잠시 후 다시 시도해 주세요.", 503);
  }
}
