import { NextResponse } from "next/server";
import { getImageAssetByAssetId } from "libs/database/lab";
import { createGameAsset, listGameAssets, updateGameAsset } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import {
  GAME_ASSET_SOURCE_TYPES,
  GAME_ASSET_STATUSES,
  GAME_ASSET_TYPES,
  type GameAssetSourceType,
  type GameAssetStatusType,
  type GameAssetType,
  type IGameAssetDoc,
} from "types/game/asset";
import { logger } from "utils/log";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getR2PublicObjectFromUrl } from "libs/server-utils/storage/r2Storage";
import { getPersonaActorId } from "libs/server-utils/persona/personaPolicy";

export const runtime = "nodejs";

const GAME_ASSET_TYPE_SET = new Set<string>(GAME_ASSET_TYPES);
const GAME_ASSET_STATUS_SET = new Set<string>(GAME_ASSET_STATUSES);
const GAME_ASSET_SOURCE_SET = new Set<string>(GAME_ASSET_SOURCE_TYPES);

function getAdminKey(user: AuthenticatedUserType) {
  return (
    getPersonaActorId(user) ||
    normalizeString(user?.userEmailLower) ||
    normalizeString(user?.userEmail) ||
    normalizeString(user?.email) ||
    (user?.ID ? String(user.ID) : "admin")
  );
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)));
}

type StorageInputLike = {
  url?: unknown;
  mimeType?: unknown;
  width?: unknown;
  height?: unknown;
  bytes?: unknown;
  sha256?: unknown;
  ext?: unknown;
} | null | undefined;

function normalizeStorage(input: StorageInputLike) {
  const url = normalizeString(input?.url);
  const r2Object = getR2PublicObjectFromUrl(url);
  if (!r2Object) return null;

  return {
    ...r2Object,
    url,
    mimeType: normalizeString(input?.mimeType),
    width: Number.isFinite(Number(input?.width)) ? Number(input?.width) : undefined,
    height: Number.isFinite(Number(input?.height)) ? Number(input?.height) : undefined,
    bytes: Number.isFinite(Number(input?.bytes)) ? Number(input?.bytes) : undefined,
    sha256: normalizeString(input?.sha256),
    ext: normalizeString(input?.ext),
  };
}

function pickStatus(value: unknown, fallback: GameAssetStatusType = "draft") {
  const status = normalizeString(value) as GameAssetStatusType;
  return GAME_ASSET_STATUS_SET.has(status) ? status : fallback;
}

function pickSourceType(value: unknown, fallback: GameAssetSourceType = "generated") {
  const sourceType = normalizeString(value) as GameAssetSourceType;
  return GAME_ASSET_SOURCE_SET.has(sourceType) ? sourceType : fallback;
}

function getUpdatePayload(body: UnknownRecord, user: AuthenticatedUserType) {
  const payload: Partial<IGameAssetDoc> = {
    updatedBy: getAdminKey(user),
  };

  if (body?.name !== undefined) payload.name = normalizeString(body.name);
  if (body?.sourceType !== undefined) payload.sourceType = pickSourceType(body.sourceType, "edited");
  if (body?.status !== undefined) payload.status = pickStatus(body.status);
  if (body?.universeId !== undefined) payload.universeId = normalizeString(body.universeId);
  if (body?.stageId !== undefined) payload.stageId = normalizeString(body.stageId);
  if (body?.tags !== undefined) payload.tags = normalizeStringArray(body.tags);
  if (body?.categories !== undefined) payload.categories = normalizeStringArray(body.categories);
  if (body?.spriteSheet !== undefined) payload.spriteSheet = body.spriteSheet as IGameAssetDoc["spriteSheet"];
  if (body?.regions !== undefined) payload.regions = Array.isArray(body.regions) ? (body.regions as IGameAssetDoc["regions"]) : [];
  if (body?.runtime !== undefined) payload.runtime = (body.runtime as IGameAssetDoc["runtime"]) || {};
  if (body?.meta !== undefined) payload.meta = (body.meta as IGameAssetDoc["meta"]) || {};
  if (body?.storage !== undefined) {
    const storage = normalizeStorage(body.storage as StorageInputLike);
    if (storage) payload.storage = storage;
  }

  return payload;
}

export const GET = withAuth(
  async (_data, user, request) => {
    try {
      const { searchParams } = new URL(request.url);
      const assetType = normalizeString(searchParams.get("assetType")) as GameAssetType;
      const status = normalizeString(searchParams.get("status")) as GameAssetStatusType | "all";
      const scope = normalizeString(searchParams.get("scope"));

      const result = await listGameAssets({
        assetType: GAME_ASSET_TYPE_SET.has(assetType) ? assetType : undefined,
        status: status === "all" || GAME_ASSET_STATUS_SET.has(status) ? status : undefined,
        universeId: normalizeString(searchParams.get("universeId")),
        stageId: normalizeString(searchParams.get("stageId")),
        sourceImageAssetId: normalizeString(searchParams.get("sourceImageAssetId")),
        templateKey: normalizeString(searchParams.get("templateKey")),
        q: normalizeString(searchParams.get("q")),
        createdBy: scope === "mine" ? getAdminKey(user) : undefined,
        page: Number(searchParams.get("page") || 1),
        pageSize: Number(searchParams.get("pageSize") || 20),
      });

      return NextResponse.json({
        ok: true,
        data: result.items,
        pagination: result.pagination,
        inventory: result.inventory,
      });
    } catch (error) {
      logger.error("[GameAssets][GET] failed:", error);
      return NextResponse.json({ ok: false, error: "game_assets_list_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets:list",
  { requireAdmin: true },
);

export const POST = withAuth(
  async (body, user) => {
    try {
      const assetType = normalizeString(body?.assetType) as GameAssetType;
      const name = normalizeString(body?.name);

      if (!GAME_ASSET_TYPE_SET.has(assetType) || !name) {
        return NextResponse.json({ ok: false, error: "invalid_game_asset_payload" }, { status: 400 });
      }

      const sourceImageAssetId = normalizeString(body?.sourceImageAssetId);
      if (pickStatus(body?.status) === "published") {
        return NextResponse.json({ ok: false, error: "use_game_asset_publish_endpoint" }, { status: 400 });
      }
      const sourceImageAsset = sourceImageAssetId ? await getImageAssetByAssetId(sourceImageAssetId) : null;
      if (sourceImageAssetId && !sourceImageAsset) {
        return NextResponse.json({ ok: false, error: "source_image_asset_not_found" }, { status: 404 });
      }

      const storage = sourceImageAsset?.storage ? normalizeStorage(sourceImageAsset.storage) : normalizeStorage(body?.storage);
      if (!storage) {
        return NextResponse.json({ ok: false, error: "public_r2_game_asset_storage_required" }, { status: 400 });
      }

      const created = await createGameAsset({
        name,
        assetType,
        status: pickStatus(body?.status),
        sourceType: pickSourceType(body?.sourceType, sourceImageAsset ? "generated" : "uploaded"),
        sourceImageAssetId,
        templateKey: normalizeString(body?.templateKey) || normalizeString(sourceImageAsset?.templateKey),
        provider: normalizeString(sourceImageAsset?.provider || body?.provider),
        modelName: normalizeString(sourceImageAsset?.modelName || body?.modelName),
        universeId: normalizeString(body?.universeId),
        stageId: normalizeString(body?.stageId),
        tags: normalizeStringArray(body?.tags),
        categories: normalizeStringArray(body?.categories),
        storage,
        spriteSheet: body?.spriteSheet,
        regions: Array.isArray(body?.regions) ? body.regions : [],
        runtime: body?.runtime || {},
        meta: body?.meta || {},
        createdBy: getAdminKey(user),
        updatedBy: getAdminKey(user),
      });

      return NextResponse.json({ ok: true, data: created }, { status: 201 });
    } catch (error) {
      logger.error("[GameAssets][POST] failed:", error);
      return NextResponse.json({ ok: false, error: "game_asset_create_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets:create",
  { requireAdmin: true },
);

export const PUT = withAuth(
  async (body, user) => {
    try {
      const gameAssetId = normalizeString(body?.gameAssetId);
      if (!gameAssetId) {
        return NextResponse.json({ ok: false, error: "gameAssetId_required" }, { status: 400 });
      }
      if (body?.status !== undefined && pickStatus(body.status) === "published") {
        return NextResponse.json({ ok: false, error: "use_game_asset_publish_endpoint" }, { status: 400 });
      }

      const updated = await updateGameAsset(gameAssetId, getUpdatePayload(body, user));
      if (!updated) return NextResponse.json({ ok: false, error: "game_asset_not_found" }, { status: 404 });

      return NextResponse.json({ ok: true, data: updated });
    } catch (error) {
      logger.error("[GameAssets][PUT] failed:", error);
      return NextResponse.json({ ok: false, error: "game_asset_update_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets:update",
  { requireAdmin: true },
);
