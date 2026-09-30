import "server-only";

import crypto from "crypto";

import {
  INTELLIGENCE_PATTERN_CONTRACT_TYPE,
  INTELLIGENCE_PATTERN_ID_PREFIX,
  INTELLIGENCE_PATTERN_NAMESPACE,
  INTELLIGENCE_PATTERN_POLICY_VERSION,
  INTELLIGENCE_PATTERN_SCHEMA_VERSION,
  PATTERN_CLAIM_STATUSES,
  PATTERN_EVIDENCE_LEVELS,
  PATTERN_EVIDENCE_VISIBILITIES,
  PATTERN_HEALTH_STATUSES,
  PATTERN_LIMITS,
  PATTERN_LINK_ROLES,
  PATTERN_LINK_STATUSES,
  PATTERN_MATURITIES,
  PATTERN_REVIEW_DECISIONS,
  PATTERN_REVIEWER_TYPES,
  PATTERN_SCOPE_STATUSES,
  normalizePatternName,
  type IntelligencePattern,
} from "./magazineIntelligencePatternContract";
import {
  DATE_PATTERN,
  MagazineKnowledgeContractError,
  REVISION_PATTERN,
  assertKeys,
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
 * @purpose Pattern Registry v1의 fail-closed 검증·lifecycle 승격 규칙 — AIR-800
 * @process namespace/schema/PII 검증 -> alias·link·Evidence 정합 -> active 승격 조건 확인
 * @domain intelligence-pattern-registry
 * @scope server-contract
 */

function date(value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) fail(field, "ISO 날짜 또는 datetime이어야 합니다.");
}

function revision(value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !REVISION_PATTERN.test(value.trim())) fail(field, "원문 revision 문자열이 필요합니다.");
}

function aliasEntry(value: unknown, index: number): void {
  const field = `aliases[${index}]`;
  if (!isRecord(value)) fail(field, "객체가 필요합니다.");
  const required = ["alias", "normalized", "addedAt", "addedBy"];
  assertKeys(value, required, required, field);
  const alias = safeText(value.alias, PATTERN_LIMITS.shortText, `${field}.alias`);
  const normalized = safeText(value.normalized, PATTERN_LIMITS.shortText, `${field}.normalized`);
  if (normalizePatternName(alias) !== normalized) fail(`${field}.normalized`, "alias의 정규화 결과와 일치해야 합니다.");
  date(value.addedAt, `${field}.addedAt`);
  identifier(value.addedBy, `${field}.addedBy`);
}

function articleLink(value: unknown, index: number): void {
  const field = `articleLinks[${index}]`;
  if (!isRecord(value)) fail(field, "객체가 필요합니다.");
  const required = ["linkId", "contentId", "postId", "articleRevision", "role", "linkStatus", "evidenceRefs", "linkedAt", "linkedBy"];
  assertKeys(value, required, required, field);
  identifier(value.linkId, `${field}.linkId`);
  identifier(value.contentId, `${field}.contentId`);
  if (!Number.isSafeInteger(value.postId) || Number(value.postId) < 1) fail(`${field}.postId`, "양의 정수가 필요합니다.");
  revision(value.articleRevision, `${field}.articleRevision`);
  enumValue(value.role, PATTERN_LINK_ROLES, `${field}.role`);
  enumValue(value.linkStatus, PATTERN_LINK_STATUSES, `${field}.linkStatus`);
  refList(value.evidenceRefs, `${field}.evidenceRefs`, PATTERN_LIMITS.evidence);
  date(value.linkedAt, `${field}.linkedAt`);
  identifier(value.linkedBy, `${field}.linkedBy`);
}

function evidenceEntry(value: unknown, index: number, counter = false): void {
  const prefix = counter ? "counterEvidence" : "evidence";
  const field = `${prefix}[${index}]`;
  if (!isRecord(value)) fail(field, "객체가 필요합니다.");
  const required = counter
    ? ["counterEvidenceId", "sourceType", "sourceRef", "observedAt", "claimStatus", "supports", "limitations", "visibility"]
    : ["evidenceId", "sourceType", "sourceRef", "articleSpan", "articleRevision", "observedAt", "claimStatus", "evidenceLevel", "supports", "limitations", "visibility"];
  assertKeys(value, required, required, field);
  identifier(counter ? value.counterEvidenceId : value.evidenceId, `${field}.${counter ? "counterEvidenceId" : "evidenceId"}`);
  safeText(value.sourceType, 120, `${field}.sourceType`);
  sourceRef(value.sourceRef, `${field}.sourceRef`);
  if (!counter) {
    safeText(value.articleSpan, PATTERN_LIMITS.text, `${field}.articleSpan`);
    revision(value.articleRevision, `${field}.articleRevision`, true);
    enumValue(value.evidenceLevel, PATTERN_EVIDENCE_LEVELS, `${field}.evidenceLevel`);
  }
  date(value.observedAt, `${field}.observedAt`);
  enumValue(value.claimStatus, PATTERN_CLAIM_STATUSES, `${field}.claimStatus`);
  safeText(value.supports, PATTERN_LIMITS.text, `${field}.supports`);
  textList(value.limitations, `${field}.limitations`, PATTERN_LIMITS.limitations);
  enumValue(value.visibility, PATTERN_EVIDENCE_VISIBILITIES, `${field}.visibility`);
}

function reviewEntry(value: unknown, index: number): void {
  const field = `reviews[${index}]`;
  if (!isRecord(value)) fail(field, "객체가 필요합니다.");
  const required = ["reviewId", "decision", "reviewerType", "reviewerId", "reviewedAt", "memo", "inputRevision"];
  assertKeys(value, required, required, field);
  identifier(value.reviewId, `${field}.reviewId`);
  enumValue(value.decision, PATTERN_REVIEW_DECISIONS, `${field}.decision`);
  enumValue(value.reviewerType, PATTERN_REVIEWER_TYPES, `${field}.reviewerType`);
  identifier(value.reviewerId, `${field}.reviewerId`);
  date(value.reviewedAt, `${field}.reviewedAt`);
  safeText(value.memo, PATTERN_LIMITS.text, `${field}.memo`, true);
  if (typeof value.inputRevision !== "string" || !/^[a-f0-9]{64}$/.test(value.inputRevision)) {
    fail(`${field}.inputRevision`, "64자리 revision hash가 필요합니다.");
  }
}

function activePromotionCheck(pattern: Record<string, unknown>, evidence: Record<string, unknown>[], reviews: Record<string, unknown>[]): void {
  if (pattern.maturity !== "active") return;
  if (pattern.scopeStatus !== "general" || pattern.healthStatus !== "current") {
    fail("maturity", "active는 general/current Pattern에만 사용할 수 있습니다.");
  }
  if (!pattern.owner || !pattern.lastReviewed || !pattern.reviewDueAt) {
    fail("maturity", "active에는 owner·lastReviewed·reviewDueAt가 필요합니다.");
  }
  const due = new Date(String(pattern.reviewDueAt));
  if (Number.isNaN(due.getTime()) || due.getTime() < Date.now()) fail("reviewDueAt", "기한이 지난 Pattern은 active가 될 수 없습니다.");
  const approvedReview = reviews.find((review) => review.decision === "active" && review.reviewerType === "human");
  if (!approvedReview) fail("reviews", "active에는 사람 reviewer의 active 판정이 필요합니다.");
  const distinctSources = new Set(evidence.map((item) => String(item.sourceRef))).size;
  const quantitative = evidence.some((item) => item.evidenceLevel === "quantitative");
  if (!(quantitative || distinctSources >= 2)) {
    fail("evidence", "active는 독립 출처 2개 이상 또는 재현 가능한 quantitative Evidence가 필요합니다.");
  }
  if (evidence.some((item) => !Array.isArray(item.limitations) || item.limitations.length === 0)) fail("evidence", "active Evidence에는 한계가 필요합니다.");
  if (!evidence.some((item) => item.visibility === "public")) fail("evidence", "active에는 공개 가능한 Evidence가 최소 1개 필요합니다.");
}

export type IntelligencePatternValidation =
  | { ok: true; pattern: IntelligencePattern }
  | { ok: false; reasonCode: "intelligence_pattern_invalid"; issues: string[] };

export function validateIntelligencePattern(value: unknown): IntelligencePatternValidation {
  try {
    if (!isRecord(value)) fail("pattern", "객체가 필요합니다.");
    const required = [
      "contractType", "schemaVersion", "policyVersion", "namespace", "patternId", "canonicalName", "normalizedName",
      "definition", "conditions", "mechanism", "expectedOutcome", "limitations", "owner", "maturity", "scopeStatus",
      "scopeContext", "healthStatus", "firstObserved", "lastObserved", "lastReviewed", "reviewDueAt", "aliases",
      "articleLinks", "evidence", "counterEvidence", "reviews",
    ];
    assertKeys(value, required, required, "pattern");
    if (value.contractType !== INTELLIGENCE_PATTERN_CONTRACT_TYPE) fail("contractType", "지원하지 않는 contractType입니다.");
    if (value.schemaVersion !== INTELLIGENCE_PATTERN_SCHEMA_VERSION) fail("schemaVersion", "지원하지 않는 schemaVersion입니다.");
    if (value.policyVersion !== INTELLIGENCE_PATTERN_POLICY_VERSION) fail("policyVersion", "지원하는 policyVersion이 아닙니다.");
    if (value.namespace !== INTELLIGENCE_PATTERN_NAMESPACE) fail("namespace", "intelligencePattern namespace가 필요합니다.");
    const patternId = identifier(value.patternId, "patternId");
    if (!patternId.startsWith(INTELLIGENCE_PATTERN_ID_PREFIX)) fail("patternId", "intelligencePattern 전용 ID가 필요합니다.");
    const canonicalName = safeText(value.canonicalName, PATTERN_LIMITS.shortText, "canonicalName");
    const normalizedName = safeText(value.normalizedName, PATTERN_LIMITS.shortText, "normalizedName");
    if (normalizePatternName(canonicalName) !== normalizedName) fail("normalizedName", "canonicalName의 정규화 결과와 일치해야 합니다.");
    safeText(value.definition, PATTERN_LIMITS.text, "definition");
    textList(value.conditions, "conditions", PATTERN_LIMITS.conditions);
    safeText(value.mechanism, PATTERN_LIMITS.text, "mechanism");
    safeText(value.expectedOutcome, PATTERN_LIMITS.text, "expectedOutcome");
    textList(value.limitations, "limitations", PATTERN_LIMITS.limitations);
    identifier(value.owner, "owner");
    enumValue(value.maturity, PATTERN_MATURITIES, "maturity");
    enumValue(value.scopeStatus, PATTERN_SCOPE_STATUSES, "scopeStatus");
    textList(value.scopeContext, "scopeContext", PATTERN_LIMITS.scopeContext, PATTERN_LIMITS.shortText);
    enumValue(value.healthStatus, PATTERN_HEALTH_STATUSES, "healthStatus");
    date(value.firstObserved, "firstObserved");
    date(value.lastObserved, "lastObserved");
    date(value.lastReviewed, "lastReviewed", true);
    date(value.reviewDueAt, "reviewDueAt", true);

    if (!Array.isArray(value.aliases) || value.aliases.length > PATTERN_LIMITS.aliases) fail("aliases", `${PATTERN_LIMITS.aliases}개 이하여야 합니다.`);
    const aliases = new Set<string>();
    value.aliases.forEach((alias, index) => {
      aliasEntry(alias, index);
      const normalized = String((alias as Record<string, unknown>).normalized);
      if (normalized === normalizedName || aliases.has(normalized)) fail("aliases", "canonical name 또는 다른 alias와 중복됩니다.");
      aliases.add(normalized);
    });

    if (!Array.isArray(value.articleLinks) || value.articleLinks.length > PATTERN_LIMITS.articleLinks) fail("articleLinks", `${PATTERN_LIMITS.articleLinks}개 이하여야 합니다.`);
    const linkIds = new Set<string>();
    value.articleLinks.forEach((link, index) => {
      articleLink(link, index);
      const linkId = String((link as Record<string, unknown>).linkId);
      if (linkIds.has(linkId)) fail("articleLinks", "linkId가 중복됩니다.");
      linkIds.add(linkId);
    });

    if (!Array.isArray(value.evidence) || value.evidence.length > PATTERN_LIMITS.evidence) fail("evidence", `${PATTERN_LIMITS.evidence}개 이하여야 합니다.`);
    const evidenceIds = new Set<string>();
    value.evidence.forEach((entry, index) => {
      evidenceEntry(entry, index);
      const id = String((entry as Record<string, unknown>).evidenceId);
      if (evidenceIds.has(id)) fail("evidence", "evidenceId가 중복됩니다.");
      evidenceIds.add(id);
    });

    if (!Array.isArray(value.counterEvidence) || value.counterEvidence.length > PATTERN_LIMITS.counterEvidence) fail("counterEvidence", `${PATTERN_LIMITS.counterEvidence}개 이하여야 합니다.`);
    const counterIds = new Set<string>();
    value.counterEvidence.forEach((entry, index) => {
      evidenceEntry(entry, index, true);
      const id = String((entry as Record<string, unknown>).counterEvidenceId);
      if (counterIds.has(id)) fail("counterEvidence", "counterEvidenceId가 중복됩니다.");
      counterIds.add(id);
    });

    if (!Array.isArray(value.reviews) || value.reviews.length > PATTERN_LIMITS.reviews) fail("reviews", `${PATTERN_LIMITS.reviews}개 이하여야 합니다.`);
    const reviewIds = new Set<string>();
    value.reviews.forEach((review, index) => {
      reviewEntry(review, index);
      const id = String((review as Record<string, unknown>).reviewId);
      if (reviewIds.has(id)) fail("reviews", "reviewId가 중복됩니다.");
      reviewIds.add(id);
    });

    activePromotionCheck(value, value.evidence as Record<string, unknown>[], value.reviews as Record<string, unknown>[]);
    return { ok: true, pattern: value as unknown as IntelligencePattern };
  } catch (error) {
    const message = error instanceof MagazineKnowledgeContractError ? error.message : "Pattern Registry 계약 검증에 실패했습니다.";
    return { ok: false, reasonCode: "intelligence_pattern_invalid", issues: [message] };
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function intelligencePatternRevision(pattern: IntelligencePattern): string {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(pattern))).digest("hex");
}
