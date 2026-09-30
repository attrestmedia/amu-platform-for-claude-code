import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkRateLimit } from "libs/server-utils/auth/authUtils";
import { sendEmailVerificationMail } from "libs/server-utils/auth/emailVerification";
import { findWordPressUserByEmail } from "libs/server-utils/auth/wordpressAccountService";
import { logger } from "utils/log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = String(body?.email || "").trim().toLowerCase();

  // 계정 존재 비노출: 이메일 형식이 아니어도 동일한 성공 응답을 반환한다.
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const emailKey = crypto.createHash("sha256").update(email).digest("hex").slice(0, 24);
  const rateLimit = await checkRateLimit(`resend-verification:${emailKey}`, "auth/resend-verification", {
    uid: `resend-verification:${emailKey}`,
    userEmail: email,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", errorCode: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))) } },
    );
  }

  const wpUser = await findWordPressUserByEmail(email);
  if (!wpUser) {
    // 미등록 주소에도 동일 응답 — enumeration 방지.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    await sendEmailVerificationMail({
      userId: wpUser.id,
      recipientEmail: email,
      locale: "ko",
      issuedAt: new Date(),
    });
  } catch (error) {
    logger.error("[auth/resend-verification] send failed", { errorCode: (error as { errorCode?: string }).errorCode });
    return NextResponse.json(
      { ok: false, error: "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.", errorCode: "VERIFICATION_SEND_FAILED" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
