import type { NextResponse } from "next/server";
import * as cookie from "cookie";
import { AUTH_TOKEN_MAX_AGE_SEC, COOKIE_CONFIG } from "consts/token";
import { isProduct } from "utils/common";

/**
 * @docHint
 * @purpose WP JWT authToken 쿠키 설정/삭제 옵션을 서버 라우트에서 공통 적용
 * @process 공통 보안 옵션 구성  Set-Cookie 직렬화  NextResponse 쿠키 갱신
 * @domain auth
 * @scope server
 */

const AUTH_TOKEN_COOKIE_COMMON = {
  httpOnly: true,
  secure: isProduct,
  sameSite: "lax" as const,
  path: "/",
};

function getAuthCookieDomain() {
  const domain = String(process.env.AUTH_COOKIE_DOMAIN || "").trim();
  if (!domain || !isProduct) return undefined;
  return domain;
}

export function getAuthTokenCookieOptions(maxAge = AUTH_TOKEN_MAX_AGE_SEC) {
  const domain = getAuthCookieDomain();
  return {
    ...AUTH_TOKEN_COOKIE_COMMON,
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export function setAuthTokenCookie<T extends NextResponse>(response: T, token: string) {
  response.cookies.set(COOKIE_CONFIG.AUTH_TOKEN.name, token, getAuthTokenCookieOptions());
  return response;
}

export function serializeAuthTokenCookie(token: string, maxAge = AUTH_TOKEN_MAX_AGE_SEC) {
  return cookie.serialize(COOKIE_CONFIG.AUTH_TOKEN.name, token, getAuthTokenCookieOptions(maxAge));
}

export function serializeClearedAuthTokenCookie() {
  const domain = getAuthCookieDomain();
  return cookie.serialize(COOKIE_CONFIG.AUTH_TOKEN.name, "", {
    ...AUTH_TOKEN_COOKIE_COMMON,
    ...(domain ? { domain } : {}),
    maxAge: 0,
    expires: new Date(0),
  });
}

// ── SSO 자동 동기화 힌트 쿠키 ─────────────────────────────────────────────
// 앱에서 로그인한 방문자임을 매거진(allmyuniverse.com) 프런트가 알 수 있게 하는
// 값 없는 플래그 쿠키다. 민감 정보가 없고(httpOnly 아님, 값 "1"),
// 매거진은 이 쿠키가 있을 때만 조용한 SSO 동기화를 시도해 익명 방문자 왕복을 피한다.
// 도메인은 SSO 앱 origin의 부모 도메인(예: app.allmyuniverse.com → .allmyuniverse.com)을 따른다.

export const SESSION_HINT_COOKIE_NAME = "amu_id_hint";
const SESSION_HINT_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function getSessionHintCookieDomain() {
  if (!isProduct) return undefined;
  let host = "";
  try {
    host = new URL(String(process.env.SSO_APP_ORIGIN || "")).hostname;
  } catch {
    host = "";
  }
  if (!host) host = "app.allmyuniverse.com";
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return undefined;
  return `.${labels.slice(-2).join(".")}`;
}

function getSessionHintCookieOptions(maxAge: number) {
  const domain = getSessionHintCookieDomain();
  return {
    httpOnly: false,
    secure: isProduct,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export function serializeSessionHintCookie() {
  return cookie.serialize(SESSION_HINT_COOKIE_NAME, "1", getSessionHintCookieOptions(SESSION_HINT_MAX_AGE_SEC));
}

export function serializeClearedSessionHintCookie() {
  return cookie.serialize(SESSION_HINT_COOKIE_NAME, "", {
    ...getSessionHintCookieOptions(0),
    expires: new Date(0),
  });
}

export function setSessionHintCookie<T extends NextResponse>(response: T) {
  response.cookies.set(SESSION_HINT_COOKIE_NAME, "1", getSessionHintCookieOptions(SESSION_HINT_MAX_AGE_SEC));
  return response;
}

export function clearSessionHintCookie<T extends NextResponse>(response: T) {
  response.cookies.set(SESSION_HINT_COOKIE_NAME, "", { ...getSessionHintCookieOptions(0), expires: new Date(0) });
  return response;
}
