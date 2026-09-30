import "server-only";

/**
 * @docHint
 * @purpose AMU Intelligence Pattern Registry v1의 타입·상수·식별 규칙 — AIR-800
 * @process canonical Pattern -> alias/article/evidence/review 연결을 Winning Pattern·Proof와 분리
 * @domain intelligence-pattern-registry
 * @scope server-contract
 */

export const INTELLIGENCE_PATTERN_CONTRACT_TYPE = "intelligence-pattern-registry" as const;
export const INTELLIGENCE_PATTERN_SCHEMA_VERSION = "intelligence-pattern-registry.v1" as const;
export const INTELLIGENCE_PATTERN_POLICY_VERSION = "intelligence-pattern-policy-v1.3" as const;
export const INTELLIGENCE_PATTERN_NAMESPACE = "intelligencePattern" as const;
export const INTELLIGENCE_PATTERN_ID_PREFIX = "amu:intelligence-pattern:" as const;

export const PATTERN_MATURITIES = ["candidate", "emerging", "active"] as const;
export type PatternMaturity = (typeof PATTERN_MATURITIES)[number];

export const PATTERN_SCOPE_STATUSES = ["general", "contextual"] as const;
export type PatternScopeStatus = (typeof PATTERN_SCOPE_STATUSES)[number];

export const PATTERN_HEALTH_STATUSES = ["current", "weakening", "deprecated"] as const;
export type PatternHealthStatus = (typeof PATTERN_HEALTH_STATUSES)[number];

export const PATTERN_REVIEW_DECISIONS = ["candidate", "emerging", "active", "reject", "weaken", "deprecate"] as const;
export type PatternReviewDecision = (typeof PATTERN_REVIEW_DECISIONS)[number];

export const PATTERN_REVIEWER_TYPES = ["human", "system"] as const;
export type PatternReviewerType = (typeof PATTERN_REVIEWER_TYPES)[number];

export const PATTERN_LINK_ROLES = ["primary", "secondary"] as const;
export type PatternLinkRole = (typeof PATTERN_LINK_ROLES)[number];

export const PATTERN_LINK_STATUSES = ["current", "stale", "rejected"] as const;
export type PatternLinkStatus = (typeof PATTERN_LINK_STATUSES)[number];

export const PATTERN_EVIDENCE_VISIBILITIES = ["public", "internal"] as const;
export type PatternEvidenceVisibility = (typeof PATTERN_EVIDENCE_VISIBILITIES)[number];

export const PATTERN_EVIDENCE_LEVELS = ["unsupported", "single_source", "multi_source", "quantitative"] as const;
export type PatternEvidenceLevel = (typeof PATTERN_EVIDENCE_LEVELS)[number];

export const PATTERN_CLAIM_STATUSES = ["measured", "sourced", "hypothesis", "prohibited"] as const;
export type PatternClaimStatus = (typeof PATTERN_CLAIM_STATUSES)[number];

export const PATTERN_LIMITS = {
  aliases: 12,
  articleLinks: 24,
  evidence: 48,
  counterEvidence: 24,
  reviews: 24,
  conditions: 12,
  limitations: 12,
  scopeContext: 8,
  text: 4000,
  shortText: 400,
  owner: 160,
  sourceRef: 2000,
} as const;

export interface PatternAlias {
  alias: string;
  normalized: string;
  addedAt: string;
  addedBy: string;
}

export interface PatternArticleLink {
  linkId: string;
  contentId: string;
  postId: number;
  articleRevision: string;
  role: PatternLinkRole;
  linkStatus: PatternLinkStatus;
  evidenceRefs: string[];
  linkedAt: string;
  linkedBy: string;
}

export interface PatternEvidence {
  evidenceId: string;
  sourceType: string;
  sourceRef: string;
  articleSpan: string;
  articleRevision: string | null;
  observedAt: string;
  claimStatus: PatternClaimStatus;
  evidenceLevel: PatternEvidenceLevel;
  supports: string;
  limitations: string[];
  visibility: PatternEvidenceVisibility;
}

export interface PatternCounterEvidence {
  counterEvidenceId: string;
  sourceType: string;
  sourceRef: string;
  observedAt: string;
  claimStatus: PatternClaimStatus;
  supports: string;
  limitations: string[];
  visibility: PatternEvidenceVisibility;
}

export interface PatternReview {
  reviewId: string;
  decision: PatternReviewDecision;
  reviewerType: PatternReviewerType;
  reviewerId: string;
  reviewedAt: string;
  memo: string;
  inputRevision: string;
}

export interface IntelligencePattern {
  contractType: typeof INTELLIGENCE_PATTERN_CONTRACT_TYPE;
  schemaVersion: typeof INTELLIGENCE_PATTERN_SCHEMA_VERSION;
  policyVersion: typeof INTELLIGENCE_PATTERN_POLICY_VERSION;
  namespace: typeof INTELLIGENCE_PATTERN_NAMESPACE;
  patternId: string;
  canonicalName: string;
  normalizedName: string;
  definition: string;
  conditions: string[];
  mechanism: string;
  expectedOutcome: string;
  limitations: string[];
  owner: string;
  maturity: PatternMaturity;
  scopeStatus: PatternScopeStatus;
  scopeContext: string[];
  healthStatus: PatternHealthStatus;
  firstObserved: string;
  lastObserved: string;
  lastReviewed: string | null;
  reviewDueAt: string | null;
  aliases: PatternAlias[];
  articleLinks: PatternArticleLink[];
  evidence: PatternEvidence[];
  counterEvidence: PatternCounterEvidence[];
  reviews: PatternReview[];
}

export interface IntelligencePatternDocumentEnvelope {
  pattern: IntelligencePattern;
  revision: string;
  source: "admin";
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PatternResolution =
  | "reuse"
  | "alias"
  | "merge_candidate"
  | "create_candidate";

export function normalizePatternName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

export function patternIdForName(value: string): string {
  const normalized = normalizePatternName(value);
  let hash = 2166136261;
  for (const char of normalized) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${INTELLIGENCE_PATTERN_ID_PREFIX}${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isPatternRecommended(pattern: IntelligencePattern, now = new Date()): boolean {
  if (pattern.maturity !== "active" || pattern.scopeStatus !== "general" || pattern.healthStatus !== "current") return false;
  if (!pattern.reviewDueAt) return false;
  const reviewDueAt = new Date(pattern.reviewDueAt);
  return !Number.isNaN(reviewDueAt.getTime()) && reviewDueAt.getTime() >= now.getTime();
}

/**
 * AIR-802 public read allowlist. contextual Pattern은 요청 context가 scopeContext와 정확히 일치할 때만 통과한다.
 * articleRevision 대조는 저장소 projection 단계에서 별도로 수행한다.
 */
export function isPatternEligibleForPublicRead(pattern: IntelligencePattern, args: { now?: Date; context?: string } = {}): boolean {
  const now = args.now ?? new Date();
  if (pattern.maturity !== "active" || pattern.healthStatus !== "current" || !pattern.reviewDueAt) return false;
  const reviewDueAt = new Date(pattern.reviewDueAt);
  if (Number.isNaN(reviewDueAt.getTime()) || reviewDueAt.getTime() < now.getTime()) return false;
  if (pattern.scopeStatus === "general") return true;
  const context = args.context?.normalize("NFKC").trim();
  return Boolean(context && pattern.scopeContext.some((item) => item.normalize("NFKC").trim() === context));
}
