import { Schema, type Document } from "mongoose";
import { getModel } from "libs/database/modelCache";
import type { ISearchQuery } from "./SearchQuerySchema";
import { SearchQuerySchema } from "./SearchQuerySchema";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(id, date, modified, slug, title, content) 및 인덱스/기본값 선언
 * @domain wp_cache
 * @scope db_schema
 */

// 포스트 캐시 스키마
export interface IPostCache extends Document {
  id: number; // WordPress ID
  date: string;
  modified: string;
  slug: string;
  link: string;
  title: UnknownRecord; // { rendered: string }
  content: UnknownRecord; // { rendered: string, protected: boolean }
  excerpt: UnknownRecord; // { rendered: string, protected: boolean }
  author: number;
  categories: number[];
  tags: number[];
  acf: UnknownRecord; // Advanced Custom Fields
  guid: UnknownRecord; // { rendered: string }
  featured_media_url?: string;
  featured_media_alt?: string;
  featured_media_source?: string;
  genstudio_thumbnail_asset_id?: string;
  yoast_head_json?: UnknownRecord;
  cachedAt: Date; // 캐싱 시간
  toObject: () => UnknownRecord; // Mongoose document 변환 메서드
}

// 카테고리 캐시 스키마
export interface ICategoryCache extends Document {
  id: number; // WordPress ID
  name: string;
  slug: string;
  description: string;
  parent: number;
  count: number;
  cachedAt: Date;
  toObject: () => UnknownRecord; // Mongoose document 변환 메서드
}

// 태그 캐시 스키마
export interface ITagCache extends Document {
  id: number; // WordPress ID
  name: string;
  slug: string;
  description: string;
  count: number;
  cachedAt: Date;
  toObject: () => UnknownRecord; // Mongoose document 변환 메서드
}

// 캐시 설정 스키마 (캐싱 주기, 만료 시간 등 설정 저장)
export interface ICacheConfig extends Document {
  type: string; // 'posts', 'categories', 'tags'
  lastUpdated: Date; // 마지막 업데이트 시간
  updateInterval: number; // 업데이트 주기 (분)
  isUpdating: boolean; // 업데이트 중 여부 (동시 업데이트 방지)
}

// 포스트 캐시 스키마 정의
const PostCacheSchema = new Schema<IPostCache>(
  {
    id: { type: Number, required: true, unique: true }, // unique: true는 자동으로 인덱스 생성
    date: { type: String, required: true },
    modified: { type: String, required: true },
    slug: { type: String, required: true },
    link: { type: String, default: "" },
    title: { type: Object, required: true },
    content: { type: Object, required: true },
    excerpt: { type: Object, required: true },
    author: { type: Number, required: true },
    categories: { type: [Number], default: [] },
    tags: { type: [Number], default: [] },
    acf: { type: Object, default: {} },
    guid: { type: Object, required: true },
    featured_media_url: { type: String, default: "" },
    featured_media_alt: { type: String, default: "" },
    featured_media_source: { type: String, default: "" },
    genstudio_thumbnail_asset_id: { type: String, default: "" },
    yoast_head_json: { type: Object, default: {} },
    cachedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// 카테고리 캐시 스키마 정의
const CategoryCacheSchema = new Schema<ICategoryCache>(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: "" },
    parent: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    cachedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// 태그 캐시 스키마 정의
const TagCacheSchema = new Schema<ITagCache>(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: "" },
    count: { type: Number, default: 0 },
    cachedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// 캐시 설정 스키마 정의
const CacheConfigSchema = new Schema<ICacheConfig>(
  {
    type: { type: String, required: true, unique: true },
    lastUpdated: { type: Date, default: Date.now },
    updateInterval: { type: Number, default: 60 }, // 기본 1시간 (60분)
    isUpdating: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 인덱스 설정
PostCacheSchema.index({ categories: 1 });
PostCacheSchema.index({ tags: 1 });
PostCacheSchema.index({ date: -1 }); // 최신순 정렬용
PostCacheSchema.index({ modified: -1 }); // 수정일순 정렬용
PostCacheSchema.index({ id: 1, date: -1 }); // 복합 인덱스

// 개별 필드 인덱스 (fallback 검색용)
PostCacheSchema.index({ "title.rendered": 1 });
PostCacheSchema.index({ slug: 1 });

// 텍스트 인덱스 설정 (언어 설정 수정)
PostCacheSchema.index(
  {
    "title.rendered": "text",
    "content.rendered": "text",
    "excerpt.rendered": "text",
    slug: "text",
  },
  {
    name: "comprehensive_text_search_index",
    background: true, // 백그라운드에서 생성
    weights: {
      "title.rendered": 10,
      "excerpt.rendered": 5,
      "content.rendered": 1,
      slug: 2,
    },
  }
);

CategoryCacheSchema.index({ parent: 1 });

// 모델 생성 및 내보내기
export async function createWpCacheModels(uri: string) {
  // 객체 반환 전에 비동기로 모델들을 가져오기
  const [PostCache, CategoryCache, TagCache, CacheConfig, SearchQuery] = await Promise.all([
    getModel<IPostCache>(uri, "WpPostCache", PostCacheSchema, "wp_post_cache"),
    getModel<ICategoryCache>(uri, "WpCategoryCache", CategoryCacheSchema, "wp_category_cache"),
    getModel<ITagCache>(uri, "WpTagCache", TagCacheSchema, "wp_tag_cache"),
    getModel<ICacheConfig>(uri, "WpCacheConfig", CacheConfigSchema, "wp_cache_config"),
    getModel<ISearchQuery>(uri, "WpSearchQuery", SearchQuerySchema, "wp_search_queries"),
  ]);

  return {
    PostCache,
    CategoryCache,
    TagCache,
    CacheConfig,
    SearchQuery,
  };
}
