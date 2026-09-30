import "server-only";

import { MARKETING_QUEUE_LEASE_TTL_MS } from "consts/marketing/queue";
import { getRedisClient } from "libs/cache/redisClient";
import { getMarketingJobLeaseKey } from "./keys";

function toLeaseTtlMs(ttlMs?: number) {
  const next = Number(ttlMs || MARKETING_QUEUE_LEASE_TTL_MS);
  return Math.max(1000, Math.min(3600000, Number.isFinite(next) ? next : MARKETING_QUEUE_LEASE_TTL_MS));
}

export async function acquireMarketingJobLease(args: { jobId: string; workerId: string; ttlMs?: number }) {
  const client = await getRedisClient();
  const key = getMarketingJobLeaseKey(args.jobId);
  const ttlMs = toLeaseTtlMs(args.ttlMs);
  const result = await client.set(key, args.workerId, "PX", ttlMs, "NX");
  return result === "OK";
}

export async function renewMarketingJobLease(args: { jobId: string; workerId: string; ttlMs?: number }) {
  const client = await getRedisClient();
  const key = getMarketingJobLeaseKey(args.jobId);
  const currentOwner = await client.get(key);
  if (currentOwner !== args.workerId) return false;
  const ttlMs = toLeaseTtlMs(args.ttlMs);
  const result = await client.pexpire(key, ttlMs);
  return result === 1;
}

export async function releaseMarketingJobLease(args: { jobId: string; workerId: string }) {
  const client = await getRedisClient();
  const key = getMarketingJobLeaseKey(args.jobId);
  const released = await client.eval(
    `
      local key = KEYS[1]
      local workerId = ARGV[1]
      local current = redis.call("GET", key)
      if current == workerId then
        return redis.call("DEL", key)
      end
      return 0
    `,
    1,
    key,
    args.workerId,
  );

  return Number(released || 0) === 1;
}

export async function getMarketingJobLease(args: { jobId: string }) {
  const client = await getRedisClient();
  const key = getMarketingJobLeaseKey(args.jobId);
  const [workerId, ttlMs] = await Promise.all([client.get(key), client.pttl(key)]);
  return {
    workerId: workerId || null,
    ttlMs,
  };
}
