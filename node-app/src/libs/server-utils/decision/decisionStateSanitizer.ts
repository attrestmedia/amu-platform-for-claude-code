import { createHash } from "node:crypto";
import type { DecisionPoint, DecisionState, DecisionStateValue } from "types/decision/decision";

const FORBIDDEN_KEY_PATTERN = /secret|token|password|api[_-]?key|authorization|cookie|email|phone/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const PHONE_PATTERN = /\d{2,3}-?\d{3,4}-?\d{4}/;
const URL_PATTERN = /https?:\/\//i;
const LONG_TOKEN_PATTERN = /[A-Za-z0-9_-]{32,}/;

type SanitizedDecisionState =
  | { ok: true; state: DecisionState; digest: string; bytes: number }
  | { ok: false; reason: "state_rejected"; detail: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rejected(detail: string): SanitizedDecisionState {
  return { ok: false, reason: "state_rejected", detail };
}

function hasSensitiveValue(value: string): boolean {
  return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value) || URL_PATTERN.test(value) || LONG_TOKEN_PATTERN.test(value);
}

function canonicalJson(state: Record<string, DecisionStateValue>): string {
  const canonical = Object.create(null) as Record<string, DecisionStateValue>;
  for (const key of Object.keys(state).sort()) canonical[key] = state[key];
  return JSON.stringify(canonical);
}

export function sanitizeDecisionState(point: DecisionPoint, raw: unknown, nowMs: number): SanitizedDecisionState {
  try {
    if (!isPlainRecord(raw)) return rejected("state must be a plain object");
    if (!Array.isArray(point.stateAllowlist) || point.stateAllowlist.length === 0) return rejected("state allowlist is invalid");

    const { maxBytes, maxAgeMs, maxStringLength } = point.stateLimits;
    if (![maxBytes, maxAgeMs, maxStringLength].every((value) => Number.isFinite(value) && value > 0)) {
      return rejected("state limits are invalid");
    }

    const allowlist = [...new Set(point.stateAllowlist)];
    for (const key of allowlist) {
      if (typeof key !== "string" || key.length === 0) return rejected("state allowlist contains an invalid key");
      if (FORBIDDEN_KEY_PATTERN.test(key)) return rejected(`state key is not allowed: ${key}`);
    }

    const canonical = Object.create(null) as Record<string, DecisionStateValue>;
    for (const key of allowlist) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      if (!descriptor) {
        if (key === "observedAt") return rejected("observedAt is required for freshness validation");
        continue;
      }
      if (!("value" in descriptor) || !descriptor.enumerable) return rejected(`state field must be a data property: ${key}`);

      const value: unknown = descriptor.value;
      if (value !== null && typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number") {
        return rejected(`state field has an unsupported type: ${key}`);
      }
      if (typeof value === "number" && !Number.isFinite(value)) return rejected(`state field must be finite: ${key}`);
      if (typeof value === "string") {
        if (Array.from(value).length > maxStringLength) return rejected(`state field exceeds maxStringLength: ${key}`);
        if (hasSensitiveValue(value)) return rejected(`state field contains a sensitive-looking value: ${key}`);
      }
      canonical[key] = value as DecisionStateValue;
    }

    if (allowlist.includes("observedAt")) {
      const observedAt = canonical.observedAt;
      if (typeof observedAt !== "number" || !Number.isFinite(nowMs)) {
        return rejected("observedAt must be a finite timestamp in milliseconds");
      }
      if (nowMs - observedAt > maxAgeMs) return rejected("state is stale");
    }

    const serialized = canonicalJson(canonical);
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > maxBytes) return rejected("state exceeds maxBytes");

    const digest = createHash("sha256")
      .update(point.stateSchemaVersion, "utf8")
      .update("\0", "utf8")
      .update(serialized, "utf8")
      .digest("hex");

    const state = Object.fromEntries(Object.keys(canonical).map((key) => [key, canonical[key]])) as DecisionState;
    return { ok: true, state, digest, bytes };
  } catch {
    return rejected("state could not be safely inspected");
  }
}
