import { Schema, type Document } from "mongoose";
import type { MagazineEmbedding, MagazineEmbeddingDocumentKind } from "libs/server-utils/magazine/magazineEmbeddingContract";

/**
 * @docHint
 * @purpose Semantic Index embedding 모델 — provider 중립 저장 (MIR-202)
 * @process 검증된 embedding 계약과 벡터를 (documentRef,textDigest,modelVersion,namespace) dedup 키로 저장
 * @domain magazine-semantic-index
 * @scope db-schema
 */

export interface IMagazineEmbeddingDocument extends Document {
  contractType: "magazine-embedding";
  schemaVersion: "magazine-embedding.v1";
  documentKind: MagazineEmbeddingDocumentKind;
  documentRef: string;
  namespace: string;
  textDigest: string;
  provider: string;
  modelVersion: string;
  dimension: number;
  embedding: MagazineEmbedding;
  source: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MagazineEmbeddingSchema = new Schema<IMagazineEmbeddingDocument>(
  {
    contractType: { type: String, enum: ["magazine-embedding"], required: true, default: "magazine-embedding" },
    schemaVersion: { type: String, enum: ["magazine-embedding.v1"], required: true, default: "magazine-embedding.v1" },
    documentKind: { type: String, enum: ["article", "unit", "template"], required: true, index: true },
    documentRef: { type: String, required: true, index: true },
    namespace: { type: String, required: true },
    textDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    provider: { type: String, required: true },
    modelVersion: { type: String, required: true },
    dimension: { type: Number, required: true },
    embedding: { type: Schema.Types.Mixed, required: true },
    source: { type: String, enum: ["admin", "agent"], required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, strict: "throw" },
);

// 같은 원문(digest)·같은 모델(version)·같은 namespace에 중복 임베딩을 만들지 않는다 (embeddingStorageContract).
MagazineEmbeddingSchema.index(
  { documentRef: 1, textDigest: 1, modelVersion: 1, namespace: 1 },
  { unique: true, name: "magazine_embedding_dedup_unique" },
);
// 검색의 후보 축소·서비스별 조회 진입점.
MagazineEmbeddingSchema.index({ namespace: 1, documentKind: 1, documentRef: 1 }, { name: "magazine_embedding_search_ref" });
