import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getAccountPolicyConsentStatus,
  recordAccountPolicyReconsent,
} from "libs/server-utils/auth/policyConsentService";
import type { AccountPolicyId } from "consts/legal/accountPolicy";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

function identity(user: unknown) {
  const record = toUnknownRecord(user);
  return {
    uid: String(record.uid || record.ID || ""),
    email: String(record.userEmail || record.user_email || "").trim().toLowerCase(),
  };
}

async function handleGET(_data: unknown, user: unknown) {
  const account = identity(user);
  return NextResponse.json({ ok: true, policy: await getAccountPolicyConsentStatus(account) });
}

type ConsentBody = { termsAgreed?: boolean; privacyAgreed?: boolean };

async function handlePOST(data: ConsentBody, user: unknown) {
  const agreedPolicyIds: AccountPolicyId[] = [
    ...(data.termsAgreed === true ? (["terms"] as const) : []),
    ...(data.privacyAgreed === true ? (["privacy"] as const) : []),
  ];
  if (agreedPolicyIds.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "동의할 개정 정책을 확인해 주세요.",
        errorCode: "POLICY_CONSENT_REQUIRED",
      },
      { status: 400 },
    );
  }
  const account = identity(user);
  return NextResponse.json({
    ok: true,
    policy: await recordAccountPolicyReconsent({ ...account, agreedPolicyIds }),
  });
}

const options = { allowStalePolicyConsent: true } as const;
export const GET = withAuth(handleGET, undefined, "account:policy-consent:get", {
  ...options,
  bodyParser: "none",
});
export const POST = withAuth<ConsentBody>(handlePOST, undefined, "account:policy-consent:update", {
  ...options,
  bodyParser: "json",
});
