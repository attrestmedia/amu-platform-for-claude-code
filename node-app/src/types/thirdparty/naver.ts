import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * 네이버 커머스 API 설정 인터페이스
 */
export interface INaverCommerceApiConfig {
  applicationId: string;
  applicationSecret: string;
  baseUrl?: string;
}

/**
 * 네이버 API 응답 상품 정보
 */
export interface INaverProduct {
  originProductNo: number;
  channelProductNo: number;
  channelProductName: string;
  salePrice: number;
  stockQuantity: number;
  statusType: string;
  saleStartDate?: string;
  saleEndDate?: string;
  images?: Array<{
    url: string;
    type: string;
  }>;
  categoryId?: string;
  categoryName?: string;
  detailAttribute?: {
    naverShoppingSearchInfo?: {
      manufacturerName?: string;
      brandName?: string;
    };
  };
}

export type INaverQueryValue = string | number | boolean | null | undefined;

export interface INaverApiSuccessResponse<T = UnknownRecord> {
  timestamp?: string | Date;
  traceId?: string;
  data?: T;
  content?: T;
  contents?: T[];
  [key: string]: unknown;
}

export interface INaverProductSearchPayload {
  page?: number;
  size?: number;
  [key: string]: unknown;
}

export interface INaverProductSearchResponse extends Omit<INaverApiSuccessResponse, "contents" | "content"> {
  products?: INaverProduct[];
  contents?: INaverProduct[];
  content?: INaverProduct[] | UnknownRecord;
  totalCount?: number;
  totalElements?: number;
  page?: number;
  size?: number;
}

export interface INaverCategoryAttribute {
  id?: number | string;
  name?: string;
  required?: boolean;
  inputType?: string;
  groupName?: string;
  values?: Array<{
    id?: number | string;
    text?: string;
    value?: string;
    name?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface INaverCategoryAttributesResponse extends INaverApiSuccessResponse {
  categoryId?: string;
  attributes?: INaverCategoryAttribute[];
}

export interface INaverCategory {
  id: string;
  name: string;
  wholeCategoryName: string;
  last: boolean;
  exceptionalCategories?: string[];
}

export interface INaverProductNoticeGroup {
  productInfoProvidedNoticeType?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface INaverProductNoticeGroupsResponse extends INaverApiSuccessResponse {
  notices?: INaverProductNoticeGroup[];
}

export interface INaverProductNoticeDetailResponse extends INaverApiSuccessResponse {
  notice?: UnknownRecord;
}

export interface INaverOriginArea {
  originAreaCode?: string;
  originAreaName?: string;
  parentOriginAreaCode?: string;
  [key: string]: unknown;
}

export interface INaverOriginAreasResponse extends INaverApiSuccessResponse {
  items?: INaverOriginArea[];
}

export type INaverCreateProductPayload = UnknownRecord;
export type INaverUpdateChannelProductPayload = UnknownRecord;
export type INaverUpdateOriginProductPayload = UnknownRecord;
export type INaverChangeSaleStatusPayload = UnknownRecord;
export type INaverUpdateOptionStockPayload = UnknownRecord;
export type INaverUploadProductImagesPayload = UnknownRecord;
