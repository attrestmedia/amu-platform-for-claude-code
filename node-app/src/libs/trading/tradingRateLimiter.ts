/**
 * @docHint
 * @purpose Private Trade Lab — provider×group 레이트 리미터 (Redis 공유 토큰 버킷)
 * @process 그룹 스펙  유효 레이트 해석  토큰 버킷 소비  헤더 파싱  백오프·우선순위
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_103627__private-trade-lab-multi-asset-integration-design.md §7.3 · §5.1
 *
 * 두 거래소는 그룹 체계와 헤더 이름이 다르다(토스 X-RateLimit-*, 업비트 Remaining-Req).
 * `provider × group` 2차원으로 버킷을 관리한다. 업비트 QUOTATION은 IP 단위 예산이라
 * trade-worker·trade-stream-worker 두 컨테이너가 **하나의 Redis 버킷을 나눠 쓴다**.
 *
 * 이 모듈은 Redis 클라이언트를 직접 import하지 않는다 — 저장소는 주입받아 테스트에서
 * 가짜로 교체할 수 있다. 실제 Redis 배선(및 원자적 소비 스크립트)은
 * tradingRateLimiterRuntime.ts에 있다.
 *
 * 429 반복 시 업비트는 418로 일정 시간 차단한다(토스보다 처벌이 무겁다). 업비트 쪽
 * 백오프를 418은 분 단위, 429는 지수로 더 보수적으로 잡는다.
 */

import type { RateLimitSnapshot, TradingProvider } from "types/trading/adapter";

/* ------------------------------------------------------------------ */
/* 그룹 정의 — §7.3 표                                                 */
/* ------------------------------------------------------------------ */

export const TRADING_RATE_GROUPS = {
  toss_securities: ["AUTH", "MARKET_DATA", "MARKET_DATA_CHART", "ORDER", "ORDER_INFO"],
  upbit: [
    "QUOTATION",
    "EXCHANGE_DEFAULT",
    "EXCHANGE_ORDER",
    "EXCHANGE_ORDER_TEST",
    "EXCHANGE_CANCEL_ALL",
    "WS_CONNECT",
    "WS_MESSAGE",
  ],
} as const satisfies Record<TradingProvider, readonly string[]>;

export type TradingRateGroup = (typeof TRADING_RATE_GROUPS)[TradingProvider][number];

/* ------------------------------------------------------------------ */
/* 그룹 스펙 — 단위·시간대 감소·공유 여부·헤더                             */
/* ------------------------------------------------------------------ */

export type TradingRateHeaderKind = "toss" | "upbit";

export type TradingRateGroupSpec = {
  provider: TradingProvider;
  group: TradingRateGroup;
  /** 기본 초당 토큰 */
  ratePerSecond: number;
  /** 순간 허용 버스트 */
  burst: number;
  /** KST 기준 시간대 감소 — 토스 ORDER_INFO 09:00~09:10은 3 */
  kstWindowReduction?: {
    fromMinuteOfDay: number;
    toMinuteOfDay: number;
    ratePerSecond: number;
    burst: number;
  };
  /** IP 단위 공유 — true면 키에 인스턴스 구분자를 붙이지 않는다. 업비트 QUOTATION만 true */
  sharedAcrossInstances: boolean;
  header: TradingRateHeaderKind;
};

const SPEC: Record<TradingProvider, Record<string, TradingRateGroupSpec>> = {
  toss_securities: {
    AUTH: { provider: "toss_securities", group: "AUTH", ratePerSecond: 5, burst: 5, sharedAcrossInstances: false, header: "toss" },
    MARKET_DATA: { provider: "toss_securities", group: "MARKET_DATA", ratePerSecond: 10, burst: 10, sharedAcrossInstances: false, header: "toss" },
    MARKET_DATA_CHART: { provider: "toss_securities", group: "MARKET_DATA_CHART", ratePerSecond: 5, burst: 5, sharedAcrossInstances: false, header: "toss" },
    ORDER: { provider: "toss_securities", group: "ORDER", ratePerSecond: 10, burst: 10, sharedAcrossInstances: false, header: "toss" },
    ORDER_INFO: {
      provider: "toss_securities",
      group: "ORDER_INFO",
      ratePerSecond: 6,
      burst: 6,
      sharedAcrossInstances: false,
      header: "toss",
      kstWindowReduction: {
        fromMinuteOfDay: 9 * 60, // 09:00 KST
        toMinuteOfDay: 9 * 60 + 10, // 09:10 KST
        ratePerSecond: 3,
        burst: 3,
      },
    },
  },
  upbit: {
    QUOTATION: { provider: "upbit", group: "QUOTATION", ratePerSecond: 10, burst: 10, sharedAcrossInstances: true, header: "upbit" },
    EXCHANGE_DEFAULT: { provider: "upbit", group: "EXCHANGE_DEFAULT", ratePerSecond: 30, burst: 30, sharedAcrossInstances: false, header: "upbit" },
    EXCHANGE_ORDER: { provider: "upbit", group: "EXCHANGE_ORDER", ratePerSecond: 8, burst: 8, sharedAcrossInstances: false, header: "upbit" },
    EXCHANGE_ORDER_TEST: { provider: "upbit", group: "EXCHANGE_ORDER_TEST", ratePerSecond: 8, burst: 8, sharedAcrossInstances: false, header: "upbit" },
    EXCHANGE_CANCEL_ALL: { provider: "upbit", group: "EXCHANGE_CANCEL_ALL", ratePerSecond: 0.5, burst: 1, sharedAcrossInstances: false, header: "upbit" },
    WS_CONNECT: { provider: "upbit", group: "WS_CONNECT", ratePerSecond: 5, burst: 5, sharedAcrossInstances: false, header: "upbit" },
    WS_MESSAGE: { provider: "upbit", group: "WS_MESSAGE", ratePerSecond: 5, burst: 5, sharedAcrossInstances: false, header: "upbit" },
  },
};

export function getRateGroupSpec(provider: TradingProvider, group: TradingRateGroup): TradingRateGroupSpec {
  const found = SPEC[provider]?.[group];
  if (!found) throw new Error(`[tradingRateLimiter] 알 수 없는 레이트 그룹: ${provider}:${String(group)}`);
  return found;
}

/** Redis 예산 키 — §5.1 `trading:ratelimit:{provider}:{group}`. 공유 그룹은 인스턴스 구분자를 붙이지 않는다 */
export function rateGroupBucketKey(
  provider: TradingProvider,
  group: TradingRateGroup,
  opts: { sharedAcrossInstances?: boolean; instanceId?: string } = {},
): string {
  const spec = getRateGroupSpec(provider, group);
  const shared = opts.sharedAcrossInstances ?? spec.sharedAcrossInstances;
  const instance = shared ? "" : opts.instanceId ? `:${opts.instanceId}` : "";
  return `trading:ratelimit:${provider}:${group}${instance}`;
}

/* ------------------------------------------------------------------ */
/* KST 시간대 감소 해석 — 유효 레이트를 구하는 공통 함수                  */
/* ------------------------------------------------------------------ */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstMinuteOfDay(nowMs: number): number {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

export function resolveRatePerSecond(provider: TradingProvider, group: TradingRateGroup, nowMs: number): number {
  const spec = getRateGroupSpec(provider, group);
  const reduction = spec.kstWindowReduction;
  if (reduction) {
    const minute = kstMinuteOfDay(nowMs);
    if (minute >= reduction.fromMinuteOfDay && minute < reduction.toMinuteOfDay) {
      return reduction.ratePerSecond;
    }
  }
  return spec.ratePerSecond;
}

export function resolveBurst(provider: TradingProvider, group: TradingRateGroup, nowMs: number): number {
  const spec = getRateGroupSpec(provider, group);
  const reduction = spec.kstWindowReduction;
  if (reduction) {
    const minute = kstMinuteOfDay(nowMs);
    if (minute >= reduction.fromMinuteOfDay && minute < reduction.toMinuteOfDay) {
      return reduction.burst;
    }
  }
  return spec.burst;
}

/* ------------------------------------------------------------------ */
/* 토큰 버킷 — 순수 로직(read-modify-write). 런타임에서 Lua로 원자화      */
/* ------------------------------------------------------------------ */

export type RateBucketState = { tokens: number; lastRefillAt: number };

export type RateLimiterSetOptions = { px?: number };
export type RateLimiterStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: RateLimiterSetOptions): Promise<unknown>;
};

export type RateConsumeInput = {
  provider: TradingProvider;
  group: TradingRateGroup;
  cost?: number;
  /** 비공유 그룹의 인스턴스 구분자(기본 없음) */
  instanceId?: string;
};

export type RateConsumeResult = {
  allowed: boolean;
  provider: TradingProvider;
  group: TradingRateGroup;
  remaining: number;
  retryAfterMs: number;
};

export function parseRateBucket(raw: string | null, defaultBurst: number): RateBucketState {
  if (!raw) return { tokens: defaultBurst, lastRefillAt: 0 };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { tokens: defaultBurst, lastRefillAt: 0 };
    const tokens = Number((parsed as { tokens?: unknown }).tokens);
    const lastRefillAt = Number((parsed as { lastRefillAt?: unknown }).lastRefillAt);
    if (!Number.isFinite(tokens) || !Number.isFinite(lastRefillAt)) return { tokens: defaultBurst, lastRefillAt: 0 };
    return { tokens, lastRefillAt };
  } catch {
    return { tokens: defaultBurst, lastRefillAt: 0 };
  }
}

/** 버킷 TTL — burst가 꽉 차 채워지는 데 걸리는 시간 + 여유 */
function bucketTtlMs(burst: number, rate: number): number {
  return Math.ceil(burst / Math.max(rate, Number.EPSILON)) * 1000 + 5_000;
}

/**
 * 토큰 버킷 소비. 같은 provider×group 키를 서로 다른 프로세스(컨테이너)가 공유한다.
 * 비공유 그룹은 instanceId로 분리한다. KST 시간대 감소를 반영한 유효 레이트를 쓴다.
 */
export async function consumeRateToken(
  store: RateLimiterStore,
  input: RateConsumeInput,
  nowMs: number,
): Promise<RateConsumeResult> {
  const { provider, group } = input;
  const cost = input.cost ?? 1;
  const burst = resolveBurst(provider, group, nowMs);
  const rate = resolveRatePerSecond(provider, group, nowMs);
  const key = rateGroupBucketKey(provider, group, { instanceId: input.instanceId });

  const raw = await store.get(key);
  const state = parseRateBucket(raw, burst);

  // 리필 — 경과 시간만큼 보충, burst 상한
  const elapsedMs = state.lastRefillAt > 0 ? nowMs - state.lastRefillAt : 0;
  const refilled = Math.min(burst, state.tokens + (elapsedMs / 1000) * rate);

  const remainingAfterConsume = refilled - cost;

  if (remainingAfterConsume < 0) {
    // 소비 불가 — refill만 반영해 저장하고 대기 시간을 보고한다
    await store.set(key, JSON.stringify({ tokens: refilled, lastRefillAt: nowMs }), {
      px: bucketTtlMs(burst, rate),
    });
    const retryAfterMs = Math.ceil((cost - refilled) / rate) * 1000;
    return { allowed: false, provider, group, remaining: Math.floor(refilled), retryAfterMs: Math.max(0, retryAfterMs) };
  }

  await store.set(key, JSON.stringify({ tokens: remainingAfterConsume, lastRefillAt: nowMs }), {
    px: bucketTtlMs(burst, rate),
  });
  return { allowed: true, provider, group, remaining: Math.floor(remainingAfterConsume), retryAfterMs: 0 };
}


/* ------------------------------------------------------------------ */
/* 헤더 파서 — provider마다 다른 헤더를 공통 형태로                      */
/* ------------------------------------------------------------------ */

export type RateLimitHeaderMap = Record<string, string | undefined>;

function numberOrNull(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 토스 — X-RateLimit-Remaining / X-RateLimit-Remaining-Per-Minute */
export function parseTossRateLimitHeaders(
  provider: TradingProvider,
  group: TradingRateGroup,
  headers: RateLimitHeaderMap,
  observedAt: Date,
): RateLimitSnapshot {
  const lower = {
    "x-ratelimit-remaining": headers["x-ratelimit-remaining"] ?? headers["X-RateLimit-Remaining"],
    "x-ratelimit-remaining-per-minute":
      headers["x-ratelimit-remaining-per-minute"] ?? headers["X-RateLimit-Remaining-Per-Minute"],
  };
  return {
    provider,
    group,
    remainingPerSecond: numberOrNull(lower["x-ratelimit-remaining"]),
    remainingPerMinute: numberOrNull(lower["x-ratelimit-remaining-per-minute"]),
    observedAt,
  };
}

/**
 * 업비트 — Remaining-Req 헤더가 `group=ticker; min=600; sec=9` 형태다.
 * sec가 초당 잔여, min이 분당 잔여(설계 §7.3 / TL-000 실측의 group 파싱 근거).
 */
export function parseUpbitRateLimitHeaders(
  provider: TradingProvider,
  group: TradingRateGroup,
  headers: RateLimitHeaderMap,
  observedAt: Date,
): RateLimitSnapshot {
  const raw = headers["remaining-req"] ?? headers["Remaining-Req"] ?? null;
  let remainingPerSecond: number | null = null;
  let remainingPerMinute: number | null = null;

  if (raw) {
    for (const part of String(raw).split(";")) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const name = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (name === "sec") remainingPerSecond = numberOrNull(value);
      if (name === "min") remainingPerMinute = numberOrNull(value);
    }
  }

  return { provider, group, remainingPerSecond, remainingPerMinute, observedAt };
}

export function parseRateLimitHeaders(
  provider: TradingProvider,
  group: TradingRateGroup,
  headers: RateLimitHeaderMap,
  observedAt: Date = new Date(),
): RateLimitSnapshot {
  const spec = getRateGroupSpec(provider, group);
  return spec.header === "toss"
    ? parseTossRateLimitHeaders(provider, group, headers, observedAt)
    : parseUpbitRateLimitHeaders(provider, group, headers, observedAt);
}


/* ------------------------------------------------------------------ */
/* 우선순위 — 취소 > 제출 > 조회 > 시세                                 */
/* ------------------------------------------------------------------ */

export const TRADING_RATE_PRIORITIES = ["cancel", "submit", "query", "market"] as const;
export type TradingRatePriority = (typeof TRADING_RATE_PRIORITIES)[number];

export function priorityRank(priority: TradingRatePriority): number {
  return TRADING_RATE_PRIORITIES.indexOf(priority);
}

/** cancel(높음)이 market(낮음)의 대기를 밀 수 있는지 — 대기열 우선 통과 판정 */
export function higherPriority(first: TradingRatePriority, second: TradingRatePriority): boolean {
  return priorityRank(first) < priorityRank(second);
}

/* ------------------------------------------------------------------ */
/* 백오프 — 업비트가 토스보다 처벌이 무겁다(418)                          */
/* ------------------------------------------------------------------ */

export type RateLimitBackoffKind = "upbit" | "toss";
export type RateBackoffInput = {
  kind: RateLimitBackoffKind;
  /** 429 또는 418(업비트) */
  status: number;
  attempt: number;
};

const UPBIT_418_COOLDOWN_MS = 5 * 60 * 1000;
const UPBIT_429_CAP_MS = 5 * 60 * 1000;
const UPBIT_429_BASE_MS = 2_500;
const TOSS_429_CAP_MS = 60_000;
const TOSS_429_BASE_MS = 1_000;

export function computeUpbitBackoffMs(status: number, attempt: number): number {
  if (status === 418) {
    // 418은 "일정 시간 차단"이다. 시도당 5분씩 늘리고 상한을 유지한다.
    return Math.min(UPBIT_418_COOLDOWN_MS * (attempt + 1), 30 * 60 * 1000);
  }
  const exp = Math.min(2 ** Math.min(Math.max(attempt, 0), 6), 64);
  return Math.min(UPBIT_429_BASE_MS * exp, UPBIT_429_CAP_MS);
}

export function computeTossBackoffMs(status: number, attempt: number): number {
  if (status === 429) {
    const exp = Math.min(1.5 ** Math.min(Math.max(attempt, 0), 8), 25.6);
    return Math.min(Math.round(TOSS_429_BASE_MS * exp), TOSS_429_CAP_MS);
  }
  // 토스는 418 개념이 없다. 미래 대비 429와 동일 대열로 처리한다.
  return computeTossBackoffMs(429, attempt);
}

export function computeBackoffMs(kind: RateLimitBackoffKind, status: number, attempt: number): number {
  return kind === "upbit" ? computeUpbitBackoffMs(status, attempt) : computeTossBackoffMs(status, attempt);
}

/** 상류 상태 코드가 차단형(418)인지 — 418이면 재시도가 아니라 긴 대기/중단 판단 */
export function isBlockingRateStatus(status: number): boolean {
  return status === 418;
}

