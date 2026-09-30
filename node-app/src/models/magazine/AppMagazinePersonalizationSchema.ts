import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose App Magazine의 로그인 사용자 저장·주제 팔로우·이어읽기 관계를 App Mongo에만 보관
 * @process canonical ownerUid로 관계를 고유화하고 콘텐츠/주제 식별자와 최소 상태만 저장
 * @domain magazine-content-experience
 * @scope db-schema
 */

export interface IAppMagazineContentSaveDocument extends Document {
  sourceSystem: "node_app_magazine";
  schemaVersion: "app-personalization.v1";
  purposeVersion: "relationship-mvp.v1";
  ownerUid: string;
  contentRef: { kind: "app_content"; contentId: string; slug: string };
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAppMagazineTopicFollowDocument extends Document {
  sourceSystem: "node_app_magazine";
  schemaVersion: "app-personalization.v1";
  purposeVersion: "relationship-mvp.v1";
  ownerUid: string;
  topicRef: { kind: "app_topic"; topicId: string; topicKey: string };
  followedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAppMagazineReadingProgressDocument extends Document {
  sourceSystem: "node_app_magazine";
  schemaVersion: "app-personalization.v1";
  purposeVersion: "relationship-mvp.v1";
  ownerUid: string;
  contentRef: { kind: "app_content"; contentId: string; slug: string };
  contentRevision: string;
  position: { blockId: string; progressBps: number };
  lastReadAt: Date;
  completedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAppMagazineTopicDocument extends Document {
  topicId: string;
  topicKey: string;
  label: string;
  status: "active" | "retired";
  createdAt: Date;
  updatedAt: Date;
}

export type AppMagazineCounterKind = "content_save" | "topic_follow" | "reading_progress";

export interface IAppMagazinePersonalizationCounterDocument extends Document {
  ownerUid: string;
  kind: AppMagazineCounterKind;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const contentRefSchema = new Schema(
  {
    kind: { type: String, enum: ["app_content"], required: true },
    contentId: { type: String, required: true, maxlength: 128 },
    slug: { type: String, required: true, maxlength: 115 },
  },
  { _id: false, strict: "throw" },
);

const topicRefSchema = new Schema(
  {
    kind: { type: String, enum: ["app_topic"], required: true },
    topicId: { type: String, required: true, maxlength: 128 },
    topicKey: { type: String, required: true, maxlength: 109 },
  },
  { _id: false, strict: "throw" },
);

export const AppMagazineContentSaveSchema = new Schema<IAppMagazineContentSaveDocument>(
  {
    sourceSystem: { type: String, enum: ["node_app_magazine"], required: true, default: "node_app_magazine" },
    schemaVersion: { type: String, enum: ["app-personalization.v1"], required: true, default: "app-personalization.v1" },
    purposeVersion: { type: String, enum: ["relationship-mvp.v1"], required: true, default: "relationship-mvp.v1" },
    ownerUid: { type: String, required: true, index: true, maxlength: 256 },
    contentRef: { type: contentRefSchema, required: true },
    savedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, strict: "throw" },
);
AppMagazineContentSaveSchema.index({ ownerUid: 1, "contentRef.contentId": 1 }, { unique: true });
AppMagazineContentSaveSchema.index({ ownerUid: 1, savedAt: -1, "contentRef.contentId": -1 });

export const AppMagazineTopicFollowSchema = new Schema<IAppMagazineTopicFollowDocument>(
  {
    sourceSystem: { type: String, enum: ["node_app_magazine"], required: true, default: "node_app_magazine" },
    schemaVersion: { type: String, enum: ["app-personalization.v1"], required: true, default: "app-personalization.v1" },
    purposeVersion: { type: String, enum: ["relationship-mvp.v1"], required: true, default: "relationship-mvp.v1" },
    ownerUid: { type: String, required: true, index: true, maxlength: 256 },
    topicRef: { type: topicRefSchema, required: true },
    followedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, strict: "throw" },
);
AppMagazineTopicFollowSchema.index({ ownerUid: 1, "topicRef.topicId": 1 }, { unique: true });
AppMagazineTopicFollowSchema.index({ ownerUid: 1, followedAt: -1, "topicRef.topicId": -1 });

export const AppMagazineReadingProgressSchema = new Schema<IAppMagazineReadingProgressDocument>(
  {
    sourceSystem: { type: String, enum: ["node_app_magazine"], required: true, default: "node_app_magazine" },
    schemaVersion: { type: String, enum: ["app-personalization.v1"], required: true, default: "app-personalization.v1" },
    purposeVersion: { type: String, enum: ["relationship-mvp.v1"], required: true, default: "relationship-mvp.v1" },
    ownerUid: { type: String, required: true, index: true, maxlength: 256 },
    contentRef: { type: contentRefSchema, required: true },
    contentRevision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    position: {
      type: new Schema(
        {
          blockId: { type: String, required: true, maxlength: 128 },
          progressBps: { type: Number, required: true, min: 0, max: 10000 },
        },
        { _id: false, strict: "throw" },
      ),
      required: true,
    },
    lastReadAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, required: false },
    version: { type: Number, required: true, min: 1, default: 1 },
  },
  { timestamps: true, strict: "throw" },
);
AppMagazineReadingProgressSchema.index({ ownerUid: 1, "contentRef.contentId": 1 }, { unique: true });
AppMagazineReadingProgressSchema.index({ ownerUid: 1, lastReadAt: -1, "contentRef.contentId": -1 });

export const AppMagazineTopicSchema = new Schema<IAppMagazineTopicDocument>(
  {
    topicId: { type: String, required: true, unique: true, index: true, maxlength: 128 },
    topicKey: { type: String, required: true, unique: true, index: true, maxlength: 109 },
    label: { type: String, required: true, maxlength: 80 },
    status: { type: String, enum: ["active", "retired"], required: true, default: "active" },
  },
  { timestamps: true, strict: "throw" },
);

export const AppMagazinePersonalizationCounterSchema = new Schema<IAppMagazinePersonalizationCounterDocument>(
  {
    ownerUid: { type: String, required: true, maxlength: 256 },
    kind: { type: String, enum: ["content_save", "topic_follow", "reading_progress"], required: true },
    count: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true, strict: "throw" },
);
AppMagazinePersonalizationCounterSchema.index({ ownerUid: 1, kind: 1 }, { unique: true });
