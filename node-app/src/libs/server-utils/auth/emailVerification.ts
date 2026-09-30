import "server-only";
import crypto from "crypto";
import mongoose from "mongoose";
import { EMAIL_VERIFICATION_REQUIRED, NEXTAUTH_SECRET, NEXTAUTH_URL, MONGODB_USERS_URL } from "consts/env/server";
import type { EmailVerificationMethod } from "consts/auth";
import type { EnqueueMailInput } from "libs/server-utils/mail/queueTypes";
import { renderMailTemplate } from "libs/server-utils/mail/templates";
import { enqueueMail } from "libs/server-utils/mail/mailQueue";
import type { IUserIndexDocument } from "models/user";
import { UserIndexSchema } from "models/user";
import { dbConnect } from "libs/database/mongoose";
import { saveWordPressEmailVerification } from "./wordpressAccountService";

/** 인증 링크 만료: 24시간. */
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface EmailVerificationTokenPayload {
  userId: string;
  email: string;
  exp: number; // epoch ms
}

export function isEmailVerificationRequired() {
  return EMAIL_VERIFICATION_REQUIRED;
}

function sign(body: string) {
  return crypto.createHmac("sha256", NEXTAUTH_SECRET).update(body).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** userId(email 주소)에 묶인 서명 토큰. 평문은 저장하지 않고 만료 시각을 payload에 넣는다. */
export function issueEmailVerificationToken(input: { userId: number; email: string; now?: Date }): string {
  const now = input.now ?? new Date();
  const payload: EmailVerificationTokenPayload = {
    userId: String(input.userId),
    email: input.email.trim().toLowerCase(),
    exp: now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyEmailVerificationToken(
  token: string,
  now = new Date(),
): { ok: true; payload: EmailVerificationTokenPayload } | { ok: false; error: "invalid" | "expired" } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "invalid" };
  const [body, signature] = parts;
  if (!safeEqual(signature, sign(body))) return { ok: false, error: "invalid" };

  let payload: EmailVerificationTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as EmailVerificationTokenPayload;
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (
    !payload ||
    typeof payload.userId !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, error: "invalid" };
  }
  if (payload.exp < now.getTime()) return { ok: false, error: "expired" };
  return { ok: true, payload };
}

export function emailVerificationUrl(token: string) {
  return `${NEXTAUTH_URL.replace(/\/$/, "")}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

function verificationMessageId(kind: string, userId: number, eventAt: Date) {
  const digest = crypto.createHash("sha256").update(`${kind}:${userId}:${eventAt.toISOString()}`).digest("hex");
  return `email-verification-${kind}:${digest}`;
}

/** auth.email_verification 템플릿을 렌더한 EnqueueMailInput. */
export function buildEmailVerificationMail(input: {
  userId: number;
  recipientEmail: string;
  actionUrl: string;
  locale: "ko" | "en";
  issuedAt: Date;
}): EnqueueMailInput {
  const rendered = renderMailTemplate({
    key: "auth.email_verification",
    locale: input.locale,
    data: {
      actionUrl: input.actionUrl,
      expiresInMinutes: Math.floor(EMAIL_VERIFICATION_TOKEN_TTL_MS / 60_000),
    },
  });
  return {
    messageId: verificationMessageId("verify", input.userId, input.issuedAt),
    category: "transactional",
    templateKey: "auth.email_verification",
    locale: input.locale,
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}

/** WP user meta에 인증 상태를 기록하고 users_index projection을 갱신한다. */
export async function recordEmailVerified(input: {
  userId: number;
  email: string;
  method: EmailVerificationMethod;
  verifiedAt: Date;
}) {
  const emailLower = input.email.trim().toLowerCase();
  await saveWordPressEmailVerification(input.userId, {
    email: emailLower,
    method: input.method,
    verifiedAt: input.verifiedAt,
  });

  const conn = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
  await UserIndexModel.updateOne(
    { uid: String(input.userId) },
    {
      $set: {
        emailVerification: {
          verifiedEmailLower: emailLower,
          verifiedAt: input.verifiedAt,
          method: input.method,
        },
      },
    },
  );
}

/** 인증 메일을 발송한다. 억제 목록 판정은 worker가 수행하므로(로그인 잠금 없음) enqueue 성공 여부만 반환한다. */
export async function sendEmailVerificationMail(input: {
  userId: number;
  recipientEmail: string;
  locale: "ko" | "en";
  issuedAt: Date;
}): Promise<{ sent: boolean }> {
  const token = issueEmailVerificationToken({
    userId: input.userId,
    email: input.recipientEmail,
    now: input.issuedAt,
  });
  const mail = buildEmailVerificationMail({
    userId: input.userId,
    recipientEmail: input.recipientEmail,
    actionUrl: emailVerificationUrl(token),
    locale: input.locale,
    issuedAt: input.issuedAt,
  });
  await enqueueMail(mail);
  return { sent: true };
}
