import "server-only";
import crypto from "crypto";
import mongoose from "mongoose";
import { dbConnect } from "libs/database/mongoose";
import { MONGODB_USERS_URL } from "consts/env/server";
import { UserIndexSchema, type IUserIndexDocument } from "models/user";

/**
 * @docHint
 * @purpose Magazine↔app 1회용 SSO 티켓 발급·원자 소비·계정 상태 재검증
 * @process returnTo·대상 검증 → Redis 60초 저장 → 대상 일치 원자 소비 → 계정 상태 확인
 * @domain auth
 * @scope server-auth
 */

export const SSO_TICKET_TTL_SECONDS = 60;
const TICKET_KEY_PREFIX = "auth:sso:ticket:";
const TARGET_MISMATCH = "__AMU_SSO_TARGET_MISMATCH__";

export type SsoTarget = "app" | "magazine";

export type SsoIdentity = {
  uid: string;
  email: string;
  name?: string;
};

type SsoTicketRecord = SsoIdentity & {
  version: 1;
  source: SsoTarget;
  target: SsoTarget;
  targetHost: string;
  returnTo: string;
  issuedAt: number;
  expiresAt: number;
};

export interface SsoTicketStore {
  put(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  take(key: string, targetHost: string): Promise<string | null | typeof TARGET_MISMATCH>;
}

export class SsoTicketError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function csvValues(raw: string | undefined) {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function ssoOrigin(target: SsoTarget) {
  const fallback = target === "app" ? "https://app.allmyuniverse.com" : "https://allmyuniverse.com";
  const raw = target === "app" ? process.env.SSO_APP_ORIGIN : process.env.SSO_MAGAZINE_ORIGIN;
  const url = new URL(String(raw || fallback));
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new SsoTicketError("sso_origin_insecure", 503);
  }
  return url;
}

export function normalizeSsoReturnTo(raw: unknown, target: SsoTarget) {
  const origin = ssoOrigin(target);
  const input = typeof raw === "string" && raw.trim() ? raw.trim() : `${origin.origin}/`;
  let url: URL;
  try {
    url = new URL(input, origin.origin);
  } catch {
    throw new SsoTicketError("return_to_invalid", 400);
  }

  const extraHosts = csvValues(
    target === "app" ? process.env.SSO_APP_ALLOWED_HOSTS : process.env.SSO_MAGAZINE_ALLOWED_HOSTS,
  );
  const allowedHosts = new Set([origin.host.toLowerCase(), ...extraHosts]);
  if (
    !allowedHosts.has(url.host.toLowerCase()) ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && process.env.NODE_ENV === "production")
  ) {
    throw new SsoTicketError("return_to_not_allowed", 400);
  }
  return url.toString();
}

export function normalizeSsoIdentity(identity: SsoIdentity): SsoIdentity {
  const uid = String(identity.uid || "").trim();
  const email = String(identity.email || "").trim().toLowerCase();
  const name = String(identity.name || "").trim();
  if (!/^\d+$/.test(uid) || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new SsoTicketError("identity_invalid", 400);
  }
  return { uid, email, ...(name ? { name } : {}) };
}

function ticketKey(ticket: string) {
  return `${TICKET_KEY_PREFIX}${crypto.createHash("sha256").update(ticket).digest("hex")}`;
}

function validateOpaqueTicket(ticket: unknown) {
  const value = typeof ticket === "string" ? ticket.trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new SsoTicketError("ticket_invalid", 400);
  return value;
}

export async function issueSsoTicket(args: {
  identity: SsoIdentity;
  source: SsoTarget;
  target: SsoTarget;
  returnTo?: unknown;
  store?: SsoTicketStore;
  nowMs?: number;
}) {
  if (args.source === args.target) throw new SsoTicketError("target_invalid", 400);
  const identity = normalizeSsoIdentity(args.identity);
  const returnTo = normalizeSsoReturnTo(args.returnTo, args.target);
  const targetHost = ssoOrigin(args.target).host.toLowerCase();
  const nowMs = args.nowMs ?? Date.now();
  const record: SsoTicketRecord = {
    version: 1,
    ...identity,
    source: args.source,
    target: args.target,
    targetHost,
    returnTo,
    issuedAt: nowMs,
    expiresAt: nowMs + SSO_TICKET_TTL_SECONDS * 1000,
  };
  const store = args.store || redisSsoTicketStore;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ticket = crypto.randomBytes(32).toString("base64url");
    if (await store.put(ticketKey(ticket), JSON.stringify(record), SSO_TICKET_TTL_SECONDS)) {
      return { ticket, expiresIn: SSO_TICKET_TTL_SECONDS, returnTo };
    }
  }
  throw new SsoTicketError("ticket_store_unavailable", 503);
}

export async function consumeSsoTicket(args: {
  ticket: unknown;
  target: SsoTarget;
  returnTo?: unknown;
  store?: SsoTicketStore;
  nowMs?: number;
}) {
  const ticket = validateOpaqueTicket(args.ticket);
  const requestedReturnTo = normalizeSsoReturnTo(args.returnTo, args.target);
  const expectedHost = ssoOrigin(args.target).host.toLowerCase();
  const raw = await (args.store || redisSsoTicketStore).take(ticketKey(ticket), expectedHost);
  if (raw === TARGET_MISMATCH) throw new SsoTicketError("ticket_target_mismatch", 403);
  if (!raw) throw new SsoTicketError("ticket_unavailable", 401);

  let record: SsoTicketRecord;
  try {
    record = JSON.parse(raw) as SsoTicketRecord;
  } catch {
    throw new SsoTicketError("ticket_invalid", 401);
  }
  const nowMs = args.nowMs ?? Date.now();
  if (
    record.version !== 1 ||
    record.target !== args.target ||
    record.targetHost !== expectedHost ||
    record.expiresAt < nowMs ||
    record.issuedAt > nowMs + 5_000 ||
    record.returnTo !== requestedReturnTo
  ) {
    throw new SsoTicketError("ticket_claims_invalid", 401);
  }
  return { identity: normalizeSsoIdentity(record), returnTo: record.returnTo };
}

export function assertActiveSsoIdentity(
  identity: SsoIdentity,
  account: { uid?: unknown; userEmailLower?: unknown; accountStatus?: unknown } | null,
) {
  const normalized = normalizeSsoIdentity(identity);
  if (
    !account ||
    String(account.uid || "") !== normalized.uid ||
    String(account.userEmailLower || "").toLowerCase() !== normalized.email ||
    String(account.accountStatus || "active") !== "active"
  ) {
    throw new SsoTicketError("account_not_active", 403);
  }
  return normalized;
}

export async function assertSsoAccountActive(identity: SsoIdentity) {
  const normalized = normalizeSsoIdentity(identity);
  const conn = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
  const user = await UserIndexModel.findOne({ uid: normalized.uid }, { uid: 1, userEmailLower: 1, accountStatus: 1 })
    .lean();
  return assertActiveSsoIdentity(normalized, user);
}

export const redisSsoTicketStore: SsoTicketStore = {
  async put(key, value, ttlSeconds) {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    return (await redis.set(key, value, "EX", ttlSeconds, "NX")) === "OK";
  },
  async take(key, targetHost) {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    const result = await redis.eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return nil end
       local ok, value = pcall(cjson.decode, raw)
       if not ok then redis.call('DEL', KEYS[1]); return nil end
       if value['targetHost'] ~= ARGV[1] then return '${TARGET_MISMATCH}' end
       redis.call('DEL', KEYS[1])
       return raw`,
      1,
      key,
      targetHost,
    );
    return typeof result === "string" ? result : null;
  },
};
