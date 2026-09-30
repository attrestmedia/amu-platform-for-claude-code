import { Schema, Document } from "mongoose";
import {
  GAME_ASSET_SOURCE_TYPES,
  GAME_ASSET_STATUSES,
  GAME_ASSET_TYPES,
  type IGameAssetDoc,
} from "types/game/asset";

export interface IGameAssetDocument extends Document, IGameAssetDoc {}

const GameAssetStorageSchema = new Schema(
  {
    driver: { type: String, enum: ["r2"], default: undefined },
    access: { type: String, enum: ["public", "private"], default: undefined },
    bucket: { type: String, default: "" },
    key: { type: String, default: "" },
    url: { type: String, required: true },
    mimeType: { type: String, default: "" },
    width: { type: Number, default: undefined },
    height: { type: Number, default: undefined },
    bytes: { type: Number, default: undefined },
    sha256: { type: String, default: "" },
    ext: { type: String, default: "" },
  },
  { _id: false },
);

const GameAssetRectSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false },
);

const GameAssetRegionSchema = new Schema(
  {
    key: { type: String, required: true },
    rect: { type: GameAssetRectSchema, required: true },
    role: { type: String, default: "" },
    anchor: {
      type: {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
      },
      default: undefined,
      _id: false,
    },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const GameAssetSpriteSheetSchema = new Schema(
  {
    frameWidth: { type: Number, required: true },
    frameHeight: { type: Number, required: true },
    columns: { type: Number, required: true },
    rows: { type: Number, required: true },
    fps: { type: Number, default: undefined },
    animations: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

export const GameAssetSchema = new Schema<IGameAssetDocument>(
  {
    gameAssetId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    assetType: { type: String, enum: GAME_ASSET_TYPES, required: true, index: true },
    status: { type: String, enum: GAME_ASSET_STATUSES, required: true, default: "draft", index: true },
    sourceType: { type: String, enum: GAME_ASSET_SOURCE_TYPES, required: true, default: "generated", index: true },
    sourceImageAssetId: { type: String, default: "", index: true },
    templateKey: { type: String, default: "", index: true },
    provider: { type: String, default: "" },
    modelName: { type: String, default: "" },
    universeId: { type: String, default: "", index: true },
    stageId: { type: String, default: "", index: true },
    tags: [{ type: String }],
    categories: [{ type: String }],
    storage: { type: GameAssetStorageSchema, required: true },
    spriteSheet: { type: GameAssetSpriteSheetSchema, default: undefined },
    regions: { type: [GameAssetRegionSchema], default: [] },
    runtime: { type: Schema.Types.Mixed, default: {} },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  {
    timestamps: true,
    collection: "game_assets",
    strict: false,
  },
);

GameAssetSchema.index({ assetType: 1, status: 1, updatedAt: -1 });
GameAssetSchema.index({ universeId: 1, stageId: 1, assetType: 1, status: 1 });
GameAssetSchema.index({ templateKey: 1, status: 1, updatedAt: -1 });
