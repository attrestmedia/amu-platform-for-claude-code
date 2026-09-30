import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { stripNarrativeSensitiveKeys } from "libs/server-utils/narrative/narrativeDataLifecycle";
import { getPersonalCanonModel, getPersonalUniverseModel } from "./personalUniverseRepo";
import {
  getTutorPlayProjectionDailyUsageModel,
  getTutorPlayProjectionLedgerModel,
} from "./tutorPlayProjectionRepo";
import {
  getCrossUniverseBridgeEventModel,
  getCrossUniverseReportModel,
  getCrossUniverseSharePreferenceModel,
  getCrossUniverseUserBlockModel,
} from "./crossUniverseRepo";
import {
  CharacterRelationSchema,
  NarrativeEventSchema,
  NarrativePrivacyPreferenceSchema,
  StoryArcSchema,
  StoryBeatSchema,
  UserStoryStateSchema,
  PersonalUniversePublicSnapshotReportSchema,
  PersonalUniversePublicSnapshotSchema,
  type ICharacterRelationDocument,
  type INarrativeEventDocument,
  type INarrativePrivacyPreferenceDocument,
  type IStoryArcDocument,
  type IStoryBeatDocument,
  type IUserStoryStateDocument,
} from "models/game";
import type {
  ICharacterRelationDoc,
  INarrativeEventDoc,
  INarrativePrivacyPreferenceDoc,
  IStoryArcDoc,
  IStoryBeatDoc,
  IUserStoryStateDoc,
  NarrativeOutcome,
  NarrativeStateSnapshot,
} from "types/game";

/**
 * @docHint
 * @purpose Narrative Runtime의 game DB 저장 경계
 * @process privacy/state/arc/beat/relation 조회  append-only event 멱등성  optimistic reducer 저장
 * @domain database.game.narrative
 * @scope server
 */

const COLLECTIONS = {
  privacy: "narrative_privacy_preferences",
  state: "user_story_states",
  arc: "story_arcs",
  beat: "story_beats",
  event: "narrative_events",
  relation: "character_relations",
  personalUniverse: "personal_universes",
  personalCanon: "personal_universe_canon_revisions",
  publicSnapshot: "personal_universe_public_snapshots",
  publicSnapshotReport: "personal_universe_public_snapshot_reports",
  tutorPlayProjectionLedger: "tutor_play_projection_ledger",
  tutorPlayProjectionDailyUsage: "tutor_play_projection_daily_usage",
  crossUniverseSharePreference: "cross_universe_share_preferences",
  crossUniverseBridgeEvent: "cross_universe_bridge_events",
  crossUniverseUserBlock: "cross_universe_user_blocks",
  crossUniverseReport: "cross_universe_reports",
} as const;

function key(value: unknown, code: string, max = 160) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max || !/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function duplicate(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

function repoError(code: string, detail?: unknown) {
  const error = new Error(code) as Error & { code: string; detail?: unknown };
  error.code = code;
  error.detail = detail;
  return error;
}

async function model<T>(name: string, schema: Parameters<typeof getModel>[2], collection: string) {
  return getModel<T>(MONGODB_GAME_URL, name, schema, collection);
}

export async function getNarrativePrivacyPreferenceModel(): Promise<Model<INarrativePrivacyPreferenceDocument>> {
  return model<INarrativePrivacyPreferenceDocument>("NarrativePrivacyPreference", NarrativePrivacyPreferenceSchema, COLLECTIONS.privacy);
}

export async function getUserStoryStateModel(): Promise<Model<IUserStoryStateDocument>> {
  return model<IUserStoryStateDocument>("UserStoryState", UserStoryStateSchema, COLLECTIONS.state);
}

export async function getStoryArcModel(): Promise<Model<IStoryArcDocument>> {
  return model<IStoryArcDocument>("StoryArc", StoryArcSchema, COLLECTIONS.arc);
}

export async function getStoryBeatModel(): Promise<Model<IStoryBeatDocument>> {
  return model<IStoryBeatDocument>("StoryBeat", StoryBeatSchema, COLLECTIONS.beat);
}

export async function getNarrativeEventModel(): Promise<Model<INarrativeEventDocument>> {
  return model<INarrativeEventDocument>("NarrativeEvent", NarrativeEventSchema, COLLECTIONS.event);
}

export async function getCharacterRelationModel(): Promise<Model<ICharacterRelationDocument>> {
  return model<ICharacterRelationDocument>("CharacterRelation", CharacterRelationSchema, COLLECTIONS.relation);
}

export async function getPersonalUniversePublicSnapshotLifecycleModel() {
  return model("PersonalUniversePublicSnapshot", PersonalUniversePublicSnapshotSchema, COLLECTIONS.publicSnapshot);
}

export async function getPersonalUniversePublicSnapshotReportLifecycleModel() {
  return model("PersonalUniversePublicSnapshotReport", PersonalUniversePublicSnapshotReportSchema, COLLECTIONS.publicSnapshotReport);
}

export async function getNarrativePrivacyPreference(uidInput: string): Promise<INarrativePrivacyPreferenceDoc | null> {
  const uid = key(uidInput, "narrative_uid_required");
  return (await getNarrativePrivacyPreferenceModel()).findOne({ uid }).lean<INarrativePrivacyPreferenceDoc | null>();
}

export async function upsertNarrativePrivacyPreference(input: {
  uid: string;
  personalCanonStatus: "active" | "opted_out" | "deleted";
  crossServiceMemoryConsent: "not_granted" | "granted" | "withdrawn";
  crossServiceConsentVersion?: string | null;
  consentVersion: string;
}): Promise<INarrativePrivacyPreferenceDoc> {
  const uid = key(input.uid, "narrative_uid_required");
  const now = new Date();
  const update: Record<string, unknown> = {
    personalCanonStatus: input.personalCanonStatus,
    crossServiceMemoryConsent: input.crossServiceMemoryConsent,
    crossServiceConsentVersion: input.crossServiceConsentVersion ? String(input.crossServiceConsentVersion).trim().slice(0, 80) : null,
    consentVersion: String(input.consentVersion || "").trim().slice(0, 80),
    withdrawnAt: input.crossServiceMemoryConsent === "withdrawn" || input.personalCanonStatus !== "active" ? now : null,
  };
  if (input.personalCanonStatus === "active" && input.crossServiceMemoryConsent === "granted") update.consentedAt = now;
  const model = await getNarrativePrivacyPreferenceModel();
  const doc = await model.findOneAndUpdate(
    { uid },
    {
      $set: update,
      $setOnInsert: { uid },
      $push: {
        history: {
          $each: [{ personalCanonStatus: input.personalCanonStatus, crossServiceMemoryConsent: input.crossServiceMemoryConsent, crossServiceConsentVersion: update.crossServiceConsentVersion, consentVersion: update.consentVersion, changedAt: now }],
          $slice: -32,
        },
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean<INarrativePrivacyPreferenceDoc | null>();
  if (!doc) throw new Error("narrative_privacy_upsert_failed");
  return doc;
}

function storyIdentity(input: { uid: string; universeId: string; narrativeProfileId: string }) {
  return {
    uid: key(input.uid, "narrative_uid_required"),
    universeId: key(input.universeId, "narrative_universe_required"),
    narrativeProfileId: key(input.narrativeProfileId, "narrative_profile_required"),
  };
}

export async function getUserStoryState(input: { uid: string; universeId: string; narrativeProfileId: string }) {
  const identity = storyIdentity(input);
  return (await getUserStoryStateModel()).findOne(identity).lean<IUserStoryStateDoc | null>();
}

export async function createUserStoryStateIfAbsent(input: {
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  canonRevision: number;
}): Promise<IUserStoryStateDoc> {
  const identity = storyIdentity(input);
  const existing = await getUserStoryState(identity);
  if (existing) return existing;
  const stateId = `story_${hash(identity).slice(0, 32)}`;
  try {
    const created = await (await getUserStoryStateModel()).create({
      ...identity,
      stateId,
      canonRevision: Math.max(1, Math.floor(Number(input.canonRevision || 1))),
      status: "active",
      schemaVersion: 1,
      version: 0,
      activeArcIds: [],
      activeBeatIds: [],
      completedBeatIds: [],
      flags: {},
      relationAffinity: {},
      relations: {},
      lastEventId: null,
    });
    return (created.toObject?.() ?? created) as IUserStoryStateDoc;
  } catch (error) {
    if (!duplicate(error)) throw error;
    const raced = await getUserStoryState(identity);
    if (!raced) throw error;
    return raced;
  }
}

export async function updateUserStoryStateAtomic(input: {
  identity: { uid: string; universeId: string; narrativeProfileId: string };
  expectedVersion: number;
  snapshot: NarrativeStateSnapshot;
}): Promise<IUserStoryStateDoc | null> {
  const identity = storyIdentity(input.identity);
  return (await getUserStoryStateModel()).findOneAndUpdate(
    { ...identity, status: "active", version: Math.max(0, Math.floor(input.expectedVersion)) },
    {
      $set: {
        schemaVersion: 1,
        version: input.snapshot.version,
        activeArcIds: input.snapshot.activeArcIds,
        activeBeatIds: input.snapshot.activeBeatIds,
        completedBeatIds: input.snapshot.completedBeatIds,
        flags: input.snapshot.flags,
        relationAffinity: input.snapshot.relationAffinity,
        relations: input.snapshot.relations || {},
        lastEventId: input.snapshot.lastEventId || null,
      },
    },
    { new: true, runValidators: true },
  ).lean<IUserStoryStateDoc | null>();
}

export async function getNarrativeEventByIdempotency(input: { uid: string; universeId: string; narrativeProfileId: string; idempotencyKey: string }) {
  const identity = storyIdentity(input);
  const idempotencyKey = key(input.idempotencyKey, "narrative_idempotency_required", 200);
  return (await getNarrativeEventModel()).findOne({ ...identity, idempotencyKey }).lean<INarrativeEventDoc | null>();
}

export async function appendNarrativeEventIfAbsent(input: {
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  idempotencyKey: string;
  outcome: NarrativeOutcome;
  beforeVersion: number;
}): Promise<{ event: INarrativeEventDoc; duplicate: boolean }> {
  const identity = storyIdentity(input);
  const idempotencyKey = key(input.idempotencyKey, "narrative_idempotency_required", 200);
  const outcomeHash = hash(input.outcome);
  const eventModel = await getNarrativeEventModel();
  const existing = await getNarrativeEventByIdempotency({ ...identity, idempotencyKey });
  if (existing) {
    if (existing.outcomeHash !== outcomeHash) throw repoError("NARRATIVE_IDEMPOTENCY_CONFLICT");
    return { event: existing, duplicate: true };
  }
  try {
    const created = await eventModel.create({
      ...identity,
      eventId: `ne_${randomUUID().replace(/-/g, "")}`,
      idempotencyKey,
      source: input.outcome.source,
      status: "prepared",
      outcome: input.outcome,
      outcomeHash,
      beforeVersion: Math.max(0, Math.floor(Number(input.beforeVersion || 0))),
      afterVersion: null,
      operationId: randomUUID(),
      appliedAt: null,
    });
    return { event: (created.toObject?.() ?? created) as INarrativeEventDoc, duplicate: false };
  } catch (error) {
    if (!duplicate(error)) throw error;
    const raced = await getNarrativeEventByIdempotency({ ...identity, idempotencyKey });
    if (!raced) throw error;
    if (raced.outcomeHash !== outcomeHash) throw repoError("NARRATIVE_IDEMPOTENCY_CONFLICT");
    return { event: raced, duplicate: true };
  }
}

export async function claimNarrativeEvent(input: { eventId: string; staleBefore: Date }) {
  const eventId = key(input.eventId, "narrative_event_required");
  return (await getNarrativeEventModel()).findOneAndUpdate(
    {
      eventId,
      $or: [
        { status: "prepared" },
        { status: "failed" },
        { status: "applying", applyingAt: { $lt: input.staleBefore } },
      ],
    },
    { $set: { status: "applying", applyingAt: new Date() } },
    { new: true, runValidators: true },
  ).lean<INarrativeEventDoc | null>();
}

export async function markNarrativeEventApplied(input: { eventId: string; afterVersion: number }) {
  const eventId = key(input.eventId, "narrative_event_required");
  return (await getNarrativeEventModel()).findOneAndUpdate(
    { eventId, status: "applying" },
    { $set: { status: "applied", afterVersion: input.afterVersion, appliedAt: new Date() }, $unset: { applyingAt: "" } },
    { new: true, runValidators: true },
  ).lean<INarrativeEventDoc | null>();
}

export async function markNarrativeEventRejected(input: { eventId: string; failed?: boolean }) {
  const eventId = key(input.eventId, "narrative_event_required");
  return (await getNarrativeEventModel()).findOneAndUpdate(
    { eventId, status: { $in: ["prepared", "applying", "failed"] } },
    { $set: { status: input.failed ? "failed" : "rejected" }, $unset: { applyingAt: "" } },
    { new: true, runValidators: true },
  ).lean<INarrativeEventDoc | null>();
}

export async function listNarrativeEvents(input: { uid: string; universeId: string; narrativeProfileId: string; limit?: number }) {
  const identity = storyIdentity(input);
  return (await getNarrativeEventModel())
    .find({ ...identity, status: "applied" })
    .sort({ createdAt: 1, eventId: 1 })
    .limit(Math.max(1, Math.min(1000, Math.floor(Number(input.limit || 500)))))
    .lean<INarrativeEventDoc[]>();
}

export async function createStoryArcIfAbsent(input: {
  arcId: string;
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  characterId: string;
  canonRevision: number;
  goalKey: string;
  status?: "locked" | "active" | "completed" | "abandoned";
}): Promise<IStoryArcDoc> {
  const identity = storyIdentity(input);
  const arcId = key(input.arcId, "narrative_arc_required");
  const model = await getStoryArcModel();
  const doc = await model.findOneAndUpdate(
    { ...identity, arcId },
    {
      $setOnInsert: {
        arcId,
        characterId: key(input.characterId, "narrative_character_required"),
        canonRevision: Math.max(1, Math.floor(Number(input.canonRevision || 1))),
        goalKey: key(input.goalKey, "narrative_goal_required"),
        status: input.status || "locked",
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean<IStoryArcDoc | null>();
  if (!doc) throw new Error("narrative_arc_upsert_failed");
  return doc;
}

export async function createStoryBeatIfAbsent(input: {
  beatId: string;
  arcId: string;
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  sequence: number;
  canonRevision: number;
  transitionKey: "story.arc.activate" | "story.beat.activate" | "story.beat.complete" | "world.flag.set" | "relation.affinity.adjust";
  status?: "locked" | "available" | "active" | "completed";
}): Promise<IStoryBeatDoc> {
  const identity = storyIdentity(input);
  const beatId = key(input.beatId, "narrative_beat_required");
  const model = await getStoryBeatModel();
  const doc = await model.findOneAndUpdate(
    { ...identity, beatId },
    {
      $setOnInsert: {
        beatId,
        arcId: key(input.arcId, "narrative_arc_required"),
        sequence: Math.max(0, Math.floor(Number(input.sequence || 0))),
        canonRevision: Math.max(1, Math.floor(Number(input.canonRevision || 1))),
        transitionKey: input.transitionKey,
        status: input.status || "locked",
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean<IStoryBeatDoc | null>();
  if (!doc) throw new Error("narrative_beat_upsert_failed");
  return doc;
}

export async function listStoryArcs(input: { uid: string; universeId: string; narrativeProfileId: string; limit?: number }) {
  const identity = storyIdentity(input);
  return (await getStoryArcModel()).find(identity).sort({ createdAt: 1, arcId: 1 }).limit(Math.max(1, Math.min(500, Math.floor(Number(input.limit || 200))))).lean<IStoryArcDoc[]>();
}

export async function listStoryBeats(input: { uid: string; universeId: string; narrativeProfileId: string; arcId?: string; limit?: number }) {
  const identity = storyIdentity(input);
  const query = input.arcId ? { ...identity, arcId: key(input.arcId, "narrative_arc_required") } : identity;
  return (await getStoryBeatModel()).find(query).sort({ sequence: 1, beatId: 1 }).limit(Math.max(1, Math.min(1000, Math.floor(Number(input.limit || 500))))).lean<IStoryBeatDoc[]>();
}

export async function upsertCharacterRelation(input: {
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  playerCharacterInstanceId: string;
  targetCharacterId: string;
  affinity: number;
}): Promise<ICharacterRelationDoc> {
  const identity = storyIdentity(input);
  const playerCharacterInstanceId = key(input.playerCharacterInstanceId, "narrative_player_character_required");
  const targetCharacterId = key(input.targetCharacterId, "narrative_target_character_required");
  const doc = await (await getCharacterRelationModel()).findOneAndUpdate(
    { ...identity, playerCharacterInstanceId, targetCharacterId },
    {
      $set: { affinity: Math.max(-100, Math.min(100, Math.trunc(Number(input.affinity || 0))) ) },
      $inc: { relationVersion: 1 },
      $setOnInsert: { relationId: `rel_${randomUUID().replace(/-/g, "")}` },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean<ICharacterRelationDoc | null>();
  if (!doc) throw new Error("narrative_relation_upsert_failed");
  return doc;
}

export async function listCharacterRelations(input: { uid: string; universeId: string; narrativeProfileId: string; playerCharacterInstanceId?: string; limit?: number }) {
  const identity = storyIdentity(input);
  const query = input.playerCharacterInstanceId ? { ...identity, playerCharacterInstanceId: key(input.playerCharacterInstanceId, "narrative_player_character_required") } : identity;
  return (await getCharacterRelationModel()).find(query).sort({ targetCharacterId: 1 }).limit(Math.max(1, Math.min(500, Math.floor(Number(input.limit || 200))))).lean<ICharacterRelationDoc[]>();
}

export async function purgeUserNarrativeData(uidInput: string) {
  const uid = key(uidInput, "narrative_uid_required");
  const results = await Promise.all([
    { collection: COLLECTIONS.privacy, model: await getNarrativePrivacyPreferenceModel(), filter: { uid } },
    { collection: COLLECTIONS.state, model: await getUserStoryStateModel(), filter: { uid } },
    { collection: COLLECTIONS.arc, model: await getStoryArcModel(), filter: { uid } },
    { collection: COLLECTIONS.beat, model: await getStoryBeatModel(), filter: { uid } },
    { collection: COLLECTIONS.event, model: await getNarrativeEventModel(), filter: { uid } },
    { collection: COLLECTIONS.relation, model: await getCharacterRelationModel(), filter: { uid } },
    { collection: COLLECTIONS.personalUniverse, model: await getPersonalUniverseModel(), filter: { uid } },
    { collection: COLLECTIONS.personalCanon, model: await getPersonalCanonModel(), filter: { ownerUid: uid } },
    { collection: COLLECTIONS.publicSnapshot, model: await getPersonalUniversePublicSnapshotLifecycleModel(), filter: { ownerUid: uid } },
    { collection: COLLECTIONS.publicSnapshotReport, model: await getPersonalUniversePublicSnapshotReportLifecycleModel(), filter: { $or: [{ ownerUid: uid }, { reporterUid: uid }] } },
    { collection: COLLECTIONS.tutorPlayProjectionLedger, model: await getTutorPlayProjectionLedgerModel(), filter: { uid } },
    { collection: COLLECTIONS.tutorPlayProjectionDailyUsage, model: await getTutorPlayProjectionDailyUsageModel(), filter: { uid } },
    { collection: COLLECTIONS.crossUniverseSharePreference, model: await getCrossUniverseSharePreferenceModel(), filter: { ownerUid: uid } },
    { collection: COLLECTIONS.crossUniverseBridgeEvent, model: await getCrossUniverseBridgeEventModel(), filter: { $or: [{ requesterUid: uid }, { hostUid: uid }, { "guest.ownerUid": uid }] } },
    { collection: COLLECTIONS.crossUniverseUserBlock, model: await getCrossUniverseUserBlockModel(), filter: { $or: [{ ownerUid: uid }, { blockedUid: uid }] } },
    { collection: COLLECTIONS.crossUniverseReport, model: await getCrossUniverseReportModel(), filter: { $or: [{ reporterUid: uid }, { reportedUid: uid }] } },
  ].map(async ({ collection, model: currentModel, filter }) => {
    const result = await (currentModel as unknown as Model<unknown>).deleteMany(filter);
    return { collection, deletedCount: Number(result.deletedCount || 0) };
  }));
  return results;
}

/**
 * OOC-045 데이터 이동권 최소 구현 — 사용자가 동의한 Personal Canon·cross-service projection 데이터를
 * 삭제 allowlist와 동일한 16개 컬렉션에서 읽기 전용으로 내보낸다.
 * raw seed·secret 성 필드는 응답에서 제외한다.
 */
export async function exportUserNarrativeData(uidInput: string) {
  const uid = key(uidInput, "narrative_uid_required");
  const exports = await Promise.all([
    { collection: COLLECTIONS.privacy, model: await getNarrativePrivacyPreferenceModel(), filter: { uid } },
    { collection: COLLECTIONS.state, model: await getUserStoryStateModel(), filter: { uid } },
    { collection: COLLECTIONS.arc, model: await getStoryArcModel(), filter: { uid } },
    { collection: COLLECTIONS.beat, model: await getStoryBeatModel(), filter: { uid } },
    { collection: COLLECTIONS.event, model: await getNarrativeEventModel(), filter: { uid } },
    { collection: COLLECTIONS.relation, model: await getCharacterRelationModel(), filter: { uid } },
    { collection: COLLECTIONS.personalUniverse, model: await getPersonalUniverseModel(), filter: { uid } },
    { collection: COLLECTIONS.personalCanon, model: await getPersonalCanonModel(), filter: { ownerUid: uid } },
    { collection: COLLECTIONS.publicSnapshot, model: await getPersonalUniversePublicSnapshotLifecycleModel(), filter: { ownerUid: uid } },
    { collection: COLLECTIONS.publicSnapshotReport, model: await getPersonalUniversePublicSnapshotReportLifecycleModel(), filter: { $or: [{ ownerUid: uid }, { reporterUid: uid }] } },
    { collection: COLLECTIONS.tutorPlayProjectionLedger, model: await getTutorPlayProjectionLedgerModel(), filter: { uid } },
    { collection: COLLECTIONS.tutorPlayProjectionDailyUsage, model: await getTutorPlayProjectionDailyUsageModel(), filter: { uid } },
    { collection: COLLECTIONS.crossUniverseSharePreference, model: await getCrossUniverseSharePreferenceModel(), filter: { ownerUid: uid } },
    { collection: COLLECTIONS.crossUniverseBridgeEvent, model: await getCrossUniverseBridgeEventModel(), filter: { $or: [{ requesterUid: uid }, { hostUid: uid }, { "guest.ownerUid": uid }] } },
    { collection: COLLECTIONS.crossUniverseUserBlock, model: await getCrossUniverseUserBlockModel(), filter: { $or: [{ ownerUid: uid }, { blockedUid: uid }] } },
    { collection: COLLECTIONS.crossUniverseReport, model: await getCrossUniverseReportModel(), filter: { $or: [{ reporterUid: uid }, { reportedUid: uid }] } },
  ].map(async ({ collection, model: currentModel, filter }) => {
    const docs = await (currentModel as unknown as Model<unknown>).find(filter).lean<Record<string, unknown>[]>();
    return {
      collection,
      count: docs.length,
      documents: docs.map((doc) => stripNarrativeSensitiveKeys(doc)),
    };
  }));
  return exports;
}
