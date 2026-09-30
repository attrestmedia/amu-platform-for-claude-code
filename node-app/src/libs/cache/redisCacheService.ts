import { getRedisClient } from "./redisClient";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 캐시 클라이언트/유틸
 * @process 키 생성  get/set/del  TTL  태그 무효화 제공
 * @domain cache
 * @scope server
 */

export class RedisCacheService {
  private static readonly CONFIG = {
    MAX_VALUE_SIZE: parseInt(process.env.REDIS_MAX_VALUE_SIZE || "1048576", 10), // 1MB
  } as const;

  private static instance: RedisCacheService;

  private constructor() {}

  static getInstance(): RedisCacheService {
    if (!this.instance) {
      this.instance = new RedisCacheService();
    }
    return this.instance;
  }

  // 캐시 가져오기
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isValidKey(key)) return null;

      const client = await getRedisClient();
      const data = await client.get(key);

      if (!data) return null;

      return JSON.parse(data) as T;
    } catch (error) {
      logger.error(`Redis get 오류 (${key}):`, error);
      return null;
    }
  }

  // 키 유효성 검증
  private isValidKey(key: string): boolean {
    if (!key || typeof key !== "string") {
      logger.warn("Invalid cache key provided:", key);
      return false;
    }

    // 키 길이 제한 (Redis 권장사항)
    if (key.length > 512) {
      logger.warn(`캐시 키 길이 초과 (${key.length} chars): ${key.substring(0, 50)}...`);
      return false;
    }

    // 특수 문자 검증
    const invalidChars = /[\s\n\r\t]/;
    if (invalidChars.test(key)) {
      logger.warn(`캐시 키에 유효하지 않은 문자 포함: ${key}`);
      return false;
    }

    return true;
  }

  // 원자적 카운터 증가 (rate limit 등)
  // - INCR + (첫 증가 시) EXPIRE를 Lua로 원샷 처리
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    try {
      if (!this.isValidKey(key)) return 0;
      const client = await getRedisClient();

      const ttl = Number.isFinite(ttlSeconds) ? Math.floor(Number(ttlSeconds)) : 0;
      if (ttl > 0) {
        const script = `
          local c = redis.call("INCR", KEYS[1])
          if c == 1 then
            redis.call("EXPIRE", KEYS[1], ARGV[1])
          end
          return c
        `;
        const res: unknown = await client.eval(script, 1, key, String(ttl));
        const n = typeof res === "number" ? res : parseInt(String(res), 10);
        return Number.isFinite(n) ? n : 0;
      }

      const res: unknown = await client.incr(key);
      const n = typeof res === "number" ? res : parseInt(String(res), 10);
      return Number.isFinite(n) ? n : 0;
    } catch (error) {
      logger.error(`Redis incr 오류 (${key}):`, error);
      throw error;
    }
  }

  // 캐시 설정
  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    try {
      if (!this.isValidKey(key)) {
        logger.warn("Invalid cache key provided:", key);
        return false;
      }

      if (value === undefined) {
        logger.warn("Undefined value provided for cache key:", key);
        return false;
      }

      if (ttl !== undefined && (ttl < 0 || !Number.isInteger(ttl))) {
        logger.warn(`유효하지 않은 TTL 값: ${ttl}, 키: ${key}`);
        return false;
      }

      const client = await getRedisClient();
      let serialized: string;

      try {
        serialized = JSON.stringify(value);
      } catch (serializeError) {
        logger.error(`JSON 직렬화 실패 (${key}):`, serializeError);
        return false;
      }

      // 크기 체크
      const dataSize = Buffer.byteLength(serialized, "utf8");
      if (dataSize > RedisCacheService.CONFIG.MAX_VALUE_SIZE) {
        logger.warn(`캐시 데이터 크기 초과 (${key}): ${dataSize} bytes`);
        return false;
      }

      // 단순하게 Redis에 저장
      if (ttl && ttl > 0) {
        await client.set(key, serialized, "EX", ttl);
      } else {
        await client.set(key, serialized);
      }

      logger.debug(`캐시 저장 성공 (${key}): ${dataSize} bytes, TTL: ${ttl || "none"}`);
      return true;
    } catch (error) {
      logger.error(`Redis set 오류 (${key}):`, error);
      return false;
    }
  }

  // 캐시 삭제
  async del(key: string | string[]): Promise<number> {
    try {
      const client = await getRedisClient();
      return await client.del(...(Array.isArray(key) ? key : [key]));
    } catch (error) {
      logger.error(`Redis del 오류:`, error);
      return 0;
    }
  }

  // 패턴으로 키 삭제
  async delByPattern(pattern: string): Promise<number> {
    try {
      const client = await getRedisClient();
      let deletedCount = 0;
      let cursor = "0";

      do {
        // SCAN 명령어로 배치 단위로 처리
        const result = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          const batchDeleted = await client.del(...keys);
          deletedCount += batchDeleted;
        }
      } while (cursor !== "0");

      return deletedCount;
    } catch (error) {
      logger.error(`Redis delByPattern 오류 (${pattern}):`, error);
      return 0;
    }
  }

  // 패턴으로 키 개수 조회 (통계용)
  async countByPattern(pattern: string): Promise<number> {
    try {
      const client = await getRedisClient();
      let count = 0;
      let cursor = "0";

      do {
        const result = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = result[0];
        const keys = result[1];
        count += keys.length;
      } while (cursor !== "0");

      return count;
    } catch (error) {
      logger.error(`Redis countByPattern 오류 (${pattern}):`, error);
      return 0;
    }
  }

  // TTL 확인
  async ttl(key: string): Promise<number> {
    try {
      const client = await getRedisClient();
      return await client.ttl(key);
    } catch (error) {
      logger.error(`Redis ttl 오류 (${key}):`, error);
      return -1;
    }
  }

  // 캐시 존재 여부
  async exists(key: string): Promise<boolean> {
    try {
      const client = await getRedisClient();
      return (await client.exists(key)) === 1;
    } catch (error) {
      logger.error(`Redis exists 오류 (${key}):`, error);
      return false;
    }
  }

  // 태그를 사용한 캐시 무효화
  async setWithTags(key: string, value: unknown, ttl?: number, tags: string[] = []): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const pipeline = client.pipeline();

      // 직렬화 & 크기 체크
      let serialized: string;
      try {
        serialized = JSON.stringify(value);
      } catch (e) {
        logger.error(`태그 캐시 JSON 직렬화 실패 (${key}):`, e);
        return false;
      }
      const dataSize = Buffer.byteLength(serialized, "utf8");
      if (dataSize > RedisCacheService.CONFIG.MAX_VALUE_SIZE) {
        logger.warn(`태그 캐시 데이터 크기 초과 (${key}): ${dataSize} bytes`);
        return false;
      }

      // TTL 유효성 보정 (초 단위 정수, 0/음수면 미적용)
      const validTTL = Number.isInteger(ttl) && (ttl as number) > 0 ? (ttl as number) : undefined;

      // 데이터 저장 (EX 옵션으로 통일)
      if (validTTL) {
        pipeline.set(key, serialized, "EX", validTTL);
      } else {
        pipeline.set(key, serialized);
      }

      // 태그 처리 (태그 Set에 키 등록 + 태그 Set에도 TTL 부여)
      for (const tag of tags.filter(Boolean)) {
        const tagKey = `tag:${tag}`;
        pipeline.sadd(tagKey, key);
        if (validTTL) pipeline.expire(tagKey, validTTL);
      }

      const results = await pipeline.exec();
      // 파이프라인 중 에러가 하나라도 있으면 실패 처리
      if (results?.some(([err]) => err)) {
        logger.error(`태그 캐시 파이프라인 실패 (${key}):`, results);
        return false;
      }
      return true;
    } catch (error) {
      logger.error(`태그 캐시 설정 실패 (${key}):`, error);
      return false;
    }
  }

  // 태그 기반 무효화
  async invalidateByTag(tag: string): Promise<number> {
    try {
      const client = await getRedisClient();
      const tagKey = `tag:${tag}`;

      // 태그에 속한 모든 키 조회
      const keys = await client.smembers(tagKey);

      if (keys.length === 0) return 0;

      // 키들 삭제
      const pipeline = client.pipeline();
      keys.forEach((key) => pipeline.del(key));
      pipeline.del(tagKey); // 태그 키 삭제
      await pipeline.exec(); // 실제 삭제 실행
      return keys.length;
    } catch (error) {
      logger.error(`태그 캐시 무효화 실패 (${tag}):`, error);
      return 0;
    }
  }
}

export const redisCache = RedisCacheService.getInstance();
