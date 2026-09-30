import { Schema, type Document } from "mongoose";
import {
  USER_GAME_CHARACTER_MODERATION_STATUSES,
  USER_GAME_CHARACTER_REPORT_REASONS,
  USER_GAME_CHARACTER_SOURCE_TYPES,
  USER_GAME_CHARACTER_GENESIS_STATUSES,
  USER_GAME_CHARACTER_STATUSES,
  type IUserGameCharacterDoc,
} from "types/game/user-game-character";

export interface IUserGameCharacterDocument extends Document, IUserGameCharacterDoc {}

export const UserGameCharacterSchema = new Schema<IUserGameCharacterDocument>(
  {
    characterId: { type: String, required: true, unique: true, index: true },
    uid: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    personalUniverseId: { type: String, default: "", index: true },
    name: { type: String, required: true },
    status: { type: String, enum: USER_GAME_CHARACTER_STATUSES, required: true, default: "draft", index: true },
    sourceType: { type: String, enum: USER_GAME_CHARACTER_SOURCE_TYPES, required: true },
    sourceImageRef: { type: String, required: true },
    sourceImageAssetId: { type: String, required: true, index: true },
    sourcePersonaId: { type: String, default: "" },
    sourceReferenceKitId: { type: String, default: "", index: true },
    speciesId: { type: String, enum: ["human", "monster"], default: undefined, index: true },
    primaryAttributeId: { type: String, default: "" },
    genesisStatus: { type: String, enum: USER_GAME_CHARACTER_GENESIS_STATUSES, default: undefined, index: true },
    genesisErrorCode: { type: String, default: "" },
    templateVersion: { type: Number, required: true, default: 2 },
    /** 기준 이미지로 파이프라인이 실패한 anchor assetId 목록 (선택기 배지용) */
    failedAnchorIds: { type: [String], default: [] },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    pipelineId: { type: String, default: "", index: true },
    spriteAssetId: { type: String, default: "", index: true },
    personaId: { type: String, default: "", index: true },
    moderationStatus: {
      type: String,
      enum: USER_GAME_CHARACTER_MODERATION_STATUSES,
      required: true,
      default: "pending",
      index: true,
    },
    disabledReason: { type: String, default: "" },
    reportedAt: { type: Date, default: null },
    reportedBy: { type: String, default: "", index: true },
    reportReason: { type: String, enum: USER_GAME_CHARACTER_REPORT_REASONS, default: undefined },
    reportNote: { type: String, default: "" },
  },
  { timestamps: true, collection: "user_game_characters" },
);

UserGameCharacterSchema.index({ uid: 1, status: 1, updatedAt: -1 });
UserGameCharacterSchema.index({ uid: 1, universeId: 1, updatedAt: -1 });
