import "server-only";

import { randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  TutorPlayProjectionDailyUsageSchema,
  TutorPlayProjectionLedgerSchema,
  type ITutorPlayProjectionDailyUsageDocument,
  type ITutorPlayProjectionLedgerDocument,
} from "models/game";
import type { ITutorPlayProjectionLedgerDoc, TutorPlayDerivedSignals } from "types/game";

const COLLECTIONS = {
  ledger: "tutor_play_projection_ledger",
  dailyUsage: "tutor_play_projection_daily_usage",
} as const;

function key(value: unknown, code: string, max = 180) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max || !/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(normalized)) throw new Error(code);
  return normalized;
}

function codeError(code: string) {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

async function model<T>(name: string, schema: Parameters<typeof getModel>[2], collection: string) {
  return getModel<T>(MONGODB_GAME_URL, name, schema, collection);
}

export async function getTutorPlayProjectionLedgerModel(): Promise<Model<ITutorPlayProjectionLedgerDocument>> {
  return model<ITutorPlayProjectionLedgerDocument>("TutorPlayProjectionLedger", TutorPlayProjectionLedgerSchema, COLLECTIONS.ledger);
}

export async function getTutorPlayProjectionDailyUsageModel(): Promise<Model<ITutorPlayProjectionDailyUsageDocument>> {
  return model<ITutorPlayProjectionDailyUsageDocument>("TutorPlayProjectionDailyUsage", TutorPlayProjectionDailyUsageSchema, COLLECTIONS.dailyUsage);
}

export async function getTutorPlayProjectionLedgerByIdempotency(input: { uid: string; idempotencyKey: string }) {
  return (await getTutorPlayProjectionLedgerModel())
    .findOne({ uid: key(input.uid, "tutor_play_uid_required"), idempotencyKey: key(input.idempotencyKey, "tutor_play_idempotency_required") })
    .lean<ITutorPlayProjectionLedgerDoc | null>();
}

/**
 * XP cap 예약과 audit ledger reserve를 한 Mongo transaction으로 묶는다.
 * 동일 idempotencyKey는 기존 행을 반환하고 daily usage를 다시 증가시키지 않는다.
 */
export async function reserveTutorPlayProjection(input: {
  uid: string;
  universeId: string;
  sourceEvaluationId: string;
  sourceSessionId: string;
  idempotencyKey: string;
  dailyBucket: string;
  xp: number;
  dailyCap: number;
  consentVersion: string;
  signals: TutorPlayDerivedSignals;
}) {
  const uid = key(input.uid, "tutor_play_uid_required");
  const universeId = key(input.universeId, "tutor_play_universe_required");
  const sourceEvaluationId = key(input.sourceEvaluationId, "tutor_play_evaluation_required");
  const sourceSessionId = key(input.sourceSessionId, "tutor_play_session_required");
  const idempotencyKey = key(input.idempotencyKey, "tutor_play_idempotency_required");
  const dailyBucket = key(input.dailyBucket, "tutor_play_daily_bucket_required", 32);
  const xp = Math.max(0, Math.trunc(Number(input.xp)));
  const dailyCap = Math.trunc(Number(input.dailyCap));
  if (xp <= 0) throw codeError("TUTOR_PLAY_XP_REQUIRED");
  if (dailyCap <= 0) throw codeError("TUTOR_PLAY_DAILY_CAP_REQUIRED");

  const ledgerModel = await getTutorPlayProjectionLedgerModel();
  const existing = await getTutorPlayProjectionLedgerByIdempotency({ uid, idempotencyKey });
  if (existing) return { ledger: existing, duplicate: true };

  const session = await ledgerModel.db.startSession();
  let reserved: ITutorPlayProjectionLedgerDoc | null = null;
  try {
    await session.withTransaction(async () => {
      const duplicate = await ledgerModel.findOne({ uid, idempotencyKey }).session(session).lean<ITutorPlayProjectionLedgerDoc | null>();
      if (duplicate) {
        reserved = duplicate;
        return;
      }

      const dailyModel = await getTutorPlayProjectionDailyUsageModel();
      let usage = await dailyModel.findOne({ uid, dailyBucket }).session(session).lean<ITutorPlayProjectionDailyUsageDocument | null>();
      if (!usage) {
        try {
          const created = await dailyModel.create(
            [{ usageId: `tpu_${randomUUID().replace(/-/g, "")}`, uid, dailyBucket, dailyCap, reservedXp: 0, awardedXp: 0 }],
            { session },
          );
          usage = created[0].toObject() as ITutorPlayProjectionDailyUsageDocument;
        } catch (error) {
          if ((error as { code?: number })?.code !== 11000) throw error;
          usage = await dailyModel.findOne({ uid, dailyBucket }).session(session).lean<ITutorPlayProjectionDailyUsageDocument | null>();
        }
      }
      if (!usage) throw codeError("TUTOR_PLAY_DAILY_USAGE_FAILED");
      if (usage.dailyCap !== dailyCap) throw codeError("TUTOR_PLAY_DAILY_CAP_MISMATCH");

      const updatedUsage = await dailyModel
        .findOneAndUpdate(
          {
            uid,
            dailyBucket,
            $expr: { $lte: [{ $add: ["$reservedXp", "$awardedXp", xp] }, "$dailyCap"] },
          },
          { $inc: { reservedXp: xp } },
          { new: true, session, runValidators: true },
        )
        .lean<ITutorPlayProjectionDailyUsageDocument | null>();
      if (!updatedUsage) {
        const rows = await ledgerModel.create(
          [{
            projectionId: `tpp_${randomUUID().replace(/-/g, "")}`,
            uid,
            universeId,
            source: "learning_evaluation",
            sourceEvaluationId,
            sourceSessionId,
            idempotencyKey,
            dailyBucket,
            xp: 0,
            dailyCap,
            status: "capped",
            consentVersion: key(input.consentVersion, "tutor_play_consent_version_required", 80),
            signals: input.signals,
            reservedAt: null,
            appliedAt: null,
            releasedAt: null,
          }],
          { session },
        );
        reserved = rows[0].toObject() as ITutorPlayProjectionLedgerDoc;
        return;
      }

      const rows = await ledgerModel.create(
        [{
          projectionId: `tpp_${randomUUID().replace(/-/g, "")}`,
          uid,
          universeId,
          source: "learning_evaluation",
          sourceEvaluationId,
          sourceSessionId,
          idempotencyKey,
          dailyBucket,
          xp,
          dailyCap,
          status: "reserved",
          consentVersion: key(input.consentVersion, "tutor_play_consent_version_required", 80),
          signals: input.signals,
          reservedAt: new Date(),
          appliedAt: null,
          releasedAt: null,
        }],
        { session },
      );
      reserved = rows[0].toObject() as ITutorPlayProjectionLedgerDoc;
    });
  } finally {
    await session.endSession();
  }
  if (!reserved) throw codeError("TUTOR_PLAY_RESERVATION_FAILED");
  return { ledger: reserved, duplicate: false };
}

export async function commitTutorPlayProjection(input: { projectionId: string; uid: string; dailyBucket: string; xp: number }) {
  const ledgerModel = await getTutorPlayProjectionLedgerModel();
  const dailyModel = await getTutorPlayProjectionDailyUsageModel();
  const session = await ledgerModel.db.startSession();
  let committed: ITutorPlayProjectionLedgerDoc | null = null;
  try {
    await session.withTransaction(async () => {
      const updatedUsage = await dailyModel
        .findOneAndUpdate(
          { uid: key(input.uid, "tutor_play_uid_required"), dailyBucket: key(input.dailyBucket, "tutor_play_daily_bucket_required", 32), reservedXp: { $gte: input.xp } },
          { $inc: { reservedXp: -input.xp, awardedXp: input.xp } },
          { new: true, session, runValidators: true },
        )
        .lean();
      if (!updatedUsage) throw codeError("TUTOR_PLAY_RESERVATION_MISSING");
      const updatedLedger = await ledgerModel
        .findOneAndUpdate(
          { projectionId: key(input.projectionId, "tutor_play_projection_required"), uid: key(input.uid, "tutor_play_uid_required"), status: "reserved" },
          { $set: { status: "applied", appliedAt: new Date() } },
          { new: true, session, runValidators: true },
        )
        .lean<ITutorPlayProjectionLedgerDoc | null>();
      if (!updatedLedger) throw codeError("TUTOR_PLAY_LEDGER_COMMIT_FAILED");
      committed = updatedLedger;
    });
  } finally {
    await session.endSession();
  }
  if (!committed) throw codeError("TUTOR_PLAY_LEDGER_COMMIT_FAILED");
  return committed;
}

export async function releaseTutorPlayProjection(input: { projectionId: string; uid: string; dailyBucket: string; xp: number }) {
  const ledgerModel = await getTutorPlayProjectionLedgerModel();
  const dailyModel = await getTutorPlayProjectionDailyUsageModel();
  const session = await ledgerModel.db.startSession();
  let released: ITutorPlayProjectionLedgerDoc | null = null;
  try {
    await session.withTransaction(async () => {
      const updatedUsage = await dailyModel
        .findOneAndUpdate(
          { uid: key(input.uid, "tutor_play_uid_required"), dailyBucket: key(input.dailyBucket, "tutor_play_daily_bucket_required", 32), reservedXp: { $gte: input.xp } },
          { $inc: { reservedXp: -input.xp } },
          { new: true, session, runValidators: true },
        )
        .lean();
      if (!updatedUsage) throw codeError("TUTOR_PLAY_RESERVATION_MISSING");
      const updatedLedger = await ledgerModel
        .findOneAndUpdate(
          { projectionId: key(input.projectionId, "tutor_play_projection_required"), uid: key(input.uid, "tutor_play_uid_required"), status: "reserved" },
          { $set: { status: "released", releasedAt: new Date() } },
          { new: true, session, runValidators: true },
        )
        .lean<ITutorPlayProjectionLedgerDoc | null>();
      if (!updatedLedger) throw codeError("TUTOR_PLAY_LEDGER_RELEASE_FAILED");
      released = updatedLedger;
    });
  } finally {
    await session.endSession();
  }
  if (!released) throw codeError("TUTOR_PLAY_LEDGER_RELEASE_FAILED");
  return released;
}
