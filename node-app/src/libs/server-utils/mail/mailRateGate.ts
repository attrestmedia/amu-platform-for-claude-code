import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { AWS_SES_SEND_RATE_PER_SECOND } from "consts/env/server";
import { getRedisClient } from "libs/cache/redisClient";
import type { MailRateGate } from "./queueTypes";

const MAIL_RATE_KEY = "mail:ses:send-rate:v1";
const ACQUIRE_LUA = `
local ok = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])
if ok then return { 1, 0 } end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 1 then ttl = tonumber(ARGV[2]) end
return { 0, ttl }
`;

export function createRedisMailRateGate(ratePerSecond = AWS_SES_SEND_RATE_PER_SECOND): MailRateGate {
  if (!Number.isInteger(ratePerSecond) || ratePerSecond < 1 || ratePerSecond > 14) {
    throw new Error("INVALID_SES_SEND_RATE_PER_SECOND");
  }
  const intervalMs = Math.ceil(1000 / ratePerSecond);
  return {
    async acquire(nowMs = Date.now()) {
      const client = await getRedisClient();
      let observedAt = nowMs;
      while (true) {
        const result = (await client.eval(ACQUIRE_LUA, 1, MAIL_RATE_KEY, String(observedAt), String(intervalMs))) as [
          number,
          number,
        ];
        if (Number(result[0]) === 1) return { allowed: true, retryAfterMs: 0 };
        const retryAfterMs = Math.max(1, Number(result[1]) || intervalMs);
        await sleep(retryAfterMs);
        observedAt = Date.now();
      }
    },
  };
}

export const redisMailRateGate = createRedisMailRateGate();
