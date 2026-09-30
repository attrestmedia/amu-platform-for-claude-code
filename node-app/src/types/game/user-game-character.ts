import type { IExtendedNpcData } from "./npc";

export const USER_GAME_CHARACTER_STATUSES = [
  "draft",
  "generating",
  "verify_failed",
  "active",
  "disabled",
] as const;
export type UserGameCharacterStatusType = (typeof USER_GAME_CHARACTER_STATUSES)[number];

export const USER_GAME_CHARACTER_SOURCE_TYPES = ["gen-studio", "tutors-profile", "new", "upload", "reference-kit"] as const;
export type UserGameCharacterSourceType = (typeof USER_GAME_CHARACTER_SOURCE_TYPES)[number];

export const USER_GAME_CHARACTER_MODERATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type UserGameCharacterModerationStatusType = (typeof USER_GAME_CHARACTER_MODERATION_STATUSES)[number];
export const USER_GAME_CHARACTER_GENESIS_STATUSES = ["pending", "applied", "failed"] as const;
export type UserGameCharacterGenesisStatusType = (typeof USER_GAME_CHARACTER_GENESIS_STATUSES)[number];

export const USER_GAME_CHARACTER_REPORT_REASONS = [
  "sexual",
  "violence",
  "hate",
  "self-harm",
  "privacy",
  "impersonation",
  "other",
] as const;
export type UserGameCharacterReportReasonType = (typeof USER_GAME_CHARACTER_REPORT_REASONS)[number];

export interface IUserGameCharacterDoc {
  characterId: string;
  uid: string;
  universeId: string;
  /** lore 소속 Personal Universe. universeId는 mechanics/ruleset 스코프로 유지한다. */
  personalUniverseId?: string;
  name: string;
  status: UserGameCharacterStatusType;
  sourceType: UserGameCharacterSourceType;
  sourceImageRef: string;
  sourceImageAssetId: string;
  sourcePersonaId?: string;
  sourceReferenceKitId?: string;
  speciesId?: "human" | "monster";
  primaryAttributeId?: string;
  genesisStatus?: UserGameCharacterGenesisStatusType;
  genesisErrorCode?: string;
  templateVersion: number;
  /** 이 캐릭터 파이프라인에서 기준 이미지로 실패한 anchor assetId 목록 (선택기 배지용) */
  failedAnchorIds?: string[];
  idempotencyKey: string;
  pipelineId?: string;
  spriteAssetId?: string;
  personaId?: string;
  moderationStatus: UserGameCharacterModerationStatusType;
  disabledReason?: string;
  reportedAt?: string | Date;
  reportedBy?: string;
  reportReason?: UserGameCharacterReportReasonType;
  reportNote?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IUserGameCharacterSelectableDoc {
  character: IUserGameCharacterDoc;
  persona: IExtendedNpcData;
}

export interface IUserGameCharacterReportResult {
  character: IUserGameCharacterDoc;
  changed: boolean;
}
