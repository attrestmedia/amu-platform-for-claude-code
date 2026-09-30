/**
 * ChromaKey v2 — 옵션 정규화·검증·optionsFingerprint 생성
 *
 * 서버·Worker·DB가 같은 옵션 의미를 공유하도록 결정적 직렬화 계약을 정의한다.
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */

import crypto from "crypto";
import {
  CHROMA_KEY_MODES, CHROMA_KEY_COVERAGE_MODES, CHROMA_KEY_PROFILES,
  type ChromaKeyOptionsType, type ChromaKeyModeType, type ChromaKeyProfileType, type ChromaKeyColorType,
} from "types/game/chroma-key";
import {
  CHROMA_KEY_ENGINE_VERSION, CHROMA_KEY_FIELD_RANGES, CHROMA_KEY_PROFILE_DEFAULTS,
} from "consts/game/chromaKeyPresets";

// -----------------------------------------------------------
// 정규화
// -----------------------------------------------------------

export function normalizeChromaKeyOptions(
  input: Partial<ChromaKeyOptionsType> & { keyMode: ChromaKeyModeType; profile: ChromaKeyProfileType },
): ChromaKeyOptionsType {
  const pd = CHROMA_KEY_PROFILE_DEFAULTS[input.profile];
  return {
    keyMode: input.keyMode,
    keyColor: input.keyMode === "custom" ? input.keyColor : undefined,
    similarity: input.similarity ?? pd.similarity,
    softness: input.softness ?? pd.softness,
    feather: input.feather ?? pd.feather,
    choke: input.choke ?? pd.choke,
    despill: input.despill ?? pd.despill,
    coverageMode: input.coverageMode ?? pd.coverageMode,
    cropTransparent: input.cropTransparent ?? pd.cropTransparent,
    profile: input.profile,
  };
}

// -----------------------------------------------------------
// 검증
// -----------------------------------------------------------

export type ChromaKeyOptionsValidationError = { field: string; message: string };

function validateRGB(c: ChromaKeyColorType, prefix: string): ChromaKeyOptionsValidationError[] {
  const errors: ChromaKeyOptionsValidationError[] = [];
  for (const ch of ["r", "g", "b"] as const) {
    const v = c[ch];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push({ field: `${prefix}.${ch}`, message: `${prefix}.${ch} must be a finite number` });
    } else if (v < 0 || v > 255 || !Number.isInteger(v)) {
      errors.push({ field: `${prefix}.${ch}`, message: `${prefix}.${ch} must be integer 0-255, got ${v}` });
    }
  }
  return errors;
}

function validateRange(field: string, value: number): ChromaKeyOptionsValidationError[] {
  const range = CHROMA_KEY_FIELD_RANGES[field as keyof typeof CHROMA_KEY_FIELD_RANGES];
  if (!range) return [];
  if (typeof value !== "number") return [{ field, message: `${field} must be a number` }];
  if (value < range.min || value > range.max) {
    return [{ field, message: `${field} must be ${range.min}–${range.max}, got ${value}` }];
  }
  return [];
}

export function validateChromaKeyOptions(opts: ChromaKeyOptionsType): ChromaKeyOptionsValidationError[] {
  const errors: ChromaKeyOptionsValidationError[] = [];
  if (!(CHROMA_KEY_MODES as readonly string[]).includes(opts.keyMode)) {
    errors.push({ field: "keyMode", message: `unknown keyMode: ${opts.keyMode}` });
  }
  if (opts.keyMode === "custom") {
    if (!opts.keyColor) errors.push({ field: "keyColor", message: "custom keyMode requires keyColor" });
    else errors.push(...validateRGB(opts.keyColor, "keyColor"));
  }
  if (!(CHROMA_KEY_COVERAGE_MODES as readonly string[]).includes(opts.coverageMode)) {
    errors.push({ field: "coverageMode", message: `unknown coverageMode: ${opts.coverageMode}` });
  }
  if (!(CHROMA_KEY_PROFILES as readonly string[]).includes(opts.profile)) {
    errors.push({ field: "profile", message: `unknown profile: ${opts.profile}` });
  }
  for (const f of ["similarity", "softness", "feather", "choke", "despill"] as const) {
    errors.push(...validateRange(f, opts[f]));
    if (!Number.isFinite(opts[f])) errors.push({ field: f, message: `${f} must be a finite number, got ${opts[f]}` });
  }
  if (opts.cropTransparent && opts.profile !== "single-character") {
    errors.push({ field: "cropTransparent", message: "cropTransparent only allowed for single-character profile" });
  }
  return errors;
}

// -----------------------------------------------------------
// optionsFingerprint
// -----------------------------------------------------------

const FINGERPRINT_FIELDS: (keyof ChromaKeyOptionsType)[] = [
  "keyMode", "keyColor", "similarity", "softness", "feather",
  "choke", "despill", "coverageMode", "cropTransparent", "profile",
];

function round4(n: number): string { return (Math.round(n * 10000) / 10000).toString(); }

export function serializeOptionsForFingerprint(opts: ChromaKeyOptionsType): string {
  const parts: string[] = [];
  for (const field of FINGERPRINT_FIELDS) {
    if (field === "keyColor") {
      parts.push(opts.keyColor ? `kc:${opts.keyColor.r},${opts.keyColor.g},${opts.keyColor.b}` : "kc:");
    } else {
      const v = opts[field];
      parts.push(`${field}:${typeof v === "number" ? round4(v) : String(v)}`);
    }
  }
  return parts.join("|");
}

export function computeOptionsFingerprint(
  sourceSha256: string, options: ChromaKeyOptionsType,
  engineVersion: string = CHROMA_KEY_ENGINE_VERSION,
): string {
  const payload = `${sourceSha256}|${engineVersion}|${serializeOptionsForFingerprint(normalizeChromaKeyOptions(options))}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function buildFingerprintPayload(
  sourceSha256: string, options: ChromaKeyOptionsType,
  engineVersion: string = CHROMA_KEY_ENGINE_VERSION,
): string {
  return `${sourceSha256}|${engineVersion}|${serializeOptionsForFingerprint(normalizeChromaKeyOptions(options))}`;
}
