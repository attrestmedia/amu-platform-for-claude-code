import "server-only";
import { NextResponse } from "next/server";
import { logger } from "utils/log";
import { statusMap } from "consts/ai";
import { toErrorLike } from "utils/common";
import { applyRateLimitHeaders, type RateLimitResultLike } from "./rateLimit";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process buildErrorResponse 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain api-middleware
 * @scope global
 */

// throw된 에러를 {message, errorCode, status} 형태로 정규화
function normalizeThrown(err: unknown): { message: string; errorCode?: string; status?: number } {
  if (err instanceof Error) {
    const meta = toErrorLike(err);
    return {
      message: err.message || "서비스 처리 중 오류가 발생했습니다.",
      errorCode: String(meta.errorCode || meta.code || "UNKNOWN_ERROR"),
      status: typeof meta.status === "number" ? meta.status : undefined,
    };
  }
  if (typeof err === "string") return { message: err, errorCode: "UNKNOWN_ERROR" };
  if (err && typeof err === "object") {
    const meta = toErrorLike(err);
    const message =
      typeof meta.message === "string" && meta.message ? meta.message : "서비스 처리 중 오류가 발생했습니다.";
    const errorCode = String(meta.errorCode || meta.code || "UNKNOWN_ERROR");
    const status = typeof meta.status === "number" ? meta.status : undefined;
    return { message, errorCode, status };
  }
  return { message: "서비스 처리 중 오류가 발생했습니다.", errorCode: "UNKNOWN_ERROR" };
}

export function buildErrorResponse(params: {
  endpoint: string;
  error: unknown;
  rateLimitResult?: RateLimitResultLike | null;
  guestId?: string | null;
}) {
  const { endpoint, error, rateLimitResult, guestId } = params;

  logger.error(`${endpoint} API 에러:`, error);

  const norm = normalizeThrown(error);
  const code = norm.errorCode || "UNKNOWN_ERROR";
  const status = typeof norm.status === "number" ? norm.status : (statusMap[String(code)] ?? 500);

  const message =
    status >= 500 && process.env.NODE_ENV === "production"
      ? "서비스 처리 중 오류가 발생했습니다."
      : norm.message || "서비스 처리 중 오류가 발생했습니다.";

  const res = NextResponse.json({ error: message, errorCode: code }, { status });
  const withRl = rateLimitResult ? applyRateLimitHeaders(res, rateLimitResult) : res;

  if (guestId) withRl.headers.set("x-guest-id", guestId);
  return withRl;
}
