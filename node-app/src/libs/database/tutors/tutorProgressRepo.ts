import "server-only";

import { createHash } from "node:crypto";
import { getModel } from "libs/database/modelCache";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import {
  TUTORS_CREATION_UNLOCK_COMPLETED_SESSIONS,
  TUTORS_INITIAL_CREATION_ALLOWANCE,
} from "consts/tutors";
import {
  TutorAccountProgressSchema,
  TutorCreationPermitSchema,
  TutorLearningProgressSchema,
  type ITutorAccountProgressDocument,
  type ITutorCreationPermitDocument,
  type ITutorLearningProgressDocument,
} from "models/tutors";
import { getKstDateKey } from "utils/app/tutorsEditPolicy";

const ACCOUNT_COLLECTION = "tutor_account_progress";
const LEARNING_COLLECTION = "tutor_learning_progress";
const PERMIT_COLLECTION = "tutor_creation_permits";

async function getAccountModel() {
  return getModel<ITutorAccountProgressDocument>(
    MONGODB_PERSONA_URL,
    "TutorAccountProgress",
    TutorAccountProgressSchema,
    ACCOUNT_COLLECTION,
  );
}

async function getLearningModel() {
  return getModel<ITutorLearningProgressDocument>(
    MONGODB_PERSONA_URL,
    "TutorLearningProgress",
    TutorLearningProgressSchema,
    LEARNING_COLLECTION,
  );
}

async function getPermitModel() {
  return getModel<ITutorCreationPermitDocument>(
    MONGODB_PERSONA_URL,
    "TutorCreationPermit",
    TutorCreationPermitSchema,
    PERMIT_COLLECTION,
  );
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function getCompletedSessionCount(learning: Array<Pick<ITutorLearningProgressDocument, "completedSessionCount">>) {
  return learning.reduce((sum, item) => sum + Number(item.completedSessionCount || 0), 0);
}

function getAllowedCreationCount(completedSessionCount: number) {
  return (
    TUTORS_INITIAL_CREATION_ALLOWANCE +
    Math.floor(Math.max(0, completedSessionCount) / TUTORS_CREATION_UNLOCK_COMPLETED_SESSIONS)
  );
}

async function ensureProgressDocuments(actorId: string, personaId?: string) {
  const [Account, Learning] = await Promise.all([getAccountModel(), getLearningModel()]);
  await Account.updateOne(
    { actorId },
    { $setOnInsert: { actorId, creationDateKey: "", dailyCreationCount: 0, creationCredits: 0, validLearningDates: [] } },
    { upsert: true },
  ).exec().catch((error: unknown) => {
    if (Number((error as { code?: number })?.code) !== 11000) throw error;
  });
  if (personaId) {
    await Learning.updateOne(
      { actorId, personaId },
      {
        $setOnInsert: {
          actorId,
          personaId,
          totalXp: 0,
          completedSessionCount: 0,
          dailyXpDateKey: "",
          dailyXpAmount: 0,
          dailyIntimacyDateKey: "",
          dailyIntimacyAmount: 0,
        },
      },
      { upsert: true },
    ).exec().catch((error: unknown) => {
      if (Number((error as { code?: number })?.code) !== 11000) throw error;
    });
  }
}

export async function reserveTutorCreationPermit(args: { actorId: string; requestId: string; isAdmin?: boolean }) {
  const { actorId, requestId, isAdmin = false } = args;
  await ensureProgressDocuments(actorId);
  const [Account, Learning, Permit] = await Promise.all([getAccountModel(), getLearningModel(), getPermitModel()]);
  const requestKey = `request:${shortHash(`${actorId}:${requestId}`)}`;
  const existing = await Permit.findOne({ requestKey }).lean().exec();
  if (existing) return existing;

  const session = await Account.db.startSession();
  let reserved: ITutorCreationPermitDocument | null = null;
  try {
    await session.withTransaction(async () => {
      const duplicate = await Permit.findOne({ requestKey }).session(session).lean().exec();
      if (duplicate) {
        reserved = duplicate as ITutorCreationPermitDocument;
        return;
      }

      const dateKey = getKstDateKey();
      const account = await Account.findOne({ actorId }).session(session).exec();
      if (!account) throw new Error("TUTORS_PROGRESS_NOT_FOUND");
      const learning = await Learning.find({ actorId }).session(session).lean().exec();
      const completedSessionCount = getCompletedSessionCount(learning);
      const allowedCreationCount = getAllowedCreationCount(completedSessionCount);
      const usedCreationCount = await Permit.countDocuments({
        actorId,
        source: { $ne: "admin" },
        state: { $in: ["reserved", "consumed"] },
      })
        .session(session)
        .exec();

      let source: "conversation" | "admin";
      if (usedCreationCount < allowedCreationCount) {
        source = "conversation";
      } else if (isAdmin) {
        // 관리자 테스트용 우회: 일일 카운트/미션 크레딧을 소모하지 않고 발급
        source = "admin";
      } else {
        const error = new Error("TUTORS_DAILY_CREATION_LIMIT");
        Object.assign(error, { code: "TUTORS_DAILY_CREATION_LIMIT" });
        throw error;
      }

      const permitKey = `${source}:${shortHash(`${actorId}:${requestId}:${dateKey}`)}`;
      const rows = await Permit.create(
        [{ permitKey, requestKey, actorId, requestId, source, dateKey, state: "reserved" }],
        { session },
      );
      reserved = rows[0] as ITutorCreationPermitDocument;
    });
    if (!reserved) throw new Error("TUTORS_CREATION_PERMIT_FAILED");
    return reserved;
  } finally {
    await session.endSession();
  }
}

export async function consumeTutorCreationPermit(permitKey: string, personaId: string) {
  const Permit = await getPermitModel();
  return Permit.findOneAndUpdate(
    { permitKey, state: "reserved" },
    { $set: { state: "consumed", personaId } },
    { new: true },
  ).lean().exec();
}

export async function releaseTutorCreationPermit(permitKey: string) {
  const [Account, Permit] = await Promise.all([getAccountModel(), getPermitModel()]);
  const permit = await Permit.findOne({ permitKey, state: "reserved" }).lean().exec();
  if (!permit) return;
  const session = await Account.db.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await Permit.findOneAndDelete({ permitKey, state: "reserved" }, { session }).lean().exec();
      if (!claimed) return;
      const account = await Account.findOne({ actorId: claimed.actorId }).session(session).exec();
      if (!account) return;
      if (claimed.source === "reward") account.creationCredits += 1;
      else if (claimed.source === "daily" && account.creationDateKey === claimed.dateKey)
        account.dailyCreationCount = Math.max(0, account.dailyCreationCount - 1);
      await account.save({ session });
    });
  } finally {
    await session.endSession();
  }
}
