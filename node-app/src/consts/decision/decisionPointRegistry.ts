import { SERVICE_KEYS } from "consts/system/serviceAvailability";
import { DECISION_EFFECT_CLASSES, DECISION_PRIMITIVES, type DecisionPoint } from "types/decision/decision";
import { logger } from "utils/log";

const DECISION_POINT_ID_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+\.v[1-9][0-9]*$/;
const VALID_SERVICES = new Set<string>([...SERVICE_KEYS, "platform"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// 운영 지점은 JEV-106·JEV-110 이 추가한다. 빈 레지스트리는 기본값에서 JEV 호출 경로 0건을 보장한다.
export const DECISION_POINT_REGISTRY: readonly DecisionPoint[] = [];

export function validateDecisionPoint(point: DecisionPoint): string[] {
  if (!isPlainRecord(point)) return ["decision point must be a plain object"];

  const issues: string[] = [];
  const id = point.id;
  const service = point.service;

  if (typeof id !== "string" || !DECISION_POINT_ID_PATTERN.test(id)) {
    issues.push("id must match <service>.<name>.v<N>");
  }
  if (typeof service !== "string" || !VALID_SERVICES.has(service)) {
    issues.push("service is not supported");
  } else if (typeof id === "string" && !id.startsWith(`${service}.`)) {
    issues.push("id prefix must match service");
  }
  if (!DECISION_PRIMITIVES.includes(point.primitive)) issues.push("primitive is not supported");
  if (!DECISION_EFFECT_CLASSES.includes(point.effectClass)) issues.push("effect class is not supported");
  if (point.fallback !== "standard" && point.fallback !== "human_review") issues.push("fallback is not supported");

  const question = point.question;
  if (!isPlainRecord(question)) {
    issues.push("question must be a plain object");
  } else {
    if (question.type !== point.primitive) issues.push("question type must match primitive");
    if (question.type === "choice") {
      if (!isPlainRecord(question.criteria)) {
        issues.push("choice criteria must be a record");
      } else {
        const optionCount = Object.keys(question.criteria).length;
        if (optionCount < 1 || optionCount > 255) issues.push("choice criteria must contain 1 to 255 options");
        if (Object.values(question.criteria).some((value) => value !== null && typeof value !== "string")) {
          issues.push("choice criteria values must be strings or null");
        }
      }
    } else if (question.type === "score") {
      if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10) {
        issues.push("score criteria must contain 2 to 10 levels");
      }
    }
  }

  const smartMode = point.smartMode;
  if (!isPlainRecord(smartMode)) {
    issues.push("smartMode must be a plain object");
  } else {
    if (smartMode.defaultEnabled !== false) issues.push("smartMode.defaultEnabled must be false");
    if (smartMode.fallbackToStandard !== true) issues.push("smartMode.fallbackToStandard must be true");
    if (typeof smartMode.supported !== "boolean") issues.push("smartMode.supported must be boolean");
  }

  if (typeof point.defaultThreshold !== "number" || !Number.isFinite(point.defaultThreshold) || point.defaultThreshold < 0 || point.defaultThreshold > 1) {
    issues.push("defaultThreshold must be between 0 and 1");
  }

  const stateLimits = point.stateLimits;
  if (!isPlainRecord(stateLimits)) {
    issues.push("stateLimits must be a plain object");
  } else {
    for (const key of ["maxBytes", "maxAgeMs", "maxStringLength"] as const) {
      const value = stateLimits[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        issues.push(`stateLimits.${key} must be positive`);
      }
    }
  }

  const stateAllowlist = point.stateAllowlist;
  if (!Array.isArray(stateAllowlist) || stateAllowlist.length === 0) {
    issues.push("stateAllowlist must not be empty");
  } else {
    if (stateAllowlist.some((key) => typeof key !== "string" || key.length === 0)) {
      issues.push("stateAllowlist entries must be non-empty strings");
    }
    if (new Set(stateAllowlist).size !== stateAllowlist.length) issues.push("stateAllowlist must not contain duplicates");
  }

  if (point.effectClass === "execute" && point.fallback !== "human_review") {
    issues.push("execute decisions must fall back to human_review");
  }

  return issues;
}

for (const point of DECISION_POINT_REGISTRY) {
  const issues = validateDecisionPoint(point);
  if (issues.length > 0) {
    logger.error("[decision-point-registry] invalid point excluded", { decisionPointId: point.id, issues });
  }
}

export function getDecisionPoint(
  id: string,
  registry: readonly DecisionPoint[] = DECISION_POINT_REGISTRY,
): DecisionPoint | null {
  return registry.find((point) => point.id === id && validateDecisionPoint(point).length === 0) ?? null;
}
