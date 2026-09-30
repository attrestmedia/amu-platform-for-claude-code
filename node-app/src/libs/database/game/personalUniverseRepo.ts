import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  PersonalUniverseCanonRevisionSchema,
  PersonalUniverseSchema,
  type IPersonalUniverseCanonRevisionDocument,
  type IPersonalUniverseDocument,
} from "models/game";
import {
  isCanonRevisionTransitionAllowed,
  type CanonEntityType,
  type CanonGraphRevisionDoc,
  type CanonLayer,
  type CanonPayload,
  type CanonRevisionStatus,
  type IPersonalUniverseDoc,
  type IPersonalUniverseCanonRevisionDoc,
  type PersonalUniverseOfficialCanonReference,
  type WorldSeedPayload,
  type PersonalCharacterJoinProposal,
} from "types/game";
import { isCanonWriteAllowed, validateCanonPayload, validatePersonalCanonGraph } from "libs/server-utils/narrative/canonValidator";
import { validatePersonalCanonCommand } from "libs/server-utils/narrative/personalCanonConflictValidator";

/**
 * @docHint
 * @purpose Personal Universe와 personal-universe Canon 저장 경계
 * @process uid 소유권 1세계 제약  별도 collection revision  personal-only graph validation
 * @domain narrative-canon.personal-universe
 * @scope server
 */

const PERSONAL_UNIVERSE_COLLECTION = "personal_universes";
const PERSONAL_CANON_COLLECTION = "personal_universe_canon_revisions";

function safeId(value: unknown, max = 160) {
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

function duplicate(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export async function getPersonalUniverseModel(): Promise<Model<IPersonalUniverseDocument>> {
  return getModel<IPersonalUniverseDocument>(MONGODB_GAME_URL, "PersonalUniverse", PersonalUniverseSchema, PERSONAL_UNIVERSE_COLLECTION);
}

export async function getPersonalCanonModel(): Promise<Model<IPersonalUniverseCanonRevisionDocument>> {
  return getModel<IPersonalUniverseCanonRevisionDocument>(
    MONGODB_GAME_URL,
    "PersonalUniverseCanonRevision",
    PersonalUniverseCanonRevisionSchema,
    PERSONAL_CANON_COLLECTION,
  );
}

export async function getPersonalUniverseByUid(uidInput: string, options?: { includeArchived?: boolean }) {
  const uid = safeId(uidInput);
  if (!uid) return null;
  const query: Record<string, unknown> = { uid };
  if (!options?.includeArchived) query.status = "active";
  return (await getPersonalUniverseModel()).findOne(query).lean<IPersonalUniverseDoc | null>();
}

export async function getPersonalUniverse(personalUniverseIdInput: string) {
  const personalUniverseId = safeId(personalUniverseIdInput);
  if (!personalUniverseId) return null;
  return (await getPersonalUniverseModel()).findOne({ personalUniverseId }).lean<IPersonalUniverseDoc | null>();
}

export async function getPersonalUniverseForOwner(personalUniverseIdInput: string, ownerUidInput: string) {
  const personalUniverseId = safeId(personalUniverseIdInput);
  const ownerUid = safeId(ownerUidInput);
  if (!personalUniverseId || !ownerUid) return null;
  return (await getPersonalUniverseModel()).findOne({ personalUniverseId, uid: ownerUid }).lean<IPersonalUniverseDoc | null>();
}

/** uid당 active Personal Universe 하나를 DB partial unique index와 함께 보장한다. */
export async function createPersonalUniverse(input: { uid: string; rulesetUniverseId: string; personalUniverseId?: string }) {
  const uid = safeId(input.uid);
  const rulesetUniverseId = safeId(input.rulesetUniverseId);
  const personalUniverseId = safeId(input.personalUniverseId) || `pu_${randomUUID().replace(/-/g, "")}`;
  if (!uid || !rulesetUniverseId) throw repoError("PERSONAL_UNIVERSE_INPUT_INVALID");

  const existing = await getPersonalUniverseByUid(uid);
  if (existing) return existing;

  try {
    const created = await (await getPersonalUniverseModel()).create({
      uid,
      personalUniverseId,
      status: "active",
      visibility: "private",
      rulesetUniverseId,
      referencedOfficialCanon: [],
    });
    return (created.toObject?.() ?? created) as IPersonalUniverseDoc;
  } catch (error) {
    if (duplicate(error)) {
      const concurrent = await getPersonalUniverseByUid(uid);
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

export async function updatePersonalUniverseOfficialReferences(input: {
  personalUniverseId: string;
  ownerUid: string;
  references: PersonalUniverseOfficialCanonReference[];
}) {
  const personalUniverseId = safeId(input.personalUniverseId);
  const ownerUid = safeId(input.ownerUid);
  if (!personalUniverseId || !ownerUid || !Array.isArray(input.references) || input.references.length > 50) {
    throw repoError("PERSONAL_UNIVERSE_REFERENCE_INPUT_INVALID");
  }
  const references = input.references.map((reference) => ({
    officialUniverseId: safeId(reference.officialUniverseId),
    entityType: reference.entityType,
    entityId: safeId(reference.entityId),
    revision: Number(reference.revision),
    declaredAt: reference.declaredAt || new Date(),
  }));
  if (references.some((reference) => !reference.officialUniverseId || !reference.entityId || !Number.isInteger(reference.revision) || reference.revision < 1)) {
    throw repoError("PERSONAL_UNIVERSE_REFERENCE_INVALID");
  }
  const dedupeKeys = references.map((reference) => `${reference.officialUniverseId}:${reference.entityType}:${reference.entityId}:${reference.revision}`);
  if (new Set(dedupeKeys).size !== dedupeKeys.length) throw repoError("PERSONAL_UNIVERSE_REFERENCE_DUPLICATE");

  const updated = await (await getPersonalUniverseModel()).findOneAndUpdate(
    { personalUniverseId, uid: ownerUid, status: "active" },
    { $set: { referencedOfficialCanon: references } },
    { new: true, runValidators: true },
  ).lean<IPersonalUniverseDoc | null>();
  if (!updated) throw repoError("PERSONAL_UNIVERSE_NOT_FOUND_OR_FORBIDDEN");
  return updated;
}

export async function listPersonalUniverseCanonRevisions(input: {
  personalUniverseId: string;
  ownerUid?: string;
  statuses?: CanonRevisionStatus[];
  entityType?: CanonEntityType;
  limit?: number;
}) {
  const personalUniverseId = safeId(input.personalUniverseId);
  if (!personalUniverseId) return [];
  const universe = input.ownerUid
    ? await getPersonalUniverseForOwner(personalUniverseId, input.ownerUid)
    : await getPersonalUniverse(personalUniverseId);
  if (!universe || (input.ownerUid && universe.uid !== safeId(input.ownerUid))) return [];
  const query: Record<string, unknown> = { personalUniverseId };
  if (input.statuses?.length) query.status = { $in: input.statuses };
  if (input.entityType) query.entityType = input.entityType;
  return (await getPersonalCanonModel())
    .find(query)
    .sort({ entityType: 1, entityId: 1, revision: -1 })
    .limit(Math.max(1, Math.min(2000, Number(input.limit || 500))))
    .lean<IPersonalUniverseCanonRevisionDoc[]>();
}

export async function listPublishedPersonalUniverseCanon(personalUniverseId: string, ownerUid?: string) {
  return listPersonalUniverseCanonRevisions({ personalUniverseId, ownerUid, statuses: ["published"], limit: 2000 });
}

export async function getPersonalUniverseCanonRevision(input: {
  personalUniverseId: string;
  ownerUid: string;
  entityType: CanonEntityType;
  entityId: string;
  status?: CanonRevisionStatus;
}) {
  const universe = await getPersonalUniverseForOwner(input.personalUniverseId, input.ownerUid);
  if (!universe) return null;
  const query: Record<string, unknown> = {
    personalUniverseId: safeId(input.personalUniverseId),
    ownerUid: safeId(input.ownerUid),
    entityType: input.entityType,
    entityId: safeId(input.entityId),
  };
  if (input.status) query.status = input.status;
  return (await getPersonalCanonModel()).findOne(query).sort({ revision: -1 }).lean<IPersonalUniverseCanonRevisionDoc | null>();
}

/** World Seed 승인은 owner의 단일 Canon Command로만 private Personal Universe에 반영한다. */
export async function publishWorldSeedCanon(input: {
  ownerUid: string;
  rulesetUniverseId: string;
  characterId: string;
  characterName?: string;
  payload: WorldSeedPayload;
}) {
  const universe = await createPersonalUniverse({ uid: input.ownerUid, rulesetUniverseId: input.rulesetUniverseId });
  const entityId = `world-seed:${input.characterId}`;
  const characterRevision = await publishPersonalCharacterIdentity({
    personalUniverseId: universe.personalUniverseId,
    ownerUid: input.ownerUid,
    characterId: input.characterId,
    characterName: input.characterName || input.characterId,
  });
  const existingPublished = await getPersonalUniverseCanonRevision({
    personalUniverseId: universe.personalUniverseId,
    ownerUid: input.ownerUid,
    entityType: "core-law",
    entityId,
    status: "published",
  });
  if (existingPublished) return { universe, revision: existingPublished, characterRevision, created: false };

  const latest = await getPersonalUniverseCanonRevision({
    personalUniverseId: universe.personalUniverseId,
    ownerUid: input.ownerUid,
    entityType: "core-law",
    entityId,
  });
  let revision = latest;
  if (!revision || revision.status === "archived" || revision.status === "deprecated") {
    revision = await createPersonalUniverseCanonDraft({
      personalUniverseId: universe.personalUniverseId,
      ownerUid: input.ownerUid,
      layer: "C0",
      entityType: "core-law",
      entityId,
      payload: input.payload as CanonPayload,
      supersedesRevision: latest?.revision || null,
      changelog: "World Seed owner approval",
    });
  }
  if (revision.status === "draft") revision = await transitionPersonalUniverseCanonRevision({ revisionId: revision.revisionId, to: "review", ownerUid: input.ownerUid });
  if (revision.status === "review") revision = await transitionPersonalUniverseCanonRevision({ revisionId: revision.revisionId, to: "published", ownerUid: input.ownerUid });
  return { universe, revision, characterRevision, created: true };
}

async function publishPersonalCharacterIdentity(input: {
  personalUniverseId: string;
  ownerUid: string;
  characterId: string;
  characterName: string;
}) {
  const existingPublished = await getPersonalUniverseCanonRevision({
    personalUniverseId: input.personalUniverseId,
    ownerUid: input.ownerUid,
    entityType: "character",
    entityId: input.characterId,
    status: "published",
  });
  if (existingPublished) return existingPublished;
  let revision = await getPersonalUniverseCanonRevision({
    personalUniverseId: input.personalUniverseId,
    ownerUid: input.ownerUid,
    entityType: "character",
    entityId: input.characterId,
  });
  if (!revision || revision.status === "archived" || revision.status === "deprecated") {
    revision = await createPersonalUniverseCanonDraft({
      personalUniverseId: input.personalUniverseId,
      ownerUid: input.ownerUid,
      layer: "C3",
      entityType: "character",
      entityId: input.characterId,
      payload: { title: input.characterName, characterId: input.characterId },
      changelog: "Personal character membership owner approval",
      supersedesRevision: revision?.revision || null,
    });
  }
  if (revision.status === "draft") revision = await transitionPersonalUniverseCanonRevision({ revisionId: revision.revisionId, to: "review", ownerUid: input.ownerUid });
  if (revision.status === "review") revision = await transitionPersonalUniverseCanonRevision({ revisionId: revision.revisionId, to: "published", ownerUid: input.ownerUid });
  return revision;
}

export async function publishPersonalCharacterJoin(input: {
  ownerUid: string;
  proposal: PersonalCharacterJoinProposal;
}) {
  const universe = await getPersonalUniverseForOwner(input.proposal.ownerUid, input.ownerUid);
  if (!universe || input.proposal.ownerUid !== input.ownerUid) throw repoError("PERSONAL_CHARACTER_JOIN_OWNER_FORBIDDEN");
  const published = await listPublishedPersonalUniverseCanon(universe.personalUniverseId, input.ownerUid);
  const existingCharacter = published.find((item) => item.entityType === "character" && item.entityId === input.proposal.characterId);
  const existingRelation = published.find((item) => item.entityType === "relation" && item.entityId === input.proposal.relationEntityId);
  const candidateCharacter: CanonGraphRevisionDoc = existingCharacter || {
    layer: "C3",
    entityType: "character",
    entityId: input.proposal.characterId,
    revision: 1,
    status: "published",
    payload: input.proposal.characterPayload,
  };
  const candidateRelation: CanonGraphRevisionDoc = existingRelation || {
    layer: "C3",
    entityType: "relation",
    entityId: input.proposal.relationEntityId,
    revision: 1,
    status: "published",
    payload: input.proposal.relationPayload,
  };
  const validation = validatePersonalCanonCommand({
    revisions: [...published.filter((item) => item !== existingCharacter && item !== existingRelation), candidateCharacter, candidateRelation] as CanonGraphRevisionDoc[],
  });
  if (!validation.ok) throw repoError("PERSONAL_CHARACTER_JOIN_CONFLICT", validation.conflicts);

  const characterRevision = existingCharacter || await publishPersonalCharacterIdentity({
    personalUniverseId: universe.personalUniverseId,
    ownerUid: input.ownerUid,
    characterId: input.proposal.characterId,
    characterName: input.proposal.characterName,
  });
  let relationRevision = existingRelation;
  if (!relationRevision) {
    relationRevision = await createPersonalUniverseCanonDraft({
      personalUniverseId: universe.personalUniverseId,
      ownerUid: input.ownerUid,
      layer: "C3",
      entityType: "relation",
      entityId: input.proposal.relationEntityId,
      payload: input.proposal.relationPayload,
      changelog: "Personal character join owner approval",
    });
    relationRevision = await transitionPersonalUniverseCanonRevision({ revisionId: relationRevision.revisionId, to: "review", ownerUid: input.ownerUid });
    relationRevision = await transitionPersonalUniverseCanonRevision({ revisionId: relationRevision.revisionId, to: "published", ownerUid: input.ownerUid });
  }
  return { universe, characterRevision, relationRevision, created: !existingRelation };
}

export async function createPersonalUniverseCanonDraft(input: {
  personalUniverseId: string;
  ownerUid: string;
  layer: CanonLayer;
  entityType: CanonEntityType;
  entityId: string;
  payload: CanonPayload;
  changelog?: string;
  supersedesRevision?: number | null;
}) {
  const personalUniverseId = safeId(input.personalUniverseId);
  const ownerUid = safeId(input.ownerUid);
  const entityId = safeId(input.entityId);
  if (!personalUniverseId || !ownerUid || !entityId) throw repoError("PERSONAL_CANON_INPUT_INVALID");
  const universe = await getPersonalUniverse(personalUniverseId);
  if (!universe || universe.uid !== ownerUid || universe.status !== "active") throw repoError("PERSONAL_CANON_OWNER_FORBIDDEN");
  if (!isCanonWriteAllowed({ namespace: "personal-universe", entityType: input.entityType, actorType: "owner", actorId: ownerUid, ownerUid })) {
    throw repoError("PERSONAL_CANON_WRITE_FORBIDDEN");
  }

  const payloadIssues = validateCanonPayload(input.entityType, input.payload, entityId);
  if (payloadIssues.length) throw repoError("PERSONAL_CANON_PAYLOAD_INVALID", payloadIssues);
  if (input.entityType === "species" && !input.payload.mechanicsSpeciesId) {
    throw repoError("PERSONAL_CANON_MECHANICS_SPECIES_REQUIRED");
  }

  const model = await getPersonalCanonModel();
  const latest = await model.findOne({ personalUniverseId, entityType: input.entityType, entityId }).sort({ revision: -1 }).lean<IPersonalUniverseCanonRevisionDoc | null>();
  const latestPublished = await model
    .findOne({ personalUniverseId, entityType: input.entityType, entityId, status: "published" })
    .sort({ revision: -1 })
    .lean<IPersonalUniverseCanonRevisionDoc | null>();
  const revision = Number(latest?.revision || 0) + 1;
  const created = await model.create({
    revisionId: `pcanon_${randomUUID().replace(/-/g, "")}`,
    namespace: "personal-universe",
    personalUniverseId,
    ownerUid,
    layer: input.layer,
    entityType: input.entityType,
    entityId,
    revision,
    status: "draft",
    payload: input.payload,
    payloadHash: createHash("sha256").update(stableJson(input.payload), "utf8").digest("hex"),
    createdBy: ownerUid,
    createdByType: "owner",
    supersedesRevision: latestPublished?.revision || input.supersedesRevision || null,
    changelog: String(input.changelog || "").trim().slice(0, 2000),
  });
  return (created.toObject?.() ?? created) as IPersonalUniverseCanonRevisionDoc;
}

export async function transitionPersonalUniverseCanonRevision(input: {
  revisionId: string;
  to: CanonRevisionStatus;
  ownerUid: string;
}) {
  const revisionId = safeId(input.revisionId);
  const ownerUid = safeId(input.ownerUid);
  if (!revisionId || !ownerUid) throw repoError("PERSONAL_CANON_TRANSITION_INPUT_INVALID");
  const model = await getPersonalCanonModel();
  const current = await model.findOne({ revisionId, ownerUid }).lean<IPersonalUniverseCanonRevisionDoc | null>();
  if (!current) throw repoError("PERSONAL_CANON_REVISION_NOT_FOUND_OR_FORBIDDEN");
  if (!isCanonRevisionTransitionAllowed(current.status, input.to)) throw repoError("PERSONAL_CANON_STATUS_TRANSITION_INVALID");
  if (input.to === "published") {
    const published = await listPublishedPersonalUniverseCanon(current.personalUniverseId, ownerUid);
    const latestPublished = published
      .filter((item) => item.entityType === current.entityType && item.entityId === current.entityId)
      .sort((a, b) => b.revision - a.revision)[0];
    if (latestPublished && current.supersedesRevision !== latestPublished.revision) {
      throw repoError("PERSONAL_CANON_PUBLISH_STALE_REVISION", { expected: latestPublished.revision, actual: current.supersedesRevision });
    }
    const candidate: IPersonalUniverseCanonRevisionDoc = { ...current, status: "published", publishedBy: ownerUid };
    const issues = validatePersonalCanonGraph([...published, candidate] as CanonGraphRevisionDoc[]);
    if (issues.length) throw repoError("PERSONAL_CANON_GRAPH_INVALID", issues);
  }

  const update: Record<string, unknown> = { status: input.to };
  if (input.to === "review") update.reviewedBy = ownerUid;
  if (input.to === "published") {
    update.publishedBy = ownerUid;
    update.publishedAt = new Date();
  }
  const updated = await model.findOneAndUpdate({ revisionId, ownerUid, status: current.status }, { $set: update }, { new: true }).lean<IPersonalUniverseCanonRevisionDoc | null>();
  if (!updated) throw repoError("PERSONAL_CANON_REVISION_STATE_CONFLICT");
  return updated;
}
