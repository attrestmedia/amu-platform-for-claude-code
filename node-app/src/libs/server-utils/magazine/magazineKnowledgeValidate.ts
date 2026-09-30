import "server-only";

import crypto from "crypto";

import {
  KNOWLEDGE_ARTICLE_CONTRACT_TYPE,
  KNOWLEDGE_ARTICLE_SCHEMA_VERSION,
  KNOWLEDGE_CLAIM_STATUSES,
  KNOWLEDGE_CONTENT_ROLES,
  KNOWLEDGE_ELIGIBILITIES,
  KNOWLEDGE_EXTERNAL_EVIDENCE_LEVELS,
  KNOWLEDGE_EXTRACTION_STATUSES,
  KNOWLEDGE_INTELLIGENCE_ROLES,
  KNOWLEDGE_INTELLIGENCE_TYPES,
  KNOWLEDGE_LIMITS,
  KNOWLEDGE_POLICY_VERSION,
  KNOWLEDGE_REVENUE_STAGES,
  KNOWLEDGE_REVIEW_STATUSES,
  KNOWLEDGE_SOURCE_SYSTEMS,
  KNOWLEDGE_TEMPORAL_CLAIM_STATUSES,
  KNOWLEDGE_UNIT_CONTRACT_TYPE,
  KNOWLEDGE_UNIT_SCHEMA_VERSION,
  KNOWLEDGE_UNIT_TYPES,
  magazineKnowledgeContentId,
  type MagazineKnowledgeArticle,
  type MagazineKnowledgeUnit,
} from "./magazineKnowledgeContract";
import {
  DATE_PATTERN,
  MagazineKnowledgeContractError,
  MONTH_OR_DATE_PATTERN,
  REVISION_PATTERN,
  assertKeys,
  canonicalUrl,
  enumValue,
  fail,
  identifier,
  isRecord,
  refList,
  safeText,
  sourceRef,
  textList,
} from "./magazineKnowledgeSafety";

/**
 * @docHint
 * @purpose Knowledge Corpus 저장 전 검증·revision 계약 — 폐기한 article-intelligence.v1 검증 계약의 이식분
 * @process fail-closed enum/구조/안전성 검증 -> 교차 규칙 판정 -> revision 해시 -> 공개 projection 축소
 * @domain magazine-knowledge-corpus
 * @scope server-contract
 */

function evidenceEntry(value: unknown, field: string) {
  if (!isRecord(value)) fail(field, "객체가 필요합니다.");
  const required = ["id", "sourceType", "sourceRef", "articleSpan", "observedAt", "claimStatus", "supports", "limitations"];
  assertKeys(value, required, required, field);
  identifier(value.id, `${field}.id`);
  safeText(value.sourceType, 64, `${field}.sourceType`);
  sourceRef(value.sourceRef, `${field}.sourceRef`);
  safeText(value.articleSpan, KNOWLEDGE_LIMITS.articleSpanLength, `${field}.articleSpan`);
  if (typeof value.observedAt !== "string" || !DATE_PATTERN.test(value.observedAt.trim())) {
    fail(`${field}.observedAt`, "ISO 날짜 또는 datetime이어야 합니다.");
  }
  enumValue(value.claimStatus, KNOWLEDGE_CLAIM_STATUSES, `${field}.claimStatus`);
  safeText(value.supports, KNOWLEDGE_LIMITS.statementLength, `${field}.supports`);
  textList(value.limitations, `${field}.limitations`);
}

function evidenceList(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > KNOWLEDGE_LIMITS.evidenceRefs) {
    fail(field, `${KNOWLEDGE_LIMITS.evidenceRefs}개 이하여야 합니다.`);
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    evidenceEntry(item, `${field}[${index}]`);
    const id = String((item as Record<string, unknown>).id).trim();
    if (ids.has(id)) fail(field, "id가 중복됩니다.");
    ids.add(id);
  });
  return value;
}

function candidateEntry(value: unknown, index: number): void {
  const field = `intelligence.candidateItems[${index}]`;
  if (!isRecord(value)) fail(field, "객체가 필요합니다.");
  const required = ["id", "intelligenceType", "statement", "articleSpan", "sourceRefs", "limitations"];
  assertKeys(value, required, [...required, "registryRef"], field);
  identifier(value.id, `${field}.id`);
  enumValue(value.intelligenceType, KNOWLEDGE_INTELLIGENCE_TYPES, `${field}.intelligenceType`);
  safeText(value.statement, KNOWLEDGE_LIMITS.statementLength, `${field}.statement`);
  safeText(value.articleSpan, KNOWLEDGE_LIMITS.articleSpanLength, `${field}.articleSpan`);
  if (!Array.isArray(value.sourceRefs) || value.sourceRefs.length > KNOWLEDGE_LIMITS.candidateSourceRefs) {
    fail(`${field}.sourceRefs`, `${KNOWLEDGE_LIMITS.candidateSourceRefs}개 이하여야 합니다.`);
  }
  const refs = value.sourceRefs.map((item, refIndex) => sourceRef(item, `${field}.sourceRefs[${refIndex}]`));
  if (new Set(refs).size !== refs.length) fail(`${field}.sourceRefs`, "중복 참조를 포함할 수 없습니다.");
  textList(value.limitations, `${field}.limitations`);
  if (value.registryRef !== undefined) identifier(value.registryRef, `${field}.registryRef`);
}

function temporalClaim(value: unknown, index: number): void {
  const field = `temporalClaims[${index}]`;
  if (!isRecord(value)) fail(field, "객체가 필요합니다.");
  const required = ["date", "claim", "status"];
  assertKeys(value, required, [...required, "sourceRef"], field);
  if (typeof value.date !== "string" || !MONTH_OR_DATE_PATTERN.test(value.date.trim())) {
    fail(`${field}.date`, "YYYY, YYYY-MM 또는 YYYY-MM-DD여야 합니다.");
  }
  safeText(value.claim, KNOWLEDGE_LIMITS.statementLength, `${field}.claim`);
  enumValue(value.status, KNOWLEDGE_TEMPORAL_CLAIM_STATUSES, `${field}.status`);
  if (value.sourceRef !== undefined) sourceRef(value.sourceRef, `${field}.sourceRef`);
}

function sourceDescriptor(value: unknown): { postId: number; slug: string } {
  if (!isRecord(value)) fail("source", "객체가 필요합니다.");
  const required = ["system", "postId", "slug", "canonicalUrl"];
  assertKeys(value, required, required, "source");
  enumValue(value.system, KNOWLEDGE_SOURCE_SYSTEMS, "source.system");
  if (!Number.isInteger(value.postId) || Number(value.postId) <= 0) fail("source.postId", "양의 정수가 필요합니다.");
  const slug = identifier(value.slug, "source.slug", true);
  canonicalUrl(value.canonicalUrl, "source.canonicalUrl");
  return { postId: Number(value.postId), slug };
}

/** 이식한 교차 규칙 — 한 축의 값만으로는 판정할 수 없는 조합을 여기서 막는다. */
function intelligenceBlock(value: unknown): void {
  if (!isRecord(value)) fail("intelligence", "객체가 필요합니다.");
  const required = [
    "eligibility", "extractionStatus", "reviewStatus", "primaryPatternRefs", "secondaryPatternRefs",
    "candidateItems", "evidenceRefs", "externalEvidenceLevel", "claimStatus", "applicability",
    "revenueStages", "amuProofRefs", "reviewedAt", "reviewedBy", "reviewMemo",
  ];
  assertKeys(value, required, required, "intelligence");

  const eligibility = enumValue(value.eligibility, KNOWLEDGE_ELIGIBILITIES, "intelligence.eligibility");
  enumValue(value.extractionStatus, KNOWLEDGE_EXTRACTION_STATUSES, "intelligence.extractionStatus");
  const reviewStatus = enumValue(value.reviewStatus, KNOWLEDGE_REVIEW_STATUSES, "intelligence.reviewStatus");
  const externalEvidenceLevel = enumValue(value.externalEvidenceLevel, KNOWLEDGE_EXTERNAL_EVIDENCE_LEVELS, "intelligence.externalEvidenceLevel");
  enumValue(value.claimStatus, KNOWLEDGE_CLAIM_STATUSES, "intelligence.claimStatus");

  const primary = refList(value.primaryPatternRefs, "intelligence.primaryPatternRefs", KNOWLEDGE_LIMITS.patternRefsPerAxis);
  const secondary = refList(value.secondaryPatternRefs, "intelligence.secondaryPatternRefs", KNOWLEDGE_LIMITS.patternRefsPerAxis);
  if (new Set([...primary, ...secondary]).size > KNOWLEDGE_LIMITS.patternRefsTotal) {
    fail("intelligence.patternRefs", `Pattern 참조는 ${KNOWLEDGE_LIMITS.patternRefsTotal}개 이하여야 합니다.`);
  }

  const candidates = value.candidateItems;
  if (!Array.isArray(candidates) || candidates.length > KNOWLEDGE_LIMITS.candidateItems) {
    fail("intelligence.candidateItems", `${KNOWLEDGE_LIMITS.candidateItems}개 이하여야 합니다.`);
  }
  const candidateIds = new Set<string>();
  candidates.forEach((item, index) => {
    candidateEntry(item, index);
    const id = String((item as Record<string, unknown>).id).trim();
    if (candidateIds.has(id)) fail("intelligence.candidateItems", "id가 중복됩니다.");
    candidateIds.add(id);
  });

  const evidences = evidenceList(value.evidenceRefs, "intelligence.evidenceRefs");
  textList(value.applicability, "intelligence.applicability");

  const revenueStages = value.revenueStages;
  if (!Array.isArray(revenueStages) || revenueStages.length > KNOWLEDGE_REVENUE_STAGES.length || new Set(revenueStages).size !== revenueStages.length) {
    fail("intelligence.revenueStages", `중복 없는 ${KNOWLEDGE_REVENUE_STAGES.length}개 이하 목록이어야 합니다.`);
  }
  revenueStages.forEach((stage, index) => enumValue(stage, KNOWLEDGE_REVENUE_STAGES, `intelligence.revenueStages[${index}]`));

  const proofRefs = refList(value.amuProofRefs, "intelligence.amuProofRefs", KNOWLEDGE_LIMITS.proofRefs);

  if (value.reviewedAt !== null && (typeof value.reviewedAt !== "string" || !DATE_PATTERN.test(value.reviewedAt.trim()))) {
    fail("intelligence.reviewedAt", "null 또는 ISO 날짜여야 합니다.");
  }
  if (value.reviewedBy !== null) identifier(value.reviewedBy, "intelligence.reviewedBy");
  safeText(value.reviewMemo, KNOWLEDGE_LIMITS.memoLength, "intelligence.reviewMemo", true);

  if (reviewStatus === "unreviewed" && (value.reviewedAt !== null || value.reviewedBy !== null)) {
    fail("intelligence.reviewStatus", "unreviewed에는 reviewer 기록을 둘 수 없습니다.");
  }
  if (reviewStatus !== "unreviewed" && (value.reviewedAt === null || value.reviewedBy === null)) {
    fail("intelligence.reviewStatus", "검토 상태에는 reviewer 기록이 필요합니다.");
  }
  if (reviewStatus === "approved" && eligibility !== "qualified") {
    fail("intelligence.reviewStatus", "approved는 qualified 기사에만 사용할 수 있습니다.");
  }
  if (eligibility === "none" && (primary.length || secondary.length || candidates.length || evidences.length || proofRefs.length)) {
    fail("intelligence.eligibility", "none에는 Intelligence·Evidence·Pattern·Proof를 저장할 수 없습니다.");
  }
  if (externalEvidenceLevel === "unsupported" && eligibility !== "none") {
    if (eligibility !== "candidate" || !candidates.length) {
      fail("intelligence.externalEvidenceLevel", "unsupported는 candidate Hypothesis 기록에만 사용할 수 있습니다.");
    }
    if (candidates.some((item) => (item as Record<string, unknown>).intelligenceType !== "hypothesis")) {
      fail("intelligence.candidateItems", "unsupported candidate에는 Hypothesis만 저장할 수 있습니다.");
    }
  }
  if (eligibility !== "qualified" && proofRefs.length) {
    fail("intelligence.amuProofRefs", "qualified 이전에는 AMU Proof를 연결할 수 없습니다.");
  }
}

export type MagazineKnowledgeArticleValidation =
  | { ok: true; article: MagazineKnowledgeArticle }
  | { ok: false; reasonCode: "knowledge_article_invalid"; issues: string[] };

export function validateMagazineKnowledgeArticle(value: unknown): MagazineKnowledgeArticleValidation {
  try {
    if (!isRecord(value)) fail("article", "객체가 필요합니다.");
    const required = [
      "contractType", "schemaVersion", "policyVersion", "contentId", "source", "sourceRevision",
      "primaryQuestion", "thesis", "contentRole", "intelligenceRole", "evergreenPrinciple",
      "temporalClaims", "conditions", "limitations", "counterExamples", "entities", "topics",
      "intent", "audience", "intelligence",
    ];
    assertKeys(value, required, required, "article");
    if (value.contractType !== KNOWLEDGE_ARTICLE_CONTRACT_TYPE) fail("contractType", "지원하지 않는 contractType입니다.");
    if (value.schemaVersion !== KNOWLEDGE_ARTICLE_SCHEMA_VERSION) fail("schemaVersion", "지원하지 않는 schemaVersion입니다.");
    if (value.policyVersion !== KNOWLEDGE_POLICY_VERSION) fail("policyVersion", "지원하는 policyVersion이 아닙니다.");

    const source = sourceDescriptor(value.source);
    const expectedContentId = magazineKnowledgeContentId(source.postId);
    if (value.contentId !== expectedContentId) fail("contentId", `source.postId와 결합된 ${expectedContentId}이어야 합니다.`);
    if (typeof value.sourceRevision !== "string" || !REVISION_PATTERN.test(value.sourceRevision.trim())) {
      fail("sourceRevision", "원문 revision 문자열이 필요합니다.");
    }

    safeText(value.primaryQuestion, KNOWLEDGE_LIMITS.statementLength, "primaryQuestion");
    safeText(value.thesis, KNOWLEDGE_LIMITS.statementLength, "thesis");
    enumValue(value.contentRole, KNOWLEDGE_CONTENT_ROLES, "contentRole");
    enumValue(value.intelligenceRole, KNOWLEDGE_INTELLIGENCE_ROLES, "intelligenceRole");
    if (value.evergreenPrinciple !== null) safeText(value.evergreenPrinciple, KNOWLEDGE_LIMITS.statementLength, "evergreenPrinciple");

    if (!Array.isArray(value.temporalClaims) || value.temporalClaims.length > KNOWLEDGE_LIMITS.temporalClaims) {
      fail("temporalClaims", `${KNOWLEDGE_LIMITS.temporalClaims}개 이하여야 합니다.`);
    }
    value.temporalClaims.forEach((item, index) => temporalClaim(item, index));

    textList(value.conditions, "conditions");
    textList(value.limitations, "limitations");
    textList(value.counterExamples, "counterExamples");
    const entities = textList(value.entities, "entities", KNOWLEDGE_LIMITS.entities, KNOWLEDGE_LIMITS.shortTextLength);
    if (new Set(entities).size !== entities.length) fail("entities", "중복 항목을 포함할 수 없습니다.");
    const topics = textList(value.topics, "topics", KNOWLEDGE_LIMITS.topics, KNOWLEDGE_LIMITS.shortTextLength);
    if (new Set(topics).size !== topics.length) fail("topics", "중복 항목을 포함할 수 없습니다.");
    safeText(value.intent, KNOWLEDGE_LIMITS.shortTextLength, "intent");
    safeText(value.audience, KNOWLEDGE_LIMITS.shortTextLength, "audience");

    intelligenceBlock(value.intelligence);
    return { ok: true, article: value as unknown as MagazineKnowledgeArticle };
  } catch (error) {
    const message = error instanceof MagazineKnowledgeContractError ? error.message : "계약 검증에 실패했습니다.";
    return { ok: false, reasonCode: "knowledge_article_invalid", issues: [message] };
  }
}

export type MagazineKnowledgeUnitValidation =
  | { ok: true; unit: MagazineKnowledgeUnit }
  | { ok: false; reasonCode: "knowledge_unit_invalid"; issues: string[] };

export function validateMagazineKnowledgeUnit(value: unknown): MagazineKnowledgeUnitValidation {
  try {
    if (!isRecord(value)) fail("unit", "객체가 필요합니다.");
    const required = [
      "contractType", "schemaVersion", "policyVersion", "unitId", "articleRef", "sourceRevision",
      "unitType", "statement", "articleSpan", "mechanism", "conditions", "limitations", "evidenceRefs",
    ];
    assertKeys(value, required, required, "unit");
    if (value.contractType !== KNOWLEDGE_UNIT_CONTRACT_TYPE) fail("contractType", "지원하지 않는 contractType입니다.");
    if (value.schemaVersion !== KNOWLEDGE_UNIT_SCHEMA_VERSION) fail("schemaVersion", "지원하지 않는 schemaVersion입니다.");
    if (value.policyVersion !== KNOWLEDGE_POLICY_VERSION) fail("policyVersion", "지원하는 policyVersion이 아닙니다.");

    if (!isRecord(value.articleRef)) fail("articleRef", "객체가 필요합니다.");
    assertKeys(value.articleRef, ["contentId", "postId"], ["contentId", "postId"], "articleRef");
    if (!Number.isInteger(value.articleRef.postId) || Number(value.articleRef.postId) <= 0) {
      fail("articleRef.postId", "양의 정수가 필요합니다.");
    }
    const expectedContentId = magazineKnowledgeContentId(Number(value.articleRef.postId));
    if (value.articleRef.contentId !== expectedContentId) fail("articleRef.contentId", `${expectedContentId}이어야 합니다.`);

    const unitId = identifier(value.unitId, "unitId");
    if (!unitId.startsWith(`amu:magazine-knowledge-unit:${Number(value.articleRef.postId)}:`)) {
      fail("unitId", "articleRef.postId와 결합된 unitId여야 합니다.");
    }
    if (typeof value.sourceRevision !== "string" || !REVISION_PATTERN.test(value.sourceRevision.trim())) {
      fail("sourceRevision", "원문 revision 문자열이 필요합니다.");
    }

    enumValue(value.unitType, KNOWLEDGE_UNIT_TYPES, "unitType");
    safeText(value.statement, KNOWLEDGE_LIMITS.statementLength, "statement");
    safeText(value.articleSpan, KNOWLEDGE_LIMITS.articleSpanLength, "articleSpan");
    safeText(value.mechanism, KNOWLEDGE_LIMITS.statementLength, "mechanism");
    textList(value.conditions, "conditions");
    textList(value.limitations, "limitations");
    evidenceList(value.evidenceRefs, "evidenceRefs");
    return { ok: true, unit: value as unknown as MagazineKnowledgeUnit };
  } catch (error) {
    const message = error instanceof MagazineKnowledgeContractError ? error.message : "계약 검증에 실패했습니다.";
    return { ok: false, reasonCode: "knowledge_unit_invalid", issues: [message] };
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

/** 저장 계약 본문만 해시한다. createdAt·updatedAt·revision은 대상에서 제외(CAS 보호). */
export function magazineKnowledgeRevision(value: MagazineKnowledgeArticle | MagazineKnowledgeUnit): string {
  const { createdAt: _createdAt, updatedAt: _updatedAt, revision: _revision, ...rest } = value as unknown as Record<string, unknown>;
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(rest))).digest("hex");
}

export interface PublicKnowledgeArticle {
  contentId: string;
  postId: number;
  slug: string;
  canonicalUrl: string;
  primaryQuestion: string;
  thesis: string;
  contentRole: MagazineKnowledgeArticle["contentRole"];
  intelligenceRole: MagazineKnowledgeArticle["intelligenceRole"];
  evergreenPrinciple: string | null;
  conditions: string[];
  limitations: string[];
  counterExamples: string[];
  entities: string[];
  topics: string[];
  intent: string;
  audience: string;
}

/**
 * 공개 projection — 미승인 후보·검토 메모·Evidence 상세·Pattern/Proof 참조·내부 점수를 전부 제외한다.
 * (INTELLIGENCE-PATTERN-POLICY.md §8 공개 응답 경계, 원장 G-MIR-08)
 */
export function publicKnowledgeArticleProjection(article: MagazineKnowledgeArticle): PublicKnowledgeArticle {
  return {
    contentId: article.contentId,
    postId: article.source.postId,
    slug: article.source.slug,
    canonicalUrl: article.source.canonicalUrl,
    primaryQuestion: article.primaryQuestion,
    thesis: article.thesis,
    contentRole: article.contentRole,
    intelligenceRole: article.intelligenceRole,
    evergreenPrinciple: article.evergreenPrinciple,
    conditions: [...article.conditions],
    limitations: [...article.limitations],
    counterExamples: [...article.counterExamples],
    entities: [...article.entities],
    topics: [...article.topics],
    intent: article.intent,
    audience: article.audience,
  };
}

export interface PublicKnowledgeUnit {
  unitId: string;
  contentId: string;
  postId: number;
  unitType: MagazineKnowledgeUnit["unitType"];
  statement: string;
  mechanism: string;
  conditions: string[];
  limitations: string[];
}

export function publicKnowledgeUnitProjection(unit: MagazineKnowledgeUnit): PublicKnowledgeUnit {
  return {
    unitId: unit.unitId,
    contentId: unit.articleRef.contentId,
    postId: unit.articleRef.postId,
    unitType: unit.unitType,
    statement: unit.statement,
    mechanism: unit.mechanism,
    conditions: [...unit.conditions],
    limitations: [...unit.limitations],
  };
}

/**
 * 공개 노출 자격은 기사 단위로만 판정한다.
 * Knowledge Unit은 소속 기사가 qualified·approved이고 stale이 아닐 때만 노출한다.
 */
export function isPubliclyExposableKnowledgeArticle(article: MagazineKnowledgeArticle): boolean {
  return article.intelligence.eligibility === "qualified"
    && article.intelligence.reviewStatus === "approved"
    && article.intelligence.extractionStatus !== "stale"
    && article.intelligence.extractionStatus !== "failed";
}

export function isStaleKnowledgeUnit(unit: MagazineKnowledgeUnit, article: MagazineKnowledgeArticle): boolean {
  return unit.sourceRevision.trim() !== article.sourceRevision.trim();
}
