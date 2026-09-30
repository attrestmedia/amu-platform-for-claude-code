/**
 * @docHint
 * @purpose Private Trade Lab — 레이트 리미터 실제 Redis 배선(싱글턴, 원자적 Lua 소비)
 * @process getRedisClient  Lua 토큰 버킷  헤더 파싱 노출
 * @domain trading
 * @scope private-trade-lab
 *
 * tradingRateLimiter.ts는 Redis에 직접 붙지 않는다(테스트 교체 목적). 여기서 실제
 * ioredis 클라이언트를 감싸 싱글턴 tradeRateLimiter를 만든다.
 *
 * 두 컨테이너(trade-worker·trade-stream-worker)가 하나의 예산을 나누는 업비트
 * QUOTATION의 공유 버킷은 read-modify-write 경쟁이 있으면 과소비된다. Redis Lua 스크립트로
 * 버킷 읽기→리필→소비를 원자적으로 수행한다. 유효 레이트(KST 시간대 감소 반영)는
 * JS에서 계산해 ARGV로 넘긴다.
 */

import { getRedisClient } from "libs/cache/redisClient";
import {
  parseRateLimitHeaders,
  rateGroupBucketKey,
  resolveBurst,
  resolveRatePerSecond,
  type RateConsumeInput,
  type RateConsumeResult,
  type RateLimitHeaderMap,
} from "libs/trading/tradingRateLimiter";
import type { RateLimitSnapshot } from "types/trading/adapter";

/** 버킷 읽기→리필→소비를 한 번에 — cjson을 이용해 JSON 상태를 저장한다 */
const RATE_CONSUME_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ratePerMs = tonumber(ARGV[2]) / 1000.0
local burst = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttlMs = tonumber(ARGV[5])

local raw = redis.call('GET', key)
local tokens = burst
local last = now
if raw then
  local s = cjson.decode(raw)
  tokens = tonumber(s.tokens) + (now - tonumber(s.last)) * ratePerMs
  if tokens > burst then tokens = burst end
  last = tonumber(s.last)
end

local remainingAfter = tokens - cost
local allowed = 0
local remaining = tokens
local retryAfterMs = 0
if remainingAfter >= 0 then
  allowed = 1
  remaining = remainingAfter
  tokens = remainingAfter
end
-- 허용 여부와 무관하게 리필 기준을 now로 재설정(중복 리필 방지)
last = now
if tokens < 0 then tokens = 0 end

local payload = cjson.encode({ tokens = tokens, last = last })
if ttlMs and ttlMs > 0 then
  redis.call('SET', key, payload, 'PX', ttlMs)
else
  redis.call('SET', key, payload)
end

return cjson.encode({ allowed = allowed, remaining = remaining, retryAfterMs = retryAfterMs })
`;

function bucketTtlMs(burst: number, rate: number): number {
  return Math.ceil(burst / Math.max(rate, Number.EPSILON)) * 1000 + 5_000;
}

async function consume(input: RateConsumeInput, nowMs: number = Date.now()): Promise<RateConsumeResult> {
  const { provider, group } = input;
  const cost = input.cost ?? 1;
  const burst = resolveBurst(provider, group, nowMs);
  const rate = resolveRatePerSecond(provider, group, nowMs);
  const key = rateGroupBucketKey(provider, group, { instanceId: input.instanceId });

  const client = await getRedisClient();
  const evaled = await client.eval(RATE_CONSUME_LUA, 1, key, String(nowMs), String(rate), String(burst), String(cost), String(bucketTtlMs(burst, rate)));
  const parsed = JSON.parse(String(evaled)) as { allowed: number; remaining: number; retryAfterMs: number };

  return {
    allowed: Number(parsed.allowed) === 1,
    provider,
    group,
    remaining: Number(parsed.remaining),
    retryAfterMs: Number(parsed.retryAfterMs),
  };
}

function parseHeaders(
  provider: Parameters<typeof parseRateLimitHeaders>[0],
  group: Parameters<typeof parseRateLimitHeaders>[1],
  headers: RateLimitHeaderMap,
  observedAt: Date = new Date(),
): RateLimitSnapshot {
  return parseRateLimitHeaders(provider, group, headers, observedAt);
}

/**
 * 운영 배선 싱글턴. trade-worker(TL-104)와 향후 trade-stream-worker가 공유한다.
 * consume은 Lua로 원자적이며, parseHeaders는 provider별 헤더(Remaining-Req / X-RateLimit-*)를
 * 공통 RateLimitSnapshot으로 바꿔준다.
 */
export const tradeRateLimiter = { consume, parseHeaders };
