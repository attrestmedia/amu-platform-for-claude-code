/**
 * @docHint
 * @purpose cookieUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain auth
 * @scope client
 */

export function getCookie(name: string): string | undefined {
  if (typeof window === "undefined") return undefined;

  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : undefined;
}

export function getAuthToken(): string | undefined {
  return getCookie("authToken");
}

// 브라우저에서 사용할 js-cookie용 설정
type ClientCookieConfig = {
  name: string;
  path: string;
  maxAge?: number; // 초 단위(옵션) — 없으면 세션 쿠키로 처리
};

export function getClientCookieOptions(config: ClientCookieConfig) {
  return {
    // js-cookie는 일(day) 단위, maxAge(초)가 없으면 undefined를 반환해 세션 쿠키로 동작
    expires: typeof config.maxAge === "number" ? Math.floor(config.maxAge / (60 * 60 * 24)) : undefined,
    path: config.path,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}
