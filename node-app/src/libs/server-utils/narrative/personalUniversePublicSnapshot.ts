import type {
  CanonPayload,
  IPersonalUniverseCanonRevisionDoc,
  PublicUniverseEntityType,
  PublicUniverseModerationResult,
  PublicUniverseSnapshotContent,
  PublicUniverseSnapshotEntity,
} from "types/game";
import {
  PUBLIC_UNIVERSE_ENTITY_TYPE_VALUES,
  PUBLIC_UNIVERSE_SNAPSHOT_SCHEMA_VERSION,
} from "types/game";

/**
 * @docHint
 * @purpose Personal Canon을 공개 Snapshot allowlist로 투영하고 사전 moderation한다.
 * @process latest published dedupe  denylist omission  public relation filter  minor/text safety gate
 * @domain narrative-canon.personal-universe.public
 * @scope server-pure
 */

export const PUBLIC_UNIVERSE_MODERATION_POLICY_VERSION = "public-universe-ugc-v1" as const;

export const PUBLIC_UNIVERSE_DENYLIST_KEYS = [
  "uid",
  "ownerUid",
  "accountId",
  "email",
  "prompt",
  "seed",
  "audit",
  "changelog",
  "tutorConversation",
  "learningRecord",
  "crossServiceMemory",
  "personalStory",
] as const;

const PUBLIC_ENTITY_SET = new Set<string>(PUBLIC_UNIVERSE_ENTITY_TYPE_VALUES);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function id(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value.trim()) ? value.trim() : "";
}

function idList(value: unknown, max = 30) {
  return Array.isArray(value) ? value.map(id).filter(Boolean).slice(0, max) : [];
}

function int(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function latestPublished(revisions: IPersonalUniverseCanonRevisionDoc[]) {
  const latest = new Map<string, IPersonalUniverseCanonRevisionDoc>();
  for (const revision of revisions) {
    if (revision.status !== "published") continue;
    const key = `${revision.entityType}:${revision.entityId}`;
    const current = latest.get(key);
    if (!current || revision.revision > current.revision) latest.set(key, revision);
  }
  return [...latest.values()];
}

function commonEntity(revision: IPersonalUniverseCanonRevisionDoc, payload: CanonPayload): PublicUniverseSnapshotEntity {
  return {
    entityType: revision.entityType as PublicUniverseEntityType,
    entityId: revision.entityId,
    title: text(payload.title, 180) || revision.entityId,
    ...(text(payload.summary, 600) ? { summary: text(payload.summary, 600) } : {}),
    ...(text(payload.description, 1200) ? { description: text(payload.description, 1200) } : {}),
    ...(id(payload.regionId) ? { regionId: id(payload.regionId) } : {}),
    ...(id(payload.factionId) ? { factionId: id(payload.factionId) } : {}),
    ...(idList(payload.characterIds).length ? { characterIds: idList(payload.characterIds) } : {}),
    ...(idList(payload.relatedEventIds).length ? { relatedEventIds: idList(payload.relatedEventIds) } : {}),
    ...(int(payload.startOrder) !== undefined ? { startOrder: int(payload.startOrder) } : {}),
    ...(int(payload.endOrder) !== undefined ? { endOrder: int(payload.endOrder) } : {}),
  };
}

function projectEntity(revision: IPersonalUniverseCanonRevisionDoc): PublicUniverseSnapshotEntity | null {
  const payload = revision.payload || {};
  if (!PUBLIC_ENTITY_SET.has(revision.entityType)) return null;
  if (revision.entityType === "relation" && payload.visibility !== "public") return null;
  const entity = commonEntity(revision, payload);

  if (revision.entityType === "core-law") {
    return {
      ...entity,
      title: text(payload.title, 180) || text(payload.worldName, 180) || revision.entityId,
      ...(text(payload.worldName, 180) ? { worldName: text(payload.worldName, 180) } : {}),
      ...(text(payload.premise, 1200) ? { premise: text(payload.premise, 1200) } : {}),
      ...(Array.isArray(payload.rules) ? { rules: payload.rules.filter((rule): rule is string => typeof rule === "string").map((rule) => rule.trim().slice(0, 300)).filter(Boolean).slice(0, 12) } : {}),
    };
  }

  if (revision.entityType === "relation") {
    const sourceCharacterId = id(payload.sourceCharacterId);
    const targetRefType = text(payload.targetRefType, 40);
    const targetRefId = id(payload.targetRefId);
    if (!sourceCharacterId || !targetRefType || !targetRefId) return null;
    return {
      ...entity,
      title: text(payload.title, 180) || `${sourceCharacterId} relationship`,
      sourceCharacterId,
      targetRefType,
      targetRefId,
      relationTypes: idList(payload.relationTypes, 8),
      ...(int(payload.strength) !== undefined ? { strength: Math.min(100, int(payload.strength) as number) } : {}),
      ...(id(payload.sinceEventId) ? { sinceEventId: id(payload.sinceEventId) } : {}),
    };
  }

  return entity;
}

function counts(entities: PublicUniverseSnapshotEntity[]) {
  return {
    characters: entities.filter((entity) => entity.entityType === "character").length,
    relations: entities.filter((entity) => entity.entityType === "relation").length,
    events: entities.filter((entity) => entity.entityType === "event").length,
    regions: entities.filter((entity) => entity.entityType === "region").length,
    factions: entities.filter((entity) => entity.entityType === "faction").length,
  };
}

export function buildPublicUniverseSnapshotContent(revisions: IPersonalUniverseCanonRevisionDoc[]): PublicUniverseSnapshotContent {
  const projected = latestPublished(revisions).map(projectEntity).filter((entity): entity is PublicUniverseSnapshotEntity => Boolean(entity));
  const publicKeys = new Set(projected.map((entity) => `${entity.entityType}:${entity.entityId}`));
  const entities = projected.filter((entity) => {
    if (entity.entityType !== "relation") return true;
    return Boolean(
      publicKeys.has(`character:${entity.sourceCharacterId}`) &&
      entity.targetRefType &&
      publicKeys.has(`${entity.targetRefType}:${entity.targetRefId}`),
    );
  });
  const coreLaw = entities.find((entity) => entity.entityType === "core-law");
  return {
    schemaVersion: PUBLIC_UNIVERSE_SNAPSHOT_SCHEMA_VERSION,
    worldName: coreLaw?.worldName || coreLaw?.title || "Personal Universe",
    premise: coreLaw?.premise || coreLaw?.summary || "",
    entities,
    counts: counts(entities),
  };
}

function textLeaves(value: unknown, path = "content"): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => textLeaves(item, `${path}.${index}`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => textLeaves(child, `${path}.${key}`));
  }
  return [];
}

const BLOCKED_TEXT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:porn|porno|nude|sexual|rape|gore)\b/i, "explicit_content"],
  [/(?:음란|성적 학대|강간|나체|고어|자해|자살|테러)/i, "safety_risk_content"],
  [/(?:https?:\/\/|www\.)/i, "external_url"],
  [/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i, "personal_contact"],
  [/(?:01[016789][- .]?\d{3,4}[- .]?\d{4})/i, "personal_phone"],
];

export function moderatePublicUniverseSnapshot(
  content: PublicUniverseSnapshotContent,
  input: { isMinor: boolean },
): PublicUniverseModerationResult {
  if (input.isMinor) {
    return { status: "blocked", policyVersion: PUBLIC_UNIVERSE_MODERATION_POLICY_VERSION, issues: ["minor_account_public_blocked"] };
  }
  const issues = new Set<string>();
  for (const leaf of textLeaves(content)) {
    for (const [pattern, code] of BLOCKED_TEXT_PATTERNS) {
      if (pattern.test(leaf.value)) issues.add(`${code}:${leaf.path}`);
    }
  }
  return {
    status: issues.size ? "rejected" : "approved",
    policyVersion: PUBLIC_UNIVERSE_MODERATION_POLICY_VERSION,
    issues: [...issues].slice(0, 20),
  };
}

/** 공개 응답에는 내부 owner/source/moderation/audit 메타데이터를 절대 포함하지 않는다. */
export function toPublicUniverseSnapshotResponse(input: {
  snapshotId: string;
  visibility: "link" | "public";
  publishedAt?: string | Date | null;
  content: PublicUniverseSnapshotContent;
}) {
  return {
    snapshotId: input.snapshotId,
    visibility: input.visibility,
    publishedAt: input.publishedAt || null,
    ...input.content,
  };
}
