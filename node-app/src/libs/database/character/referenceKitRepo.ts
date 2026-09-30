import "server-only";
import crypto from "crypto";
import {
  CHARACTER_REFERENCE_KIT_TEMPLATE_KEY,
  CHARACTER_REFERENCE_KIT_TEMPLATE_VERSION,
} from "consts/app";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  CharacterReferenceKitSchema,
  CHARACTER_REFERENCE_IMAGE_ROLES,
  CHARACTER_REFERENCE_KIT_STATUSES,
  CHARACTER_REFERENCE_KIT_VISIBILITIES,
  type CharacterReferenceImageRoleType,
  type CharacterReferenceKitStatusType,
  type CharacterReferenceKitVisibilityType,
  type ICharacterReferenceKitDocument,
} from "models/character";
import {
  buildCharacterReferenceSetQuality as buildModelReferenceKitQuality,
  replaceCharacterReferenceImagesFromPatch as replaceModelReferenceImagesFromPatch,
  normalizeCharacterReferenceImages as normalizeModelReferenceImages,
  normalizeCharacterReferenceSpec as normalizeModelReferenceSpec,
} from "libs/server-utils/character/referenceSetContract";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

// ASH-09 U2 적용 후 새 컬렉션을 읽는다. 원본 컬렉션은 롤백을 위해 보존한다.
const MODEL_REFERENCE_KIT_COLLECTION = "character_reference_kits";
function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toSafeDate(value?: Date | string | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function uniqueStrings(list?: unknown[]) {
  return Array.from(new Set((list || []).map((value) => toSafeString(value)).filter(Boolean)));
}

function toKitStatus(value?: unknown): CharacterReferenceKitStatusType {
  const status = toSafeString(value).toLowerCase();
  return (CHARACTER_REFERENCE_KIT_STATUSES as readonly string[]).includes(status)
    ? (status as CharacterReferenceKitStatusType)
    : "draft";
}

// ASH-17 3단계 — 공유 축은 기본 private 이며 알 수 없는 값은 fail-closed 로 private 로 내린다.
// N-2 — 값 목록 사본을 두지 않고 models/character 의 정본을 그대로 쓴다.
function toKitVisibility(value?: unknown): CharacterReferenceKitVisibilityType {
  const visibility = toSafeString(value).toLowerCase();
  return (CHARACTER_REFERENCE_KIT_VISIBILITIES as readonly string[]).includes(visibility)
    ? (visibility as CharacterReferenceKitVisibilityType)
    : "private";
}

function toImageRole(value?: unknown): CharacterReferenceImageRoleType | "" {
  const role = toSafeString(value);
  return (CHARACTER_REFERENCE_IMAGE_ROLES as readonly string[]).includes(role)
    ? (role as CharacterReferenceImageRoleType)
    : "";
}

function normalizeSourceTemplateKey(value?: unknown) {
  return toSafeString(value) || CHARACTER_REFERENCE_KIT_TEMPLATE_KEY;
}

function normalizeSourceTemplateVersion(value?: unknown) {
  const version = Number(value || 0);
  return Number.isFinite(version) && version > 0 ? version : CHARACTER_REFERENCE_KIT_TEMPLATE_VERSION;
}

function normalizeKitForResponse<T>(doc?: T | null): T | null {
  if (!doc) return null;
  const raw = ((doc as { toObject?: () => Record<string, unknown> }).toObject?.() ?? doc) as Record<string, unknown>;
  return {
    ...raw,
    version: Number(raw.version || 1) || 1,
    sourceTemplateKey: normalizeSourceTemplateKey(raw.sourceTemplateKey),
    sourceTemplateVersion: normalizeSourceTemplateVersion(raw.sourceTemplateVersion),
    images: normalizeModelReferenceImages(toUnknownRecord(raw.images)),
    spec: normalizeModelReferenceSpec(toUnknownRecord(raw.spec)),
    quality: {
      ...toUnknownRecord(raw.quality),
      ...buildModelReferenceKitQuality(toUnknownRecord(raw.images), toUnknownRecord(raw.spec)),
    },
  } as T;
}

function normalizeKitsForResponse<T>(docs: T[]) {
  return docs.map((doc) => normalizeKitForResponse(doc)).filter(Boolean) as T[];
}

async function getCharacterReferenceKitModel() {
  return await getModel<ICharacterReferenceKitDocument>(
    MONGODB_AMU_URL,
    "CharacterReferenceKit",
    CharacterReferenceKitSchema,
    MODEL_REFERENCE_KIT_COLLECTION,
  );
}

type CharacterReferenceKitCreateInput = {
  universeId: string;
  name: string;
  displayName?: string;
  description?: string;
  tags?: unknown[];
  categoryHints?: unknown[];
  spec?: UnknownRecord;
  createdBy: string;
  updatedBy?: string;
};

async function createKitDoc(input: CharacterReferenceKitCreateInput, owner: { ownerType: "universe" | "user"; ownerId: string }) {
  const model = await getCharacterReferenceKitModel();
  const spec = normalizeModelReferenceSpec(input.spec);
  const universeId = toSafeString(input.universeId);
  const doc = await model.create({
    kitId: makeId("commerce_model_kit"),
    universeId,
    // ASH-17 1단계 — 소유자는 과금 주체를 따른다. 클라이언트가 보낸 owner 필드는 여기서 읽지 않으므로
    // 위조할 수 없다. 커머스 경로는 universe, 사용자 경로는 서버가 확인한 uid 를 넣는다(4단계).
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    visibility: "private",
    allowedUniverseIds: [],
    status: "draft",
    version: 1,
    sourceTemplateKey: CHARACTER_REFERENCE_KIT_TEMPLATE_KEY,
    sourceTemplateVersion: CHARACTER_REFERENCE_KIT_TEMPLATE_VERSION,
    name: toSafeString(input.name),
    displayName: toSafeString(input.displayName),
    description: toSafeString(input.description),
    tags: uniqueStrings(input.tags),
    categoryHints: uniqueStrings(input.categoryHints),
    images: {},
    spec,
    quality: buildModelReferenceKitQuality({}, spec),
    usage: {},
    createdBy: toSafeString(input.createdBy),
    updatedBy: toSafeString(input.updatedBy || input.createdBy),
  });

  return normalizeKitForResponse(doc) as ICharacterReferenceKitDocument;
}

/** 커머스 유니버스 경로 — 서버가 universe 소유로 고정한다. */
export async function createCharacterReferenceKit(input: CharacterReferenceKitCreateInput) {
  const universeId = toSafeString(input.universeId);
  return createKitDoc(input, { ownerType: "universe", ownerId: universeId });
}

/**
 * 사용자 경로 (ASH-17 4단계) — 서버(라우트)가 정한 소유를 그대로 저장한다. 소유는 과금 주체(사용자 코인)를 따른다.
 * 라우트가 `ownerType: "user"` 를 명시해야 하며, 아니면 거절한다(커머스 소유를 이 경로로 우회할 수 없다).
 * universeId 는 소속/선택 필터로 남으며 소유를 바꾸지 않는다.
 */
export async function createUserCharacterReferenceKit(
  input: CharacterReferenceKitCreateInput & { owner: { ownerType: "user"; ownerId: string } },
) {
  const ownerId = toSafeString(input.owner?.ownerId);
  if (!ownerId || input.owner?.ownerType !== "user") return null;
  return createKitDoc(input, { ownerType: "user", ownerId });
}

export async function listCharacterReferenceKits(params: {
  universeId: string;
  status?: CharacterReferenceKitStatusType | CharacterReferenceKitStatusType[] | string;
  includeArchived?: boolean;
  limit?: number;
}) {
  const model = await getCharacterReferenceKitModel();
  const cond: Record<string, unknown> = {
    universeId: toSafeString(params.universeId),
    // 유니버스 관리 목록은 유니버스 소유 킷 전용이다. 사용자 소유 킷(4단계)이 같은 universeId 를
    // 소속으로 가질 수 있으므로 관리 목록에서 배제한다. `$ne` 는 필드 부재(과거 문서)도 통과시키므로
    // 기존 유니버스 킷의 반환 집합은 그대로다(동작 불변).
    ownerType: { $ne: "user" },
  };

  const rawStatuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  const statuses = rawStatuses.map(toKitStatus).filter(Boolean);
  if (statuses.length > 0) cond.status = { $in: statuses };
  else if (!params.includeArchived) cond.status = { $ne: "archived" };

  const limit = Math.max(1, Math.min(100, Number(params.limit || 50)));
  const docs = await model.find(cond).sort({ updatedAt: -1 }).limit(limit).lean();
  return normalizeKitsForResponse(docs);
}

/**
 * 사용자 소유 킷 목록 (ASH-17 4단계). ownerId(=uid)로만 조회하며 유니버스 관리 목록과 분리한다.
 * universeId 는 소속 필터로만 쓰고, 없으면 사용자의 전체 킷을 반환한다.
 */
export async function listUserCharacterReferenceKits(params: {
  ownerId: string;
  universeId?: string;
  status?: CharacterReferenceKitStatusType | CharacterReferenceKitStatusType[] | string;
  includeArchived?: boolean;
  limit?: number;
}) {
  const ownerId = toSafeString(params.ownerId);
  if (!ownerId) return [];

  const model = await getCharacterReferenceKitModel();
  const cond: Record<string, unknown> = { ownerType: "user", ownerId };
  const universeId = toSafeString(params.universeId);
  if (universeId) cond.universeId = universeId;

  const rawStatuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  const statuses = rawStatuses.map(toKitStatus).filter(Boolean);
  if (statuses.length > 0) cond.status = { $in: statuses };
  else if (!params.includeArchived) cond.status = { $ne: "archived" };

  const limit = Math.max(1, Math.min(100, Number(params.limit || 50)));
  const docs = await model.find(cond).sort({ updatedAt: -1 }).limit(limit).lean();
  return normalizeKitsForResponse(docs);
}

export async function getCharacterReferenceKitByKitId(kitId: string) {
  const model = await getCharacterReferenceKitModel();
  const doc = await model.findOne({ kitId: toSafeString(kitId) }).lean();
  return normalizeKitForResponse(doc);
}

export async function updateCharacterReferenceKit(args: {
  kitId: string;
  patch: UnknownRecord;
  updatedBy: string;
}) {
  const current = await getCharacterReferenceKitByKitId(args.kitId);
  if (!current) return null;

  const currentRecord = toUnknownRecord(current);
  const patch = toUnknownRecord(args.patch);
  // patch는 저장소 참조를 도입·변경할 수 없다. 같은 역할에 이미 저장된 참조만 승계한다 (ASH-15 P0-1).
  const nextImages = patch.images
    ? replaceModelReferenceImagesFromPatch(toUnknownRecord(currentRecord.images), toUnknownRecord(patch.images))
    : normalizeModelReferenceImages(toUnknownRecord(currentRecord.images));
  const nextSpec = patch.spec ? normalizeModelReferenceSpec(toUnknownRecord(patch.spec)) : normalizeModelReferenceSpec(toUnknownRecord(currentRecord.spec));
  const set: UnknownRecord = {
    updatedBy: toSafeString(args.updatedBy),
    updatedAt: new Date(),
    quality: buildModelReferenceKitQuality(nextImages, nextSpec),
  };

  if (patch.name !== undefined) set.name = toSafeString(patch.name);
  if (patch.displayName !== undefined) set.displayName = toSafeString(patch.displayName);
  if (patch.description !== undefined) set.description = toSafeString(patch.description);
  if (patch.status !== undefined) set.status = toKitStatus(patch.status);
  if (patch.sourceTemplateKey !== undefined) set.sourceTemplateKey = normalizeSourceTemplateKey(patch.sourceTemplateKey);
  if (patch.sourceTemplateVersion !== undefined) {
    set.sourceTemplateVersion = normalizeSourceTemplateVersion(patch.sourceTemplateVersion);
  }
  if (patch.tags !== undefined) set.tags = uniqueStrings(Array.isArray(patch.tags) ? patch.tags : []);
  if (patch.categoryHints !== undefined) {
    set.categoryHints = uniqueStrings(Array.isArray(patch.categoryHints) ? patch.categoryHints : []);
  }
  if (patch.images !== undefined) set.images = nextImages;
  if (patch.spec !== undefined) set.spec = nextSpec;
  // 공유 축은 소유자 라우트에서만 도달한다. ownerType·ownerId 는 patch 로 바꿀 수 없다(소유 이전 금지, ASH-17 3단계).
  if (patch.visibility !== undefined) set.visibility = toKitVisibility(patch.visibility);
  if (patch.allowedUniverseIds !== undefined) {
    set.allowedUniverseIds = uniqueStrings(Array.isArray(patch.allowedUniverseIds) ? patch.allowedUniverseIds : []);
  }

  const model = await getCharacterReferenceKitModel();
  const doc = await model
    .findOneAndUpdate({ kitId: toSafeString(args.kitId) }, { $set: set, $inc: { version: 1 } }, { new: true })
    .lean();
  return normalizeKitForResponse(doc);
}

export async function attachCharacterReferenceKitImage(args: {
  kitId: string;
  role: CharacterReferenceImageRoleType | string;
  image: UnknownRecord;
  updatedBy: string;
}) {
  const role = toImageRole(args.role);
  if (!role) return null;

  const current = await getCharacterReferenceKitByKitId(args.kitId);
  if (!current) return null;

  const currentImages = normalizeModelReferenceImages(toUnknownRecord(current.images));
  const roleIndex = CHARACTER_REFERENCE_IMAGE_ROLES.indexOf(role);
  const nextImages = {
    ...currentImages,
    [role]: {
      role,
      url: toSafeString(args.image.url),
      assetId: toSafeString(args.image.assetId),
      source: toSafeString(args.image.source) || "manual",
      // private R2 자산은 url이 없으므로 저장소 참조를 함께 남긴다. 표시 URL은 읽는 시점에 해석한다 (ASH-15).
      driver: toSafeString(args.image.driver),
      access: toSafeString(args.image.access),
      bucket: toSafeString(args.image.bucket),
      key: toSafeString(args.image.key),
      mimeType: toSafeString(args.image.mimeType),
      width: Number(args.image.width || 0) || undefined,
      height: Number(args.image.height || 0) || undefined,
      sha256: toSafeString(args.image.sha256),
      sortOrder: roleIndex + 1,
    },
  };
  const spec = normalizeModelReferenceSpec(toUnknownRecord(current.spec));

  // Gen Studio 생성 자산을 슬롯에 배정하면 그 assetId를 lineage에 남긴다.
  // 업로드·수동 URL은 생성 자산이 아니므로 기록하지 않는다 (SSM-202 deliverable 4).
  const generatedAssetId = toSafeString(args.image.assetId);
  const isGeneratedSource = toSafeString(args.image.source) === "gen_studio";
  const update: UnknownRecord = {
    $set: {
      images: normalizeModelReferenceImages(nextImages),
      quality: buildModelReferenceKitQuality(nextImages, spec),
      updatedBy: toSafeString(args.updatedBy),
      updatedAt: new Date(),
    },
    $inc: { version: 1 },
  };
  if (generatedAssetId && isGeneratedSource) {
    update.$addToSet = { "usage.generatedAssetIds": generatedAssetId };
  }

  const model = await getCharacterReferenceKitModel();
  const doc = await model.findOneAndUpdate({ kitId: toSafeString(args.kitId) }, update, { new: true }).lean();
  return normalizeKitForResponse(doc);
}

/**
 * draft가 이 kit을 참조하기 시작한 사실을 기록한다.
 * `$addToSet`이라 같은 draft를 다시 선택해도 중복이 쌓이지 않는다.
 */
export async function markCharacterReferenceKitsUsed(args: {
  kitIds: string[];
  universeId: string;
  draftId: string;
  updatedBy: string;
}) {
  const kitIds = uniqueStrings(args.kitIds);
  const draftId = toSafeString(args.draftId);
  if (kitIds.length === 0 || !draftId) return 0;

  const model = await getCharacterReferenceKitModel();
  const result = await model.updateMany(
    { kitId: { $in: kitIds }, universeId: toSafeString(args.universeId) },
    {
      $addToSet: { "usage.usedDraftIds": draftId },
      // updatedBy만 바꾸고 updatedAt을 두면 감사 필드가 서로 어긋난다.
      $set: { "usage.lastUsedAt": new Date(), updatedBy: toSafeString(args.updatedBy), updatedAt: new Date() },
    },
  );
  return Number(result?.modifiedCount || 0);
}

/** Play Persona가 이 kit을 참조하기 시작한 사실을 멱등적으로 기록한다. */
export async function markCharacterReferenceKitUsedByPlayPersona(args: {
  kitId: string;
  universeId: string;
  personaPid: string;
  updatedBy: string;
}) {
  const kitId = toSafeString(args.kitId);
  const universeId = toSafeString(args.universeId);
  const personaPid = toSafeString(args.personaPid);
  if (!kitId || !universeId || !personaPid) return 0;

  const model = await getCharacterReferenceKitModel();
  const result = await model.updateOne(
    { kitId, universeId, status: { $ne: "archived" } },
    {
      $addToSet: { "usage.playPersonaPids": personaPid },
      $set: {
        "usage.lastUsedAt": new Date(),
        updatedBy: toSafeString(args.updatedBy),
        updatedAt: new Date(),
      },
    },
  );
  return Number(result?.modifiedCount || 0);
}

export async function refreshCharacterReferenceKitQuality(args: { kitId: string; updatedBy: string }) {
  const current = await getCharacterReferenceKitByKitId(args.kitId);
  if (!current) return null;

  const images = normalizeModelReferenceImages(toUnknownRecord(current.images));
  const spec = normalizeModelReferenceSpec(toUnknownRecord(current.spec));
  const model = await getCharacterReferenceKitModel();
  const doc = await model
    .findOneAndUpdate(
      { kitId: toSafeString(args.kitId) },
      {
        $set: {
          quality: buildModelReferenceKitQuality(images, spec),
          updatedBy: toSafeString(args.updatedBy),
          updatedAt: new Date(),
        },
      },
      { new: true },
    )
    .lean();
  return normalizeKitForResponse(doc);
}

export async function archiveCharacterReferenceKit(args: { kitId: string; actor: string }) {
  const model = await getCharacterReferenceKitModel();
  const doc = await model
    .findOneAndUpdate(
      { kitId: toSafeString(args.kitId) },
      {
        $set: {
          status: "archived",
          archivedAt: toSafeDate(new Date()),
          updatedBy: toSafeString(args.actor),
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { new: true },
    )
    .lean();
  return normalizeKitForResponse(doc);
}
