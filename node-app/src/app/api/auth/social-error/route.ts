import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isProduct } from "utils/common";
import {
  consumeMagazineLoginIntentForRecovery,
  MAGAZINE_LOGIN_INTENT_COOKIE,
} from "libs/server-utils/auth/magazineLoginIntent";
import {
  consumeSignupIntentForRecovery,
  SIGNUP_INTENT_COOKIE,
} from "libs/server-utils/auth/signupIntent";
import { ssoOrigin } from "libs/server-utils/auth/ssoTicketService";

export const runtime = "nodejs";

function clearIntentCookies(response: NextResponse) {
  for (const name of [MAGAZINE_LOGIN_INTENT_COOKIE, SIGNUP_INTENT_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: isProduct,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const magazineJti = cookieStore.get(MAGAZINE_LOGIN_INTENT_COOKIE)?.value;
  const signupJti = cookieStore.get(SIGNUP_INTENT_COOKIE)?.value;
  let destination = "/login?error=OAUTH_CALLBACK_FAILED";

  try {
    if (magazineJti) {
      const intent = await consumeMagazineLoginIntentForRecovery({ jti: magazineJti });
      if (intent) {
        const params = new URLSearchParams({
          error: "OAUTH_CALLBACK_FAILED",
          source: "magazine",
          provider: intent.provider,
          returnTo: intent.returnTo,
        });
        destination = `/login?${params.toString()}`;
      }
    } else if (signupJti) {
      const intent = await consumeSignupIntentForRecovery({ jti: signupJti });
      if (intent) {
        const params = new URLSearchParams({
          error: "OAUTH_CALLBACK_FAILED",
          provider: intent.provider,
          ...(intent.source === "magazine"
            ? { source: "magazine", returnTo: intent.returnTo }
            : { next: intent.returnTo }),
        });
        destination = `/signup?${params.toString()}`;
      }
    }
  } catch {
    destination = "/login?error=OAUTH_CALLBACK_FAILED";
  }

  const response = NextResponse.redirect(new URL(destination, ssoOrigin("app")), 303);
  response.headers.set("Cache-Control", "no-store");
  clearIntentCookies(response);
  return response;
}
