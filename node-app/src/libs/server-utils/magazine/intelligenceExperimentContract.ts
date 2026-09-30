import "server-only";

import crypto from "crypto";
import type { MarketingChannel, MarketingJobPriority } from "consts/marketing/queue";
import {
  buildMarketingOopsNextAction,
  type MarketingOopsNextAction,
  type MarketingOopsProblemClusterPlan,
  type MarketingOopsReviewWindowDays,
} from "libs/server-utils/marketing/marketingOopsNextActionContract";
import type { PublicIntelligencePatternProjection } from "libs/server-utils/magazine/magazineIntelligencePatternRepo";

/**
 * @docHint
 * @purpose AIR-804 Pattern → Hypothesis → Experiment → Result → Proof Bank 계약
 * @process current Pattern 재검증 -> 실험 계획/종료 조건 고정 -> append-only Result -> pending Proof candidate
 * @domain intelligence-experiment-proof
 * @scope server-contract
 */

export const INTELLIGENCE_EXPERIMENT_CONTRACT_TYPE = "intelligence-experiment" as const;
export const INTELLIGENCE_EXPERIMENT_SCHEMA_VERSION = "intelligence-experiment.v1" as const;
export const INTELLIGENCE_EXPERIMENT_POLICY_VERSION = "intelligence-experiment-policy.v1" as const;
export const INTELLIGENCE_EXPERIMENT_RESULT_CONTRACT_TYPE = "intelligence-experiment-result" as const;
export const INTELLIGENCE_EXPERIMENT_RESULT_SCHEMA_VERSION = "intelligence-experiment-result.v1" as const;
export const AMU_PROOF_BANK_CONTRACT_TYPE = "amu-proof-bank" as const;
export const AMU_PROOF_BANK_SCHEMA_VERSION = "amu-proof-bank.v1" as const;
export const AMU_PROOF_BANK_POLICY_VERSION = "amu-proof-bank-policy.v1" as const;

export const INTELLIGENCE_EXPERIMENT_STATUSES = ["planned", "running", "completed", "canceled"] as const;
export type IntelligenceExperimentStatus = (typeof INTELLIGENCE_EXPERIMENT_STATUSES)[number];
export const INTELLIGENCE_EXPERIMENT_VERDICTS = ["pending_verdict", "scale", "iterate", "stop"] as const;
export type IntelligenceExperimentVerdict = (typeof INTELLIGENCE_EXPERIMENT_VERDICTS)[number];
export const INTELLIGENCE_EXPERIMENT_OUTCOMES = ["observed", "mixed", "failed", "invalid", "insufficient_sample"] as const;
export type IntelligenceExperimentOutcome = (typeof INTELLIGENCE_EXPERIMENT_OUTCOMES)[number];
export const INTELLIGENCE_EXPERIMENT_OBSERVATION_TYPES = ["numeric", "count", "rate", "qualitative"] as const;
export type IntelligenceExperimentObservationType = (typeof INTELLIGENCE_EXPERIMENT_OBSERVATION_TYPES)[number];
export const INTELLIGENCE_PROOF_TYPES = [
  "problem",
  "reach",
  "consumption",
  "usage",
  "completion",
  "relationship",
  "repeat",
  "return",
  "expansion",
  "payment",
  "economic",
] as const;
export type IntelligenceProofType = (typeof INTELLIGENCE_PROOF_TYPES)[number];
export const INTELLIGENCE_PROOF_STAGES = [
  "L1 Problem",
  "L2 Usage / Completion",
  "L3 Relationship / Repeat",
  "L4 Payment",
  "L5 Economic",
] as const;
export type IntelligenceProofStage = (typeof INTELLIGENCE_PROOF_STAGES)[number];
export const INTELLIGENCE_PROOF_EVIDENCE_CONFIDENCES = ["hypothesis", "benchmark", "observed", "validated", "paid", "retained"] as const;
export type IntelligenceProofEvidenceConfidence = (typeof INTELLIGENCE_PROOF_EVIDENCE_CONFIDENCES)[number];
export const INTELLIGENCE_PROOF_CLAIM_STATUSES = ["measured", "sourced", "hypothesis", "prohibited"] as const;
export type IntelligenceProofClaimStatus = (typeof INTELLIGENCE_PROOF_CLAIM_STATUSES)[number];
export const INTELLIGENCE_PROOF_CANDIDATE_STATUSES = ["pending_review", "approved", "rejected"] as const;
export type IntelligenceProofCandidateStatus = (typeof INTELLIGENCE_PROOF_CANDIDATE_STATUSES)[number];

type DateRange = { startsAt: string; endsAt: string };

export type IntelligenceExperimentPatternSnapshot = {
  patternId: string;
  articleRevision: string | null;
  articleRevisions: string[];
  updatedAt: string;
  reviewDueAt: string;
};

export type IntelligenceExperimentHypothesis = {
  hypothesisId: string;
  statement: string;
  expectedMechanism: string;
  falsifier: string;
  status: "unverified";
  evidenceBoundary: "pattern_context_only_not_amu_proof";
};

export type IntelligenceExperimentMetric = {
  key: string;
  label: string;
  observationType: IntelligenceExperimentObservationType;
  successCriterion: string;
};

export type IntelligenceExperimentTermination = {
  reviewWindowDays: MarketingOopsReviewWindowDays;
  observationWindow: DateRange;
  minimumSampleSize: number;
  stopCriteria: string[];
};

export type IntelligenceProofCandidate = {
  proofId: string;
  status: IntelligenceProofCandidateStatus;
  claimCandidate: string;
  audience: string;
  problem: string;
  before: string;
  action: string;
  after: string;
  result: string;
  metric: string;
  sampleSize: number;
  measurementPeriod: DateRange;
  conditions: string[];
  source: {
    sourceKind: "amu_experiment_result";
    experimentId: string;
    resultId: string;
    patternId: string;
    patternArticleRevision: string | null;
  };
  verifiedAt: string | null;
  proofType: IntelligenceProofType;
  proofStage: IntelligenceProofStage;
  evidenceConfidence: "hypothesis";
  allowedClaims: [];
  notAllowedClaims: string[];
  claimStatus: "hypothesis";
  externalPatternEvidenceExcluded: true;
  createdAt: string;
};

export type IntelligenceExperimentPlan = {
  contractType: typeof INTELLIGENCE_EXPERIMENT_CONTRACT_TYPE;
  schemaVersion: typeof INTELLIGENCE_EXPERIMENT_SCHEMA_VERSION;
  policyVersion: typeof INTELLIGENCE_EXPERIMENT_POLICY_VERSION;
  experimentId: string;
  planRevision: string;
  idempotencyKey: string;
  universeId: string;
  pattern: IntelligenceExperimentPatternSnapshot;
  problemCluster: MarketingOopsProblemClusterPlan;
  audience: string;
  before: string;
  proofType: IntelligenceProofType;
  proofStage: IntelligenceProofStage;
  nextAction: Pick<MarketingOopsNextAction, "action" | "expectedMechanism" | "metric" | "doNotChange" | "priority" | "channels">;
  hypothesis: IntelligenceExperimentHypothesis;
  metric: IntelligenceExperimentMetric;
  termination: IntelligenceExperimentTermination;
  proofCandidatePolicy: {
    autoPromotion: "forbidden";
    humanReviewRequired: true;
    initialClaimStatus: "hypothesis";
    initialEvidenceConfidence: "hypothesis";
  };
  status: "planned";
  verdict: "pending_verdict";
  createdAt: string;
  createdBy: string;
};

export type IntelligenceExperimentResult = {
  contractType: typeof INTELLIGENCE_EXPERIMENT_RESULT_CONTRACT_TYPE;
  schemaVersion: typeof INTELLIGENCE_EXPERIMENT_RESULT_SCHEMA_VERSION;
  policyVersion: typeof INTELLIGENCE_EXPERIMENT_POLICY_VERSION;
  resultId: string;
  resultRevision: string;
  idempotencyKey: string;
  universeId: string;
  experimentId: string;
  experimentPlanRevision: string;
  attempt: number;
  outcome: IntelligenceExperimentOutcome;
  verdict: IntelligenceExperimentVerdict;
  observation: {
    metricKey: string;
    observedSummary: string;
    observedValue: number | null;
    numerator: number | null;
    denominator: number | null;
    sampleSize: number;
    measurementPeriod: DateRange;
  };
  decisionBasis: string;
  limitations: string[];
  proofCandidate: IntelligenceProofCandidate;
  recordedAt: string;
  recordedBy: string;
};

export type IntelligenceExperimentPlanBuildInput = {
  universeId: string;
  pattern: PublicIntelligencePatternProjection;
  problemCluster: MarketingOopsProblemClusterPlan;
  nextAction: string;
  doNotChange: string;
  priority: MarketingJobPriority;
  channels: MarketingChannel[];
  hypothesis: string;
  falsifier: string;
  metricKey: string;
  metricLabel: string;
  observationType: IntelligenceExperimentObservationType;
  successCriterion: string;
  reviewWindowDays: MarketingOopsReviewWindowDays;
  minimumSampleSize: number;
  stopCriteria: string[];
  audience: string;
  before: string;
  proofType: IntelligenceProofType;
  proofStage: IntelligenceProofStage;
  createdBy: string;
  now?: Date;
  startsAt?: Date;
};

export type IntelligenceExperimentPlanBuildResult =
  | { ok: true; data: IntelligenceExperimentPlan }
  | { ok: false; code: "PATTERN_NOT_ELIGIBLE" | "EXPERIMENT_INPUT_INVALID" | "EXPERIMENT_CONFLICT"; message: string; field?: string };

export type IntelligenceExperimentResultBuildInput = {
  plan: IntelligenceExperimentPlan;
  attempt: number;
  outcome: IntelligenceExperimentOutcome;
  observedSummary: string;
  observedValue?: number | null;
  numerator?: number | null;
  denominator?: number | null;
  sampleSize: number;
  measurementPeriod: DateRange;
  decision?: Exclude<IntelligenceExperimentVerdict, "pending_verdict">;
  decisionBasis: string;
  limitations: string[];
  resultText: string;
  now?: Date;
  recordedBy: string;
};

export type IntelligenceExperimentResultBuildResult =
  | { ok: true; data: IntelligenceExperimentResult }
  | { ok: false; code: "EXPERIMENT_NOT_ELIGIBLE" | "RESULT_INPUT_INVALID"; message: string; field?: string };

const PRIORITIES = new Set<MarketingJobPriority>(["low", "normal", "high", "urgent"]);
const OBSERVATION_TYPES = new Set<string>(INTELLIGENCE_EXPERIMENT_OBSERVATION_TYPES);
const PROOF_TYPES = new Set<string>(INTELLIGENCE_PROOF_TYPES);
const PROOF_STAGES = new Set<string>(INTELLIGENCE_PROOF_STAGES);
const RESULTS = new Set<string>(INTELLIGENCE_EXPERIMENT_OUTCOMES);
const VERDICTS = new Set<string>(INTELLIGENCE_EXPERIMENT_VERDICTS);

function safeText(value: unknown, max = 600) {
  const text = String(value || "").normalize("NFKC").trim();
  if ([...text].some((char) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(char))) return "";
  return text.slice(0, max);
}

function textList(value: unknown, maxItems: number, maxLength = 400) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => safeText(item, maxLength)).filter(Boolean))).slice(0, maxItems);
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value)), "utf8").digest("hex");
}

function isEligiblePattern(pattern: PublicIntelligencePatternProjection, now: Date) {
  const reviewDueAt = validDate(pattern.pattern.reviewDueAt);
  const updatedAt = validDate(pattern.updatedAt);
  const articleRevisions = Array.from(new Set(pattern.pattern.articleLinks.map((link) => safeText(link.articleRevision, 200)).filter(Boolean)));
  return Boolean(
    pattern.pattern.maturity === "active" &&
      pattern.pattern.healthStatus === "current" &&
      reviewDueAt &&
      reviewDueAt.getTime() >= now.getTime() &&
      updatedAt &&
      pattern.pattern.patternId &&
      articleRevisions.length,
  );
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function asArticleRevisions(pattern: PublicIntelligencePatternProjection) {
  return Array.from(new Set(pattern.pattern.articleLinks.map((link) => safeText(link.articleRevision, 200)).filter(Boolean)));
}

function buildPlanRevision(plan: Omit<IntelligenceExperimentPlan, "planRevision">) {
  return hash(plan);
}

function buildResultIdempotencyKey(input: IntelligenceExperimentResultBuildInput, proofId: string) {
  return `intelligence-experiment-result:v1:${hash({
    experimentId: input.plan.experimentId,
    planRevision: input.plan.planRevision,
    attempt: input.attempt,
    outcome: input.outcome,
    observedSummary: input.observedSummary,
    observedValue: input.observedValue ?? null,
    numerator: input.numerator ?? null,
    denominator: input.denominator ?? null,
    sampleSize: input.sampleSize,
    measurementPeriod: input.measurementPeriod,
    decision: input.decision || null,
    decisionBasis: input.decisionBasis,
    limitations: input.limitations,
    resultText: input.resultText,
    proofId,
  })}`;
}

function buildProofCandidate(input: {
  plan: IntelligenceExperimentPlan;
  resultId: string;
  observedSummary: string;
  resultText: string;
  sampleSize: number;
  measurementPeriod: DateRange;
  now: Date;
}) {
  const proofId = `amu:proof:${hash({ experimentId: input.plan.experimentId, resultId: input.resultId }).slice(0, 32)}`;
  return {
    proofId,
    status: "pending_review" as const,
    claimCandidate: input.plan.hypothesis.statement,
    audience: input.plan.audience,
    problem: input.plan.before,
    before: input.plan.before,
    action: input.plan.nextAction.action,
    after: input.resultText,
    result: input.observedSummary,
    metric: input.plan.metric.label,
    sampleSize: input.sampleSize,
    measurementPeriod: input.measurementPeriod,
    conditions: [
      input.plan.problemCluster.topic,
      `review window ${input.plan.termination.reviewWindowDays}d`,
      ...input.plan.termination.stopCriteria,
    ].slice(0, 12),
    source: {
      sourceKind: "amu_experiment_result" as const,
      experimentId: input.plan.experimentId,
      resultId: input.resultId,
      patternId: input.plan.pattern.patternId,
      patternArticleRevision: input.plan.pattern.articleRevision,
    },
    verifiedAt: null,
    proofType: input.plan.proofType,
    proofStage: input.plan.proofStage,
    evidenceConfidence: "hypothesis" as const,
    allowedClaims: [] as [],
    notAllowedClaims: [
      "외부 Pattern Evidence를 AMU 성과로 표현하지 않는다.",
      "이 단일 실험을 보편 법칙·최고 성과·절대 효과로 일반화하지 않는다.",
      "사람 검토 전에는 대외 Allowed Claim을 생성하지 않는다.",
    ],
    claimStatus: "hypothesis" as const,
    externalPatternEvidenceExcluded: true as const,
    createdAt: input.now.toISOString(),
  };
}

export function buildIntelligenceExperimentPlan(input: IntelligenceExperimentPlanBuildInput): IntelligenceExperimentPlanBuildResult {
  const now = input.now ?? new Date();
  const universeId = safeText(input.universeId, 200);
  if (!universeId) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "universeId가 필요합니다.", field: "universeId" };
  }
  if (!isEligiblePattern(input.pattern, now)) {
    return { ok: false, code: "PATTERN_NOT_ELIGIBLE", message: "현재 active/current이고 reviewDueAt가 지나지 않은 Pattern만 실험을 만들 수 있습니다.", field: "pattern" };
  }
  const action = buildMarketingOopsNextAction({
    pattern: input.pattern,
    problemCluster: input.problemCluster,
    action: input.nextAction,
    metric: input.metricLabel,
    reviewWindowDays: input.reviewWindowDays,
    doNotChange: input.doNotChange,
    priority: input.priority,
    channels: input.channels,
    now,
  });
  if (!action.ok) return { ok: false, code: "EXPERIMENT_CONFLICT", message: action.message, field: action.field };

  const hypothesis = safeText(input.hypothesis, 800);
  const falsifier = safeText(input.falsifier, 800);
  const metricKey = safeText(input.metricKey, 80).toLowerCase();
  const metricLabel = safeText(input.metricLabel, 400);
  const successCriterion = safeText(input.successCriterion, 800);
  const audience = safeText(input.audience, 400);
  const before = safeText(input.before, 800);
  const stopCriteria = textList(input.stopCriteria, 8, 400);
  const startsAt = input.startsAt ?? now;
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "실험 시작 시각이 올바르지 않습니다.", field: "startsAt" };
  }
  const startsAtIso = startsAt.toISOString();
  const endsAt = addDays(startsAt, input.reviewWindowDays);
  if (!hypothesis || !falsifier || !metricLabel || !successCriterion || !audience || !before) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "가설·반증 조건·Metric·성공 기준·대상·Before가 필요합니다." };
  }
  if (!/^[a-z][a-z0-9_.:-]{1,63}$/u.test(metricKey)) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "Metric key 형식이 올바르지 않습니다.", field: "metricKey" };
  }
  if (!OBSERVATION_TYPES.has(input.observationType)) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "관측 유형이 올바르지 않습니다.", field: "observationType" };
  }
  if (!Number.isInteger(input.minimumSampleSize) || input.minimumSampleSize < 1 || input.minimumSampleSize > 1_000_000) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "최소 표본 수는 1 이상이어야 합니다.", field: "minimumSampleSize" };
  }
  if (!stopCriteria.length) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "중단 기준이 최소 1개 필요합니다.", field: "stopCriteria" };
  }
  if (!PRIORITIES.has(input.priority) || !PROOF_TYPES.has(input.proofType) || !PROOF_STAGES.has(input.proofStage)) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "우선순위·Proof type·Proof stage가 올바르지 않습니다." };
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return { ok: false, code: "EXPERIMENT_INPUT_INVALID", message: "관측 창이 올바르지 않습니다.", field: "reviewWindowDays" };
  }

  const planWithoutRevision: Omit<IntelligenceExperimentPlan, "planRevision"> = {
    contractType: INTELLIGENCE_EXPERIMENT_CONTRACT_TYPE,
    schemaVersion: INTELLIGENCE_EXPERIMENT_SCHEMA_VERSION,
    policyVersion: INTELLIGENCE_EXPERIMENT_POLICY_VERSION,
    experimentId: "",
    idempotencyKey: "",
    universeId,
    pattern: {
      patternId: input.pattern.pattern.patternId,
      articleRevision: input.pattern.articleRevision,
      articleRevisions: asArticleRevisions(input.pattern),
      updatedAt: input.pattern.updatedAt,
      reviewDueAt: input.pattern.pattern.reviewDueAt,
    },
    problemCluster: action.data.problemCluster,
    audience,
    before,
    proofType: input.proofType,
    proofStage: input.proofStage,
    nextAction: {
      action: action.data.action,
      expectedMechanism: action.data.expectedMechanism,
      metric: action.data.metric,
      doNotChange: action.data.doNotChange,
      priority: action.data.priority,
      channels: action.data.channels,
    },
    hypothesis: {
      hypothesisId: `amu:hypothesis:${hash({ patternId: input.pattern.pattern.patternId, hypothesis }).slice(0, 32)}`,
      statement: hypothesis,
      expectedMechanism: action.data.expectedMechanism,
      falsifier,
      status: "unverified",
      evidenceBoundary: "pattern_context_only_not_amu_proof",
    },
    metric: { key: metricKey, label: metricLabel, observationType: input.observationType, successCriterion },
    termination: {
      reviewWindowDays: input.reviewWindowDays,
      observationWindow: { startsAt: startsAtIso, endsAt: endsAt.toISOString() },
      minimumSampleSize: input.minimumSampleSize,
      stopCriteria,
    },
    proofCandidatePolicy: {
      autoPromotion: "forbidden",
      humanReviewRequired: true,
      initialClaimStatus: "hypothesis",
      initialEvidenceConfidence: "hypothesis",
    },
    status: "planned",
    verdict: "pending_verdict",
    createdAt: now.toISOString(),
    createdBy: safeText(input.createdBy, 160) || "unknown",
  };
  const idempotencyKey = `intelligence-experiment:v1:${hash({
    universeId,
    pattern: planWithoutRevision.pattern,
    problemCluster: planWithoutRevision.problemCluster,
    nextAction: planWithoutRevision.nextAction,
    hypothesis: planWithoutRevision.hypothesis,
    metric: planWithoutRevision.metric,
    termination: planWithoutRevision.termination,
    proofType: input.proofType,
    proofStage: input.proofStage,
  })}`;
  const experimentId = `amu:experiment:${hash({ idempotencyKey }).slice(0, 32)}`;
  const plan = { ...planWithoutRevision, experimentId, idempotencyKey, planRevision: "" };
  const planRevision = buildPlanRevision(plan);
  return {
    ok: true,
    data: {
      ...plan,
      planRevision,
    },
  };
}

export function buildIntelligenceExperimentResult(input: IntelligenceExperimentResultBuildInput): IntelligenceExperimentResultBuildResult {
  const now = input.now ?? new Date();
  const plan = input.plan;
  const attempt = Number(input.attempt);
  const sampleSize = Number(input.sampleSize);
  const observedSummary = safeText(input.observedSummary, 1200);
  const resultText = safeText(input.resultText, 1200);
  const decisionBasis = safeText(input.decisionBasis, 1200);
  const limitations = textList(input.limitations, 12, 500);
  const startsAt = validDate(input.measurementPeriod.startsAt);
  const endsAt = validDate(input.measurementPeriod.endsAt);
  const planStart = validDate(plan.termination.observationWindow.startsAt);
  const planEnd = validDate(plan.termination.observationWindow.endsAt);
  if (!Number.isInteger(attempt) || attempt < 1) return { ok: false, code: "RESULT_INPUT_INVALID", message: "attempt는 1 이상의 정수여야 합니다.", field: "attempt" };
  if (!Number.isInteger(sampleSize) || sampleSize < 0 || sampleSize > 1_000_000_000) return { ok: false, code: "RESULT_INPUT_INVALID", message: "sampleSize가 올바르지 않습니다.", field: "sampleSize" };
  if (!observedSummary || !resultText || !decisionBasis || !limitations.length) return { ok: false, code: "RESULT_INPUT_INVALID", message: "관측 요약·결과·판정 근거·한계가 필요합니다." };
  if (!startsAt || !endsAt || !planStart || !planEnd || endsAt.getTime() < startsAt.getTime() || startsAt.getTime() < planStart.getTime() || endsAt.getTime() > planEnd.getTime() || endsAt.getTime() > now.getTime()) {
    return { ok: false, code: "RESULT_INPUT_INVALID", message: "측정 기간이 실험 관측 창 밖에 있거나 미래입니다.", field: "measurementPeriod" };
  }
  if (input.observedValue !== undefined && input.observedValue !== null && !Number.isFinite(input.observedValue)) return { ok: false, code: "RESULT_INPUT_INVALID", message: "observedValue가 올바르지 않습니다.", field: "observedValue" };
  if (input.numerator !== undefined && input.numerator !== null && (!Number.isFinite(input.numerator) || input.numerator < 0)) return { ok: false, code: "RESULT_INPUT_INVALID", message: "numerator가 올바르지 않습니다.", field: "numerator" };
  if (input.denominator !== undefined && input.denominator !== null && (!Number.isFinite(input.denominator) || input.denominator <= 0)) return { ok: false, code: "RESULT_INPUT_INVALID", message: "denominator가 올바르지 않습니다.", field: "denominator" };

  const insufficient = sampleSize < plan.termination.minimumSampleSize;
  const invalid = input.outcome === "invalid";
  const outcome: IntelligenceExperimentOutcome = insufficient ? "insufficient_sample" : input.outcome;
  if (!RESULTS.has(outcome)) return { ok: false, code: "RESULT_INPUT_INVALID", message: "실험 결과 outcome이 올바르지 않습니다.", field: "outcome" };
  const verdict: IntelligenceExperimentVerdict = insufficient || invalid ? "pending_verdict" : input.decision || "pending_verdict";
  if (!VERDICTS.has(verdict)) return { ok: false, code: "RESULT_INPUT_INVALID", message: "판정이 올바르지 않습니다.", field: "decision" };
  if (!insufficient && !invalid && !input.decision) return { ok: false, code: "RESULT_INPUT_INVALID", message: "충분한 표본의 유효 결과에는 scale·iterate·stop 판정이 필요합니다.", field: "decision" };

  const provisionalResultId = `amu:experiment-result:${hash({ experimentId: plan.experimentId, attempt }).slice(0, 32)}`;
  const proof = buildProofCandidate({
    plan,
    resultId: provisionalResultId,
    observedSummary,
    resultText,
    sampleSize,
    measurementPeriod: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    now,
  });
  const idempotencyKey = buildResultIdempotencyKey(input, proof.proofId);
  const resultWithoutRevision = {
    contractType: INTELLIGENCE_EXPERIMENT_RESULT_CONTRACT_TYPE,
    schemaVersion: INTELLIGENCE_EXPERIMENT_RESULT_SCHEMA_VERSION,
    policyVersion: INTELLIGENCE_EXPERIMENT_POLICY_VERSION,
    resultId: provisionalResultId,
    resultRevision: "",
    idempotencyKey,
    universeId: plan.universeId,
    experimentId: plan.experimentId,
    experimentPlanRevision: plan.planRevision,
    attempt,
    outcome,
    verdict,
    observation: {
      metricKey: plan.metric.key,
      observedSummary,
      observedValue: input.observedValue ?? null,
      numerator: input.numerator ?? null,
      denominator: input.denominator ?? null,
      sampleSize,
      measurementPeriod: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    },
    decisionBasis,
    limitations,
    proofCandidate: proof,
    recordedAt: now.toISOString(),
    recordedBy: safeText(input.recordedBy, 160) || "unknown",
  } satisfies Omit<IntelligenceExperimentResult, "resultRevision"> & { resultRevision: string };
  const resultRevision = hash(resultWithoutRevision);
  return { ok: true, data: { ...resultWithoutRevision, resultRevision } };
}
