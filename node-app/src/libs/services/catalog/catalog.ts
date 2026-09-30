import type { ICategoryList } from "types/catalog";
import fetchClient from "libs/api/fetchClient";
import { handleError } from "../../api/common";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain commerce_catalog
 * @scope client_module
 */

// 카테고리 목록 가져오기
export async function getCategoryList(userId: string): Promise<string[] | null> {
  try {
    const response = await fetchClient.get(`/app/catalog/${userId}/categories`);
    const data: string[] = response.data;
    return data;
  } catch (error: unknown) {
    return handleError(error, "카테고리 데이터를 가져오는 데 실패했습니다.");
  }
}

// 상품 데이터 가져오기
export async function getProductData(userId: string, categoryName?: string): Promise<ICategoryList[] | null> {
  try {
    const response = await fetchClient.get(`/app/catalog/${userId}/products`, {
      params: { categoryName },
    });
    const data: ICategoryList[] = response.data;
    return data;
  } catch (error: unknown) {
    return handleError(error, "상품 데이터를 가져오는 데 실패했습니다.");
  }
}

// 상품 데이터 저장하기
export async function saveProductData(
  userId: string,
  data: unknown,
  categoryName: string,
  subCategoryId: string
): Promise<void> {
  try {
    await fetchClient.post(
      `/app/catalog/${userId}/products`,
      { data },
      {
        params: { categoryName, subCategoryId }, // subCategoryId를 쿼리 파라미터로 추가
      }
    );
  } catch {
    throw new Error("상품 데이터를 저장하는 데 실패했습니다.");
  }
}
