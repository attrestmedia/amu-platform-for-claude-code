import type {
  CanonEntityType,
  CanonGraphValidationIssue,
  CanonPayload,
  IUniverseCanonRevisionDoc,
} from "types/game";
import { extractApiErrorMessage } from "utils/common/typeUtils";
import { toUnknownRecord } from "utils/common";

export type CanonAdminRevision = IUniverseCanonRevisionDoc;

export type CanonAdminResponse = {
  ok: boolean;
  data?: CanonAdminRevision[] | CanonAdminRevision;
  error?: { code?: string; detail?: CanonGraphValidationIssue[] };
};

export type CanonGraphReference = {
  source: CanonAdminRevision;
  path: string;
  targetType: CanonEntityType;
  targetId: string;
};

export const CANON_ENTITY_LABELS: Record<CanonEntityType, string> = {
  "core-law": "Core law",
  history: "History",
  species: "Species",
  faction: "Faction",
  region: "Region",
  timeline: "Timeline",
  character: "Character",
  event: "Event",
  object: "Object",
  mystery: "Mystery",
  "open-loop": "Open loop",
  relation: "Relation",
};

const REFERENCE_FIELDS: Record<string, CanonEntityType> = {
  speciesId: "species",
  factionId: "faction",
  regionId: "region",
  ownerCharacterId: "character",
  sourceCharacterId: "character",
  characterIds: "character",
  factionIds: "faction",
  regionIds: "region",
  objectIds: "object",
  relatedEventIds: "event",
  beforeIds: "timeline",
};

export function entityLabel(entityType: CanonEntityType) {
  return CANON_ENTITY_LABELS[entityType] || entityType;
}

export function latestRevisions(revisions: readonly CanonAdminRevision[]) {
  const latest = new Map<string, CanonAdminRevision>();
  for (const revision of revisions) {
    const key = `${revision.entityType}:${revision.entityId}`;
    const current = latest.get(key);
    if (!current || revision.revision > current.revision) latest.set(key, revision);
  }
  return [...latest.values()].sort((a, b) => a.entityType.localeCompare(b.entityType) || a.entityId.localeCompare(b.entityId));
}

export function revisionHistory(revisions: readonly CanonAdminRevision[], selected: CanonAdminRevision | null) {
  if (!selected) return [];
  return revisions
    .filter((revision) => revision.entityType === selected.entityType && revision.entityId === selected.entityId)
    .sort((a, b) => b.revision - a.revision);
}

export function payloadText(payload: CanonPayload | undefined) {
  return JSON.stringify(payload || {}, null, 2);
}

function addReferences(
  source: CanonAdminRevision,
  path: string,
  targetType: CanonEntityType,
  rawValue: unknown,
  output: CanonGraphReference[],
) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  values.forEach((value) => {
    if (typeof value === "string" && value.trim()) output.push({ source, path, targetType, targetId: value.trim() });
  });
}

export function referencesForRevision(source: CanonAdminRevision) {
  const output: CanonGraphReference[] = [];
  for (const [field, targetType] of Object.entries(REFERENCE_FIELDS)) {
    addReferences(source, `payload.${field}`, targetType, source.payload[field], output);
  }
  if (source.entityType === "relation" && typeof source.payload.targetRefType === "string" && typeof source.payload.targetRefId === "string") {
    addReferences(source, "payload.targetRefId", source.payload.targetRefType as CanonEntityType, source.payload.targetRefId, output);
  }
  return output;
}

export function formatRevisionDate(value: string | Date | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function readCanonError(error: unknown) {
  const root = toUnknownRecord(error);
  const response = toUnknownRecord(root.response);
  const body = toUnknownRecord(root.data || response.data);
  const apiError = toUnknownRecord(body.error);
  const rawDetail = apiError.detail;
  const issues: CanonGraphValidationIssue[] = Array.isArray(rawDetail)
    ? rawDetail.filter((item): item is CanonGraphValidationIssue => {
        const record = toUnknownRecord(item);
        return typeof record.message === "string";
      })
    : [];
  return {
    code: typeof apiError.code === "string" ? apiError.code : "CANON_REQUEST_FAILED",
    issues,
    message: apiError.code ? String(apiError.code) : extractApiErrorMessage(error, "Canon 요청에 실패했습니다."),
  };
}
