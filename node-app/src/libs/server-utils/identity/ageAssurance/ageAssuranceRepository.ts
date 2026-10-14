import "server-only";
import type { Model } from "mongoose";
import { MONGODB_USERS_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  AgeAssuranceAttemptSchema,
  AgeAssuranceStateSchema,
  type IAgeAssuranceAttemptDocument,
  type IAgeAssuranceStateDocument,
} from "models/identity";
import type {
  AgeAssuranceAttemptStatus,
  AgeAssuranceEnvironment,
  AgeAssuranceOutcome,
} from "types/identity/ageAssurance";

const ATTEMPT_MODEL = "AgeAssuranceAttempt";
const STATE_MODEL = "AgeAssuranceState";

export function getAgeAssuranceAttemptModel(): Promise<Model<IAgeAssuranceAttemptDocument>> {
  return getModel<IAgeAssuranceAttemptDocument>(
    MONGODB_USERS_URL,
    ATTEMPT_MODEL,
    AgeAssuranceAttemptSchema,
    "age_assurance_attempts",
  );
}

export function getAgeAssuranceStateModel(): Promise<Model<IAgeAssuranceStateDocument>> {
  return getModel<IAgeAssuranceStateDocument>(
    MONGODB_USERS_URL,
    STATE_MODEL,
    AgeAssuranceStateSchema,
    "age_assurance_states",
  );
}

export type AgeAssuranceAttemptRecord = {
  _id: string;
  uid: string;
  txId: string;
  status: AgeAssuranceAttemptStatus;
  environment: AgeAssuranceEnvironment;
  requestedAt: Date;
  expiresAt: Date;
  resultFetchedAt?: Date;
  outcome?: AgeAssuranceOutcome;
  consumed: boolean;
};

export type AgeAssuranceStateRecord = {
  uid: string;
  outcome: AgeAssuranceOutcome;
  environment: AgeAssuranceEnvironment;
  provider: "toss_cert";
  verifiedAt: Date;
  expiresAt: Date;
  attemptId: string;
};

export async function countRecentAgeAssuranceAttempts(uid: string, since: Date): Promise<number> {
  const Model = await getAgeAssuranceAttemptModel();
  return Model.countDocuments({ uid, requestedAt: { $gte: since } });
}

export async function createAgeAssuranceAttempt(input: {
  uid: string;
  txId: string;
  nonce: string;
  environment: AgeAssuranceEnvironment;
  requestedAt: Date;
  expiresAt: Date;
}): Promise<AgeAssuranceAttemptRecord> {
  const Model = await getAgeAssuranceAttemptModel();
  const created = await Model.create({ ...input, status: "requested", consumed: false });
  return {
    _id: String(created._id),
    uid: created.uid,
    txId: created.txId,
    status: created.status,
    environment: created.environment,
    requestedAt: created.requestedAt,
    expiresAt: created.expiresAt,
    outcome: created.outcome,
    consumed: created.consumed,
  };
}

export async function findAgeAssuranceAttempt(uid: string, attemptId: string): Promise<AgeAssuranceAttemptRecord | null> {
  const Model = await getAgeAssuranceAttemptModel();
  return Model.findOne({ uid, _id: attemptId }).lean<AgeAssuranceAttemptRecord | null>();
}

export async function claimAgeAssuranceAttempt(
  uid: string,
  attemptId: string,
  now: Date,
): Promise<AgeAssuranceAttemptRecord | null> {
  const Model = await getAgeAssuranceAttemptModel();
  return Model.findOneAndUpdate(
    { uid, _id: attemptId, status: "requested", consumed: false, expiresAt: { $gt: now } },
    { $set: { consumed: true } },
    { new: true },
  ).lean<AgeAssuranceAttemptRecord | null>();
}

export async function releaseAgeAssuranceAttempt(uid: string, attemptId: string): Promise<void> {
  const Model = await getAgeAssuranceAttemptModel();
  await Model.updateOne(
    { uid, _id: attemptId, status: "requested", consumed: true },
    { $set: { consumed: false } },
  );
}

export async function markAgeAssuranceAttemptExpired(uid: string, attemptId: string): Promise<void> {
  const Model = await getAgeAssuranceAttemptModel();
  await Model.updateOne(
    { uid, _id: attemptId },
    { $set: { status: "expired", outcome: "EXPIRED", consumed: true } },
  );
}

export async function markAgeAssuranceAttemptFailed(uid: string, attemptId: string): Promise<void> {
  const Model = await getAgeAssuranceAttemptModel();
  await Model.updateOne(
    { uid, _id: attemptId, consumed: true },
    { $set: { status: "failed", outcome: "FAILED" } },
  );
}

export async function markAgeAssuranceAttemptCompleted(
  uid: string,
  attemptId: string,
  input: { outcome: AgeAssuranceOutcome; resultFetchedAt: Date },
): Promise<void> {
  const Model = await getAgeAssuranceAttemptModel();
  const result = await Model.updateOne(
    { uid, _id: attemptId, status: "requested", consumed: true },
    { $set: { status: "completed", outcome: input.outcome, resultFetchedAt: input.resultFetchedAt } },
  );
  if (result.matchedCount !== 1) throw new Error("Age assurance attempt completion state changed");
}

export async function findAgeAssuranceState(uid: string): Promise<AgeAssuranceStateRecord | null> {
  const Model = await getAgeAssuranceStateModel();
  return Model.findOne({ uid }).lean<AgeAssuranceStateRecord | null>();
}

export async function upsertAgeAssuranceState(input: AgeAssuranceStateRecord): Promise<AgeAssuranceStateRecord> {
  const Model = await getAgeAssuranceStateModel();
  const result = await Model.findOneAndUpdate(
    { uid: input.uid },
    { $set: input },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean<AgeAssuranceStateRecord | null>();
  if (!result) throw new Error("Age assurance state could not be stored");
  return result;
}

export async function deleteAgeAssuranceUserData(uid: string): Promise<void> {
  const [attempts, states] = await Promise.all([getAgeAssuranceAttemptModel(), getAgeAssuranceStateModel()]);
  await Promise.all([attempts.deleteMany({ uid }), states.deleteOne({ uid })]);
}
