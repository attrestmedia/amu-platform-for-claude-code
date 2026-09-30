import type { DecisionPoint, DecisionReasonCode, System2EscalationLevel } from "types/decision/decision";

export function resolveSystem2Escalation(args: {
  point: DecisionPoint;
  reasonCode: DecisionReasonCode;
}): System2EscalationLevel {
  if (args.reasonCode === "decided") return "none";
  if (args.reasonCode === "effect_requires_human") return "human_review";
  return args.point.fallback === "human_review" ? "human_review" : "standard_path";
}
