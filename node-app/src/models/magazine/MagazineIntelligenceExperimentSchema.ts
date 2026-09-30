import { Schema, type Document } from "mongoose";
import type {
  IntelligenceExperimentOutcome,
  IntelligenceExperimentPlan,
  IntelligenceExperimentResult,
  IntelligenceExperimentStatus,
  IntelligenceExperimentVerdict,
  IntelligenceProofCandidate,
  IntelligenceProofCandidateStatus,
  IntelligenceProofClaimStatus,
  IntelligenceProofEvidenceConfidence,
  IntelligenceProofStage,
  IntelligenceProofType,
} from "libs/server-utils/magazine/intelligenceExperimentContract";

/**
 * @docHint
 * @purpose AIR-804 실험 계획·결과·Proof 후보의 node-app 저장 계약
 * @process 계획 멱등 저장 -> 결과 append-only 저장 -> pending Proof 후보 별도 저장
 * @domain intelligence-experiment-proof
 * @scope db-schema
 */

export interface IMagazineIntelligenceExperimentDocument extends Document {
  contractType: "intelligence-experiment";
  schemaVersion: "intelligence-experiment.v1";
  policyVersion: "intelligence-experiment-policy.v1";
  experimentId: string;
  idempotencyKey: string;
  universeId: string;
  patternId: string;
  patternArticleRevision: string | null;
  patternUpdatedAt: string;
  planRevision: string;
  plan: IntelligenceExperimentPlan;
  status: IntelligenceExperimentStatus;
  verdict: IntelligenceExperimentVerdict;
  latestResultId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMagazineIntelligenceExperimentResultDocument extends Document {
  contractType: "intelligence-experiment-result";
  schemaVersion: "intelligence-experiment-result.v1";
  policyVersion: "intelligence-experiment-policy.v1";
  resultId: string;
  idempotencyKey: string;
  universeId: string;
  experimentId: string;
  experimentPlanRevision: string;
  attempt: number;
  outcome: IntelligenceExperimentOutcome;
  verdict: IntelligenceExperimentVerdict;
  result: IntelligenceExperimentResult;
  proofCandidateId: string;
  recordedBy: string;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMagazineProofBankDocument extends Document {
  contractType: "amu-proof-bank";
  schemaVersion: "amu-proof-bank.v1";
  policyVersion: "amu-proof-bank-policy.v1";
  proofId: string;
  universeId: string;
  status: IntelligenceProofCandidateStatus;
  claimStatus: IntelligenceProofClaimStatus;
  evidenceConfidence: IntelligenceProofEvidenceConfidence;
  proofType: IntelligenceProofType;
  proofStage: IntelligenceProofStage;
  patternId: string;
  experimentId: string;
  resultId: string;
  proof: IntelligenceProofCandidate;
  createdAt: Date;
  updatedAt: Date;
}

export const MagazineIntelligenceExperimentSchema = new Schema<IMagazineIntelligenceExperimentDocument>(
  {
    contractType: { type: String, enum: ["intelligence-experiment"], required: true, default: "intelligence-experiment" },
    schemaVersion: { type: String, enum: ["intelligence-experiment.v1"], required: true, default: "intelligence-experiment.v1" },
    policyVersion: { type: String, enum: ["intelligence-experiment-policy.v1"], required: true, default: "intelligence-experiment-policy.v1" },
    experimentId: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    patternId: { type: String, required: true, index: true },
    patternArticleRevision: { type: String, default: null },
    patternUpdatedAt: { type: String, required: true },
    planRevision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    plan: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["planned", "running", "completed", "canceled"], required: true, index: true },
    verdict: { type: String, enum: ["pending_verdict", "scale", "iterate", "stop"], required: true, index: true },
    latestResultId: { type: String, default: null, index: true },
    createdBy: { type: String, required: true, index: true },
  },
  { timestamps: true, strict: "throw" },
);

export const MagazineIntelligenceExperimentResultSchema = new Schema<IMagazineIntelligenceExperimentResultDocument>(
  {
    contractType: { type: String, enum: ["intelligence-experiment-result"], required: true, default: "intelligence-experiment-result" },
    schemaVersion: { type: String, enum: ["intelligence-experiment-result.v1"], required: true, default: "intelligence-experiment-result.v1" },
    policyVersion: { type: String, enum: ["intelligence-experiment-policy.v1"], required: true, default: "intelligence-experiment-policy.v1" },
    resultId: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    experimentId: { type: String, required: true, index: true },
    experimentPlanRevision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    attempt: { type: Number, required: true, min: 1 },
    outcome: { type: String, enum: ["observed", "mixed", "failed", "invalid", "insufficient_sample"], required: true, index: true },
    verdict: { type: String, enum: ["pending_verdict", "scale", "iterate", "stop"], required: true, index: true },
    result: { type: Schema.Types.Mixed, required: true },
    proofCandidateId: { type: String, required: true, index: true },
    recordedBy: { type: String, required: true, index: true },
    recordedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, strict: "throw" },
);

export const MagazineProofBankSchema = new Schema<IMagazineProofBankDocument>(
  {
    contractType: { type: String, enum: ["amu-proof-bank"], required: true, default: "amu-proof-bank" },
    schemaVersion: { type: String, enum: ["amu-proof-bank.v1"], required: true, default: "amu-proof-bank.v1" },
    policyVersion: { type: String, enum: ["amu-proof-bank-policy.v1"], required: true, default: "amu-proof-bank-policy.v1" },
    proofId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending_review", "approved", "rejected"], required: true, index: true },
    claimStatus: { type: String, enum: ["measured", "sourced", "hypothesis", "prohibited"], required: true, index: true },
    evidenceConfidence: { type: String, enum: ["hypothesis", "benchmark", "observed", "validated", "paid", "retained"], required: true, index: true },
    proofType: { type: String, enum: ["problem", "reach", "consumption", "usage", "completion", "relationship", "repeat", "return", "expansion", "payment", "economic"], required: true, index: true },
    proofStage: { type: String, enum: ["L1 Problem", "L2 Usage / Completion", "L3 Relationship / Repeat", "L4 Payment", "L5 Economic"], required: true, index: true },
    patternId: { type: String, required: true, index: true },
    experimentId: { type: String, required: true, index: true },
    resultId: { type: String, required: true, unique: true, index: true },
    proof: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, strict: "throw" },
);

MagazineIntelligenceExperimentSchema.index({ patternId: 1, createdAt: -1 });
MagazineIntelligenceExperimentResultSchema.index({ experimentId: 1, attempt: 1 }, { unique: true, name: "intelligence_experiment_result_attempt" });
MagazineIntelligenceExperimentResultSchema.index({ experimentId: 1, idempotencyKey: 1 }, { unique: true, name: "intelligence_experiment_result_idempotency" });
MagazineProofBankSchema.index({ experimentId: 1, resultId: 1 }, { unique: true, name: "proof_bank_experiment_result" });
