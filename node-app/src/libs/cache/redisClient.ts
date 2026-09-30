import Redis from "ioredis";
import type { RedisOptions } from "ioredis";
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB } from "consts/env/server";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 캐시 클라이언트/유틸
 * @process 키 생성  get/set/del  TTL  태그 무효화 제공
 * @domain cache
 * @scope server
 */

// 연결 상태 인터페이스
interface RedisConnectionState {
  client: Redis | null;
  isConnecting: boolean;
  lastError: Error | null;
  retryCount: number;
  lastAttempt: number;
  nextRetryAt: number;
  isHealthy: boolean;
}

// 에러 타입 가드
interface RedisError extends Error {
  errorCode?: string;
  errno?: number;
  syscall?: string;
  address?: string;
  port?: number;
}

// 에러 타입 가드 함수
function isRedisError(error: Error): error is RedisError {
  return "code" in error;
}

// 네트워크 관련 에러인지 확인하는 함수
function isNetworkError(error: Error): boolean {
  if (!isRedisError(error)) return false;

  const networkErrorCodes = [
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ECONNABORTED",
  ];

  return networkErrorCodes.includes(error.errorCode || "");
}

// 전역 가드 키
const GLOBAL_KEYS = {
  HEALTH_STARTED: "__amu_redis_health_started__",
  SIG_BOUND: "__amu_redis_sig_bound__",
} as const;

// HMR 안전한 헬스체크 1회 시작
function startHealthCheckOnce() {
  const g = global as unknown as Record<string, unknown>;
  if (g[GLOBAL_KEYS.HEALTH_STARTED]) return;
  g[GLOBAL_KEYS.HEALTH_STARTED] = true;
  healthManager.startHealthCheck();
}

// HMR 안전한 종료 시그널 1회 바인딩
function bindProcessSignalsOnce() {
  const g = global as unknown as Record<string, unknown>;
  if (g[GLOBAL_KEYS.SIG_BOUND]) return;
  g[GLOBAL_KEYS.SIG_BOUND] = true;

  const graceful = async (signal: string) => {
    logger.info(`${signal} 수신, Redis 연결 정리 중...`);
    try {
      await closeRedisConnections();
      logger.info("Redis 연결 정리 완료");
      process.exit(0);
    } catch (error) {
      logger.error("Redis 연결 정리 중 오류:", error);
      process.exit(1);
    }
  };

  process.once("SIGINT", () => graceful("SIGINT"));
  process.once("SIGTERM", () => graceful("SIGTERM"));
  process.once("uncaughtException", (error) => {
    logger.error("처리되지 않은 예외:", error);
    graceful("uncaughtException");
  });
}

// 설정값
const MAX_RETRY_COUNT = 10;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const HEALTH_CHECK_INTERVAL = 30000;

// 연결 상태 초기화
const connectionState: RedisConnectionState = {
  client: null,
  isConnecting: false,
  lastError: null,
  retryCount: 0,
  lastAttempt: 0,
  nextRetryAt: 0,
  isHealthy: false,
};

// 동시 연결 시도 방지를 위한 Promise 캐시
const connectionPromises = new Map<string, Promise<Redis>>();

// Redis 연결 옵션
const redisOptions: RedisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  db: REDIS_DB,

  // 개선된 재시도 전략
  retryStrategy: (times: number) => {
    if (times > MAX_RETRY_COUNT) {
      logger.error(`Redis 재시도 횟수 초과: ${times}`);
      return null;
    }

    const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, times - 1), MAX_BACKOFF_MS);
    logger.warn(`Redis 재시도 #${times}, ${delay}ms 후 재시도`);
    return delay;
  },

  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  keepAlive: 30000,
  enableReadyCheck: true,
  family: 4,
};

/**
 * 백오프 지연 시간 계산
 */
function calculateBackoffDelay(retryCount: number): number {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
}

/**
 * 새로운 Redis 연결 생성
 */
async function createNewConnection(): Promise<Redis> {
  connectionState.isConnecting = true;
  connectionState.lastAttempt = Date.now();

  try {
    const client = new Redis(redisOptions);

    // 연결 성공 이벤트
    client.on("connect", () => {
      connectionState.isHealthy = true;
      connectionState.retryCount = 0; // 성공 시 카운터 리셋
      connectionState.lastError = null;
      logger.info("Redis 연결 성공", {
        host: redisOptions.host,
        port: redisOptions.port,
        db: redisOptions.db,
      });
    });

    // 에러 핸들링
    client.on("error", (err) => {
      connectionState.isHealthy = false;
      connectionState.lastError = err;
      connectionState.retryCount++;

      // 타입 안전한 에러 코드 체크
      const isNetworkIssue = isNetworkError(err);
      const errorCode = isRedisError(err) ? err.errorCode : "UNKNOWN";

      // 네트워크 관련 심각한 에러의 경우 연결 객체 정리
      if (isNetworkIssue) {
        connectionState.client = null;
        logger.error(`Redis 네트워크 에러 감지, 연결 객체 정리: ${errorCode}`);
      }

      const backoffDelay = calculateBackoffDelay(connectionState.retryCount);
      connectionState.nextRetryAt = Date.now() + backoffDelay;

      logger.error(`Redis 연결 오류 (${connectionState.retryCount}/${MAX_RETRY_COUNT}회):`, {
        error: err.message,
        errorCode: errorCode,
        isNetworkError: isNetworkIssue,
        nextRetryIn: Math.ceil(backoffDelay / 1000) + "초",
        retryCount: connectionState.retryCount,
      });
    });

    client.on("close", () => {
      connectionState.isHealthy = false;
      logger.warn("Redis 연결 종료");
    });

    client.on("reconnecting", (delay: number) => {
      logger.info(`Redis 재연결 시도... ${delay}ms 후`);
    });

    client.on("ready", () => {
      connectionState.isHealthy = true;
      logger.info("Redis 준비 완료");
    });

    // 연결 및 테스트
    await client.connect();
    await client.ping();

    connectionState.client = client;
    connectionState.isConnecting = false;

    return client;
  } catch (error) {
    connectionState.isConnecting = false;
    connectionState.lastError = error as Error;
    connectionState.retryCount++;

    // 백오프 지연 설정
    const backoffDelay = calculateBackoffDelay(connectionState.retryCount);
    connectionState.nextRetryAt = Date.now() + backoffDelay;

    logger.error("Redis 연결 생성 실패:", {
      error: error instanceof Error ? error.message : "Unknown error",
      retryCount: connectionState.retryCount,
      nextRetryIn: Math.ceil(backoffDelay / 1000) + "초",
    });

    throw new Error(`Redis 연결 실패: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * 진행 중인 연결을 기다림 (동시 연결 시도 방지)
 */
async function waitForConnection(): Promise<Redis> {
  const key = "main-connection";

  if (connectionPromises.has(key)) {
    logger.debug("이미 진행 중인 Redis 연결을 기다리는 중...");
    return await connectionPromises.get(key)!;
  }

  const connectionPromise = createNewConnection();
  connectionPromises.set(key, connectionPromise);

  try {
    const client = await connectionPromise;
    connectionPromises.delete(key);
    return client;
  } catch (error) {
    connectionPromises.delete(key);
    throw error;
  }
}

/**
 * Redis 클라이언트 획득 함수
 */
export async function getRedisClient(): Promise<Redis> {
  // 1. 기존 연결이 정상이면 그대로 반환
  if (connectionState.client && connectionState.isHealthy) {
    return connectionState.client;
  }

  // 2. 이미 연결 시도 중이면 대기
  if (connectionState.isConnecting) {
    return await waitForConnection();
  }

  // 3. 재시도 쿨다운 체크
  const now = Date.now();
  if (now < connectionState.nextRetryAt) {
    const waitTime = Math.ceil((connectionState.nextRetryAt - now) / 1000);
    throw new Error(`Redis 재연결 대기 중 (${waitTime}초 후 재시도 가능)`);
  }

  // 4. 최대 재시도 횟수 체크
  if (connectionState.retryCount >= MAX_RETRY_COUNT) {
    throw new Error(`Redis 연결 최대 재시도 횟수 초과 (${MAX_RETRY_COUNT}회)`);
  }

  // 5. 새 연결 시도
  return await waitForConnection();
}

/**
 * 헬스체크 매니저
 */
class RedisHealthManager {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isChecking = false;

  startHealthCheck(): void {
    if (this.healthCheckInterval) return;

    logger.info("Redis 헬스체크 시작");
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, HEALTH_CHECK_INTERVAL);
  }

  private async performHealthCheck(): Promise<void> {
    if (this.isChecking || !connectionState.client || !connectionState.isHealthy) {
      return;
    }

    this.isChecking = true;

    try {
      const start = Date.now();
      await connectionState.client.ping();
      const latency = Date.now() - start;

      if (latency > 5000) {
        logger.warn(`Redis 응답 지연: ${latency}ms`);
        connectionState.isHealthy = false;
      } else {
        logger.debug(`Redis 헬스체크 성공: ${latency}ms`);
      }
    } catch (error) {
      logger.error("Redis 헬스체크 실패:", error);
      connectionState.isHealthy = false;
      connectionState.lastError = error as Error;
    } finally {
      this.isChecking = false;
    }
  }

  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info("Redis 헬스체크 중지");
    }
  }
}

// 헬스체크 매니저 인스턴스
const healthManager = new RedisHealthManager();

/**
 * Pub/Sub용 클라이언트 - 동일한 전략 적용
 */
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

export async function getPubSubClients() {
  if (!pubClient || !subClient) {
    // 동일한 연결 관리 전략 적용
    pubClient = new Redis(redisOptions);
    subClient = new Redis(redisOptions);

    await Promise.all([pubClient.connect(), subClient.connect()]);
  }

  return { pubClient, subClient };
}

/**
 * 연결 상태 조회
 */
export function getConnectionStatus(): {
  isConnected: boolean;
  isHealthy: boolean;
  lastError?: string;
  retryCount: number;
  nextRetryAt?: Date;
  lastAttempt?: Date;
} {
  return {
    isConnected: !!connectionState.client,
    isHealthy: connectionState.isHealthy,
    lastError: connectionState.lastError?.message,
    retryCount: connectionState.retryCount,
    nextRetryAt: connectionState.nextRetryAt ? new Date(connectionState.nextRetryAt) : undefined,
    lastAttempt: connectionState.lastAttempt ? new Date(connectionState.lastAttempt) : undefined,
  };
}

/**
 * 관리자용 강제 재연결
 */
export async function forceReconnect(): Promise<void> {
  logger.info("Redis 강제 재연결 시작");

  try {
    if (connectionState.client) {
      await connectionState.client.quit();
    }
  } catch (error) {
    logger.warn("기존 Redis 연결 종료 중 오류:", error);
  }

  // 상태 초기화
  connectionState.client = null;
  connectionState.isConnecting = false;
  connectionState.isHealthy = false;
  connectionState.retryCount = 0;
  connectionState.nextRetryAt = 0;
  connectionState.lastError = null;

  // Promise 캐시 정리
  connectionPromises.clear();

  // 새 연결 시도
  await getRedisClient();
  logger.info("Redis 강제 재연결 완료");
}

/**
 * Redis 연결 종료
 */
export async function closeRedisConnections(): Promise<void> {
  healthManager.stopHealthCheck();

  const clients = [connectionState.client, pubClient, subClient].filter(Boolean);

  await Promise.allSettled(clients.map((client) => client?.quit()));

  connectionState.client = null;
  pubClient = null;
  subClient = null;

  logger.info("모든 Redis 연결 종료 완료");
}

/**
 * Redis 헬스 체크
 */
export async function checkRedisHealth(): Promise<{
  isHealthy: boolean;
  latency?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    const client = await getRedisClient();
    await client.ping();
    const latency = Date.now() - start;

    return { isHealthy: true, latency };
  } catch (error) {
    return {
      isHealthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// 애플리케이션 시작 시 설정
if (process.env.NODE_ENV !== "test" && process.env.AMU_DISABLE_REDIS_SIGNAL_HANDLERS !== "1") {
  startHealthCheckOnce();
  bindProcessSignalsOnce();
}
