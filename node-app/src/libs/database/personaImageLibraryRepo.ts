import crypto from "crypto";
import { getModel } from "libs/database/modelCache";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import {
  PersonaImageLibraryAssetSchema,
  type IPersonaImageLibraryAssetDocument,
} from "models/user";
import type {
  PersonaImageLibraryAssetType,
  PersonaImageLibrarySourceType,
  PersonaImageLibraryStatusType,
} from "types/ai";

const COLLECTION = "persona_image_library_assets";

export function createPersonaImageLibraryAssetId() {
  return `persona_img_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

function normalizeSource(source: unknown): PersonaImageLibrarySourceType {
  const value = toSafeString(source, 80);
  if (value === "generated" || value === "imported") return value;
  return "uploaded_reference";
}

function normalizeStatus(status: unknown): PersonaImageLibraryStatusType {
  const value = toSafeString(status, 80);
  if (value === "archived" || value === "deleted") return value;
  return "active";
}

function normalizeTags(tags?: unknown) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map((tag) => toSafeString(tag, 80)).filter(Boolean))).slice(0, 20);
}

function normalizeStorageForTransport(storage: unknown): PersonaImageLibraryAssetType["storage"] {
  const value = (storage && typeof storage === "object" ? storage : {}) as PersonaImageLibraryAssetType["storage"];
  if (value.driver === "r2") {
    return { ...value, migrationState: "r2" };
  }

  // 기존 레코드의 바이트/DB를 이 자리에서 이동하지 않고, API 응답에서 이전 대상을 식별한다.
  return { ...value, driver: "local", migrationState: "migration-required" };
}

function toAssetType(doc: Record<string, unknown>): PersonaImageLibraryAssetType {
  return {
    assetId: toSafeString(doc?.assetId, 160),
    uid: toSafeString(doc?.uid, 160),
    universeId: toSafeString(doc?.universeId, 160),
    personaId: toSafeString(doc?.personaId, 160),
    source: normalizeSource(doc?.source),
    status: normalizeStatus(doc?.status),
    storage: normalizeStorageForTransport(doc?.storage),
    generation: (doc?.generation || {}) as PersonaImageLibraryAssetType["generation"],
    reference: (doc?.reference || {}) as PersonaImageLibraryAssetType["reference"],
    tags: normalizeTags(doc?.tags),
    createdAt: doc?.createdAt ? new Date(doc.createdAt as Date | string).toISOString() : undefined,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt as Date | string).toISOString() : undefined,
    archivedAt: doc?.archivedAt ? new Date(doc.archivedAt as Date | string).toISOString() : null,
  };
}

async function getPersonaImageLibraryModel() {
  return await getModel<IPersonaImageLibraryAssetDocument>(
    MONGODB_PERSONA_URL,
    "PersonaImageLibraryAsset",
    PersonaImageLibraryAssetSchema,
    COLLECTION,
  );
}

export async function createPersonaImageLibraryAsset(input: {
  assetId?: string;
  uid: string;
  universeId?: string;
  personaId?: string;
  source: PersonaImageLibrarySourceType;
  storage: PersonaImageLibraryAssetType["storage"];
  generation?: PersonaImageLibraryAssetType["generation"];
  reference?: PersonaImageLibraryAssetType["reference"];
  tags?: string[];
}) {
  const model = await getPersonaImageLibraryModel();
  const doc = await model.create({
    assetId: toSafeString(input.assetId, 160) || createPersonaImageLibraryAssetId(),
    uid: toSafeString(input.uid, 160),
    universeId: toSafeString(input.universeId, 160),
    personaId: toSafeString(input.personaId, 160),
    source: normalizeSource(input.source),
    status: "active",
    storage: input.storage,
    generation: input.generation || {},
    reference: input.reference || {},
    tags: normalizeTags(input.tags),
  });
  return toAssetType((doc.toObject?.() ?? doc) as unknown as Record<string, unknown>);
}

export async function listPersonaImageLibraryAssets(params: {
  uid: string;
  universeId?: string;
  personaId?: string;
  linkedProfileImageUrl?: string;
  referenceKind?: NonNullable<PersonaImageLibraryAssetType["reference"]>["kind"];
  source?: PersonaImageLibrarySourceType | "all";
  status?: PersonaImageLibraryStatusType | "all";
  limit?: number;
}) {
  const model = await getPersonaImageLibraryModel();
  const cond: Record<string, unknown> = { uid: toSafeString(params.uid, 160) };
  const universeId = toSafeString(params.universeId, 160);
  const personaId = toSafeString(params.personaId, 160);
  const linkedProfileImageUrl = toSafeString(params.linkedProfileImageUrl, 2000);
  if (universeId) cond.universeId = universeId;
  if (personaId && linkedProfileImageUrl) {
    cond.$or = [{ personaId }, { "reference.linkedProfileImageUrl": linkedProfileImageUrl }];
  } else if (personaId) {
    cond.personaId = personaId;
  } else if (linkedProfileImageUrl) {
    cond["reference.linkedProfileImageUrl"] = linkedProfileImageUrl;
  }
  if (params.referenceKind) cond["reference.kind"] = params.referenceKind;
  if (params.source && params.source !== "all") cond.source = normalizeSource(params.source);
  if (params.status !== "all") cond.status = normalizeStatus(params.status || "active");

  const limit = Math.max(1, Math.min(100, Number(params.limit || 40)));
  const rows = await model.find(cond).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map(toAssetType);
}

export async function getPersonaImageLibraryAsset(params: { uid: string; assetId: string }) {
  const model = await getPersonaImageLibraryModel();
  const row = await model
    .findOne({
      uid: toSafeString(params.uid, 160),
      assetId: toSafeString(params.assetId, 160),
      status: { $ne: "deleted" },
    })
    .lean();
  return row ? toAssetType(row) : null;
}

export async function linkPersonaImageLibraryAssetsToProfile(params: {
  uid: string;
  personaId: string;
  fromPersonaId?: string;
  linkedProfileImageUrl?: string;
  referenceKind?: NonNullable<PersonaImageLibraryAssetType["reference"]>["kind"];
}) {
  const model = await getPersonaImageLibraryModel();
  const uid = toSafeString(params.uid, 160);
  const personaId = toSafeString(params.personaId, 160);
  const fromPersonaId = toSafeString(params.fromPersonaId, 160);
  const linkedProfileImageUrl = toSafeString(params.linkedProfileImageUrl, 2000);
  if (!uid || !personaId || (!fromPersonaId && !linkedProfileImageUrl)) return { matchedCount: 0, modifiedCount: 0 };

  const or: Record<string, unknown>[] = [];
  if (fromPersonaId) {
    or.push({ personaId: fromPersonaId }, { "reference.linkedPersonaPid": fromPersonaId });
  }
  if (linkedProfileImageUrl) {
    or.push({ "reference.linkedProfileImageUrl": linkedProfileImageUrl });
  }

  const cond: Record<string, unknown> = {
    uid,
    status: "active",
    source: "uploaded_reference",
    $or: or,
  };
  if (params.referenceKind) cond["reference.kind"] = params.referenceKind;

  const set: Record<string, unknown> = {
    personaId,
    "reference.linkedPersonaPid": personaId,
  };
  if (linkedProfileImageUrl) set["reference.linkedProfileImageUrl"] = linkedProfileImageUrl;

  const result = await model.updateMany(cond, { $set: set });
  return {
    matchedCount: Number(result.matchedCount || 0),
    modifiedCount: Number(result.modifiedCount || 0),
  };
}

export async function updatePersonaImageLibraryAssetReference(params: {
  uid: string;
  assetId: string;
  personaId?: string;
  reference: PersonaImageLibraryAssetType["reference"];
}) {
  const model = await getPersonaImageLibraryModel();
  const set: Record<string, unknown> = {};
  const personaId = toSafeString(params.personaId, 160);
  if (personaId) set.personaId = personaId;

  Object.entries(params.reference || {}).forEach(([key, value]) => {
    if (value !== undefined) set[`reference.${key}`] = value;
  });

  const updated = await model
    .findOneAndUpdate(
      { uid: toSafeString(params.uid, 160), assetId: toSafeString(params.assetId, 160) },
      { $set: set },
      { new: true },
    )
    .lean();
  return updated ? toAssetType(updated) : null;
}

export async function updatePersonaImageLibraryAssetStatus(params: {
  uid: string;
  assetId: string;
  status: PersonaImageLibraryStatusType;
}) {
  const model = await getPersonaImageLibraryModel();
  const status = normalizeStatus(params.status);
  const updated = await model
    .findOneAndUpdate(
      { uid: toSafeString(params.uid, 160), assetId: toSafeString(params.assetId, 160) },
      {
        $set: {
          status,
          archivedAt: status === "archived" ? new Date() : null,
        },
      },
      { new: true },
    )
    .lean();
  return updated ? toAssetType(updated) : null;
}

export async function rewritePersonaImageLibraryUrlReferences(params: {
  newUrl: string;
  oldWorkerPrefix?: string;
  oldPublicUrl?: string;
}) {
  const model = await getPersonaImageLibraryModel();
  const newUrl = toSafeString(params.newUrl, 2000);
  const oldWorkerPrefix = toSafeString(params.oldWorkerPrefix, 2000);
  const oldPublicUrl = toSafeString(params.oldPublicUrl, 2000);
  if (!newUrl || (!oldWorkerPrefix && !oldPublicUrl)) return { matchedCount: 0, modifiedCount: 0 };

  const docs = await model
    .find({
      $or: [
        { "storage.originalUrl": { $exists: true, $ne: "" } },
        { "reference.linkedProfileImageUrl": { $exists: true, $ne: "" } },
      ],
    })
    .select({ assetId: 1, storage: 1, reference: 1 })
    .lean();

  let modifiedCount = 0;
  for (const doc of docs) {
    const record = doc as Record<string, unknown>;
    const storage = (record?.storage || {}) as Record<string, unknown>;
    const reference = (record?.reference || {}) as Record<string, unknown>;
    const set: Record<string, unknown> = {};

    const originalUrl = toSafeString(storage.originalUrl, 2000);
    if (
      originalUrl &&
      ((oldWorkerPrefix && originalUrl.startsWith(oldWorkerPrefix)) || (oldPublicUrl && originalUrl === oldPublicUrl))
    ) {
      set["storage.originalUrl"] = newUrl;
    }

    const linkedProfileImageUrl = toSafeString(reference.linkedProfileImageUrl, 2000);
    if (
      linkedProfileImageUrl &&
      ((oldWorkerPrefix && linkedProfileImageUrl.startsWith(oldWorkerPrefix)) ||
        (oldPublicUrl && linkedProfileImageUrl === oldPublicUrl))
    ) {
      set["reference.linkedProfileImageUrl"] = newUrl;
    }

    if (Object.keys(set).length === 0) continue;
    await model.updateOne({ assetId: toSafeString(record.assetId, 160) }, { $set: set });
    modifiedCount++;
  }

  return { matchedCount: docs.length, modifiedCount };
}
