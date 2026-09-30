import "server-only";
import { getModel } from "libs/database/modelCache";
import { UserSchema, type IUserDocument } from "models/user";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { MONGODB_USERS_URL } from "consts/env/server";

export type PushPlatformType = "android" | "ios" | "web" | "unknown";

export type UserPushTokenInput = {
  token: string;
  platform?: string;
  appVersion?: string;
  locale?: string;
  timezone?: string;
};

type StoredPushTokenType = {
  token: string;
  platform: PushPlatformType;
  appVersion: string;
  locale: string;
  timezone: string;
  updatedAt: string;
};

const MAX_PUSH_TOKENS_PER_USER = 20;

function toSafeString(value: unknown, max = 128) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function normalizePlatform(value: unknown): PushPlatformType {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === "android" || v === "ios" || v === "web") return v;
  return "unknown";
}

function normalizeToken(value: unknown) {
  const token = String(value || "").trim();
  if (token.length < 20 || token.length > 4096) {
    throw new Error("invalid_push_token");
  }
  return token;
}

async function loadUserDocument(uid: string) {
  const cleanUid = toSafeString(uid, 128);
  if (!cleanUid) return null;

  const modelName = `${MONGODB_USER_MODEL_PREFIX}${cleanUid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
  return await UserModel.findOne({ uid: cleanUid });
}

type UserDocWithDevices = IUserDocument & {
  devices?: Record<string, unknown>;
  markModified: (field: string) => void;
};

function readStoredPushTokens(doc: UserDocWithDevices | null): StoredPushTokenType[] {
  const devices = (doc?.devices || {}) as Record<string, unknown>;
  const rawList = devices.pushTokens;
  if (!Array.isArray(rawList)) return [];

  return rawList
    .map((item: Record<string, unknown>) => {
      const token = String(item?.token || "").trim();
      if (!token) return null;

      return {
        token,
        platform: normalizePlatform(item?.platform),
        appVersion: toSafeString(item?.appVersion, 64),
        locale: toSafeString(item?.locale, 32),
        timezone: toSafeString(item?.timezone, 64),
        updatedAt: toSafeString(item?.updatedAt, 64) || new Date().toISOString(),
      } as StoredPushTokenType;
    })
    .filter(Boolean) as StoredPushTokenType[];
}

function writeStoredPushTokens(doc: UserDocWithDevices, tokens: StoredPushTokenType[]) {
  const prevDevices = (doc.devices || {}) as Record<string, unknown>;
  doc.devices = {
    ...prevDevices,
    pushTokens: tokens,
  };
  doc.markModified("devices");
}

export async function upsertUserPushToken(uid: string, input: UserPushTokenInput) {
  const doc = await loadUserDocument(uid);
  if (!doc) throw new Error("user_not_found");

  const token = normalizeToken(input.token);
  const current = readStoredPushTokens(doc);
  const nextItem: StoredPushTokenType = {
    token,
    platform: normalizePlatform(input.platform),
    appVersion: toSafeString(input.appVersion, 64),
    locale: toSafeString(input.locale, 32),
    timezone: toSafeString(input.timezone, 64),
    updatedAt: new Date().toISOString(),
  };

  const index = current.findIndex((it) => it.token === token);
  if (index >= 0) current[index] = nextItem;
  else current.push(nextItem);

  const deduped = Array.from(new Map(current.map((it) => [it.token, it])).values()).slice(-MAX_PUSH_TOKENS_PER_USER);

  writeStoredPushTokens(doc, deduped);
  await doc.save();

  return {
    tokenCount: deduped.length,
  };
}

export async function listUserPushTokens(uid: string): Promise<string[]> {
  const doc = await loadUserDocument(uid);
  if (!doc) return [];

  return Array.from(new Set(readStoredPushTokens(doc).map((it) => it.token)));
}

export async function removeUserPushTokens(uid: string, tokens?: string[]) {
  const doc = await loadUserDocument(uid);
  if (!doc) return { tokenCount: 0 };

  const clean = Array.isArray(tokens)
    ? Array.from(new Set(tokens.map((it) => String(it || "").trim()).filter(Boolean)))
    : [];

  const next = clean.length > 0 ? readStoredPushTokens(doc).filter((it) => !clean.includes(it.token)) : [];

  writeStoredPushTokens(doc, next);
  await doc.save();

  return {
    tokenCount: next.length,
  };
}
