import "server-only";

import { magazineKnowledgeContentId, magazineKnowledgeUnitId } from "./magazineKnowledgeContract";

/**
 * @docHint
 * @purpose Magazine Semantic Index embedding 저장 계약 — provider 중립 (MIR-202)
 * @process vector 저장·provenance(provider/modelRole/dimension/modelVersion)·textDigest·dedup 키를 계약화
 * @domain magazine-semantic-index
 * @scope server-contract
 */

/**
 * 실행 방식은 운영 MongoDB 실측으로 확정했다. 로컬·운영 모두 자체 호스팅 MongoDB 8.0(replica set)이며
 * Atlas 전용 `$vectorSearch`를 쓸 수 없다(embeddingStorageContract.openInMir202).
 * 따라가 기본 실행 방식은 **후보 축소 + 애플리케이션 레벨 코사인 재순위**(app_level_cosine)다.
 * Atlas가 되면 이 상수를 provider/저장소 교체 없이 서버 판정 모드로 바꾼다.
 */
export const MAGAZINE_EMBEDDING_EXECUTION_MODE = "app_level_cosine" as const;

export const MAGAZINE_EMBEDDING_CONTRACT_TYPE = "magazine-embedding" as const;
export const MAGAZINE_EMBEDDING_SCHEMA_VERSION = "magazine-embedding.v1" as const;
export const MAGAZINE_EMBEDDING_POLICY_VERSION = "intelligence-pattern-policy-v1.1" as const;

/** 임베딩 대상 — 원문 §12의 2단 임베딩(기사 + Knowledge Unit) + Gen Studio 템플릿(MIR-210) */
export const MAGAZINE_EMBEDDING_DOCUMENT_KINDS = ["article", "unit", "template"] as const;
export type MagazineEmbeddingDocumentKind = (typeof MAGAZINE_EMBEDDING_DOCUMENT_KINDS)[number];

/** 기본 namespace. 검색·서비스별로 분리하고 싶으면 별도 값으로 저장할 수 있다. */
export const MAGAZINE_EMBEDDING_DEFAULT_NAMESPACE = "magazine" as const;
export const MAGAZINE_EMBEDDING_NAMESPACES = ["magazine"] as const;

/** Gen Studio 템플릿 임베딩 namespace — Magazine Knowledge와 같은 저장소, 다른 namespace(MIR-210). */
export const MAGAZINE_EMBEDDING_TEMPLATE_NAMESPACE = "gen-studio" as const;

/**
 * 벡터를 만든 provider. 플랫폼 실제 provider 집합과 맞춰 둔다(provider 중립이 특정 provider를 고정하지 않음).
 * 모델명은 `modelVersion`(자유 문자열)로, provider와 분리해 저장해 교체 가능성을 남긴다.
 */
export const MAGAZINE_EMBEDDING_PROVIDERS = ["openai", "google", "claude", "deepseek", "xai", "zai"] as const;
export type MagazineEmbeddingProvider = (typeof MAGAZINE_EMBEDDING_PROVIDERS)[number];

export const MAGAZINE_EMBEDDING_LIMITS = {
  textDigestLength: 64,
  modelVersionLength: 120,
  modelRoleLength: 80,
  namespaceLength: 64,
  documentRefLength: 200,
  dimensionMax: 8192,
  vectorValueMax: 12,
  vectorLength: 4096,
  queryStringLength: 4000,
  filterValues: 32,
  filterValueLength: 80,
  minScoreDefault: 0,
  topKDefault: 20,
  topKMax: 100,
} as const;

/** textDigest 표준 — sha256 hex(64자) */
export const MAGAZINE_EMBEDDING_DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export interface MagazineEmbeddingProvenance {
  provider: MagazineEmbeddingProvider;
  /** 모델이 이 임베딩에서 맡은 역할(provenance). 라우팅 계약이 아니다. */
  modelRole: string;
  modelVersion: string;
  dimension: number;
}

/**
 * 저장 계약 — 기사 또는 Knowledge Unit 임베딩 1건.
 * 원문 텍스트는 저장하지 않는다(digest만). 벡터와 provenance·dedup 키로만 구성한다.
 */
export interface MagazineEmbedding {
  contractType: typeof MAGAZINE_EMBEDDING_CONTRACT_TYPE;
  schemaVersion: typeof MAGAZINE_EMBEDDING_SCHEMA_VERSION;
  policyVersion: typeof MAGAZINE_EMBEDDING_POLICY_VERSION;
  /** contentId(article) 또는 unitId(unit) */
  documentRef: string;
  documentKind: MagazineEmbeddingDocumentKind;
  namespace: string;
  /** 원문(구조화 지문)의 sha256 hex — 같은 지문·같은 모델에 중복 임베딩을 만들지 않는다 */
  textDigest: string;
  provenance: MagazineEmbeddingProvenance;
  /** 정규화(coverage 0~로 저장) 또는 원시 벡터. length === provenance.dimension */
  vector: number[];
  indexedAt: string;
  /** 재색인·낡은 임베딩이면 값이 있다. 검색에서 제외한다 */
  staleAt: string | null;
}

/** 검색 쿼리 계약 — 서비스가 queryText 또는 queryVector 중 하나 이상을 준다. */
export interface MagazineEmbeddingQuery {
  text: string;
  /** 텍스트 쿼리를 임베딩한 벡터. 없으면 키워드 leg만 으로 순위를 얻게 된다(±생략 가능). */
  vector?: number[];
  topK: number;
  minScore: number;
  /** 메타 필터 — 중앙 Knowledge 공개 자격(|)은 service가 isPublicOnly로 강제한다 */
  filter?: MagazineEmbeddingFilter;
  isPublicOnly?: boolean;
}

export interface MagazineEmbeddingFilter {
  namespace?: string;
  documentKind?: MagazineEmbeddingDocumentKind;
  /** 검색 메타(주제·엔티티·의도)로 후보를 좁힌다 */
  topics?: string[];
  entities?: string[];
  intent?: string;
  /** sourceRevision 기반 낡은 항목 제외 여부 */
  excludeStale?: boolean;
}

/**
 * 하이브리드 검색의 개별 후보 — 임베딩 + 소스 메타스냅숏.
 * 공개 자격(eligibility·review·stale)은 서비스 별도 필터이며, 여기서는 후보를 싣는다.
 */
export interface MagazineEmbeddingCandidate {
  embedding: MagazineEmbedding;
  /** 인덱스 시점의 소스 메타 스냅숏 — G-MIR-08: 회원 개인화·행동 데이터는 담지 않는다 */
  sourceMeta: {
    topics: string[];
    entities: string[];
    intent: string;
    /** 소스 기사 revision이 낡았는지를 판정할 수 있는 값 */
    sourceRevision: string;
    eligible: boolean;
  };
}

/** documentRef를 documentKind에 따라 만든다 — 중앙 Knowledge 식별 규칙과 동일. */
export function magazineEmbeddingDocumentRef(kind: MagazineEmbeddingDocumentKind, postId: number, localId?: string): string {
  if (kind === "article") return magazineKnowledgeContentId(postId);
  if (typeof localId !== "string" || !localId.trim()) throw new Error("unit embedding에는 localId가 필요합니다.");
  return magazineKnowledgeUnitId(postId, localId.trim());
}
