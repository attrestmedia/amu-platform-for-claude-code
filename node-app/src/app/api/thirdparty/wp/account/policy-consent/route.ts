import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import { recordAccountPolicyReconsent } from "libs/server-utils/auth/policyConsentService";
import type { AccountPolicyId } from "consts/legal/accountPolicy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  }

  const body = JSON.parse(bodyText || "{}") as {
    user_id?: unknown;
    email?: unknown;
    termsAgreed?: unknown;
    privacyAgreed?: unknown;
  };
  const uid = String(body.user_id || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const agreedPolicyIds: AccountPolicyId[] = [
    ...(body.termsAgreed === true ? (["terms"] as const) : []),
    ...(body.privacyAgreed === true ? (["privacy"] as const) : []),
  ];
  if (!/^\d+$/.test(uid) || !/^\S+@\S+\.\S+$/.test(email) || agreedPolicyIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "invalid_policy_consent", errorCode: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const policy = await recordAccountPolicyReconsent({
    uid,
    email,
    agreedPolicyIds,
    syncWordPress: false,
  });
  return NextResponse.json({ ok: true, policy });
}
