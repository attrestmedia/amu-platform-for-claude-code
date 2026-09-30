import "server-only";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { API_RATE_LIMIT } from "consts/auth";
import { wpMeUri } from "consts/env/runtime";
import type { UserAccountType } from "consts/auth";
import { getRateLimitModel } from "models/auth";
import { logger } from "utils/log";
import type { IUpdateUserData } from "types/user";
import { redisCache } from "libs/cache/redisCacheService";
import { getUserAccountType } from "./userRoleUtils";
import { authOptions } from "src/auth";
import { hashToken } from "../secure/secureTokenUtils";
import CacheKeyManager from "libs/cache/cacheKeyManager";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process verifyAuthToken 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain auth
 * @scope global
 */

// 캐시 TTL 설정 (초 단위)
const CACHE_TTL = {
  TOKEN: CacheKeyManager.ttl.AUTH_TOKEN,
  BLACKLIST: CacheKeyManager.ttl.AUTH_BLACKLIST,
  RATE_LIMIT: CacheKeyManager.ttl.RATE_LIMIT,
} as const;

const RATE_LIMIT_FAIL_CLOSED_ENDPOINTS = String(process.env.RATE_LIMIT_FAIL_CLOSED_ENDPOINTS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function isFailClosedEndpoint(endpoint: string) {
  return RATE_LIMIT_FAIL_CLOSED_ENDPOINTS.some(
    (prefix) => endpoint === prefix || endpoint.startsWith(`${prefix}/`),
  );
}

// 속도 제한 결과 타입 정의
interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetAt: Date;
  error?: string;
}

// 토큰 캐시 데이터 타입
interface TokenCacheData {
  userData: WpUserData;
  expiresAt: number;
  lastVerified: number;
}

type WpUserData = {
  ID: string;
  user_email?: string;
  user_nicename?: string;
  [key: string]: unknown;
};

type VerifyAuthResult =
  | { verified: true; user: WpUserData }
  | { verified: false; error: string };

// Redis 기반 인증 토큰 검증 함수
export async function verifyAuthToken(req: NextRequest): Promise<VerifyAuthResult> {
  try {
    // 미들웨어에서 전달된 토큰 가져오기
    const authToken = req.headers.get("x-auth-token");
    if (!authToken) {
      logger.warn("인증 토큰 없음", {
        ip: getClientIp(req),
        userAgent: req.headers.get("user-agent")?.substring(0, 100),
      });
      return { verified: false, error: "인증 토큰이 없습니다" };
    }

    // 1. 토큰 형식 검증
    if (!isValidTokenFormat(authToken)) {
      logger.warn("유효하지 않은 토큰 형식", {
        ip: getClientIp(req),
        userAgent: req.headers.get("user-agent")?.substring(0, 100),
      });
      return { verified: false, error: "유효하지 않은 토큰 형식입니다" };
    }

    const tokenHash = hashToken(authToken);

    // 2. Redis 블랙리스트 확인
    const isBlacklisted = await redisCache.exists(CacheKeyManager.auth.blacklist(tokenHash));
    if (isBlacklisted) {
      logger.warn("블랙리스트된 토큰 사용 시도", {
        tokenHash,
        ip: getClientIp(req),
      });
      return { verified: false, error: "유효하지 않은 토큰입니다" };
    }

    // 3. Redis 캐시 확인
    const cached = await redisCache.get<TokenCacheData>(CacheKeyManager.auth.token(tokenHash));
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      // 캐시가 유효하지만 5분마다 재검증
      const shouldRevalidate = now - cached.lastVerified > 5 * 60 * 1000;

      if (!shouldRevalidate) {
        logger.debug("캐시된 토큰 사용", { userId: cached.userData.ID });
        return {
          verified: true,
          user: cached.userData,
        };
      }
    }

    // 4. WordPress API 검증 (재시도 로직 포함)
    const verificationResult = await verifyWithWordPress(authToken, req);

    if (!verificationResult.success || !verificationResult.user) {
      // 실패한 토큰은 블랙리스트에 추가
      if (verificationResult.error?.includes("만료") || verificationResult.error?.includes("인증")) {
        await redisCache.set(
          CacheKeyManager.auth.blacklist(tokenHash),
          { reason: verificationResult.error, timestamp: now },
          CACHE_TTL.BLACKLIST,
        );
      }
      return { verified: false, error: verificationResult.error || "인증 검증 실패" };
    }

    const verifiedUser = verificationResult.user;

    // 5. 성공한 경우 Redis 캐시 업데이트
    const cacheData: TokenCacheData = {
      userData: verifiedUser,
      expiresAt: now + 15 * 60 * 1000, // 15분 캐시
      lastVerified: now,
    };

    await redisCache.set(CacheKeyManager.auth.token(tokenHash), cacheData, CACHE_TTL.TOKEN);

    // 요청 IP와 사용자 ID 기록 (기존 로직 유지)
    const requestId = req.headers.get("x-request-id");
    const clientIp = getClientIp(req);
    logger.info(`API 요청: ID=${requestId}, 사용자=${verifiedUser.ID}, IP=${clientIp}`);

    // 기존 반환 형식 유지
    return {
      verified: true,
      user: verifiedUser,
    };
  } catch (error) {
    logger.error("토큰 검증 오류:", error);
    return { verified: false, error: "인증 처리 중 오류가 발생했습니다" };
  }
}

// WordPress API 검증 함수 (재시도 로직과 타임아웃 포함)
async function verifyWithWordPress(
  token: string,
  req: NextRequest,
  retryCount = 0,
): Promise<{ success: boolean; user?: WpUserData; error?: string }> {
  const maxRetries = 2;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

    const response = await fetch(wpMeUri(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "AMU-API/1.0",
        "X-Request-ID": crypto.randomUUID(),
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = response.status === 401 ? "인증이 만료되었습니다" : "인증에 실패했습니다";
      logger.warn(`인증 검증 실패: ${error}`, { status: response.status });
      return { success: false, error };
    }

    // 사용자 정보 파싱
    const userData = await response.json();

    // 응답 데이터 검증
    if (!validateUserData(userData)) {
      throw new Error("유효하지 않은 사용자 데이터");
    }

    // 보안 로깅
    logger.info("인증 성공", {
      userId: userData.data.user.ID,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent")?.substring(0, 100),
    });

    return { success: true, user: userData.data.user };
  } catch (error: unknown) {
    const e = error as { name?: string; message?: string };
    // 재시도 로직
    if (retryCount < maxRetries && isRetryableError(error)) {
      logger.warn(`WordPress API 재시도 ${retryCount + 1}/${maxRetries}:`, e.message);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
      return verifyWithWordPress(token, req, retryCount + 1);
    }

    logger.error("WordPress API 검증 실패:", {
      error: e.message,
      retryCount,
      isTimeout: e.name === "AbortError",
    });

    return {
      success: false,
      error: "인증 서비스 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }
}

// Redis 기반 속도 제한 함수 - 성능 개선 및 기존 호환성 유지
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  userData: IUpdateUserData,
): Promise<RateLimitResult> {
  const cacheKey = CacheKeyManager.rateLimit.user(userId, endpoint);
  const now = new Date();
  const resetAt = new Date(Math.floor(now.getTime() / 60000) * 60000 + 60_000); // 다음 분 정각

  try {
    const ttl = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
    const newCount = await redisCache.incr(cacheKey, ttl);
    const allowed = newCount <= API_RATE_LIMIT;

    if (!allowed) {
      logger.warn(`속도 제한 초과: 엔드포인트: ${endpoint}, 제한: ${API_RATE_LIMIT}/분, 현재: ${newCount}`);
    }

    return {
      allowed,
      limit: API_RATE_LIMIT,
      current: newCount,
      remaining: Math.max(0, API_RATE_LIMIT - newCount),
      resetAt,
    };
  } catch (error) {
    logger.warn("Redis 속도 제한 실패, MongoDB 폴백:", error);
    return await checkRateLimitFallback(userId, endpoint, userData);
  }
}

// MongoDB 폴백 함수 (기존 로직 유지)
async function checkRateLimitFallback(
  userId: string,
  endpoint: string,
  userData: IUpdateUserData,
): Promise<RateLimitResult> {
  const userAccountType: UserAccountType = getUserAccountType(userData);
  const key = `${userId}:${endpoint}`;
  const now = new Date();
  const expiryTime = new Date(now.getTime() + 60000);

  try {
    const RateLimitModel = await getRateLimitModel();

    const result = await RateLimitModel.findOneAndUpdate(
      {
        key,
        expireAt: { $gt: now },
      },
      {
        $inc: { count: 1 },
        $setOnInsert: { expireAt: expiryTime },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    const allowed = result.count <= API_RATE_LIMIT;

    if (!allowed) {
      logger.warn(
        `속도 제한 초과 (MongoDB): ${userId}(${userAccountType}), 엔드포인트: ${endpoint}, 제한: ${API_RATE_LIMIT}/분`,
      );
    }

    return {
      allowed,
      limit: API_RATE_LIMIT,
      current: result.count,
      remaining: Math.max(0, API_RATE_LIMIT - result.count),
      resetAt: result.expireAt,
    };
  } catch (error) {
    logger.error(`속도 제한 확인 오류:`, error);

    if (isFailClosedEndpoint(endpoint)) {
      logger.error("비용/민감 엔드포인트 rate-limit fail-closed 차단", { endpoint, userId });
      return {
        allowed: false,
        limit: API_RATE_LIMIT,
        current: API_RATE_LIMIT,
        remaining: 0,
        resetAt: expiryTime,
        error: "속도 제한 확인이 불가하여 요청이 일시 차단되었습니다",
      };
    }

    return {
      allowed: true,
      limit: API_RATE_LIMIT,
      current: 0,
      remaining: API_RATE_LIMIT,
      resetAt: expiryTime,
      error: "속도 제한 확인 중 오류가 발생했습니다",
    };
  }
}

function isValidTokenFormat(token: string): boolean {
  // JWT 형식 기본 검증
  if (typeof token !== "string" || token.length < 10 || token.length > 2048) {
    return false;
  }

  // 기본적인 JWT 구조 확인 (header.payload.signature)
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  return true;
}

function isRetryableError(error: unknown): boolean {
  const e = error as { name?: string; message?: string };
  const message = String(e?.message || "");
  return (
    e?.name === "AbortError" ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("ECONNRESET")
  );
}

// 사용자 데이터 검증 강화
function validateUserData(userData: unknown): boolean {
  const root = userData as { data?: { user?: Record<string, unknown> } } | null | undefined;
  if (!root?.data?.user?.ID) {
    return false;
  }

  const user = root.data.user;

  // 필수 필드 검증
  const requiredFields = ["ID", "user_email", "user_nicename"];
  const missingFields = requiredFields.filter((field) => !user[field]);

  if (missingFields.length > 0) {
    logger.warn("사용자 데이터 필수 필드 누락:", missingFields);
    return false;
  }

  return true;
}

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown";
}

// Redis 기반 토큰 무효화 함수 (로그아웃 시 사용)
export async function invalidateToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);

  try {
    // 토큰 캐시 삭제
    await redisCache.del(CacheKeyManager.auth.token(tokenHash));

    // 블랙리스트에 추가
    await redisCache.set(
      CacheKeyManager.auth.blacklist(tokenHash),
      { reason: "로그아웃", timestamp: Date.now() },
      CACHE_TTL.BLACKLIST,
    );

    logger.info("토큰 무효화됨", { tokenHash });
  } catch (error) {
    logger.error("토큰 무효화 실패:", error);
  }
}

// 강제 캐시 정리 함수 (관리자용)
export async function forceCacheCleanup(): Promise<{ cleaned: number; remaining: number }> {
  try {
    // 토큰 캐시와 블랙리스트 패턴으로 삭제
    const tokenCleaned = await redisCache.delByPattern("auth:token:*");
    const blacklistCleaned = await redisCache.delByPattern("auth:blacklist:*");

    const cleaned = tokenCleaned + blacklistCleaned;

    logger.info(`강제 캐시 정리 완료: ${cleaned}개 항목 삭제`);

    return { cleaned, remaining: 0 };
  } catch (error) {
    logger.error("강제 캐시 정리 실패:", error);
    return { cleaned: 0, remaining: 0 };
  }
}

export async function getAuthUser(
  req: NextRequest,
): Promise<
  | { verified: true; source: "nextauth"; user: { ID: string; user_email?: string; display_name?: string } }
  | { verified: true; source: "wp"; user: WpUserData }
  | { verified: false; error: string }
> {
  // 1) NextAuth 세션 우선
  try {
    const session = (await getServerSession(authOptions)) as
      | { user?: { id?: string; email?: string | null; name?: string | null } }
      | null;
    if (session?.user?.id) {
      return {
        verified: true,
        source: "nextauth",
        user: {
          ID: session.user.id, // 정규화된 uid (jwt 콜백에서 지정)
          user_email: session.user.email || undefined,
          display_name: session.user.name || undefined,
        },
      };
    }
  } catch {
    // no-op: NextAuth 미사용/오류 시 WP 폴백 진행
  }

  // 2) WP 토큰 폴백
  const wp = await verifyAuthToken(req);
  if (wp.verified) return { verified: true, source: "wp", user: wp.user };
  return { verified: false, error: wp.error || "인증 실패" };
}
