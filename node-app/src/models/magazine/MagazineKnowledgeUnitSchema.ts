import { Schema, type Document } from "mongoose";
import type { MagazineKnowledgeUnit } from "libs/server-utils/magazine/magazineKnowledgeContract";
import type { MagazineKnowledgeSource } from "./MagazineKnowledgeArticleSchema";

/**
 * @docHint
 * @purpose node-app이 소유하는 Knowledge Unit 모델 — 기사보다 작은 검색·재사용 단위 (MIR-200)
 * @process 검증된 unit 계약과 revision을 unitId 단위로 고유 저장, 소속 기사는 참조만 한다
 * @domain magazine-knowledge-corpus
 * @scope db-schema
 */

export interface IMagazineKnowledgeUnitDocument extends Document {
  contractType: "magazine-knowledge-unit";
  schemaVersion: "magazine-knowledge-unit.v1";
  unitId: string;
  contentId: string;
  postId: number;
  unitType: MagazineKnowledgeUnit["unitType"];
  unit: MagazineKnowledgeUnit;
  revision: string;
  /** 추출 근거가 된 기사 revision — 기사의 현재값과 다르면 stale */
  sourceRevision: string;
  source: MagazineKnowledgeSource;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MagazineKnowledgeUnitSchema = new Schema<IMagazineKnowledgeUnitDocument>(
  {
    contractType: { type: String, enum: ["magazine-knowledge-unit"], required: true, default: "magazine-knowledge-unit" },
    schemaVersion: { type: String, enum: ["magazine-knowledge-unit.v1"], required: true, default: "magazine-knowledge-unit.v1" },
    unitId: { type: String, required: true, unique: true },
    contentId: { type: String, required: true, index: true },
    postId: { type: Number, required: true, index: true },
    unitType: { type: String, required: true, index: true },
    unit: { type: Schema.Types.Mixed, required: true },
    revision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    sourceRevision: { type: String, required: true },
    source: { type: String, enum: ["admin", "agent"], required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, strict: "throw" },
);

// 기사 단위 조회가 기본 접근 경로다. unitType은 검색 필터로 함께 쓰인다.
MagazineKnowledgeUnitSchema.index({ contentId: 1, unitType: 1 }, { name: "magazine_knowledge_unit_article_type" });
