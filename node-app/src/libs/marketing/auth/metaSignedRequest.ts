import "server-only";

import crypto from "crypto";
import { pickString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Meta lifecycle callback의 signed_request를 App Secret으로 검증
 * @process base64url decode → HMAC-SHA256 상수시간 비교 → algorithm/user_id/issued_at 검증
 * @domain marketing-auth
 * @scope server
 */

const META_SIGNED_REQUEST_MAX_AGE_SECONDS = 24 * 60 * 60;
const META_SIGNED_REQUEST_FUTURE_SKEW_SECONDS = 5 * 60;

export type MetaSignedRequestPayload = UnknownRecord & {
  algorithm: string;
  userId: string;
  issuedAt: number | null;
};

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export function verifyMetaSignedRequest(args: {
  signedRequest: string;
  appSecret: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
}): MetaSignedRequestPayload | null {
  const signedRequest = pickString(args.signedRequest);
  const appSecret = pickString(args.appSecret);
  if (!signedRequest || !appSecret) return null;

  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encodedSignature, encodedPayload] = parts;

  try {
    const signature = decodeBase64Url(encodedSignature);
    const expected = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();
    if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return null;

    const payload = toUnknownRecord(JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")));
    const algorithm = pickString(payload.algorithm).toUpperCase();
    const userId = pickString(payload.user_id);
    if (algorithm !== "HMAC-SHA256" || !userId) return null;

    const issuedAtRaw = Number(payload.issued_at);
    const issuedAt = Number.isFinite(issuedAtRaw) && issuedAtRaw > 0 ? Math.floor(issuedAtRaw) : null;
    if (issuedAt !== null) {
      const nowSeconds = Math.floor(args.nowSeconds ?? Date.now() / 1000);
      const maxAgeSeconds = Math.max(60, args.maxAgeSeconds ?? META_SIGNED_REQUEST_MAX_AGE_SECONDS);
      if (issuedAt < nowSeconds - maxAgeSeconds || issuedAt > nowSeconds + META_SIGNED_REQUEST_FUTURE_SKEW_SECONDS) {
        return null;
      }
    }

    return { ...payload, algorithm, userId, issuedAt };
  } catch {
    return null;
  }
}

export async function readMetaSignedRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) return "";
  const formData = await request.formData().catch(() => null);
  return formData ? pickString(formData.get("signed_request")) : "";
}
