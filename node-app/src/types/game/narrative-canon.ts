/**
 * @docHint
 * @purpose Narrative Runtime의 공식 세계관 revision 계약
 * @process Canon entity 식별  revision 상태 관리  publish 시 snapshot 표현
 * @domain narrative-canon
 * @scope server
 */

export const CANON_LAYER_VALUES = ["C0", "C1", "C2", "C3"] as const;
export type CanonLayer = (typeof CANON_LAYER_VALUES)[number];

export const CANON_NAMESPACE_VALUES = ["official", "personal-universe"] as const;
export type CanonNamespace = (typeof CANON_NAMESPACE_VALUES)[number];

export const PERSONAL_UNIVERSE_STATUS_VALUES = ["active", "archived", "deleted"] as const;
export type PersonalUniverseStatus = (typeof PERSONAL_UNIVERSE_STATUS_VALUES)[number];

export const PERSONAL_UNIVERSE_VISIBILITY_VALUES = ["private", "link", "public"] as const;
export type PersonalUniverseVisibility = (typeof PERSONAL_UNIVERSE_VISIBILITY_VALUES)[number];

export const PERSONAL_CANON_ACTOR_TYPE_VALUES = ["owner", "system", "ai"] as const;
export type PersonalCanonActorType = (typeof PERSONAL_CANON_ACTOR_TYPE_VALUES)[number];

export interface PersonalUniverseOfficialCanonReference {
  officialUniverseId: string;
  entityType: CanonReferenceEntityType;
  entityId: string;
  revision: number;
  declaredAt?: string | Date;
}

export interface IPersonalUniverseDoc {
  uid: string;
  personalUniverseId: string;
  status: PersonalUniverseStatus;
  visibility: PersonalUniverseVisibility;
  rulesetUniverseId: string;
  referencedOfficialCanon: PersonalUniverseOfficialCanonReference[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/**
 * OOC-080 — Official Character Graph의 AMU 독자 관계 유형.
 * 타사 고유 타입표를 복제하지 않고 AMU 세계관이 실제로 쓰는 관계만 정의한다(G10).
 */
export const CANON_RELATION_TYPE_VALUES = [
  "ally",
  "rival",
  "mentor",
  "protege",
  "kin",
  "bound-oath",
  "debt",
  "estranged",
  "unknown",
] as const;
export type CanonRelationType = (typeof CANON_RELATION_TYPE_VALUES)[number];

/** 같은 edge에 동시에 선언할 수 없는 관계 유형 쌍. publish 전에 lore conflict로 차단한다. */
export const CANON_RELATION_EXCLUSIVE_PAIRS: readonly (readonly [CanonRelationType, CanonRelationType])[] = [
  ["ally", "rival"],
  ["mentor", "protege"],
  ["bound-oath", "estranged"],
  ["kin", "unknown"],
];

export const CANON_RELATION_VISIBILITY_VALUES = ["public", "internal"] as const;
export type CanonRelationVisibility = (typeof CANON_RELATION_VISIBILITY_VALUES)[number];

export const CANON_REFERENCE_ENTITY_TYPE_VALUES = [
  "character",
  "event",
  "region",
  "faction",
  "mystery",
  "object",
] as const;
export type CanonReferenceEntityType = (typeof CANON_REFERENCE_ENTITY_TYPE_VALUES)[number];

export const CANON_ENTITY_TYPE_VALUES = [
  "core-law",
  "history",
  "species",
  "faction",
  "region",
  "timeline",
  "character",
  "event",
  "object",
  "mystery",
  "open-loop",
  "relation",
] as const;
export type CanonEntityType = (typeof CANON_ENTITY_TYPE_VALUES)[number];

export const CANON_ENTITY_LAYER: Readonly<Record<CanonEntityType, CanonLayer>> = {
  "core-law": "C0",
  history: "C1",
  species: "C2",
  faction: "C2",
  region: "C2",
  timeline: "C1",
  character: "C3",
  event: "C1",
  object: "C2",
  mystery: "C3",
  "open-loop": "C3",
  relation: "C3",
};

export const CANON_REVISION_STATUS_VALUES = ["draft", "review", "published", "deprecated", "archived"] as const;
export type CanonRevisionStatus = (typeof CANON_REVISION_STATUS_VALUES)[number];

export const CANON_ALLOWED_TRANSITIONS: Readonly<Record<CanonRevisionStatus, readonly CanonRevisionStatus[]>> = {
  draft: ["review", "archived"],
  review: ["draft", "published", "archived"],
  published: ["deprecated"],
  deprecated: ["archived"],
  archived: [],
};

export function isCanonRevisionTransitionAllowed(from: CanonRevisionStatus, to: CanonRevisionStatus) {
  return CANON_ALLOWED_TRANSITIONS[from].includes(to);
}

export const CANON_ACTOR_TYPE_VALUES = ["admin", "system", "ai"] as const;
export type CanonActorType = (typeof CANON_ACTOR_TYPE_VALUES)[number];

export const CANON_OPEN_LOOP_STATUS_VALUES = ["open", "advancing", "resolved"] as const;
export type CanonOpenLoopStatus = (typeof CANON_OPEN_LOOP_STATUS_VALUES)[number];

export type CanonPrimitive = string | number | boolean | null;
// Mongoose가 interface를 추론할 때 무한 재귀로 확장하지 않도록 기존 payload 깊이를 유지한다.
export type CanonPayloadValue = CanonPrimitive | CanonPrimitive[] | CanonPayload;

export type CanonPayloadFieldKind = "text" | "text-list" | "id" | "id-list" | "enum" | "non-negative-integer";

export interface CanonPayloadFieldSchema {
  kind: CanonPayloadFieldKind;
  values?: readonly string[];
}

export interface CanonEntityPayloadSchema {
  required: readonly string[];
  fields: Readonly<Record<string, CanonPayloadFieldSchema>>;
}

export interface CanonGraphRevisionDoc {
  layer: CanonLayer;
  entityType: CanonEntityType;
  entityId: string;
  revision: number;
  status: CanonRevisionStatus;
  payload: CanonPayload;
}

const COMMON_CANON_PAYLOAD_FIELDS: Readonly<Record<string, CanonPayloadFieldSchema>> = {
  title: { kind: "text" },
  summary: { kind: "text" },
  description: { kind: "text" },
  speciesIds: { kind: "id-list" },
  factionIds: { kind: "id-list" },
  regionIds: { kind: "id-list" },
  speciesId: { kind: "id" },
  mechanicsSpeciesId: { kind: "id" },
  factionId: { kind: "id" },
  regionId: { kind: "id" },
  prerequisiteIds: { kind: "id-list" },
  beforeIds: { kind: "id-list" },
  startOrder: { kind: "non-negative-integer" },
  endOrder: { kind: "non-negative-integer" },
  allowedKnowledge: { kind: "id-list" },
  forbiddenKnowledge: { kind: "id-list" },
};

/**
 * Canon entity별 payload 계약. 기존 7종은 required를 비워 하위 호환을 유지하고,
 * OOC-082에서 추가된 entity만 구조적으로 필요한 참조를 요구한다.
 */
export const CANON_ENTITY_PAYLOAD_SCHEMAS: Readonly<Record<CanonEntityType, CanonEntityPayloadSchema>> = {
  "core-law": {
    required: [],
    fields: {
      ...COMMON_CANON_PAYLOAD_FIELDS,
      worldName: { kind: "text" },
      premise: { kind: "text" },
      rules: { kind: "text-list" },
      startingPlace: { kind: "text" },
      firstEvent: { kind: "text" },
      characterId: { kind: "id" },
      rulesetUniverseId: { kind: "id" },
      rulesetVersion: { kind: "non-negative-integer" },
    },
  },
  history: { required: [], fields: COMMON_CANON_PAYLOAD_FIELDS },
  species: { required: [], fields: COMMON_CANON_PAYLOAD_FIELDS },
  faction: { required: [], fields: COMMON_CANON_PAYLOAD_FIELDS },
  region: { required: [], fields: COMMON_CANON_PAYLOAD_FIELDS },
  timeline: { required: [], fields: COMMON_CANON_PAYLOAD_FIELDS },
  character: { required: [], fields: COMMON_CANON_PAYLOAD_FIELDS },
  event: {
    required: ["title", "regionId", "characterIds"],
    fields: {
      ...COMMON_CANON_PAYLOAD_FIELDS,
      characterIds: { kind: "id-list" },
      objectIds: { kind: "id-list" },
      eventType: { kind: "text" },
    },
  },
  object: {
    required: ["title"],
    fields: {
      ...COMMON_CANON_PAYLOAD_FIELDS,
      ownerCharacterId: { kind: "id" },
      relatedEventIds: { kind: "id-list" },
    },
  },
  mystery: {
    required: ["title"],
    fields: {
      ...COMMON_CANON_PAYLOAD_FIELDS,
      relatedEventIds: { kind: "id-list" },
      characterIds: { kind: "id-list" },
    },
  },
  "open-loop": {
    required: ["title", "relatedEventIds"],
    fields: {
      ...COMMON_CANON_PAYLOAD_FIELDS,
      relatedEventIds: { kind: "id-list" },
      characterIds: { kind: "id-list" },
      status: { kind: "enum", values: CANON_OPEN_LOOP_STATUS_VALUES },
    },
  },
  relation: {
    required: ["sourceCharacterId", "targetRefType", "targetRefId", "relationTypes"],
    fields: {
      ...COMMON_CANON_PAYLOAD_FIELDS,
      sourceCharacterId: { kind: "id" },
      targetRefType: { kind: "enum", values: CANON_REFERENCE_ENTITY_TYPE_VALUES },
      targetRefId: { kind: "id" },
      relationTypes: { kind: "id-list" },
      // OOC-080 — 관계 세기·기준 사건·공개 범위. 기존 edge 호환을 위해 required에는 넣지 않는다.
      strength: { kind: "non-negative-integer" },
      sinceEventId: { kind: "id" },
      visibility: { kind: "enum", values: CANON_RELATION_VISIBILITY_VALUES },
    },
  },
};

/**
 * Canon 본문은 공개 표현이 아니라 검증 가능한 구조화 데이터만 담는다.
 * 자유 필드는 authored metadata를 허용하되, publish validator가 위험한 mutation key를 차단한다.
 */
export interface CanonPayload {
  title?: string;
  summary?: string;
  description?: string;
  speciesIds?: string[];
  factionIds?: string[];
  regionIds?: string[];
  speciesId?: string;
  mechanicsSpeciesId?: string;
  factionId?: string;
  regionId?: string;
  prerequisiteIds?: string[];
  beforeIds?: string[];
  startOrder?: number;
  endOrder?: number;
  allowedKnowledge?: string[];
  forbiddenKnowledge?: string[];
  worldName?: string;
  premise?: string;
  rules?: string[];
  startingPlace?: string;
  firstEvent?: string;
  characterId?: string;
  rulesetUniverseId?: string;
  rulesetVersion?: number;
  characterIds?: string[];
  objectIds?: string[];
  relatedEventIds?: string[];
  ownerCharacterId?: string;
  sourceCharacterId?: string;
  targetRefType?: CanonReferenceEntityType;
  targetRefId?: string;
  relationTypes?: string[];
  strength?: number;
  sinceEventId?: string;
  visibility?: CanonRelationVisibility;
  eventType?: string;
  status?: CanonOpenLoopStatus;
  [key: string]: CanonPayloadValue | undefined;
}

export interface IUniverseCanonRevisionDoc {
  revisionId: string;
  universeId: string;
  layer: CanonLayer;
  entityType: CanonEntityType;
  entityId: string;
  revision: number;
  status: CanonRevisionStatus;
  payload: CanonPayload;
  payloadHash: string;
  createdBy: string;
  createdByType: CanonActorType;
  reviewedBy?: string;
  publishedBy?: string;
  publishedAt?: string | Date | null;
  supersedesRevision?: number | null;
  changelog?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IPersonalUniverseCanonRevisionDoc extends CanonGraphRevisionDoc {
  revisionId: string;
  namespace: "personal-universe";
  personalUniverseId: string;
  ownerUid: string;
  payloadHash: string;
  createdBy: string;
  createdByType: PersonalCanonActorType;
  reviewedBy?: string;
  publishedBy?: string;
  publishedAt?: string | Date | null;
  supersedesRevision?: number | null;
  changelog?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CanonRevisionDraftInput {
  universeId: string;
  namespace?: CanonNamespace;
  layer: CanonLayer;
  entityType: CanonEntityType;
  entityId: string;
  payload: CanonPayload;
  createdBy: string;
  createdByType: CanonActorType;
  changelog?: string;
  supersedesRevision?: number | null;
}

export interface CanonGraphValidationIssue {
  code: string;
  entityType?: CanonEntityType;
  entityId?: string;
  path?: string;
  message: string;
}
