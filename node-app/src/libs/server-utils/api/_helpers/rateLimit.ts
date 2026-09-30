import "server-only";
import { NextResponse } from "next/server";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process applyRateLimitHeaders 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain rate-limit
 * @scope global
 */

// 호출부(checkRateLimit 등)의 RateLimitResult를 구조적 호환 형태로 받기 위한 로컬 타입
export type RateLimitResultLike = {
  allowed?: boolean;
  limit?: number;
  current?: number;
  remaining?: number;
  resetAt?: Date | number | string | null;
};

function toResetAtSec(resetAt: unknown) {
  if (resetAt instanceof Date) return Math.floor(resetAt.getTime() / 1000);
  const n = Number(resetAt);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

export function applyRateLimitHeaders(res: NextResponse, rl: RateLimitResultLike | null | undefined) {
  try {
    const resetAtSec = toResetAtSec(rl?.resetAt);
    res.headers.set("X-RateLimit-Limit", String(rl?.limit ?? ""));
    res.headers.set("X-RateLimit-Remaining", String(rl?.remaining ?? ""));
    res.headers.set("X-RateLimit-Reset", String(resetAtSec || ""));
  } catch {}
  return res;
}

export function jsonWithRateLimit(
  body: unknown,
  init: ResponseInit | undefined,
  rl: RateLimitResultLike | null | undefined,
) {
  const res = NextResponse.json(body, init);
  return applyRateLimitHeaders(res, rl);
}

export function nextWithRateLimit(res: NextResponse, rl: RateLimitResultLike | null | undefined) {
  return applyRateLimitHeaders(res, rl);
}

export function rateLimitExceededResponse(rl: RateLimitResultLike | null | undefined) {
  const resetAtSec = toResetAtSec(rl?.resetAt);
  const nowSec = Math.floor(Date.now() / 1000);
  const retryAfter = Math.max(1, resetAtSec ? resetAtSec - nowSec : 60);

  return NextResponse.json(
    {
      error: "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
      errorCode: "RATE_LIMIT_EXCEEDED",
      limit: rl?.limit,
      current: rl?.current,
      remaining: 0,
      resetAt: rl?.resetAt,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(rl?.limit ?? ""),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetAtSec || ""),
      },
    },
  );
}
