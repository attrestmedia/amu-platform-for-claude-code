import "server-only";

/**
 * @docHint
 * @purpose Gen Studio 템플릿 연관 검색의 정규화된 템플릿 인덱스 계약 — MIR-210
 * @process 원문 2부 §4의 GenStudioTemplateIndex를 매거진 임베딩 저장 계약과 결합할 수 있게 계약화
 * @domain magazine-semantic-index
 * @scope server-contract
 */

/**
 * 템플릿은 Magazine Knowledge와 **같은 `magazine_embeddings` 저장소·같은 retrieval 계층을 공유**한다.
 * 별도 검색 시스템을 만들지 않는다(MIR-210 verification). namespace만 "gen-studio"로 분리한다.
 */
export const GEN_STUDIO_TEMPLATE_NAMESPACE = "gen-studio" as const;

export const GEN_STUDIO_TEMPLATE_INDEX_CONTRACT_TYPE = "gen-studio-template-index" as const;
export const GEN_STUDIO_TEMPLATE_INDEX_SCHEMA_VERSION = "gen-studio-template-index.v1" as const;

/** 현재 Gen Studio 카탈로그는 image·content 2종이다(video·prompt는 catalog에 없어 enum에서 제외). */
export const GEN_STUDIO_TEMPLATE_TYPES = ["image", "content"] as const;
export type GenStudioTemplateType = (typeof GEN_STUDIO_TEMPLATE_TYPES)[number];

export const GEN_STUDIO_TEMPLATE_LIMITS = {
  templateIdLength: 160,
  titleLength: 120,
  summaryLength: 400,
  listItems: 16,
  itemLength: 80,
  relatedKnowledgeUnitIds: 24,
  relatedPatternIds: 24,
} as const;

/**
 * 원문 2부 §4 — 템플릿을 Knowledge Object로 본다.
 * title·tag만 남기지 않고 사용 목적·의도·산업·독자·스타일·입출력을 정규화해 저장한다.
 *
 * `embedding` 벡터는 여기에 두지 않는다 — provider 중립으로 `magazine_embeddings`에
 * (documentRef, textDigest, modelVersion, namespace) dedup 키와 함께 저장한다(MIR-202).
 */
export interface GenStudioTemplateIndex {
  contractType: typeof GEN_STUDIO_TEMPLATE_INDEX_CONTRACT_TYPE;
  schemaVersion: typeof GEN_STUDIO_TEMPLATE_INDEX_SCHEMA_VERSION;
  templateId: string;
  type: GenStudioTemplateType;
  title: string;
  summary: string;
  useCases: string[];
  industries: string[];
  audiences: string[];
  styles: string[];
  topics: string[];
  intents: string[];
  inputRequirements: string[];
  expectedOutputs: string[];
  /** Template → Knowledge Unit 양방향 연결의 한쪽(원문 2부 §8·§9) */
  relatedKnowledgeUnitIds: string[];
  /** Pattern 연결은 AIR-800/AIR-802 완료 후 별도 TASK — P0에는 저장 컬럼만 두고 승격 판정은 하지 않는다 */
  relatedPatternIds: string[];
}

/** templateId를 임베딩 documentRef로 고정 변환한다. */
export function genStudioTemplateDocumentRef(templateId: string): string {
  return `amu:gen-studio-template:${templateId.trim()}`;
}
