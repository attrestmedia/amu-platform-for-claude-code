/**
 * @docHint
 * @purpose Published Personal Universe Snapshot의 공개 allowlist와 신고 계약
 * @process published Canon projection  사전 moderation  visibility  report lifecycle
 * @domain narrative-canon.personal-universe.public
 * @scope server-client-contract
 */

export const PUBLIC_UNIVERSE_SNAPSHOT_SCHEMA_VERSION = "personal-universe-public-snapshot-v1" as const;

export const PUBLIC_UNIVERSE_SNAPSHOT_VISIBILITY_VALUES = ["private", "link", "public"] as const;
export type PublicUniverseSnapshotVisibility = (typeof PUBLIC_UNIVERSE_SNAPSHOT_VISIBILITY_VALUES)[number];

export const PUBLIC_UNIVERSE_SNAPSHOT_STATUS_VALUES = ["draft", "published", "withdrawn", "deleted"] as const;
export type PublicUniverseSnapshotStatus = (typeof PUBLIC_UNIVERSE_SNAPSHOT_STATUS_VALUES)[number];

export const PUBLIC_UNIVERSE_MODERATION_STATUS_VALUES = ["pending", "approved", "rejected", "blocked"] as const;
export type PublicUniverseModerationStatus = (typeof PUBLIC_UNIVERSE_MODERATION_STATUS_VALUES)[number];

export const PUBLIC_UNIVERSE_REPORT_REASON_VALUES = [
  "sexual",
  "graphic-violence",
  "hate",
  "self-harm",
  "privacy",
  "impersonation",
  "copyright",
  "other",
] as const;
export type PublicUniverseReportReason = (typeof PUBLIC_UNIVERSE_REPORT_REASON_VALUES)[number];

/** 공개 Snapshot은 필요한 World Lore·인물·사건·관계만 구조화해 저장한다. */
export const PUBLIC_UNIVERSE_ENTITY_TYPE_VALUES = [
  "core-law",
  "history",
  "species",
  "faction",
  "region",
  "timeline",
  "character",
  "event",
  "relation",
] as const;
export type PublicUniverseEntityType = (typeof PUBLIC_UNIVERSE_ENTITY_TYPE_VALUES)[number];

export interface PublicUniverseSnapshotEntity {
  entityType: PublicUniverseEntityType;
  entityId: string;
  title: string;
  summary?: string;
  description?: string;
  worldName?: string;
  premise?: string;
  rules?: string[];
  sourceCharacterId?: string;
  targetRefType?: string;
  targetRefId?: string;
  relationTypes?: string[];
  strength?: number;
  sinceEventId?: string;
  regionId?: string;
  factionId?: string;
  characterIds?: string[];
  relatedEventIds?: string[];
  startOrder?: number;
  endOrder?: number;
}

export interface PublicUniverseSnapshotCounts {
  characters: number;
  relations: number;
  events: number;
  regions: number;
  factions: number;
}

export interface PublicUniverseSnapshotContent {
  schemaVersion: typeof PUBLIC_UNIVERSE_SNAPSHOT_SCHEMA_VERSION;
  worldName: string;
  premise: string;
  entities: PublicUniverseSnapshotEntity[];
  counts: PublicUniverseSnapshotCounts;
}

/**
 * 이 문서는 ownerUid/source revision/audit를 공개 응답에 포함하지 않는다.
 * 해당 메타데이터는 계정 삭제와 운영 처리를 위해 내부 저장소에만 둔다.
 */
export interface IPersonalUniversePublicSnapshotDoc {
  snapshotId: string;
  personalUniverseId: string;
  ownerUid: string;
  visibility: PublicUniverseSnapshotVisibility;
  status: PublicUniverseSnapshotStatus;
  moderationStatus: PublicUniverseModerationStatus;
  moderationPolicyVersion: string;
  revision: number;
  content: PublicUniverseSnapshotContent;
  publishedAt?: string | Date | null;
  withdrawnAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IPersonalUniversePublicSnapshotReportDoc {
  reportId: string;
  snapshotId: string;
  ownerUid: string;
  reporterUid: string;
  reason: PublicUniverseReportReason;
  note?: string;
  status: "pending" | "resolved" | "rejected";
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface PublicUniverseModerationResult {
  status: Extract<PublicUniverseModerationStatus, "approved" | "rejected" | "blocked">;
  policyVersion: string;
  issues: string[];
}
