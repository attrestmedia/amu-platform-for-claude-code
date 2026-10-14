import "server-only";
import type { ClientSession } from "mongoose";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { startSession } from "libs/database/mongoose";
import {
  SpeechBudgetGuardSchema,
  SpeechBudgetReservationSchema,
  type ISpeechBudgetGuardDocument,
  type ISpeechBudgetReservationDocument,
  type SpeechBudgetReservationAccountingState,
  type SpeechBudgetReservationState,
} from "models/system";

/**
 * @docHint
 * @purpose speech 예산 예약·guard·usage를 MongoDB transaction으로 함께 관리
 * @process snapshot/majority session  provider guard 충돌 직렬화  예약 terminal 전이
 * @domain system-control
 * @scope server
 */

const RESERVATION_COLLECTION = "speech_budget_reservations";
const GUARD_COLLECTION = "speech_budget_guards";

export type SpeechBudgetReservationRecordInput = {
  environment: string;
  reservationKey: string;
  requestHash: string;
  owner: ISpeechBudgetReservationDocument["owner"];
  provider: string;
  modelName: string;
  unit: ISpeechBudgetReservationDocument["unit"];
  estimatedQuantity: number;
  reservedUsd: number;
  actualUsd: number | null;
  dayKey: string;
  monthKey: string;
  state: "reserved";
  budgetAccounting: "held";
  reason: null;
  expiresAt: Date;
  resolvedAt: null;
  retainUntil: Date;
};

async function getReservationModel() {
  return await getModel<ISpeechBudgetReservationDocument>(
    MONGODB_AMU_URL,
    "SpeechBudgetReservation",
    SpeechBudgetReservationSchema,
    RESERVATION_COLLECTION,
  );
}

async function getGuardModel() {
  return await getModel<ISpeechBudgetGuardDocument>(
    MONGODB_AMU_URL,
    "SpeechBudgetGuard",
    SpeechBudgetGuardSchema,
    GUARD_COLLECTION,
  );
}

/** 모든 관련 문서 변경은 같은 replica-set transaction에 포함한다. transaction 미지원은 상위에서 fail-closed 처리한다. */
export async function runSpeechBudgetTransaction<T>(callback: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await startSession(MONGODB_AMU_URL);
  try {
    let result: T;
    await session.withTransaction(
      async () => {
        result = await callback(session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
    return result!;
  } finally {
    await session.endSession();
  }
}

export async function findSpeechBudgetReservation(args: {
  environment: string;
  reservationKey: string;
  session: ClientSession;
}) {
  const Model = await getReservationModel();
  return await Model.findOne({ environment: args.environment, reservationKey: args.reservationKey })
    .session(args.session)
    .lean();
}

export async function createSpeechBudgetReservationRecord(args: {
  record: SpeechBudgetReservationRecordInput;
  session: ClientSession;
}) {
  const Model = await getReservationModel();
  const [record] = await Model.create([args.record], { session: args.session });
  return record;
}

export async function incrementSpeechBudgetGuard(args: {
  environment: string;
  provider: string;
  session: ClientSession;
}) {
  const Model = await getGuardModel();
  return await Model.updateOne(
    { environment: args.environment, provider: String(args.provider || "").trim().toLowerCase() },
    { $inc: { seq: 1 } },
    { upsert: true, session: args.session, setDefaultsOnInsert: false },
  );
}

export async function transitionSpeechBudgetReservation(args: {
  environment: string;
  reservationKey: string;
  session: ClientSession;
  state: Exclude<SpeechBudgetReservationState, "reserved">;
  budgetAccounting: Exclude<SpeechBudgetReservationAccountingState, "held">;
  actualUsd: number | null;
  reason: string | null;
  resolvedAt: Date;
}) {
  const Model = await getReservationModel();
  const result = await Model.updateOne(
    { environment: args.environment, reservationKey: args.reservationKey, state: "reserved" },
    {
      $set: {
        state: args.state,
        budgetAccounting: args.budgetAccounting,
        actualUsd: args.actualUsd,
        reason: args.reason,
        resolvedAt: args.resolvedAt,
      },
    },
    { session: args.session },
  );
  return Number(result.matchedCount || 0) === 1;
}

export async function listExpiredSpeechBudgetReservations(args: {
  environment: string;
  provider?: string;
  limit: number;
  now: Date;
}) {
  const Model = await getReservationModel();
  const filter: Record<string, unknown> = {
    environment: args.environment,
    state: "reserved",
    expiresAt: { $lt: args.now },
  };
  if (args.provider) filter.provider = String(args.provider).trim().toLowerCase();
  return await Model.find(filter)
    .select({ reservationKey: 1, provider: 1 })
    .sort({ expiresAt: 1 })
    .limit(args.limit)
    .lean();
}
