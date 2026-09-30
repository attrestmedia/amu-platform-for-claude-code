import "server-only";

import crypto from "crypto";
import { dbConnect } from "libs/database/mongoose";
import {
  MONGODB_APPS_URL,
  MONGODB_AMU_URL,
  MONGODB_CONVERSATIONS_URL,
  MONGODB_GAME_URL,
  MONGODB_AI_URL,
  MONGODB_PERSONA_URL,
  MONGODB_SECRETS_URL,
  MONGODB_USERS_URL,
  NEXTAUTH_SECRET,
} from "consts/env/server";
import { AccountDeletionRequestSchema, type IAccountDeletionRequestDocument } from "models/user/AccountDeletionRequestSchema";
import {
  claimAwaitingFinalization,
  checkpointAccountDeletion,
  completeAccountDeletion,
  markAccountDeletionFailure,
  type AccountDeletionModel,
} from "./accountDeletionStore";
import {
  createDocumentR2Deps,
  finalizeOneAccountDeletion,
  matchesDropPrefix,
  readDestructionDocumentPath,
  type DestructionFinalizerDeps,
  type DestructionDocumentR2Target,
  type DestructionTarget,
} from "./accountDeletionDestruction";
import { getAccountLifecycle } from "./accountLifecycleService";
import { deleteR2Object, getR2PrivateBucket, getR2PublicBucket, listR2Objects } from "libs/server-utils/storage/r2Storage";
import { logger } from "utils/log";

// SES-453 production finalizer deps: 실제 Mongo·R2·환불 게이트·tombstone hash를 연결한다.
// allowlist의 database/collection·prefix 매핑은 "제안"이며 apply 전 승인이 필요하다.

const DESTRUCTION_DATABASE_URLS: Record<string, string> = {
  amu: MONGODB_AMU_URL,
  users: MONGODB_USERS_URL,
  persona: MONGODB_PERSONA_URL,
  conversations: MONGODB_CONVERSATIONS_URL,
  game: MONGODB_GAME_URL,
  ai: MONGODB_AI_URL,
  apps: MONGODB_APPS_URL,
  secrets: MONGODB_SECRETS_URL,
};

async function dbFor(database: string) {
  const url = DESTRUCTION_DATABASE_URLS[database];
  if (!url) throw new Error(`UNKNOWN_DESTRUCTION_DATABASE:${database}`);
  const conn = await dbConnect(url);
  if (!conn.db) throw new Error("MONGO_DB_UNAVAILABLE");
  return conn.db;
}

async function mongoCollection(target: DestructionTarget) {
  if (target.kind !== "mongo" || target.scope !== "collection") throw new Error("INVALID_TARGET");
  const db = await dbFor(target.database);
  return db.collection(target.collection);
}

async function matchingCollections(target: DestructionTarget) {
  if (target.kind !== "mongo" || target.scope !== "drop-prefix") throw new Error("INVALID_TARGET");
  const db = await dbFor(target.database);
  const names = (await db.listCollections().toArray()).map((info) => info.name);
  return names.filter((name) => matchesDropPrefix(name, target.prefix));
}

async function docR2Collection(target: DestructionTarget) {
  if (target.kind !== "r2-doc" || target.scope !== "doc-keys") throw new Error("INVALID_TARGET");
  const db = await dbFor(target.database);
  return db.collection(target.collection);
}

// provider 키 컬렉션(user_{provider}:{providerAccountId})은 users_index.providers로 해석한다.
async function providerCollections(uid: string) {
  const db = await dbFor("users");
  const index = await db.collection("users_index").findOne({ uid }).catch(() => null);
  const providers = (index?.providers as Array<{ provider: string; providerAccountId: string }> | undefined) ?? [];
  return providers.map((p) => `user_${p.provider}:${p.providerAccountId}`);
}

const mongo = {
  async list(target: DestructionTarget, uid: string) {
    if (target.kind !== "mongo") throw new Error("INVALID_TARGET");
    if (target.scope === "drop-prefix") {
      const names = await matchingCollections(target);
      return { count: names.length, keys: names };
    }
    if (target.scope === "provider-drop") {
      const db = await dbFor(target.database);
      const existing = new Set((await db.listCollections().toArray()).map((info) => info.name));
      const names = (await providerCollections(uid)).filter((name) => existing.has(name));
      return { count: names.length, keys: names };
    }
    const collection = await mongoCollection(target);
    const count = await collection.countDocuments({ [target.field]: uid });
    const keys = await collection
      .find({ [target.field]: uid }, { projection: { _id: 1 } })
      .limit(100)
      .map((doc) => String(doc._id))
      .toArray();
    return { count, keys };
  },
  async remove(target: DestructionTarget, uid: string) {
    if (target.kind !== "mongo") throw new Error("INVALID_TARGET");
    if (target.scope === "drop-prefix") {
      const db = await dbFor(target.database);
      const names = await matchingCollections(target);
      let deleted = 0;
      for (const name of names) {
        await db.dropCollection(name).catch(() => undefined); // 이미 없으면 무시(멱등)
        deleted += 1;
      }
      return { deleted };
    }
    if (target.scope === "provider-drop") {
      const db = await dbFor(target.database);
      const names = await providerCollections(uid);
      let deleted = 0;
      for (const name of names) {
        await db.dropCollection(name).catch(() => undefined); // 이미 없으면 무시(멱등)
        deleted += 1;
      }
      return { deleted };
    }
    const collection = await mongoCollection(target);
    const result = await collection.deleteMany({ [target.field]: uid });
    return { deleted: result.deletedCount ?? 0 };
  },
};

function r2Bucket(target: DestructionTarget) {
  if (target.kind !== "r2") throw new Error("INVALID_TARGET");
  return target.bucket === "public" ? getR2PublicBucket() : getR2PrivateBucket();
}

const r2 = {
  async list(target: DestructionTarget) {
    if (target.kind !== "r2") throw new Error("INVALID_TARGET");
    const objects = await listR2Objects({ bucket: r2Bucket(target), prefix: target.prefix });
    return { count: objects.length, keys: objects.map((obj) => obj.key) };
  },
  async remove(target: DestructionTarget) {
    if (target.kind !== "r2") throw new Error("INVALID_TARGET");
    const bucket = r2Bucket(target);
    const objects = await listR2Objects({ bucket, prefix: target.prefix });
    let deleted = 0;
    for (const obj of objects) {
      await deleteR2Object({ bucket, key: obj.key }).catch(() => undefined); // 삭제 멱등
      deleted += 1;
    }
    return { deleted };
  },
};

const docR2 = createDocumentR2Deps({
  collectionFor: async (target: DestructionDocumentR2Target) => {
    const collection = await docR2Collection(target);
    return {
      find: (filter, options) => collection.find(filter, { projection: options.projection }),
    };
  },
  fallbackBucketFor: (target, document) => {
    const access = readDestructionDocumentPath(document, target.accessPath);
    return (access === "public" ? "public" : target.defaultAccess) === "public"
      ? getR2PublicBucket()
      : getR2PrivateBucket();
  },
  deleteObject: deleteR2Object,
  log: (event) => logger.info("[accountDeletionDestruction] doc R2 cleanup", event),
});

async function gateCheck(uid: string): Promise<{ allowed: boolean; blockReason?: import("./accountDeletionDestruction").DestructionGateReason }> {
  const lifecycle = await getAccountLifecycle(uid);
  if (!lifecycle.deletionRequest) return { allowed: false, blockReason: "MISSING_LIFECYCLE" };
  if (lifecycle.canDeleteAutomatically) return { allowed: true };
  const blockReason: import("./accountDeletionDestruction").DestructionGateReason =
    lifecycle.deletionBlockReason === "ADMIN_ACCOUNT_DELETION_FORBIDDEN"
      ? "ADMIN_ACCOUNT_DELETION_FORBIDDEN"
      : lifecycle.deletionBlockReason === "LEGAL_HOLD"
        ? "LEGAL_HOLD"
        : "REFUND_REVIEW_REQUIRED";
  return { allowed: false, blockReason };
}

function tombstoneHash(uid: string, requestId: string) {
  return crypto.createHmac("sha256", NEXTAUTH_SECRET).update(`${uid}:${requestId}`).digest("hex");
}

async function destructionModel(): Promise<AccountDeletionModel> {
  const conn = await dbConnect(MONGODB_USERS_URL);
  return (
    (conn.models.AccountDeletionRequest as AccountDeletionModel | undefined) ||
    conn.model<IAccountDeletionRequestDocument>("AccountDeletionRequest", AccountDeletionRequestSchema, "account_deletion_requests")
  );
}

export async function buildDestructionDeps(model: AccountDeletionModel): Promise<DestructionFinalizerDeps> {
  return {
    store: {
      claimAwaitingFinalization: (workerId, now) => claimAwaitingFinalization(model, workerId, now),
      checkpoint: (requestId, workerId, update, now) => checkpointAccountDeletion(model, requestId, workerId, update, now),
      complete: (input, now) => completeAccountDeletion(model, input, now),
      fail: (input, now) => markAccountDeletionFailure(model, { ...input, retryCount: 0 }, now),
    },
    mongo,
    r2,
    docR2,
    gateCheck,
    tombstoneHash,
  };
}

export async function runDestructionWorkerOnce(input: { workerId: string; mode: "dry-run" | "apply"; now?: Date }) {
  const model = await destructionModel();
  const deps = await buildDestructionDeps(model);
  return finalizeOneAccountDeletion(deps, input.workerId, input.mode, input.now ?? new Date());
}
