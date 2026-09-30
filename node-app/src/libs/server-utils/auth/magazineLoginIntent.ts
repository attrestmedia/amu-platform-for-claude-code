import "server-only";
import crypto from "crypto";
import { getRedisClient } from "libs/cache/redisClient";
import { normalizeSsoReturnTo } from "./ssoTicketService";

/**
 * @docHint
 * @purpose 매거진 소셜 로그인 1회용 intent 발급·소비
 * @process returnTo/provider 검증 → Redis NX 저장 → callback에서 원자 소비
 * @domain auth
 * @scope server-auth
 */

export const MAGAZINE_LOGIN_INTENT_COOKIE = "amu_magazine_login_intent";
export const MAGAZINE_LOGIN_INTENT_TTL_SECONDS = 10 * 60;
const KEY_PREFIX = "auth:magazine-login-intent:";

export const MAGAZINE_AUTH_PROVIDERS = ["google", "kakao", "naver"] as const;
export type MagazineAuthProvider = (typeof MAGAZINE_AUTH_PROVIDERS)[number];

type IntentRecord = {
  jti: string;
  mode: "login";
  source: "magazine";
  provider: MagazineAuthProvider;
  returnTo: string;
  exp: number;
};

export interface MagazineLoginIntentStore {
  put(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  take(key: string, provider: MagazineAuthProvider): Promise<string | null>;
  takeAny(key: string): Promise<string | null>;
}

export function isMagazineAuthProvider(value: unknown): value is MagazineAuthProvider {
  return typeof value === "string" && (MAGAZINE_AUTH_PROVIDERS as readonly string[]).includes(value);
}

function key(jti: string) {
  return `${KEY_PREFIX}${crypto.createHash("sha256").update(jti).digest("hex")}`;
}

function validateJti(value: unknown) {
  const jti = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(jti)) return null;
  return jti;
}

const redisStore: MagazineLoginIntentStore = {
  async put(cacheKey, value, ttlSeconds) {
    const redis = await getRedisClient();
    return (await redis.set(cacheKey, value, "EX", ttlSeconds, "NX")) === "OK";
  },
  async take(cacheKey, provider) {
    const redis = await getRedisClient();
    const result = await redis.eval(
      "local raw = redis.call('GET', KEYS[1]) if not raw then return nil end local ok, value = pcall(cjson.decode, raw) if not ok or value.provider ~= ARGV[1] then return nil end redis.call('DEL', KEYS[1]) return raw",
      1,
      cacheKey,
      provider,
    );
    return typeof result === "string" ? result : null;
  },
  async takeAny(cacheKey) {
    const redis = await getRedisClient();
    const result = await redis.eval(
      "local raw = redis.call('GET', KEYS[1]) if raw then redis.call('DEL', KEYS[1]) end return raw",
      1,
      cacheKey,
    );
    return typeof result === "string" ? result : null;
  },
};

export async function issueMagazineLoginIntent(args: {
  provider: unknown;
  returnTo: unknown;
  store?: MagazineLoginIntentStore;
  nowMs?: number;
}) {
  if (!isMagazineAuthProvider(args.provider)) throw new Error("MAGAZINE_PROVIDER_INVALID");
  const returnTo = normalizeSsoReturnTo(args.returnTo, "magazine");
  const nowMs = args.nowMs ?? Date.now();
  const jti = crypto.randomBytes(32).toString("base64url");
  const record: IntentRecord = {
    jti,
    mode: "login",
    source: "magazine",
    provider: args.provider,
    returnTo,
    exp: nowMs + MAGAZINE_LOGIN_INTENT_TTL_SECONDS * 1000,
  };
  const store = args.store || redisStore;
  if (!(await store.put(key(jti), JSON.stringify(record), MAGAZINE_LOGIN_INTENT_TTL_SECONDS))) {
    throw new Error("MAGAZINE_LOGIN_INTENT_UNAVAILABLE");
  }
  return { jti, returnTo, expiresIn: MAGAZINE_LOGIN_INTENT_TTL_SECONDS };
}

export async function consumeMagazineLoginIntent(args: {
  jti: unknown;
  provider: unknown;
  store?: MagazineLoginIntentStore;
  nowMs?: number;
}) {
  const jti = validateJti(args.jti);
  if (!jti || !isMagazineAuthProvider(args.provider)) return null;
  const raw = await (args.store || redisStore).take(key(jti), args.provider);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as IntentRecord;
    const nowMs = args.nowMs ?? Date.now();
    if (
      record.jti !== jti ||
      record.mode !== "login" ||
      record.source !== "magazine" ||
      record.provider !== args.provider ||
      record.exp < nowMs
    ) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function consumeMagazineLoginIntentForRecovery(args: {
  jti: unknown;
  store?: MagazineLoginIntentStore;
  nowMs?: number;
}) {
  const jti = validateJti(args.jti);
  if (!jti) return null;
  const raw = await (args.store || redisStore).takeAny(key(jti));
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as IntentRecord;
    if (
      record.jti !== jti ||
      record.mode !== "login" ||
      record.source !== "magazine" ||
      !isMagazineAuthProvider(record.provider) ||
      record.exp < (args.nowMs ?? Date.now())
    ) return null;
    return record;
  } catch {
    return null;
  }
}

export const magazineLoginIntentKey = key;
