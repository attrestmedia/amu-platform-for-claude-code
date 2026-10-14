import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getAccountPolicyConsentStatus,
  recordAccountPolicyReconsent,
} from "libs/server-utils/auth/policyConsentService";
import type { AccountPolicyId } from "consts/legal/accountPolicy";
import { toUnknownRecord } from "utils/common";
import { PolicyReleaseUnavailableError, getPolicyReleaseRuntime } from "libs/server-utils/legal/policyReleaseRuntime";

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
  try {
    return NextResponse.json({ ok: true, policy: await getAccountPolicyConsentStatus(account) });
  } catch (error) {
    if (!(error instanceof PolicyReleaseUnavailableError)) throw error;
    return NextResponse.json(
      { ok: false, error: "정책 정보를 일시적으로 확인할 수 없습니다.", errorCode: "POLICY_RELEASE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

type ConsentBody = {
  termsAgreed?: unknown;
  privacyAgreed?: unknown;
  releaseIds?: unknown;
  manifestRevision?: unknown;
};

function invalidInputResponse() {
  return NextResponse.json(
    { ok: false, error: "정책 동의 요청 형식이 올바르지 않습니다.", errorCode: "INVALID_INPUT" },
    { status: 400 },
  );
}

function unavailableResponse() {
  return NextResponse.json(
    { ok: false, error: "정책 정보를 일시적으로 확인할 수 없습니다.", errorCode: "POLICY_RELEASE_UNAVAILABLE" },
    { status: 503 },
  );
}

async function handlePOST(data: ConsentBody, user: unknown) {
  const runtime = getPolicyReleaseRuntime();
  if (runtime.mode === "unavailable") return unavailableResponse();
  const body = toUnknownRecord(data);

  const hasLegacyFields = Object.hasOwn(body, "termsAgreed") || Object.hasOwn(body, "privacyAgreed");
  const hasManifestFields = Object.hasOwn(body, "releaseIds") || Object.hasOwn(body, "manifestRevision");
  if (runtime.mode === "manifest") {
    if (hasLegacyFields || !Array.isArray(body.releaseIds) ||
        !body.releaseIds.every((releaseId) => typeof releaseId === "string") ||
        typeof body.manifestRevision !== "string") return invalidInputResponse();
    const account = identity(user);
    try {
      return NextResponse.json({
        ok: true,
        policy: await recordAccountPolicyReconsent({
          ...account,
          releaseIds: body.releaseIds,
          manifestRevision: body.manifestRevision,
        }),
      });
    } catch (error) {
      if (!(error instanceof PolicyReleaseUnavailableError)) throw error;
      return unavailableResponse();
    }
  }
  if (hasManifestFields ||
      (body.termsAgreed !== undefined && typeof body.termsAgreed !== "boolean") ||
      (body.privacyAgreed !== undefined && typeof body.privacyAgreed !== "boolean")) return invalidInputResponse();

  const agreedPolicyIds: AccountPolicyId[] = [
    ...(body.termsAgreed === true ? (["terms"] as const) : []),
    ...(body.privacyAgreed === true ? (["privacy"] as const) : []),
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
  try {
    return NextResponse.json({
      ok: true,
      policy: await recordAccountPolicyReconsent({ ...account, agreedPolicyIds }),
    });
  } catch (error) {
    if (!(error instanceof PolicyReleaseUnavailableError)) throw error;
    return unavailableResponse();
  }
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
