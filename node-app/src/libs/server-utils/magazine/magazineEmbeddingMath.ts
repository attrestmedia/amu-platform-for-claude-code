import "server-only";

import type { MagazineEmbeddingCandidate, MagazineEmbeddingQuery } from "./magazineEmbeddingContract";

/**
 * @docHint
 * @purpose Semantic Index 벡터 수학 + 하이브리드 순위 — 순수 함수(DB 비의존) (MIR-202)
 * @process 코사인 유사도·정규화 -> 메타 용어 키워드 스코어 -> 공개/낡음 게이트 -> 블렌드·정렬
 * @domain magazine-semantic-index
 * @scope server-contract
 */

export class MagazineEmbeddingMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MagazineEmbeddingMathError";
  }
}

function assertVector(vector: number[]): void {
  if (!Array.isArray(vector) || vector.length === 0) throw new MagazineEmbeddingMathError("빈 벡터입니다.");
  for (const value of vector) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new MagazineEmbeddingMathError("벡터에 비유한 수가 있습니다.");
  }
}

export function l2Norm(vector: number[]): number {
  assertVector(vector);
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function normalizeVector(vector: number[]): number[] {
  const norm = l2Norm(vector);
  if (norm === 0) throw new MagazineEmbeddingMathError("norm이 0인 벡터는 정규화할 수 없습니다.");
  return vector.map((value) => value / norm);
}

/** 코사인 유사도 — 벡터는 caller가 dimension으로 검증한다. 0벡터는 0을 반환한다. */
export function cosineSimilarity(a: number[], b: number[]): number {
  assertVector(a);
  assertVector(b);
  if (a.length !== b.length) throw new MagazineEmbeddingMathError("차원이 다른 벡터입니다.");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return Math.max(-1, Math.min(1, dot / denominator));
}

/** 견고한 코사인 — 형식 오류는 0으로 처리(순위 하락). strict 판정은 cosineSimilarity가 한다. */
export function safeCosineSimilarity(a: number[], b: number[]): number {
  try {
    return cosineSimilarity(a, b);
  } catch {
    return 0;
  }
}

/** 키워드 leg용 토큰화 — 유니코드 문자·숫자 연속을 소문자화. 한글/영문 모두 처리. */
export function tokenizeMagazineText(value: string): string[] {
  const matches = String(value || "").toLowerCase().match(/[\p{L}\p{N}]{1,64}/gu) ?? [];
  return matches;
}

/** 메타 용어(주제·엔티티·의도)와 쿼리 토큰의 겹침 점수 — 0~1. */
export function termOverlapScore(queryTokens: string[], terms: string[]): number {
  const docSet = new Set<string>();
  for (const term of terms) {
    for (const token of tokenizeMagazineText(term)) docSet.add(token);
  }
  if (queryTokens.length === 0 || docSet.size === 0) return 0;
  const hit = queryTokens.filter((token) => docSet.has(token)).length;
  return hit / queryTokens.length;
}

export interface MagazineEmbeddingWeight {
  vector: number;
  keyword: number;
}

export const MAGAZINE_EMBEDDING_DEFAULT_WEIGHT: MagazineEmbeddingWeight = Object.freeze({ vector: 0.6, keyword: 0.4 });

export function blendMagazineScore(vectorScore: number, keywordScore: number, weight: MagazineEmbeddingWeight = MAGAZINE_EMBEDDING_DEFAULT_WEIGHT): number {
  const total = weight.vector + weight.keyword;
  if (total <= 0) return 0;
  return (vectorScore * weight.vector + keywordScore * weight.keyword) / total;
}

export interface MagazineEmbeddingScoredCandidate {
  candidate: MagazineEmbeddingCandidate;
  vectorScore: number;
  keywordScore: number;
  score: number;
}

/** 개별 후보 점수 — 코사인 + 메타 키워드 + 공개/낡음 게이트. */
export function scoreMagazineEmbeddingCandidate(query: MagazineEmbeddingQuery, candidate: MagazineEmbeddingCandidate, weight: MagazineEmbeddingWeight = MAGAZINE_EMBEDDING_DEFAULT_WEIGHT): MagazineEmbeddingScoredCandidate | null {
  const embedding = candidate.embedding;

  // 낡음/공개 게이트 — 미승인·stale 항목은 검색 결과에 노출하지 않는다.
  const excludeStale = query.filter?.excludeStale !== false;
  if (excludeStale && (embedding.staleAt !== null || candidate.sourceMeta.sourceRevision.length === 0)) return null;
  if (query.isPublicOnly && !candidate.sourceMeta.eligible) return null;

  const queryTokens = tokenizeMagazineText(query.text);
  const vectorProvided = Array.isArray(query.vector) && query.vector.length > 0;
  const vectorScore = vectorProvided ? safeCosineSimilarity(query.vector as number[], embedding.vector) : 0;
  const terms = [...candidate.sourceMeta.topics, ...candidate.sourceMeta.entities];
  if (candidate.sourceMeta.intent.trim()) terms.push(candidate.sourceMeta.intent);
  const keywordScore = termOverlapScore(queryTokens, terms);

  const score = blendMagazineScore(vectorScore, keywordScore, weight);
  if (score < query.minScore) return null;
  return { candidate, vectorScore, keywordScore, score };
}

/** 하이브리드 순위 파이프라인 — 필터(메타)·게이트(공개/낡음)·minScore·topK. */
export function rankMagazineEmbeddingCandidates(query: MagazineEmbeddingQuery, candidates: MagazineEmbeddingCandidate[], weight: MagazineEmbeddingWeight = MAGAZINE_EMBEDDING_DEFAULT_WEIGHT): MagazineEmbeddingScoredCandidate[] {
  const filter = query.filter;
  const namespace = filter?.namespace?.trim();
  const documentKind = filter?.documentKind;
  const topics = filter?.topics ?? [];
  const entities = filter?.entities ?? [];
  const intent = filter?.intent?.trim();

  const scored: MagazineEmbeddingScoredCandidate[] = [];
  for (const candidate of candidates) {
    const embedding = candidate.embedding;
    if (namespace && embedding.namespace !== namespace) continue;
    if (documentKind && embedding.documentKind !== documentKind) continue;
    if (topics.length && !topics.some((topic) => candidate.sourceMeta.topics.includes(topic))) continue;
    if (entities.length && !entities.some((entity) => candidate.sourceMeta.entities.includes(entity))) continue;
    if (intent && !candidate.sourceMeta.intent.includes(intent)) continue;

    const result = scoreMagazineEmbeddingCandidate(query, candidate, weight);
    if (result) scored.push(result);
  }
  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, query.topK);
}
