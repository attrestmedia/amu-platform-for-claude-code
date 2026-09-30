import { NextRequest, NextResponse } from "next/server";
import fetchClient from "libs/api/fetchClient";
import { wpAuthUri } from "consts/env/runtime";
import { logger } from "utils/log";
import { serializeAuthTokenCookie, serializeSessionHintCookie } from "libs/server-utils/auth/authCookie";
import { extractWpJwtToken } from "libs/server-utils/auth/wpJwt";
import { toErrorLike, toUnknownRecord } from "utils/common";

type WpLoginPayload = {
  success?: unknown;
  error?: unknown;
  message?: unknown;
  jwt?: unknown;
  token?: unknown;
  data?: { jwt?: unknown; token?: unknown } & Record<string, unknown>;
} & Record<string, unknown>;

/**
 * @docHint
 * @purpose API 라우트(auth / login) 기능 요청 처리
 * @process POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain auth
 * @scope api
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    logger.log("로그인 요청값 체크:", {
      wpAuthUri: wpAuthUri(),
      email,
      password: password ? `***(${password.length})` : "",
    });

    // 입력값 체크: 누락이면 즉시 400
    if (!email || !password) {
      return NextResponse.json({ message: "이메일/비밀번호가 누락되었습니다." }, { status: 400 });
    }

    const response = await fetchClient.post(
      wpAuthUri(),
      { email, password },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10_000,
        credentials: "omit",
      },
    );

    const ct = response.headers?.get("content-type") || "";
    const data = response.data as WpLoginPayload | string | null | undefined;
    const isObj = !!data && typeof data === "object";

    logger.log("# login response => ", {
      status: response.status,
      success: isObj ? data?.success : undefined,
      contentType: ct,
      dataType: typeof data,
      hasToken: Boolean(isObj && (data?.data?.jwt || data?.data?.token || data?.jwt || data?.token)),
    });

    // WP 플러그인/구성에 따라 token 키가 달라질 수 있어 후보를 넓게 잡음
    const token = isObj ? extractWpJwtToken(data) : "";

    // WP가 명시적으로 실패를 줬는데도 200으로 내려오는 케이스 방어
    if (isObj && data?.success === false) {
      const msg = data?.error || data?.message || "로그인에 실패했습니다.";
      return NextResponse.json(
        { message: msg, details: data },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    // 200인데 jwt가 없음 → upstream 응답 형식/보안 플러그인 차단/HTML 반환 등
    if (!token) {
      const rawPreview = typeof data === "string" ? data.slice(0, 400) : null; // 너무 길면 잘라서
      return NextResponse.json(
        {
          message: "WP 인증 응답에서 JWT를 찾지 못했습니다.",
          details: {
            status: response.status,
            contentType: ct,
            dataType: typeof data,
            // 객체면 그대로 내려서 구조 확인, 문자열이면 미리보기만
            payload: isObj ? data : rawPreview,
          },
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const serializedCookie = serializeAuthTokenCookie(token);
    const serializedHintCookie = serializeSessionHintCookie();

    const loginResponse = new NextResponse(JSON.stringify({ message: "로그인 성공" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
    loginResponse.headers.append("Set-Cookie", serializedCookie);
    loginResponse.headers.append("Set-Cookie", serializedHintCookie);
    return loginResponse;
  } catch (error) {
    const errLike = toErrorLike(error);
    const responseLike = toUnknownRecord(errLike.response);
    const status = Number(responseLike.status) || 500;
    const payload = responseLike.data as { error?: unknown; message?: unknown } | undefined;
    const wpError =
      (payload && typeof payload.error === "string" && payload.error) ||
      (payload && typeof payload.message === "string" && payload.message) ||
      (typeof errLike.message === "string" ? errLike.message : "");

    logger.error("로그인 오류:", { status, payload });

    return new NextResponse(
      JSON.stringify({
        message: wpError || "로그인에 실패했습니다.",
        details: payload || null,
      }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  }
}
