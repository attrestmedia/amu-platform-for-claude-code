import type { CharacterReferenceImageRoleType as CharacterReferenceImageRoleValueType } from "consts/app";
import type { UnknownRecord } from "utils/common/typeUtils";

export type CharacterReferenceKitStatusType = "draft" | "active" | "archived";
export type CharacterReferenceKitReadinessLevelType = "blocked" | "minimum" | "recommended" | "complete";
export type CharacterReferenceKitOwnerTypeType = "user" | "universe";
export type CharacterReferenceKitVisibilityType = "public" | "private" | "restricted";

// 역할 정본은 consts/app이며 여기서 유니온을 다시 나열하지 않는다 (SSM-202).
export type CharacterReferenceImageRoleType = CharacterReferenceImageRoleValueType;

/** readiness 판정 축. 역할 개수가 아니라 "무엇을 판단할 수 있는가"로 완성도를 매긴다. */
export type CharacterReferenceQualityAxisType = "identity" | "fit" | "angle";

export type CharacterReferenceQualityAxisStateType = {
  satisfied: boolean;
  presentRoles: CharacterReferenceImageRoleType[];
  missingRoles: CharacterReferenceImageRoleType[];
};

export type CharacterReferenceImageType = {
  role: CharacterReferenceImageRoleType;
  /** 표시용 URL. private R2 슬롯은 응답 시점에 해석된 만료형 URL이며 문서에는 저장되지 않는다 (ASH-15). */
  url: string;
  assetId?: string;
  source?: "upload" | "gen_studio" | "external" | "manual";
  /** 저장소 종류와 공개 범위. bucket·key는 내부 키 레이아웃이라 응답에 싣지 않는다. */
  driver?: string;
  access?: string;
  /** "signed"면 urlExpiresAt 이후 URL이 만료된다. refreshUrl로 다시 발급받는다. */
  urlKind?: "public" | "signed" | "worker" | "local" | "none";
  urlExpiresAt?: string;
  refreshUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sha256?: string;
  sortOrder?: number;
};

export type CharacterReferenceSpecType = {
  heightImpression?: string;
  bodyType?: string;
  skinTone?: string;
  hair?: string;
  faceShape?: string;
  mood?: string;
  poseRules?: string;
  stylingRules?: string;
  negativeRules?: string;
  promptText?: string;
};

export type CharacterReferenceQualityType = {
  ready: boolean;
  readinessLevel?: CharacterReferenceKitReadinessLevelType;
  missingRoles: CharacterReferenceImageRoleType[];
  warnings: string[];
  requiredImageCount?: number;
  optionalImageCount?: number;
  axes?: Partial<Record<CharacterReferenceQualityAxisType, CharacterReferenceQualityAxisStateType>>;
  lastCheckedAt?: string;
};

export interface ICharacterReferenceKit {
  kitId: string;
  universeId: string;
  /** 소유 축 (ASH-17 1단계). 없으면 universe + universeId 로 읽는 과거 문서다. */
  ownerType?: CharacterReferenceKitOwnerTypeType;
  ownerId?: string;
  /** 공유 축 (ASH-17 3단계). 기본 private. */
  visibility?: CharacterReferenceKitVisibilityType;
  allowedUniverseIds?: string[];
  status: CharacterReferenceKitStatusType;
  version?: number;
  sourceTemplateKey?: string;
  sourceTemplateVersion?: number;
  name: string;
  displayName?: string;
  description?: string;
  tags?: string[];
  categoryHints?: string[];
  images?: Partial<Record<CharacterReferenceImageRoleType, CharacterReferenceImageType>>;
  spec?: CharacterReferenceSpecType;
  quality?: CharacterReferenceQualityType;
  usage?: {
    lastUsedAt?: string;
    usedDraftIds?: string[];
    generatedAssetIds?: string[];
  };
  meta?: UnknownRecord;
  createdBy?: string;
  updatedBy?: string;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
