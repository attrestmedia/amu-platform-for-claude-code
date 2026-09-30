import { Schema, type Document } from "mongoose";
import type { MagazineArticleDeclaration, MagazineContentRef } from "libs/server-utils/magazine/magazineEmbedContract";

/**
 * @docHint
 * @purpose node-app이 소유하는 Article Experience declaration 저장 모델
 * @process 검증된 declaration과 내용 revision을 contentRef 단위로 고유 저장 (article-experience.v2)
 * @domain magazine-content-experience
 * @scope db-schema
 */

export type MagazineArticleDeclarationSource = "admin" | "agent";

export interface IMagazineArticleDeclarationDocument extends Document {
  contractType: "article-experience-declaration";
  schemaVersion: "article-experience.v2";
  contentRefKey: string;
  contentRef: MagazineContentRef;
  declaration: MagazineArticleDeclaration;
  revision: string;
  source: MagazineArticleDeclarationSource;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MagazineArticleDeclarationSchema = new Schema<IMagazineArticleDeclarationDocument>(
  {
    contractType: { type: String, enum: ["article-experience-declaration"], required: true, default: "article-experience-declaration" },
    schemaVersion: { type: String, enum: ["article-experience.v2"], required: true, default: "article-experience.v2" },
    contentRefKey: { type: String, required: true, unique: true, index: true, maxlength: 128 },
    contentRef: { type: Schema.Types.Mixed, required: true },
    declaration: { type: Schema.Types.Mixed, required: true },
    revision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    source: { type: String, enum: ["admin", "agent"], required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, strict: "throw" },
);
