import "server-only";

import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { MONGODB_PERSONA_URL, MONGODB_USERS_URL } from "consts/env/server";
import { TUTORS_MAX_LEVEL } from "consts/tutors";
import { getModel } from "libs/database/modelCache";
import { dbConnect } from "libs/database/mongoose";
import { listAcceptedFriendActorIds } from "libs/services/social/friends";
import { isSafeTutorsCollectionName } from "libs/services/tutors/tutorsCollectionKey";
import { getPersonaActorId } from "libs/server-utils/persona/personaPolicy";
import { TutorGiftGrantSchema, TutorLearningProgressSchema } from "models/tutors";
import type { ITutorGiftGrantDocument, ITutorLearningProgressDocument } from "models/tutors";
import { PersonaSchema, type IPersonaDocument } from "models/universe";
import { UserIndexSchema, type IUserIndexDocument } from "models/user";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

const GIFT_COLLECTION = "tutor_gift_grants";
const LEARNING_COLLECTION = "tutor_learning_progress";
const USER_INDEX_COLLECTION = "users_index";

function levelFromXp(totalXp: number) {
  return Math.min(TUTORS_MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, totalXp) / 25)) + 1);
}

async function getGiftModel() {
  return getModel<ITutorGiftGrantDocument>(MONGODB_PERSONA_URL, "TutorGiftGrant", TutorGiftGrantSchema, GIFT_COLLECTION);
}

async function getLearningModel() {
  return getModel<ITutorLearningProgressDocument>(
    MONGODB_PERSONA_URL,
    "TutorLearningProgress",
    TutorLearningProgressSchema,
    LEARNING_COLLECTION,
  );
}

async function getPersonaModel(collectionName: string) {
  if (!isSafeTutorsCollectionName(collectionName)) throw new Error("INVALID_TUTORS_COLLECTION");
  return getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
}

async function getUserIndexModel() {
  const conn = await dbConnect(MONGODB_USERS_URL);
  return (
    (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, USER_INDEX_COLLECTION)
  );
}

async function getFriendDisplayNameByActorId(actorIds: string[]) {
  const ids = [...new Set(actorIds.filter(Boolean))];
  if (!ids.length) return new Map<string, string>();
  const UserIndexModel = await getUserIndexModel();
  const rows = await UserIndexModel.find({ uid: { $in: ids } })
    .select({ _id: 0, uid: 1, userInfo: 1, userEmailLower: 1 })
    .lean();
  return new Map(
    rows.map((row) => [
      String(row.uid || ""),
      String(row.userInfo?.name || row.userEmailLower || row.uid || "").trim(),
    ]),
  );
}

async function getPersonaNameByGrant(grants: ITutorGiftGrantDocument[]) {
  const out = new Map<string, string>();
  const byCollection = new Map<string, string[]>();
  grants.forEach((grant) => {
    if (!isSafeTutorsCollectionName(grant.sourceCollection)) return;
    const current = byCollection.get(grant.sourceCollection) || [];
    current.push(grant.sourcePersonaId);
    byCollection.set(grant.sourceCollection, current);
  });

  for (const [collectionName, personaIds] of byCollection.entries()) {
    const PersonaModel = await getPersonaModel(collectionName);
    const rows = await PersonaModel.find({ pid: { $in: [...new Set(personaIds)] } })
      .select({ _id: 0, pid: 1, name: 1 })
      .lean();
    rows.forEach((row) => {
      out.set(`${collectionName}:${row.pid}`, String(row.name || row.pid || "").trim());
    });
  }

  return out;
}

export async function getSharedTutorProgressForOwner(_data: unknown, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const progressShareFriendIds = new Set(await listAcceptedFriendActorIds(actorId, "progressShare"));
  if (!progressShareFriendIds.size) return NextResponse.json({ ok: true, data: [] });

  const GiftModel = await getGiftModel();
  const grants = await GiftModel.find({
    sourceOwnerId: actorId,
    recipientActorId: { $in: [...progressShareFriendIds] },
    status: "accepted",
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  if (!grants.length) return NextResponse.json({ ok: true, data: [] });

  const LearningModel = await getLearningModel();
  const progressConditions = grants.map((grant) => ({
    actorId: grant.recipientActorId,
    personaId: grant.sourcePersonaId,
  }));
  const learningRows = await LearningModel.find({ $or: progressConditions }).lean();
  const learningByKey = new Map(learningRows.map((row) => [`${row.actorId}:${row.personaId}`, row]));
  const [friendNames, personaNames] = await Promise.all([
    getFriendDisplayNameByActorId(grants.map((grant) => grant.recipientActorId)),
    getPersonaNameByGrant(grants as ITutorGiftGrantDocument[]),
  ]);

  const data = grants.map((grant) => {
    const learning = learningByKey.get(`${grant.recipientActorId}:${grant.sourcePersonaId}`);
    const totalXp = Number(learning?.totalXp || 0);
    return {
      grantId: grant.grantId,
      friendActorId: grant.recipientActorId,
      friendDisplayName: friendNames.get(grant.recipientActorId) || grant.recipientActorId,
      sourcePersonaId: grant.sourcePersonaId,
      tutorName: personaNames.get(`${grant.sourceCollection}:${grant.sourcePersonaId}`) || grant.sourcePersonaId,
      totalXp,
      level: levelFromXp(totalXp),
      completedSessionCount: Number(learning?.completedSessionCount || 0),
      updatedAt: learning?.updatedAt ? new Date(learning.updatedAt).toISOString() : undefined,
    };
  });

  return NextResponse.json({ ok: true, data });
}
