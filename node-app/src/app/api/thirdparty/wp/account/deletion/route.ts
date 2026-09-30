import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import { requestAccountDeletion } from "libs/server-utils/auth/accountLifecycleService";
import {
  ACCOUNT_DELETION_INGRESS_HOLD_ERROR,
  ACCOUNT_DELETION_INGRESS_HOLD_MESSAGE,
  isIntegratedAccountDeletionIngress,
} from "libs/server-utils/auth/accountDeletionState";

export const runtime = "nodejs";

function errorCodeForBridgeError(error: string) {
  return (
    {
      wp_bridge_not_configured: "WP_BRIDGE_NOT_CONFIGURED",
      site_required: "SIGNATURE_REQUIRED",
      signature_required: "SIGNATURE_REQUIRED",
      site_not_allowed: "SITE_NOT_ALLOWED",
      invalid_timestamp: "TIMESTAMP_EXPIRED",
      timestamp_expired: "TIMESTAMP_EXPIRED",
      body_hash_invalid: "BODY_HASH_INVALID",
      signature_invalid: "SIGNATURE_INVALID",
    } as Record<string, string>
  )[error] || "SIGNATURE_INVALID";
}

function errorResponse(
  status: number,
  errorCode: string,
  requestId: string | null = null,
  retryable = false,
  retryAfter = false,
) {
  return NextResponse.json(
    {
      ok: false,
      errorCode,
      ...(errorCode === ACCOUNT_DELETION_INGRESS_HOLD_ERROR ? { error: ACCOUNT_DELETION_INGRESS_HOLD_MESSAGE } : {}),
      requestId,
      retryable,
    },
    { status, headers: retryAfter ? { "Cache-Control": "no-store", "Retry-After": "60" } : undefined },
  );
}

function normalizeUserId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value.trim())) return value.trim();
  return null;
}

function normalizeLegacyRequestId(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9][0-9]{0,63}$/.test(value.trim())) return value.trim();
  return null;
}

export async function POST(request: NextRequest) {
  if (!isIntegratedAccountDeletionIngress()) {
    return errorResponse(503, ACCOUNT_DELETION_INGRESS_HOLD_ERROR, null, true, true);
  }
  const bodyText = await request.text();
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) {
    const errorCode = errorCodeForBridgeError(verified.error);
    return errorResponse(verified.status, errorCode, null, errorCode === "WP_BRIDGE_NOT_CONFIGURED");
  }

  let body: Record<string, unknown>;
  try {
    const decoded: unknown = JSON.parse(bodyText || "");
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("malformed_json");
    body = decoded as Record<string, unknown>;
  } catch {
    return errorResponse(400, "MALFORMED_JSON");
  }

  const uid = normalizeUserId(body.user_id);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  const legacyRequestId = normalizeLegacyRequestId(body.legacy_request_id);
  if (
    !uid ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(idempotencyKey) ||
    legacyRequestId === null
  ) {
    return errorResponse(400, "INVALID_INPUT");
  }

  try {
    const result = await requestAccountDeletion({
      uid,
      email,
      source: "magazine",
      idempotencyKey,
      legacyRequestId,
    });
    if (!result.ok) {
      return errorResponse(
        result.status,
        result.errorCode,
        "requestId" in result ? result.requestId || null : null,
        result.retryable,
      );
    }
    return NextResponse.json({ ...result, ok: true, retryable: false }, { status: result.status });
  } catch {
    return errorResponse(500, "INTERNAL_ERROR", null, true);
  }
}
