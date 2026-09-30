import "server-only";

import crypto from "crypto";

import {
  KNOWLEDGE_ARTICLE_CONTRACT_TYPE,
  KNOWLEDGE_ARTICLE_SCHEMA_VERSION,
  KNOWLEDGE_LIMITS,
  KNOWLEDGE_POLICY_VERSION,
  KNOWLEDGE_UNIT_CONTRACT_TYPE,
  KNOWLEDGE_UNIT_SCHEMA_VERSION,
  magazineKnowledgeContentId,
  magazineKnowledgeUnitId,
  type KnowledgeCandidateItem,
  type KnowledgeEvidenceRef,
  type MagazineKnowledgeArticle,
  type MagazineKnowledgeUnit,
} from "./magazineKnowledgeContract";
import {
  validateMagazineKnowledgeArticle,
  validateMagazineKnowledgeUnit,
} from "./magazineKnowledgeValidate";
import { isRecord } from "./magazineKnowledgeSafety";

/**
 * @docHint
 * @purpose 원고 메타(magazine_knowledge_article.md §28) → Knowledge 저장 계약 변환 어댑터 — MIR-204
 * @process writer 필드 수신 -> candidateItems·evidenceRefs 파생 -> eligibility normalize -> 계약 검증
 * @domain magazine-knowledge-corpus
 * @scope server-contract
 */

/**
 * 이 계층은 **집필·리뉴얼·처분 판정을 하지 않는다**(G-MIR-01).
 * 로컬 에이전트가 만든 원고 메타를 저장 계약 형태로 옮기고, 근거 유무로 eligibility만 normalize한다.
 */

export interface MagazineKnowledgeSourceInput {
  postId: number;
  slug: string;
  canonicalUrl: string;
}

export type MagazineKnowledgeIngestResult =
  | { ok: true; article: MagazineKnowledgeArticle; units: MagazineKnowledgeUnit[] }
  | { ok: false; reasonCode: "knowledge_ingest_invalid"; issues: string[] };

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** unitId는 순서가 아니라 statement에서 파생한다 — 원고에서 순서가 바뀌어도 같은 지식이면 같은 문서로 간다. */
function unitLocalId(statement: string, used: Set<string>): string {
  const digest = crypto.createHash("sha256").update(statement.trim()).digest("hex").slice(0, 12);
  let localId = `u${digest}`;
  let suffix = 2;
  while (used.has(localId)) {
    localId = `u${digest}-${suffix}`;
    suffix += 1;
  }
  used.add(localId);
  return localId;
}

function evidenceOf(unit: Record<string, unknown>): KnowledgeEvidenceRef[] {
  const raw = unit.evidenceRefs;
  return Array.isArray(raw) ? raw.filter(isRecord).map((item) => item as unknown as KnowledgeEvidenceRef) : [];
}

/**
 * candidateItems는 knowledgeUnits에서 파생한다. 원고 메타에 같은 내용을 두 번 적지 않기 위해서다
 * (`magazine_knowledge_article.md` §28, `INTELLIGENCE-PATTERN-POLICY.md` §8.1).
 */
function deriveCandidates(units: Record<string, unknown>[]): KnowledgeCandidateItem[] {
  return units.slice(0, KNOWLEDGE_LIMITS.candidateItems).map((unit, index) => {
    const sourceRefs = [...new Set(evidenceOf(unit).map((item) => item.sourceRef))].slice(0, KNOWLEDGE_LIMITS.candidateSourceRefs);
    return {
      id: `candidate-${String(index + 1).padStart(2, "0")}`,
      intelligenceType: unit.unitType as KnowledgeCandidateItem["intelligenceType"],
      statement: String(unit.statement ?? ""),
      articleSpan: String(unit.articleSpan ?? ""),
      sourceRefs,
      limitations: textArray(unit.limitations),
    };
  });
}

/** 기사 레벨 Evidence는 unit Evidence의 합집합이다. 같은 출처를 여러 unit이 인용하면 한 번만 남는다. */
function deriveEvidence(units: Record<string, unknown>[]): KnowledgeEvidenceRef[] {
  const seen = new Set<string>();
  const merged: KnowledgeEvidenceRef[] = [];
  for (const unit of units) {
    for (const evidence of evidenceOf(unit)) {
      const id = String(evidence.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(evidence);
    }
  }
  return merged.slice(0, KNOWLEDGE_LIMITS.evidenceRefs);
}

/**
 * eligibility는 근거 유무로만 정한다. `qualified`는 사람 검토로만 올라간다
 * (`INTELLIGENCE-PATTERN-POLICY.md` §3.1·§8.1).
 */
export function normalizeKnowledgeEligibility(args: {
  externalEvidenceLevel: string;
  evidenceCount: number;
}): { eligibility: "none" | "candidate"; extractionStatus: "not_started" | "extracted" } {
  if (args.externalEvidenceLevel === "unsupported" || args.evidenceCount === 0) {
    return { eligibility: "none", extractionStatus: "not_started" };
  }
  return { eligibility: "candidate", extractionStatus: "extracted" };
}

/**
 * 원고 메타를 기사·Knowledge Unit 계약으로 변환한다.
 * 판정 필드는 writer가 보내지 않으므로 여기서 채우고, 최종 판단은 계약 validator가 fail-closed로 한다.
 */
export function buildKnowledgeRecordsFromArticleMetadata(input: {
  metadata: unknown;
  source: MagazineKnowledgeSourceInput;
  sourceRevision: string;
}): MagazineKnowledgeIngestResult {
  const issues: string[] = [];
  if (!isRecord(input.metadata)) return { ok: false, reasonCode: "knowledge_ingest_invalid", issues: ["원고 메타 객체가 필요합니다."] };
  const meta = input.metadata;

  // 판정 필드를 원고 메타에 담아 보내는 것은 계약 위반이다 — 조용히 무시하지 않고 거부한다.
  const declaredIntelligence = isRecord(meta.intelligence) ? meta.intelligence : {};
  const forbidden = [
    "eligibility", "extractionStatus", "reviewStatus", "reviewedAt", "reviewedBy", "reviewMemo",
    "primaryPatternRefs", "secondaryPatternRefs", "amuProofRefs", "candidateItems", "evidenceRefs",
  ].filter((key) => Object.prototype.hasOwnProperty.call(declaredIntelligence, key));
  if (forbidden.length) {
    issues.push(`intelligence의 판정·파생 필드는 원고 메타에 넣지 않습니다: ${forbidden.join(", ")}`);
  }

  const rawUnits = Array.isArray(meta.knowledgeUnits) ? meta.knowledgeUnits.filter(isRecord) : [];
  const evidence = deriveEvidence(rawUnits);
  const externalEvidenceLevel = String(declaredIntelligence.externalEvidenceLevel ?? "unsupported");
  const normalized = normalizeKnowledgeEligibility({ externalEvidenceLevel, evidenceCount: evidence.length });
  const hasIntelligence = normalized.eligibility !== "none";

  const article = {
    contractType: KNOWLEDGE_ARTICLE_CONTRACT_TYPE,
    schemaVersion: KNOWLEDGE_ARTICLE_SCHEMA_VERSION,
    policyVersion: KNOWLEDGE_POLICY_VERSION,
    contentId: magazineKnowledgeContentId(input.source.postId),
    source: {
      system: "wordpress" as const,
      postId: input.source.postId,
      slug: input.source.slug,
      canonicalUrl: input.source.canonicalUrl,
    },
    sourceRevision: input.sourceRevision,
    primaryQuestion: meta.primaryQuestion,
    thesis: meta.thesis,
    contentRole: meta.contentRole,
    intelligenceRole: meta.intelligenceRole,
    evergreenPrinciple: meta.evergreenPrinciple ?? null,
    temporalClaims: Array.isArray(meta.temporalClaims) ? meta.temporalClaims : [],
    conditions: textArray(meta.conditions),
    limitations: textArray(meta.limitations),
    counterExamples: textArray(meta.counterExamples),
    entities: textArray(meta.entities),
    topics: textArray(meta.topics),
    intent: meta.intent,
    audience: meta.audience,
    intelligence: {
      eligibility: normalized.eligibility,
      extractionStatus: normalized.extractionStatus,
      reviewStatus: "unreviewed" as const,
      primaryPatternRefs: [],
      secondaryPatternRefs: [],
      candidateItems: hasIntelligence ? deriveCandidates(rawUnits) : [],
      evidenceRefs: hasIntelligence ? evidence : [],
      externalEvidenceLevel,
      claimStatus: declaredIntelligence.claimStatus,
      applicability: textArray(declaredIntelligence.applicability),
      revenueStages: Array.isArray(declaredIntelligence.revenueStages) ? declaredIntelligence.revenueStages : [],
      amuProofRefs: [],
      reviewedAt: null,
      reviewedBy: null,
      reviewMemo: "",
    },
  };

  const parsedArticle = validateMagazineKnowledgeArticle(article);
  if (!parsedArticle.ok) issues.push(...parsedArticle.issues);

  const contentId = magazineKnowledgeContentId(input.source.postId);
  const used = new Set<string>();
  const units: MagazineKnowledgeUnit[] = [];
  rawUnits.forEach((raw, index) => {
    const candidate = {
      contractType: KNOWLEDGE_UNIT_CONTRACT_TYPE,
      schemaVersion: KNOWLEDGE_UNIT_SCHEMA_VERSION,
      policyVersion: KNOWLEDGE_POLICY_VERSION,
      unitId: magazineKnowledgeUnitId(input.source.postId, unitLocalId(String(raw.statement ?? index), used)),
      articleRef: { contentId, postId: input.source.postId },
      sourceRevision: input.sourceRevision,
      unitType: raw.unitType,
      statement: raw.statement,
      articleSpan: raw.articleSpan,
      mechanism: raw.mechanism,
      conditions: textArray(raw.conditions),
      limitations: textArray(raw.limitations),
      evidenceRefs: evidenceOf(raw),
    };
    const parsedUnit = validateMagazineKnowledgeUnit(candidate);
    if (parsedUnit.ok) units.push(parsedUnit.unit);
    else issues.push(`knowledgeUnits[${index}]: ${parsedUnit.issues.join(" / ")}`);
  });

  if (issues.length || !parsedArticle.ok) return { ok: false, reasonCode: "knowledge_ingest_invalid", issues };
  return { ok: true, article: parsedArticle.article, units };
}

export const KNOWLEDGE_INTELLIGENCE_UPDATABLE_FIELDS = [
  "eligibility",
  "extractionStatus",
  "reviewStatus",
  "reviewedAt",
  "reviewedBy",
  "reviewMemo",
  "primaryPatternRefs",
  "secondaryPatternRefs",
  "amuProofRefs",
] as const;

/**
 * 사람 검토(`reviewStatus`·`reviewedAt`·`reviewedBy`·`reviewMemo`)와 Registry 연결
 * (`primaryPatternRefs`·`secondaryPatternRefs`·`amuProofRefs`)은 INTELLIGENCE-PATTERN-POLICY.md §8.1이
 * **사람의 결정**으로 못 박은 항목이다. agent 키는 추출 상태와 자격 하향만 쓸 수 있다.
 * (agent 세션이 스스로 approve 하면 공개 projection 게이트가 사람 검토 없이 열린다 — MIR-203 독립 리뷰 P0-1)
 */
export const KNOWLEDGE_INTELLIGENCE_AGENT_UPDATABLE_FIELDS = ["eligibility", "extractionStatus"] as const;

/** 판정 갱신 주체. 저장소의 `source`와 같은 값 집합이며 여기서는 권한 경계로만 쓴다. */
export type KnowledgeIntelligenceActorKind = "admin" | "agent";

/** 자격 등급의 강도 — agent는 낮추기만 할 수 있고 올리는 판정은 사람이 한다. */
const KNOWLEDGE_ELIGIBILITY_RANK: Record<string, number> = { none: 0, candidate: 1, qualified: 2 };

export type MagazineKnowledgeIntelligencePatch = Partial<Record<(typeof KNOWLEDGE_INTELLIGENCE_UPDATABLE_FIELDS)[number], unknown>>;

/**
 * 판정 필드만 갱신한 기사 계약을 만든다. writer가 제출한 근거·파생 항목은 덮어쓰지 않는다.
 * 결과는 호출부가 다시 validate 하므로 여기서 교차 규칙을 재구현하지 않는다.
 */
export function applyKnowledgeIntelligencePatch(
  article: MagazineKnowledgeArticle,
  patch: unknown,
  options: { actorKind?: KnowledgeIntelligenceActorKind } = {},
): MagazineKnowledgeIngestResult {
  if (!isRecord(patch)) return { ok: false, reasonCode: "knowledge_ingest_invalid", issues: ["patch 객체가 필요합니다."] };
  const actorKind = options.actorKind ?? "admin";
  const allowed = new Set<string>(
    actorKind === "agent" ? KNOWLEDGE_INTELLIGENCE_AGENT_UPDATABLE_FIELDS : KNOWLEDGE_INTELLIGENCE_UPDATABLE_FIELDS,
  );
  const unknownKeys = Object.keys(patch).filter((key) => !allowed.has(key));
  if (unknownKeys.length) {
    const reason = actorKind === "agent"
      ? `agent 경로가 갱신할 수 없는 판정 필드입니다(사람 검토 전용): ${unknownKeys.join(", ")}`
      : `갱신할 수 없는 필드입니다: ${unknownKeys.join(", ")}`;
    return { ok: false, reasonCode: "knowledge_ingest_invalid", issues: [reason] };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, reasonCode: "knowledge_ingest_invalid", issues: ["갱신할 필드가 없습니다."] };
  }
  if (actorKind === "agent" && typeof patch.eligibility === "string") {
    const nextRank = KNOWLEDGE_ELIGIBILITY_RANK[patch.eligibility];
    const currentRank = KNOWLEDGE_ELIGIBILITY_RANK[article.intelligence.eligibility];
    if (nextRank === undefined || currentRank === undefined || nextRank > currentRank) {
      return {
        ok: false,
        reasonCode: "knowledge_ingest_invalid",
        issues: ["agent 경로는 eligibility를 올릴 수 없습니다. 승격은 사람 검토가 판정합니다."],
      };
    }
  }

  const next = {
    ...article,
    intelligence: { ...article.intelligence, ...patch },
  };
  const parsed = validateMagazineKnowledgeArticle(next);
  if (!parsed.ok) return { ok: false, reasonCode: "knowledge_ingest_invalid", issues: parsed.issues };
  return { ok: true, article: parsed.article, units: [] };
}
