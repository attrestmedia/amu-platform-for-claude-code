import { Schema, Document } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(query, searchCount, lastSearched, resultCount, categoryId) 및 인덱스/기본값 선언
 * @domain wp_cache
 * @scope db_schema
 */

export interface ISearchQuery extends Document {
  query: string; // 검색어
  searchCount: number; // 검색 횟수
  lastSearched: Date; // 마지막 검색 시간
  resultCount: number; // 검색 결과 수
  categoryId?: number; // 카테고리 ID (옵션)
  createdAt: Date;
  updatedAt: Date;
}

const SearchQuerySchema = new Schema<ISearchQuery>(
  {
    query: {
      type: String,
      required: true,
      lowercase: true, // 대소문자 구분 없이 저장
      trim: true,
    },
    searchCount: { type: Number, default: 1 },
    lastSearched: { type: Date, default: Date.now },
    resultCount: { type: Number, default: 0 },
    categoryId: { type: Number, required: false },
  },
  {
    timestamps: true,
  }
);

// 텍스트 검색을 위한 인덱스
SearchQuerySchema.index({ query: "text" });

// 자동완성을 위한 prefix 검색 인덱스
SearchQuerySchema.index({ query: 1 });

// 복합 유니크 인덱스
SearchQuerySchema.index({ query: 1, categoryId: 1 }, { unique: true });

export { SearchQuerySchema };
