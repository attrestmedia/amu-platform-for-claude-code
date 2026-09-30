import { NextResponse } from "next/server";
import { WP_HOME_URL } from "consts/env/public";
import { wordpressPasswordRecoveryUrl } from "libs/server-utils/auth/passwordRecovery";

export function GET() {
  const response = NextResponse.redirect(wordpressPasswordRecoveryUrl(WP_HOME_URL), 307);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
