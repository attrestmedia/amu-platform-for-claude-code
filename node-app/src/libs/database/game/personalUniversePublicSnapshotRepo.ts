import "server-only";

import { randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  PersonalUniversePublicSnapshotReportSchema,
  PersonalUniversePublicSnapshotSchema,
  type IPersonalUniversePublicSnapshotDocument,
  type IPersonalUniversePublicSnapshotReportDocument,
} from "models/game";
import type {
  IPersonalUniversePublicSnapshotDoc,
  IPersonalUniversePublicSnapshotReportDoc,
  PublicUniverseReportReason,
  PublicUniverseSnapshotContent,
  PublicUniverseSnapshotVisibility,
} from "types/game";
import { getPersonalUniverseForOwner } from "./personalUniverseRepo";

/**
 * @docHint
 * @purpose 공개 Universe Snapshot과 신고의 별도 저장 경계
 * @process owner check  immutable content draft  moderation-approved publish  report withdrawal
 * @domain narrative-canon.personal-universe.public
 * @scope database.game
 */

function safeId(value: unknown, max = 160) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= max && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized) ? normalized : "";
}

function duplicate(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export async function getPersonalUniversePublicSnapshotModel(): Promise<Model<IPersonalUniversePublicSnapshotDocument>> {
  return getModel<IPersonalUniversePublicSnapshotDocument>(
    MONGODB_GAME_URL,
    "PersonalUniversePublicSnapshot",
    PersonalUniversePublicSnapshotSchema,
    "personal_universe_public_snapshots",
  );
}

export async function getPersonalUniversePublicSnapshotReportModel(): Promise<Model<IPersonalUniversePublicSnapshotReportDocument>> {
  return getModel<IPersonalUniversePublicSnapshotReportDocument>(
    MONGODB_GAME_URL,
    "PersonalUniversePublicSnapshotReport",
    PersonalUniversePublicSnapshotReportSchema,
    "personal_universe_public_snapshot_reports",
  );
}

export async function getPublishedPersonalUniversePublicSnapshot(snapshotIdInput: string) {
  const snapshotId = safeId(snapshotIdInput);
  if (!snapshotId) return null;
  return (await getPersonalUniversePublicSnapshotModel()).findOne({
    snapshotId,
    status: "published",
    moderationStatus: "approved",
    visibility: { $in: ["link", "public"] },
  }).lean<IPersonalUniversePublicSnapshotDoc | null>();
}

export async function listIndexablePersonalUniversePublicSnapshots(limit = 500) {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  return (await getPersonalUniversePublicSnapshotModel()).find({
    status: "published",
    moderationStatus: "approved",
    visibility: "public",
  }).select({ snapshotId: 1, publishedAt: 1, updatedAt: 1 }).sort({ publishedAt: -1 }).limit(boundedLimit).lean<Array<{
    snapshotId: string;
    publishedAt?: Date | null;
    updatedAt?: Date | null;
  }>>();
}

/** Cross-Universe graph는 public·approved Snapshot이 있는 세계만 외부 이동 대상으로 쓴다. */
export async function listPublicUniverseGraphSnapshots(personalUniverseIds: string[]) {
  const ids = Array.from(new Set(personalUniverseIds.map((value) => safeId(value)).filter(Boolean))).slice(0, 100);
  if (!ids.length) return [];
  return (await getPersonalUniversePublicSnapshotModel())
    .find({ personalUniverseId: { $in: ids }, visibility: "public", status: "published", moderationStatus: "approved" })
    .sort({ publishedAt: -1, revision: -1 })
    .select({ snapshotId: 1, personalUniverseId: 1, "content.worldName": 1, publishedAt: 1 })
    .lean<Array<{ snapshotId: string; personalUniverseId: string; content?: { worldName?: string }; publishedAt?: Date | null }>>();
}

/** Matchmaking 내부 조회: public Snapshot만 반환하며 ownerUid는 API 응답으로 직렬화하지 않는다. */
export async function listPublicUniverseMatchSnapshots(personalUniverseIds: string[]) {
  const ids = Array.from(new Set(personalUniverseIds.map((value) => safeId(value)).filter(Boolean))).slice(0, 200);
  if (!ids.length) return [];
  return (await getPersonalUniversePublicSnapshotModel())
    .find({ personalUniverseId: { $in: ids }, visibility: "public", status: "published", moderationStatus: "approved" })
    .sort({ publishedAt: -1, revision: -1 })
    .select({ snapshotId: 1, personalUniverseId: 1, ownerUid: 1, content: 1 })
    .lean<Array<{ snapshotId: string; personalUniverseId: string; ownerUid: string; content: PublicUniverseSnapshotContent }>>();
}

export async function getPublicUniverseMatchSnapshot(snapshotIdInput: string) {
  const snapshotId = safeId(snapshotIdInput);
  if (!snapshotId) return null;
  return (await getPersonalUniversePublicSnapshotModel())
    .findOne({ snapshotId, visibility: "public", status: "published", moderationStatus: "approved" })
    .select({ snapshotId: 1, personalUniverseId: 1, ownerUid: 1, content: 1 })
    .lean<{ snapshotId: string; personalUniverseId: string; ownerUid: string; content: PublicUniverseSnapshotContent } | null>();
}

export async function createPersonalUniversePublicSnapshotDraft(input: {
  ownerUid: string;
  personalUniverseId: string;
  visibility: Exclude<PublicUniverseSnapshotVisibility, "private">;
  moderationPolicyVersion: string;
  content: PublicUniverseSnapshotContent;
}) {
  const ownerUid = safeId(input.ownerUid);
  const personalUniverseId = safeId(input.personalUniverseId);
  if (!ownerUid || !personalUniverseId) throw new Error("PUBLIC_SNAPSHOT_INPUT_INVALID");
  const universe = await getPersonalUniverseForOwner(personalUniverseId, ownerUid);
  if (!universe || universe.status !== "active") throw new Error("PERSONAL_UNIVERSE_NOT_FOUND_OR_FORBIDDEN");
  const model = await getPersonalUniversePublicSnapshotModel();
  const latest = await model.findOne({ personalUniverseId }).sort({ revision: -1 }).lean<{ revision?: number } | null>();
  const revision = Number(latest?.revision || 0) + 1;
  const snapshotId = `pus_${randomUUID().replace(/-/g, "")}`;
  const created = await model.create({
    snapshotId,
    personalUniverseId,
    ownerUid,
    visibility: input.visibility,
    status: "draft",
    moderationStatus: "approved",
    moderationPolicyVersion: input.moderationPolicyVersion,
    revision,
    content: input.content,
  });
  return (created.toObject?.() ?? created) as IPersonalUniversePublicSnapshotDoc;
}

export async function publishPersonalUniversePublicSnapshot(input: { snapshotId: string; ownerUid: string }) {
  const snapshotId = safeId(input.snapshotId);
  const ownerUid = safeId(input.ownerUid);
  if (!snapshotId || !ownerUid) throw new Error("PUBLIC_SNAPSHOT_INPUT_INVALID");
  const updated = await (await getPersonalUniversePublicSnapshotModel()).findOneAndUpdate(
    {
      snapshotId,
      ownerUid,
      status: "draft",
      moderationStatus: "approved",
      visibility: { $in: ["link", "public"] },
    },
    { $set: { status: "published", publishedAt: new Date() } },
    { new: true },
  ).lean<IPersonalUniversePublicSnapshotDoc | null>();
  if (!updated) throw new Error("PUBLIC_SNAPSHOT_NOT_FOUND_OR_NOT_APPROVED");
  return updated;
}

export async function withdrawPersonalUniversePublicSnapshot(input: { snapshotId: string; ownerUid: string }) {
  const snapshotId = safeId(input.snapshotId);
  const ownerUid = safeId(input.ownerUid);
  if (!snapshotId || !ownerUid) throw new Error("PUBLIC_SNAPSHOT_INPUT_INVALID");
  const updated = await (await getPersonalUniversePublicSnapshotModel()).findOneAndUpdate(
    { snapshotId, ownerUid, status: { $in: ["draft", "published"] } },
    { $set: { status: "withdrawn", visibility: "private", withdrawnAt: new Date() } },
    { new: true },
  ).lean<IPersonalUniversePublicSnapshotDoc | null>();
  if (!updated) throw new Error("PUBLIC_SNAPSHOT_NOT_FOUND_OR_FORBIDDEN");
  return updated;
}

export async function reportAndWithdrawPersonalUniversePublicSnapshot(input: {
  snapshotId: string;
  reporterUid: string;
  reason: PublicUniverseReportReason;
  note?: string;
}) {
  const snapshotId = safeId(input.snapshotId);
  const reporterUid = safeId(input.reporterUid);
  if (!snapshotId || !reporterUid) throw new Error("PUBLIC_SNAPSHOT_REPORT_INPUT_INVALID");
  const snapshotModel = await getPersonalUniversePublicSnapshotModel();
  const reportModel = await getPersonalUniversePublicSnapshotReportModel();
  const session = await snapshotModel.db.startSession();
  let result: { report: IPersonalUniversePublicSnapshotReportDoc; changed: boolean } | null = null;
  try {
    await session.withTransaction(async () => {
      const snapshot = await snapshotModel.findOne({ snapshotId, status: "published", visibility: { $in: ["link", "public"] } }).session(session).lean<IPersonalUniversePublicSnapshotDoc | null>();
      if (!snapshot) throw new Error("PUBLIC_SNAPSHOT_NOT_FOUND");
      const existing = await reportModel.findOne({ snapshotId, reporterUid }).session(session).lean<IPersonalUniversePublicSnapshotReportDoc | null>();
      if (existing) {
        result = { report: existing, changed: false };
        return;
      }
      const created = await reportModel.create([{
        reportId: `pusr_${randomUUID().replace(/-/g, "")}`,
        snapshotId,
        ownerUid: snapshot.ownerUid,
        reporterUid,
        reason: input.reason,
        note: String(input.note || "").trim().slice(0, 500),
        status: "pending",
      }], { session });
      const withdrawn = await snapshotModel.findOneAndUpdate(
        { snapshotId, status: "published", visibility: { $in: ["link", "public"] } },
        { $set: { status: "withdrawn", visibility: "private", withdrawnAt: new Date() } },
        { new: true, session },
      ).lean<IPersonalUniversePublicSnapshotDoc | null>();
      if (!withdrawn) throw new Error("PUBLIC_SNAPSHOT_WITHDRAW_FAILED");
      result = { report: (created[0].toObject?.() ?? created[0]) as IPersonalUniversePublicSnapshotReportDoc, changed: true };
    });
  } catch (error) {
    if (duplicate(error)) {
      const raced = await reportModel.findOne({ snapshotId, reporterUid }).lean<IPersonalUniversePublicSnapshotReportDoc | null>();
      if (raced) return { report: raced, changed: false };
    }
    throw error;
  } finally {
    await session.endSession();
  }
  if (!result) throw new Error("PUBLIC_SNAPSHOT_REPORT_FAILED");
  return result;
}
