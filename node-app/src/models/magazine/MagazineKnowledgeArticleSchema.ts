import { Schema, type Document } from "mongoose";
import type { MagazineKnowledgeArticle } from "libs/server-utils/magazine/magazineKnowledgeContract";

/**
 * @docHint
 * @purpose node-app이 소유하는 매거진 정본 기사 모델 — 기사 1건 = document 1개 (MIR-200)
 * @process 검증된 기사 계약과 revision을 postId 단위로 고유 저장, 본문 정본은 WordPress에 둔다
 * @domain magazine-knowledge-corpus
 * @scope db-schema
 */

/** 기록 주체. 기사 계약 안의 `article.source`(WordPress 원본 참조)와는 다른 축이다. */
export type MagazineKnowledgeSource = "admin" | "agent";

export interface IMagazineKnowledgeArticleDocument extends Document {
  contractType: "magazine-knowledge-article";
  schemaVersion: "magazine-knowledge-article.v1";
  contentId: string;
  postId: number;
  slug: string;
  article: MagazineKnowledgeArticle;
  revision: string;
  /** 판정 근거가 된 WordPress 원문 revision — stale 판정 기준 */
  sourceRevision: string;
  source: MagazineKnowledgeSource;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MagazineKnowledgeArticleSchema = new Schema<IMagazineKnowledgeArticleDocument>(
  {
    contractType: { type: String, enum: ["magazine-knowledge-article"], required: true, default: "magazine-knowledge-article" },
    schemaVersion: { type: String, enum: ["magazine-knowledge-article.v1"], required: true, default: "magazine-knowledge-article.v1" },
    contentId: { type: String, required: true, unique: true },
    postId: { type: Number, required: true, unique: true },
    slug: { type: String, required: true, index: true },
    article: { type: Schema.Types.Mixed, required: true },
    revision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    sourceRevision: { type: String, required: true },
    source: { type: String, enum: ["admin", "agent"], required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, strict: "throw" },
);

// 검색·필터 진입점(MIR-202 hybrid retrieval의 메타데이터 필터)은 계약 안의 값을 직접 인덱싱한다.
MagazineKnowledgeArticleSchema.index({ "article.topics": 1 }, { name: "magazine_knowledge_article_topics" });
MagazineKnowledgeArticleSchema.index({ "article.entities": 1 }, { name: "magazine_knowledge_article_entities" });
