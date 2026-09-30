import "server-only";

import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { dbConnect } from "libs/database/mongoose";
import { MONGODB_USERS_URL } from "consts/env/server";
import { UserFriendshipSchema, UserIndexSchema } from "models/user";
import type { IUserFriendshipDocument, IUserIndexDocument } from "models/user";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { escapeMongoRegex, getPersonaActorId } from "libs/server-utils/persona/personaPolicy";
import { toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

const FRIENDSHIP_COLLECTION = "user_friendships";
const USER_INDEX_COLLECTION = "users_index";
const USER_SEARCH_LIMIT = 20;
const USER_COLLECTION_SCAN_LIMIT = 240;

type UserSearchRow = {
  uid: string;
  userEmail?: string;
  userEmailLower?: string;
  userInfo?: { name?: string; profileImageUrl?: string };
};

type FriendCapability = "giftTutors" | "progressShare" | "presence" | "directChat";

function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

function buildFriendshipId(a: string, b: string) {
  return `fr_${createHash("sha256").update(pairKey(a, b)).digest("hex").slice(0, 32)}`;
}

function safeText(value: unknown, maxLen = 160) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

function maskEmail(email: string) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}***@${domain}`;
}

function isPrimaryUserCollectionName(name: string) {
  if (!name.startsWith("user_")) return false;
  if (name === FRIENDSHIP_COLLECTION || name === USER_INDEX_COLLECTION || name === "user_ai_chat_preferences") {
    return false;
  }
  if (name.startsWith("user_personas_")) return false;
  return !/_Conversation(?:s|Archive|Knowledge|Sessions|Messages|RawBackups)$/.test(name);
}

function buildUserSearchConditions(q: string) {
  const escaped = escapeMongoRegex(q);
  const contains = new RegExp(escaped, "i");

  return {
    indexOr: [
      { "userInfo.name": contains },
      { userEmailLower: contains },
      { userEmail: contains },
    ],
    rawOr: [
      { "userInfo.name": contains },
      { userEmailLower: contains },
      { userEmail: contains },
    ],
  };
}

function normalizeUserSearchRow(raw: unknown, collectionName = ""): UserSearchRow | null {
  const row = toUnknownRecord(raw);
  const userInfo = toUnknownRecord(row.userInfo);
  const uid = safeText(row.uid, 160) || safeText(collectionName.replace(/^user_/, ""), 160);
  const userEmail = safeText(row.userEmail, 200);
  const userEmailLower = safeText(row.userEmailLower || userEmail.toLowerCase(), 200).toLowerCase();
  if (!uid) return null;

  return {
    uid,
    userEmail,
    userEmailLower,
    userInfo: {
      name: safeText(userInfo.name, 80),
      profileImageUrl: safeText(userInfo.profileImageUrl, 1000),
    },
  };
}

function isUserSearchRow(row: UserSearchRow | null): row is UserSearchRow {
  return Boolean(row?.uid);
}

function hasUserSearchDisplayMeta(row: UserSearchRow) {
  return Boolean(String(row.userInfo?.name || "").trim() || String(row.userEmailLower || row.userEmail || "").trim());
}

function dedupeUserSearchRows(rows: UserSearchRow[], actorId: string) {
  const out: UserSearchRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.uid || row.uid === actorId) continue;
    const key = row.uid || row.userEmailLower || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= USER_SEARCH_LIMIT) break;
  }
  return out;
}

async function syncSearchRowsToUserIndex(rows: UserSearchRow[]) {
  const targets = rows.filter((row): row is UserSearchRow & { userEmailLower: string } =>
    Boolean(row.uid && row.userEmailLower),
  );
  if (!targets.length) return;

  const UserIndexModel = await getUserIndexModel();
  await Promise.allSettled(
    targets.map((row) =>
      UserIndexModel.updateOne(
        { userEmailLower: row.userEmailLower },
        {
          $set: {
            uid: row.uid,
            userEmail: row.userEmail || row.userEmailLower,
            userEmailLower: row.userEmailLower,
            ...(row.userInfo?.name ? { "userInfo.name": row.userInfo.name } : {}),
            ...(row.userInfo?.profileImageUrl ? { "userInfo.profileImageUrl": row.userInfo.profileImageUrl } : {}),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      ),
    ),
  );
}

async function searchPrimaryUserCollections(q: string, actorId: string, limit: number, options?: { scanAll?: boolean }) {
  if (limit <= 0) return [];

  const conn = await dbConnect(MONGODB_USERS_URL);
  if (!conn.db) return [];

  const qLower = q.toLowerCase();
  const { rawOr } = buildUserSearchConditions(q);
  const collections = await conn.db.listCollections({}, { nameOnly: true }).toArray();
  const candidates = collections
    .map((collection) => collection.name)
    .filter(isPrimaryUserCollectionName)
    .sort((a, b) => {
      const aName = a.slice("user_".length).toLowerCase();
      const bName = b.slice("user_".length).toLowerCase();
      const aStarts = aName.startsWith(qLower) ? 0 : 1;
      const bStarts = bName.startsWith(qLower) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b);
    })
    .slice(0, options?.scanAll ? undefined : USER_COLLECTION_SCAN_LIMIT);

  const rows: UserSearchRow[] = [];
  for (const collectionName of candidates) {
    if (rows.length >= limit) break;
    const row = await conn.db.collection(collectionName).findOne(
      {
        uid: { $ne: actorId },
        $or: rawOr,
      },
      { projection: { _id: 0, uid: 1, userEmail: 1, userEmailLower: 1, userInfo: 1 } },
    );
    const normalized = normalizeUserSearchRow(row, collectionName);
    if (normalized) rows.push(normalized);
  }

  return dedupeUserSearchRows(rows, actorId).slice(0, limit);
}

async function getFriendshipModel() {
  return getModel<IUserFriendshipDocument>(
    MONGODB_USERS_URL,
    "UserFriendship",
    UserFriendshipSchema,
    FRIENDSHIP_COLLECTION,
  );
}

async function getUserIndexModel() {
  const conn = await dbConnect(MONGODB_USERS_URL);
  return (
    (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, USER_INDEX_COLLECTION)
  );
}

function capabilityEnabled(doc: Partial<IUserFriendshipDocument>, capability: FriendCapability) {
  const value = toUnknownRecord(doc.capabilities)[capability];
  return value === undefined ? true : value === true;
}

async function getUserMetaByActorIds(actorIds: string[]) {
  const ids = [...new Set(actorIds.map((id) => safeText(id)).filter(Boolean))];
  if (!ids.length) return new Map<string, { displayName: string; emailHint: string; profileImageUrl: string }>();

  const UserIndexModel = await getUserIndexModel();
  const rows = await UserIndexModel.find({ uid: { $in: ids } })
    .select({ _id: 0, uid: 1, userEmailLower: 1, userInfo: 1 })
    .lean();
  const out = new Map<string, { displayName: string; emailHint: string; profileImageUrl: string }>();
  rows.forEach((row) => {
    out.set(String(row.uid || ""), {
      displayName: String(row.userInfo?.name || "").trim(),
      emailHint: maskEmail(String(row.userEmailLower || "").trim()),
      profileImageUrl: String(row.userInfo?.profileImageUrl || "").trim(),
    });
  });
  return out;
}

export function toFriendClient(
  doc: Partial<IUserFriendshipDocument>,
  actorId: string,
  meta?: { displayName?: string; emailHint?: string; profileImageUrl?: string },
) {
  const requesterActorId = String(doc.requesterActorId || "");
  const recipientActorId = String(doc.recipientActorId || "");
  const friendActorId = requesterActorId === actorId ? recipientActorId : requesterActorId;
  return {
    friendshipId: String(doc.friendshipId || ""),
    actorId: friendActorId,
    displayName: meta?.displayName || "",
    emailHint: meta?.emailHint || "",
    profileImageUrl: meta?.profileImageUrl || "",
    requesterActorId,
    recipientActorId,
    status: doc.status || "pending",
    direction: requesterActorId === actorId ? "outgoing" : "incoming",
    capabilities: {
      giftTutors: capabilityEnabled(doc, "giftTutors"),
      progressShare: capabilityEnabled(doc, "progressShare"),
      presence: capabilityEnabled(doc, "presence"),
      directChat: capabilityEnabled(doc, "directChat"),
    },
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

export async function assertAcceptedFriendship(
  actorId: string,
  friendActorId: string,
  capability: FriendCapability = "giftTutors",
) {
  if (!actorId || !friendActorId || actorId === friendActorId) return false;
  const Model = await getFriendshipModel();
  const doc = await Model.findOne({
    actorPairKey: pairKey(actorId, friendActorId),
    status: "accepted",
  }).lean();
  return Boolean(doc && capabilityEnabled(doc, capability));
}

export async function listAcceptedFriendActorIds(actorId: string, capability?: FriendCapability) {
  if (!actorId) return [];
  const Model = await getFriendshipModel();
  const rows = await Model.find({
    status: "accepted",
    $or: [{ requesterActorId: actorId }, { recipientActorId: actorId }],
  }).lean();
  return rows
    .filter((row) => !capability || capabilityEnabled(row, capability))
    .map((row) => (row.requesterActorId === actorId ? row.recipientActorId : row.requesterActorId));
}

export async function searchUsersForFriends(request: Request, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = safeText(searchParams.get("q"), 80);
  const deep = searchParams.get("deep") === "1";
  if (q.length < 2) return NextResponse.json({ success: true, data: [] });

  const UserIndexModel = await getUserIndexModel();
  const { indexOr } = buildUserSearchConditions(q);
  const indexRows = await UserIndexModel.find({
    uid: { $ne: actorId },
    $or: indexOr,
  })
    .select({ _id: 0, uid: 1, userEmail: 1, userEmailLower: 1, userInfo: 1 })
    .limit(USER_SEARCH_LIMIT)
    .lean();
  let rows = dedupeUserSearchRows(indexRows.map((row) => normalizeUserSearchRow(row)).filter(isUserSearchRow), actorId);

  if (deep || rows.length < USER_SEARCH_LIMIT) {
    const fallbackRows = await searchPrimaryUserCollections(q, actorId, USER_SEARCH_LIMIT, { scanAll: deep }).catch(
      (error) => {
        logger.warn("[friends] primary user collection fallback failed", error);
        return [] as UserSearchRow[];
      },
    );
    if (fallbackRows.length) {
      await syncSearchRowsToUserIndex(fallbackRows);
      rows = dedupeUserSearchRows([...rows, ...fallbackRows], actorId);
    }
  }

  rows = rows.filter(hasUserSearchDisplayMeta);

  const Model = await getFriendshipModel();
  const actorIds = rows.map((row) => String(row.uid || "")).filter(Boolean);
  const existing = actorIds.length
    ? await Model.find({ actorPairKey: { $in: actorIds.map((id) => pairKey(actorId, id)) } }).lean()
    : [];
  const existingByFriend = new Map(
    existing.map((row) => [
      row.requesterActorId === actorId ? row.recipientActorId : row.requesterActorId,
      toFriendClient(row, actorId),
    ]),
  );

  return NextResponse.json({
    success: true,
    data: rows.map((row) => {
      const nextActorId = String(row.uid || "");
      const emailHint = maskEmail(String(row.userEmailLower || row.userEmail || "").trim().toLowerCase());
      return {
        actorId: nextActorId,
        displayName: String(row.userInfo?.name || "").trim() || emailHint,
        emailHint,
        profileImageUrl: String(row.userInfo?.profileImageUrl || "").trim(),
        friendship: existingByFriend.get(nextActorId) || null,
      };
    }),
  });
}

export async function listFriendships(_body: unknown, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

  const Model = await getFriendshipModel();
  const rows = await Model.find({
    $or: [{ requesterActorId: actorId }, { recipientActorId: actorId }],
    status: { $in: ["pending", "accepted"] },
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  const metaByActorId = await getUserMetaByActorIds(
    rows.map((row) => (row.requesterActorId === actorId ? row.recipientActorId : row.requesterActorId)),
  );

  return NextResponse.json({
    success: true,
    data: rows.map((row) => {
      const friendActorId = row.requesterActorId === actorId ? row.recipientActorId : row.requesterActorId;
      return toFriendClient(row, actorId, metaByActorId.get(friendActorId));
    }),
  });
}

export async function mutateFriendship(body: Record<string, unknown>, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

  const action = safeText(body.action, 40).toLowerCase();
  const friendActorId = safeText(body.actorId || body.friendActorId || body.recipientActorId, 160);
  const friendshipId = safeText(body.friendshipId, 80);
  const Model = await getFriendshipModel();
  const now = new Date();

  if (action === "request") {
    if (!friendActorId || friendActorId === actorId) {
      return NextResponse.json({ success: false, error: "invalid_friend" }, { status: 400 });
    }

    const key = pairKey(actorId, friendActorId);
    const existing = await Model.findOne({ actorPairKey: key }).lean();
    if (existing?.status === "blocked") {
      return NextResponse.json({ success: false, error: "friendship_blocked" }, { status: 403 });
    }
    if (existing?.status === "pending" || existing?.status === "accepted") {
      return NextResponse.json({ success: true, data: toFriendClient(existing, actorId) });
    }

    const next = await Model.findOneAndUpdate(
      { actorPairKey: key },
      {
        $set: {
          friendshipId: buildFriendshipId(actorId, friendActorId),
          actorPairKey: key,
          requesterActorId: actorId,
          recipientActorId: friendActorId,
          status: "pending",
          requestedAt: now,
          capabilities: { giftTutors: true, progressShare: true, presence: false, directChat: false },
        },
        $unset: {
          acceptedAt: "",
          declinedAt: "",
          cancelledAt: "",
          removedAt: "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return NextResponse.json({ success: true, data: toFriendClient(next || {}, actorId) });
  }

  if (action === "accept") {
    const next = await Model.findOneAndUpdate(
      { friendshipId, recipientActorId: actorId, status: "pending" },
      { $set: { status: "accepted", acceptedAt: now } },
      { new: true },
    ).lean();
    if (!next) return NextResponse.json({ success: false, error: "friend_request_not_found" }, { status: 404 });
    return NextResponse.json({ success: true, data: toFriendClient(next, actorId) });
  }

  if (action === "decline" || action === "cancel" || action === "remove") {
    const status = action === "decline" ? "declined" : action === "cancel" ? "cancelled" : "removed";
    const timestampKey = status === "declined" ? "declinedAt" : status === "cancelled" ? "cancelledAt" : "removedAt";
    const next = await Model.findOneAndUpdate(
      {
        friendshipId,
        $or: [{ requesterActorId: actorId }, { recipientActorId: actorId }],
        status: { $in: ["pending", "accepted"] },
      },
      { $set: { status, [timestampKey]: now } },
      { new: true },
    ).lean();
    if (!next) return NextResponse.json({ success: false, error: "friendship_not_found" }, { status: 404 });
    return NextResponse.json({ success: true, data: toFriendClient(next, actorId) });
  }

  return NextResponse.json({ success: false, error: "invalid_action" }, { status: 400 });
}
