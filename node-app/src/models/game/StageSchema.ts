import { Schema, Document } from "mongoose";
import type { IStageDoc } from "types/game/stage-doc";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(name, fileName, size, width, height, roles) 및 인덱스/기본값 선언
 * @domain stage
 * @scope db_schema
 */

// Mongo 도큐먼트 타입
export interface IStageDocument extends Document, IStageDoc {}

const StageProjectionConfigV2Schema = new Schema(
  {
    projection: { type: String, enum: ["isometric-2to1"], required: true },
    tileWidth: { type: Number, required: true, min: Number.MIN_VALUE },
    tileHeight: { type: Number, required: true, min: Number.MIN_VALUE },
    origin: {
      screenX: { type: Number, required: true },
      screenY: { type: Number, required: true },
    },
    logicalUnitsPerTile: { type: Number, required: true, min: Number.MIN_VALUE },
    rounding: {
      storage: { type: String, enum: ["integer"], required: true },
      occupancy: { type: String, enum: ["floor"], required: true },
      snap: { type: String, enum: ["round"], required: true },
      picking: { type: String, enum: ["nearest-cell"], required: true },
    },
  },
  { _id: false },
);

// 에셋 스키마
const StageAssetSchema = new Schema(
  {
    name: { type: String, required: true }, // 스테이지 내에서 사용하는 키
    fileName: { type: String, required: true }, // 런타임 이미지 URL
    size: {
      width: { type: Number, required: true }, // 타일 단위
      height: { type: Number, required: true },
    },
    roles: {
      type: [String], // "heal" | "shop" | "obstacle" 등
      default: [],
    },
    // 전략/게임 메타 (HP, 노후도, 상태 등)
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const StageBackgroundSchema = new Schema(
  {
    name: { type: String },
    size: {
      width: { type: Number },
      height: { type: Number },
    },
  },
  { _id: false }
);

// 레이아웃 타일 스키마
const StageLayoutTileSchema = new Schema(
  {
    id: { type: String, required: true },
    assetName: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    rotation: { type: Number },
    scale: { type: Number },
    state: { type: String },
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

// 레이아웃 스키마
const StageLayoutSchema = new Schema(
  {
    mode: {
      type: String,
      enum: ["auto", "manual", "mixed"],
      default: "auto",
      required: true,
    },

    // IStageLayout 와 1:1 매칭
    width: { type: Number, required: true },
    height: { type: Number, required: true },

    tiles: {
      type: [StageLayoutTileSchema],
      default: [],
    },
  },
  { _id: false }
);

const StageReleaseDeploymentSchema = new Schema(
  {
    schemaVersion: { type: Number, enum: [1], required: true },
    status: { type: String, enum: ["prepared", "active"], required: true },
    universeId: { type: String, required: true },
    releaseId: { type: String, required: true },
    manifestVersion: { type: String, required: true },
    manifestKey: { type: String, required: true },
    manifestUrl: { type: String, required: true },
    manifestSha256: { type: String, required: true },
    stageDocKey: { type: String, required: true },
    stageDocSha256: { type: String, required: true },
    coordinateContractVersion: { type: Number, enum: [2], required: true },
    preparedAt: { type: String, required: true },
    activatedAt: { type: String, default: undefined },
  },
  { _id: false, strict: "throw" },
);

const StagePortalSchema = new Schema(
  {
    objectId: { type: String, required: true },
    targetStageId: { type: String, required: true },
    targetSpawn: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    locked: { type: Boolean, default: false },
    meta: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false, strict: "throw" },
);

// StageDoc 메인 스키마
export const StageSchema = new Schema<IStageDocument>(
  {
    // 기본 식별자
    stageId: { type: String, required: true },
    stageName: { type: String, required: true },

    coordinateContractVersion: {
      type: Number,
      enum: [2],
      required: true,
      default: 2,
      index: true,
    },
    projectionConfig: {
      type: StageProjectionConfigV2Schema,
      required: true,
    },
    releaseDeployment: {
      type: StageReleaseDeploymentSchema,
      default: undefined,
    },

    // 도메인/스코프
    domain: {
      type: String,
      enum: ["stage", "asset-pack", "layout-template"],
      default: "stage",
      index: true,
    },
    ownerType: {
      type: String,
      enum: ["global", "universe", "user"],
      default: "global",
      index: true,
    },
    ownerId: {
      type: String,
      default: undefined,
      index: true,
    },
    visibility: {
      type: String,
      enum: ["private", "universe", "public"],
      default: "private",
    },
    usageType: {
      type: String,
      enum: ["game", "commerce", "both"],
      default: "game",
      index: true,
    },

    // 배경/경계/에셋/레이아웃
    background: {
      type: StageBackgroundSchema,
      default: undefined,
    },
    border: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    assets: {
      type: [StageAssetSchema],
      default: [],
    },
    layout: {
      type: StageLayoutSchema,
      default: undefined,
    },
    portals: {
      type: [StagePortalSchema],
      default: undefined,
    },
    regionRef: {
      type: String,
      default: undefined,
    },
    // 관리 메타
    createdBy: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: "stages",
    strict: "throw",
  }
);

// 기본 인덱스들
StageSchema.index({ stageId: 1, stageName: 1, domain: 1 });
StageSchema.index({ domain: 1, usageType: 1 });
StageSchema.index({ ownerType: 1, ownerId: 1 });
StageSchema.index({ visibility: 1 });
