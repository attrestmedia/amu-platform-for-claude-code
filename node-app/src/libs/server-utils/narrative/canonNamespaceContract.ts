import type {
  CanonGraphRevisionDoc,
  IUniverseCanonRevisionDoc,
  PersonalUniverseOfficialCanonReference,
} from "types/game";

/**
 * @docHint
 * @purpose Official Canon과 Personal Universe의 저장·참조·prompt projection 경계
 * @process opt-in official pin  personal-only graph  admission/render 순서 분리
 * @domain narrative-canon.namespace
 * @scope server
 */

export const CANON_PROJECTION_RENDER_ORDER = [
  "official-reference",
  "personal-universe",
  "personal-story",
  "moment",
] as const;

export const CANON_PROJECTION_ADMISSION_ORDER = [
  "personal-universe",
  "personal-story",
  "moment",
  "official-reference",
] as const;

export type CanonProjectionSectionKind = (typeof CANON_PROJECTION_RENDER_ORDER)[number];

export type PersonalUniverseProjectionContext = {
  personalUniverseId: string;
  personalCanon: readonly CanonGraphRevisionDoc[];
  referencedOfficialCanon: readonly PersonalUniverseOfficialCanonReference[];
};

export type CanonNamespaceProjection = {
  official: IUniverseCanonRevisionDoc[];
  personal: CanonGraphRevisionDoc[];
  staleOfficialReferences: PersonalUniverseOfficialCanonReference[];
  personalUniverseId?: string;
};

function sortCanon<T extends CanonGraphRevisionDoc>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.layer.localeCompare(b.layer) || a.entityType.localeCompare(b.entityType) || a.entityId.localeCompare(b.entityId));
}

function referenceKey(reference: { officialUniverseId: string; entityType: string; entityId: string; revision: number }) {
  return `${reference.officialUniverseId}:${reference.entityType}:${reference.entityId}:${reference.revision}`;
}

/**
 * Personal Universe context가 없으면 기존 official-only runtime 호환 경로를 유지한다.
 * context가 있으면 official은 참조 선언·revision pin·published 상태가 모두 맞는 항목만 통과한다.
 */
export function resolveCanonNamespaceProjection(input: {
  officialCanon: readonly IUniverseCanonRevisionDoc[];
  personalUniverse?: PersonalUniverseProjectionContext;
}): CanonNamespaceProjection {
  if (!input.personalUniverse) {
    return { official: sortCanon(input.officialCanon.filter((item) => item.status === "published")), personal: [], staleOfficialReferences: [] };
  }

  const referenceKeys = new Set(input.personalUniverse.referencedOfficialCanon.map(referenceKey));
  const official = sortCanon(
    input.officialCanon.filter((item) => item.status === "published" && referenceKeys.has(referenceKey({
      officialUniverseId: item.universeId,
      entityType: item.entityType,
      entityId: item.entityId,
      revision: item.revision,
    }))),
  );
  const resolvedKeys = new Set(official.map((item) => referenceKey({
    officialUniverseId: item.universeId,
    entityType: item.entityType,
    entityId: item.entityId,
    revision: item.revision,
  })));
  const staleOfficialReferences = input.personalUniverse.referencedOfficialCanon.filter((reference) => !resolvedKeys.has(referenceKey(reference)));
  return {
    official,
    personal: sortCanon(input.personalUniverse.personalCanon.filter((item) => item.status === "published")),
    staleOfficialReferences,
    personalUniverseId: input.personalUniverse.personalUniverseId,
  };
}

export function sortProjectionSectionsForAdmission<T extends { kind: CanonProjectionSectionKind }>(sections: readonly T[]) {
  const rank = new Map<string, number>(CANON_PROJECTION_ADMISSION_ORDER.map((kind, index) => [kind, index]));
  return [...sections].sort((a, b) => (rank.get(a.kind) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.kind) ?? Number.MAX_SAFE_INTEGER));
}

export function sortProjectionSectionsForRender<T extends { kind: CanonProjectionSectionKind }>(sections: readonly T[]) {
  const rank = new Map<string, number>(CANON_PROJECTION_RENDER_ORDER.map((kind, index) => [kind, index]));
  return [...sections].sort((a, b) => (rank.get(a.kind) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.kind) ?? Number.MAX_SAFE_INTEGER));
}
