import "server-only";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import * as cookie from "cookie";
import { authOptions } from "src/auth";
import { COOKIE_CONFIG } from "consts/token";
import { verifyAuthToken } from "./authUtils";
import { SsoTicketError, assertSsoAccountActive, type SsoIdentity } from "./ssoTicketService";

/**
 * @docHint
 * @purpose NextAuth 또는 WP authToken에서 SSO 발급용 통합 회원 식별자 확인
 * @process NextAuth 우선 확인 → authToken 검증 → Mongo 계정 활성 상태 재검증
 * @domain auth
 * @scope server-auth
 */

export async function resolveSsoRequestIdentity(request: NextRequest): Promise<SsoIdentity> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as (NonNullable<typeof session>["user"] & { id?: string }) | undefined;
  if (sessionUser?.id && sessionUser.email) {
    return assertSsoAccountActive({
      uid: String(sessionUser.id),
      email: String(sessionUser.email),
      name: String(sessionUser.name || ""),
    });
  }

  const parsed = cookie.parse(request.headers.get("cookie") || "");
  const authToken = String(parsed[COOKIE_CONFIG.AUTH_TOKEN.name] || "");
  if (!authToken) throw new SsoTicketError("authentication_required", 401);
  const headers = new Headers(request.headers);
  headers.set("x-auth-token", authToken);
  const verified = await verifyAuthToken(new NextRequest(request.url, { method: request.method, headers }));
  if (!verified.verified) throw new SsoTicketError("authentication_required", 401);
  return assertSsoAccountActive({
    uid: String(verified.user.ID || ""),
    email: String(verified.user.user_email || ""),
    name: String(verified.user.display_name || verified.user.user_nicename || ""),
  });
}
