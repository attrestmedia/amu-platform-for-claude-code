import "server-only";

import { getModel } from "libs/database/modelCache";
import { dbConnect } from "libs/database/mongoose";
import { rewritePersonaImageLibraryUrlReferences } from "libs/database/personaImageLibraryRepo";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { PersonaSchema, type IPersonaDocument } from "models/universe";
import { isSafeTutorsCollectionName, TUTORS_SHARED_TEMPLATE_COLLECTION } from "libs/services/tutors/tutorsCollectionKey";
import { buildPrivateAssetWorkerUrl, getPrivateAssetBaseUrl } from "libs/server-utils/lab/imageAssetDisplay";
import { buildR2PublicUrl } from "libs/server-utils/storage/r2Storage";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 이미지 자산의 공개/비공개 전환 시 스토리지 URL이 바뀔 때, 이전 URL을 저장해둔
 *          다운스트림 레코드(튜터 페르소나 profiles, 페르소나 이미지 라이브러리)를 새 URL로 갱신한다.
 * @process URL 변환 산출  튜터 페르소나 컬렉션 스캔/재작성  이미지 라이브러리 참조 재작성
 * @domain lab
 * @scope server
 */

type UrlChange = {
  newUrl: string;
  oldWorkerPrefix?: string;
  oldPublicUrl?: string;
};

const PERSONA_SCAN_LIMIT = 2000;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function computeUrlChange(input: {
  assetId: string;
  oldVisibility: string;
  newVisibility: string;
  oldStorage: Record<string, unknown>;
  newStorage: Record<string, unknown>;
}): UrlChange | null {
  const assetId = toSafeString(input.assetId);
  const oldVisibility = toSafeString(input.oldVisibility) === "public" ? "public" : "private";
  const newVisibility = toSafeString(input.newVisibility) === "public" ? "public" : "private";
  if (oldVisibility === newVisibility) return null;

  const oldDriver = toSafeString(input.oldStorage.driver);
  const newDriver = toSafeString(input.newStorage.driver);
  // R2 bucket 간 이동이 발생하는 경우에만 URL이 바뀐다. legacy/local 스토리지는 대상이 아니다.
  if (oldDriver !== "r2" || newDriver !== "r2") return null;

  const base = getPrivateAssetBaseUrl();

  let oldWorkerPrefix: string | undefined;
  let oldPublicUrl: string | undefined;

  if (oldVisibility === "private") {
    if (!base || !assetId) return null;
    oldWorkerPrefix = `${base}/images/${encodeURIComponent(assetId)}`;
  } else {
    oldPublicUrl = toSafeString(input.oldStorage.url);
    if (!oldPublicUrl) return null;
  }

  let newUrl = "";
  if (newVisibility === "public") {
    const nextKey = toSafeString(input.newStorage.key);
    if (!nextKey) return null;
    newUrl = buildR2PublicUrl(nextKey);
  } else {
    if (!base || !assetId) return null;
    newUrl = buildPrivateAssetWorkerUrl(assetId, input.newStorage);
  }
  if (!newUrl) return null;

  // 이전 URL과 새 URL이 동일하면 갱신할 내용이 없다.
  if (newUrl === oldWorkerPrefix || newUrl === oldPublicUrl) return null;

  return { newUrl, oldWorkerPrefix, oldPublicUrl };
}

function matchesOldUrl(value: string, change: UrlChange) {
  const clean = toSafeString(value);
  if (!clean) return false;
  if (change.oldWorkerPrefix && clean.startsWith(change.oldWorkerPrefix)) return true;
  if (change.oldPublicUrl && clean === change.oldPublicUrl) return true;
  return false;
}

function rewriteProfiles(profiles: unknown, change: UrlChange): { next: unknown; changed: boolean } {
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
    return { next: profiles, changed: false };
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profiles as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      next[key] = value;
      continue;
    }

    let variantChanged = false;
    const mapped = value.map((item) => {
      if (matchesOldUrl(String(item ?? ""), change)) {
        variantChanged = true;
        return change.newUrl;
      }
      return item;
    });
    next[key] = mapped;
    if (variantChanged) changed = true;
  }

  return { next, changed };
}

async function listTutorPersonaCollections(): Promise<string[]> {
  const conn = await dbConnect(MONGODB_PERSONA_URL);
  const db = conn.db;
  if (!db) return [];
  const infos = await db.listCollections({ name: { $regex: /^tutors_/ } }).toArray();
  const names = infos
    .map((info) => String((info as { name?: unknown })?.name || ""))
    .filter((name) => isSafeTutorsCollectionName(name));
  return Array.from(new Set([TUTORS_SHARED_TEMPLATE_COLLECTION, ...names])).filter(Boolean);
}

async function rewritePersonaProfiles(change: UrlChange): Promise<{ scanned: number; updated: number }> {
  let scanned = 0;
  let updated = 0;
  const collections = await listTutorPersonaCollections();

  for (const collectionName of collections) {
    const model = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
    const docs = await model
      .find({ profiles: { $exists: true, $ne: null } })
      .select({ _id: 1, profiles: 1 })
      .limit(PERSONA_SCAN_LIMIT)
      .lean();
    scanned++;

    for (const doc of docs) {
      const record = doc as { _id?: unknown; profiles?: unknown };
      const result = rewriteProfiles(record.profiles, change);
      if (!result.changed || !record._id) continue;
      await model.updateOne({ _id: record._id }, { $set: { profiles: result.next } });
      updated++;
    }
  }

  return { scanned, updated };
}

export async function propagateImageAssetVisibilityChange(input: {
  assetId: string;
  oldVisibility: string;
  newVisibility: string;
  oldStorage: unknown;
  newStorage: unknown;
}): Promise<{
  skipped: boolean;
  personaCollectionsScanned: number;
  personasUpdated: number;
  libraryAssetsUpdated: number;
}> {
  const change = computeUrlChange({
    assetId: toSafeString(input.assetId),
    oldVisibility: toSafeString(input.oldVisibility),
    newVisibility: toSafeString(input.newVisibility),
    oldStorage: toRecord(input.oldStorage),
    newStorage: toRecord(input.newStorage),
  });

  if (!change) {
    return { skipped: true, personaCollectionsScanned: 0, personasUpdated: 0, libraryAssetsUpdated: 0 };
  }

  const [personaResult, libraryResult] = await Promise.all([
    rewritePersonaProfiles(change),
    rewritePersonaImageLibraryUrlReferences({
      newUrl: change.newUrl,
      oldWorkerPrefix: change.oldWorkerPrefix,
      oldPublicUrl: change.oldPublicUrl,
    }).catch((error) => {
      logger.warn("[imageAssetUrlPropagation] library rewrite failed:", error);
      return { matchedCount: 0, modifiedCount: 0 };
    }),
  ]);

  logger.info("[imageAssetUrlPropagation] visibility url propagated", {
    assetId: toSafeString(input.assetId),
    oldVisibility: toSafeString(input.oldVisibility),
    newVisibility: toSafeString(input.newVisibility),
    newUrl: change.newUrl,
    personaCollectionsScanned: personaResult.scanned,
    personasUpdated: personaResult.updated,
    libraryAssetsUpdated: libraryResult.modifiedCount,
  });

  return {
    skipped: false,
    personaCollectionsScanned: personaResult.scanned,
    personasUpdated: personaResult.updated,
    libraryAssetsUpdated: libraryResult.modifiedCount,
  };
}
