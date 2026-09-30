import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "libs/database/mongoose";
import { MONGODB_USERS_URL } from "consts/env/server";
import { currentPolicyConsents, CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";
import { UserIndexSchema, type IUserIndexDocument } from "models/user";
import { accountIdentityHash } from "libs/server-utils/auth/accountIdentity";
import {
  createWordPressAccount,
  deleteWordPressAccount,
  findWordPressUserByEmail,
  saveWordPressPolicyConsents,
} from "libs/server-utils/auth/wordpressAccountService";
import { logger } from "utils/log";
import { checkRateLimit } from "libs/server-utils/auth/authUtils";
import { isEmailVerificationRequired, sendEmailVerificationMail } from "libs/server-utils/auth/emailVerification";
import crypto from "crypto";

export const runtime = "nodejs";

function isStrongEnough(password: string) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; name?: unknown; terms?: unknown; privacy?: unknown }
    | null;
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const name = String(body?.name || "").trim();

  if (
    email.length > 254 ||
    name.length > 100 ||
    password.length > 128 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    !isStrongEnough(password)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "올바른 이메일과 영문·숫자를 포함한 10자 이상의 비밀번호를 입력해 주세요.",
        errorCode: "INVALID_SIGNUP_INPUT",
      },
      { status: 400 },
    );
  }

  const sourceIp = String(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown")
    .split(",")[0]
    .trim();
  const rateKey = crypto.createHash("sha256").update(sourceIp).digest("hex").slice(0, 24);
  const rateLimit = await checkRateLimit(`signup:${rateKey}`, "auth/register", {
    uid: `signup:${rateKey}`,
    userEmail: "signup@local.invalid",
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", errorCode: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))) } },
    );
  }
  if (body?.terms !== true || body?.privacy !== true) {
    return NextResponse.json(
      { ok: false, error: "이용약관과 개인정보처리방침 동의가 필요합니다.", errorCode: "POLICY_CONSENT_REQUIRED" },
      { status: 400 },
    );
  }

  let createdWpUserId = 0;
  try {
    if (await findWordPressUserByEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "이미 가입된 이메일입니다. 로그인 또는 비밀번호 찾기를 이용해 주세요.", errorCode: "EMAIL_EXISTS" },
        { status: 409 },
      );
    }
    const wpUser = await createWordPressAccount({ email, password, name });
    createdWpUserId = wpUser.id;
    const consents = currentPolicyConsents("platform_email_signup");
    await saveWordPressPolicyConsents(wpUser.id, consents);

    const conn = await dbConnect(MONGODB_USERS_URL);
    const UserIndexModel: mongoose.Model<IUserIndexDocument> =
      (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
      conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
    await UserIndexModel.updateOne(
      { userEmailLower: email },
      {
        $set: {
          uid: String(wpUser.id),
          userEmail: email,
          userEmailLower: email,
          identityHash: accountIdentityHash(email),
          accountStatus: "active",
          policyConsents: consents,
          ...(name ? { "userInfo.name": name } : {}),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    const emailVerificationRequired = isEmailVerificationRequired();
    if (emailVerificationRequired) {
      // 비차단 경계: 인증 메일 적재 실패가 가입 자체를 되돌리지 않는다. 재발송 경로를 남긴다.
      await sendEmailVerificationMail({
        userId: wpUser.id,
        recipientEmail: email,
        locale: "ko",
        issuedAt: new Date(),
      }).catch((error) => {
        logger.error("[auth/register] verification mail enqueue failed", {
          errorCode: (error as { errorCode?: string }).errorCode,
        });
      });
    }

    return NextResponse.json(
      { ok: true, uid: String(wpUser.id), policy: CURRENT_ACCOUNT_POLICY, emailVerificationRequired },
      { status: 201 },
    );
  } catch (error) {
    const coded = error as { message?: string; errorCode?: string; status?: number };
    logger.error("[auth/register] integrated signup failed", {
      errorCode: coded.errorCode || "INTEGRATED_SIGNUP_FAILED",
      status: coded.status || 500,
    });
    if (createdWpUserId > 0) await deleteWordPressAccount(createdWpUserId).catch(() => undefined);
    return NextResponse.json(
      {
        ok: false,
        error: coded.message || "통합회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        errorCode: coded.errorCode || "INTEGRATED_SIGNUP_FAILED",
      },
      { status: coded.status && coded.status >= 400 ? coded.status : 500 },
    );
  }
}
