import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getRedisClient } from "libs/cache/redisClient";

/**
 * @docHint
 * @purpose Story Narrative writer를 사용자·유니버스 단위로 직렬화
 * @process Redis owner-token NX lease  TTL 갱신  owner 비교 해제
 * @domain interactive-story
 * @scope server-concurrency
 */

export const STORY_RUNTIME_LEASE_TTL_SECONDS = 15;
const LEASE_RENEW_INTERVAL_MS = 5_000;

export type StoryRuntimeLeaseStore = {
  acquire(key: string, ownerToken: string, ttlSeconds: number): Promise<boolean>;
  renew(key: string, ownerToken: string, ttlSeconds: number): Promise<boolean>;
  release(key: string, ownerToken: string): Promise<boolean>;
};

export type StoryRuntimeLeaseGuard = () => Promise<void>;
export type StoryRuntimeLeaseWork<T> = (assertOwned: StoryRuntimeLeaseGuard) => Promise<T>;

const redisStoryRuntimeLeaseStore: StoryRuntimeLeaseStore = {
  async acquire(key, ownerToken, ttlSeconds) {
    const redis = await getRedisClient();
    const result = await redis.set(key, ownerToken, "EX", ttlSeconds, "NX");
    return result === "OK";
  },
  async renew(key, ownerToken, ttlSeconds) {
    const redis = await getRedisClient();
    const result = await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end",
      1,
      key,
      ownerToken,
      String(ttlSeconds),
    );
    return result === 1;
  },
  async release(key, ownerToken) {
    const redis = await getRedisClient();
    const result = await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      ownerToken,
    );
    return result === 1;
  },
};

function errorWithCode(code: "STORY_BUSY" | "STORY_STATE_CONFLICT" | "STORY_RUNTIME_UNAVAILABLE") {
  return new Error(code);
}

function leaseKey(uid: string, universeId: string) {
  const identityHash = createHash("sha256").update(`${uid}\u0000${universeId}`).digest("hex").slice(0, 32);
  return `story-runtime:lease:${identityHash}`;
}

export async function withStoryRuntimeLease<T>(
  input: { uid: string; universeId: string },
  work: StoryRuntimeLeaseWork<T>,
  store: StoryRuntimeLeaseStore = redisStoryRuntimeLeaseStore,
): Promise<T> {
  const key = leaseKey(input.uid, input.universeId);
  const ownerToken = randomUUID();
  let acquired: boolean;
  try {
    acquired = await store.acquire(key, ownerToken, STORY_RUNTIME_LEASE_TTL_SECONDS);
  } catch {
    throw errorWithCode("STORY_RUNTIME_UNAVAILABLE");
  }
  if (!acquired) throw errorWithCode("STORY_BUSY");

  let leaseFailure: Error | null = null;
  let heartbeat = Promise.resolve();
  const heartbeatTimer = setInterval(() => {
    heartbeat = heartbeat
      .then(async () => {
        if (leaseFailure) return;
        const renewed = await store.renew(key, ownerToken, STORY_RUNTIME_LEASE_TTL_SECONDS);
        if (!renewed) leaseFailure = errorWithCode("STORY_STATE_CONFLICT");
      })
      .catch(() => {
        leaseFailure = errorWithCode("STORY_RUNTIME_UNAVAILABLE");
      });
  }, LEASE_RENEW_INTERVAL_MS);
  heartbeatTimer.unref?.();

  const assertOwned: StoryRuntimeLeaseGuard = async () => {
    if (leaseFailure) throw leaseFailure;
    try {
      const renewed = await store.renew(key, ownerToken, STORY_RUNTIME_LEASE_TTL_SECONDS);
      if (!renewed) {
        leaseFailure = errorWithCode("STORY_STATE_CONFLICT");
        throw leaseFailure;
      }
    } catch (error) {
      if (error instanceof Error && error.message === "STORY_STATE_CONFLICT") throw error;
      leaseFailure = errorWithCode("STORY_RUNTIME_UNAVAILABLE");
      throw leaseFailure;
    }
  };

  let result: T | undefined;
  let failure: unknown;
  try {
    result = await work(assertOwned);
  } catch (error) {
    failure = error;
  }

  clearInterval(heartbeatTimer);
  await heartbeat;
  if (!failure) {
    if (leaseFailure) {
      failure = leaseFailure;
    } else {
      try {
        await assertOwned();
      } catch (error) {
        failure = error;
      }
    }
  }

  try {
    const released = await store.release(key, ownerToken);
    if (!released && !failure) failure = errorWithCode("STORY_STATE_CONFLICT");
  } catch {
    if (!failure) failure = errorWithCode("STORY_RUNTIME_UNAVAILABLE");
  }

  if (failure) throw failure;
  return result as T;
}
