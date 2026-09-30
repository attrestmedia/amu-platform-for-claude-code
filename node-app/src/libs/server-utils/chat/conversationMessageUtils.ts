import "server-only";
import { SYSTEM_CODES } from "consts/ai";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

export const wasUpserted = (r: unknown) => {
  const rec = toUnknownRecord(r);
  return Boolean(rec.upsertedId || rec.upsertedCount);
};
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function buildSessionLocationUpdate(location?: string) {
  const locationValue = String(location || "unknown");
  return location
    ? { setOnInsert: {}, set: { location: locationValue } }
    : { setOnInsert: { location: locationValue }, set: {} };
}
export function safeDate(input: unknown, fallback: Date) {
  try {
    if (input instanceof Date) {
      return Number.isFinite(input.getTime()) ? input : fallback;
    }
    if (typeof input !== "string" && typeof input !== "number") return fallback;
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : fallback;
  } catch {
    return fallback;
  }
}
export function normalizeStringArray(v: unknown, { max = 50 }: { max?: number } = {}) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  const cleaned = arr.map((x) => String(x ?? "").trim()).filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, max);
}
export function normalizeSystemCode(v: unknown) {
  const raw = normalizeStringArray(v, { max: 20 });
  const allow = new Set<string>(SYSTEM_CODES as unknown as string[]);
  return raw.filter((c) => allow.has(c) || /^mood-[a-z0-9_-]+$/i.test(c));
}

function normalizeTrimmedString(v: unknown, max = 200) {
  const value = String(v ?? "").trim();
  if (!value) return "";
  return value.slice(0, Math.max(1, max));
}

function normalizePositiveNumber(v: unknown) {
  const value = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function normalizeAudioStorage(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const rec = v as UnknownRecord;
  const driver = normalizeTrimmedString(rec.driver, 24).toLowerCase();
  const bucket = normalizeTrimmedString(rec.bucket, 160);
  const key = normalizeTrimmedString(rec.key, 600);
  if (driver !== "r2" || !bucket || !key) return undefined;

  const accessRaw = normalizeTrimmedString(rec.access, 24).toLowerCase();
  const access = accessRaw === "public" ? "public" : "private";
  return {
    driver: "r2",
    access,
    bucket,
    key,
    url: normalizeTrimmedString(rec.url, 2000) || undefined,
    mimeType: normalizeTrimmedString(rec.mimeType, 80) || undefined,
    ext: normalizeTrimmedString(rec.ext, 16) || undefined,
    bytes: normalizePositiveNumber(rec.bytes),
    sha256: normalizeTrimmedString(rec.sha256, 80) || undefined,
    temporary: rec.temporary === true || String(rec.temporary || "").toLowerCase() === "true" || undefined,
    expiresAt: normalizeTrimmedString(rec.expiresAt, 40) || undefined,
  };
}

export function normalizeMessageAudioMeta(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;

  const rec: UnknownRecord = v as UnknownRecord;
  const providerRaw = normalizeTrimmedString(rec.provider, 32).toLowerCase();
  const provider =
    providerRaw === "openai" || providerRaw === "google" || providerRaw === "elevenlabs" ? providerRaw : undefined;
  const statusRaw = normalizeTrimmedString(rec.status, 16).toLowerCase();
  const status =
    statusRaw === "pending" || statusRaw === "ready" || statusRaw === "failed" ? statusRaw : undefined;
  const generatedAt = rec.generatedAt ? safeDate(rec.generatedAt, new Date()) : undefined;

  const out = {
    provider,
    voiceId: normalizeTrimmedString(rec.voiceId, 80) || undefined,
    modelName: normalizeTrimmedString(rec.modelName, 120) || undefined,
    locale: normalizeTrimmedString(rec.locale, 24) || undefined,
    voiceFingerprint: normalizeTrimmedString(rec.voiceFingerprint, 64) || undefined,
    cacheKey: normalizeTrimmedString(rec.cacheKey, 200) || undefined,
    contentType: normalizeTrimmedString(rec.contentType, 80) || undefined,
    bytes: normalizePositiveNumber(rec.bytes),
    durationMs: normalizePositiveNumber(rec.durationMs),
    storage: normalizeAudioStorage(rec.storage),
    status,
    errorCode: normalizeTrimmedString(rec.errorCode, 80) || undefined,
    generatedAt,
  };

  return Object.values(out).some((value) => value !== undefined) ? out : undefined;
}
