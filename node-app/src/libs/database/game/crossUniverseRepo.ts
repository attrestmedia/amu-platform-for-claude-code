import "server-only";

import { randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  CrossUniverseBridgeEventSchema,
  CrossUniverseReportSchema,
  CrossUniverseSharePreferenceSchema,
  CrossUniverseUserBlockSchema,
  type ICrossUniverseBridgeEventDocument,
  type ICrossUniverseReportDocument,
  type ICrossUniverseSharePreferenceDocument,
  type ICrossUniverseUserBlockDocument,
} from "models/game";
import {
  CROSS_UNIVERSE_CONSENT_VERSION,
  type CrossUniverseBridgeEvent,
  type CrossUniverseLocalConsequence,
  type CrossUniverseReport,
  type CrossUniverseReportReason,
  type CrossUniverseSharePreference,
} from "types/game";
import {
  assertCrossUniverseScopes,
  assertCrossUniverseSharePreference,
  assertForeignCharacterReference,
  isCrossUniverseBridgeApproved,
} from "libs/server-utils/narrative/crossUniversePolicy";
import { getPersonalUniverseForOwner } from "./personalUniverseRepo";

/**
 * @docHint
 * @purpose Cross-Universe의 reference-only 저장·안전 철회 경계
 * @process owner check  immutable revision pin  bilateral approval  block/report hide  lifecycle export
 * @domain database.game.cross-universe
 * @scope server
 */

function safeId(value: unknown, max = 160) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= max && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized) ? normalized : "";
}

function repoError(code: string) {
  return new Error(code);
}

export async function getCrossUniverseSharePreferenceModel(): Promise<Model<ICrossUniverseSharePreferenceDocument>> {
  return getModel<ICrossUniverseSharePreferenceDocument>(MONGODB_GAME_URL, "CrossUniverseSharePreference", CrossUniverseSharePreferenceSchema, "cross_universe_share_preferences");
}

export async function getCrossUniverseBridgeEventModel(): Promise<Model<ICrossUniverseBridgeEventDocument>> {
  return getModel<ICrossUniverseBridgeEventDocument>(MONGODB_GAME_URL, "CrossUniverseBridgeEvent", CrossUniverseBridgeEventSchema, "cross_universe_bridge_events");
}

export async function getCrossUniverseUserBlockModel(): Promise<Model<ICrossUniverseUserBlockDocument>> {
  return getModel<ICrossUniverseUserBlockDocument>(MONGODB_GAME_URL, "CrossUniverseUserBlock", CrossUniverseUserBlockSchema, "cross_universe_user_blocks");
}

export async function getCrossUniverseReportModel(): Promise<Model<ICrossUniverseReportDocument>> {
  return getModel<ICrossUniverseReportDocument>(MONGODB_GAME_URL, "CrossUniverseReport", CrossUniverseReportSchema, "cross_universe_reports");
}

export async function getCrossUniverseSharePreference(ownerUidInput: string, personalUniverseIdInput: string) {
  const ownerUid = safeId(ownerUidInput);
  const personalUniverseId = safeId(personalUniverseIdInput);
  if (!ownerUid || !personalUniverseId) return null;
  return (await getCrossUniverseSharePreferenceModel()).findOne({ ownerUid, personalUniverseId }).lean<CrossUniverseSharePreference | null>();
}

export async function getCrossUniverseBridgeById(bridgeIdInput: string) {
  const bridgeId = safeId(bridgeIdInput);
  if (!bridgeId) return null;
  return (await getCrossUniverseBridgeEventModel()).findOne({ bridgeId }).lean<CrossUniverseBridgeEvent | null>();
}

/** Matchmaking은 명시적으로 enabled인 공유 설정만 후보로 읽는다. */
export async function listEnabledCrossUniverseSharePreferences(options?: { excludeOwnerUid?: string; limit?: number }) {
  const excludeOwnerUid = safeId(options?.excludeOwnerUid || "");
  return (await getCrossUniverseSharePreferenceModel())
    .find({ status: "enabled", ...(excludeOwnerUid ? { ownerUid: { $ne: excludeOwnerUid } } : {}) })
    .sort({ enabledAt: -1, personalUniverseId: 1 })
    .limit(Math.max(1, Math.min(200, Math.floor(options?.limit || 100))))
    .lean<CrossUniverseSharePreference[]>();
}

export async function upsertCrossUniverseSharePreference(input: {
  ownerUid: string;
  personalUniverseId: string;
  allowedScopes: CrossUniverseSharePreference["allowedScopes"];
  status: CrossUniverseSharePreference["status"];
  consentVersion: typeof CROSS_UNIVERSE_CONSENT_VERSION;
}) {
  const preference = assertCrossUniverseSharePreference({ ...input });
  const universe = await getPersonalUniverseForOwner(preference.personalUniverseId, preference.ownerUid);
  if (!universe || universe.status !== "active") throw repoError("CROSS_UNIVERSE_UNIVERSE_NOT_FOUND_OR_FORBIDDEN");
  const now = new Date();
  const result = await (await getCrossUniverseSharePreferenceModel()).findOneAndUpdate(
    { ownerUid: preference.ownerUid, personalUniverseId: preference.personalUniverseId },
    {
      $set: {
        status: preference.status,
        allowedScopes: preference.allowedScopes,
        enabledAt: preference.status === "enabled" ? now : null,
        withdrawnAt: preference.status === "withdrawn" ? now : null,
      },
      $setOnInsert: { ownerUid: preference.ownerUid, personalUniverseId: preference.personalUniverseId, consentVersion: preference.consentVersion },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean<CrossUniverseSharePreference | null>();
  if (!result) throw repoError("CROSS_UNIVERSE_SHARE_PREFERENCE_UPSERT_FAILED");
  return result;
}

export async function isCrossUniverseBlocked(uidInput: string, otherUidInput: string) {
  const uid = safeId(uidInput);
  const otherUid = safeId(otherUidInput);
  if (!uid || !otherUid || uid === otherUid) return true;
  const block = await (await getCrossUniverseUserBlockModel()).exists({ $or: [{ ownerUid: uid, blockedUid: otherUid }, { ownerUid: otherUid, blockedUid: uid }] });
  return Boolean(block);
}

/** 차단은 모든 대기·승인 Bridge를 즉시 hidden/withdrawn 상태로 전환한다. */
export async function blockCrossUniverseUser(input: { ownerUid: string; blockedUid: string }) {
  const ownerUid = safeId(input.ownerUid);
  const blockedUid = safeId(input.blockedUid);
  if (!ownerUid || !blockedUid || ownerUid === blockedUid) throw repoError("CROSS_UNIVERSE_BLOCK_INPUT_INVALID");
  const blockModel = await getCrossUniverseUserBlockModel();
  const bridgeModel = await getCrossUniverseBridgeEventModel();
  const session = await bridgeModel.db.startSession();
  try {
    let block;
    await session.withTransaction(async () => {
      block = await blockModel.findOneAndUpdate(
        { ownerUid, blockedUid },
        { $setOnInsert: { ownerUid, blockedUid } },
        { new: true, upsert: true, runValidators: true, session },
      ).lean();
      await bridgeModel.updateMany(
        { $or: [{ requesterUid: ownerUid, hostUid: blockedUid }, { requesterUid: blockedUid, hostUid: ownerUid }, { "guest.ownerUid": ownerUid, hostUid: blockedUid }, { "guest.ownerUid": blockedUid, hostUid: ownerUid }], status: { $in: ["requested", "approved"] } },
        { $set: { status: "blocked", withdrawnAt: new Date() } },
        { session, runValidators: true },
      );
    });
    return block;
  } finally {
    await session.endSession();
  }
}

export async function createCrossUniverseBridgeRequest(input: Omit<CrossUniverseBridgeEvent, "bridgeId" | "status" | "approvals" | "createdAt" | "updatedAt" | "withdrawnAt">) {
  const requesterUid = safeId(input.requesterUid);
  const hostUid = safeId(input.hostUid);
  const hostUniverseId = safeId(input.hostUniverseId);
  const guest = assertForeignCharacterReference(input.guest);
  if (!requesterUid || !hostUid || !hostUniverseId || requesterUid === hostUid || guest.ownerUid === hostUid) throw repoError("CROSS_UNIVERSE_BRIDGE_INPUT_INVALID");
  if (await isCrossUniverseBlocked(requesterUid, hostUid)) throw repoError("CROSS_UNIVERSE_USER_BLOCKED");
  const host = await getPersonalUniverseForOwner(hostUniverseId, hostUid);
  if (!host || host.status !== "active") throw repoError("CROSS_UNIVERSE_HOST_UNIVERSE_FORBIDDEN");
  if (guest.ownerUid !== requesterUid) throw repoError("CROSS_UNIVERSE_FOREIGN_OWNER_FORBIDDEN");
  const localConsequences = input.localConsequences || [];
  if (input.kind === "guest-encounter" && localConsequences.length) throw repoError("CROSS_UNIVERSE_GUEST_LOCAL_CONSEQUENCE_FORBIDDEN");
  if (input.kind === "canon-bridge" && (localConsequences.length !== 1 || localConsequences[0]?.universeId !== guest.sourceUniverseId || !String(localConsequences[0]?.summary || "").trim())) {
    throw repoError("CROSS_UNIVERSE_LOCAL_CONSEQUENCE_INVALID");
  }
  localConsequences.forEach((consequence) => {
    if (consequence.universeId !== guest.sourceUniverseId) throw repoError("CROSS_UNIVERSE_FOREIGN_CANON_MUTATION_FORBIDDEN");
  });
  const [hostPreference, guestPreference] = await Promise.all([
    getCrossUniverseSharePreference(hostUid, hostUniverseId),
    getCrossUniverseSharePreference(guest.ownerUid, guest.sourceUniverseId),
  ]);
  if (!hostPreference || !guestPreference) throw repoError("CROSS_UNIVERSE_SHARE_CONSENT_REQUIRED");
  const approvedScopes = assertCrossUniverseScopes(input.sharedFact.scopes, hostPreference);
  assertCrossUniverseScopes(approvedScopes, guestPreference);
  const bridgeId = `cub_${randomUUID().replace(/-/g, "")}`;
  const created = await (await getCrossUniverseBridgeEventModel()).create({
    ...input,
    sharedFact: { ...input.sharedFact, scopes: approvedScopes },
    localConsequences,
    bridgeId,
    requesterUid,
    hostUid,
    hostUniverseId,
    guest,
    status: "requested",
    approvals: { requesterAt: new Date(), hostAt: null },
  });
  return (created.toObject?.() ?? created) as CrossUniverseBridgeEvent;
}

/** Canon Bridge는 guest owner와 host owner 모두의 명시 승인으로만 승인 상태가 된다. */
export async function approveCrossUniverseBridge(input: { bridgeId: string; actorUid: string; localConsequence?: Omit<CrossUniverseLocalConsequence, "universeId"> }) {
  const bridgeId = safeId(input.bridgeId);
  const actorUid = safeId(input.actorUid);
  if (!bridgeId || !actorUid) throw repoError("CROSS_UNIVERSE_BRIDGE_INPUT_INVALID");
  const model = await getCrossUniverseBridgeEventModel();
  const current = await model.findOne({ bridgeId, status: "requested" }).lean<CrossUniverseBridgeEvent | null>();
  if (!current) throw repoError("CROSS_UNIVERSE_BRIDGE_NOT_PENDING");
  if (![current.requesterUid, current.hostUid].includes(actorUid)) throw repoError("CROSS_UNIVERSE_BRIDGE_APPROVAL_FORBIDDEN");
  if (await isCrossUniverseBlocked(current.requesterUid, current.hostUid)) throw repoError("CROSS_UNIVERSE_USER_BLOCKED");
  const [hostPreference, guestPreference] = await Promise.all([
    getCrossUniverseSharePreference(current.hostUid, current.hostUniverseId),
    getCrossUniverseSharePreference(current.guest.ownerUid, current.guest.sourceUniverseId),
  ]);
  if (!hostPreference || !guestPreference) throw repoError("CROSS_UNIVERSE_SHARE_CONSENT_REQUIRED");
  const approvedScopes = assertCrossUniverseScopes(current.sharedFact.scopes, hostPreference);
  assertCrossUniverseScopes(approvedScopes, guestPreference);
  const isHostApproval = actorUid === current.hostUid;
  const localConsequence = input.localConsequence;
  const localConsequences = current.kind === "canon-bridge" && isHostApproval
    ? [...current.localConsequences.filter((consequence) => consequence.universeId !== current.hostUniverseId), { universeId: current.hostUniverseId, summary: String(localConsequence?.summary || current.sharedFact.summary).trim().slice(0, 1200), relationInterpretation: String(localConsequence?.relationInterpretation || "").trim().slice(0, 600) }]
    : current.localConsequences;
  const approvals = { ...current.approvals, ...(actorUid === current.requesterUid ? { requesterAt: new Date() } : { hostAt: new Date() }) };
  const status = isCrossUniverseBridgeApproved({ kind: current.kind, status: "approved", approvals }) ? "approved" : "requested";
  const updated = await model.findOneAndUpdate({ bridgeId, status: "requested" }, { $set: { approvals, status, localConsequences } }, { new: true, runValidators: true }).lean<CrossUniverseBridgeEvent | null>();
  if (!updated) throw repoError("CROSS_UNIVERSE_BRIDGE_APPROVAL_RACE");
  return updated;
}

export async function withdrawCrossUniverseBridge(input: { bridgeId: string; actorUid: string }) {
  const bridgeId = safeId(input.bridgeId);
  const actorUid = safeId(input.actorUid);
  if (!bridgeId || !actorUid) throw repoError("CROSS_UNIVERSE_BRIDGE_INPUT_INVALID");
  const result = await (await getCrossUniverseBridgeEventModel()).findOneAndUpdate(
    { bridgeId, status: { $in: ["requested", "approved"] }, $or: [{ requesterUid: actorUid }, { hostUid: actorUid }, { "guest.ownerUid": actorUid }] },
    { $set: { status: "withdrawn", withdrawnAt: new Date() } },
    { new: true, runValidators: true },
  ).lean<CrossUniverseBridgeEvent | null>();
  if (!result) throw repoError("CROSS_UNIVERSE_BRIDGE_WITHDRAW_FORBIDDEN");
  return result;
}

export async function createCrossUniverseReport(input: { reporterUid: string; reportedUid: string; bridgeId?: string; reason: CrossUniverseReportReason; note?: string }) {
  const reporterUid = safeId(input.reporterUid);
  const reportedUid = safeId(input.reportedUid);
  const bridgeId = safeId(input.bridgeId || "");
  if (!reporterUid || !reportedUid || reporterUid === reportedUid || String(input.note || "").length > 500) throw repoError("CROSS_UNIVERSE_REPORT_INPUT_INVALID");
  const reportModel = await getCrossUniverseReportModel();
  const blockModel = await getCrossUniverseUserBlockModel();
  const bridgeModel = await getCrossUniverseBridgeEventModel();
  const session = await bridgeModel.db.startSession();
  try {
    let report: CrossUniverseReport | undefined;
    await session.withTransaction(async () => {
      const created = await reportModel.create([{ reportId: `cur_${randomUUID().replace(/-/g, "")}`, reporterUid, reportedUid, bridgeId, reason: input.reason, note: String(input.note || "").trim() }], { session });
      report = (created[0].toObject?.() ?? created[0]) as CrossUniverseReport;
      await blockModel.findOneAndUpdate({ ownerUid: reporterUid, blockedUid: reportedUid }, { $setOnInsert: { ownerUid: reporterUid, blockedUid: reportedUid } }, { new: true, upsert: true, runValidators: true, session });
      await bridgeModel.updateMany(
        { $or: [{ requesterUid: reporterUid, hostUid: reportedUid }, { requesterUid: reportedUid, hostUid: reporterUid }, { "guest.ownerUid": reporterUid, hostUid: reportedUid }, { "guest.ownerUid": reportedUid, hostUid: reporterUid }], status: { $in: ["requested", "approved"] } },
        { $set: { status: "blocked", withdrawnAt: new Date() } },
        { session, runValidators: true },
      );
    });
    if (!report) throw repoError("CROSS_UNIVERSE_REPORT_CREATE_FAILED");
    return report;
  } finally {
    await session.endSession();
  }
}

export async function listCrossUniverseBridgesForUser(uidInput: string, limit = 100) {
  const uid = safeId(uidInput);
  if (!uid) return [];
  return (await getCrossUniverseBridgeEventModel())
    .find({ $or: [{ requesterUid: uid }, { hostUid: uid }, { "guest.ownerUid": uid }], status: { $in: ["requested", "approved"] } })
    .sort({ updatedAt: -1, bridgeId: 1 })
    .limit(Math.max(1, Math.min(200, Math.floor(limit))))
    .lean<CrossUniverseBridgeEvent[]>();
}
