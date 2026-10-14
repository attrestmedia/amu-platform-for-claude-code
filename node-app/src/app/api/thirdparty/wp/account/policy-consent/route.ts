import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import { recordAccountPolicyReconsent } from "libs/server-utils/auth/policyConsentService";
import type { AccountPolicyId } from "consts/legal/accountPolicy";
import { PolicyReleaseUnavailableError, getPolicyReleaseRuntime } from "libs/server-utils/legal/policyReleaseRuntime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText || "{}");
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_policy_consent", errorCode: "INVALID_INPUT" },
      { status: 400 },
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json(
      { ok: false, error: "invalid_policy_consent", errorCode: "INVALID_INPUT" },
      { status: 400 },
    );
  }
  const body = parsed as {
    user_id?: unknown;
    email?: unknown;
    termsAgreed?: unknown;
    privacyAgreed?: unknown;
    releaseIds?: unknown;
    manifestRevision?: unknown;
  };
  const uid = String(body.user_id || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^\d+$/.test(uid) || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_policy_consent", errorCode: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const runtime = getPolicyReleaseRuntime();
  if (runtime.mode === "unavailable") {
    return NextResponse.json(
      { ok: false, error: "정책 정보를 일시적으로 확인할 수 없습니다.", errorCode: "POLICY_RELEASE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const hasManifestFields = Object.hasOwn(body, "releaseIds") || Object.hasOwn(body, "manifestRevision");
  const hasBooleanFields = Object.hasOwn(body, "termsAgreed") || Object.hasOwn(body, "privacyAgreed");
  if (runtime.mode === "legacy" && hasManifestFields) {
    return NextResponse.json(
      { ok: false, error: "정책 릴리스가 현재 manifest와 일치하지 않습니다.", errorCode: "POLICY_RELEASE_MISMATCH" },
      { status: 409 },
    );
  }

  const consentPayload = runtime.mode === "manifest" && hasManifestFields
    ? (() => {
        if (hasBooleanFields || !Array.isArray(body.releaseIds) ||
            !body.releaseIds.every((releaseId) => typeof releaseId === "string") ||
            typeof body.manifestRevision !== "string") return null;
        return { releaseIds: body.releaseIds, manifestRevision: body.manifestRevision };
      })()
    : (() => {
        if (hasManifestFields ||
            (body.termsAgreed !== undefined && typeof body.termsAgreed !== "boolean") ||
            (body.privacyAgreed !== undefined && typeof body.privacyAgreed !== "boolean")) return null;
        const agreedPolicyIds: AccountPolicyId[] = [
          ...(body.termsAgreed === true ? (["terms"] as const) : []),
          ...(body.privacyAgreed === true ? (["privacy"] as const) : []),
        ];
        return agreedPolicyIds.length > 0 ? { agreedPolicyIds } : null;
      })();
  if (!consentPayload) {
    return NextResponse.json(
      { ok: false, error: "invalid_policy_consent", errorCode: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  try {
    const policy = await recordAccountPolicyReconsent({
      uid,
      email,
      ...consentPayload,
      syncWordPress: false,
    });
    return NextResponse.json({ ok: true, policy });
  } catch (error) {
    if (!(error instanceof PolicyReleaseUnavailableError)) throw error;
    return NextResponse.json(
      { ok: false, error: "정책 정보를 일시적으로 확인할 수 없습니다.", errorCode: "POLICY_RELEASE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
