import { NextResponse, NextRequest } from "next/server";
import { COOKIE_CONFIG } from "consts/token";
import type { LanguageType } from "types/language";
import { logger } from "utils/log";
import * as cookie from "cookie";
import { setSessionHintCookie } from "libs/server-utils/auth/authCookie";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain auth
 * @scope edge-global
 */

// 공통 헬퍼
function hasNextAuthSession(parsed: Record<string, string | undefined>) {
  return Boolean(parsed["na.session"] || parsed["__Host-na.session"]);
}

function isAgentAiRoute(pathname: string) {
  return (
    pathname === "/api/ai/generate/agent-image" ||
    pathname === "/api/ai/generate/agent-content" ||
    pathname.startsWith("/api/ai/agent/")
  );
}

const WORDPRESS_HMAC_BRIDGE_ROUTES = new Set([
  "/api/internal/mail/send",
  "/api/thirdparty/wp/gen-studio-assets",
  "/api/thirdparty/wp/promo-slots",
  "/api/thirdparty/wp/article-experience",
  "/api/thirdparty/wp/sso/ticket",
  "/api/thirdparty/wp/sso/consume",
  "/api/thirdparty/wp/account/deletion",
  "/api/thirdparty/wp/account/policy-consent",
  "/api/thirdparty/wp/newsletter/subscription",
]);

function isWordPressHmacBridgeRoute(pathname: string) {
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return WORDPRESS_HMAC_BRIDGE_ROUTES.has(normalizedPathname);
}

function magazineEmbedParentOrigins() {
  return String(process.env.MAGAZINE_EMBED_ALLOWED_PARENT_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^https:\/\/[^/]+(?::\d+)?$/.test(value) || (process.env.NODE_ENV !== "production" && /^http:\/\/[^/]+(?::\d+)?$/.test(value)));
}

function isMagazineEmbedPage(pathname: string) {
  return pathname.startsWith("/embed/magazine/v1/");
}

function applyMagazineEmbedHeaders(response: NextResponse) {
  const origins = magazineEmbedParentOrigins();
  response.headers.set("Content-Security-Policy", `frame-ancestors ${origins.length ? origins.join(" ") : "'none'"}; object-src 'none'; base-uri 'none'`);
  response.headers.delete("X-Frame-Options");
  response.headers.set("Referrer-Policy", "strict-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

const PUBLIC_MARKETING_PROVIDER_CALLBACKS = new Set([
  "/api/marketing/oauth/threads/deauthorize",
  "/api/marketing/oauth/threads/data-deletion",
]);

function isPublicMarketingProviderCallback(req: NextRequest) {
  return req.method === "POST" && PUBLIC_MARKETING_PROVIDER_CALLBACKS.has(req.nextUrl.pathname);
}

// Tutors 공개 갤러리는 공개 템플릿의 pid·name·imageUrl만 반환하는 읽기 전용 경로다.
// /api/tutors 전체 세션 인증에 걸려 비로그인 독자에게 401이 나가면 Magazine 인라인
// composer가 페르소나 표기를 못 하므로, GET 단일 경로만 예외로 연다.
// trailing slash를 정규화하지 않는 것은 의도다. 인증 예외는 매칭 형태를 넓히지 않고
// 정확 일치만 통과시켜, 변형 경로가 전부 인증 분기로 떨어지게 둔다.
const PUBLIC_TUTORS_READ_PATHS = new Set(["/api/tutors/public-gallery"]);

function isPublicTutorsRead(req: NextRequest) {
  return req.method === "GET" && PUBLIC_TUTORS_READ_PATHS.has(req.nextUrl.pathname);
}

function historyPageRedirect(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return url;
}

function rewriteUniverseAlias(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/shop" || pathname.indexOf("/shop/") === 0) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/shop/, "/store");
    return NextResponse.redirect(url);
  }

  return null;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookiesHeader = req.headers.get("cookie") || "";
  const parsed = cookie.parse(cookiesHeader);
  const aliasRewrite = rewriteUniverseAlias(req);

  if (aliasRewrite) {
    return aliasRewrite;
  }

  // 소셜 로그인(NextAuth) 콜백 응답에 SSO 자동 동기화 힌트 쿠키를 심는다.
  // 이메일 로그인·SSO consume 라우트는 각자 힌트를 설정하고, 콜백만 미들웨어가 대신한다.
  if (req.method === "GET" && pathname.startsWith("/api/auth/callback/")) {
    return setSessionHintCookie(NextResponse.next());
  }

  // 전용 iframe surface만 명시된 부모 origin을 허용한다. token/API route는 별도 검증을 유지한다.
  if (isMagazineEmbedPage(pathname)) {
    return applyMagazineEmbedHeaders(NextResponse.next());
  }

  // Accept-Language 헤더에서 선호 언어 감지
  const acceptLanguage = req.headers.get("accept-language") || "";
  const detectedLanguage = detectLanguage(acceptLanguage);

  // ====== API 라우트들 ======
  // **AI API 라우트에 대한 인증 검사**
  if (pathname.startsWith("/api/ai/")) {
    const hasWp = !!parsed.authToken;
    const hasNa = hasNextAuthSession(parsed);
    const hasAgentKey = Boolean(req.headers.get("x-agent-key"));
    const isAgentRoute = isAgentAiRoute(pathname);

    const requestHeaders = new Headers(req.headers);
    if (hasWp) requestHeaders.set("x-auth-token", parsed.authToken!);
    requestHeaders.set("x-request-id", crypto.randomUUID());

    if (hasWp || hasNa || (isAgentRoute && hasAgentKey)) {
      // 일반 AI API는 세션 기반으로 통과시키고, agent 전용 경로는 x-agent-key가 있으면
      // route 레벨 validateAgentKey()가 실제 인증을 수행하도록 넘긴다.
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // **Commerce 라우트: 인증 "선택"**
  // - 로그인 사용자는 x-auth-token 부여
  // - 비로그인은 x-guest-id 유무만 전달(검증은 라우트 핸들러에서 수행)
  if (pathname.startsWith("/api/commerce/")) {
    const requestHeaders = new Headers(req.headers);

    if (parsed.authToken) {
      requestHeaders.set("x-auth-token", parsed.authToken as string);
    }

    // 프런트에서 localStorage의 guestId를 헤더로 넣어 전송하도록 가이드
    const guestId = req.headers.get("x-guest-id") || parsed.amu_guest_id;
    if (guestId) requestHeaders.set("x-guest-id", guestId);

    requestHeaders.set("x-request-id", crypto.randomUUID());
    logger.debug(`커머스 요청 통과: ${pathname}, guestId=${guestId ? "Y" : "N"}`);

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // **업로드 라우트: 인증/게스트 헤더 보강**
  if (pathname.startsWith("/api/upload")) {
    const requestHeaders = new Headers(req.headers);

    if (parsed.authToken) {
      requestHeaders.set("x-auth-token", parsed.authToken as string);
    }

    const guestId = req.headers.get("x-guest-id") || parsed.amu_guest_id;
    if (guestId) requestHeaders.set("x-guest-id", guestId);

    requestHeaders.set("x-request-id", crypto.randomUUID());
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // **카탈로그 라우트: GET은 기존 공개 조회 유지, 쓰기 요청은 인증 필요**
  if (pathname.startsWith("/api/catalog/")) {
    const hasWp = !!parsed.authToken;
    const hasNa = hasNextAuthSession(parsed);

    const requestHeaders = new Headers(req.headers);
    if (hasWp) requestHeaders.set("x-auth-token", parsed.authToken as string);
    requestHeaders.set("x-request-id", crypto.randomUUID());

    if (req.method === "GET" || hasWp || hasNa) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // **/api/universe에 대한 조건부 인증 체크 (GET 요청은 공개, 나머지는 인증 필요)**
  if (pathname.startsWith("/api/universe")) {
    const hasWp = !!parsed.authToken;
    const hasNa = hasNextAuthSession(parsed);

    const requestHeaders = new Headers(req.headers);
    if (hasWp) {
      // JWT 쿠키를 가진 사용자는 항상 헤더로 실어 보냄
      requestHeaders.set("x-auth-token", parsed.authToken as string);
    }
    requestHeaders.set("x-request-id", crypto.randomUUID());

    // GET 은 공개 조회 가능: 토큰이 있으면 핸들러에서 쓰고, 없어도 그냥 통과
    if (req.method === "GET") {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // 비-GET 은 강제 인증
    if (hasWp || hasNa) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // **conversations API에 대한 인증 처리**
  if (pathname.startsWith("/api/conversations")) {
    const requestHeaders = new Headers(req.headers);

    if (parsed.authToken) requestHeaders.set("x-auth-token", parsed.authToken as string);
    if (!requestHeaders.get("x-guest-id") && parsed.amu_guest_id) {
      requestHeaders.set("x-guest-id", parsed.amu_guest_id);
    }
    requestHeaders.set("x-request-id", crypto.randomUUID());
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // **LAB API (프롬프트 관리) 인증 헤더 보강**
  if (pathname.startsWith("/api/lab/")) {
    const requestHeaders = new Headers(req.headers);
    if (parsed.authToken) requestHeaders.set("x-auth-token", parsed.authToken as string);
    requestHeaders.set("x-request-id", crypto.randomUUID());
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // WordPress 브리지 라우트는 라우트 내부 HMAC 검증으로 보호
  if (isWordPressHmacBridgeRoute(pathname)) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", crypto.randomUUID());
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // **마케팅 운영 API 인증 헤더 보강**
  // Meta lifecycle 콜백은 세션 없이 수신하고 각 route가 signed_request HMAC을 검증한다.
  if (isPublicMarketingProviderCallback(req)) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", crypto.randomUUID());
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Tutors 공개 갤러리 읽기는 세션 없이 통과시킨다. 응답은 공개 템플릿의 표시용 필드로 한정된다.
  if (isPublicTutorsRead(req)) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", crypto.randomUUID());
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // WordPress publish hook은 라우트 내부 HMAC 검증으로 보호하므로 세션 인증을 강제하지 않는다.
  if (pathname.startsWith("/api/marketing/content-queue/from-wp-hook")) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", crypto.randomUUID());
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith("/api/marketing/")) {
    const hasWp = !!parsed.authToken;
    const hasNa = hasNextAuthSession(parsed);

    const requestHeaders = new Headers(req.headers);
    if (hasWp) requestHeaders.set("x-auth-token", parsed.authToken as string);
    requestHeaders.set("x-request-id", crypto.randomUUID());

    if (hasWp || hasNa) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // Canonical Assets Studio surface는 로그인한 사용자만 접근할 수 있게 한다.
  // administrator 권한 판정은 각 서버 API의 requireAdmin이 담당한다.
  if (pathname === "/assets-studio" || pathname.startsWith("/assets-studio/")) {
    const hasWpToken = !!parsed.authToken;
    const hasNextAuth = hasNextAuthSession(parsed);
    if (!hasWpToken && !hasNextAuth) return NextResponse.redirect(historyPageRedirect(req));
    return NextResponse.next();
  }

  // **유니버스 관리 페이지에 대한 권한 체크**
  if (pathname.startsWith("/admin")) {
    // 쿠키가 아예 없으면 바로 로그인으로
    if (!cookiesHeader) {
      const url = historyPageRedirect(req);
      return NextResponse.redirect(url);
    }

    const hasWpToken = !!parsed.authToken;
    const hasNextAuth = hasNextAuthSession(parsed);

    if (!hasWpToken && !hasNextAuth) {
      const url = historyPageRedirect(req);
      return NextResponse.redirect(url);
    }

    // 디바이스/OS/언어 세션 쿠키만 세팅 후 즉시 next()
    const ua = req.headers.get("user-agent") || "";
    const deviceType = /Mobi|Android/i.test(ua) ? "mobile" : "desktop";
    const os = /Windows/i.test(ua) ? "windows" : /Macintosh/i.test(ua) ? "mac" : /Linux/i.test(ua) ? "linux" : "";
    const resp = NextResponse.next();
    resp.cookies.set(COOKIE_CONFIG.DEVICE_TYPE.name, deviceType);
    resp.cookies.set(COOKIE_CONFIG.OS.name, os);
    resp.cookies.set(COOKIE_CONFIG.LANGUAGE.name, detectedLanguage);
    return resp;
  }

  // **미니앱 API 인증 헤더 보강 (WP authToken / NextAuth 세션 병행 지원)**
  if (pathname.startsWith("/api/mini-apps/")) {
    const hasWp = !!parsed.authToken;
    const hasNa = hasNextAuthSession(parsed);

    const requestHeaders = new Headers(req.headers);
    if (hasWp) requestHeaders.set("x-auth-token", parsed.authToken as string);
    requestHeaders.set("x-request-id", crypto.randomUUID());

    if (hasWp || hasNa) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // **user API / admin API 인증**
  if (
    pathname === "/api/account" ||
    pathname.startsWith("/api/account/") ||
    pathname.startsWith("/api/user") ||
    pathname === "/api/friends" ||
    pathname.startsWith("/api/friends/") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/tutors") ||
    pathname.startsWith("/api/persona") ||
    pathname.startsWith("/api/thirdparty") ||
    pathname.startsWith("/api/game") ||
    pathname.startsWith("/api/speech") ||
    pathname.startsWith("/api/payments") ||
    pathname.startsWith("/api/private") ||
    pathname === "/api/get-documents-data"
  ) {
    const hasWp = !!parsed.authToken;
    const hasNa = hasNextAuthSession(parsed);

    const requestHeaders = new Headers(req.headers);
    if (hasWp) requestHeaders.set("x-auth-token", parsed.authToken as string);
    requestHeaders.set("x-request-id", crypto.randomUUID());

    if (hasWp || hasNa) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 그 외 매치된 경로는 그대로 통과
  return NextResponse.next();
}

// 보호할 경로 설정
export const config = {
  matcher: [
    // 인증이 필요한 API 라우트들
    "/api/ai/:path*",
    "/api/auth/callback/:path*",
    "/api/universe/:path*",
    "/api/commerce/:path*",
    "/api/conversations/:path*",
    "/api/game/:path*",
    "/api/lab/:path*",
    "/api/tutors/:path*",
    "/api/persona/:path*",
    "/api/account/:path*",
    "/api/user/:path*",
    "/api/friends/:path*",
    "/api/admin/:path*",
    "/api/thirdparty/:path*",
    "/api/speech/:path*",
    "/api/payments/:path*",
    "/api/catalog/:path*",
    "/api/upload/:path*",
    "/api/marketing/:path*",
    "/api/internal/mail/send",
    "/api/mini-apps/:path*",
    "/api/private/:path*",
    "/api/get-documents-data",
    "/store/:path*",
    "/shop/:path*",

    // 인증이 필요한 보호된 페이지들
    "/admin/:path*",
    "/assets-studio",
    "/assets-studio/:path*",

    // 로그인, 정적 파일, API를 제외한 모든 경로에 인증 적용
    // "/((?!_next|api|login|favicon.ico).*)",

    // _next, public, login, favicon.ico를 제외한 모든 경로에 인증 적용
    // "/((?!_next|api/(?!ai)|login|public|favicon.ico).*)",
  ],
};

function detectLanguage(acceptLanguage: string): LanguageType {
  // 빈 문자열이면 기본값 반환
  if (!acceptLanguage) return "en";

  // 언어 우선순위 파싱 (예: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7)
  const languages = acceptLanguage
    .split(",")
    .map((lang) => {
      const [language, quality = "q=1.0"] = lang.trim().split(";");
      const q = parseFloat(quality.split("=")[1]) || 0;
      return { language: language.substring(0, 2).toLowerCase(), q };
    })
    .sort((a, b) => b.q - a.q);

  // 지원되는 언어와 매칭
  const supported: LanguageType[] = ["ko", "en"];
  const matched = languages.find((lang) => supported.includes(lang.language as LanguageType));

  return matched ? (matched.language as LanguageType) : "en";
}
