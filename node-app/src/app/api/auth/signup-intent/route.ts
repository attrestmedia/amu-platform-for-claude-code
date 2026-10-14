import { NextResponse } from "next/server";
import { isProduct } from "utils/common";
import { getSignupPolicyOffer } from "libs/server-utils/legal/accountPolicyDecision";
import { getPolicyReleaseRuntime, PolicyReleaseUnavailableError } from "libs/server-utils/legal/policyReleaseRuntime";
import { resolvePolicy } from "consts/legal/policyRelease/resolver";
import { issueSignupIntent, SIGNUP_INTENT_COOKIE, SIGNUP_INTENT_MAX_AGE } from "libs/server-utils/auth/signupIntent";
import { isMagazineAuthProvider, MAGAZINE_LOGIN_INTENT_COOKIE } from "libs/server-utils/auth/magazineLoginIntent";
import { normalizeSsoReturnTo, ssoOrigin } from "libs/server-utils/auth/ssoTicketService";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

function sameReleaseIdSet(value: unknown, expected: readonly string[]) {
  if (!Array.isArray(value) || !value.every((releaseId) => typeof releaseId === "string")) return false;
  const received = new Set(value);
  const offered = new Set(expected);
  return received.size === value.length && received.size === offered.size &&
    [...offered].every((releaseId) => received.has(releaseId));
}

export async function GET() {
  const now = new Date();
  try {
    const offer = getSignupPolicyOffer(now);
    const releases: Array<{
      releaseId: string;
      policyId: "terms" | "privacy";
      version: string;
      effectiveAt: string;
      kind: "active" | "announced";
    }> = [];

    if (offer.mode === "manifest") {
      const runtimeValue = getPolicyReleaseRuntime();
      if (runtimeValue.mode !== "manifest") throw new PolicyReleaseUnavailableError();
      const manifestPolicies = [
        { policyId: "terms", manifestPolicyId: "terms-of-service" },
        { policyId: "privacy", manifestPolicyId: "privacy-policy" },
      ] as const;

      for (const releaseId of offer.releaseIds) {
        const mapping = manifestPolicies.find(({ manifestPolicyId }) =>
          runtimeValue.manifest.policies[manifestPolicyId].releases.some((release) => release.releaseId === releaseId),
        );
        if (!mapping) throw new PolicyReleaseUnavailableError();
        const release = runtimeValue.manifest.policies[mapping.manifestPolicyId].releases.find(
          (item) => item.releaseId === releaseId,
        );
        if (!release) throw new PolicyReleaseUnavailableError();
        const selection = resolvePolicy(runtimeValue.manifest, mapping.manifestPolicyId, now.getTime());
        const kind = selection.active === releaseId
          ? "active"
          : selection.announced.includes(releaseId) ? "announced" : null;
        if (!kind) throw new PolicyReleaseUnavailableError();
        releases.push({
          releaseId,
          policyId: mapping.policyId,
          version: release.version,
          effectiveAt: release.effectiveAt,
          kind,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      offer: {
        mode: offer.mode,
        manifestRevision: offer.manifestRevision,
        releaseIds: offer.releaseIds,
        releases,
      },
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { ok: false, error: "정책 정보를 일시적으로 확인할 수 없습니다.", errorCode: "POLICY_RELEASE_UNAVAILABLE" },
      { status: 503, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== ssoOrigin("app").origin) {
    return NextResponse.json(
      { ok: false, error: "가입 요청의 출처를 확인하지 못했습니다.", errorCode: "ORIGIN_INVALID" },
      { status: 403, headers: NO_STORE },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    terms?: unknown;
    privacy?: unknown;
    source?: unknown;
    provider?: unknown;
    returnTo?: unknown;
    releaseIds?: unknown;
    manifestRevision?: unknown;
  } | null;
  if (body?.terms !== true || body?.privacy !== true) {
    return NextResponse.json(
      { ok: false, error: "필수 정책 동의가 필요합니다.", errorCode: "POLICY_CONSENT_REQUIRED" },
      { status: 400, headers: NO_STORE },
    );
  }
  const source = body?.source === "magazine" ? "magazine" : "platform";
  if (!isMagazineAuthProvider(body?.provider)) {
    return NextResponse.json(
      { ok: false, error: "소셜 제공자를 확인해 주세요.", errorCode: "PROVIDER_INVALID" },
      { status: 400, headers: NO_STORE },
    );
  }
  let returnTo = typeof body?.returnTo === "string" ? body.returnTo : "/";
  try {
    if (source === "magazine") returnTo = normalizeSsoReturnTo(returnTo, "magazine");
    else if (
      !returnTo.startsWith("/") ||
      returnTo.startsWith("//") ||
      returnTo.includes("://") ||
      /[\\\u0000-\u001F\u007F]/.test(returnTo)
    ) returnTo = "/";
  } catch {
    return NextResponse.json(
      { ok: false, error: "복귀 경로를 확인해 주세요.", errorCode: "RETURN_TO_INVALID" },
      { status: 400, headers: NO_STORE },
    );
  }
  let intent;
  let offer: ReturnType<typeof getSignupPolicyOffer>;
  try {
    offer = getSignupPolicyOffer();
    if (offer.mode === "manifest" && (
      !sameReleaseIdSet(body?.releaseIds, offer.releaseIds) ||
      typeof body?.manifestRevision !== "string" ||
      body.manifestRevision.length === 0
    )) {
      return NextResponse.json(
        { ok: false, error: "정책 안내가 갱신되었습니다. 내용을 다시 확인해 주세요.", errorCode: "POLICY_RELEASE_MISMATCH" },
        { status: 409, headers: NO_STORE },
      );
    }
    intent = await issueSignupIntent({
      source,
      provider: body.provider,
      returnTo,
      termsVersion: offer.termsVersion,
      privacyVersion: offer.privacyVersion,
      releaseIds: offer.mode === "manifest" ? body.releaseIds as string[] : offer.releaseIds,
      manifestRevision: offer.mode === "manifest" ? body.manifestRevision as string : offer.manifestRevision,
    });
  } catch (error) {
    const coded = error as { errorCode?: string };
    if (coded.errorCode === "POLICY_RELEASE_UNAVAILABLE") {
      return NextResponse.json(
        { ok: false, error: "정책 정보를 일시적으로 확인할 수 없습니다.", errorCode: "POLICY_RELEASE_UNAVAILABLE" },
        { status: 503, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { ok: false, error: "가입 준비가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", errorCode: "SIGNUP_INTENT_UNAVAILABLE" },
      { status: 503, headers: NO_STORE },
    );
  }
  const response = NextResponse.json(
    { ok: true, policy: offer.policy, policies: offer.policies },
    { headers: NO_STORE },
  );
  response.cookies.set(SIGNUP_INTENT_COOKIE, intent.jti, {
    httpOnly: true,
    secure: isProduct,
    sameSite: "lax",
    path: "/",
    maxAge: SIGNUP_INTENT_MAX_AGE,
  });
  response.cookies.set(MAGAZINE_LOGIN_INTENT_COOKIE, "", {
    httpOnly: true,
    secure: isProduct,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== ssoOrigin("app").origin) {
    return NextResponse.json(
      { ok: false, error: "요청의 출처를 확인하지 못했습니다.", errorCode: "ORIGIN_INVALID" },
      { status: 403, headers: NO_STORE },
    );
  }
  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  response.cookies.set(SIGNUP_INTENT_COOKIE, "", {
    httpOnly: true,
    secure: isProduct,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  response.cookies.set(MAGAZINE_LOGIN_INTENT_COOKIE, "", {
    httpOnly: true,
    secure: isProduct,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
