import { Schema, type Document } from "mongoose";
import {
  GAME_ASSET_PIPELINE_KINDS,
  GAME_ASSET_PIPELINE_STATUSES,
  type IGameAssetPipelineDoc,
} from "types/game/asset-pipeline";

/**
 * @docHint
 * @purpose 에셋 생성 파이프라인 v2 원장 (STEP1~5 상태 머신 + 멱등 키 + step/direction/billing 기록)
 * @process pipelineId/idempotencyKey unique  status 상태 머신  steps/directions Mixed 원장  billing 집계
 * @domain game.asset-pipeline
 * @scope admin
 */

export interface IGameAssetPipelineDocument extends Document, IGameAssetPipelineDoc {}

const GameAssetPipelineAnchorSchema = new Schema(
  {
    imageAssetId: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    sha256: { type: String, default: "" },
    bible: {
      type: new Schema(
        {
          assetId: { type: String, required: true },
          sha256: { type: String, required: true },
          columns: { type: Number, required: true, enum: [5] },
          cellWidth: { type: Number, required: true },
          cellHeight: { type: Number, required: true },
          directions: { type: [String], required: true },
          symmetry: { type: String, required: true, enum: ["symmetric", "asymmetric"] },
          confirmedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false },
);

export const GameAssetPipelineSchema = new Schema<IGameAssetPipelineDocument>(
  {
    pipelineId: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: GAME_ASSET_PIPELINE_KINDS, required: true, index: true },
    status: {
      type: String,
      enum: GAME_ASSET_PIPELINE_STATUSES,
      required: true,
      default: "draft",
      index: true,
    },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "" },
    templateVersion: { type: Number, required: true, default: 2 },
    anchor: { type: GameAssetPipelineAnchorSchema, required: true },
    variables: { type: Schema.Types.Mixed, default: {} },
    steps: { type: Schema.Types.Mixed, default: {} },
    directions: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed, default: undefined },
    billing: { type: Schema.Types.Mixed, default: { totalCoins: 0, jobs: [] } },
    adminResets: { type: Schema.Types.Mixed, default: [] },
    createdBy: { type: String, default: "", index: true },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "game_asset_pipelines" },
);

GameAssetPipelineSchema.index({ kind: 1, status: 1, updatedAt: -1 });
GameAssetPipelineSchema.index({ createdBy: 1, createdAt: -1 });
