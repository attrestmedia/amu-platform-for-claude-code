import { Schema, type Document } from "mongoose";
import { CHARACTER_REFERENCE_IMAGE_ROLES as CHARACTER_REFERENCE_ROLE_VALUES } from "consts/app";
import type { UnknownRecord } from "utils/common/typeUtils";

export const CHARACTER_REFERENCE_KIT_STATUSES = ["draft", "active", "archived"] as const;
export const CHARACTER_REFERENCE_KIT_READINESS_LEVELS = ["blocked", "minimum", "recommended", "complete"] as const;
// 소유 축·공유 축 정본. ASH-17 decision — 소유는 과금 주체를 따르고(커머스=universe, 사용자 생성=user),
// 다중 사용은 visibility + allowedUniverseIds 로 표현한다. 기본값은 fail-closed 인 private 다.
export const CHARACTER_REFERENCE_KIT_OWNER_TYPES = ["user", "universe"] as const;
export const CHARACTER_REFERENCE_KIT_VISIBILITIES = ["public", "private", "restricted"] as const;
// 역할 정본은 consts/app이며 여기서 배열을 다시 만들지 않는다 (SSM-202).
export const CHARACTER_REFERENCE_IMAGE_ROLES = CHARACTER_REFERENCE_ROLE_VALUES;

export type CharacterReferenceKitStatusType = (typeof CHARACTER_REFERENCE_KIT_STATUSES)[number];
export type CharacterReferenceKitReadinessLevelType = (typeof CHARACTER_REFERENCE_KIT_READINESS_LEVELS)[number];
export type CharacterReferenceImageRoleType = (typeof CHARACTER_REFERENCE_IMAGE_ROLES)[number];
export type CharacterReferenceKitOwnerTypeType = (typeof CHARACTER_REFERENCE_KIT_OWNER_TYPES)[number];
export type CharacterReferenceKitVisibilityType = (typeof CHARACTER_REFERENCE_KIT_VISIBILITIES)[number];

export interface ICharacterReferenceKitDocument extends Document {
  kitId: string;
  universeId: string;
  // 소유 축 (ASH-17 1단계). ownerType 이 없는 과거 문서는 universe + universeId 로 읽는다(fail-closed는 접근 판정이 담당).
  ownerType?: CharacterReferenceKitOwnerTypeType;
  ownerId?: string;
  // 공유 축 (ASH-17 3단계). 기본 private 이라 기존 동작이 유지된다.
  visibility?: CharacterReferenceKitVisibilityType;
  allowedUniverseIds?: string[];
  status: CharacterReferenceKitStatusType;
  version: number;
  sourceTemplateKey: string;
  sourceTemplateVersion: number;
  name: string;
  displayName?: string;
  description?: string;
  tags: string[];
  categoryHints: string[];
  images: Partial<Record<CharacterReferenceImageRoleType, UnknownRecord>>;
  spec: UnknownRecord;
  quality: {
    ready: boolean;
    readinessLevel: CharacterReferenceKitReadinessLevelType;
    missingRoles: string[];
    warnings: string[];
    requiredImageCount: number;
    optionalImageCount: number;
    axes?: UnknownRecord;
    lastCheckedAt?: Date | null;
  };
  usage: {
    lastUsedAt?: Date | null;
    usedDraftIds: string[];
    generatedAssetIds: string[];
    playPersonaPids: string[];
  };
  meta: UnknownRecord;
  createdBy: string;
  updatedBy: string;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReferenceKitQualitySchema = new Schema(
  {
    ready: { type: Boolean, default: false, index: true },
    readinessLevel: {
      type: String,
      enum: CHARACTER_REFERENCE_KIT_READINESS_LEVELS,
      default: "blocked",
      index: true,
    },
    missingRoles: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    requiredImageCount: { type: Number, default: 0 },
    optionalImageCount: { type: Number, default: 0 },
    // 정체성·핏·각도 축별 충족 상태. 축 이름이 늘어도 스키마 마이그레이션이 필요 없게 Mixed로 둔다.
    axes: { type: Schema.Types.Mixed, default: () => ({}) },
    lastCheckedAt: { type: Date, default: null },
  },
  { _id: false },
);

const ReferenceKitUsageSchema = new Schema(
  {
    lastUsedAt: { type: Date, default: null },
    usedDraftIds: { type: [String], default: [] },
    generatedAssetIds: { type: [String], default: [] },
    playPersonaPids: { type: [String], default: [] },
  },
  { _id: false },
);

export const CharacterReferenceKitSchema = new Schema<ICharacterReferenceKitDocument>(
  {
    kitId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    // 소유 축은 저장 시 서버가 결정한다 — 기본값을 두지 않아 클라이언트·자동 기본값으로 채워지지 않는다 (ASH-17 1단계).
    ownerType: { type: String, enum: CHARACTER_REFERENCE_KIT_OWNER_TYPES, index: true },
    ownerId: { type: String, index: true },
    // 공유 축 — 기본 private(fail-closed). public 은 판정에만 있고 노출 경로는 법무 게이트 전까지 켜지 않는다 (ASH-17 3단계).
    visibility: { type: String, enum: CHARACTER_REFERENCE_KIT_VISIBILITIES, default: "private", index: true },
    allowedUniverseIds: { type: [String], default: [] },
    status: { type: String, enum: CHARACTER_REFERENCE_KIT_STATUSES, default: "draft", index: true },
    version: { type: Number, default: 1, index: true },
    sourceTemplateKey: { type: String, default: "", index: true },
    sourceTemplateVersion: { type: Number, default: 1 },
    name: { type: String, required: true },
    displayName: { type: String, default: "" },
    description: { type: String, default: "" },
    tags: { type: [String], default: [] },
    categoryHints: { type: [String], default: [] },
    images: { type: Schema.Types.Mixed, default: () => ({}) },
    spec: { type: Schema.Types.Mixed, default: () => ({}) },
    quality: { type: ReferenceKitQualitySchema, default: () => ({}) },
    usage: { type: ReferenceKitUsageSchema, default: () => ({}) },
    meta: { type: Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: String, required: true, index: true },
    updatedBy: { type: String, required: true, index: true },
    archivedAt: { type: Date, default: null },
  },
  // U2 컬렉션 복사·인덱스 생성 완료 후 새 저장소를 읽도록 컷오버했다.
  { timestamps: true, collection: "character_reference_kits" },
);

CharacterReferenceKitSchema.index({ universeId: 1, status: 1, updatedAt: -1 });
CharacterReferenceKitSchema.index({ universeId: 1, "quality.ready": 1, status: 1, updatedAt: -1 });
CharacterReferenceKitSchema.index({ universeId: 1, sourceTemplateKey: 1, status: 1, updatedAt: -1 });
CharacterReferenceKitSchema.index({ universeId: 1, tags: 1, status: 1 });
// ASH-17 — 소유 축(1단계)·공유 축(3단계) 조회용. 기존 4종은 롤백 기간 동안 제거하지 않는다.
CharacterReferenceKitSchema.index({ ownerType: 1, ownerId: 1, status: 1, updatedAt: -1 });
CharacterReferenceKitSchema.index({ visibility: 1, status: 1, updatedAt: -1 });
CharacterReferenceKitSchema.index({ allowedUniverseIds: 1, status: 1, updatedAt: -1 });
