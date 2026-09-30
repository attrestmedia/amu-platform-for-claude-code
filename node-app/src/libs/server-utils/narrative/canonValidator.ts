import { CANON_ENTITY_LAYER, CANON_ENTITY_PAYLOAD_SCHEMAS, CANON_REFERENCE_ENTITY_TYPE_VALUES } from "types/game";
import { CHARACTER_SPECIES_IDS } from "consts/game/characterGenesisPolicy";
import type {
  CanonGraphRevisionDoc,
  CanonEntityType,
  CanonGraphValidationIssue,
  CanonNamespace,
  CanonPayload,
} from "types/game";

/**
 * @docHint
 * @purpose Canon payload와 entity graph의 publish 전 검증
 * @process namespace 검사  참조 무결성 검사  timeline cycle 검사
 * @domain narrative-canon
 * @scope server
 */

export type CanonWriteActorKind = "admin" | "owner" | "system" | "ai";

/**
 * namespace별 write 경계. official의 기존 경로는 admin만, personal-universe의
 * relation/open-loop를 포함한 사용자 저작은 owner만 허용한다.
 */
export function isCanonWriteAllowed(input: {
  namespace: CanonNamespace;
  entityType: CanonEntityType;
  actorType: CanonWriteActorKind;
  actorId: string;
  ownerUid?: string;
}): boolean {
  if (!input.actorId.trim() || input.actorType === "ai" || input.actorType === "system") return false;
  if (input.namespace === "official") return input.actorType === "admin";
  return input.actorType === "owner" && Boolean(input.ownerUid?.trim()) && input.actorId.trim() === input.ownerUid?.trim();
}

const FORBIDDEN_PUBLISH_KEYS = new Set([
  "rarity",
  "rarityTier",
  "stats",
  "statBudget",
  "rollId",
  "randomSeed",
  "systemPrompt",
  "prompt",
  "publishedAt",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id) ? id : "";
}

function stringArray(value: unknown, path: string, issues: CanonGraphValidationIssue[]) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ code: "CANON_ARRAY_REQUIRED", path, message: `${path} must be an array` });
    return [];
  }
  const values = value.map(safeId);
  if (values.some((item) => !item)) {
    issues.push({ code: "CANON_ID_INVALID", path, message: `${path} contains an invalid ID` });
  }
  if (new Set(values).size !== values.length) {
    issues.push({ code: "CANON_ID_DUPLICATE", path, message: `${path} contains duplicate IDs` });
  }
  return values.filter(Boolean);
}

function visitForbiddenKeys(value: unknown, path: string, issues: CanonGraphValidationIssue[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitForbiddenKeys(item, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PUBLISH_KEYS.has(key)) {
      issues.push({ code: "CANON_FORBIDDEN_MUTATION_FIELD", path: `${path}.${key}`, message: `${key} is not a Canon field` });
    }
    visitForbiddenKeys(child, `${path}.${key}`, issues);
  }
}

function validateSchemaFields(
  entityType: CanonEntityType,
  payload: CanonPayload,
  entityId: string,
  issues: CanonGraphValidationIssue[],
) {
  const schema = CANON_ENTITY_PAYLOAD_SCHEMAS[entityType];
  if (!schema) {
    issues.push({ code: "CANON_ENTITY_TYPE_INVALID", entityType, entityId, message: `${entityType} is not a supported Canon entity type` });
    return;
  }

  for (const key of schema.required) {
    const value = payload[key];
    const emptyList = Array.isArray(value) && value.length === 0;
    if (value === undefined || value === null || value === "" || emptyList) {
      issues.push({ code: "CANON_REQUIRED_FIELD", entityType, entityId, path: `payload.${key}`, message: `${key} is required for ${entityType}` });
    }
  }

  for (const [key, field] of Object.entries(schema.fields)) {
    const value = payload[key];
    if (value === undefined) continue;
    if (field.kind === "text") {
      if (typeof value !== "string") {
        issues.push({ code: "CANON_TEXT_REQUIRED", entityType, entityId, path: `payload.${key}`, message: `${key} must be a string` });
      }
      continue;
    }
    if (field.kind === "id") {
      if (!safeId(value)) {
        issues.push({ code: "CANON_REFERENCE_INVALID", entityType, entityId, path: `payload.${key}`, message: `${key} must be a valid ID` });
      }
      continue;
    }
    if (field.kind === "id-list") {
      stringArray(value, `payload.${key}`, issues);
      continue;
    }
    if (field.kind === "text-list") {
      if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
        issues.push({ code: "CANON_TEXT_ARRAY_REQUIRED", entityType, entityId, path: `payload.${key}`, message: `${key} must be a non-empty text array` });
      }
      continue;
    }
    if (field.kind === "non-negative-integer") {
      if (!Number.isInteger(value) || Number(value) < 0) {
        issues.push({ code: key === "startOrder" || key === "endOrder" ? "CANON_ORDER_INVALID" : "CANON_INTEGER_INVALID", entityType, entityId, path: `payload.${key}`, message: `${key} must be a non-negative integer` });
      }
      continue;
    }
    if (field.kind === "enum" && (!field.values?.includes(String(value)) || typeof value !== "string")) {
      issues.push({ code: "CANON_ENUM_INVALID", entityType, entityId, path: `payload.${key}`, message: `${key} is not an allowed value` });
    }
  }
}

export function validateCanonPayload(
  entityType: CanonEntityType,
  payload: CanonPayload,
  entityId = "",
): CanonGraphValidationIssue[] {
  const issues: CanonGraphValidationIssue[] = [];
  if (!isRecord(payload)) {
    return [{ code: "CANON_PAYLOAD_OBJECT_REQUIRED", entityType, entityId, message: "Canon payload must be an object" }];
  }

  visitForbiddenKeys(payload, "payload", issues);
  validateSchemaFields(entityType, payload, entityId, issues);
  if (Number.isInteger(payload.startOrder) && Number.isInteger(payload.endOrder) && Number(payload.startOrder) > Number(payload.endOrder)) {
    issues.push({ code: "CANON_TIMELINE_RANGE_INVALID", entityType, entityId, message: "timeline startOrder must not exceed endOrder" });
  }
  return issues;
}

function latestByEntity(revisions: readonly CanonGraphRevisionDoc[]) {
  const latest = new Map<string, CanonGraphRevisionDoc>();
  for (const revision of revisions) {
    const key = `${revision.entityType}:${revision.entityId}`;
    const current = latest.get(key);
    if (!current || revision.revision > current.revision) latest.set(key, revision);
  }
  return [...latest.values()];
}

function assertReference(
  revisions: readonly CanonGraphRevisionDoc[],
  entity: CanonGraphRevisionDoc,
  key: string,
  targetType: CanonEntityType,
  issues: CanonGraphValidationIssue[],
) {
  const targetIds = new Set(revisions.filter((item) => item.entityType === targetType).map((item) => item.entityId));
  const raw = entity.payload[key];
  const values = Array.isArray(raw) ? raw.map(safeId) : [safeId(raw)];
  for (const value of values.filter(Boolean)) {
    if (!targetIds.has(value)) {
      issues.push({
        code: "CANON_REFERENCE_NOT_FOUND",
        entityType: entity.entityType,
        entityId: entity.entityId,
        path: `payload.${key}`,
        message: `${key} references missing ${targetType}:${value}`,
      });
    }
  }
}

export function validateCanonGraph(revisions: readonly CanonGraphRevisionDoc[]): CanonGraphValidationIssue[] {
  const issues: CanonGraphValidationIssue[] = [];
  const latest = latestByEntity(revisions.filter((item) => item.status === "published" || item.status === "review" || item.status === "draft"));
  const keys = new Set<string>();

  for (const entity of latest) {
    const key = `${entity.entityType}:${entity.entityId}`;
    if (keys.has(key)) {
      issues.push({ code: "CANON_ENTITY_DUPLICATE", entityType: entity.entityType, entityId: entity.entityId, message: `duplicate Canon entity ${key}` });
    }
    keys.add(key);
    if (CANON_ENTITY_LAYER[entity.entityType] !== entity.layer) {
      issues.push({ code: "CANON_LAYER_MISMATCH", entityType: entity.entityType, entityId: entity.entityId, message: `${entity.entityType} must belong to ${CANON_ENTITY_LAYER[entity.entityType]}` });
    }
    issues.push(...validateCanonPayload(entity.entityType, entity.payload, entity.entityId));
  }

  for (const entity of latest) {
    if (entity.entityType === "character") {
      assertReference(latest, entity, "speciesId", "species", issues);
      assertReference(latest, entity, "factionId", "faction", issues);
      assertReference(latest, entity, "regionId", "region", issues);
    }
    if (entity.entityType === "faction") assertReference(latest, entity, "regionId", "region", issues);
    if (entity.entityType === "timeline") assertReference(latest, entity, "beforeIds", "timeline", issues);
    if (entity.entityType === "event") {
      assertReference(latest, entity, "regionId", "region", issues);
      assertReference(latest, entity, "characterIds", "character", issues);
      assertReference(latest, entity, "objectIds", "object", issues);
    }
    if (entity.entityType === "object") {
      assertReference(latest, entity, "ownerCharacterId", "character", issues);
      assertReference(latest, entity, "regionId", "region", issues);
      assertReference(latest, entity, "relatedEventIds", "event", issues);
    }
    if (entity.entityType === "mystery") {
      assertReference(latest, entity, "relatedEventIds", "event", issues);
      assertReference(latest, entity, "characterIds", "character", issues);
    }
    if (entity.entityType === "open-loop") {
      assertReference(latest, entity, "relatedEventIds", "event", issues);
      assertReference(latest, entity, "characterIds", "character", issues);
    }
    if (entity.entityType === "relation") {
      assertReference(latest, entity, "sourceCharacterId", "character", issues);
      const targetType = entity.payload.targetRefType;
      if (typeof targetType === "string" && CANON_REFERENCE_ENTITY_TYPE_VALUES.includes(targetType as (typeof CANON_REFERENCE_ENTITY_TYPE_VALUES)[number])) {
        assertReference(latest, entity, "targetRefId", targetType as CanonEntityType, issues);
      }
    }
  }

  const timelineGraph = new Map<string, string[]>();
  for (const entity of latest.filter((item) => item.entityType === "timeline")) {
    timelineGraph.set(entity.entityId, Array.isArray(entity.payload.beforeIds) ? entity.payload.beforeIds.map(safeId).filter(Boolean) : []);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      issues.push({ code: "CANON_TIMELINE_CYCLE", entityType: "timeline", entityId: id, message: "timeline beforeIds contains a cycle" });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of timelineGraph.get(id) || []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of timelineGraph.keys()) visit(id);
  return issues;
}

/** Personal Canon은 lore ID와 별개로 genesis mechanics 종족을 명시해야 한다. */
export function validatePersonalCanonGraph(revisions: readonly CanonGraphRevisionDoc[]): CanonGraphValidationIssue[] {
  const issues = validateCanonGraph(revisions);
  for (const entity of revisions) {
    if (entity.status !== "published" && entity.status !== "review" && entity.status !== "draft") continue;
    if (entity.entityType !== "species") continue;
    const mechanicsSpeciesId = entity.payload.mechanicsSpeciesId;
    if (typeof mechanicsSpeciesId !== "string" || !CHARACTER_SPECIES_IDS.includes(mechanicsSpeciesId as (typeof CHARACTER_SPECIES_IDS)[number])) {
      issues.push({
        code: "PERSONAL_CANON_MECHANICS_SPECIES_INVALID",
        entityType: entity.entityType,
        entityId: entity.entityId,
        path: "payload.mechanicsSpeciesId",
        message: "personal species must declare a supported mechanicsSpeciesId",
      });
    }
  }
  return issues;
}
