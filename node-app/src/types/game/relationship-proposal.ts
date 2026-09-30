import type { CanonGraphRevisionDoc, CanonReferenceEntityType, CanonRelationType } from "./narrative-canon";

/**
 * @docHint
 * @purpose Personal Canon 관계 제안의 구조·권한·비용 경계
 * @process 개인 Canon 입력 정규화  AI 결과 검증  owner proposal 반환
 * @domain narrative-canon.relationship-proposal
 * @scope server
 */

export const RELATIONSHIP_PROPOSAL_STATUS_VALUES = ["proposal", "fallback"] as const;
export type RelationshipProposalStatus = (typeof RELATIONSHIP_PROPOSAL_STATUS_VALUES)[number];

export const RELATIONSHIP_PROPOSAL_SOURCE_VALUES = ["ai", "manual"] as const;
export type RelationshipProposalSource = (typeof RELATIONSHIP_PROPOSAL_SOURCE_VALUES)[number];

export const RELATIONSHIP_PROPOSAL_POLICY = {
  maxCandidates: 5,
  maxCanonEntities: 80,
  maxOpenLoops: 12,
  maxPromptChars: 24_000,
  maxOutputTokens: 900,
  maxCallsPerSession: 2,
  cacheTtlSeconds: 300,
  sessionTtlSeconds: 900,
} as const;

export type RelationshipProposalTargetType = CanonReferenceEntityType;

export interface RelationshipProposalCandidate {
  targetRefType: RelationshipProposalTargetType;
  targetRefId: string;
  relationType: CanonRelationType;
  reason: string;
  evidenceEventIds: string[];
}
export interface RelationshipProposalContext {
  ownerUid: string;
  personalUniverseId: string;
  newCharacter: {
    characterId: string;
    title: string;
    summary: string;
  };
  personalCanon: readonly CanonGraphRevisionDoc[];
  openLoops: readonly CanonGraphRevisionDoc[];
}

export interface RelationshipProposalTelemetry {
  promptTokens: number;
  outputTokens: number;
  cacheHit: boolean;
  modelName?: string;
  estimatedCoins?: number | null;
  budgetCapCoins?: number | null;
  gateReason?: string;
}

export interface RelationshipProposal {
  proposalId: string;
  status: RelationshipProposalStatus;
  source: RelationshipProposalSource;
  ownerUid: string;
  personalUniverseId: string;
  characterId: string;
  candidates: RelationshipProposalCandidate[];
  fallbackReason?: string;
  telemetry: RelationshipProposalTelemetry;
}
