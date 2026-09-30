import { Model } from "mongoose";
import { getModel } from "libs/database/modelCache";
import { GameAssetSchema, type IGameAssetDocument } from "models/game";
import { MONGODB_GAME_URL } from "consts/env/server";
import type {
  GameAssetInventorySummaryType,
  GameAssetStatusType,
  GameAssetType,
  IGameAssetDoc,
} from "types/game";

function makeGameAssetId(assetType: string) {
  const prefix = String(assetType || "asset").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return `game_${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function compactStrings(values?: string[]) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function safeRegex(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export async function getGameAssetModel(): Promise<Model<IGameAssetDocument>> {
  return getModel<IGameAssetDocument>(MONGODB_GAME_URL, "GameAsset", GameAssetSchema, "game_assets");
}

export async function createGameAsset(input: Partial<IGameAssetDoc> & { name: string; assetType: GameAssetType }) {
  const model = await getGameAssetModel();
  const doc = await model.create({
    ...input,
    gameAssetId: input.gameAssetId || makeGameAssetId(input.assetType),
    name: String(input.name || "").trim(),
    assetType: input.assetType,
    status: input.status || "draft",
    sourceType: input.sourceType || "generated",
    sourceImageAssetId: String(input.sourceImageAssetId || "").trim(),
    templateKey: String(input.templateKey || "").trim(),
    universeId: String(input.universeId || "").trim(),
    stageId: String(input.stageId || "").trim(),
    tags: compactStrings(input.tags),
    categories: compactStrings(input.categories),
  });

  return (doc.toObject?.() ?? doc) as IGameAssetDocument;
}

export async function listGameAssets(params: {
  assetType?: GameAssetType;
  status?: GameAssetStatusType | "all";
  universeId?: string;
  stageId?: string;
  sourceImageAssetId?: string;
  templateKey?: string;
  createdBy?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const model = await getGameAssetModel();
  const filter: Record<string, unknown> = {};

  if (params.assetType) filter.assetType = params.assetType;
  if (params.status && params.status !== "all") filter.status = params.status;
  if (params.universeId) filter.universeId = String(params.universeId).trim();
  if (params.stageId) filter.stageId = String(params.stageId).trim();
  if (params.sourceImageAssetId) filter.sourceImageAssetId = String(params.sourceImageAssetId).trim();
  if (params.templateKey) filter.templateKey = String(params.templateKey).trim();
  if (params.createdBy) filter.createdBy = String(params.createdBy).trim();
  if (params.q) {
    const q = safeRegex(String(params.q).trim());
    filter.$or = [{ gameAssetId: q }, { name: q }, { templateKey: q }, { tags: q }, { categories: q }];
  }

  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 20)));
  const skip = (page - 1) * pageSize;
  const [items, total, inventoryRows] = await Promise.all([
    model.find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    model.countDocuments(filter),
    model.aggregate([
      { $match: filter },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                r2Ready: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$storage.driver", "r2"] },
                          { $eq: ["$storage.access", "public"] },
                          { $gt: [{ $strLenCP: { $ifNull: ["$storage.bucket", ""] } }, 0] },
                          { $gt: [{ $strLenCP: { $ifNull: ["$storage.key", ""] } }, 0] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                published: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } },
              },
            },
          ],
          byType: [{ $group: { _id: "$assetType", count: { $sum: 1 } } }],
          publishedByType: [
            { $match: { status: "published" } },
            { $group: { _id: "$assetType", count: { $sum: 1 } } },
          ],
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        },
      },
    ]),
  ]);
  const inventoryRow = inventoryRows[0] as
    | {
        totals?: Array<{ total?: number; r2Ready?: number; published?: number }>;
        byType?: Array<{ _id: GameAssetType; count: number }>;
        publishedByType?: Array<{ _id: GameAssetType; count: number }>;
        byStatus?: Array<{ _id: GameAssetStatusType; count: number }>;
      }
    | undefined;
  const totals = inventoryRow?.totals?.[0];
  const toCountMap = <T extends string>(rows?: Array<{ _id: T; count: number }>) =>
    Object.fromEntries((rows || []).map((row) => [row._id, row.count]));
  const inventory: GameAssetInventorySummaryType = {
    total: Number(totals?.total || 0),
    r2Ready: Number(totals?.r2Ready || 0),
    migrationRequired: Math.max(0, Number(totals?.total || 0) - Number(totals?.r2Ready || 0)),
    published: Number(totals?.published || 0),
    byType: toCountMap(inventoryRow?.byType),
    publishedByType: toCountMap(inventoryRow?.publishedByType),
    byStatus: toCountMap(inventoryRow?.byStatus),
  };

  return {
    items,
    inventory,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getGameAssetById(gameAssetId: string) {
  const model = await getGameAssetModel();
  return await model.findOne({ gameAssetId: String(gameAssetId || "").trim() }).lean();
}

export async function getGameAssetByWorldAssetClientRequestId(args: { createdBy: string; clientRequestId: string }) {
  const createdBy = String(args.createdBy || "").trim();
  const clientRequestId = String(args.clientRequestId || "").trim();
  if (!createdBy || !clientRequestId) return null;
  const model = await getGameAssetModel();
  return await model
    .findOne({
      createdBy,
      "meta.worldAsset.clientRequestId": clientRequestId,
    })
    .sort({ createdAt: -1 })
    .lean();
}

export async function updateGameAsset(gameAssetId: string, input: Partial<IGameAssetDoc>) {
  const model = await getGameAssetModel();
  const payload: Partial<IGameAssetDoc> = { ...input };
  delete payload.gameAssetId;
  if (payload.name !== undefined) payload.name = String(payload.name || "").trim();
  if (payload.tags !== undefined) payload.tags = compactStrings(payload.tags);
  if (payload.categories !== undefined) payload.categories = compactStrings(payload.categories);

  return await model
    .findOneAndUpdate(
      { gameAssetId: String(gameAssetId || "").trim() },
      { $set: payload },
      { new: true },
    )
    .lean();
}

export function buildMotionGuideGameAssetId(args: {
  actionKey: string;
  direction: string;
  version: number;
  frameCount: number;
}) {
  const segment = (value: string) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `game_motion_guide_${segment(args.actionKey)}_${segment(args.direction)}_v${args.version}_f${args.frameCount}`;
}

export async function getMotionGuideGameAsset(args: {
  actionKey: string;
  direction: string;
  version: number;
  frameCount?: number;
}) {
  const model = await getGameAssetModel();
  return model
    .findOne({
      gameAssetId: buildMotionGuideGameAssetId({ ...args, frameCount: args.frameCount || 4 }),
      assetType: "motion-guide",
    })
    .lean<IGameAssetDoc>();
}

export async function listMotionGuideGameAssets(args: {
  actionKeys?: string[];
  directions?: string[];
  version?: number;
  frameCount?: number;
}) {
  const model = await getGameAssetModel();
  const filter: Record<string, unknown> = { assetType: "motion-guide" };
  if (args.actionKeys?.length) filter["meta.motionGuide.actionKey"] = { $in: compactStrings(args.actionKeys) };
  if (args.directions?.length) filter["meta.motionGuide.direction"] = { $in: compactStrings(args.directions) };
  if (args.version) filter["meta.motionGuide.version"] = args.version;
  if (args.frameCount) filter["meta.motionGuide.frameCount"] = args.frameCount;
  return model.find(filter).sort({ "meta.motionGuide.actionKey": 1, "meta.motionGuide.direction": 1 }).lean<IGameAssetDoc[]>();
}

export async function upsertMotionGuideGameAsset(input: Omit<IGameAssetDoc, "gameAssetId" | "assetType"> & {
  actionKey: string;
  direction: string;
  version: number;
  frameCount: number;
}) {
  const model = await getGameAssetModel();
  const gameAssetId = buildMotionGuideGameAssetId(input);
  const { actionKey: _actionKey, direction: _direction, version: _version, frameCount: _frameCount, ...asset } = input;
  return model
    .findOneAndUpdate(
      { gameAssetId, assetType: "motion-guide" },
      {
        $set: { ...asset, gameAssetId, assetType: "motion-guide" },
        $setOnInsert: { createdAt: new Date() },
      },
      { new: true, upsert: true, runValidators: true },
    )
    .lean<IGameAssetDoc>();
}
