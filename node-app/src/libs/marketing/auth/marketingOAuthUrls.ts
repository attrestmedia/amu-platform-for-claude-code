import "server-only";

import { NEXTAUTH_URL } from "consts/env/server";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 마케팅 사용자 OAuth 콜백/리다이렉트 절대 URL 생성
 * @process env(NEXTAUTH_URL) origin 우선, 없으면 요청 origin으로 절대 경로 조립
 * @domain marketing
 * @scope server
 */

function resolveOriginFromEnv() {
  const raw = toSafeString(NEXTAUTH_URL).replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function buildMarketingOAuthUrl(path: string, request?: Request | null) {
  const origin = resolveOriginFromEnv() || (request ? new URL(request.url).origin : "");
  return new URL(path, origin).toString();
}
