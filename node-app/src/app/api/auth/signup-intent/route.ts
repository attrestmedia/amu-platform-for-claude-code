import { NextResponse } from "next/server";
import { isProduct } from "utils/common";
import { CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";
import { issueSignupIntent, SIGNUP_INTENT_COOKIE, SIGNUP_INTENT_MAX_AGE } from "libs/server-utils/auth/signupIntent";
import { isMagazineAuthProvider, MAGAZINE_LOGIN_INTENT_COOKIE } from "libs/server-utils/auth/magazineLoginIntent";
import { normalizeSsoReturnTo, ssoOrigin } from "libs/server-utils/auth/ssoTicketService";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

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
  try {
    intent = await issueSignupIntent({
      source,
      provider: body.provider,
      returnTo,
      termsVersion: CURRENT_ACCOUNT_POLICY.terms.version,
      privacyVersion: CURRENT_ACCOUNT_POLICY.privacy.version,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "가입 준비가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", errorCode: "SIGNUP_INTENT_UNAVAILABLE" },
      { status: 503, headers: NO_STORE },
    );
  }
  const response = NextResponse.json(
    { ok: true, policy: CURRENT_ACCOUNT_POLICY },
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
