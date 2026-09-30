import "server-only";

import {
  KNOWLEDGE_LIMITS,
  type KnowledgeCandidateItem,
  type KnowledgeEvidenceRef,
  type MagazineKnowledgeArticle,
} from "./magazineKnowledgeContract";
import { isRecord } from "./magazineKnowledgeSafety";

/**
 * @docHint
 * @purpose 완료 기사에서 Pattern 후보만 추출하는 reader-first·writer-isolated pipeline — AIR-801
 * @process gate 증명 검증 -> sourceRevision 일치 확인 -> 후보·근거 포인터 projection -> 사람 검토 대기
 * @domain intelligence-pattern-registry
 * @scope server-contract
 */

export const INTELLIGENCE_EXTRACTION_PIPELINE_VERSION = "magazine-intelligence-extraction.v1" as const;
export const INTELLIGENCE_EXTRACTION_FORBIDDEN_INPUT_KEYS = [
  "body",
  "content",
  "contentHtml",
  "html",
  "originalArticle",
  "articleText",
  "title",
  "performanceData",
  "existingIntelligence",
  "previousRevision",
] as const;

const PATTERN_CANDIDATE_TYPES = new Set<KnowledgeCandidateItem["intelligenceType"]>([
  "pattern",
  "anti_pattern",
  "principle",
  "tactic",
]);

type HumanReviewGate = {
  status: "passed";
  reviewerType: "human";
  reviewerId: string;
  reviewedAt: string;
};

type MachineReviewGate = {
  status: "passed";
  checkedAt: string;
};

export interface MagazineIntelligenceExtractionHandoff {
  pipelineVersion: typeof INTELLIGENCE_EXTRACTION_PIPELINE_VERSION;
  contentId: string;
  sourceRevision: string;
  outputDigest: string;
  qualityGate: HumanReviewGate;
  seoGate: MachineReviewGate;
  claimGate: MachineReviewGate;
  writerIsolation: {
    status: "passed";
    contextReset: true;
    originalArticleHidden: true;
    performanceDataHidden: true;
    existingIntelligenceHidden: true;
    existingAssetsHidden: true;
  };
  renewalIndependence: {
    required: boolean;
    status: "passed";
    reviewerType: "human";
    reviewerId: string;
    reviewedAt: string;
  };
}

export interface ExtractedPatternCandidate {
  candidateId: string;
  contentId: string;
  sourceRevision: string;
  role: "primary" | "secondary";
  candidateType: Extract<KnowledgeCandidateItem["intelligenceType"], "pattern" | "anti_pattern" | "principle" | "tactic">;
  statement: string;
  articleSpan: string;
  sourceRefs: string[];
  evidenceRefs: string[];
  limitations: string[];
  counterExamples: string[];
  registryResolution: "pending";
  proofRefs: [];
}

export interface IntelligenceExtractionProjection {
  pipelineVersion: typeof INTELLIGENCE_EXTRACTION_PIPELINE_VERSION;
  contentId: string;
  articleRevision: string;
  sourceRevision: string;
  status: "extracted" | "zero_pattern";
  candidates: ExtractedPatternCandidate[];
  evidenceRefs: KnowledgeEvidenceRef[];
  counterExamples: string[];
  registryWrites: [];
  proofRefs: [];
}

export type IntelligenceExtractionResult =
  | { ok: true; data: IntelligenceExtractionProjection }
  | {
      ok: false;
      error: "invalid_handoff" | "stale_revision" | "article_not_ready" | "scope_review_required";
      issues: string[];
    };

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function hasForbiddenInputKey(value: unknown, path = "handoff"): string | null {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const result = hasForbiddenInputKey(item, `${path}[${index}]`);
      if (result) return result;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const key of Object.keys(value)) {
    if ((INTELLIGENCE_EXTRACTION_FORBIDDEN_INPUT_KEYS as readonly string[]).includes(key)) return `${path}.${key}`;
    const result = hasForbiddenInputKey(value[key], `${path}.${key}`);
    if (result) return result;
  }
  return null;
}

function validateHumanGate(value: unknown, name: string, issues: string[]) {
  if (!isRecord(value) || value.status !== "passed" || value.reviewerType !== "human") {
    issues.push(`${name}은 human/passed 게이트여야 합니다.`);
    return;
  }
  if (typeof value.reviewerId !== "string" || !value.reviewerId.trim()) issues.push(`${name}.reviewerId가 필요합니다.`);
  if (!isIsoDate(value.reviewedAt)) issues.push(`${name}.reviewedAt가 올바른 날짜여야 합니다.`);
}

function validateMachineGate(value: unknown, name: string, issues: string[]) {
  if (!isRecord(value) || value.status !== "passed" || !isIsoDate(value.checkedAt)) {
    issues.push(`${name}은 passed 상태의 checkedAt이 필요합니다.`);
  }
}

export function validateIntelligenceExtractionHandoff(
  value: unknown,
): { ok: true; handoff: MagazineIntelligenceExtractionHandoff } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ["extraction handoff 객체가 필요합니다."] };
  const forbiddenPath = hasForbiddenInputKey(value);
  if (forbiddenPath) issues.push(`writer isolation 위반 입력입니다: ${forbiddenPath}`);
  if (value.pipelineVersion !== INTELLIGENCE_EXTRACTION_PIPELINE_VERSION) issues.push("pipelineVersion이 지원되지 않습니다.");
  if (typeof value.contentId !== "string" || !value.contentId.trim()) issues.push("contentId가 필요합니다.");
  if (typeof value.sourceRevision !== "string" || !value.sourceRevision.trim()) issues.push("sourceRevision이 필요합니다.");
  if (typeof value.outputDigest !== "string" || !/^[a-f0-9]{64}$/i.test(value.outputDigest)) issues.push("outputDigest는 SHA-256 형식이어야 합니다.");
  validateHumanGate(value.qualityGate, "qualityGate", issues);
  validateMachineGate(value.seoGate, "seoGate", issues);
  validateMachineGate(value.claimGate, "claimGate", issues);

  const isolation = value.writerIsolation;
  if (
    !isRecord(isolation)
    || isolation.status !== "passed"
    || isolation.contextReset !== true
    || isolation.originalArticleHidden !== true
    || isolation.performanceDataHidden !== true
    || isolation.existingIntelligenceHidden !== true
    || isolation.existingAssetsHidden !== true
  ) {
    issues.push("writerIsolation의 모든 격리 게이트가 passed여야 합니다.");
  }

  const renewal = value.renewalIndependence;
  if (!isRecord(renewal) || typeof renewal.required !== "boolean" || renewal.status !== "passed" || renewal.reviewerType !== "human") {
    issues.push("renewalIndependence 게이트가 올바르지 않습니다.");
  } else {
    if (typeof renewal.reviewerId !== "string" || !renewal.reviewerId.trim()) issues.push("renewalIndependence.reviewerId가 필요합니다.");
    if (!isIsoDate(renewal.reviewedAt)) issues.push("renewalIndependence.reviewedAt가 올바른 날짜여야 합니다.");
  }

  return issues.length
    ? { ok: false, issues }
    : { ok: true, handoff: value as unknown as MagazineIntelligenceExtractionHandoff };
}

function evidenceForCandidate(article: MagazineKnowledgeArticle, candidate: KnowledgeCandidateItem): KnowledgeEvidenceRef[] {
  const refs = new Set(candidate.sourceRefs);
  return article.intelligence.evidenceRefs.filter((evidence) => refs.has(evidence.sourceRef));
}

function isPatternCandidate(item: KnowledgeCandidateItem): item is KnowledgeCandidateItem & {
  intelligenceType: Extract<KnowledgeCandidateItem["intelligenceType"], "pattern" | "anti_pattern" | "principle" | "tactic">;
} {
  return PATTERN_CANDIDATE_TYPES.has(item.intelligenceType);
}

/**
 * 완료·검토 가능한 기사 projection을 Pattern 후보 projection으로 변환한다.
 * 이 함수는 Registry/Proof를 쓰지 않으며, `qualified` 승격도 수행하지 않는다.
 */
export function extractIntelligencePatternCandidates(args: {
  article: MagazineKnowledgeArticle;
  articleRevision: string;
  currentArticleRevision?: string;
  handoff: unknown;
}): IntelligenceExtractionResult {
  const handoff = validateIntelligenceExtractionHandoff(args.handoff);
  if (!handoff.ok) return { ok: false, error: "invalid_handoff", issues: handoff.issues };
  const issues: string[] = [];
  if (handoff.handoff.contentId !== args.article.contentId) issues.push("handoff.contentId가 기사 contentId와 다릅니다.");
  if (handoff.handoff.sourceRevision !== args.article.sourceRevision) issues.push("원문 revision이 현재 기사 revision과 다릅니다.");
  if (!args.articleRevision.trim()) issues.push("articleRevision이 필요합니다.");
  if (args.currentArticleRevision !== undefined && args.articleRevision !== args.currentArticleRevision) issues.push("articleRevision이 저장된 최신 revision과 다릅니다.");
  if (issues.length) return { ok: false, error: "stale_revision", issues };

  if (args.article.intelligence.reviewStatus === "rejected" || args.article.intelligence.extractionStatus === "failed") {
    return { ok: false, error: "article_not_ready", issues: ["거부되었거나 실패한 기사는 추출할 수 없습니다."] };
  }

  const candidates = args.article.intelligence.candidateItems.filter(isPatternCandidate);
  if (candidates.length > KNOWLEDGE_LIMITS.patternRefsTotal) {
    return { ok: false, error: "scope_review_required", issues: [`Pattern 후보는 최대 ${KNOWLEDGE_LIMITS.patternRefsTotal}개까지 사람 검토 대상으로 보낼 수 있습니다.`] };
  }

  const evidenceRefs = candidates.flatMap((candidate) => evidenceForCandidate(args.article, candidate));
  const uniqueEvidence = [...new Map(evidenceRefs.map((evidence) => [evidence.id, evidence])).values()];
  const projectedCandidates = candidates.map((candidate, index) => ({
    candidateId: candidate.id,
    contentId: args.article.contentId,
    sourceRevision: args.article.sourceRevision,
    role: index < KNOWLEDGE_LIMITS.patternRefsPerAxis ? "primary" as const : "secondary" as const,
    candidateType: candidate.intelligenceType,
    statement: candidate.statement,
    articleSpan: candidate.articleSpan,
    sourceRefs: candidate.sourceRefs,
    evidenceRefs: evidenceForCandidate(args.article, candidate).map((evidence) => evidence.id),
    limitations: candidate.limitations,
    counterExamples: args.article.counterExamples,
    registryResolution: "pending" as const,
    proofRefs: [] as [],
  }));

  return {
    ok: true,
    data: {
      pipelineVersion: INTELLIGENCE_EXTRACTION_PIPELINE_VERSION,
      contentId: args.article.contentId,
      articleRevision: args.articleRevision,
      sourceRevision: args.article.sourceRevision,
      status: projectedCandidates.length ? "extracted" : "zero_pattern",
      candidates: projectedCandidates,
      evidenceRefs: uniqueEvidence,
      counterExamples: args.article.counterExamples,
      registryWrites: [],
      proofRefs: [],
    },
  };
}

export function buildExtractionStalePatch(article: MagazineKnowledgeArticle, currentSourceRevision: string) {
  return article.sourceRevision.trim() === currentSourceRevision.trim()
    ? null
    : { extractionStatus: "stale" as const };
}
