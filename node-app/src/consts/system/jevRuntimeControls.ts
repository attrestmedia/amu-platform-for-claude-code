/**
 * @docHint
 * @purpose JEV Decision Runtime 운영 설정과 입력 정규화
 * @process 기본 OFF 선언  저장값 정규화  관리자 PATCH 경계 검증
 * @domain system-control
 * @scope shared
 */

import { SERVICE_KEYS } from "consts/system/serviceAvailability";
import type { DecisionService } from "types/decision/decision";

export const JEV_RUNTIME_CONTROLS_SETTING_KEY = "platform.jev-runtime-controls.v1";

export type JevRuntimeControls = {
  killSwitch: boolean;
  providerEnabled: boolean;
  services: Partial<Record<DecisionService, { enabled: boolean }>>;
  decisionPoints: Record<string, { enabled: boolean; rolloutPercent: number; threshold: number | null }>;
  modelPin: string;
  timeoutMs: number;
  maxResponseBytes: number;
  circuit: { failureThreshold: number; failureWindowSeconds: number; openSeconds: number };
  dailyCogsUsdCap: number;
};

export type JevRuntimeControlsPatch = Omit<
  Partial<JevRuntimeControls>,
  "services" | "decisionPoints" | "circuit"
> & {
  services?: Partial<JevRuntimeControls["services"]>;
  decisionPoints?: Record<string, Partial<JevRuntimeControls["decisionPoints"][string]>>;
  circuit?: Partial<JevRuntimeControls["circuit"]>;
};

export const DEFAULT_JEV_RUNTIME_CONTROLS: JevRuntimeControls = {
  killSwitch: false,
  providerEnabled: false,
  services: {},
  decisionPoints: {},
  modelPin: "jev-1.13.0",
  timeoutMs: 1500,
  maxResponseBytes: 65536,
  circuit: { failureThreshold: 3, failureWindowSeconds: 60, openSeconds: 120 },
  dailyCogsUsdCap: 0,
};

const DECISION_POINT_ID_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+\.v[1-9][0-9]*$/;
const MODEL_PIN_PATTERN = /^jev-[a-z0-9.\-]+$/;
const SERVICE_KEYS_WITH_PLATFORM = [...SERVICE_KEYS, "platform"] as const;
const PATCH_KEYS = new Set([
  "killSwitch",
  "providerEnabled",
  "services",
  "decisionPoints",
  "modelPin",
  "timeoutMs",
  "maxResponseBytes",
  "circuit",
  "dailyCogsUsdCap",
]);

type UnknownObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneDefaults(): JevRuntimeControls {
  return {
    ...DEFAULT_JEV_RUNTIME_CONTROLS,
    services: {},
    decisionPoints: {},
    circuit: { ...DEFAULT_JEV_RUNTIME_CONTROLS.circuit },
  };
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBoundedNumber(value: unknown, fallback: number, min: number, max: number, integer = false): number {
  const parsed = finiteNumberOr(value, fallback);
  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.floor(bounded) : bounded;
}

function normalizeCircuit(raw: unknown): JevRuntimeControls["circuit"] {
  const value = isPlainObject(raw) ? raw : {};
  return {
    failureThreshold: normalizeBoundedNumber(value.failureThreshold, 3, 1, Number.MAX_SAFE_INTEGER, true),
    failureWindowSeconds: normalizeBoundedNumber(value.failureWindowSeconds, 60, 10, Number.MAX_SAFE_INTEGER, true),
    openSeconds: normalizeBoundedNumber(value.openSeconds, 120, 10, Number.MAX_SAFE_INTEGER, true),
  };
}

function normalizeServices(raw: unknown): JevRuntimeControls["services"] {
  if (!isPlainObject(raw)) return {};
  const normalized: JevRuntimeControls["services"] = {};
  for (const service of SERVICE_KEYS_WITH_PLATFORM) {
    if (!Object.hasOwn(raw, service)) continue;
    const entry = raw[service];
    const enabled = isPlainObject(entry) && typeof entry.enabled === "boolean" ? entry.enabled : false;
    normalized[service] = { enabled };
  }
  return normalized;
}

function normalizeDecisionPoints(raw: unknown): JevRuntimeControls["decisionPoints"] {
  if (!isPlainObject(raw)) return {};
  const normalized: JevRuntimeControls["decisionPoints"] = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!DECISION_POINT_ID_PATTERN.test(id)) continue;
    const point = isPlainObject(entry) ? entry : {};
    const threshold = point.threshold === null
      ? null
      : typeof point.threshold === "number" && Number.isFinite(point.threshold)
        ? Math.min(1, Math.max(0, point.threshold))
        : null;
    normalized[id] = {
      enabled: point.enabled === true,
      rolloutPercent: normalizeBoundedNumber(point.rolloutPercent, 0, 0, 100, true),
      threshold,
    };
  }
  return normalized;
}

/** 저장값은 매번 정규화하며, 기본값은 JEV 호출을 항상 차단한다. */
export function normalizeJevRuntimeControls(
  raw: unknown,
): { ok: true; controls: JevRuntimeControls } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, controls: cloneDefaults() };
  if (!isPlainObject(raw)) return { ok: false };

  const modelPin = typeof raw.modelPin === "string" && MODEL_PIN_PATTERN.test(raw.modelPin)
    ? raw.modelPin
    : DEFAULT_JEV_RUNTIME_CONTROLS.modelPin;
  const dailyCogsUsdCap = finiteNumberOr(raw.dailyCogsUsdCap, 0);

  return {
    ok: true,
    controls: {
      killSwitch: typeof raw.killSwitch === "boolean" ? raw.killSwitch : false,
      providerEnabled: typeof raw.providerEnabled === "boolean" ? raw.providerEnabled : false,
      services: normalizeServices(raw.services),
      decisionPoints: normalizeDecisionPoints(raw.decisionPoints),
      modelPin,
      timeoutMs: normalizeBoundedNumber(raw.timeoutMs, 1500, 200, 10000, true),
      maxResponseBytes: normalizeBoundedNumber(raw.maxResponseBytes, 65536, 1024, 1048576, true),
      circuit: normalizeCircuit(raw.circuit),
      dailyCogsUsdCap: Math.max(0, dailyCogsUsdCap),
    },
  };
}

export type JevRuntimeControlsPatchValidation =
  | { valid: true; patch: JevRuntimeControlsPatch }
  | { valid: false; error: string };

export type JevRuntimeControlsRequestValidation =
  | { valid: true; reason: string; patch: JevRuntimeControlsPatch }
  | { valid: false; error: string };

export function validateJevRuntimeControlsRequest(raw: unknown): JevRuntimeControlsRequestValidation {
  if (!isPlainObject(raw)) return { valid: false, error: "요청 내용은 객체여야 합니다." };
  if (typeof raw.reason !== "string" || !raw.reason.trim()) {
    return { valid: false, error: "변경 사유가 필요합니다." };
  }
  const patch = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "reason"));
  const validated = validateJevRuntimeControlsPatch(patch);
  if (!validated.valid) return validated;
  return { valid: true, reason: raw.reason.trim(), patch: validated.patch };
}

/** 관리자 입력은 정규화로 조용히 고치지 않고, 오타와 범위 오류를 PATCH 경계에서 거부한다. */
export function validateJevRuntimeControlsPatch(raw: unknown): JevRuntimeControlsPatchValidation {
  if (!isPlainObject(raw)) return { valid: false, error: "설정 변경 내용은 객체여야 합니다." };
  for (const key of Object.keys(raw)) {
    if (!PATCH_KEYS.has(key)) return { valid: false, error: `지원하지 않는 설정 항목입니다: ${key}` };
  }
  if (Object.keys(raw).length === 0) return { valid: false, error: "변경할 설정을 하나 이상 입력해 주세요." };

  const patch: JevRuntimeControlsPatch = {};
  if (raw.killSwitch !== undefined) {
    if (typeof raw.killSwitch !== "boolean") return { valid: false, error: "killSwitch는 boolean이어야 합니다." };
    patch.killSwitch = raw.killSwitch;
  }
  if (raw.providerEnabled !== undefined) {
    if (typeof raw.providerEnabled !== "boolean") return { valid: false, error: "providerEnabled는 boolean이어야 합니다." };
    patch.providerEnabled = raw.providerEnabled;
  }
  if (raw.services !== undefined) {
    if (!isPlainObject(raw.services)) return { valid: false, error: "services는 객체여야 합니다." };
    const services: JevRuntimeControls["services"] = {};
    for (const [service, entry] of Object.entries(raw.services)) {
      if (!(SERVICE_KEYS_WITH_PLATFORM as readonly string[]).includes(service)) {
        return { valid: false, error: `지원하지 않는 service입니다: ${service}` };
      }
      if (!isPlainObject(entry) || Object.keys(entry).some((key) => key !== "enabled") || typeof entry.enabled !== "boolean") {
        return { valid: false, error: `services.${service}.enabled는 boolean이어야 합니다.` };
      }
      services[service as DecisionService] = { enabled: entry.enabled };
    }
    patch.services = services;
  }
  if (raw.decisionPoints !== undefined) {
    if (!isPlainObject(raw.decisionPoints)) return { valid: false, error: "decisionPoints는 객체여야 합니다." };
    const decisionPoints: NonNullable<JevRuntimeControlsPatch["decisionPoints"]> = {};
    for (const [id, entry] of Object.entries(raw.decisionPoints)) {
      if (!DECISION_POINT_ID_PATTERN.test(id)) return { valid: false, error: `잘못된 DecisionPoint ID입니다: ${id}` };
      if (!isPlainObject(entry)) return { valid: false, error: `decisionPoints.${id}는 객체여야 합니다.` };
      for (const key of Object.keys(entry)) {
        if (!["enabled", "rolloutPercent", "threshold"].includes(key)) {
          return { valid: false, error: `decisionPoints.${id}에 지원하지 않는 항목이 있습니다: ${key}` };
        }
      }
      if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") {
        return { valid: false, error: `decisionPoints.${id}.enabled는 boolean이어야 합니다.` };
      }
      if (
        entry.rolloutPercent !== undefined &&
        (typeof entry.rolloutPercent !== "number" || !Number.isInteger(entry.rolloutPercent) || entry.rolloutPercent < 0 || entry.rolloutPercent > 100)
      ) {
        return { valid: false, error: `decisionPoints.${id}.rolloutPercent는 0~100 정수여야 합니다.` };
      }
      if (
        entry.threshold !== undefined &&
        entry.threshold !== null &&
        (typeof entry.threshold !== "number" || !Number.isFinite(entry.threshold) || entry.threshold < 0 || entry.threshold > 1)
      ) {
        return { valid: false, error: `decisionPoints.${id}.threshold는 0~1 숫자 또는 null이어야 합니다.` };
      }
      decisionPoints[id] = {
        ...(entry.enabled !== undefined ? { enabled: entry.enabled as boolean } : {}),
        ...(entry.rolloutPercent !== undefined ? { rolloutPercent: entry.rolloutPercent as number } : {}),
        ...(entry.threshold !== undefined ? { threshold: entry.threshold as number | null } : {}),
      };
    }
    patch.decisionPoints = decisionPoints;
  }
  if (raw.modelPin !== undefined) {
    if (typeof raw.modelPin !== "string" || !MODEL_PIN_PATTERN.test(raw.modelPin)) {
      return { valid: false, error: "modelPin 형식이 올바르지 않습니다." };
    }
    patch.modelPin = raw.modelPin;
  }
  if (raw.timeoutMs !== undefined) {
    if (typeof raw.timeoutMs !== "number" || !Number.isInteger(raw.timeoutMs) || raw.timeoutMs < 200 || raw.timeoutMs > 10000) {
      return { valid: false, error: "timeoutMs는 200~10000 정수여야 합니다." };
    }
    patch.timeoutMs = raw.timeoutMs;
  }
  if (raw.maxResponseBytes !== undefined) {
    if (
      typeof raw.maxResponseBytes !== "number" ||
      !Number.isInteger(raw.maxResponseBytes) ||
      raw.maxResponseBytes < 1024 ||
      raw.maxResponseBytes > 1048576
    ) {
      return { valid: false, error: "maxResponseBytes는 1024~1048576 정수여야 합니다." };
    }
    patch.maxResponseBytes = raw.maxResponseBytes;
  }
  if (raw.circuit !== undefined) {
    if (!isPlainObject(raw.circuit)) return { valid: false, error: "circuit은 객체여야 합니다." };
    const circuit: Partial<JevRuntimeControls["circuit"]> = {};
    for (const [key, value] of Object.entries(raw.circuit)) {
      if (!["failureThreshold", "failureWindowSeconds", "openSeconds"].includes(key)) {
        return { valid: false, error: `circuit에 지원하지 않는 항목이 있습니다: ${key}` };
      }
      const min = key === "failureThreshold" ? 1 : 10;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
        return { valid: false, error: `circuit.${key}는 ${min} 이상의 정수여야 합니다.` };
      }
      circuit[key as keyof typeof circuit] = value;
    }
    if (Object.keys(circuit).length === 0) return { valid: false, error: "circuit 변경 값을 입력해 주세요." };
    patch.circuit = circuit;
  }
  if (raw.dailyCogsUsdCap !== undefined) {
    if (typeof raw.dailyCogsUsdCap !== "number" || !Number.isFinite(raw.dailyCogsUsdCap) || raw.dailyCogsUsdCap < 0) {
      return { valid: false, error: "dailyCogsUsdCap은 0 이상의 유한한 숫자여야 합니다." };
    }
    patch.dailyCogsUsdCap = raw.dailyCogsUsdCap;
  }
  return { valid: true, patch };
}
