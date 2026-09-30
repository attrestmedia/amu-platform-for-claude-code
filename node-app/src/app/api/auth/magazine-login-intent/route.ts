import { NextResponse } from "next/server";
import { isProduct } from "utils/common";
import {
  issueMagazineLoginIntent,
  MAGAZINE_LOGIN_INTENT_COOKIE,
} from "libs/server-utils/auth/magazineLoginIntent";
import { SIGNUP_INTENT_COOKIE } from "libs/server-utils/auth/signupIntent";
import { ssoOrigin } from "libs/server-utils/auth/ssoTicketService";

/**
 * @docHint
 * @purpose 매거진 소셜 로그인 intent 발급
 * @process provider·returnTo 검증 → Redis NX intent 저장 → httpOnly 쿠키 설정
 * @domain auth
 * @scope api
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== ssoOrigin("app").origin) {
    return NextResponse.json(
      { ok: false, error: "로그인 요청의 출처를 확인하지 못했습니다.", errorCode: "ORIGIN_INVALID" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const body = (await request.json().catch(() => null)) as { provider?: unknown; returnTo?: unknown } | null;
  try {
    const result = await issueMagazineLoginIntent({ provider: body?.provider, returnTo: body?.returnTo });
    const response = NextResponse.json({ ok: true, returnTo: result.returnTo, expiresIn: result.expiresIn }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(MAGAZINE_LOGIN_INTENT_COOKIE, result.jti, {
      httpOnly: true,
      secure: isProduct,
      sameSite: "lax",
      path: "/",
      maxAge: result.expiresIn,
    });
    response.cookies.set(SIGNUP_INTENT_COOKIE, "", {
      httpOnly: true,
      secure: isProduct,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const unavailable = error instanceof Error && error.message === "MAGAZINE_LOGIN_INTENT_UNAVAILABLE";
    return NextResponse.json(
      {
        ok: false,
        error: unavailable ? "로그인 준비가 지연되고 있습니다. 잠시 후 다시 시도해 주세요." : "로그인 요청을 확인하지 못했습니다.",
        errorCode: unavailable ? "MAGAZINE_LOGIN_INTENT_UNAVAILABLE" : "MAGAZINE_LOGIN_INTENT_INVALID",
      },
      { status: unavailable ? 503 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
