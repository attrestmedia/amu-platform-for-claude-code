import { NextResponse } from "next/server";
import { listGameAssets } from "libs/database/game";
import { getImageAssetByAssetId } from "libs/database/lab";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { GameAssetType, IGameAssetDoc } from "types/game";
import { generateWorldAsset, getWorldAssetGenerationQuote } from "libs/server-utils/game/worldAssetGenerationService";
import { logger } from "utils/log";
import type { UnknownRecord } from "utils/common";

export const runtime = "nodejs";

const WORLD_ASSET_TYPES = new Set<GameAssetType>([
  "stage-tileset",
  "prop-sheet",
  "building-sheet",
  "tile",
  "object",
]);

const CATEGORY_TYPES: Record<string, Set<GameAssetType>> = {
  building: new Set(["building-sheet"]),
  terrain: new Set(["stage-tileset"]),
  tree: new Set(["object"]),
  rock: new Set(["object"]),
  decor: new Set(["prop-sheet"]),
  object: new Set(["object"]),
  tile: new Set(["tile"]),
};

function normalize(value: string | null) {
  return String(value || "").trim().toLowerCase();
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function matchesCategory(asset: IGameAssetDoc, category: string) {
  if (!category) return true;
  const categories = new Set((asset.categories || []).map((value) => normalize(value)));
  return categories.has(category) || Boolean(CATEGORY_TYPES[category]?.has(asset.assetType));
}

function isPublicAsset(asset: IGameAssetDoc) {
  return asset.status === "published" && asset.storage?.access === "public" && Boolean(asset.storage?.url);
}

function sortNewest(left: IGameAssetDoc, right: IGameAssetDoc) {
  const leftTime = new Date(String(left.updatedAt || left.createdAt || 0)).getTime();
  const rightTime = new Date(String(right.updatedAt || right.createdAt || 0)).getTime();
  return rightTime - leftTime;
}

async function refreshPrivateDisplayUrl(asset: IGameAssetDoc) {
  const sourceImageAssetId = String(asset.sourceImageAssetId || "").trim();
  if (!sourceImageAssetId) return asset;
  const imageAsset = await getImageAssetByAssetId(sourceImageAssetId);
  if (!imageAsset) return asset;
  const display = await resolveImageAssetDisplayUrl(imageAsset as unknown as UnknownRecord, { delivery: "signed" });
  return display.url
    ? { ...asset, storage: { ...asset.storage, url: display.url } }
    : asset;
}

function validateWorldAssetCreate(body: UnknownRecord) {
  const required = ["universeId", "categoryKey", "presetKey", "clientRequestId"];
  if (required.some((key) => typeof body?.[key] !== "string" || !String(body[key]).trim())) {
    return { valid: false, error: "월드 에셋 생성에 필요한 값이 없습니다." };
  }
  if (body.name !== undefined && typeof body.name !== "string") {
    return { valid: false, error: "월드 에셋 이름 형식이 유효하지 않습니다." };
  }
  return { valid: true };
}

/**
 * @docHint
 * @purpose Forge 사용자의 월드 에셋 라이브러리 읽기 전용 projection
 * @process 본인 소유 에셋 + 발행 공용 에셋 조회  월드 타입/카테고리 필터  중복 제거  페이지 반환
 * @domain game.world-assets
 * @scope user-api
 */
export const GET = withAuth(
  async (_body, user, request) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

      const { searchParams } = new URL(request.url);
      const quoteCategoryKey = normalize(searchParams.get("categoryKey"));
      const quotePresetKey = normalize(searchParams.get("presetKey"));
      if (quoteCategoryKey && quotePresetKey) {
        const quote = await getWorldAssetGenerationQuote({
          categoryKey: quoteCategoryKey,
          presetKey: quotePresetKey,
        });
        return NextResponse.json({ ok: true, data: quote });
      }
      const category = normalize(searchParams.get("category"));
      const page = positiveInt(searchParams.get("page"), 1);
      const pageSize = Math.min(24, positiveInt(searchParams.get("pageSize"), 12));

      const [mine, published] = await Promise.all([
        listGameAssets({ createdBy: uid, status: "all", page: 1, pageSize: 100 }),
        listGameAssets({ status: "published", page: 1, pageSize: 100 }),
      ]);

      const byId = new Map<string, IGameAssetDoc>();
      for (const asset of mine.items as IGameAssetDoc[]) {
        if (WORLD_ASSET_TYPES.has(asset.assetType) && asset.storage?.url) byId.set(asset.gameAssetId, asset);
      }
      for (const asset of published.items as IGameAssetDoc[]) {
        if (WORLD_ASSET_TYPES.has(asset.assetType) && isPublicAsset(asset) && !byId.has(asset.gameAssetId)) {
          byId.set(asset.gameAssetId, asset);
        }
      }

      const filtered = Array.from(byId.values()).filter((asset) => matchesCategory(asset, category)).sort(sortNewest);
      const total = filtered.length;
      const start = (page - 1) * pageSize;

      const pageItems = await Promise.all(filtered.slice(start, start + pageSize).map(refreshPrivateDisplayUrl));

      return NextResponse.json({
        ok: true,
        data: pageItems,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    } catch (error) {
      logger.error("[WorldAssets][GET] failed:", error);
      return NextResponse.json({ ok: false, error: "world_assets_list_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/world-assets:list",
);

export const POST = withAuth(
  async (body, user) => {
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const result = await generateWorldAsset({
      uid,
      universeId: String(body?.universeId || ""),
      categoryKey: String(body?.categoryKey || ""),
      presetKey: String(body?.presetKey || ""),
      name: body?.name === undefined ? undefined : String(body.name),
      clientRequestId: String(body?.clientRequestId || ""),
    });
    return NextResponse.json({ ok: true, data: result }, { status: result.replayed ? 200 : 201 });
  },
  validateWorldAssetCreate,
  "game/world-assets:create",
  {
    checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
    bodyParser: "json",
  },
);
