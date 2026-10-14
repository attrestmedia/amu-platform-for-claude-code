import type { BillableProviderType } from "types/ai";
import { AI_MODEL_ROUTING_POLICY, AI_MODEL_ROUTING_ROLES } from "./generated/modelCatalog.generated";
import type { AssertAssignable } from "./catalogShapeAssertion";


export type AiRoutingRole = (typeof AI_MODEL_ROUTING_ROLES)[number];

export type AiRoutingCandidate = {
  provider: BillableProviderType | null;
  modelName: string | null;
  catalogKey: string | null;
};

export type ModelRoutingPolicyCanonicalShape = [
  AssertAssignable<typeof AI_MODEL_ROUTING_ROLES, readonly string[]>,
  AssertAssignable<typeof AI_MODEL_ROUTING_POLICY, Record<AiRoutingRole, AiRoutingCandidate>>,
];

export const AI_ROUTING_POLICY_VERSION = "r6-v1" as const;
export const AI_ROUTING_ROLLOUT = {
  service: "gen-studio",
  rolloutPercent: 10,
  minBenchmarkCases: 3,
  qualityRegressionMax: 0.05,
  costSavingMin: 0.15,
  killSwitchEnv: "AI_ROUTING_ROLLOUT_ENABLED",
  benchmarkVerdictEnv: "AI_ROUTING_BENCHMARK_VERDICT",
} as const;

function stableBucket(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function isAiRoutingRolloutEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env[AI_ROUTING_ROLLOUT.killSwitchEnv] === "true" && env[AI_ROUTING_ROLLOUT.benchmarkVerdictEnv] === "pass";
}

export function resolveAiRoutingDecision(args: {
  service: string;
  role: AiRoutingRole;
  requestId: string;
  catalogKeys: ReadonlySet<string>;
  baseline: AiRoutingCandidate;
  rolloutEnabled: boolean;
  benchmarkCases: number;
}): { selected: AiRoutingCandidate; route: "baseline" | "candidate"; reason: string } {
  if (args.service !== AI_ROUTING_ROLLOUT.service) return { selected: args.baseline, route: "baseline", reason: "service_not_allowed" };
  if (!args.rolloutEnabled) return { selected: args.baseline, route: "baseline", reason: "kill_switch_or_benchmark" };
  if (args.benchmarkCases < AI_ROUTING_ROLLOUT.minBenchmarkCases) {
    return { selected: args.baseline, route: "baseline", reason: "benchmark_sample_too_small" };
  }
  const candidate = (AI_MODEL_ROUTING_POLICY as Record<AiRoutingRole, AiRoutingCandidate>)[args.role];
  if (!candidate.catalogKey || !candidate.provider || !candidate.modelName || !args.catalogKeys.has(candidate.catalogKey)) {
    return { selected: args.baseline, route: "baseline", reason: "candidate_not_in_catalog" };
  }
  if (stableBucket(args.requestId) >= AI_ROUTING_ROLLOUT.rolloutPercent) {
    return { selected: args.baseline, route: "baseline", reason: "outside_rollout_bucket" };
  }
  return { selected: candidate, route: "candidate", reason: "staged_rollout" };
}
