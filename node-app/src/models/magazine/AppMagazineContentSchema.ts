import { Schema, type Document } from "mongoose";
import type { AppMagazineContent } from "libs/server-utils/magazine/appContentContract";

/**
 * @docHint
 * @purpose node-app이 소유하는 App 고도화 콘텐츠(/magazine/{slug}) 저장 모델
 * @process 검증된 콘텐츠와 revision을 slug 단위로 고유 저장 — WP post_id와 별개 namespace
 * @domain magazine-content-experience
 * @scope db-schema
 */

export type AppMagazineContentSource = "admin" | "agent";

export interface IAppMagazineContentDocument extends Document {
  contractType: "app-magazine-content";
  schemaVersion: "app-content.v1";
  contentId: string;
  namespace: "magazine";
  slug: string;
  content: AppMagazineContent;
  revision: string;
  source: AppMagazineContentSource;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const AppMagazineContentSchema = new Schema<IAppMagazineContentDocument>(
  {
    contractType: { type: String, enum: ["app-magazine-content"], required: true, default: "app-magazine-content" },
    schemaVersion: { type: String, enum: ["app-content.v1"], required: true, default: "app-content.v1" },
    contentId: { type: String, required: true, unique: true, index: true },
    namespace: { type: String, enum: ["magazine"], required: true, default: "magazine" },
    slug: { type: String, required: true, unique: true, index: true },
    content: { type: Schema.Types.Mixed, required: true },
    revision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    source: { type: String, enum: ["admin", "agent"], required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, strict: "throw" },
);
