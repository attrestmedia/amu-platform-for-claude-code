import "server-only";
import crypto from "crypto";
import mongoose from "mongoose";
import { dbConnect } from "libs/database/mongoose";
import { getModel } from "libs/database/modelCache";
import { MONGODB_USERS_URL, NEXTAUTH_URL } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import {
  AccountDeletionRequestSchema,
  type IAccountDeletionRequestDocument,
  type IUserDocument,
  type IUserIndexDocument,
  UserIndexSchema,
  UserSchema,
} from "models/user";
import { accountIdentityHash } from "./accountIdentity";
import { ACCOUNT_DELETION_MANUAL_REASON_CODES } from "./accountDeletionState";
import {
  holdAccountDeletion,
  manualRetryAccountDeletion,
  releaseAccountDeletionHold,
} from "./accountDeletionStore";
import {
  buildAccountDeletionRequestedMail,
  enqueueInternalNotification,
} from "libs/server-utils/mail/internalNotification";
import { unsubscribeNewsletterByIdentity } from "libs/server-utils/mail/newsletterSubscriberService";

type Source = "platform" | "magazine";
const ACTIVE_REQUEST_STATUSES = ["requested", "review_required", "accepted", "processing", "failed"] as const;
type ActiveRequestStatus = (typeof ACTIVE_REQUEST_STATUSES)[number];

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);
}

function normalizeDeletionKey(value: unknown, fallback: string) {
  const key = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(key) ? key : null;
}

function normalizeLegacyRequestId(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim();
  return /^[1-9][0-9]{0,63}$/.test(normalized) ? normalized : null;
}

function activeRequestFilter(uid: string) {
  return { uid, status: { $in: ACTIVE_REQUEST_STATUSES } };
}

async function findCanonicalRequest(
  DeletionModel: mongoose.Model<IAccountDeletionRequestDocument>,
  args: { uid: string; source: Source; idempotencyKey: string; legacyRequestId?: string },
) {
  const byKey = await DeletionModel.findOne({ source: args.source, idempotencyKey: args.idempotencyKey }).sort({ createdAt: -1 });
  if (byKey) return byKey;

  if (args.legacyRequestId) {
    const byLegacy = await DeletionModel.findOne({ source: args.source, legacyRequestId: args.legacyRequestId }).sort({ createdAt: -1 });
    if (byLegacy) return byLegacy;
  }

  const active = await DeletionModel.findOne(activeRequestFilter(args.uid)).sort({ createdAt: 1 });
  if (active) return active;
  return null;
}

async function createCanonicalRequest(
  DeletionModel: mongoose.Model<IAccountDeletionRequestDocument>,
  input: Omit<IAccountDeletionRequestDocument, keyof mongoose.Document>,
) {
  try {
    return { request: await DeletionModel.create(input), created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const request = await findCanonicalRequest(DeletionModel, {
      uid: input.uid,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      legacyRequestId: input.legacyRequestId,
    });
    if (!request) throw error;
    return { request, created: false };
  }
}

function canonicalResult(
  request: IAccountDeletionRequestDocument,
  snapshot: Awaited<ReturnType<typeof getAccountLifecycle>>,
) {
  if (request.uid !== snapshot.uid) {
    return {
      ok: false as const,
      status: 409,
      errorCode: "IDEMPOTENCY_KEY_CONFLICT",
      retryable: false,
      snapshot: undefined,
    };
  }
  if (request.reasonCode === "ADMIN_ACCOUNT_DELETION_FORBIDDEN") {
    return {
      ok: false as const,
      status: 403,
      errorCode: "ADMIN_ACCOUNT_DELETION_FORBIDDEN",
      requestId: request.requestId,
      retryable: false,
      snapshot,
    };
  }
  if (request.reasonCode === "REFUND_REVIEW_REQUIRED") {
    return {
      ok: false as const,
      status: 409,
      errorCode: "REFUND_REVIEW_REQUIRED",
      requestId: request.requestId,
      retryable: false,
      snapshot,
    };
  }
  if (request.status === "failed") {
    return {
      ok: false as const,
      status: request.retryable ? 503 : 409,
      errorCode: request.lastErrorCode || "ACCOUNT_DELETION_FAILED",
      requestId: request.requestId,
      retryable: request.retryable === true,
      snapshot,
    };
  }
  if (ACTIVE_REQUEST_STATUSES.includes(request.status as ActiveRequestStatus)) {
    return {
      ok: true as const,
      status: 202,
      requestId: request.requestId,
      accountStatus: "deletion_pending" as const,
      wordpressStatus: "not_linked" as const,
      deduplicated: true,
    };
  }
  return {
    ok: true as const,
    status: 200,
    requestId: request.requestId,
    requestStatus: request.status,
    accountStatus: snapshot.accountStatus,
    deduplicated: true,
  };
}

async function models(uid: string) {
  const conn = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
  const DeletionModel: mongoose.Model<IAccountDeletionRequestDocument> =
    (conn.models.AccountDeletionRequest as mongoose.Model<IAccountDeletionRequestDocument> | undefined) ||
    conn.model<IAccountDeletionRequestDocument>(
      "AccountDeletionRequest",
      AccountDeletionRequestSchema,
      "account_deletion_requests",
    );
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
  return { UserIndexModel, DeletionModel, UserModel };
}

export async function getAccountLifecycle(uid: string, email?: string) {
  const { UserIndexModel, DeletionModel, UserModel } = await models(uid);
  const [index, user, latestRequest] = await Promise.all([
    UserIndexModel.findOne({ $or: [{ uid }, ...(email ? [{ userEmailLower: email.toLowerCase() }] : [])] }).lean(),
    UserModel.findOne({ uid }).lean(),
    DeletionModel.findOne({ uid }).sort({ createdAt: -1 }).lean(),
  ]);
  const membershipExpiresAt = user?.wallet?.membership?.expiresAt
    ? new Date(user.wallet.membership.expiresAt)
    : null;
  const membershipCoins =
    !membershipExpiresAt || membershipExpiresAt.getTime() > Date.now()
      ? Math.max(0, Number(user?.wallet?.membership?.coins || 0))
      : 0;
  const chargedCoins = Math.max(0, Number(user?.wallet?.charged?.coins || 0));
  const bonusCoins = Math.max(0, Number(user?.wallet?.bonus?.coins || 0));
  const periodEnd = user?.subscription?.currentPeriodEnd ? new Date(user.subscription.currentPeriodEnd) : null;
  const subscriptionActive = user?.subscription?.active === true && (!periodEnd || periodEnd.getTime() > Date.now());
  const roles = Array.isArray(user?.roles) ? user.roles.map(String) : [];
  const isAdministrator = roles.includes("administrator");
  const needsReview = chargedCoins > 0 || membershipCoins > 0 || subscriptionActive;
  const legalHold = Boolean(latestRequest?.legalHold);
  return {
    uid: index?.uid || uid,
    email: index?.userEmail || email || user?.userEmail || "",
    accountStatus: index?.accountStatus || user?.accountStatus || "active",
    providers: (index?.providers || []).map((item) => item.provider),
    balances: { bonusCoins, membershipCoins, chargedCoins, subscriptionActive },
    deletionRequest: latestRequest
      ? {
          requestId: latestRequest.requestId,
          status: latestRequest.status,
          reasonCode: latestRequest.reasonCode || null,
          createdAt: latestRequest.createdAt,
          stages: latestRequest.stages,
          legalHold: Boolean(latestRequest.legalHold),
        }
      : null,
    deletionBlockReason: isAdministrator
      ? "ADMIN_ACCOUNT_DELETION_FORBIDDEN"
      : legalHold
        ? "LEGAL_HOLD"
        : needsReview
          ? "REFUND_REVIEW_REQUIRED"
          : null,
    canDeleteAutomatically: !isAdministrator && !needsReview && !legalHold,
  };
}

export async function requestAccountDeletion(args: {
  uid: string;
  email: string;
  source: Source;
  idempotencyKey?: string;
  legacyRequestId?: string;
}) {
  const uid = String(args.uid || "").trim();
  const email = String(args.email || "").trim().toLowerCase();
  const idempotencyKey = normalizeDeletionKey(args.idempotencyKey, `${args.source}:${uid}`);
  const legacyRequestId = normalizeLegacyRequestId(args.legacyRequestId);
  if (!uid || !email || !idempotencyKey || legacyRequestId === null) {
    return { ok: false as const, status: 400, errorCode: "INVALID_INPUT", retryable: false, snapshot: undefined };
  }

  const snapshot = await getAccountLifecycle(args.uid, args.email);
  const { UserIndexModel, DeletionModel, UserModel } = await models(snapshot.uid);
  const canonicalIndex = await UserIndexModel.findOne({ uid, userEmailLower: email }).lean();
  if (!canonicalIndex || snapshot.uid !== uid) {
    return {
      ok: false as const,
      status: 409,
      errorCode: "ACCOUNT_IDENTITY_MISMATCH",
      retryable: false,
      snapshot: undefined,
    };
  }

  const activeKey = `uid:${uid}`;
  const existing = await findCanonicalRequest(DeletionModel, {
    uid,
    source: args.source,
    idempotencyKey,
    legacyRequestId,
  });
  if (existing) return canonicalResult(existing, snapshot);

  const user = await UserModel.findOne({ uid: snapshot.uid });
  const roles = Array.isArray(user?.roles) ? user.roles.map(String) : [];
  if (roles.includes("administrator")) {
    const created = await createCanonicalRequest(DeletionModel, {
      requestId: crypto.randomUUID(),
      uid,
      identityHash: accountIdentityHash(snapshot.email || email),
      idempotencyKey,
      activeKey,
      ...(legacyRequestId ? { legacyRequestId } : {}),
      source: args.source,
      status: "review_required",
      reasonCode: "ADMIN_ACCOUNT_DELETION_FORBIDDEN",
      retryCount: 0,
      stages: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    if (!created.created) return canonicalResult(created.request, snapshot);
    return {
      ok: false as const,
      status: 403,
      errorCode: "ADMIN_ACCOUNT_DELETION_FORBIDDEN",
      requestId: created.request.requestId,
      retryable: false,
      snapshot,
    };
  }

  const needsReview =
    snapshot.balances.chargedCoins > 0 ||
    snapshot.balances.membershipCoins > 0 ||
    snapshot.balances.subscriptionActive;
  try {
    // 자동 탈퇴로 계정 접근을 차단하기 전에 뉴스레터 수신을 먼저 끊는다.
    // 별도 원장에 대한 동기화가 실패하면 탈퇴 접수도 fail-closed로 멈춘다.
    await unsubscribeNewsletterByIdentity({
      uid,
      email: snapshot.email || args.email,
      source: "system",
      method: "account_deletion",
    });
  } catch {
    return {
      ok: false as const,
      status: 503,
      errorCode: "NEWSLETTER_SYNC_FAILED",
      retryable: true,
      snapshot,
    };
  }
  const requestId = crypto.randomUUID();
  const identityHash = accountIdentityHash(snapshot.email || args.email);
  const recipientEmail = snapshot.email || args.email;
  const accountUrl = `${NEXTAUTH_URL.replace(/\/$/, "")}/account`;
  if (needsReview) {
    const created = await createCanonicalRequest(DeletionModel, {
      requestId,
      uid,
      identityHash,
      idempotencyKey,
      activeKey,
      ...(legacyRequestId ? { legacyRequestId } : {}),
      source: args.source,
      status: "review_required",
      reasonCode: "REFUND_REVIEW_REQUIRED",
      retryCount: 0,
      stages: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    if (!created.created) return canonicalResult(created.request, snapshot);
    const request = created.request;
    await enqueueInternalNotification(
      buildAccountDeletionRequestedMail({
        requestId: request.requestId,
        recipientEmail,
        requestedAt: request.createdAt,
        supportUrl: accountUrl,
        reviewRequired: true,
      }),
      "account.deletion_review_required",
    );
    return {
      ok: false as const,
      status: 409,
      errorCode: "REFUND_REVIEW_REQUIRED",
      requestId: request.requestId,
      retryable: false,
      snapshot,
    };
  }

  const now = new Date();
  let request: IAccountDeletionRequestDocument | undefined;
  const session = await UserModel.db.startSession();
  try {
    await session.withTransaction(async () => {
      const rows = await DeletionModel.create([{
        requestId,
        uid,
        identityHash,
        idempotencyKey,
        activeKey,
        ...(legacyRequestId ? { legacyRequestId } : {}),
        source: args.source,
        status: "requested",
        retryCount: 0,
        stages: { accessBlockedAt: now },
        createdAt: now,
        updatedAt: now,
      }], { session });
      request = rows[0];
      const indexUpdate = await UserIndexModel.updateOne(
        { uid: snapshot.uid },
        { $set: { accountStatus: "deletion_pending", deletionRequestedAt: now, identityHash, providers: [] } },
        { session },
      );
      await UserModel.updateOne(
        { uid: snapshot.uid },
        { $set: { accountStatus: "deletion_pending", deletionRequestedAt: now, providers: [] } },
        { session },
      );
      if (indexUpdate.matchedCount !== 1) {
        throw new Error("ACCOUNT_DELETION_ACCESS_BLOCK_FAILED");
      }
      request.status = "accepted";
      request.markModified("stages");
      await request.save({ session });
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existingAfterRace = await findCanonicalRequest(DeletionModel, {
      uid,
      source: args.source,
      idempotencyKey,
      legacyRequestId,
    });
    if (!existingAfterRace) throw error;
    return canonicalResult(existingAfterRace, snapshot);
  } finally {
    await session.endSession();
  }
  if (!request) return { ok: false as const, status: 500, errorCode: "INTERNAL_ERROR", retryable: true, snapshot: undefined };
  await enqueueInternalNotification(
    buildAccountDeletionRequestedMail({
      requestId: request.requestId,
      recipientEmail,
      requestedAt: request.createdAt,
      supportUrl: accountUrl,
    }),
    "account.deletion_requested",
  );
  return {
    ok: true as const,
    status: 202,
    requestId: request.requestId,
    accountStatus: "deletion_pending" as const,
    requestStatus: request.status,
    wordpressStatus: "pending" as const,
    deduplicated: false,
  };
}

export async function releaseAccountDeletionForProcessing(args: {
  requestId: string;
  actorHash: string;
  reasonCode: string;
}) {
  if (!/^[a-f0-9]{64}$/.test(args.actorHash) || !ACCOUNT_DELETION_MANUAL_REASON_CODES.includes(args.reasonCode as never)) {
    return { ok: false as const, status: 403, errorCode: "MANUAL_RETRY_NOT_ALLOWED", retryable: false };
  }
  const requestLookup = await dbConnect(MONGODB_USERS_URL);
  const DeletionModel: mongoose.Model<IAccountDeletionRequestDocument> =
    (requestLookup.models.AccountDeletionRequest as mongoose.Model<IAccountDeletionRequestDocument> | undefined) ||
    requestLookup.model<IAccountDeletionRequestDocument>("AccountDeletionRequest", AccountDeletionRequestSchema, "account_deletion_requests");
  const pending = await DeletionModel.findOne({ requestId: args.requestId, status: "review_required", legalHold: { $exists: false } }).lean();
  if (!pending) return { ok: false as const, status: 409, errorCode: "INVALID_STATE", retryable: false };
  const { UserIndexModel, UserModel } = await models(pending.uid);
  const snapshot = await getAccountLifecycle(pending.uid);
  if (!snapshot.canDeleteAutomatically) {
    return { ok: false as const, status: 409, errorCode: "MANUAL_REVIEW_REQUIRED", retryable: false };
  }
  const now = new Date();
  const session = await UserModel.db.startSession();
  try {
    let updated = false;
    await session.withTransaction(async () => {
      const current = await DeletionModel.findOne({ requestId: args.requestId, status: "review_required" }).session(session);
      if (!current) return;
      const indexUpdate = await UserIndexModel.updateOne(
        { uid: pending.uid },
        { $set: { accountStatus: "deletion_pending", deletionRequestedAt: now, identityHash: pending.identityHash, providers: [] } },
        { session },
      );
      const userUpdate = await UserModel.updateOne(
        { uid: pending.uid },
        { $set: { accountStatus: "deletion_pending", deletionRequestedAt: now, providers: [] } },
        { session },
      );
      if (indexUpdate.matchedCount !== 1 || userUpdate.matchedCount !== 1) {
        throw new Error("ACCOUNT_DELETION_ACCESS_BLOCK_FAILED");
      }
      current.status = "accepted";
      current.reasonCode = undefined;
      current.retryable = true;
      current.stages.accessBlockedAt = now;
      current.manualAction = { kind: "release", actorHash: args.actorHash, reasonCode: args.reasonCode, at: now };
      current.auditEvents = [
        ...(current.auditEvents || []),
        { kind: "manual_release", actorHash: args.actorHash, reasonCode: args.reasonCode, at: now },
      ];
      current.markModified("reasonCode");
      current.markModified("stages");
      current.markModified("auditEvents");
      await current.save({ session });
      updated = true;
    });
    return updated
      ? { ok: true as const, status: 202, requestId: args.requestId, requestStatus: "accepted" as const, retryable: false }
      : { ok: false as const, status: 409, errorCode: "INVALID_STATE", retryable: false };
  } finally {
    await session.endSession();
  }
}

async function deletionModelOnly() {
  const conn = await dbConnect(MONGODB_USERS_URL);
  return (
    (conn.models.AccountDeletionRequest as mongoose.Model<IAccountDeletionRequestDocument> | undefined) ||
    conn.model<IAccountDeletionRequestDocument>("AccountDeletionRequest", AccountDeletionRequestSchema, "account_deletion_requests")
  );
}

export async function holdAccountDeletionForLegal(args: { requestId: string; actorHash: string; reasonCode: string }) {
  if (!/^[a-f0-9]{64}$/.test(args.actorHash)) {
    return { ok: false as const, status: 403, errorCode: "HOLD_NOT_ALLOWED", retryable: false };
  }
  const DeletionModel = await deletionModelOnly();
  const result = await holdAccountDeletion(DeletionModel, args);
  return result.ok
    ? { ok: true as const, status: 200, requestId: args.requestId }
    : { ok: false as const, status: 409, errorCode: result.errorCode, retryable: false };
}

export async function releaseAccountDeletionHoldForProcessing(args: { requestId: string; actorHash: string; reasonCode: string }) {
  if (!/^[a-f0-9]{64}$/.test(args.actorHash)) {
    return { ok: false as const, status: 403, errorCode: "HOLD_NOT_ALLOWED", retryable: false };
  }
  const DeletionModel = await deletionModelOnly();
  const result = await releaseAccountDeletionHold(DeletionModel, args);
  return result.ok
    ? { ok: true as const, status: 200, requestId: args.requestId }
    : { ok: false as const, status: 409, errorCode: result.errorCode, retryable: false };
}

export async function retryAccountDeletion(args: { requestId: string; actorHash: string; reasonCode: string }) {
  if (!/^[a-f0-9]{64}$/.test(args.actorHash)) {
    return { ok: false as const, status: 403, errorCode: "MANUAL_RETRY_NOT_ALLOWED", retryable: false };
  }
  const DeletionModel = await deletionModelOnly();
  const result = await manualRetryAccountDeletion(DeletionModel, args);
  return result.ok
    ? { ok: true as const, status: 200, requestId: args.requestId, requestStatus: "accepted" as const }
    : { ok: false as const, status: 409, errorCode: result.errorCode, retryable: false };
}
