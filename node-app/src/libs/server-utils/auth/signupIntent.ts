import "server-only";
import crypto from "crypto";
import { getRedisClient } from "libs/cache/redisClient";

export const SIGNUP_INTENT_COOKIE = "amu_signup_intent";
const INTENT_TTL_SECONDS = 10 * 60;
const SIGNUP_INTENT_KEY_PREFIX = "auth:signup-intent:";

export type SignupIntentSource = "platform" | "magazine";

export type SignupIntentRecord = {
  jti: string;
  mode: "signup";
  source: SignupIntentSource;
  provider: "google" | "kakao" | "naver";
  returnTo: string;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
  exp: number;
};

export interface SignupIntentStore {
  put(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  take(key: string, provider: SignupIntentRecord["provider"]): Promise<string | null>;
  takeAny(key: string): Promise<string | null>;
}

function key(jti: string) {
  return `${SIGNUP_INTENT_KEY_PREFIX}${crypto.createHash("sha256").update(jti).digest("hex")}`;
}

const redisStore: SignupIntentStore = {
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

export async function issueSignupIntent(args: {
  source: SignupIntentSource;
  provider: SignupIntentRecord["provider"];
  returnTo: string;
  termsVersion: string;
  privacyVersion: string;
  store?: SignupIntentStore;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  const jti = crypto.randomBytes(32).toString("base64url");
  const record: SignupIntentRecord = {
    jti,
    mode: "signup",
    source: args.source,
    provider: args.provider,
    returnTo: args.returnTo,
    termsVersion: args.termsVersion,
    privacyVersion: args.privacyVersion,
    acceptedAt: new Date(nowMs).toISOString(),
    exp: nowMs + INTENT_TTL_SECONDS * 1000,
  };
  if (!(await (args.store || redisStore).put(key(jti), JSON.stringify(record), INTENT_TTL_SECONDS))) {
    throw new Error("SIGNUP_INTENT_UNAVAILABLE");
  }
  return { jti, expiresIn: INTENT_TTL_SECONDS };
}

export async function consumeSignupIntentForRecovery(args: {
  jti: unknown;
  store?: SignupIntentStore;
  nowMs?: number;
}) {
  const jti = typeof args.jti === "string" && /^[A-Za-z0-9_-]{43}$/.test(args.jti.trim()) ? args.jti.trim() : "";
  if (!jti) return null;
  const raw = await (args.store || redisStore).takeAny(key(jti));
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as SignupIntentRecord;
    if (
      record.jti !== jti ||
      record.mode !== "signup" ||
      !(["google", "kakao", "naver"] as const).includes(record.provider) ||
      !Number.isFinite(Date.parse(record.acceptedAt)) ||
      record.exp < (args.nowMs ?? Date.now())
    ) return null;
    return record;
  } catch {
    return null;
  }
}

export async function consumeSignupIntent(args: {
  jti: unknown;
  provider: string;
  store?: SignupIntentStore;
  nowMs?: number;
}) {
  const jti = typeof args.jti === "string" && /^[A-Za-z0-9_-]{43}$/.test(args.jti.trim()) ? args.jti.trim() : "";
  if (!jti) return null;
  const provider = args.provider as SignupIntentRecord["provider"];
  if (!(["google", "kakao", "naver"] as const).includes(provider)) return null;
  const raw = await (args.store || redisStore).take(key(jti), provider);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as SignupIntentRecord;
    if (
      record.jti !== jti ||
      record.mode !== "signup" ||
      record.provider !== args.provider ||
      !Number.isFinite(Date.parse(record.acceptedAt)) ||
      record.exp < (args.nowMs ?? Date.now())
    ) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export const SIGNUP_INTENT_MAX_AGE = INTENT_TTL_SECONDS;
