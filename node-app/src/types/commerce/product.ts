import type { IProduct } from "../game/universe";
import type { UnknownRecord } from "utils/common/typeUtils";

// 공통 상품 + UI/운영용 전시 속성
export interface ICommerceProduct extends IProduct {
  displayOrder?: number; // 화면 정렬 순서
  featured?: boolean; // 대표/추천(전시) 여부
}

export interface ICommerceStorefrontProduct extends ICommerceProduct {
  productId: string;
  universeId: string;
  provider: "naver";
  draftId: string;
  images?: Array<UnknownRecord>;
  smartstore?: {
    channelProductNo?: number;
    originProductNo?: number;
    sellerManagementCode?: string;
    statusType?: string;
    [key: string]: unknown;
  };
  source?: UnknownRecord;
  publishedAt?: string;
  syncedAt?: string;
  updatedAt?: string;
  createdAt?: string;
}
