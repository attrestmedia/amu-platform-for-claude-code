/**
 * @docHint
 * @purpose Cross-Universe의 소유권·동의·revision pin 계약
 * @process allowlisted encounter  foreign reference  bilateral bridge  withdrawal/block/report
 * @domain narrative-canon.cross-universe
 * @scope server-client-contract
 */

export const CROSS_UNIVERSE_SCHEMA_VERSION = "cross-universe-v1" as const;
export const CROSS_UNIVERSE_CONSENT_VERSION = "cross-universe-consent-v1" as const;

export const CROSS_UNIVERSE_SCOPE_VALUES = ["cameo", "dialogue", "temporary-event", "relationship"] as const;
export type CrossUniverseScope = (typeof CROSS_UNIVERSE_SCOPE_VALUES)[number];

/** 원 소유자 Canon에서 절대로 허용되지 않는 교차 세계관 mutation. */
export const CROSS_UNIVERSE_FORBIDDEN_MUTATION_VALUES = [
  "character-definition",
  "origin",
  "death",
  "permanent-state",
  "long-term-joining",
] as const;
export type CrossUniverseForbiddenMutation = (typeof CROSS_UNIVERSE_FORBIDDEN_MUTATION_VALUES)[number];

export const CROSS_UNIVERSE_SHARE_STATUS_VALUES = ["enabled", "withdrawn"] as const;
export type CrossUniverseShareStatus = (typeof CROSS_UNIVERSE_SHARE_STATUS_VALUES)[number];

export const CROSS_UNIVERSE_BRIDGE_KIND_VALUES = ["guest-encounter", "canon-bridge"] as const;
export type CrossUniverseBridgeKind = (typeof CROSS_UNIVERSE_BRIDGE_KIND_VALUES)[number];

export const CROSS_UNIVERSE_BRIDGE_STATUS_VALUES = ["requested", "approved", "rejected", "withdrawn", "blocked"] as const;
export type CrossUniverseBridgeStatus = (typeof CROSS_UNIVERSE_BRIDGE_STATUS_VALUES)[number];

export const CROSS_UNIVERSE_REPORT_REASON_VALUES = ["sexual", "graphic-violence", "hate", "self-harm", "privacy", "harassment", "impersonation", "other"] as const;
export type CrossUniverseReportReason = (typeof CROSS_UNIVERSE_REPORT_REASON_VALUES)[number];

export interface ForeignCharacterReference {
  ownerUid: string;
  sourceUniverseId: string;
  characterId: string;
  characterRevision: number;
}

export interface CrossUniverseSharePreference {
  ownerUid: string;
  personalUniverseId: string;
  status: CrossUniverseShareStatus;
  allowedScopes: CrossUniverseScope[];
  consentVersion: typeof CROSS_UNIVERSE_CONSENT_VERSION;
  enabledAt?: string | Date | null;
  withdrawnAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CrossUniverseSharedFact {
  title: string;
  summary: string;
  occurredAt?: string | Date | null;
  scopes: CrossUniverseScope[];
}

/** 각 결과는 해당 universe에만 쓰이며 상대 Canon에 대한 command는 저장하지 않는다. */
export interface CrossUniverseLocalConsequence {
  universeId: string;
  summary: string;
  relationInterpretation?: string;
}

export interface CrossUniverseBridgeEvent {
  bridgeId: string;
  kind: CrossUniverseBridgeKind;
  status: CrossUniverseBridgeStatus;
  requesterUid: string;
  hostUid: string;
  guest: ForeignCharacterReference;
  hostUniverseId: string;
  hostCharacterId?: string;
  sharedFact: CrossUniverseSharedFact;
  localConsequences: CrossUniverseLocalConsequence[];
  approvals: { requesterAt?: string | Date | null; hostAt?: string | Date | null };
  withdrawnAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CrossUniverseUserBlock {
  ownerUid: string;
  blockedUid: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CrossUniverseReport {
  reportId: string;
  reporterUid: string;
  reportedUid: string;
  bridgeId?: string;
  reason: CrossUniverseReportReason;
  note?: string;
  status: "pending" | "resolved" | "rejected";
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CrossUniverseGraphNode {
  universeId: string;
  publicSnapshotId: string;
  title: string;
}

export interface CrossUniverseGraphEdge {
  bridgeId: string;
  fromUniverseId: string;
  toUniverseId: string;
  sharedEventCount: number;
  exchangedCharacterCount: number;
  firstContactAt?: string | Date | null;
  latestEventAt?: string | Date | null;
}

/** 추천은 공개 Snapshot과 명시적으로 공유한 범위만 사용하며, popularity·rarity·보상 신호를 갖지 않는다. */
export interface CrossUniverseMatchCandidate {
  snapshotId: string;
  universeId: string;
  worldName: string;
  characterIds: string[];
  score: number;
  reasons: Array<"open-loop" | "canon-theme" | "character-context" | "sharing-policy">;
  approvalRequired: true;
  automaticAppearance: false;
  estimatedCoins: 0;
}
