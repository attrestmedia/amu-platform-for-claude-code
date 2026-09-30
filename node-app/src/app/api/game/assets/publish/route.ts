import { NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { getGameAssetById, getStageModel, updateGameAsset } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString, normalizeSprite } from "libs/server-utils/api/apiSafetyHelper";
import { validateStageAssetGameSpec } from "utils/game/gameAssetSpec";
import { validateStageAssetProjectionMeta } from "utils/game/isometricEditor";
import { isControllableSprite } from "utils/game";
import { evaluateChromaKeyPublishGate } from "utils/game/chromaKeyPublishGate";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { PersonaSchema, type IPersonaDocument } from "models/universe";
import type { IStageAsset, IStageDoc } from "types/game";
import type { IPersonaSprite } from "types/ai";
import { logger } from "utils/log";
import { toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { IGameAssetDoc } from "types/game";
import { getR2PublicObjectFromUrl, r2ObjectExists } from "libs/server-utils/storage/r2Storage";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";

export const runtime = "nodejs";

type PublishTargetType = "persona" | "stage";
type GameAssetLike = Partial<IGameAssetDoc> & UnknownRecord;

function sanitizeSegment(value: string) {
  const raw = normalizeString(value);
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(raw) ? raw : "";
}

function normalizeRuntimeImageUrl(url: string) {
  const clean = normalizeString(url);
  if (!clean || clean.includes("..")) return "";
  if (/^https?:\/\//.test(clean) || clean.startsWith("/")) return clean;
  return "";
}

function createSpriteFromAsset(asset: GameAssetLike): IPersonaSprite {
  const sheet = (asset?.spriteSheet || {}) as UnknownRecord;
  const spriteAction = toUnknownRecord(toUnknownRecord(asset?.meta).spriteAction);
  const sprite = normalizeSprite({
    url: (asset?.storage as { url?: string } | undefined)?.url,
    frameWidth: Number(sheet.frameWidth || 256),
    frameHeight: Number(sheet.frameHeight || 256),
    columns: Number(sheet.columns || 4),
    rows: Number(sheet.rows || 4),
    directionCount: 8,
    fps: Number(sheet.fps || 8),
    idleFps: Number(sheet.idleFps || 0),
    idleDirection: "down",
    loop: spriteAction.loop === undefined ? true : Boolean(spriteAction.loop),
    animations: (sheet.animations as Record<string, { row: number; frames: number[] }> | undefined) || {
      down: { row: 0, frames: [0, 1, 2, 3] },
      up: { row: 1, frames: [0, 1, 2, 3] },
      left: { row: 2, frames: [0, 1, 2, 3] },
      right: { row: 3, frames: [0, 1, 2, 3] },
    },
  });

  if (!sprite || !isControllableSprite(sprite)) throw new Error("invalid_controllable_sprite_sheet");
  return sprite;
}

function normalizeSpriteActionKey(value: unknown) {
  return (
    normalizeString(value)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "walk"
  );
}

function getActor(user: AuthenticatedUserType) {
  return (
    normalizeString(user?.userEmailLower) ||
    normalizeString(user?.userEmail) ||
    normalizeString(user?.email) ||
    (user?.ID ? String(user.ID) : "admin")
  );
}

async function publishToPersona(args: {
  asset: GameAssetLike;
  universeId: string;
  personaPid: string;
  spriteActionKey?: string;
  user: AuthenticatedUserType;
}) {
  const universeId = sanitizeSegment(args.universeId);
  const personaPid = normalizeString(args.personaPid);
  if (!universeId || !personaPid) throw new Error("persona_publish_target_required");

  const PersonaModel = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, universeId, PersonaSchema, universeId);
  const actionKey = normalizeSpriteActionKey(args.spriteActionKey || toUnknownRecord(toUnknownRecord(args.asset.meta).spriteAction).key);
  const generatedSprite = createSpriteFromAsset(args.asset);
  const current = await PersonaModel.findOne({ pid: personaPid }).select({ sprite: 1 }).lean<IPersonaDocument | null>();
  if (!current) throw new Error("persona_not_found");

  const currentSprite = normalizeSprite(current.sprite);
  let sprite: IPersonaSprite;
  if (actionKey === "walk") {
    sprite = {
      ...generatedSprite,
      ...(currentSprite?.actions ? { actions: currentSprite.actions } : {}),
    };
  } else {
    if (!currentSprite) throw new Error("base_walk_sprite_required");
    const { actions: _nestedActions, ...actionResource } = generatedSprite;
    sprite = {
      ...currentSprite,
      actions: {
        ...(currentSprite.actions || {}),
        [actionKey]: actionResource,
      },
    };
  }
  const updated = await PersonaModel.findOneAndUpdate(
    { pid: personaPid },
    {
      $set: {
        sprite,
        updatedAt: new Date(),
      },
    },
    { new: true },
  ).lean();

  if (!updated) throw new Error("persona_not_found");

  return {
    targetType: "persona",
    universeId,
    personaPid,
    spriteActionKey: actionKey,
    sprite,
  };
}

async function publishToStage(args: {
  asset: GameAssetLike;
  stageDocumentId?: string;
  stageId?: string;
  stageName?: string;
  assetName?: string;
  roles?: string[];
  size?: { width?: number; height?: number };
}) {
  // 게임 규격 게이트 (계약 v2 §4.5) — tile/object/building 계열은 footprint/anchor/isoHeightPx 없이 발행 불가
  const specCheck = validateStageAssetGameSpec({
    assetType: String(args.asset?.assetType || ""),
    runtime: args.asset?.runtime,
  });
  if (!specCheck.ok) {
    throw new Error(`game_spec_required:${specCheck.missing.join(",")}`);
  }

  const StageModel = await getStageModel();
  const stageDocumentId = normalizeString(args.stageDocumentId);
  const stageId = sanitizeSegment(args.stageId || args.asset?.stageId || "");
  const stageName = sanitizeSegment(args.stageName || "");

  const stage = stageDocumentId
    ? await StageModel.findById(stageDocumentId).lean<IStageDoc | null>()
    : await StageModel.findOne({ stageId, ...(stageName ? { stageName } : {}) }).lean<IStageDoc | null>();

  if (!stage) throw new Error("stage_not_found");
  if (stage.releaseDeployment?.status === "active") throw new Error("stage_release_locked");

  const assetName = [args.assetName, args.asset?.name, args.asset?.gameAssetId]
    .map((value) => sanitizeSegment(String(value || "")))
    .find(Boolean) || "";
  if (!assetName) throw new Error("stage_asset_name_required");

  const runtimeImageUrl = normalizeRuntimeImageUrl(String((args.asset?.storage as { url?: string } | undefined)?.url || ""));
  if (!runtimeImageUrl) throw new Error("invalid_runtime_asset_url");

  // 런타임 소비 키(meta.isoFootprint/isoAnchor/isoHeightPx)로 투영 메타를 매핑하고
  // 커널 검증(fail-closed)으로 잘못된 투영 메타 발행을 차단 (ISO-6)
  const runtimeMeta = (args.asset?.runtime || {}) as {
    footprint?: { width?: number; height?: number; offsetX?: number; offsetY?: number };
    anchor?: { x?: number; y?: number };
    isoHeightPx?: number;
  };
  const isoFootprint = runtimeMeta.footprint
    ? {
        width: Number(runtimeMeta.footprint.width),
        height: Number(runtimeMeta.footprint.height),
        offsetX: Number(runtimeMeta.footprint.offsetX ?? 0),
        offsetY: Number(runtimeMeta.footprint.offsetY ?? 0),
      }
    : undefined;
  const isoAnchor =
    runtimeMeta.anchor && runtimeMeta.anchor.x !== undefined && runtimeMeta.anchor.y !== undefined
      ? { x: Number(runtimeMeta.anchor.x), y: Number(runtimeMeta.anchor.y) }
      : undefined;
  const isoHeightPx = runtimeMeta.isoHeightPx !== undefined ? Number(runtimeMeta.isoHeightPx) : undefined;

  const projectionCheck = validateStageAssetProjectionMeta({ isoFootprint, isoAnchor, isoHeightPx });
  if (!projectionCheck.valid) {
    throw new Error(
      `invalid_projection_meta:${projectionCheck.issues.map((issue) => `${issue.path}(${issue.code})`).join(",")}`,
    );
  }

  const nextAsset: IStageAsset = {
    name: assetName,
    fileName: runtimeImageUrl,
    size: {
      width: Math.max(1, Number(args.size?.width || isoFootprint?.width || 1)),
      height: Math.max(1, Number(args.size?.height || isoFootprint?.height || 1)),
    },
    roles: Array.isArray(args.roles) ? args.roles : [],
    meta: {
      ...((args.asset?.runtime as UnknownRecord) || {}),
      ...(isoFootprint ? { isoFootprint } : {}),
      ...(isoAnchor ? { isoAnchor } : {}),
      ...(isoHeightPx !== undefined ? { isoHeightPx } : {}),
      gameAssetId: args.asset.gameAssetId,
      sourceUrl: runtimeImageUrl,
      runtimeUrl: runtimeImageUrl,
      sourceImageAssetId: String(args.asset?.sourceImageAssetId || ""),
      assetType: String(args.asset?.assetType || ""),
      regions: Array.isArray(args.asset?.regions) ? args.asset.regions : [],
    },
  };

  const currentAssets = Array.isArray(stage.assets) ? [...stage.assets] : [];
  const existingIndex = currentAssets.findIndex((item) => item.name === assetName);
  if (existingIndex >= 0) currentAssets[existingIndex] = nextAsset;
  else currentAssets.push(nextAsset);

  const updated = await StageModel.findByIdAndUpdate(
    (stage as { _id?: unknown })._id,
    { $set: { assets: currentAssets } },
    { new: true, runValidators: true },
  ).lean<IStageDoc | null>();

  if (!updated) throw new Error("stage_update_failed");

  try {
    await redisCache.invalidateByTag(CacheKeyManager.stage.tagStage(updated.stageId, updated.stageName));
    await redisCache.invalidateByTag(CacheKeyManager.stage.tagRequest(updated.stageId, updated.stageName));
  } catch (error) {
    logger.warn("[GameAssets][Publish] stage cache invalidation warning:", error);
  }

  return {
    targetType: "stage",
    stageDocumentId: String((updated as { _id?: unknown })._id || ""),
    stageId: updated.stageId,
    stageName: updated.stageName,
    asset: nextAsset,
  };
}

export const POST = withAuth(
  async (body, user) => {
    try {
      const gameAssetId = normalizeString(body?.gameAssetId);
      const targetType = normalizeString(body?.targetType) as PublishTargetType;
      if (!gameAssetId || (targetType !== "persona" && targetType !== "stage")) {
        return NextResponse.json({ ok: false, error: "invalid_publish_payload" }, { status: 400 });
      }

      const asset = await getGameAssetById(gameAssetId);
      if (!asset) return NextResponse.json({ ok: false, error: "game_asset_not_found" }, { status: 404 });
      if (!asset.storage?.url) return NextResponse.json({ ok: false, error: "game_asset_storage_required" }, { status: 400 });
      const publicR2Object = getR2PublicObjectFromUrl(asset.storage.url);
      if (
        !publicR2Object ||
        asset.storage.driver !== "r2" ||
        asset.storage.access !== "public" ||
        asset.storage.bucket !== publicR2Object.bucket ||
        asset.storage.key !== publicR2Object.key
      ) {
        return NextResponse.json({ ok: false, error: "public_r2_game_asset_storage_required" }, { status: 400 });
      }
      if (
        !String(asset.storage.mimeType || "").startsWith("image/") ||
        !Number.isFinite(Number(asset.storage.bytes)) ||
        Number(asset.storage.bytes) <= 0 ||
        !/^[a-f0-9]{64}$/i.test(String(asset.storage.sha256 || ""))
      ) {
        return NextResponse.json({ ok: false, error: "game_asset_storage_metadata_required" }, { status: 400 });
      }
      if (!(await r2ObjectExists(publicR2Object))) {
        return NextResponse.json({ ok: false, error: "r2_game_asset_object_not_found" }, { status: 409 });
      }

      // CK-303: chromaKey quality gate — quality fail asset publish 차단
      const chromaKeyGate = evaluateChromaKeyPublishGate({
        assetMeta: asset.meta as Record<string, unknown> | undefined,
        assetType: asset.assetType,
      });
      if (!chromaKeyGate.allowed) {
        return NextResponse.json(
          { ok: false, error: chromaKeyGate.reason || "chroma_key_quality_publish_blocked", errorCode: chromaKeyGate.errorCode || "CHROMA_KEY_QUALITY_FAIL" },
          { status: 409 },
        );
      }

      const result =
        targetType === "persona"
          ? await publishToPersona({
              asset,
              universeId: normalizeString(body?.universeId || asset.universeId),
              personaPid: normalizeString(body?.personaPid),
              spriteActionKey: normalizeString(body?.spriteActionKey),
              user,
            })
          : await publishToStage({
              asset,
              stageDocumentId: normalizeString(body?.stageDocumentId),
              stageId: normalizeString(body?.stageId || asset.stageId),
              stageName: normalizeString(body?.stageName),
              assetName: normalizeString(body?.assetName),
              roles: Array.isArray(body?.roles) ? body.roles.map((item: unknown) => normalizeString(item)).filter(Boolean) : [],
              size: body?.size,
            });

      const updated = await updateGameAsset(gameAssetId, {
        status: "published",
        updatedBy: getActor(user),
        meta: {
          ...(asset.meta || {}),
          publishedAt: new Date().toISOString(),
          publishedBy: getActor(user),
          publishedTarget: result,
        },
      });

      return NextResponse.json({ ok: true, data: { asset: updated, publishedTarget: result } });
    } catch (error) {
      logger.error("[GameAssets][Publish] failed:", error);
      const message = toErrorMessage(error, "game_asset_publish_failed");
      const status = message.includes("not_found") ? 404 : message === "stage_release_locked" ? 409 : 400;
      return NextResponse.json({ ok: false, error: message }, { status });
    }
  },
  undefined,
  "game/assets:publish",
  { requireAdmin: true },
);
