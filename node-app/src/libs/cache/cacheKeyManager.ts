import { redisCache } from "./redisCacheService";
import { logger } from "utils/log";
import { hashToken } from "libs/server-utils/secure/secureTokenUtils";
import crypto from "crypto";

/**
 * @docHint
 * @purpose 캐시 클라이언트/유틸
 * @process 키 생성  get/set/del  TTL  태그 무효화 제공
 * @domain cache
 * @scope server
 */

// 캐시 키 네이밍 규칙에 따른 키 생성 유틸리티
export class CacheKeyManager {
  // 기본 TTL 설정 (초 단위)
  private static readonly DEFAULT_TTL = {
    AUTH_TOKEN: 15 * 60, // 15분
    AUTH_BLACKLIST: 24 * 60 * 60, // 24시간
    RATE_LIMIT: 60, // 1분
    SESSION: 30 * 60, // 30분
    POSTS: 60 * 60, // 1시간
    CATEGORIES: 60 * 60, // 1시간
    NPC_DATA: 60 * 60, // 1시간 (NPC 기본 데이터)
    NPC_CONVERSATION: 60 * 60, // 1시간 (대화 캐시)
    USER_DATA: 10 * 60, // 10분
    CONVERSATION: 60 * 60, // 1시간
    USER_PERSONAS: 5 * 60, // 5분
    PERSONAS: 5 * 60, // 5분
  } as const;

  // 인증 관련 캐시 키
  static auth = {
    token: (tokenHash: string) => `auth:token:${tokenHash}`,
    blacklist: (tokenHash: string) => `auth:blacklist:${tokenHash}`,
    user: (userId: string) => `auth:user:${userId}`,
    hashToken: (token: string): string => hashToken(token), // 토큰 해시 생성
  };

  // 속도 제한 관련 캐시 키
  static rateLimit = {
    user: (userId: string, endpoint: string) => `ratelimit:${userId}:${endpoint}`,
    ip: (ip: string, endpoint: string) => `ratelimit:ip:${ip}:${endpoint}`,
    global: (endpoint: string) => `ratelimit:global:${endpoint}`,

    // 패턴 매칭용
    userPattern: (userId: string) => `ratelimit:${userId}:*`,
    ipPattern: (ip: string) => `ratelimit:ip:${ip}:*`,
  };

  // 세션 관련 캐시 키
  static session = {
    data: (sessionId: string) => `session:${sessionId}`,
    user: (userId: string) => `session:user:${userId}`,
    temp: (tempId: string) => `session:temp:${tempId}`,
  };

  // 콘텐츠 캐시 키
  static content = {
    posts: (options: string) => `cache:posts:${options}`,
    categories: () => `cache:categories`,
    tags: (tagId: string) => `cache:tags:${tagId}`,

    randomPosts: (count: number, categoryId?: number) =>
      `cache:posts:random:${count}${categoryId ? `:cat:${categoryId}` : ""}`,

    latestPosts: (count: number, categoryId?: number) =>
      `cache:posts:latest:${count}${categoryId ? `:cat:${categoryId}` : ""}`,

    searchPosts: (query: string, page: number = 1, perPage: number = 10) =>
      `cache:posts:search:${Buffer.from(query).toString("base64")}:${page}:${perPage}`,

    postDetail: (postId: number) => `cache:post:detail:${postId}`,
    postBySlug: (slug: string) => `cache:post:slug:${slug}`,

    // 옵션 해시 생성
    hashOptions: (options: Record<string, unknown>): string => {
      const sorted = Object.keys(options)
        .sort()
        .reduce(
          (obj, key) => {
            obj[key] = options[key];
            return obj;
          },
          {} as Record<string, unknown>,
        );

      return crypto.createHash("md5").update(JSON.stringify(sorted)).digest("hex").substring(0, 8);
    },
  };

  // NPC 및 게임 관련 캐시 키
  static npc = {
    // 일일 대화 횟수 카운트 (자정에 리셋)
    dailyUsage: (userId: string, npcId: string) => `npc:daily:${userId}:${npcId}`,

    // 제한 후 대기 시간 (등급별 limitDuration 적용)
    cooldown: (userId: string, npcId: string) => `npc:cooldown:${userId}:${npcId}`,

    // NPC 기본 데이터
    data: (npcId: string) => `npc:data:${npcId}`,

    // 대화 캐시
    conversation: (userId: string, npcId: string) => `npc:conversation:${userId}:${npcId}`,

    // 사용자별 총 NPC 사용 현황
    userStats: (userId: string) => `npc:stats:${userId}`,

    // 패턴 매칭용
    userUsagePattern: (userId: string) => `npc:*:${userId}:*`,
    userDailyPattern: (userId: string) => `npc:daily:${userId}:*`,
    userCooldownPattern: (userId: string) => `npc:cooldown:${userId}:*`,
  };

  // 사용자 데이터 캐시 키
  static user = {
    profile: (userId: string) => `user:profile:${userId}`,
    stats: (userId: string) => `user:stats:${userId}`,
    preferences: (userId: string) => `user:preferences:${userId}`,
    permissions: (userId: string) => `user:permissions:${userId}`,
  };

  // 대화 관련 캐시 키
  static conversation = {
    // 키 구조를 명확하게 정의
    messages: (params: { userId: string; personaId: string; userPersonaId?: string }) => {
      const baseKey = `conversation:messages:${params.userId}:${params.personaId}`;
      return params.userPersonaId
        ? `${baseKey}:as:${params.userPersonaId}` // 'as'로 역할 명시
        : baseKey;
    },

    // 키 파싱 함수 추가
    parseMessageKey: (key: string) => {
      const parts = key.split(":");
      if (parts.length < 4) return null;

      return {
        userId: parts[2],
        personaId: parts[3],
        userPersonaId: parts[5] || undefined, // 'as' 다음 값
      };
    },
  };

  // 캐시 작업 헬퍼 메서드들
  static helpers = {
    // 여러 키를 한 번에 삭제
    async deleteMultiple(keys: string[]): Promise<number> {
      if (keys.length === 0) return 0;

      try {
        const result = await redisCache.del(keys);
        logger.info(`캐시 키 일괄 삭제: ${keys.length}개 중 ${result}개 삭제됨`);
        return result;
      } catch (error) {
        logger.error("캐시 키 일괄 삭제 실패:", error);
        return 0;
      }
    },

    // 패턴으로 키 삭제
    async deleteByPattern(pattern: string): Promise<number> {
      try {
        // redisCacheService 메서드 활용
        const result = await redisCache.delByPattern(pattern);
        logger.info(`패턴 캐시 삭제: ${pattern}, ${result}개 삭제됨`);
        return result;
      } catch (error) {
        logger.error(`패턴 캐시 삭제 실패 (${pattern}):`, error);
        return 0;
      }
    },

    // 사용자별 모든 캐시 삭제
    async deleteUserCache(userId: string): Promise<number> {
      const patterns = [
        CacheKeyManager.auth.user(userId),
        CacheKeyManager.rateLimit.userPattern(userId),
        CacheKeyManager.session.user(userId),
        CacheKeyManager.npc.userUsagePattern(userId), // 모든 NPC 관련 캐시
        `user:*:${userId}`,
        `conversation:*:${userId}:*`,
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const deleted = await this.deleteByPattern(pattern);
        totalDeleted += deleted;
      }

      logger.info(`사용자 캐시 전체 삭제: ${userId}, 총 ${totalDeleted}개 삭제됨`);
      return totalDeleted;
    },

    // 만료된 캐시 정리 (Redis는 자동 만료되지만 수동 정리용)
    async cleanupExpired(): Promise<number> {
      // Redis TTL 기능을 사용하므로 특별한 정리 불필요
      // 하지만 필요시 특정 패턴의 TTL을 확인하여 정리 가능
      logger.info("만료된 캐시 정리 완료 (Redis 자동 처리)");
      return 0;
    },

    // 캐시 통계 조회
    async getStats(): Promise<{
      auth: number;
      rateLimit: number;
      session: number;
      content: number;
      npc: {
        daily: number;
        cooldown: number;
        conversation: number;
        data: number;
        total: number;
      };
      user: number;
      conversation: number;
      total: number;
    }> {
      try {
        const patterns = {
          auth: "auth:*",
          rateLimit: "ratelimit:*",
          session: "session:*",
          content: "cache:*",
          npcDaily: "npc:daily:*",
          npcCooldown: "npc:cooldown:*",
          npcConversation: "npc:conversation:*",
          npcData: "npc:data:*",
          user: "user:*",
          conversation: "conversation:*",
        };

        // SCAN 기반 카운트 사용
        const stats: Record<string, number> = {};

        for (const [category, pattern] of Object.entries(patterns)) {
          try {
            stats[category] = await redisCache.countByPattern(pattern);
          } catch (error) {
            logger.warn(`패턴 카운트 실패 (${category}): ${pattern}`, error);
            stats[category] = 0;
          }
        }

        // NPC 통계 집계
        const npcTotal = stats.npcDaily + stats.npcCooldown + stats.npcConversation + stats.npcData;

        // 전체 합계 계산 (숫자 타입 안전성 보장)
        const totalCount = [
          stats.auth,
          stats.rateLimit,
          stats.session,
          stats.content,
          stats.npcDaily,
          stats.npcCooldown,
          stats.npcConversation,
          stats.npcData,
          stats.user,
          stats.conversation,
        ].reduce((sum: number, val: number) => sum + (val || 0), 0);

        return {
          auth: stats.auth,
          rateLimit: stats.rateLimit,
          session: stats.session,
          content: stats.content,
          npc: {
            daily: stats.npcDaily,
            cooldown: stats.npcCooldown,
            conversation: stats.npcConversation,
            data: stats.npcData,
            total: npcTotal,
          },
          user: stats.user,
          conversation: stats.conversation,
          total: totalCount,
        };
      } catch (error) {
        logger.error("캐시 통계 조회 실패:", error);
        return {
          auth: 0,
          rateLimit: 0,
          session: 0,
          content: 0,
          npc: {
            daily: 0,
            cooldown: 0,
            conversation: 0,
            data: 0,
            total: 0,
          },
          user: 0,
          conversation: 0,
          total: 0,
        };
      }
    },
  };

  // TTL 설정 헬퍼
  static ttl = {
    ...CacheKeyManager.DEFAULT_TTL,

    RANDOM_POSTS: 5 * 60, // 5분 (자주 변경되어야 함)
    LATEST_POSTS: 15 * 60, // 15분
    SEARCH_RESULTS: 30 * 60, // 30분
    POST_DETAIL: 60 * 60, // 1시간

    // 동적 TTL 계산 (사용자 등급별, 콘텐츠 타입별)
    dynamic: {
      user: (accountType: string): number => {
        switch (accountType) {
          case "premium":
            return CacheKeyManager.DEFAULT_TTL.USER_DATA * 2;
          case "pro":
            return CacheKeyManager.DEFAULT_TTL.USER_DATA * 1.5;
          default:
            return CacheKeyManager.DEFAULT_TTL.USER_DATA;
        }
      },

      content: (contentType: string): number => {
        switch (contentType) {
          case "static":
            return 24 * 60 * 60; // 24시간
          case "dynamic":
            return 5 * 60; // 5분
          default:
            return CacheKeyManager.DEFAULT_TTL.POSTS;
        }
      },

      search: (resultCount: number): number => {
        // 검색 결과가 많을수록 짧은 TTL
        if (resultCount > 100) return 10 * 60; // 10분
        if (resultCount > 50) return 20 * 60; // 20분
        return 30 * 60; // 30분
      },
    },

    // WordPress 전용 TTL 설정
    wp: {
      POSTS: 15 * 60, // 15분
      CATEGORIES: 60 * 60, // 1시간
      TAGS: 2 * 60 * 60, // 2시간
      RANDOM_POSTS: 5 * 60, // 5분 (자주 변경)
      LATEST_POSTS: 10 * 60, // 10분
      SEARCH_RESULTS: 30 * 60, // 30분
      POST_DETAIL: 60 * 60, // 1시간

      // 동적 TTL 계산
      dynamic: {
        /**
         * 검색 결과 TTL - 결과 수에 따라 조정
         */
        searchResults: (resultCount: number): number => {
          if (resultCount === 0) return 2 * 60; // 빈 결과는 2분
          if (resultCount > 100) return 10 * 60; // 많은 결과는 10분
          if (resultCount > 50) return 20 * 60; // 중간 결과는 20분
          return 30 * 60; // 적은 결과는 30분
        },

        /**
         * 카테고리별 포스트 TTL
         */
        categoryPosts: (categoryId?: number): number => {
          return categoryId ? 20 * 60 : 15 * 60; // 카테고리 필터링된 경우 더 길게
        },
      },
    },

    // 시간 계산 유틸리티
    utils: {
      // 다음 정각까지의 시간 (분 단위)
      untilNextHour: (): number => {
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        return Math.ceil((nextHour.getTime() - now.getTime()) / 1000);
      },

      // 특정 시간(분) 후까지의 TTL
      inMinutes: (minutes: number): number => {
        return minutes * 60;
      },

      // 특정 시간(시) 후까지의 TTL
      inHours: (hours: number): number => {
        return hours * 60 * 60;
      },
    },
  };

  // 유저 페르소나 캐시 키
  static userPersonas = {
    // 유저의 특정 유니버스 userPersonas
    byUniverse: (userId: string, universe: string) => `user:personas:${userId}:${universe}`,

    // 유저의 모든 userPersonas
    allByUser: (userId: string) => `user:personas:${userId}:*`,

    // personas (처음 만난 캐릭터들)
    personasByUniverse: (userId: string, universe: string) => `user:first-personas:${userId}:${universe}`,

    // 패턴 매칭용
    userPattern: (userId: string) => `user:*personas:${userId}:*`,
  };

  static universe = {
    doc: (id: string) => `universe:doc:${id}`,
    details: (id: string) => `universe:details:${id}`,
    detailsNeg: (id: string) => `universe:details:neg:${id}`,

    // tags
    tag: (id: string) => `universe:${id}`,
    tagDetails: (id: string) => `universe:details:${id}`, // per-id 상세 태그
    tagDetailsAll: () => `universe:details`, // 모든 상세 공통 태그
    tagList: () => `universes:list`,
    tagOpenList: () => `universes:open`,

    listKey: (o: { enabledOnly: boolean; sortByOrder: boolean; forHome: boolean }) =>
      `universes:list:v1:enabled=${o.enabledOnly}:sort=${o.sortByOrder}:forHome=${o.forHome}`,
    openListKey: () => `universes:open-list:v1`,
  };

  static stage = {
    resolved: (uid: string, sid: string, sname: string, rqId = "", rqName = "") =>
      `stage:resolved:v3:${uid}:${sid}:${sname}:rq=${rqId}|${rqName}`,
    tagRequest: (rqId = "", rqName = "") => `stage-request:${rqId}:${rqName}`,
    tagStage: (sid: string, sname: string) => `stage:${sid}:${sname}`,
  };
}

export default CacheKeyManager;
