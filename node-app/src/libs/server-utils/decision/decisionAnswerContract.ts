import type { DecisionAnswer, DecisionPoint } from "types/decision/decision";

type DecisionAnswerParseResult =
  | { ok: true; answer: DecisionAnswer }
  | { ok: false; reason: "invalid_answer"; detail: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && "value" in descriptor && descriptor.enumerable ? descriptor.value : undefined;
}

function invalid(detail: string): DecisionAnswerParseResult {
  return { ok: false, reason: "invalid_answer", detail };
}

function parseProbabilities(raw: unknown, expectedKeys: readonly string[]): Record<string, number> | null {
  if (!isPlainRecord(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) return null;

  const values: Array<[string, number]> = [];
  let total = 0;
  for (const key of expectedKeys) {
    const value = ownValue(raw, key);
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return null;
    values.push([key, value]);
    total += value;
  }

  return Math.abs(total - 1) <= 0.02 + Number.EPSILON
    ? Object.fromEntries(values) as Record<string, number>
    : null;
}

export function parseDecisionAnswer(point: DecisionPoint, raw: unknown): DecisionAnswerParseResult {
  try {
    if (!isPlainRecord(raw)) return invalid("answer must be a plain object");
    const type = ownValue(raw, "type");
    if (type !== point.primitive || point.question.type !== point.primitive) {
      return invalid("answer type must match the decision primitive");
    }

    if (point.primitive === "noul") {
      const noul = ownValue(raw, "noul");
      if (typeof noul !== "number" || !Number.isFinite(noul) || noul < 0 || noul > 1) {
        return invalid("noul must be between 0 and 1");
      }
      return { ok: true, answer: { type: "noul", noul } };
    }

    const confidence = ownValue(raw, "confidence");
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return invalid("confidence must be between 0 and 1");
    }

    if (point.primitive === "choice" && point.question.type === "choice") {
      const options = Object.keys(point.question.criteria);
      const choice = ownValue(raw, "choice");
      if (typeof choice !== "string" || !options.includes(choice)) return invalid("choice is outside the option set");
      const probabilities = parseProbabilities(ownValue(raw, "probabilities"), options);
      if (!probabilities) return invalid("probabilities must match the option set and sum to 1");
      return { ok: true, answer: { type: "choice", choice, probabilities, confidence } };
    }

    if (point.primitive === "score" && point.question.type === "score") {
      const rawLegend = ownValue(raw, "legend");
      if (!isPlainRecord(rawLegend)) return invalid("legend must be a record");
      const legendKeys = Object.keys(rawLegend);
      if (legendKeys.length === 0 || legendKeys.some((key) => key.trim() === "" || !Number.isFinite(Number(key)) || typeof ownValue(rawLegend, key) !== "string")) {
        return invalid("legend keys must be numeric strings with string labels");
      }

      const score = ownValue(raw, "score");
      if (typeof score !== "number" || !Number.isFinite(score) || !Object.hasOwn(rawLegend, String(score))) {
        return invalid("score must be finite and present in legend");
      }
      const probabilities = parseProbabilities(ownValue(raw, "probabilities"), legendKeys);
      if (!probabilities) return invalid("probabilities must match the legend and sum to 1");

      const legend = Object.fromEntries(legendKeys.map((key) => [key, ownValue(rawLegend, key) as string]));
      return { ok: true, answer: { type: "score", score, legend, probabilities, confidence } };
    }

    return invalid("answer does not match the decision point");
  } catch {
    return invalid("answer could not be safely inspected");
  }
}
