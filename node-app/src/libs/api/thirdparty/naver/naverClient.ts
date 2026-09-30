import type {
  INaverCommerceApiConfig,
  INaverProduct,
  INaverQueryValue,
  INaverCategory,
  INaverCategoryAttributesResponse,
  INaverProductNoticeGroupsResponse,
  INaverProductNoticeDetailResponse,
  INaverOriginAreasResponse,
  INaverCreateProductPayload,
  INaverUpdateChannelProductPayload,
  INaverUpdateOriginProductPayload,
  INaverChangeSaleStatusPayload,
  INaverUpdateOptionStockPayload,
  INaverUploadProductImagesPayload,
  INaverProductSearchPayload,
  INaverProductSearchResponse,
} from "types/thirdparty";
import { logger } from "utils/log";
import type { NaverAppCredentials } from "libs/server-utils/commerce/naverTokenService";
import { getNaverAccessToken, invalidateNaverToken } from "libs/server-utils/commerce/naverTokenService";
import { NAVER_COMMERCE_BASE } from "consts/thirdparty/naver";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/products/search) 호출 구성  응답/에러 정리 반환
 * @domain thirdparty/naver
 * @scope server
 */

function buildQueryString(query?: Record<string, INaverQueryValue>) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query || {})) {
    if (raw == null) continue;
    const value = String(raw).trim();
    if (!value) continue;
    params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

/**
 * INaverCommerceApiConfig 에 아래 필드를 추가해서 전달하세요.
 * - applicationId: string
 * - applicationSecret: string
 * - cacheScope?: string (선택: universeId/adminUid 등)
 */
type NaverClientConfig = INaverCommerceApiConfig &
  Required<Pick<NaverAppCredentials, "applicationId" | "applicationSecret">> & {
    cacheScope?: string;
    tokenType?: NaverAppCredentials["tokenType"];
    accountId?: NaverAppCredentials["accountId"];
    tokenProvider?: {
      getAccessToken?: typeof getNaverAccessToken;
      invalidateToken?: typeof invalidateNaverToken;
    };
  };

function getNaverErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;

  const record = body as Record<string, unknown>;
  // Commerce API의 공식 code를 우선하고, 구형 errorCode는 하위 호환으로만 사용한다.
  if (typeof record.code === "string" && record.code) return record.code;
  return typeof record.errorCode === "string" && record.errorCode ? record.errorCode : undefined;
}

export class NaverCommerceApiClient {
  private baseUrl: string;
  private creds: NaverAppCredentials;
  private tokenProvider: {
    getAccessToken: typeof getNaverAccessToken;
    invalidateToken: typeof invalidateNaverToken;
  };
  private categoryCache = new Map<string, INaverCategory>();

  constructor(config: NaverClientConfig) {
    this.baseUrl = config.baseUrl || NAVER_COMMERCE_BASE;
    this.creds = {
      applicationId: config.applicationId,
      applicationSecret: config.applicationSecret,
      cacheScope: config.cacheScope,
      // SELF/SELLER 및 셀러 account_id를 토큰 계층으로 전달 (미지정 시 SELF 기본값)
      tokenType: config.tokenType,
      accountId: config.accountId,
    };
    this.tokenProvider = {
      getAccessToken: config.tokenProvider?.getAccessToken ?? getNaverAccessToken,
      invalidateToken: config.tokenProvider?.invalidateToken ?? invalidateNaverToken,
    };
  }

  /** 공통 요청 래퍼: 401(GW.AUTHN) → 1회 토큰 무효화 후 재발급 */
  private async request<T>(path: string, init: RequestInit & { version?: "v1" | "v2" } = {}): Promise<T> {
    const version = init.version ?? "v1";
    const url = `${this.baseUrl}/${version}${path}`;

    const headers = new Headers(init.headers || {});
    const attachToken = async () => {
      const token = await this.tokenProvider.getAccessToken(this.creds);
      headers.set("Authorization", `Bearer ${token}`);
    };
    await attachToken();

    if (!(init.method || "GET").toUpperCase().startsWith("GET") && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let authRetryUsed = false;
    const doFetch = async (attempt = 1): Promise<Response> => {
      const res = await fetch(url, { ...init, headers });
      const traceId = res.headers.get("GNCP-GW-Trace-ID") || "";

      if (res.status === 401 && !authRetryUsed) {
        // 본문이 JSON이면 코드 확인
        let body: unknown = null;
        try {
          body = await res.clone().json();
        } catch {}
        if (getNaverErrorCode(body) === "GW.AUTHN") {
          authRetryUsed = true;
          logger.warn("[Naver] 401(GW.AUTHN) → 토큰 무효화 후 재발급 재시도", { traceId });
          await this.tokenProvider.invalidateToken(this.creds);
          await attachToken();
          return fetch(url, { ...init, headers });
        }
      }

      // 간단 백오프 재시도
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        const retryAfter = Number(res.headers.get("Retry-After") || "0");
        const wait = retryAfter ? retryAfter * 1000 : 300 * attempt;
        await new Promise((r) => setTimeout(r, wait));
        return doFetch(attempt + 1);
      }
      return res;
    };

    const res = await doFetch(1);

    if (!res.ok) {
      await res.arrayBuffer().catch(() => undefined);
      const traceId = res.headers.get("GNCP-GW-Trace-ID") || "";
      const rate = {
        remain: res.headers.get("GNCP-GW-RateLimit-Remaining"),
        burst: res.headers.get("GNCP-GW-RateLimit-Burst-Capacity"),
        rps: res.headers.get("GNCP-GW-RateLimit-Replenish-Rate"),
      };
      logger.error("[Naver] API 오류", { status: res.status, traceId, rate, path });
      throw new Error(`네이버 API 오류: ${res.status}${traceId ? ` (traceId: ${traceId})` : ""}`);
    }

    return res.json() as Promise<T>;
  }

  /** v2: 상품 상세 */
  async getProductDetail(channelProductNo: number): Promise<INaverProduct> {
    return this.request<INaverProduct>(`/products/channel-products/${channelProductNo}`, {
      method: "GET",
      version: "v2",
    });
  }

  /** v1: 상품 목록 조회 */
  async searchProducts(payload: INaverProductSearchPayload = {}): Promise<INaverProductSearchResponse> {
    return this.request<INaverProductSearchResponse>("/products/search", {
      method: "POST",
      body: JSON.stringify(payload || {}),
      version: "v1",
    });
  }

  /** v2: 상품 등록 */
  async createProduct(payload: INaverCreateProductPayload) {
    return this.request<UnknownRecord>("/products", {
      method: "POST",
      body: JSON.stringify(payload || {}),
      version: "v2",
    });
  }

  /** v2: 채널 상품 수정 */
  async updateChannelProduct(channelProductNo: number, payload: INaverUpdateChannelProductPayload) {
    return this.request<UnknownRecord>(`/products/channel-products/${channelProductNo}`, {
      method: "PUT",
      body: JSON.stringify(payload || {}),
      version: "v2",
    });
  }

  /** v2: 원상품 수정 */
  async updateOriginProduct(originProductNo: number, payload: INaverUpdateOriginProductPayload) {
    return this.request<UnknownRecord>(`/products/origin-products/${originProductNo}`, {
      method: "PUT",
      body: JSON.stringify(payload || {}),
      version: "v2",
    });
  }

  /** v1: 판매 상태 변경 */
  async changeSaleStatus(originProductNo: number, payload: INaverChangeSaleStatusPayload) {
    return this.request<UnknownRecord>(`/products/origin-products/${originProductNo}/change-status`, {
      method: "PUT",
      body: JSON.stringify(payload || {}),
      version: "v1",
    });
  }

  /** v1: 상품 옵션 재고 변경 */
  async updateOptionStock(originProductNo: number, payload: INaverUpdateOptionStockPayload) {
    return this.request<UnknownRecord>(`/products/origin-products/${originProductNo}/option-stock`, {
      method: "PUT",
      body: JSON.stringify(payload || {}),
      version: "v1",
    });
  }

  /** v1: 상품 이미지 다건 등록 */
  async uploadProductImages(payload: INaverUploadProductImagesPayload) {
    return this.request<UnknownRecord>("/product-images/upload", {
      method: "POST",
      body: JSON.stringify(payload || {}),
      version: "v1",
    });
  }

  /** v1: 카테고리 단건 조회 */
  async getCategory(categoryId: string) {
    const normalizedCategoryId = String(categoryId || "").trim();
    const cached = this.categoryCache.get(normalizedCategoryId);
    if (cached) return cached;

    const category = await this.request<INaverCategory>(`/categories/${encodeURIComponent(normalizedCategoryId)}`, {
      method: "GET",
      version: "v1",
    });
    this.categoryCache.set(normalizedCategoryId, category);
    return category;
  }

  /** v1: 전체 카테고리 조회 — 카테고리 검색 캐시 원본 */
  async getAllCategories() {
    return this.request<INaverCategory[]>(`/categories`, {
      method: "GET",
      version: "v1",
    });
  }

  /** v1: 카테고리별 속성 조회 */
  async getCategoryAttributes(categoryId: string) {
    return this.request<INaverCategoryAttributesResponse>(
      `/product-attributes/attributes${buildQueryString({ categoryId })}`,
      {
        method: "GET",
        version: "v1",
      },
    );
  }

  /** v1: 상품정보제공고시 목록 조회 */
  async getProductNoticeGroups(categoryId?: string) {
    return this.request<INaverProductNoticeGroupsResponse>(
      `/products-for-provided-notice${buildQueryString({ categoryId })}`,
      {
        method: "GET",
        version: "v1",
      },
    );
  }

  /** v1: 상품정보제공고시 단건 조회 */
  async getProductNoticeGroup(productInfoProvidedNoticeType: string) {
    return this.request<INaverProductNoticeDetailResponse>(
      `/products-for-provided-notice/${encodeURIComponent(productInfoProvidedNoticeType)}`,
      {
        method: "GET",
        version: "v1",
      },
    );
  }

  /** v1: 원산지 코드 전체 조회 */
  async getAllOriginAreas() {
    return this.request<INaverOriginAreasResponse>("/product-origin-areas", {
      method: "GET",
      version: "v1",
    });
  }

  /** v1: 원산지 코드 다건 조회 */
  async queryOriginAreas(query?: Record<string, INaverQueryValue>) {
    return this.request<INaverOriginAreasResponse>(`/product-origin-areas/query${buildQueryString(query)}`, {
      method: "GET",
      version: "v1",
    });
  }

  /** v1: 하위 원산지 코드 조회 */
  async getSubOriginAreas(query?: Record<string, INaverQueryValue>) {
    return this.request<INaverOriginAreasResponse>(
      `/product-origin-areas/sub-origin-areas${buildQueryString(query)}`,
      {
        method: "GET",
        version: "v1",
      },
    );
  }
}
