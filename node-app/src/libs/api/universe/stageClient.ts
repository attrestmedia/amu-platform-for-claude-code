import fetchClient from "libs/api/fetchClient";
import type { IStageDoc, IStageDefinitionResponse, IStageAssetValidation, IStageAssetPreload } from "types/game";
import { logger } from "utils/log";
import { resolveStageAssetPath } from "utils/game/gameImageUtils";
import { toErrorLike, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain universe
 * @scope client
 */

// StageDoc 기반 스테이지 에셋 URL 리스트 생성 (background, assets, states 포함)
// - StageDoc에는 /apps/gen-studio/... 또는 /uploads/... 같은 런타임 URL을 직접 저장한다.
const buildStageAssetUrls = (stageDoc: IStageDoc): string[] => {
  const urls: string[] = [];

  // 1) 배경 이미지
  if (stageDoc.background?.name) {
    urls.push(resolveStageAssetPath(stageDoc, stageDoc.background.name));
  }

  // 2) Stage 에셋들
  if (stageDoc.assets?.length) {
    for (const asset of stageDoc.assets) {
      // 기본 스프라이트 파일
      urls.push(resolveStageAssetPath(stageDoc, asset.fileName));

      // 2-1) 상태별 대체 런타임 이미지 URL (있다면)
      const states = asset.meta?.states;
      if (states && Array.isArray(states)) {
        for (const state of states) {
          if (state.fileName) {
            urls.push(resolveStageAssetPath(stageDoc, state.fileName));
          }
        }
      }
    }
  }

  // 중복 제거
  return Array.from(new Set(urls));
};

// 스테이지 정의(StageDoc) 데이터 가져오기
export const getStageDefinition = async (universeId: string, stageId?: string): Promise<IStageDoc> => {
  try {
    logger.log("🎮 스테이지 정의 요청:", { universeId, stageId });

    const response = await fetchClient.get<IStageDefinitionResponse>(`/universe/${universeId}/stage`, {
      params: { stageId },
    });

    if (!response.data.success) {
      throw new Error(response.data.message || "스테이지 정의를 가져오는데 실패했습니다.");
    }

    const stageDoc = response.data.data;

    logger.log("✅ 스테이지 정의 로드 완료:", {
      stageId: stageDoc.stageId,
      stageName: stageDoc.stageName,
      projection: stageDoc.projectionConfig.projection,
      coordinateContractVersion: stageDoc.coordinateContractVersion,
      releaseStatus: stageDoc.releaseDeployment?.status,
      manifestVersion: stageDoc.releaseDeployment?.manifestVersion,
      domain: stageDoc.domain,
      usageType: stageDoc.usageType,
      assetsCount: stageDoc.assets?.length ?? 0,
      tilesCount: stageDoc.layout?.tiles.length ?? 0,
    });

    return stageDoc;
  } catch (error: unknown) {
    const err = toErrorLike(error);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string };
    logger.error("스테이지 정의 가져오기 실패:", {
      universeId,
      stageId,
      error: respData.message || toErrorMessage(error),
    });
    throw error;
  }
};

// 스테이지 에셋 존재 여부 확인
// - HEAD → 실패 시 GET 폴백
export const validateStageAssets = async (stageDoc: IStageDoc): Promise<IStageAssetValidation> => {
  const validAssets: string[] = [];
  const invalidAssets: string[] = [];

  const assetUrls = buildStageAssetUrls(stageDoc);

  if (assetUrls.length === 0) {
    logger.warn("검증할 스테이지 에셋이 없습니다:", {
      stageId: stageDoc.stageId,
      stageName: stageDoc.stageName,
    });
    return { validAssets, invalidAssets };
  }

  // 폴백 유틸
  const tryHeadOrGet = async (url: string) => {
    try {
      const head = await fetch(url, { method: "HEAD" });
      if (head.ok) return true;
      // 일부 서버/프록시는 HEAD 차단 → GET으로 폴백
      const get = await fetch(url, { method: "GET" });
      return get.ok;
    } catch {
      return false;
    }
  };

  // 병렬로 에셋 존재 여부 확인
  const assetChecks = assetUrls.map(async (assetPath) => {
    const ok = await tryHeadOrGet(assetPath);
    (ok ? validAssets : invalidAssets).push(assetPath);
  });

  await Promise.all(assetChecks);

  if (invalidAssets.length > 0) {
    logger.warn("일부 스테이지 에셋이 존재하지 않습니다:", {
      stageId: stageDoc.stageId,
      stageName: stageDoc.stageName,
      invalidAssets,
    });
  }

  return { validAssets, invalidAssets };
};

// 스테이지 에셋 프리로드 (이미지만 대상)
export const preloadStageAssets = async (stageDoc: IStageDoc): Promise<IStageAssetPreload> => {
  // SSR 환경에서는 스킵
  if (typeof window === "undefined") return { loaded: [], failed: [] };

  const loaded: string[] = [];
  const failed: string[] = [];

  const assetUrls = buildStageAssetUrls(stageDoc);

  logger.log("🔄 스테이지 에셋 프리로드 시작:", {
    stageId: stageDoc.stageId,
    stageName: stageDoc.stageName,
    assetsCount: assetUrls.length,
  });

  if (assetUrls.length === 0) {
    return { loaded, failed };
  }

  // 이미지 프리로드 함수
  const preloadImage = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        loaded.push(src);
        resolve();
      };
      img.onerror = () => {
        failed.push(src);
        reject(new Error(`이미지 로드 실패: ${src}`));
      };
      img.src = src;
    });
  };

  // 병렬 프리로드 (최대 5개씩)
  const batchSize = 5;
  const batches: string[][] = [];

  for (let i = 0; i < assetUrls.length; i += batchSize) {
    const batch = assetUrls.slice(i, i + batchSize);
    batches.push(batch);
  }

  logger.log("🔄 프리로드 배치 구성:", {
    stageId: stageDoc.stageId,
    stageName: stageDoc.stageName,
    batchSize,
    totalAssets: assetUrls.length,
    totalBatches: batches.length,
  });

  for (const batch of batches) {
    const batchPromises = batch.map((asset) =>
      preloadImage(asset).catch(() => {
        // 개별 에셋 로드 실패는 무시하고 계속 진행
      }),
    );

    await Promise.allSettled(batchPromises);
  }

  logger.log("✅ 스테이지 에셋 프리로드 완료:", {
    stageId: stageDoc.stageId,
    stageName: stageDoc.stageName,
    loaded: loaded.length,
    failed: failed.length,
    failedAssets: failed,
  });

  return { loaded, failed };
};
