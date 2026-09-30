import "server-only";

/**
 * @docHint
 * @purpose Magazine Knowledge Corpus(정본 기사 + Knowledge Unit)의 계약 타입·상수 — MIR-200
 * @process 정책 enum·상한·식별 규칙을 단일 계약 파일로 제공, 검증은 magazineKnowledgeValidate가 수행
 * @domain magazine-knowledge-corpus
 * @scope server-contract
 */

/**
 * Article Experience(article-experience.v1 / magazine_article_declarations)와는
 * 별도 collection·별도 schemaVersion이다. 서로 흡수·병합하지 않는다.
 * (원장 `.agent/todo-amu-magazine-intelligence-renewal.json` MIR-200 deliverables)
 */
export const KNOWLEDGE_ARTICLE_CONTRACT_TYPE = "magazine-knowledge-article" as const;
export const KNOWLEDGE_ARTICLE_SCHEMA_VERSION = "magazine-knowledge-article.v1" as const;
export const KNOWLEDGE_UNIT_CONTRACT_TYPE = "magazine-knowledge-unit" as const;
export const KNOWLEDGE_UNIT_SCHEMA_VERSION = "magazine-knowledge-unit.v1" as const;

/** INTELLIGENCE-PATTERN-POLICY.md 문서 버전. 값이 다른 입력은 거부한다. */
export const KNOWLEDGE_POLICY_VERSION = "intelligence-pattern-policy-v1.3" as const;

/** 본문 정본은 WordPress에 둔다. 여기에는 참조만 저장한다. */
export const KNOWLEDGE_SOURCE_SYSTEMS = ["wordpress"] as const;
export type KnowledgeSourceSystem = (typeof KNOWLEDGE_SOURCE_SYSTEMS)[number];

/** canonical은 매거진 자기 도메인만 허용한다 — 외부 canonical 지정으로 색인을 넘기지 못하게 한다. */
export const KNOWLEDGE_CANONICAL_HOSTS = ["allmyuniverse.com", "www.allmyuniverse.com"] as const;

/** CONTENT-INTELLIGENCE.md Content Role. appContentContract.APP_CONTENT_ROLES와 같은 값이어야 한다. */
export const KNOWLEDGE_CONTENT_ROLES = ["reach", "relationship", "trust", "expansion", "conversion"] as const;
export type KnowledgeContentRole = (typeof KNOWLEDGE_CONTENT_ROLES)[number];

/** INTELLIGENCE-PATTERN-POLICY.md §4.2 */
export const KNOWLEDGE_INTELLIGENCE_ROLES = ["case", "analysis", "explainer", "experiment", "playbook", "opinion", "none"] as const;
export type KnowledgeIntelligenceRole = (typeof KNOWLEDGE_INTELLIGENCE_ROLES)[number];

/** INTELLIGENCE-PATTERN-POLICY.md §3.1 */
export const KNOWLEDGE_ELIGIBILITIES = ["none", "candidate", "qualified"] as const;
export type KnowledgeEligibility = (typeof KNOWLEDGE_ELIGIBILITIES)[number];

/** INTELLIGENCE-PATTERN-POLICY.md §8 */
export const KNOWLEDGE_EXTRACTION_STATUSES = ["not_started", "in_progress", "extracted", "stale", "failed"] as const;
export type KnowledgeExtractionStatus = (typeof KNOWLEDGE_EXTRACTION_STATUSES)[number];

export const KNOWLEDGE_REVIEW_STATUSES = ["unreviewed", "needs_revision", "approved", "rejected"] as const;
export type KnowledgeReviewStatus = (typeof KNOWLEDGE_REVIEW_STATUSES)[number];

/** INTELLIGENCE-PATTERN-POLICY.md §4.1 — candidateItems 전용(Proof 포함) */
export const KNOWLEDGE_INTELLIGENCE_TYPES = [
  "case",
  "evidence",
  "signal",
  "tactic",
  "principle",
  "pattern",
  "anti_pattern",
  "hypothesis",
  "proof",
] as const;
export type KnowledgeIntelligenceType = (typeof KNOWLEDGE_INTELLIGENCE_TYPES)[number];

/**
 * Knowledge Unit 타입 — magazine_knowledge_article.md §19의 8종.
 * `proof`는 제외한다. AMU Proof 승격은 PROOF-BANK.md가 소유하며 추출 단위가 만들지 않는다.
 */
export const KNOWLEDGE_UNIT_TYPES = [
  "case",
  "evidence",
  "signal",
  "tactic",
  "principle",
  "pattern",
  "anti_pattern",
  "hypothesis",
] as const;
export type KnowledgeUnitType = (typeof KNOWLEDGE_UNIT_TYPES)[number];

/** INTELLIGENCE-PATTERN-POLICY.md §5.1 */
export const KNOWLEDGE_EXTERNAL_EVIDENCE_LEVELS = ["unsupported", "single_source", "multi_source", "quantitative"] as const;
export type KnowledgeExternalEvidenceLevel = (typeof KNOWLEDGE_EXTERNAL_EVIDENCE_LEVELS)[number];

/** BUSINESS-CHARTER claim 상태 그대로 */
export const KNOWLEDGE_CLAIM_STATUSES = ["measured", "sourced", "hypothesis", "prohibited"] as const;
export type KnowledgeClaimStatus = (typeof KNOWLEDGE_CLAIM_STATUSES)[number];

/** MEASUREMENT-PLAN.md Revenue Ladder 표시 라벨. 단계 수·별칭을 추가하지 않는다. */
export const KNOWLEDGE_REVENUE_STAGES = [
  "Reach",
  "Consumption",
  "Relationship",
  "Signup",
  "Return",
  "Expansion",
  "Magazine Return",
  "Revenue",
] as const;
export type KnowledgeRevenueStage = (typeof KNOWLEDGE_REVENUE_STAGES)[number];

/** magazine_knowledge_article.md §16 — 시점 주장과 원리를 분리해 저장한다. */
export const KNOWLEDGE_TEMPORAL_CLAIM_STATUSES = ["current", "historical"] as const;
export type KnowledgeTemporalClaimStatus = (typeof KNOWLEDGE_TEMPORAL_CLAIM_STATUSES)[number];

/** 이식한 상한. 값을 늘리면 저장 비용이 아니라 검토 부담이 늘어난다. */
export const KNOWLEDGE_LIMITS = {
  patternRefsPerAxis: 3,
  patternRefsTotal: 6,
  candidateItems: 6,
  candidateSourceRefs: 8,
  evidenceRefs: 24,
  proofRefs: 24,
  textListItems: 12,
  textListLength: 1000,
  topics: 16,
  entities: 24,
  temporalClaims: 12,
  statementLength: 4000,
  articleSpanLength: 4000,
  memoLength: 4000,
  sourceRefLength: 2000,
  shortTextLength: 400,
  identifierLength: 160,
} as const;

export interface KnowledgeSourceRefDescriptor {
  system: KnowledgeSourceSystem;
  postId: number;
  slug: string;
  canonicalUrl: string;
}

export interface KnowledgeTemporalClaim {
  date: string;
  claim: string;
  status: KnowledgeTemporalClaimStatus;
  sourceRef?: string;
}

export interface KnowledgeCandidateItem {
  id: string;
  intelligenceType: KnowledgeIntelligenceType;
  statement: string;
  articleSpan: string;
  sourceRefs: string[];
  limitations: string[];
  registryRef?: string;
}

export interface KnowledgeEvidenceRef {
  id: string;
  sourceType: string;
  sourceRef: string;
  articleSpan: string;
  observedAt: string;
  claimStatus: KnowledgeClaimStatus;
  supports: string;
  limitations: string[];
}

/**
 * 폐기한 `article-intelligence.v1` 선언의 이식분.
 * `intelligenceRole`·`limitations[]`는 기사 본문 계약이 이미 소유하므로 여기서 중복 보관하지 않는다.
 * WordPress 전용이던 `postId`·`postSlug`·`articleRevision`은 기사의 `source`·`sourceRevision`이 대신한다.
 */
export interface KnowledgeIntelligence {
  eligibility: KnowledgeEligibility;
  extractionStatus: KnowledgeExtractionStatus;
  reviewStatus: KnowledgeReviewStatus;
  primaryPatternRefs: string[];
  secondaryPatternRefs: string[];
  candidateItems: KnowledgeCandidateItem[];
  evidenceRefs: KnowledgeEvidenceRef[];
  externalEvidenceLevel: KnowledgeExternalEvidenceLevel;
  claimStatus: KnowledgeClaimStatus;
  applicability: string[];
  revenueStages: KnowledgeRevenueStage[];
  amuProofRefs: string[];
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewMemo: string;
}

/** 기사 1건 = document 1개. 본문 정본은 WordPress이며 여기에는 구조화 projection만 둔다. */
export interface MagazineKnowledgeArticle {
  contractType: typeof KNOWLEDGE_ARTICLE_CONTRACT_TYPE;
  schemaVersion: typeof KNOWLEDGE_ARTICLE_SCHEMA_VERSION;
  policyVersion: typeof KNOWLEDGE_POLICY_VERSION;
  contentId: string;
  source: KnowledgeSourceRefDescriptor;
  /** 판정 시점의 원문 revision. 입력이 현재 저장값과 다르면 stale로 거부한다. */
  sourceRevision: string;
  primaryQuestion: string;
  thesis: string;
  contentRole: KnowledgeContentRole;
  intelligenceRole: KnowledgeIntelligenceRole;
  evergreenPrinciple: string | null;
  temporalClaims: KnowledgeTemporalClaim[];
  conditions: string[];
  limitations: string[];
  counterExamples: string[];
  entities: string[];
  topics: string[];
  /** 검색 의도·독자. 정책 정본에 확정 enum이 없어 통제 문자열로 둔다(추정 — MIR-202 실측 후 enum 확정). */
  intent: string;
  audience: string;
  intelligence: KnowledgeIntelligence;
}

/** 기사보다 작은 검색·재사용 단위. 원문 §12. */
export interface MagazineKnowledgeUnit {
  contractType: typeof KNOWLEDGE_UNIT_CONTRACT_TYPE;
  schemaVersion: typeof KNOWLEDGE_UNIT_SCHEMA_VERSION;
  policyVersion: typeof KNOWLEDGE_POLICY_VERSION;
  unitId: string;
  articleRef: { contentId: string; postId: number };
  /** 추출 근거가 된 기사 revision. 기사의 현재 sourceRevision과 다르면 stale이다. */
  sourceRevision: string;
  unitType: KnowledgeUnitType;
  statement: string;
  articleSpan: string;
  mechanism: string;
  conditions: string[];
  limitations: string[];
  evidenceRefs: KnowledgeEvidenceRef[];
}

/** WordPress postId를 기사 contentId로 고정 변환한다. slug가 바뀌어도 식별자는 유지된다. */
export function magazineKnowledgeContentId(postId: number): string {
  return `amu:magazine-knowledge:${postId}`;
}

/** unitId는 기사 안에서만 고유한 local id를 받아 전역 유일 키로 만든다. */
export function magazineKnowledgeUnitId(postId: number, localId: string): string {
  return `amu:magazine-knowledge-unit:${postId}:${localId}`;
}
