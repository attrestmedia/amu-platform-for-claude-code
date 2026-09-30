/**
 * @docHint
 * @purpose Private Trade Lab — Toss 토큰 관리자 (리더 선출 + 분산 락 + 캐시)
 * @process 리더 선출  캐시 조회  단일 발급 락  double-check 갱신  401/403 분기
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_094830__private-trade-lab-implementation-roadmap.md §4.1 · §3.1
 *
 * 전제: 토스는 클라이언트당 유효 토큰 1개이며, 재발급하면 기존 토큰이 즉시 무효화된다(초안 주장,
 * 미확인이지만 fail-safe 방향으로 채택). 이 전제가 맞다면 두 프로세스가 각자 발급하는 순간 서로를
 * 무한히 죽인다. 이 모듈은 "한 순간에 발급하는 프로세스는 하나뿐"임을 Redis 단일 플라이트로 보장한다.
 *
 * 네임스페이스는 TL-001 결정(trading.*)에 따라 `trading:toss:token:*`를 쓴다. 보고서의 investment:* 는 폐기.
 * 이 모듈은 Redis 클라이언트를 직접 import하지 않는다 — 저장소는 주입받아 테스트에서 가짜로 교체할 수 있다.
 * 실제 Redis 배선은 tossTokenManagerRuntime.ts에 있다.
 *
 * 403(IP allowlist)은 재시도로 해결되지 않으므로 401과 완전히 다르게 취급한다. 즉시 paused로 강등하고
 * 재시도를 중단한다.
 */

import { createHash } from "node:crypto";
import { logger } from "utils/log";

/* ------------------------------------------------------------------ */
/* Redis 키 (TL-001 trading.* 네임스페이스)                             */
/* ------------------------------------------------------------------ */

export const TOSS_TOKEN_KEYS = {
  /** 단일 토큰 캐시: JSON { accessToken, issuedAt, expiresAt, fingerprint } */
  token: "trading:toss:token",
  /** 발급 권한 리더 리스 — trade-worker 프로세스 하나만 잡는다 */
  leader: "trading:toss:token:leader",
  /** 401 다발 시 단일 발급 플라이트 락 */
  lock: "trading:toss:token:lock",
  /** 403(IP allowlist) 강등 플래그 */
  paused: "trading:toss:token:paused",
} as const;

/* 설계 §4.1 상수 */
export const TOSS_TOKEN_CONSTANTS = {
  LEADER_TTL_MS: 30_000,
  LEADER_RENEW_MS: 15_000,
  LOCK_TTL_MS: 10_000,
  /** 만료 90% 경과 시 선제 갱신 */
  REFRESH_RATIO: 0.9,
  /** TTL 여유 — expires_in에서 빼서 캐시 만료보다 안전하게 사용 */
  SAFETY_MARGIN_MS: 600_000,
  /** 락 실패/비리더 대기 후 재조회 시도 */
  MAX_WAIT_ATTEMPTS: 5,
  WAIT_BACKOFF_MS: 200,
} as const;

/* ------------------------------------------------------------------ */
/* 타입                                                               */
/* ------------------------------------------------------------------ */

export type TossCredentials = { clientId: string; clientSecret: string };

export type TossTokenRequestResult = { accessToken: string; expiresIn: number };

export type CachedTossToken = {
  accessToken: string;
  issuedAt: number;
  expiresAt: number;
  /** sha256(clientId:clientSecret) — 자격증명이 바뀐 토큰을 재사용하지 않기 위함 */
  fingerprint: string;
};

export type TossTokenSetOptions = { px?: number; nx?: boolean };

/**
 * 저장소 인터페이스 — 실제 Redis(ioredis)와 테스트용 가짜를 모두 수용한다.
 * set은 성공 시 "OK", NX 실패 시 null을 반환한다.
 */
export interface TossTokenStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts: TossTokenSetOptions): Promise<string | null>;
  del(key: string): Promise<number>;
}

export type TossTokenManagerDeps = {
  store: TossTokenStore;
  /** 발급 권한을 잡는 프로세스 식별자 */
  workerId: string;
  /** /oauth2/token 호출. 401/403/429를 각각의 토스 에러로 던진다 */
  requestToken: (credentials: TossCredentials) => Promise<TossTokenRequestResult>;
  /** 주입 가능한 시계(테스트) */
  now?: () => number;
  /** 주입 가능한 sleep(테스트) */
  sleep?: (ms: number) => Promise<void>;
};

export type GetTossAccessTokenOptions = {
  /** API 호출이 401을 받아 강제 갱신할 때 true. fast-path 캐시 사용을 건너뛴다 */
  forceRefresh?: boolean;
};

/* ------------------------------------------------------------------ */
/* 에러 — 401/403/429를 구분해 재시도·강등 판단을 코드에 강제한다        */
/* ------------------------------------------------------------------ */

export class TossTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 발급 시 401 = 자격증명이 유효하지 않다 (재시도로 해결 불가) */
export class TossInvalidClientError extends TossTokenError {}

/** 403 = IP allowlist 문제 (재시도로 해결 불가 → 즉시 paused) */
export class TossIpNotAllowedError extends TossTokenError {}

export class TossRateLimitError extends TossTokenError {}

/** 그 외 4xx/5xx 등 상류 오류 */
export class TossTokenUpstreamError extends TossTokenError {
  readonly status: number;
  constructor(status: number) {
    super(`toss upstream http ${status}`);
    this.status = status;
  }
}

/** 네트워크/타임아웃 오류 */
export class TossNetworkError extends TossTokenError {}

/** 리더가 아니어서 발급할 수 없음 — 발급해야 하는 다른 프로세스가 이미 갱신 중 */
export class TossTokenUnavailableError extends TossTokenError {
  readonly reason: "LEADER_LEASE_NOT_HELD" | "REFRESH_IN_PROGRESS";
  constructor(reason: "LEADER_LEASE_NOT_HELD" | "REFRESH_IN_PROGRESS") {
    super(reason);
    this.reason = reason;
  }
}

/* ------------------------------------------------------------------ */
/* 도우미                                                              */
/* ------------------------------------------------------------------ */

export function computeCredentialFingerprint(credentials: TossCredentials): string {
  return createHash("sha256").update(`${credentials.clientId}:${credentials.clientSecret}`, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseCachedToken(raw: string | null): CachedTossToken | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const accessToken = safeString(parsed.accessToken);
    const issuedAt = safeNumber(parsed.issuedAt);
    const expiresAt = safeNumber(parsed.expiresAt);
    const fingerprint = safeString(parsed.fingerprint);
    if (!accessToken || !(issuedAt > 0) || !(expiresAt > 0) || !fingerprint) return null;
    return { accessToken, issuedAt, expiresAt, fingerprint };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 실측 네트워크 호출 (/oauth2/token) — 생산 경로                      */
/* ------------------------------------------------------------------ */

const TOSS_OAUTH_URL = "https://openapi.tossinvest.com/oauth2/token";

export async function requestTossAccessToken(credentials: TossCredentials): Promise<TossTokenRequestResult> {
  let response: Response;
  try {
    response = await fetch(TOSS_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError") throw new TossNetworkError("toss oauth timeout");
    throw new TossNetworkError("toss oauth network error");
  }

  if (response.status === 401) throw new TossInvalidClientError("toss invalid client");
  if (response.status === 403) throw new TossIpNotAllowedError("toss ip not allowed");
  if (response.status === 429) throw new TossRateLimitError("toss rate limited");
  if (!response.ok) throw new TossTokenUpstreamError(response.status);

  const body = (await response.json().catch(() => null)) as unknown;
  const accessToken = safeString(isRecord(body) ? body.access_token : "");
  const expiresIn = safeNumber(isRecord(body) ? body.expires_in : 0);
  if (!accessToken || !(expiresIn > 0)) throw new TossTokenUpstreamError(response.status);
  return { accessToken, expiresIn };
}


/* ------------------------------------------------------------------ */
/* 팩토리 — 테스트에서 가짜 저장소·시계·호출로 교체 가능                */
/* ------------------------------------------------------------------ */

export type TossTokenManager = {
  getTossAccessToken(credentials: TossCredentials, opts?: GetTossAccessTokenOptions): Promise<CachedTossToken>;
  recordTossAccessToken(args: {
    credentials: TossCredentials;
    accessToken: string;
    expiresIn: number;
  }): Promise<void>;
  getToken(): Promise<CachedTossToken | null>;
  acquireLeadership(): Promise<boolean>;
  renewLeadership(): Promise<boolean>;
  releaseLeadership(): Promise<boolean>;
  isLeader(): Promise<boolean>;
  getLeader(): Promise<string | null>;
  signalPaused(reason: string): Promise<void>;
  isPaused(): Promise<boolean>;
  clearPaused(): Promise<void>;
};

export function createTossTokenManager(deps: TossTokenManagerDeps): TossTokenManager {
  const { store } = deps;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const isHealthy = (token: CachedTossToken | null, at: number): boolean => {
    if (!token) return false;
    return token.expiresAt - at >= TOSS_TOKEN_CONSTANTS.SAFETY_MARGIN_MS;
  };

  const needsRefresh = (token: CachedTossToken, at: number): boolean => {
    const lifetime = token.expiresAt - token.issuedAt;
    if (lifetime <= 0) return true;
    return at - token.issuedAt >= TOSS_TOKEN_CONSTANTS.REFRESH_RATIO * lifetime;
  };

  const fingerprintMatches = (token: CachedTossToken | null, fp: string): boolean => token?.fingerprint === fp;

  async function readToken(): Promise<CachedTossToken | null> {
    return parseCachedToken(await store.get(TOSS_TOKEN_KEYS.token));
  }

  const getLeader = async (): Promise<string | null> => store.get(TOSS_TOKEN_KEYS.leader);

  async function writeToken(token: CachedTossToken): Promise<void> {
    const ttl = Math.max(1_000, token.expiresAt - now() - TOSS_TOKEN_CONSTANTS.SAFETY_MARGIN_MS);
    await store.set(TOSS_TOKEN_KEYS.token, JSON.stringify(token), { px: ttl });
  }

  async function releaseLockIfMine(): Promise<void> {
    const holder = await store.get(TOSS_TOKEN_KEYS.lock).catch(() => null);
    if (holder === deps.workerId) await store.del(TOSS_TOKEN_KEYS.lock).catch(() => null);
  }

  async function signalPaused(reason: string): Promise<void> {
    logger.error(`[tradingTokenManager] Toss paused — ${reason}`);
    await store.set(TOSS_TOKEN_KEYS.paused, JSON.stringify({ reason, at: now() }), {
      px: 6 * 60 * 60 * 1000,
    });
  }

  /**
   * 락에 실패하거나 리더가 아닌 프로세스가 사용하는 공통 대기 루프.
   * startIssuedAt 이후 캐시가 갱신되면 그 토큰을 돌려준다(단일 발급 보장의 핵심).
   */
  async function waitForRefresh(
    startIssuedAt: number,
    fp: string,
    failReason: "LEADER_LEASE_NOT_HELD" | "REFRESH_IN_PROGRESS",
  ): Promise<CachedTossToken> {
    for (let i = 0; i < TOSS_TOKEN_CONSTANTS.MAX_WAIT_ATTEMPTS; i += 1) {
      await sleep(TOSS_TOKEN_CONSTANTS.WAIT_BACKOFF_MS);
      const current = await readToken();
      if (current && isHealthy(current, now()) && current.issuedAt > startIssuedAt && fingerprintMatches(current, fp)) {
        return current;
      }
    }
    throw new TossTokenUnavailableError(failReason);
  }

  async function getTossAccessToken(
    credentials: TossCredentials,
    opts: GetTossAccessTokenOptions = {},
  ): Promise<CachedTossToken> {
    const fp = computeCredentialFingerprint(credentials);
    const startIssuedAt = (await readToken())?.issuedAt ?? 0;

    // fast path — 캐시가 유효하고 자격증명도 같고 90% 이전이면 그대로 쓴다
    if (!opts.forceRefresh) {
      const cached = await readToken();
      if (cached && isHealthy(cached, now()) && !needsRefresh(cached, now()) && fingerprintMatches(cached, fp)) {
        return cached;
      }
    }

    // 갱신/발급 필요 → 발급 권한은 리더만 가진다. 비리더는 절대 /oauth2/token을 부르지 않는다.
    if ((await getLeader()) !== deps.workerId) {
      return waitForRefresh(startIssuedAt, fp, "LEADER_LEASE_NOT_HELD");
    }

    // 단일 플라이트 락 — 동시 401 다발이 와도 발급은 한 번만 일어난다
    const locked =
      (await store.set(TOSS_TOKEN_KEYS.lock, deps.workerId, {
        px: TOSS_TOKEN_CONSTANTS.LOCK_TTL_MS,
        nx: true,
      })) === "OK";
    if (!locked) {
      return waitForRefresh(startIssuedAt, fp, "REFRESH_IN_PROGRESS");
    }

    try {
      // double-check — 내가 락을 잡은 사이 다른 호출이 이미 갱신했다면 재발급하지 않는다
      const doubleCheck = await readToken();
      if (
        doubleCheck &&
        isHealthy(doubleCheck, now()) &&
        doubleCheck.issuedAt > startIssuedAt &&
        fingerprintMatches(doubleCheck, fp)
      ) {
        return doubleCheck;
      }


      const result = await deps.requestToken(credentials); // 401/403/429는 여기서 던져진다
      const issued: CachedTossToken = {
        accessToken: result.accessToken,
        issuedAt: now(),
        expiresAt: now() + result.expiresIn * 1000,
        fingerprint: fp,
      };
      await writeToken(issued);
      return issued;
    } catch (error) {
      if (error instanceof TossIpNotAllowedError) {
        // 403은 IP 문제라 재시도로 해결되지 않는다 → 즉시 paused + 재시도 중단
        await signalPaused("toss_securities_ip_not_allowed").catch(() => null);
      }
      throw error;
    } finally {
      await releaseLockIfMine();
    }
  }

  async function recordTossAccessToken(args: {
    credentials: TossCredentials;
    accessToken: string;
    expiresIn: number;
  }): Promise<void> {
    // platformCredentialVerifier의 trading.toss.securities case가 이 경로를 쓴다.
    // 검증 버튼을 누를 때마다 새 토큰이 발급되어 worker 토큰이 무효화되는 것을 막기 위해,
    // 발급한 토큰을 공유 캐시에 기록해 worker가 그대로 이어 쓸 수 있게 한다.
    const fp = computeCredentialFingerprint(args.credentials);
    const issuedAt = now();
    await writeToken({
      accessToken: args.accessToken,
      issuedAt,
      expiresAt: issuedAt + args.expiresIn * 1000,
      fingerprint: fp,
    });
  }

  async function acquireLeadership(): Promise<boolean> {
    const result = await store.set(TOSS_TOKEN_KEYS.leader, deps.workerId, {
      px: TOSS_TOKEN_CONSTANTS.LEADER_TTL_MS,
      nx: true,
    });
    return result === "OK";
  }

  async function renewLeadership(): Promise<boolean> {
    const holder = await store.get(TOSS_TOKEN_KEYS.leader);
    if (holder !== deps.workerId) return false;
    await store.set(TOSS_TOKEN_KEYS.leader, deps.workerId, { px: TOSS_TOKEN_CONSTANTS.LEADER_TTL_MS });
    return true;
  }

  async function releaseLeadership(): Promise<boolean> {
    const holder = await store.get(TOSS_TOKEN_KEYS.leader);
    if (holder !== deps.workerId) return false;
    await store.del(TOSS_TOKEN_KEYS.leader);
    return true;
  }

  return {
    getTossAccessToken,
    recordTossAccessToken,
    getToken: readToken,
    acquireLeadership,
    renewLeadership,
    releaseLeadership,
    getLeader,
    isLeader: async () => (await store.get(TOSS_TOKEN_KEYS.leader)) === deps.workerId,
    signalPaused,
    isPaused: async () => (await store.get(TOSS_TOKEN_KEYS.paused)) !== null,
    clearPaused: async () => {
      await store.del(TOSS_TOKEN_KEYS.paused);
    },
  };
}

