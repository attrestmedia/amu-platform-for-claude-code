import { useState, useEffect, useCallback } from "react";
import type { ICommerceProduct } from "types/commerce";
import { preprocessCommerceProducts, commerceImageManager } from "utils/commerce";
import { textureManager } from "utils/game";
import { logger } from "utils/log";
import fetchClient from "libs/api/fetchClient";
import { getResponseStatus, toErrorLike, type ErrorLikeType } from "utils/common/typeUtils";

// 커머스 상세 응답 shape — 실제 사용 필드만 명시
type CommerceUniverseDetailsResponseType = {
  success?: boolean;
  data?: {
    products?: ICommerceProduct[];
  };
};

/**
 * @docHint
 * @purpose useCommerceData 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain commerce-data
 * @scope client
 */

interface UseCommerceDataParams {
  universeId: string;
  enabled: boolean;
}

// 커머스 데이터 관리 훅 - CORS 대응 개선
export const useCommerceData = ({ universeId, enabled }: UseCommerceDataParams) => {
  const [commerceProducts, setCommerceProducts] = useState<ICommerceProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preloadProgress, setPreloadProgress] = useState<{
    total: number;
    loaded: number;
    failed: number;
  }>({ total: 0, loaded: 0, failed: 0 });

  // 상품 이미지 텍스처 미리 로딩
  const preloadProductTextures = useCallback(async (products: ICommerceProduct[]) => {
    const concurrency = 2; // 동시 요청 제한
    const maxRetries = 2; // 재시도 횟수
    const retryDelay = 1000; // 재시도 간격 (ms)

    logger.log(`🖼️ 상품 이미지 프리로드 시작: ${products.length}개`);

    // 성공/실패 카운터
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < products.length; i += concurrency) {
      const batch = products.slice(i, i + concurrency);

      // 배치별 병렬 처리 with 재시도 로직
      await Promise.allSettled(
        batch.map(async (product) => {
          let retryCount = 0;

          while (retryCount <= maxRetries) {
            try {
              // 1. 먼저 CommerceImageManager로 기본 프리로드
              const basicPreloadSuccess = await commerceImageManager.preloadImage(product.image);

              if (basicPreloadSuccess) {
                // 2. TextureManager를 통한 Pixi.js 텍스처 생성
                await textureManager.getTexture(product.image, true);

                successCount++;
                logger.log(`✅ 상품 텍스처 완전 로드 완료: ${product.title} (시도: ${retryCount + 1})`);
                return; // 성공 시 재시도 루프 탈출
              } else {
                throw new Error("기본 프리로드 실패");
              }
            } catch (error) {
              retryCount++;

              if (retryCount > maxRetries) {
                failureCount++;
                logger.warn(`❌ 상품 텍스처 로드 최종 실패 (${maxRetries + 1}회 시도): ${product.title}`, error);
              } else {
                logger.warn(`⚠️ 상품 텍스처 로드 실패, 재시도 ${retryCount}/${maxRetries}: ${product.title}`, error);

                // 재시도 전 지연
                await new Promise((resolve) => setTimeout(resolve, retryDelay * retryCount));
              }
            }
          }
        }),
      );

      // 배치 간 지연 (서버 부하 방지)
      if (i + concurrency < products.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // 프리로드 결과 로깅
    const totalProducts = products.length;
    const successRate = ((successCount / totalProducts) * 100).toFixed(1);

    logger.log(
      `🎯 상품 이미지 프리로드 완료: ${successCount}/${totalProducts} 성공 (${successRate}%), ${failureCount} 실패`,
    );

    // 성공률이 너무 낮으면 경고
    if (successCount / totalProducts < 0.7) {
      logger.warn(`⚠️ 상품 이미지 프리로드 성공률이 낮습니다 (${successRate}%). 네트워크 상태를 확인해 주세요.`);
    }
  }, []);

  // 유니버스별 상품 데이터 가져오기
  const fetchCommerceProducts = useCallback(async () => {
    if (!enabled || !universeId) return;

    try {
      setIsLoading(true);
      setError(null);
      setPreloadProgress({ total: 0, loaded: 0, failed: 0 });

      logger.log(`🛒 커머스 상품 데이터 가져오기 시작: ${universeId}`);

      // 재시도 로직
      const maxAttempts = 3;
      let lastError: unknown = null;
      let response: { data: CommerceUniverseDetailsResponseType } | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          response = await fetchClient.get<CommerceUniverseDetailsResponseType>(`/universe/${universeId}/details`, {
            timeout: 8000,
          }); // 타임아웃 옵션 추가
          break; // 성공 시 루프 탈출
        } catch (e: unknown) {
          lastError = e;
          const errLike = toErrorLike(e);
          const status = getResponseStatus(e);
          const errorCode = typeof errLike.errorCode === "string" ? errLike.errorCode : "";
          const retriable =
            !status || status >= 500 || errorCode === "ERR_NETWORK" || errorCode === "ECONNABORTED";

          logger.warn(`커머스 상세 호출 실패(${attempt}/${maxAttempts})`, e);

          if (attempt < maxAttempts && retriable) {
            await new Promise((r) => setTimeout(r, 800 * attempt)); // 지수 백오프
            continue;
          }
          break; // 재시도 불가/마지막 실패면 루프 종료
        }
      }

      if (!response) throw lastError || new Error("상세 응답 없음");

      if (response.data.success && response.data.data?.products) {
        const rawProducts = response.data.data.products;

        const validProducts = rawProducts.filter((product) => {
          if (!product.id || !product.image) {
            logger.warn("유효하지 않은 상품 데이터 제외:", product);
            return false;
          }
          return true;
        });

        if (validProducts.length === 0) {
          logger.warn("유효한 상품 데이터가 없습니다.");
          setCommerceProducts([]); // 데이터 자체가 없을 때만 비움
          return;
        }

        const safeProducts = preprocessCommerceProducts(validProducts);
        logger.log(`📦 유효한 상품 데이터: ${safeProducts.length}개`);

        setCommerceProducts(safeProducts);
        setPreloadProgress({ total: safeProducts.length, loaded: 0, failed: 0 });
        preloadProductTextures(safeProducts).catch((error) => {
          logger.error("상품 이미지 프리로드 중 오류:", error);
        });
      } else {
        logger.warn("상품 데이터 응답이 올바르지 않습니다:", response?.data);
        setError("상품 데이터 형식이 올바르지 않습니다."); // UX 안정성을 위해 API 형식 이상만으로 전체 비우지 않음
      }
    } catch (err: unknown) {
      logger.error("커머스 상품 데이터 로드 실패:", err);

      let errorMessage = "상품 데이터를 불러오는데 실패했습니다.";
      const status = getResponseStatus(err);
      const errLike: ErrorLikeType = toErrorLike(err);
      const errorCode = typeof errLike.errorCode === "string" ? errLike.errorCode : "";

      if (status === 404) errorMessage = "상품 정보를 찾을 수 없습니다.";
      else if (typeof status === "number" && status >= 500)
        errorMessage = "서버 오류로 상품 데이터를 불러올 수 없습니다.";
      else if (errorCode === "ERR_NETWORK" || errorCode === "NETWORK_ERROR")
        errorMessage = "네트워크 연결을 확인해 주세요.";
      else if (errorCode === "ECONNABORTED") errorMessage = "요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [universeId, enabled, preloadProductTextures]);

  // 유니버스 ID 변경 시 데이터 다시 로드 — 외부 fetch 트리거에 동기화하는 정당한 패턴.
  // set-state-in-effect rule은 cascading render 회피용 권고이며 여기는 단방향 동기화이므로 의도적 disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchCommerceProducts();
  }, [fetchCommerceProducts]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 컴포넌트 언마운트 시 캐시 정리
  useEffect(() => {
    if (!enabled) commerceImageManager.clearCache();
    return () => {
      commerceImageManager.clearCache();
    };
  }, [enabled]);

  return {
    commerceProducts,
    isLoading,
    error,
    preloadProgress,
    refetch: fetchCommerceProducts,
  };
};
