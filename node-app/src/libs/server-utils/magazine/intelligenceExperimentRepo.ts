import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MagazineIntelligenceExperimentResultSchema,
  MagazineIntelligenceExperimentSchema,
  MagazineProofBankSchema,
  type IMagazineIntelligenceExperimentDocument,
  type IMagazineIntelligenceExperimentResultDocument,
  type IMagazineProofBankDocument,
} from "models/magazine";
import type {
  IntelligenceExperimentPlan,
  IntelligenceExperimentResult,
  IntelligenceExperimentStatus,
  IntelligenceExperimentVerdict,
  IntelligenceProofCandidate,
} from "./intelligenceExperimentContract";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose AIR-804 experiment/result/proof candidate 저장소 — Pattern Registry와 독립
 * @process plan idempotency -> append-only result -> pending Proof candidate -> aggregate status update
 * @domain intelligence-experiment-proof
 * @scope server-repository
 */

const EXPERIMENT_COLLECTION = "magazine_intelligence_experiments";
const RESULT_COLLECTION = "magazine_intelligence_experiment_results";
const PROOF_COLLECTION = "amu_proof_bank";

async function getExperimentModel() {
  return getModel<IMagazineIntelligenceExperimentDocument>(
    MONGODB_AMU_URL,
    "MagazineIntelligenceExperiment",
    MagazineIntelligenceExperimentSchema,
    EXPERIMENT_COLLECTION,
  );
}

async function getResultModel() {
  return getModel<IMagazineIntelligenceExperimentResultDocument>(
    MONGODB_AMU_URL,
    "MagazineIntelligenceExperimentResult",
    MagazineIntelligenceExperimentResultSchema,
    RESULT_COLLECTION,
  );
}

async function getProofModel() {
  return getModel<IMagazineProofBankDocument>(MONGODB_AMU_URL, "MagazineProofBank", MagazineProofBankSchema, PROOF_COLLECTION);
}

function safe(value: unknown) {
  return String(value || "").trim();
}

function isDuplicate(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === 11000);
}

export async function getIntelligenceExperiment(experimentId: string, universeId: string) {
  const model = await getExperimentModel();
  return await model.findOne({ experimentId: safe(experimentId), universeId: safe(universeId) }).lean();
}

export async function findIntelligenceExperimentByIdempotencyKey(idempotencyKey: string, universeId: string) {
  const model = await getExperimentModel();
  return await model.findOne({ idempotencyKey: safe(idempotencyKey), universeId: safe(universeId) }).lean();
}

export async function listIntelligenceExperiments(args: {
  universeId: string;
  patternId?: string;
  status?: IntelligenceExperimentStatus;
  verdict?: IntelligenceExperimentVerdict;
  limit?: number;
}) {
  const model = await getExperimentModel();
  const filter: Record<string, unknown> = { universeId: safe(args.universeId) };
  if (safe(args.patternId)) filter.patternId = safe(args.patternId);
  if (args.status) filter.status = args.status;
  if (args.verdict) filter.verdict = args.verdict;
  return await model.find(filter).sort({ createdAt: -1, experimentId: -1 }).limit(Math.max(1, Math.min(100, Math.floor(args.limit || 20)))).lean();
}

export async function createIntelligenceExperiment(plan: IntelligenceExperimentPlan) {
  const model = await getExperimentModel();
  try {
    const document = await model.create({
      contractType: plan.contractType,
      schemaVersion: plan.schemaVersion,
      policyVersion: plan.policyVersion,
      experimentId: plan.experimentId,
      idempotencyKey: plan.idempotencyKey,
      universeId: plan.universeId,
      patternId: plan.pattern.patternId,
      patternArticleRevision: plan.pattern.articleRevision,
      patternUpdatedAt: plan.pattern.updatedAt,
      planRevision: plan.planRevision,
      plan,
      status: "planned",
      verdict: "pending_verdict",
      latestResultId: null,
      createdBy: plan.createdBy,
    });
    return { ok: true as const, data: (document.toObject?.() ?? document) as IMagazineIntelligenceExperimentDocument, created: true };
  } catch (error: unknown) {
    if (isDuplicate(error)) {
      const existing = await findIntelligenceExperimentByIdempotencyKey(plan.idempotencyKey, plan.universeId);
      if (existing) return { ok: true as const, data: existing, created: false };
    }
    logger.error("[intelligence-experiment] create failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false as const, error: "unavailable" as const };
  }
}

export async function getIntelligenceExperimentResult(resultId: string, universeId: string) {
  const model = await getResultModel();
  return await model.findOne({ resultId: safe(resultId), universeId: safe(universeId) }).lean();
}

export async function findIntelligenceExperimentResultByIdempotencyKey(idempotencyKey: string, universeId: string) {
  const model = await getResultModel();
  return await model.findOne({ idempotencyKey: safe(idempotencyKey), universeId: safe(universeId) }).lean();
}

export async function findIntelligenceExperimentResultByAttempt(args: { universeId: string; experimentId: string; attempt: number }) {
  const model = await getResultModel();
  return await model.findOne({ universeId: safe(args.universeId), experimentId: safe(args.experimentId), attempt: args.attempt }).lean();
}

export async function listIntelligenceExperimentResults(experimentId: string, universeId: string, limit = 100) {
  const model = await getResultModel();
  return await model.find({ universeId: safe(universeId), experimentId: safe(experimentId) }).sort({ attempt: 1, recordedAt: 1 }).limit(Math.max(1, Math.min(100, Math.floor(limit)))).lean();
}

export async function createIntelligenceExperimentResult(result: IntelligenceExperimentResult) {
  const model = await getResultModel();
  try {
    const document = await model.create({
      contractType: result.contractType,
      schemaVersion: result.schemaVersion,
      policyVersion: result.policyVersion,
      resultId: result.resultId,
      idempotencyKey: result.idempotencyKey,
      universeId: result.universeId,
      experimentId: result.experimentId,
      experimentPlanRevision: result.experimentPlanRevision,
      attempt: result.attempt,
      outcome: result.outcome,
      verdict: result.verdict,
      result,
      proofCandidateId: result.proofCandidate.proofId,
      recordedBy: result.recordedBy,
      recordedAt: new Date(result.recordedAt),
    });
    return { ok: true as const, data: (document.toObject?.() ?? document) as IMagazineIntelligenceExperimentResultDocument, created: true };
  } catch (error: unknown) {
    if (isDuplicate(error)) {
      const [byKey, byAttempt] = await Promise.all([
        findIntelligenceExperimentResultByIdempotencyKey(result.idempotencyKey, result.universeId),
        findIntelligenceExperimentResultByAttempt({ universeId: result.universeId, experimentId: result.experimentId, attempt: result.attempt }),
      ]);
      if (byKey || byAttempt) return { ok: true as const, data: byKey || byAttempt, created: false };
    }
    logger.error("[intelligence-experiment] result create failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false as const, error: "unavailable" as const };
  }
}

export async function createIntelligenceProofCandidate(args: {
  proof: IntelligenceProofCandidate;
  universeId: string;
  patternId: string;
  experimentId: string;
  resultId: string;
}) {
  const model = await getProofModel();
  try {
    const document = await model.create({
      contractType: "amu-proof-bank",
      schemaVersion: "amu-proof-bank.v1",
      policyVersion: "amu-proof-bank-policy.v1",
      proofId: args.proof.proofId,
      universeId: safe(args.universeId),
      status: args.proof.status,
      claimStatus: args.proof.claimStatus,
      evidenceConfidence: args.proof.evidenceConfidence,
      proofType: args.proof.proofType,
      proofStage: args.proof.proofStage,
      patternId: safe(args.patternId),
      experimentId: safe(args.experimentId),
      resultId: safe(args.resultId),
      proof: args.proof,
    });
    return { ok: true as const, data: (document.toObject?.() ?? document) as IMagazineProofBankDocument, created: true };
  } catch (error: unknown) {
    if (isDuplicate(error)) {
      const existing = await model.findOne({ resultId: safe(args.resultId) }).lean();
      if (existing) return { ok: true as const, data: existing, created: false };
    }
    logger.error("[proof-bank] candidate create failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false as const, error: "unavailable" as const };
  }
}

export async function getIntelligenceProofCandidate(proofId: string, universeId: string) {
  const model = await getProofModel();
  return await model.findOne({ proofId: safe(proofId), universeId: safe(universeId) }).lean();
}

export async function listIntelligenceProofCandidates(experimentId: string, universeId: string, limit = 100) {
  const model = await getProofModel();
  return await model.find({ universeId: safe(universeId), experimentId: safe(experimentId) }).sort({ createdAt: 1, proofId: 1 }).limit(Math.max(1, Math.min(100, Math.floor(limit)))).lean();
}

export async function updateIntelligenceExperimentAfterResult(args: {
  universeId: string;
  experimentId: string;
  resultId: string;
  verdict: IntelligenceExperimentVerdict;
}) {
  const model = await getExperimentModel();
  const status: IntelligenceExperimentStatus = ["scale", "iterate", "stop"].includes(args.verdict) ? "completed" : "running";
  return await model.findOneAndUpdate(
    { experimentId: safe(args.experimentId), universeId: safe(args.universeId) },
    { $set: { status, verdict: args.verdict, latestResultId: safe(args.resultId) } },
    { new: true },
  ).lean();
}
