import type {
  DecisionAnswer,
  DecisionPoint,
  DecisionTraceRef,
  DecisionVerdict,
} from "types/decision/decision";
import { resolveSystem2Escalation } from "./system2Escalation";

function fallbackOutcome(point: DecisionPoint): "standard" | "human_review" {
  return point.fallback === "human_review" ? "human_review" : "standard";
}

export function composeDecisionVerdict(args: {
  point: DecisionPoint;
  answer: DecisionAnswer;
  threshold: number | null;
  traceRef: DecisionTraceRef | null;
}): DecisionVerdict {
  const { point, answer, traceRef } = args;
  const threshold =
    typeof args.threshold === "number" && Number.isFinite(args.threshold) && args.threshold >= 0 && args.threshold <= 1
      ? args.threshold
      : point.defaultThreshold;

  let outcome: DecisionVerdict["outcome"];
  let value: DecisionVerdict["value"] = null;
  let reasonCode: DecisionVerdict["reasonCode"];

  if (point.effectClass === "execute") {
    outcome = "human_review";
    reasonCode = "effect_requires_human";
  } else if (point.primitive === "choice" && answer.type === "choice") {
    if (answer.confidence >= threshold) {
      outcome = "decided";
      value = answer.choice;
      reasonCode = "decided";
    } else {
      outcome = fallbackOutcome(point);
      reasonCode = "below_threshold";
    }
  } else if (point.primitive === "score" && answer.type === "score") {
    if (answer.confidence >= threshold) {
      outcome = "decided";
      value = answer.score;
      reasonCode = "decided";
    } else {
      outcome = fallbackOutcome(point);
      reasonCode = "below_threshold";
    }
  } else if (point.primitive === "noul" && answer.type === "noul") {
    // Keep the mathematical boundary inclusive despite binary rounding in 1 - threshold.
    if (answer.noul >= threshold) {
      outcome = "decided";
      value = true;
      reasonCode = "decided";
    } else if (answer.noul <= 1 - threshold + Number.EPSILON) {
      outcome = "decided";
      value = false;
      reasonCode = "decided";
    } else {
      outcome = fallbackOutcome(point);
      reasonCode = "below_threshold";
    }
  } else {
    outcome = fallbackOutcome(point);
    reasonCode = "invalid_answer";
  }

  return {
    decisionPointId: point.id,
    outcome,
    value,
    escalation: resolveSystem2Escalation({ point, reasonCode }),
    reasonCode,
    traceRef,
  };
}
