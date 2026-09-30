import "server-only";

import { getUniverseById } from "libs/database/universe";
import { canEditUniverse } from "libs/server-utils/auth/userRoleUtils";
import { getAuthenticatedUid, isAuthenticatedAdmin } from "libs/server-utils/lab/imageAssetAccess";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type {
  CharacterReferenceKitOwnerTypeType,
  CharacterReferenceKitVisibilityType,
} from "types/character/referenceKit";

/**
 * @docHint
 * @purpose 레퍼런스 킷의 소유·공유·접근 판정을 한 곳에 모은다 (ASH-17)
 * @process 소유 축 해석  administrator/소유자/허용 유니버스/공개 판정  boolean 반환
 * @domain commerce.model-reference
 * @scope server
 */

export type CharacterReferenceKitAccessDoc = {
  universeId?: string | null;
  ownerType?: string | null;
  ownerId?: string | null;
  visibility?: string | null;
  allowedUniverseIds?: unknown;
  createdBy?: string | null;
};

export type ResolvedCharacterReferenceKitOwner = {
  ownerType: CharacterReferenceKitOwnerTypeType;
  ownerId: string;
  /** ownerType 이 저장돼 있지 않아 universe + universeId 로 해석한 1단계 이전 문서다. */
  legacy: boolean;
};

/**
 * 접근 목적 축 (ASH-17 5단계·N-9). `manage` 는 편집·attach·보관·readiness 이고 소유자·관리자만 한다.
 * `select` 는 선택·캐릭터 생성 소스이며 공유(public·restricted)를 넓힌다. **기본값은 엄격한 manage 다.**
 */
export type CharacterReferenceKitAccessPurpose = "manage" | "select";

export type CharacterReferenceKitAccessContext = {
  /** 접근을 시도하는 대상 유니버스. restricted 허용 목록·플레이 가능 판정에 쓴다. */
  universeId?: string;
  /** 생략하면 manage(엄격)로 떨어진다 — 호출부가 select 를 명시해야 공유가 열린다. */
  purpose?: CharacterReferenceKitAccessPurpose;
};

const OWNER_TYPES: readonly CharacterReferenceKitOwnerTypeType[] = ["user", "universe"];
const VISIBILITIES: readonly CharacterReferenceKitVisibilityType[] = ["public", "private", "restricted"];

function toSafeString(value: unknown) {
  return String(value ?? "").trim();
}

/** 허용값이 아니면 fail-closed 로 private 로 내린다. 정본은 models/character 의 CHARACTER_REFERENCE_KIT_VISIBILITIES 다. */
export function normalizeCharacterReferenceKitVisibility(value: unknown): CharacterReferenceKitVisibilityType {
  const visibility = toSafeString(value).toLowerCase();
  return (VISIBILITIES as readonly string[]).includes(visibility)
    ? (visibility as CharacterReferenceKitVisibilityType)
    : "private";
}

export function getCharacterReferenceKitAllowedUniverseIds(doc: CharacterReferenceKitAccessDoc | null | undefined): string[] {
  const raw = Array.isArray(doc?.allowedUniverseIds) ? doc.allowedUniverseIds : [];
  return Array.from(new Set(raw.map((value) => toSafeString(value)).filter(Boolean)));
}

/**
 * 소유 축을 해석한다. ownerType 이 저장돼 있지 않은 문서(ASH-17 1단계 이전)는 문서를 고치지 않고
 * universe + universeId 로 읽는다 — 백필은 별도 스크립트가 담당한다.
 * ownerType 은 있는데 ownerId 가 비면 소유자를 알 수 없으므로 null(fail-closed)이다.
 */
export function resolveCharacterReferenceKitOwner(
  doc: CharacterReferenceKitAccessDoc | null | undefined,
): ResolvedCharacterReferenceKitOwner | null {
  if (!doc) return null;

  const ownerType = toSafeString(doc.ownerType).toLowerCase();
  if ((OWNER_TYPES as readonly string[]).includes(ownerType)) {
    const ownerId = toSafeString(doc.ownerId);
    if (!ownerId) return null;
    return { ownerType: ownerType as CharacterReferenceKitOwnerTypeType, ownerId, legacy: false };
  }

  const universeId = toSafeString(doc.universeId);
  if (!universeId) return null;
  return { ownerType: "universe", ownerId: universeId, legacy: true };
}

/** 라우트가 `universeId` 경로와 소유 유니버스가 같은지 판정한다(2단계에서 종전 universeId 일치 조회를 대체). */
export function isCharacterReferenceKitOwnedByUniverse(
  doc: CharacterReferenceKitAccessDoc | null | undefined,
  universeId: string,
): boolean {
  const owner = resolveCharacterReferenceKitOwner(doc);
  return Boolean(owner && owner.ownerType === "universe" && owner.ownerId === toSafeString(universeId));
}

/**
 * 소유자만 할 수 있는 쓰기(PATCH·보관·attach·readiness) 판정이다.
 * 공유(visibility·allowedUniverseIds)는 선택·읽기만 넓히며 이 판정을 넓히지 않는다.
 */
export async function canEditCharacterReferenceKit(
  user: AuthenticatedUserType,
  doc: CharacterReferenceKitAccessDoc | null | undefined,
): Promise<boolean> {
  if (isAuthenticatedAdmin(user)) return true;

  const owner = resolveCharacterReferenceKitOwner(doc);
  if (!owner) return false;

  if (owner.ownerType === "user") {
    const uid = getAuthenticatedUid(user);
    return Boolean(uid && uid === owner.ownerId);
  }

  const universe = await getUniverseById(owner.ownerId);
  if (!universe) return false;
  return canEditUniverse(user, universe);
}

/**
 * 대상 유니버스에서 플레이 가능한가 (ASH-17 판정 3). 선례를 따른다 —
 * 유니버스 실재 + `enabled !== false` (`app/api/game/npc/codex/route.ts`). 새 개념을 만들지 않는다.
 */
export async function isCharacterReferenceKitTargetUniversePlayable(universeId: string): Promise<boolean> {
  const id = toSafeString(universeId);
  if (!id) return false;
  const universe = await getUniverseById(id);
  return Boolean(universe && universe.enabled !== false);
}

/**
 * 접근 판정 (ASH-17 2·5단계). purpose 기본값은 manage(엄격)이다.
 * - `manage` — 편집·attach·보관·readiness. administrator·소유자만 통과한다. 공유는 수정 권한을 넓히지 않는다.
 * - `select` — 선택·캐릭터 생성 소스. 소유자에 더해 public·restricted(허용 + 대상 유니버스 플레이 가능)를 넓힌다.
 */
export async function canAccessCharacterReferenceKit(
  user: AuthenticatedUserType,
  doc: CharacterReferenceKitAccessDoc | null | undefined,
  context?: CharacterReferenceKitAccessContext,
): Promise<boolean> {
  if (isAuthenticatedAdmin(user)) return true;

  const owner = resolveCharacterReferenceKitOwner(doc);
  if (!owner) return false;

  // 소유자 본인(사용자 킷)·소유 유니버스 편집자(유니버스 킷)는 visibility 와 무관하게 접근한다.
  if (owner.ownerType === "user") {
    const uid = getAuthenticatedUid(user);
    if (uid && uid === owner.ownerId) return true;
  } else {
    const ownerUniverse = await getUniverseById(owner.ownerId);
    if (ownerUniverse && canEditUniverse(user, ownerUniverse)) return true;
  }

  // 기본값 manage — 공유(visibility)는 여기서 판정하지 않는다. 관리 권한은 소유자 전용이다(fail-closed).
  if (context?.purpose !== "select") return false;

  const visibility = normalizeCharacterReferenceKitVisibility(doc?.visibility);
  if (visibility === "private") return false;

  if (visibility === "restricted") {
    const targetUniverseId = toSafeString(context?.universeId);
    if (!targetUniverseId || !getCharacterReferenceKitAllowedUniverseIds(doc).includes(targetUniverseId)) return false;
    // select 는 편집권(canEditUniverse)이 아니라 대상 유니버스 플레이 가능을 요구한다 (N-9).
    return isCharacterReferenceKitTargetUniversePlayable(targetUniverseId);
  }

  // public — 접근 판정에만 존재한다. UI 노출·선택 경로는 권리 귀속 고지 정합 전까지 열지 않는다.
  return true;
}
