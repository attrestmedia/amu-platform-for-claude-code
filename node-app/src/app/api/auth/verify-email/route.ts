import { NextRequest, NextResponse } from "next/server";
import { NEXTAUTH_URL } from "consts/env/server";
import { verifyEmailVerificationToken, recordEmailVerified } from "libs/server-utils/auth/emailVerification";
import { findWordPressUserByEmail } from "libs/server-utils/auth/wordpressAccountService";
import { logger } from "utils/log";

export const runtime = "nodejs";

function redirect(status: "ok" | "invalid" | "expired" | "email_changed") {
  const target = new URL("/login", NEXTAUTH_URL);
  if (status === "ok") target.searchParams.set("email_verified", "1");
  else target.searchParams.set("verify_error", status);
  return NextResponse.redirect(target, 302);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!token) return redirect("invalid");

  const result = verifyEmailVerificationToken(token);
  if (!result.ok) {
    logger.warn("[auth/verify-email] token rejected", { error: result.error });
    return redirect(result.error === "expired" ? "expired" : "invalid");
  }

  const { userId, email } = result.payload;
  const wpUser = await findWordPressUserByEmail(email);
  if (!wpUser || String(wpUser.id) !== userId) {
    logger.warn("[auth/verify-email] email no longer matches account", { userId });
    return redirect("email_changed");
  }

  await recordEmailVerified({
    userId: Number(userId),
    email,
    method: "email_link",
    verifiedAt: new Date(),
  });

  return redirect("ok");
}
