import "server-only";

import crypto from "crypto";

import {
  MAGAZINE_EMBEDDING_CONTRACT_TYPE,
  MAGAZINE_EMBEDDING_POLICY_VERSION,
  MAGAZINE_EMBEDDING_SCHEMA_VERSION,
  MAGAZINE_EMBEDDING_TEMPLATE_NAMESPACE,
  type MagazineEmbedding,
} from "./magazineEmbeddingContract";
import {
  MAGAZINE_EMBEDDING_DEFAULT_WEIGHT,
  blendMagazineScore,
  safeCosineSimilarity,
  termOverlapScore,
  tokenizeMagazineText,
  type MagazineEmbeddingWeight,
} from "./magazineEmbeddingMath";
import {
  genStudioTemplateDocumentRef,
  type GenStudioTemplateIndex,
} from "./magazineTemplateContract";

/**
 * @docHint
 * @purpose Gen Studio 템플릿 연관 검색 — MIR-202 retrieval 계층 공유 위 확장 (MIR-210)
 * @process 템플릿 인덱스 -> 임베딩 저장 계약 -> 하이브리드 스코어/순위 -> 관련 추천 -> 양방향 연결
 * @domain magazine-semantic-index
 * @scope server-contract
 *
 * 별도 검색 시스템을 만들지 않는다. 벡터 수학(코사인·토큰·블렌드)은 magazineEmbeddingMath를,
 * 저장은 magazine_embeddings(documentKind="template", namespace="gen-studio")를 그대로 쓴다.
 */

export interface GenStudioTemplateCandidate {
  embedding: MagazineEmbedding;
  index: GenStudioTemplateIndex;
}

export interface GenStudioTemplateProvenance {
  provider: MagazineEmbedding["provenance"]["provider"];
  modelRole: string;
  modelVersion: string;
}

function templateTerms(index: GenStudioTemplateIndex): string[] {
  return [
    index.title,
    index.summary,
    ...index.useCases,
    ...index.industries,
    ...index.audiences,
    ...index.styles,
    ...index.topics,
    ...index.intents,
    ...index.expectedOutputs,
  ];
}

/** 템플릿 인덱스의 구조화 지문 — 같은 메타·같은 모델에 중복 임베딩을 만들지 않는다. */
export function genStudioTemplateTextDigest(index: GenStudioTemplateIndex): string {
  const payload = JSON.stringify({
    templateId: index.templateId,
    type: index.type,
    title: index.title,
    summary: index.summary,
    useCases: index.useCases,
    industries: index.industries,
    audiences: index.audiences,
    styles: index.styles,
    topics: index.topics,
    intents: index.intents,
    inputRequirements: index.inputRequirements,
    expectedOutputs: index.expectedOutputs,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/** 템플릿 인덱스를 매거진 임베딩 저장 계약으로 변환한다. 벡터는 호출자(provider 중립)가 넘긴다. */
export function buildGenStudioTemplateEmbedding(index: GenStudioTemplateIndex, args: { provenance: GenStudioTemplateProvenance; vector: number[]; indexedAt?: string }): MagazineEmbedding {
  return {
    contractType: MAGAZINE_EMBEDDING_CONTRACT_TYPE,
    schemaVersion: MAGAZINE_EMBEDDING_SCHEMA_VERSION,
    policyVersion: MAGAZINE_EMBEDDING_POLICY_VERSION,
    documentRef: genStudioTemplateDocumentRef(index.templateId),
    documentKind: "template",
    namespace: MAGAZINE_EMBEDDING_TEMPLATE_NAMESPACE,
    textDigest: genStudioTemplateTextDigest(index),
    provenance: {
      provider: args.provenance.provider,
      modelRole: args.provenance.modelRole,
      modelVersion: args.provenance.modelVersion,
      dimension: args.vector.length,
    },
    vector: args.vector,
    indexedAt: args.indexedAt ?? new Date().toISOString(),
    staleAt: null,
  };
}

export interface GenStudioTemplateQuery {
  text: string;
  vector?: number[];
  topK: number;
  minScore: number;
  filter?: {
    type?: GenStudioTemplateIndex["type"];
    useCase?: string;
    industry?: string;
    style?: string;
    intent?: string;
  };
}

export interface ScoredGenStudioTemplate {
  candidate: GenStudioTemplateCandidate;
  vectorScore: number;
  keywordScore: number;
  score: number;
}

/** 단일 후보 하이브리드 스코어 — 코사인 + 메타 용어 겹침 + 템플릿 전용 필터. */
export function scoreGenStudioTemplate(query: GenStudioTemplateQuery, candidate: GenStudioTemplateCandidate, weight: MagazineEmbeddingWeight = MAGAZINE_EMBEDDING_DEFAULT_WEIGHT): ScoredGenStudioTemplate | null {
  const index = candidate.index;
  const filter = query.filter;
  if (filter?.type && index.type !== filter.type) return null;
  if (filter?.useCase && !index.useCases.includes(filter.useCase)) return null;
  if (filter?.industry && !index.industries.includes(filter.industry)) return null;
  if (filter?.style && !index.styles.includes(filter.style)) return null;
  if (filter?.intent && !index.intents.includes(filter.intent)) return null;

  const vectorProvided = Array.isArray(query.vector) && query.vector.length > 0;
  const vectorScore = vectorProvided ? safeCosineSimilarity(query.vector as number[], candidate.embedding.vector) : 0;
  const keywordScore = termOverlapScore(tokenizeMagazineText(query.text), templateTerms(index));
  const score = blendMagazineScore(vectorScore, keywordScore, weight);
  if (score < query.minScore) return null;
  return { candidate, vectorScore, keywordScore, score };
}

/** 하이브리드 순위 — 템플릿 전용 필터 + 스코어 + topK. */
export function rankGenStudioTemplates(query: GenStudioTemplateQuery, candidates: GenStudioTemplateCandidate[], weight: MagazineEmbeddingWeight = MAGAZINE_EMBEDDING_DEFAULT_WEIGHT): ScoredGenStudioTemplate[] {
  const scored: ScoredGenStudioTemplate[] = [];
  for (const candidate of candidates) {
    if (candidate.embedding.documentKind !== "template") continue;
    const result = scoreGenStudioTemplate(query, candidate, weight);
    if (result) scored.push(result);
  }
  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, query.topK);
}

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 관련 템플릿 추천(원문 2부 §7) — 의미 유사도 + Use Case 유사도 + Output 유사도를 조합한다.
 * source 자신은 제외한다.
 */
export function recommendRelatedTemplates(source: GenStudioTemplateCandidate, candidates: GenStudioTemplateCandidate[], topK: number): ScoredGenStudioTemplate[] {
  const vectorScoreFor = (candidate: GenStudioTemplateCandidate) => safeCosineSimilarity(source.embedding.vector, candidate.embedding.vector);
  const useCase = (candidate: GenStudioTemplateCandidate) => jaccard(source.index.useCases, candidate.index.useCases);
  const output = (candidate: GenStudioTemplateCandidate) => jaccard(source.index.expectedOutputs, candidate.index.expectedOutputs);

  const ranked = candidates
    .filter((candidate) => candidate.embedding.documentRef !== source.embedding.documentRef)
    .map((candidate) => {
      const vectorScore = vectorScoreFor(candidate);
      const useCaseScore = useCase(candidate);
      const outputScore = output(candidate);
      // 관련성은 의미(0.5) + use case(0.3) + output(0.2) 블렌드 — 성과 랭킹은 P1(원문 2부 §12~14).
      const score = vectorScore * 0.5 + useCaseScore * 0.3 + outputScore * 0.2;
      return { candidate, vectorScore, keywordScore: 0, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
  return ranked;
}

/**
 * Template ↔ Knowledge Unit 양방향 연결(원문 2부 §8·§9).
 * 한쪽은 인덱스의 `relatedKnowledgeUnitIds`(템플릿 → unit)이고,
 * 반대 방향(unit → 템플릿)은 명시 연결 + 주제 겹침으로 점수를 낸다.
 */
export function findTemplatesRelatedToUnit(unit: { unitId: string; topics: string[] }, candidates: GenStudioTemplateCandidate[], topK: number): ScoredGenStudioTemplate[] {
  const ranked = candidates
    .map((candidate) => {
      const explicit = candidate.index.relatedKnowledgeUnitIds.includes(unit.unitId) ? 1 : 0;
      const topicOverlap = jaccard(unit.topics, [...candidate.index.topics, ...candidate.index.useCases]);
      const score = explicit === 1 ? 1 : topicOverlap;
      return { candidate, vectorScore: 0, keywordScore: topicOverlap, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
  return ranked;
}
