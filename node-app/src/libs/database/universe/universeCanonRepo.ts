import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { UniverseCanonRevisionSchema, type IUniverseCanonRevisionDocument } from "models/universe";
import { isCanonRevisionTransitionAllowed } from "types/game";
import type { CanonRevisionDraftInput, CanonRevisionStatus, IUniverseCanonRevisionDoc } from "types/game";
import { isCanonWriteAllowed } from "libs/server-utils/narrative/canonValidator";
import { validateCanonGraph, validateCanonPayload } from "libs/server-utils/narrative/canonValidator";
import { validateOfficialCharacterGraph } from "libs/server-utils/narrative/officialCharacterGraph";

/**
 * @docHint
 * @purpose Universe Canon revision repository
 * @process draft 생성  review/publish 상태 전이  published snapshot 조회
 * @domain narrative-canon
 * @scope database
 */

const COLLECTION = "universe_canon_revisions";

function safeId(value: unknown, max = 120) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= max && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized) ? normalized : "";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function repoError(code: string, detail?: unknown) {
  const error = new Error(code) as Error & { code: string; detail?: unknown };
  error.code = code;
  error.detail = detail;
  return error;
}

async function getUniverseCanonModel() {
  return getModel<IUniverseCanonRevisionDocument>(MONGODB_AMU_URL, "UniverseCanonRevision", UniverseCanonRevisionSchema, COLLECTION);
}

export async function getUniverseCanonRevision(revisionId: string) {
  const normalized = safeId(revisionId);
  if (!normalized) return null;
  return (await getUniverseCanonModel()).findOne({ revisionId: normalized }).lean<IUniverseCanonRevisionDoc | null>();
}

export async function listUniverseCanonRevisions(args: {
  universeId: string;
  statuses?: CanonRevisionStatus[];
  entityType?: string;
  limit?: number;
}) {
  const universeId = safeId(args.universeId);
  if (!universeId) return [];
  const query: Record<string, unknown> = { universeId };
  if (args.statuses?.length) query.status = { $in: args.statuses };
  if (args.entityType) query.entityType = safeId(args.entityType);
  return (await getUniverseCanonModel())
    .find(query)
    .sort({ entityType: 1, entityId: 1, revision: -1 })
    .limit(Math.max(1, Math.min(2000, Number(args.limit || 500))))
    .lean<IUniverseCanonRevisionDoc[]>();
}

export async function listPublishedUniverseCanon(universeId: string) {
  return listUniverseCanonRevisions({ universeId, statuses: ["published"], limit: 2000 });
}

export async function createUniverseCanonDraft(input: CanonRevisionDraftInput) {
  const universeId = safeId(input.universeId);
  const entityId = safeId(input.entityId);
  const createdBy = safeId(input.createdBy, 160);
  if (!universeId || !entityId || !createdBy) throw repoError("CANON_INPUT_INVALID");
  if (input.createdByType === "ai") throw repoError("CANON_AI_WRITE_FORBIDDEN");
  const namespace = input.namespace || "official";
  if (namespace !== "official" || !isCanonWriteAllowed({ namespace, entityType: input.entityType, actorType: input.createdByType, actorId: createdBy })) {
    throw repoError("CANON_WRITE_ACTOR_FORBIDDEN");
  }

  const payloadIssues = validateCanonPayload(input.entityType, input.payload, entityId);
  if (payloadIssues.length) throw repoError("CANON_PAYLOAD_INVALID", payloadIssues);

  const model = await getUniverseCanonModel();
  const latest = await model
    .findOne({ universeId, entityType: input.entityType, entityId })
    .sort({ revision: -1 })
    .lean<IUniverseCanonRevisionDoc | null>();
  const latestPublished = await model
    .findOne({ universeId, entityType: input.entityType, entityId, status: "published" })
    .sort({ revision: -1 })
    .lean<IUniverseCanonRevisionDoc | null>();
  const revision = Number(latest?.revision || 0) + 1;
  const doc = await model.create({
    revisionId: `canon_${randomUUID().replace(/-/g, "")}`,
    universeId,
    layer: input.layer,
    entityType: input.entityType,
    entityId,
    revision,
    status: "draft",
    payload: input.payload,
    payloadHash: createHash("sha256").update(stableJson(input.payload), "utf8").digest("hex"),
    createdBy,
    createdByType: input.createdByType,
    supersedesRevision: latestPublished?.revision || input.supersedesRevision || null,
    changelog: String(input.changelog || "").trim().slice(0, 2000),
  });
  return (doc.toObject?.() ?? doc) as IUniverseCanonRevisionDoc;
}

export async function transitionUniverseCanonRevision(args: {
  revisionId: string;
  to: CanonRevisionStatus;
  actorId: string;
  actorType: "admin" | "system" | "ai";
}) {
  const revisionId = safeId(args.revisionId);
  const actorId = safeId(args.actorId, 160);
  if (!revisionId || !actorId || args.actorType === "ai") throw repoError("CANON_PUBLISH_ACTOR_FORBIDDEN");

  const model = await getUniverseCanonModel();
  const current = await model.findOne({ revisionId }).lean<IUniverseCanonRevisionDoc | null>();
  if (!current) throw repoError("CANON_REVISION_NOT_FOUND");
  if (!isCanonRevisionTransitionAllowed(current.status, args.to)) throw repoError("CANON_STATUS_TRANSITION_INVALID");
  if (args.to === "published" && args.actorType !== "admin") throw repoError("CANON_PUBLISH_ADMIN_REQUIRED");

  if (args.to === "published") {
    const published = await listPublishedUniverseCanon(current.universeId);
    const latestPublished = published
      .filter((item) => item.entityType === current.entityType && item.entityId === current.entityId)
      .sort((a, b) => b.revision - a.revision)[0];
    if (latestPublished && current.supersedesRevision !== latestPublished.revision) {
      throw repoError("CANON_PUBLISH_STALE_REVISION", { expected: latestPublished.revision, actual: current.supersedesRevision });
    }
    const candidate: IUniverseCanonRevisionDoc = { ...current, status: "published", publishedBy: actorId };
    const issues = validateCanonGraph([...published, candidate]);
    if (issues.length) throw repoError("CANON_GRAPH_CONFLICT", issues);
    // OOC-080 — relation edge가 없으면 issue를 만들지 않으므로 기존 entity의 publish 동작은 그대로다.
    const graphIssues = validateOfficialCharacterGraph([...published, candidate]);
    if (graphIssues.length) throw repoError("CANON_CHARACTER_GRAPH_CONFLICT", graphIssues);
  }

  const update: Record<string, unknown> = { status: args.to };
  if (args.to === "review") update.reviewedBy = actorId;
  if (args.to === "published") {
    update.publishedBy = actorId;
    update.publishedAt = new Date();
  }
  const updated = await model
    .findOneAndUpdate({ revisionId, status: current.status }, { $set: update }, { new: true })
    .lean<IUniverseCanonRevisionDoc | null>();
  if (!updated) throw repoError("CANON_REVISION_STATE_CONFLICT");
  return updated;
}
