import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getNarrativeConsent, deleteUserNarrativeData, updateNarrativeConsent } from "libs/server-utils/narrative/narrativeLifecycle";
import { NARRATIVE_LIFECYCLE_POLICY } from "types/game";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Personal Canon 동의·opt-out·삭제 API
 * @process 인증 UID 사용  목적/보유기간 반환  feature flag 동의 게이트  사용자 narrative 데이터 파기
 * @domain narrative-privacy
 * @scope account-api
 */

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function codeOf(error: unknown) {
  return error instanceof Error ? error.message : "NARRATIVE_PRIVACY_FAILED";
}

async function handleGET(_body: unknown, user: AuthenticatedUserType) {
  const uid = uidOf(user);
  return NextResponse.json({ ok: true, policy: NARRATIVE_LIFECYCLE_POLICY, preference: await getNarrativeConsent(uid) }, { headers: { "Cache-Control": "no-store" } });
}

async function handlePATCH(body: unknown, user: AuthenticatedUserType) {
  const input = toUnknownRecord(body);
  const personalCanonStatus = String(input.personalCanonStatus || "") as "active" | "opted_out";
  const crossServiceMemoryConsent = String(input.crossServiceMemoryConsent || "") as "not_granted" | "granted" | "withdrawn";
  const crossServiceConsentVersion = String(input.crossServiceConsentVersion || "");
  if (!["active", "opted_out"].includes(personalCanonStatus) || !["not_granted", "granted", "withdrawn"].includes(crossServiceMemoryConsent)) {
    return NextResponse.json({ ok: false, errorCode: "NARRATIVE_PRIVACY_INPUT_INVALID" }, { status: 400 });
  }
  try {
    const preference = await updateNarrativeConsent({
      uid: uidOf(user),
      personalCanonStatus,
      crossServiceMemoryConsent,
      crossServiceConsentVersion,
      consentVersion: String(input.consentVersion || ""),
      purposeAcknowledged: input.purposeAcknowledged === true,
    });
    return NextResponse.json({ ok: true, preference }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = codeOf(error);
    return NextResponse.json({ ok: false, errorCode: code }, { status: code === "NARRATIVE_RUNTIME_DISABLED" ? 423 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

async function handleDELETE(_body: unknown, user: AuthenticatedUserType) {
  const deleted = await deleteUserNarrativeData(uidOf(user));
  return NextResponse.json({ ok: true, deleted, policyVersion: NARRATIVE_LIFECYCLE_POLICY.version }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAuth(handleGET, undefined, "account:narrative-privacy:get", { bodyParser: "none" });
export const PATCH = withAuth(handlePATCH, undefined, "account:narrative-privacy:patch", { bodyParser: "json" });
export const DELETE = withAuth(handleDELETE, undefined, "account:narrative-privacy:delete", { bodyParser: "none", allowStalePolicyConsent: true });
