import "server-only";

import crypto from "crypto";
import { getRedisClient } from "libs/cache/redisClient";
import type { OAuthConnectionProvider } from "models/secure/OAuthConnectionSchema";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose OAuth authorization code 흐름의 1회용 서버 transaction 관리
 * @process 난수 state를 해시 키로 Redis에 10분 저장 → callback에서 actor/provider와 함께 원자 소비
 * @domain marketing
 * @scope server
 */

const TRANSACTION_TTL_SECONDS = 10 * 60;

export type MarketingOAuthTransaction = {
  provider: OAuthConnectionProvider | "linkedin";
  universeId: string;
  actorId: string;
  codeVerifier: string;
  redirectUri: string;
  returnPath: string;
  createdAt: string;
};

function transactionKey(state: string) {
  const digest = crypto.createHash("sha256").update(state).digest("hex");
  return `marketing:oauth:transaction:${digest}`;
}

export async function createMarketingOAuthTransaction(input: Omit<MarketingOAuthTransaction, "createdAt">) {
  const state = crypto.randomBytes(32).toString("base64url");
  const transaction: MarketingOAuthTransaction = {
    ...input,
    universeId: toSafeString(input.universeId),
    actorId: toSafeString(input.actorId),
    codeVerifier: toSafeString(input.codeVerifier),
    redirectUri: toSafeString(input.redirectUri),
    returnPath: toSafeString(input.returnPath),
    createdAt: new Date().toISOString(),
  };
  if (!transaction.universeId || !transaction.actorId || !transaction.redirectUri || !transaction.returnPath) {
    throw new Error("OAUTH_TRANSACTION_REQUIRED");
  }

  const client = await getRedisClient();
  const result = await client.set(
    transactionKey(state),
    JSON.stringify(transaction),
    "EX",
    TRANSACTION_TTL_SECONDS,
    "NX",
  );
  if (result !== "OK") throw new Error("OAUTH_TRANSACTION_STORE_FAILED");
  return { state, transaction };
}

export async function consumeMarketingOAuthTransaction(state: string) {
  const safeState = toSafeString(state);
  if (!safeState) return null;
  const client = await getRedisClient();
  const raw = await client.eval(
    `local value = redis.call("GET", KEYS[1])
     if value then redis.call("DEL", KEYS[1]) end
     return value`,
    1,
    transactionKey(safeState),
  );
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw) as MarketingOAuthTransaction;
  } catch {
    return null;
  }
}
