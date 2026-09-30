import "server-only";

import { createHash } from "node:crypto";
import { getModel } from "libs/database/modelCache";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import {
  TUTORS_CREATION_UNLOCK_COMPLETED_SESSIONS,
  TUTORS_DAILY_INTIMACY_LIMIT,
  TUTORS_DAILY_XP_LIMIT,
  TUTORS_INITIAL_CREATION_ALLOWANCE,
  TUTORS_MAX_LEVEL,
  TUTORS_MISSION_CATALOG,
} from "consts/tutors";
import {
  TutorAccountProgressSchema,
  TutorCreationPermitSchema,
  TutorLearningProgressSchema,
  TutorRewardEventSchema,
  type ITutorAccountProgressDocument,
  type ITutorCreationPermitDocument,
  type ITutorLearningProgressDocument,
  type ITutorRewardEventDocument,
} from "models/tutors";
import { computeConsecutiveTutorChatDays, getKstDateKey, normalizeTutorChatDates } from "utils/app/tutorsEditPolicy";

const ACCOUNT_COLLECTION = "tutor_account_progress";
const LEARNING_COLLECTION = "tutor_learning_progress";
const REWARD_COLLECTION = "tutor_reward_events";
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

async function getRewardModel() {
  return getModel<ITutorRewardEventDocument>(
    MONGODB_PERSONA_URL,
    "TutorRewardEvent",
    TutorRewardEventSchema,
    REWARD_COLLECTION,
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

function weekKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function levelFromXp(totalXp: number) {
  return Math.min(TUTORS_MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, totalXp) / 25)) + 1);
}

function nextKstResetIso(now = new Date()) {
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset);
  kst.setUTCHours(24, 0, 0, 0);
  return new Date(kst.getTime() - kstOffset).toISOString();
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

function getRemainingSessionsForNextTutor(completedSessionCount: number) {
  const remainder = Math.max(0, completedSessionCount) % TUTORS_CREATION_UNLOCK_COMPLETED_SESSIONS;
  return remainder === 0
    ? TUTORS_CREATION_UNLOCK_COMPLETED_SESSIONS
    : TUTORS_CREATION_UNLOCK_COMPLETED_SESSIONS - remainder;
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

export async function getTutorProgressOverview(actorId: string, options?: { isAdmin?: boolean }) {
  await ensureProgressDocuments(actorId);
  const [Account, Learning, Permit] = await Promise.all([getAccountModel(), getLearningModel(), getPermitModel()]);
  const dateKey = getKstDateKey();
  const [account, learning, usedCreationCount] = await Promise.all([
    Account.findOne({ actorId }).lean().exec(),
    Learning.find({ actorId }).sort({ updatedAt: -1 }).lean().exec(),
    Permit.countDocuments({
      actorId,
      source: { $ne: "admin" },
      state: { $in: ["reserved", "consumed"] },
    }).exec(),
  ]);
  const dailyCreationCount = account?.creationDateKey === dateKey ? Number(account.dailyCreationCount || 0) : 0;
  const isAdmin = Boolean(options?.isAdmin);
  const completedSessionCount = getCompletedSessionCount(learning);
  const allowedCreationCount = getAllowedCreationCount(completedSessionCount);
  // 실제(완료 세션 기준) 생성 가능 여부 — 어드민 우회를 적용하지 않은 사용자 관점의 상태
  const baseCanCreate = usedCreationCount < allowedCreationCount;
  return {
    dateKey,
    nextCreationResetAt: nextKstResetIso(),
    canCreate: isAdmin || baseCanCreate,
    baseCanCreate,
    adminBypass: isAdmin,
    dailyCreationCount,
    dailyCreationLimit: 0,
    creationCredits: Number(account?.creationCredits || 0),
    completedSessionCount,
    creationUnlockSessionInterval: TUTORS_CREATION_UNLOCK_COMPLETED_SESSIONS,
    allowedCreationCount,
    usedCreationCount,
    remainingSessionsForNextTutor: baseCanCreate ? 0 : getRemainingSessionsForNextTutor(completedSessionCount),
    validLearningDates: normalizeTutorChatDates(account?.validLearningDates),
    tutors: learning.map((item) => ({
      personaId: item.personaId,
      totalXp: Number(item.totalXp || 0),
      level: levelFromXp(Number(item.totalXp || 0)),
      completedSessionCount: Number(item.completedSessionCount || 0),
    })),
  };
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

type SettleTutorSessionArgs = {
  actorId: string;
  personaId: string;
  sessionId: string;
  voiceUsed: boolean;
  testScore?: number;
};

export async function settleTutorSessionReward(args: SettleTutorSessionArgs) {
  await ensureProgressDocuments(args.actorId, args.personaId);
  const [Account, Learning, Reward] = await Promise.all([getAccountModel(), getLearningModel(), getRewardModel()]);
  const eventKey = `session:${shortHash(`${args.actorId}:${args.personaId}:${args.sessionId}`)}`;
  const existing = await Reward.findOne({ eventKey }).lean().exec();
  if (existing) return { event: existing, duplicate: true };

  const session = await Account.db.startSession();
  let result: { event: ITutorRewardEventDocument; duplicate: boolean } | null = null;
  try {
    await session.withTransaction(async () => {
      const duplicate = await Reward.findOne({ eventKey }).session(session).lean().exec();
      if (duplicate) {
        result = { event: duplicate as ITutorRewardEventDocument, duplicate: true };
        return;
      }

      const dateKey = getKstDateKey();
      const account = await Account.findOne({ actorId: args.actorId }).session(session).exec();
      const learning = await Learning.findOne({ actorId: args.actorId, personaId: args.personaId }).session(session).exec();
      if (!account || !learning) throw new Error("TUTORS_PROGRESS_NOT_FOUND");

      const learningDates = normalizeTutorChatDates([...(account.validLearningDates || []), dateKey]);
      const periodWeekKey = weekKey(dateKey);
      const currentWeekDays = learningDates.filter((item) => weekKey(item) === periodWeekKey).length;
      const streakDays = computeConsecutiveTutorChatDays(learningDates);
      const missionEvents: Array<Partial<ITutorRewardEventDocument>> = [];
      let missionXp = 0;
      let creationCredits = 0;

      const addMission = async (missionId: keyof typeof TUTORS_MISSION_CATALOG, periodKey: string) => {
        const missionKey = `mission:${shortHash(`${args.actorId}:${missionId}:${periodKey}`)}`;
        const already = await Reward.exists({ eventKey: missionKey }).session(session);
        if (already) return;
        const mission = TUTORS_MISSION_CATALOG[missionId];
        missionXp += mission.xp;
        creationCredits += mission.creationCredits;
        missionEvents.push({
          eventKey: missionKey,
          actorId: args.actorId,
          personaId: args.personaId,
          sessionId: args.sessionId,
          missionId,
          periodKey,
          type: "mission_reward",
          xpDelta: mission.xp,
          intimacyDelta: 0,
          creationCreditDelta: mission.creationCredits,
        });
      };

      await addMission("daily_valid_session", dateKey);
      if (args.voiceUsed) await addMission("daily_voice_session", dateKey);
      if (currentWeekDays >= 3) await addMission("weekly_three_days", periodWeekKey);
      if (streakDays >= 3) await addMission("streak_three_days", "once");
      if (streakDays >= 10) await addMission("streak_ten_days", "once");

      const score = Number.isFinite(args.testScore) ? Math.max(0, Math.min(100, Number(args.testScore))) : undefined;
      const testXp = score === 100 ? 5 : score !== undefined && score >= 80 ? 4 : score !== undefined && score >= 60 ? 2 : 0;
      const requestedXp = 10 + (args.voiceUsed ? 2 : 0) + testXp + missionXp;
      const currentDailyXp = learning.dailyXpDateKey === dateKey ? learning.dailyXpAmount : 0;
      const xpDelta = Math.max(0, Math.min(requestedXp, TUTORS_DAILY_XP_LIMIT - currentDailyXp));
      const requestedIntimacy = 1 + (score !== undefined && score >= 80 ? 1 : 0);
      const currentDailyIntimacy = learning.dailyIntimacyDateKey === dateKey ? learning.dailyIntimacyAmount : 0;
      const intimacyDelta = Math.max(
        0,
        Math.min(requestedIntimacy, TUTORS_DAILY_INTIMACY_LIMIT - currentDailyIntimacy),
      );

      account.validLearningDates = learningDates;
      account.creationCredits += creationCredits;
      learning.totalXp += xpDelta;
      learning.completedSessionCount += 1;
      learning.dailyXpDateKey = dateKey;
      learning.dailyXpAmount = currentDailyXp + xpDelta;
      learning.dailyIntimacyDateKey = dateKey;
      learning.dailyIntimacyAmount = currentDailyIntimacy + intimacyDelta;
      await Promise.all([account.save({ session }), learning.save({ session })]);

      if (missionEvents.length) await Reward.create(missionEvents, { session });
      const rows = await Reward.create(
        [{
          eventKey,
          actorId: args.actorId,
          personaId: args.personaId,
          sessionId: args.sessionId,
          type: "session_complete",
          xpDelta,
          intimacyDelta,
          creationCreditDelta: creationCredits,
          payload: {
            voiceUsed: args.voiceUsed,
            testScore: score,
            dateKey,
            totalXp: learning.totalXp,
            level: levelFromXp(learning.totalXp),
            completedMissions: missionEvents.map((item) => item.missionId),
          },
        }],
        { session },
      );
      result = { event: rows[0] as ITutorRewardEventDocument, duplicate: false };
    });
  } finally {
    await session.endSession();
  }
  if (!result) throw new Error("TUTORS_SESSION_SETTLEMENT_FAILED");
  return result;
}
