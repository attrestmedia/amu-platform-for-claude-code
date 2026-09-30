import "server-only";
import { dbConnect } from "libs/database/mongoose";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";

const PID_REGISTRY_COLLECTION = "persona_pid_registry";

async function getPidRegistryCollection() {
  const connection = await dbConnect(MONGODB_PERSONA_URL);
  if (!connection.db) throw new Error("PID_REGISTRY_DB_NOT_READY");
  const col = connection.db.collection(PID_REGISTRY_COLLECTION);
  await col.createIndex({ pid: 1 }, { unique: true }).catch(() => {});
  return col;
}

function buildPidCandidate(universeId: string, name: string) {
  const uni =
    (universeId || "global")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "global";

  const base =
    (name || "persona")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "persona";

  const rand = Math.random().toString(36).slice(2, 6);
  const ts = Date.now().toString(36);
  return `${uni}-${base}-${ts}${rand}`.slice(0, 48);
}

export async function reserveExistingPid(pid: string, universeId: string, collectionName: string) {
  const col = await getPidRegistryCollection();
  const existing = toUnknownRecord(await col.findOne({ pid }));
  if (!existing || Object.keys(existing).length === 0) {
    await col.insertOne({ pid, universeId, collectionName, createdAt: new Date() });
    return;
  }
  if (existing.universeId === universeId && existing.collectionName === collectionName) return;
  throw new Error("PID_CONFLICT");
}

export async function generateGlobalPid(universeId: string, collectionName: string, name: string) {
  const col = await getPidRegistryCollection();
  for (let i = 0; i < 5; i++) {
    const candidate = buildPidCandidate(universeId, name);
    try {
      await col.insertOne({ pid: candidate, universeId, collectionName, createdAt: new Date() });
      return candidate;
    } catch (err: unknown) {
      if (toErrorLike(err).errorCode === 11000) continue;
      throw err;
    }
  }
  throw new Error("PID_GENERATION_FAILED");
}
