import "server-only";
import { randomUUID } from "node:crypto";
import { getRedisClient } from "libs/cache/redisClient";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose provider 호출 전 server operationId 예약(reservation)으로 중복 제출·재시도 시 provider 중복 호출을 차단
 * @process claim(NX 예약) → 잔액 preflight → provider 호출 → 과금 → complete(결과 캐시) → 실패 시 release
 *          예약 중 다른 요청은 409, 완료된 operationId 재요청은 캐시 결과 replay
 * @domain billing_idempotency
 * @scope server_global
 */

const OPERATION_KEY_PREFIX = "amu:provider-operation:";
const IN_PROGRESS_TTL_SECONDS = 300;
const COMPLETED_TTL_SECONDS = 600;
const UNRESOLVED_TTL_SECONDS = 86_400;

const SAFE_OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,239}$/;

export type ProviderOperationStore = {
  get(key: string): Promise<string | null>;
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  compareAndSet(key: string, expected: string, next: string, ttlSeconds: number): Promise<boolean>;
  deleteIfValue(key: string, expected: string): Promise<boolean>;
};

export type ProviderOperationClaim =
  | { kind: "replay"; result: unknown }
  | { kind: "in_progress" }
  | { kind: "unresolved" }
  | { kind: "reserved"; ownerToken: string };

export type ProviderOperationLease =
  | { kind: "replay"; result: unknown }
  | {
      kind: "reserved";
      ownerToken: string;
      isTerminal(): boolean;
      complete(result: unknown): Promise<void>;
      release(): Promise<void>;
      markUnresolved(reason: string): Promise<void>;
    };

type StoredProviderOperation =
  | { state: "in_progress"; owner: string }
  | { state: "unresolved"; owner: string; reason: string; at: string }
  | { state: "completed"; result: unknown };

function inProgressValue(ownerToken: string) {
  return JSON.stringify({ state: "in_progress", owner: ownerToken } satisfies StoredProviderOperation);
}

function completedValue(result: unknown) {
  return JSON.stringify({ state: "completed", result } satisfies StoredProviderOperation);
}

function unresolvedValue(ownerToken: string, reason: string) {
  return JSON.stringify({
    state: "unresolved",
    owner: ownerToken,
    reason,
    at: new Date().toISOString(),
  } satisfies StoredProviderOperation);
}

function parseStored(raw: string | null): StoredProviderOperation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredProviderOperation;
    if (
      value &&
      (value.state === "in_progress" ||
        value.state === "completed" ||
        (value.state === "unresolved" &&
          typeof value.owner === "string" &&
          typeof value.reason === "string" &&
          typeof value.at === "string"))
    ) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

function operationKey(operationId: string) {
  return `${OPERATION_KEY_PREFIX}${operationId}`;
}

export function assertSafeOperationId(operationId: string) {
  if (!SAFE_OPERATION_ID_PATTERN.test(operationId)) {
    const err = new Error("operationId 형식이 유효하지 않습니다.") as Error & { errorCode?: string; status?: number };
    err.errorCode = "INVALID_OPERATION_ID";
    err.status = 400;
    throw err;
  }
}

function makeError(message: string, errorCode: string, status: number) {
  const err = new Error(message) as Error & { errorCode?: string; status?: number };
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

// Redis 장애 시 provider 중복보다 노출 차단을 우선한다(G-CI-01/G-CI-02 fail-closed).
// 과금 중복은 Mongo usage ledger의 operationId 멱등성이 별도로 방어한다.
const redisProviderOperationStore: ProviderOperationStore = {
  async get(key) {
    const redis = await getRedisClient();
    return redis.get(key);
  },
  async setIfAbsent(key, value, ttlSeconds) {
    const redis = await getRedisClient();
    const result = await redis.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  },
  async compareAndSet(key, expected, next, ttlSeconds) {
    const redis = await getRedisClient();
    const result = (await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3]) else return 0 end",
      1,
      key,
      expected,
      next,
      String(ttlSeconds),
    )) as unknown;
    return result === "OK";
  },
  async deleteIfValue(key, expected) {
    const redis = await getRedisClient();
    const result = (await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      expected,
    )) as unknown;
    return result === 1;
  },
};

// 테스트/계약 검증용 인메모리 스토어 (TTL 만료는 검증 범위 밖)
export function createInMemoryProviderOperationStore(): ProviderOperationStore {
  const values = new Map<string, string>();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async setIfAbsent(key, value) {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    async compareAndSet(key, expected, next) {
      if (values.get(key) !== expected) return false;
      values.set(key, next);
      return true;
    },
    async deleteIfValue(key, expected) {
      if (values.get(key) !== expected) return false;
      values.delete(key);
      return true;
    },
  };
}

export async function claimProviderOperation(
  operationId: string,
  store: ProviderOperationStore = redisProviderOperationStore,
): Promise<ProviderOperationClaim> {
  assertSafeOperationId(operationId);
  const key = operationKey(operationId);
  const ownerToken = randomUUID();
  const value = inProgressValue(ownerToken);

  try {
    const reserved = await store.setIfAbsent(key, value, IN_PROGRESS_TTL_SECONDS);
    if (reserved) return { kind: "reserved", ownerToken };

    const stored = parseStored(await store.get(key));
    if (stored?.state === "completed") return { kind: "replay", result: stored.result };
    if (stored?.state === "unresolved") return { kind: "unresolved" };
    return { kind: "in_progress" };
  } catch (error) {
    logger.error("[providerOperationGuard] claim 실패 — fail-closed로 차단:", { operationId, error });
    throw makeError(
      "일시적으로 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.",
      "PROVIDER_OPERATION_UNAVAILABLE",
      503,
    );
  }
}

async function completeProviderOperation(
  operationId: string,
  ownerToken: string,
  result: unknown,
  store: ProviderOperationStore = redisProviderOperationStore,
) {
  const key = operationKey(operationId);
  const expected = inProgressValue(ownerToken);
  const applied = await store.compareAndSet(key, expected, completedValue(result), COMPLETED_TTL_SECONDS);
  if (!applied) {
    // 예약이 만료되어 다른 요청이 소유한 경우 — 소유자가 아니므로 덮어쓰지 않는다.
    logger.warn("[providerOperationGuard] complete 스킵 — 예약 소유권 상실:", { operationId });
  }
}

async function releaseProviderOperation(
  operationId: string,
  ownerToken: string,
  store: ProviderOperationStore = redisProviderOperationStore,
) {
  const key = operationKey(operationId);
  const expected = inProgressValue(ownerToken);
  await store.deleteIfValue(key, expected);
}

export async function claimProviderOperationOrThrow(
  operationId: string,
  store: ProviderOperationStore = redisProviderOperationStore,
): Promise<ProviderOperationLease> {
  const claim = await claimProviderOperation(operationId, store);

  if (claim.kind === "in_progress") {
    throw makeError(
      "같은 요청이 이미 처리 중입니다. 잠시 후 다시 시도해주세요.",
      "PROVIDER_OPERATION_IN_PROGRESS",
      409,
    );
  }
  if (claim.kind === "unresolved") {
    throw makeError(
      "이전 요청의 처리 결과를 확인 중이라 같은 요청을 다시 보낼 수 없습니다. 새 요청으로 다시 시도해주세요.",
      "PROVIDER_OPERATION_UNRESOLVED",
      409,
    );
  }
  if (claim.kind === "replay") return claim;

  let terminal = false;
  return {
    kind: "reserved",
    ownerToken: claim.ownerToken,
    isTerminal() {
      return terminal;
    },
    async complete(result: unknown) {
      // provider 호출이 성공한 뒤이므로 complete 시도 자체가 terminal이다.
      // 저장 실패 시 release하지 않는다(TTL 자연 만료) — 과금 중복은 usage ledger operationId가 방어한다.
      terminal = true;
      try {
        await completeProviderOperation(operationId, claim.ownerToken, result, store);
      } catch (error) {
        logger.error("[providerOperationGuard] complete 실패 — 결과 캐시 없이 종료:", { operationId, error });
      }
    },
    async release() {
      if (terminal) return;
      terminal = true;
      try {
        await releaseProviderOperation(operationId, claim.ownerToken, store);
      } catch (error) {
        logger.error("[providerOperationGuard] release 실패:", { operationId, error });
      }
    },
    async markUnresolved(reason: string) {
      if (terminal) return;
      terminal = true;
      try {
        const applied = await store.compareAndSet(
          operationKey(operationId),
          inProgressValue(claim.ownerToken),
          unresolvedValue(claim.ownerToken, reason),
          UNRESOLVED_TTL_SECONDS,
        );
        if (!applied) {
          logger.warn("[providerOperationGuard] unresolved 상태 기록 스킵 — 예약 소유권 상실:", { operationId });
        }
      } catch {
        // 결과가 불확실한 요청은 release로 대체하지 않는다. 기존 예약이 만료될 때까지 재호출을 막는다.
        logger.error("[providerOperationGuard] unresolved 상태 기록 실패:", { operationId });
      }
    },
  };
}
