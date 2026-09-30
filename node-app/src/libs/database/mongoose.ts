import mongoose from "mongoose";

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get 작업  DB 조회/저장 수행
 * @domain database
 * @scope server
 */

const safeLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[MONGOOSE]", ...args);
  }
};

const safeError = (...args: unknown[]) => {
  console.error("[MONGOOSE ERROR]", ...args);
};

const safeWarn = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[MONGOOSE WARN]", ...args);
  }
};

// globalThis를 사용한 싱글톤 캐싱
const MONGODB_CACHE_KEY = "_mongooseConnections";

type ConnectionCache = {
  conn: Map<string, mongoose.Connection>;
  promise: Map<string, Promise<mongoose.Connection>>;
};

type GlobalWithMongoCache = Record<string, unknown>;
const globalMongo = globalThis as unknown as GlobalWithMongoCache;

// 안전한 캐시 초기화 (기존 Record → Map 마이그레이션 포함)
function initializeCache(): ConnectionCache {
  const existingCache = globalMongo[MONGODB_CACHE_KEY] as
    | ConnectionCache
    | { conn?: unknown; promise?: unknown }
    | undefined;

  // 기존 캐시가 없거나 이미 Map 형태인 경우
  if (!existingCache) {
    safeLog("새로운 캐시 초기화");
    return {
      conn: new Map<string, mongoose.Connection>(),
      promise: new Map<string, Promise<mongoose.Connection>>(),
    };
  }

  // 기존 캐시가 Map 형태인지 확인
  if (existingCache.conn instanceof Map && existingCache.promise instanceof Map) {
    safeLog("기존 Map 캐시 재사용");
    return existingCache as ConnectionCache;
  }

  // 기존 Record 형태 캐시를 Map으로 마이그레이션
  safeLog("Record → Map 캐시 마이그레이션 시작");

  const newCache: ConnectionCache = {
    conn: new Map<string, mongoose.Connection>(),
    promise: new Map<string, Promise<mongoose.Connection>>(),
  };

  // 기존 연결들을 Map으로 이전
  if (existingCache.conn && typeof existingCache.conn === "object") {
    for (const [dbName, connection] of Object.entries(existingCache.conn as Record<string, unknown>)) {
      if (connection && typeof connection === "object") {
        const conn = connection as mongoose.Connection;
        newCache.conn.set(dbName, conn);
        safeLog(`연결 마이그레이션: ${dbName} (readyState=${conn.readyState})`);
      }
    }
  }

  // 기존 Promise들을 Map으로 이전
  if (existingCache.promise && typeof existingCache.promise === "object") {
    for (const [dbName, promise] of Object.entries(existingCache.promise as Record<string, unknown>)) {
      if (promise && typeof promise === "object") {
        newCache.promise.set(dbName, promise as Promise<mongoose.Connection>);
        safeLog(`Promise 마이그레이션: ${dbName}`);
      }
    }
  }

  safeLog(`마이그레이션 완료: 연결 ${newCache.conn.size}개, Promise ${newCache.promise.size}개`);
  return newCache;
}

// 안전한 캐시 초기화
if (!globalMongo[MONGODB_CACHE_KEY]) {
  globalMongo[MONGODB_CACHE_KEY] = initializeCache();
} else {
  globalMongo[MONGODB_CACHE_KEY] = initializeCache();
}

// 캐시 객체 참조
const connCache: ConnectionCache = globalMongo[MONGODB_CACHE_KEY] as ConnectionCache;

// MongoDB 연결 옵션
const CONNECTION_OPTIONS = {
  maxPoolSize: 40,
  minPoolSize: 8,
  waitQueueTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000,
  maxIdleTimeMS: 300000,
  retryWrites: true,
  heartbeatFrequencyMS: 10000,
};

/**
 * URI에서 데이터베이스 이름 추출
 */
function extractDbName(uri: string): string {
  const match = uri.match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : "default";
}

/**
 * 새 연결 생성 (개선된 방식)
 */
async function createConnection(uri: string, dbName: string): Promise<mongoose.Connection> {
  safeLog(`새 연결 생성 시작: ${dbName}`);

  const connection = mongoose.createConnection(uri, CONNECTION_OPTIONS);

  // 연결 이벤트 핸들러 등록
  connection.on("connected", () => {
    safeLog(`MongoDB ${dbName} 연결 성공 (readyState=${connection.readyState})`);
  });

  connection.on("disconnected", () => {
    safeLog(`MongoDB ${dbName} 연결 끊김`);
    // 안전한 캐시 삭제
    try {
      connCache.conn.delete(dbName);
    } catch (deleteError) {
      safeWarn(`캐시 삭제 중 오류 (무시됨):`, deleteError);
    }
  });

  connection.on("error", (error) => {
    safeError(`MongoDB ${dbName} 연결 오류:`, error);
    // 심각한 연결 오류 시 캐시에서 제거
    if (
      error.name === "MongoNetworkError" ||
      (error.message && (error.message.includes("topology") || error.message.includes("timed out")))
    ) {
      try {
        connCache.conn.delete(dbName);
      } catch (deleteError) {
        safeWarn(`캐시 삭제 중 오류 (무시됨):`, deleteError);
      }
    }
  });

  return connection.asPromise();
}

/**
 * 개선된 MongoDB 연결 함수 (기존 함수명 유지)
 */
export async function dbConnect(uri: string): Promise<mongoose.Connection> {
  if (!uri) {
    throw new Error("MongoDB URI가 제공되지 않았습니다");
  }

  const dbName = extractDbName(uri);

  safeLog(`dbConnect 호출: ${dbName}`);
  safeLog(`캐시 상태 확인: conn은 Map인가? ${connCache.conn instanceof Map}`);
  safeLog(`현재 캐시 크기: conn=${connCache.conn.size}, promise=${connCache.promise.size}`);

  // 캐시 타입 안전성 검사
  if (!(connCache.conn instanceof Map) || !(connCache.promise instanceof Map)) {
    safeError("캐시가 Map 타입이 아님. 재초기화 중...");
    globalMongo[MONGODB_CACHE_KEY] = initializeCache();
    const newConnCache: ConnectionCache = globalMongo[MONGODB_CACHE_KEY] as ConnectionCache;
    Object.assign(connCache, newConnCache);
  }

  // 1. 이미 활성화된 연결이 있으면 즉시 반환
  const existingConn = connCache.conn.get(dbName);
  if (existingConn?.readyState === 1) {
    safeLog(`MongoDB ${dbName} 기존 연결 재사용 (readyState=${existingConn.readyState})`);
    return existingConn;
  }

  // 2. 진행 중인 연결 Promise가 있으면 재사용
  const pendingPromise = connCache.promise.get(dbName);
  if (pendingPromise) {
    try {
      safeLog(`MongoDB ${dbName} 진행 중인 연결 대기`);
      return await pendingPromise;
    } catch (error) {
      safeError(`MongoDB ${dbName} 연결 Promise 오류:`, error);
      connCache.promise.delete(dbName);
    }
  }

  // 3. 새 연결 생성
  try {
    // 기존 연결이 있지만 활성화되지 않은 경우 정리
    if (existingConn && existingConn.readyState !== 0) {
      try {
        safeLog(`기존 연결 정리 시도: ${dbName} (readyState=${existingConn.readyState})`);
        await existingConn.close();
        safeLog(`MongoDB ${dbName} 이전 연결 정리 완료`);
      } catch (closeError) {
        safeWarn(`MongoDB ${dbName} 이전 연결 정리 실패:`, closeError);
      }
      connCache.conn.delete(dbName);
    }

    // 새 연결 Promise 생성 및 캐싱
    safeLog(`MongoDB ${dbName} 새 연결 시작...`);
    const connectionPromise = createConnection(uri, dbName);
    connCache.promise.set(dbName, connectionPromise);

    // 연결 완료 대기
    const connection = await connectionPromise;
    connCache.conn.set(dbName, connection);
    connCache.promise.delete(dbName);

    safeLog(`MongoDB ${dbName} 연결 성공 (최종 readyState=${connection.readyState})`);
    return connection;
  } catch (error) {
    safeError(`MongoDB ${dbName} 연결 실패:`, error);
    connCache.promise.delete(dbName);

    // 상세 오류 정보
    if (error instanceof Error) {
      safeError(`오류 상세 정보:`, {
        name: error.name,
        message: error.message,
        stack: error.stack?.split("\n").slice(0, 3).join("\n"),
      });
    }

    throw error;
  }
}

/**
 * 모든 연결 종료 (기존 함수 유지)
 */
export async function closeAllConnections(): Promise<void> {
  try {
    const connections = Array.from(connCache.conn.values());
    if (connections.length === 0) {
      safeLog("종료할 MongoDB 연결이 없습니다");
      return;
    }

    safeLog(`${connections.length}개의 MongoDB 연결 종료 중...`);
    const closePromises = connections.map((conn) => conn.close());

    await Promise.all(closePromises);
    // 캐시 초기화
    connCache.conn.clear();
    connCache.promise.clear();
    safeLog("모든 MongoDB 연결 종료 완료");
  } catch (error) {
    safeError("MongoDB 연결 종료 중 오류:", error);
    throw error;
  }
}

/**
 * 특정 데이터베이스 연결 종료
 */
export async function closeConnection(uri: string): Promise<void> {
  const dbName = extractDbName(uri);
  const connection = connCache.conn.get(dbName);

  if (!connection) {
    safeLog(`MongoDB ${dbName} 연결이 존재하지 않습니다`);
    return;
  }

  try {
    await connection.close();
    connCache.conn.delete(dbName);
    connCache.promise.delete(dbName);
    safeLog(`MongoDB ${dbName} 연결 종료 완료`);
  } catch (error) {
    safeError(`MongoDB ${dbName} 연결 종료 중 오류:`, error);
    throw error;
  }
}

/**
 * 연결 상태 확인
 */
export function getConnectionStatus(): Record<string, number> {
  const status: Record<string, number> = {};
  try {
    for (const [dbName, connection] of connCache.conn.entries()) {
      status[dbName] = connection.readyState;
    }
    safeLog("연결 상태 조회 성공:", status);
  } catch (error) {
    safeError("연결 상태 조회 중 오류:", error);
  }
  return status;
}

/**
 * 디버깅 정보 조회
 */
export function getDebugInfo() {
  try {
    return {
      cacheType: {
        conn: connCache.conn.constructor.name,
        promise: connCache.promise.constructor.name,
      },
      connectionCount: connCache.conn.size,
      pendingPromiseCount: connCache.promise.size,
      connections: Array.from(connCache.conn.entries()).map(([name, conn]) => ({
        name,
        readyState: conn.readyState,
        db: conn.db?.databaseName,
      })),
    };
  } catch (error) {
    safeError("디버그 정보 조회 중 오류:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      cacheType: "unknown",
    };
  }
}

/**
 * 트랜잭션 세션 시작
 */
export async function startSession(uri: string): Promise<mongoose.ClientSession> {
  if (!uri) {
    throw new Error("MongoDB URI가 제공되지 않았습니다");
  }

  try {
    // 기존 dbConnect 함수 활용
    const connection = await dbConnect(uri);

    // Connection에서 세션 시작
    const session = connection.startSession();

    const dbName = extractDbName(uri);
    safeLog(`MongoDB ${dbName} 트랜잭션 세션 시작`);

    return session;
  } catch (error) {
    const dbName = extractDbName(uri);
    safeError(`MongoDB ${dbName} 세션 시작 실패:`, error);
    throw error;
  }
}

/**
 * 트랜잭션 헬퍼 함수
 */
export async function withTransaction<T>(
  uri: string,
  callback: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await startSession(uri);

  try {
    let result: T;

    await session.withTransaction(async () => {
      result = await callback(session);
    });

    return result!;
  } finally {
    await session.endSession();
  }
}
