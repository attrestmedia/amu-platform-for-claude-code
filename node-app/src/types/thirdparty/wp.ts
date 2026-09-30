import type { UnknownRecord } from "utils/common/typeUtils";

/** 포스트 관련 인터페이스 */
interface IWpGuid {
  rendered: string;
}

interface IWpTitle {
  rendered: string;
}

interface IWpContent {
  rendered: string;
  protected: boolean;
}

interface IWpExcerpt {
  rendered: string;
  protected: boolean;
}

interface IWpMeta {
  [key: string]: unknown;
}

interface IWpFeaturedMediaSize {
  source_url?: string;
  width?: number;
  height?: number;
}

interface IWpFeaturedMedia {
  id?: number;
  source_url?: string;
  alt_text?: string;
  media_details?: {
    sizes?: Record<string, IWpFeaturedMediaSize>;
  };
}

export interface IWpPost {
  id: number;
  date: string;
  date_gmt: string;
  guid: IWpGuid;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: IWpTitle;
  content: IWpContent;
  excerpt: IWpExcerpt;
  author: number;
  featured_media: number;
  comment_status: string;
  ping_status: string;
  sticky: boolean;
  template: string;
  format: string;
  meta: IWpMeta;
  categories: number[];
  tags: number[];
  class_list: string[];
  acf: UnknownRecord;
  featured_media_url?: string;
  featured_media_alt?: string;
  featured_media_source?: "custom_meta" | "genstudio_asset" | "yoast" | "featured_media" | "content_image" | "";
  genstudio_thumbnail_asset_id?: string;
  yoast_head_json?: UnknownRecord;
  _embedded?: {
    "wp:featuredmedia"?: IWpFeaturedMedia[];
  };
}

export interface IWpPostsResponse {
  totalPosts: number;
  totalPages: number;
  data: IWpPost[];
}

// "relevance"는 search 파라미터와 함께 사용
export type WpPostOrderbyType = "date" | "title" | "modified" | "rand" | "relevance";
export interface IWpGetPostsOptions {
  page?: number;
  perPage?: number;
  orderby?: WpPostOrderbyType;
  order?: "asc" | "desc";
  categories?: number | number[];
  search?: string;
  forceRefresh?: boolean;
  includeMedia?: boolean;
}

/** 카테고리 관련 인터페이스 */
export interface IWpCategory {
  id: number;
  count: number;
  description: string;
  name: string;
  slug: string;
  taxonomy: string;
  parent: number;
  meta: UnknownRecord;
  link: string;
}

export interface IWpCategoriesResponse {
  totalItems: number;
  totalPages: number;
  data: IWpCategory[];
}
