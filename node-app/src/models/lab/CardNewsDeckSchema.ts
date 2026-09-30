import { Schema, type Document } from "mongoose";
import {
  CARD_NEWS_DOCUMENT_VERSION,
  CARD_NEWS_LEGACY_DOCUMENT_VERSION,
  CARD_NEWS_MAX_ALT_TEXT_LENGTH,
  type CardNewsDeckPayload,
  type CardNewsAgentDeckMetadata,
} from "types/card-news";

/**
 * @docHint
 * @purpose CardNews 사용자 덱 MongoDB 스키마
 * @process ownerUid 범위·revision 낙관적 잠금·삭제 TTL·목록 인덱스 선언
 * @domain card-news
 * @scope db_schema
 */

export interface ICardNewsDeckDocument extends CardNewsDeckPayload, Document {
  documentVersion: 1 | typeof CARD_NEWS_DOCUMENT_VERSION;
  deckId: string;
  ownerUid: string;
  revision: number;
  state: "active" | "deleted";
  updatedBy: string;
  deletedAt?: Date | null;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  agentMetadata?: CardNewsAgentDeckMetadata;
}

const CardNewsDeckCardSchema = new Schema(
  {
    cardId: { type: String, required: true },
    order: { type: Number, required: true },
    background: { type: Schema.Types.Mixed, required: true },
    layers: { type: [Schema.Types.Mixed], required: true, default: [] },
    altText: { type: String, default: "", maxlength: CARD_NEWS_MAX_ALT_TEXT_LENGTH },
    exportedAssetId: { type: String, default: "" },
    watermarkEnabled: { type: Boolean, default: undefined },
  },
  { _id: false },
);

export const CardNewsDeckSchema = new Schema<ICardNewsDeckDocument>(
  {
    documentVersion: {
      type: Number,
      enum: [CARD_NEWS_LEGACY_DOCUMENT_VERSION, CARD_NEWS_DOCUMENT_VERSION],
      required: true,
      default: CARD_NEWS_DOCUMENT_VERSION,
    },
    deckId: { type: String, required: true, unique: true, index: true },
    ownerUid: { type: String, required: true, index: true },
    title: { type: String, required: true },
    aspectRatio: { type: String, enum: ["1:1", "4:5"], required: true, default: "4:5" },
    frameSize: { type: Schema.Types.Mixed, required: true },
    theme: { type: Schema.Types.Mixed, required: true },
    cards: { type: [CardNewsDeckCardSchema], required: true, default: [] },
    watermark: { type: Schema.Types.Mixed, default: undefined },
    template: { type: Schema.Types.Mixed, default: undefined },
    agentMetadata: { type: Schema.Types.Mixed, default: undefined },
    revision: { type: Number, required: true, default: 1, index: true },
    state: { type: String, enum: ["active", "deleted"], required: true, default: "active", index: true },
    updatedBy: { type: String, required: true, default: "" },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "card_news_decks" },
);

CardNewsDeckSchema.index({ ownerUid: 1, state: 1, updatedAt: -1 });
CardNewsDeckSchema.index({ ownerUid: 1, state: 1, createdAt: -1 });
CardNewsDeckSchema.index({ ownerUid: 1, state: 1, title: 1 });
// DELETE는 soft-delete로 처리하고 30일 후 TTL이 본문·레이어를 자동 파기한다.
CardNewsDeckSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
