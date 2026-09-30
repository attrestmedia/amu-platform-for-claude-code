import { Schema, type Document, type Model, type FilterQuery, type UpdateQuery, type QueryOptions } from "mongoose";
import { getModel } from "libs/database/modelCache";
import { redisCache } from "libs/cache/redisCacheService";
import { MONGODB_USERS_URL } from "consts/env/server";
import { RATELIMIT_FALLBACK } from "consts/env/server";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(key, count, expireAt, index, expireAt, inc) 및 인덱스/기본값 선언
 * @domain auth
 * @scope global
 */

interface IRateLimit extends Document {
  key: string; // userId:endpoint 형식의 키
  count: number; // 요청 횟수
  expireAt: Date; // TTL을 위한 만료 시간
}

// Rate Limit 스키마 정의 (MongoDB 폴백용)
const RateLimitSchema = new Schema<IRateLimit>({
  key: {
    type: String,
    required: true,
    index: true,
  },
  count: {
    type: Number,
    default: 1,
  },
  // 만료 시간 필드 - MongoDB TTL 인덱스 사용
  expireAt: {
    type: Date,
    default: () => new Date(Date.now() + 60000), // 1분 후 만료
    index: { expires: 0 },
  },
});

// 복합 유니크 인덱스
RateLimitSchema.index({ key: 1, expireAt: 1 }, { unique: true });

// 모델 가져오기 함수
export async function getRateLimitModel(): Promise<Model<IRateLimit>> {
  return getModel<IRateLimit>(MONGODB_USERS_URL || "", "RateLimit", RateLimitSchema);
}

// Redis 기반 속도 제한 인터페이스
interface RedisRateLimitOptions {
  maxRequests: number;
  windowMs: number; // 시간 윈도우 (밀리초)
  keyPrefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: Date;
  ttl: number;
}

// Redis 기반 속도 제한 클래스
export class RedisRateLimit {
  private options: Required<RedisRateLimitOptions>;

  constructor(options: RedisRateLimitOptions) {
    this.options = {
      keyPrefix: "ratelimit",
      ...options,
    };
  }

  /**
   * Redis 기반 속도 제한 확인 및 증가
   */
  async checkAndIncrement(identifier: string): Promise<RateLimitResult> {
    const key = `${this.options.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = Math.floor(now / this.options.windowMs) * this.options.windowMs;
    const resetAt = new Date(windowStart + this.options.windowMs);

    try {
      // Redis에서 현재 카운트 가져오기
      const currentCount = (await redisCache.get<number>(key)) || 0;

      // 카운트 증가
      const newCount = currentCount + 1;

      // TTL 계산 (윈도우 끝까지)
      const ttl = Math.ceil((resetAt.getTime() - now) / 1000);

      // Redis에 새 카운트 저장
      await redisCache.set(key, newCount, ttl);

      const remaining = Math.max(0, this.options.maxRequests - newCount);
      const allowed = newCount <= this.options.maxRequests;

      if (!allowed) {
        logger.warn(`Redis 속도 제한 초과: ${identifier}, 제한: ${this.options.maxRequests}, 현재: ${newCount}`);
      }

      return {
        allowed,
        count: newCount,
        remaining,
        resetAt,
        ttl,
      };
    } catch (error) {
      logger.error(`Redis 속도 제한 오류: ${identifier}`, error);

      // 폴백 전략을 환경변수로 제어 (기본 allow = 무중단)
      const fallback = RATELIMIT_FALLBACK.toLowerCase();

      if (fallback !== "mongo") {
        // fail-open: DB 대기열 고갈 방지, 요청은 통과
        const nowMs = Date.now();
        const ttl = Math.ceil((resetAt.getTime() - nowMs) / 1000);
        return {
          allowed: true,
          count: 0,
          remaining: this.options.maxRequests,
          resetAt,
          ttl,
        };
      }

      // 필요 시에만 Mongo 폴백 사용
      return await this.mongodbFallback(identifier, resetAt);
    }
  }

  /**
   * MongoDB 폴백 속도 제한
   */
  private async mongodbFallback(identifier: string, resetAt: Date): Promise<RateLimitResult> {
    try {
      logger.info(`MongoDB 폴백 사용: ${identifier}`);

      const RateLimitModel = await getRateLimitModel();
      const now = new Date();

      const result = await RateLimitModel.findOneAndUpdate(
        {
          key: identifier,
          expireAt: { $gt: now },
        },
        {
          $inc: { count: 1 },
          $setOnInsert: { expireAt: resetAt },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );

      const remaining = Math.max(0, this.options.maxRequests - result.count);
      const allowed = result.count <= this.options.maxRequests;

      return {
        allowed,
        count: result.count,
        remaining,
        resetAt: result.expireAt,
        ttl: Math.ceil((result.expireAt.getTime() - now.getTime()) / 1000),
      };
    } catch (error) {
      logger.error(`MongoDB 폴백 실패: ${identifier}`, error);

      // 완전 실패 시 허용 (서비스 중단 방지)
      return {
        allowed: true,
        count: 0,
        remaining: this.options.maxRequests,
        resetAt,
        ttl: Math.ceil((resetAt.getTime() - Date.now()) / 1000),
      };
    }
  }

  /**
   * 현재 상태 확인 (카운트 증가 없이)
   */
  async getStatus(identifier: string): Promise<RateLimitResult> {
    const key = `${this.options.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = Math.floor(now / this.options.windowMs) * this.options.windowMs;
    const resetAt = new Date(windowStart + this.options.windowMs);

    try {
      const currentCount = (await redisCache.get<number>(key)) || 0;
      const remaining = Math.max(0, this.options.maxRequests - currentCount);
      const ttl = Math.ceil((resetAt.getTime() - now) / 1000);

      return {
        allowed: currentCount < this.options.maxRequests,
        count: currentCount,
        remaining,
        resetAt,
        ttl,
      };
    } catch (error) {
      logger.error(`속도 제한 상태 확인 오류: ${identifier}`, error);

      return {
        allowed: true,
        count: 0,
        remaining: this.options.maxRequests,
        resetAt,
        ttl: Math.ceil((resetAt.getTime() - now) / 1000),
      };
    }
  }

  /**
   * 특정 식별자의 제한 초기화
   */
  async reset(identifier: string): Promise<boolean> {
    const key = `${this.options.keyPrefix}:${identifier}`;

    try {
      await redisCache.del(key);
      logger.info(`속도 제한 초기화: ${identifier}`);
      return true;
    } catch (error) {
      logger.error(`속도 제한 초기화 실패: ${identifier}`, error);
      return false;
    }
  }

  /**
   * 패턴으로 여러 제한 초기화
   */
  async resetByPattern(pattern: string): Promise<number> {
    const searchPattern = `${this.options.keyPrefix}:${pattern}`;

    try {
      const deletedCount = await redisCache.delByPattern(searchPattern);
      logger.info(`패턴 속도 제한 초기화: ${pattern}, 삭제된 수: ${deletedCount}`);
      return deletedCount;
    } catch (error) {
      logger.error(`패턴 속도 제한 초기화 실패: ${pattern}`, error);
      return 0;
    }
  }
}

// 미리 정의된 속도 제한 인스턴스들
export const RateLimiters = {
  // API 호출 제한 (분당)
  api: new RedisRateLimit({
    maxRequests: 60,
    windowMs: 60 * 1000, // 1분
    keyPrefix: "ratelimit:api",
  }),

  // 인증 시도 제한 (시간당)
  auth: new RedisRateLimit({
    maxRequests: 5,
    windowMs: 60 * 60 * 1000, // 1시간
    keyPrefix: "ratelimit:auth",
  }),

  // 채팅 메시지 제한 (분당)
  chat: new RedisRateLimit({
    maxRequests: 30,
    windowMs: 60 * 1000, // 1분
    keyPrefix: "ratelimit:chat",
  }),

  // 파일 업로드 제한 (시간당)
  upload: new RedisRateLimit({
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1시간
    keyPrefix: "ratelimit:upload",
  }),
} as const;

// 백워드 호환성을 위한 간편 접근자 (기존 코드와 호환)
export const RateLimit = {
  async findOneAndUpdate(
    filter: FilterQuery<IRateLimit>,
    update?: UpdateQuery<IRateLimit>,
    options?: QueryOptions<IRateLimit>,
  ) {
    const model = await getRateLimitModel();
    return model.findOneAndUpdate(filter, update ?? {}, options);
  },
};

// 유틸리티 함수: 사용자별 속도 제한 확인
export async function checkUserRateLimit(
  userId: string,
  endpoint: string,
  maxRequests: number = 60,
  windowMs: number = 60 * 1000,
): Promise<RateLimitResult> {
  const rateLimiter = new RedisRateLimit({
    maxRequests,
    windowMs,
    keyPrefix: `ratelimit:user:${userId}`,
  });

  return await rateLimiter.checkAndIncrement(endpoint);
}

// 유틸리티 함수: IP별 속도 제한 확인
export async function checkIpRateLimit(
  ip: string,
  maxRequests: number = 100,
  windowMs: number = 60 * 1000,
): Promise<RateLimitResult> {
  const rateLimiter = new RedisRateLimit({
    maxRequests,
    windowMs,
    keyPrefix: "ratelimit:ip",
  });

  return await rateLimiter.checkAndIncrement(ip);
}

// 유틸리티 함수: 글로벌 속도 제한 확인
export async function checkGlobalRateLimit(
  identifier: string,
  maxRequests: number = 1000,
  windowMs: number = 60 * 1000,
): Promise<RateLimitResult> {
  const rateLimiter = new RedisRateLimit({
    maxRequests,
    windowMs,
    keyPrefix: "ratelimit:global",
  });

  return await rateLimiter.checkAndIncrement(identifier);
}
