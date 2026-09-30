import { useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useGameStore } from "store/game";
import { logger } from "utils/log";
import { getDocumentsData } from "libs/api/common";
import { GAME_CONSTANTS as GC } from "consts/game";
import fetchClient from "libs/api/fetchClient";
import type { IUniverse, IStageDoc } from "types/game";
import { toErrorLike } from "utils/common/typeUtils";

// 응답 본문 shape — v2 런타임 스테이지 API는 단일 IStageDoc을 반환한다.
type UniverseInfoResponseType = { data?: IUniverse };
type StageDataResponseType = { success?: boolean; message?: string; data?: IStageDoc };

/**
 * @docHint
 * @purpose useUniverseData 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-universe
 * @scope universe
 */

// 스테이지 쿼리 활성화 여부, 선호 스테이지명
type UseUniverseOptions = {
  enableStageQuery?: boolean;
  preferStageName?: string;
};

export const UNIVERSE_NOT_FOUND = "UNIVERSE_NOT_FOUND";

export const makeUniverseNotFoundError = () => {
  const e = new Error("해당 유니버스는 존재하지 않습니다") as Error & { errorCode?: string };
  e.errorCode = UNIVERSE_NOT_FOUND;
  return e;
};

export const isUniverseNotFoundError = (e: unknown) => toErrorLike(e).errorCode === UNIVERSE_NOT_FOUND;

export function useUniverseData(options?: UseUniverseOptions) {
  const { enableStageQuery = true, preferStageName = "default" } = options || {};

  const params = useParams();
  const routeUniverseId = params.universeId as string;

  // 스토어에서 가져오기
  const universeId = useGameStore((state) => state.universeId);
  const stageId = useGameStore((state) => state.stageId);
  const stageName = useGameStore((state) => state.stageName);
  const setUniverseId = useGameStore((state) => state.setUniverseId);
  const setStage = useGameStore((state) => state.setStage);

  const targetUniverseId = routeUniverseId || universeId;

  // 최초 진입 시 store 동기화
  useEffect(() => {
    if (routeUniverseId && routeUniverseId !== universeId) {
      logger.log("유니버스 ID 변경 감지:", routeUniverseId);
      setUniverseId(routeUniverseId);
    }
  }, [routeUniverseId, universeId, setUniverseId]);

  /**
   * 유니버스 문서의 stages 배열을 기준으로 스테이지 초기화
   * - prefer "default"가 있으면 우선 적용, 없으면 첫 항목
   * - universeId 필터 먼저 적용, 없으면 전체에서 선택
   */
  const initStageFromUniverse = useCallback(
    (stages: Array<{ stageId: string; stageName: string }> | undefined | null, opts?: { prefer?: string }) => {
      if (!stages || stages.length === 0) {
        if (!stageName) {
          setStage(GC.FALLBACK.STAGE_ID, GC.FALLBACK.STAGE_NAME);
          logger.log("stages 없음 → stageId='', stageName='default'로 초기화");
        }
        return;
      }

      const prefer = opts?.prefer ?? preferStageName ?? GC.FALLBACK.STAGE_NAME;
      const alreadyValid = stageName && stages.some((s) => s.stageName === stageName);
      if (alreadyValid) return;

      // 선호 스테이지 찾기
      const chosenStage =
        stages.find((s) => s.stageName === prefer) ||
        stages.find((s) => s.stageName === GC.FALLBACK.STAGE_NAME) ||
        stages[0];

      if (chosenStage) {
        setStage(chosenStage.stageId, chosenStage.stageName);
        logger.log("스테이지 초기화:", {
          universeId: targetUniverseId,
          stageId: chosenStage.stageId,
          stageName: chosenStage.stageName,
        });
      } else {
        setStage("", GC.FALLBACK.STAGE_NAME);
      }
    },
    [stageName, setStage, preferStageName, targetUniverseId],
  );

  // 유니버스 정보 조회: API 실패 → DB 폴백 + 재시도
  const {
    data: universeInfo,
    isLoading: isUniverseLoading,
    error: universeError,
  } = useQuery({
    queryKey: ["universe", targetUniverseId],
    enabled: !!targetUniverseId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error: unknown) => !isUniverseNotFoundError(error) && failureCount < 2, // "없음"이면 재시도하지 않음
    retryDelay: (n) => Math.min(500 * 2 ** n, 2000),
    queryFn: async (): Promise<UniverseInfoResponseType> => {
      try {
        const out = await fetchClient.get<UniverseInfoResponseType>(`/universe/${targetUniverseId}`, {
          responseType: "auto",
        });
        return out.data;
      } catch {
        // DB 폴백 — 외부 도큐먼트 응답은 IUniverse 형태로 캐스팅하여 노출
        const response = (await getDocumentsData({
          db: "game",
          collection: "universes",
          filter: { id: targetUniverseId },
        })) as { data?: IUniverse[] };
        const doc = Array.isArray(response?.data) && response.data[0] ? response.data[0] : null;

        if (!doc) throw makeUniverseNotFoundError(); // ← DB에도 없으면 확정
        return { data: doc };
      }
    },
  });

  /**
   * commerce 타입 체크
   */
  const isCommerceUniverse = useMemo(() => {
    return universeInfo?.data?.type === "commerce";
  }, [universeInfo?.data?.type]);

  // 유니버스 이름
  const universeName = useMemo(() => {
    return universeInfo?.data?.name ?? "";
  }, [universeInfo?.data]);

  // 유니버스 정보(stages) 로드 시 스테이지 자동 초기화
  useEffect(() => {
    initStageFromUniverse(
      (universeInfo?.data?.stages ?? []) as Array<{ stageId: string; stageName: string }>,
      {
        prefer: preferStageName,
      },
    );
  }, [universeInfo?.data?.stages, initStageFromUniverse, preferStageName]);

  // 스테이지 데이터 조회 (API → 실패 시 DB 폴백)
  const {
    data: stageData,
    isLoading: isStageDataLoading,
    error: stageDataError,
  } = useQuery({
    queryKey: ["stageData", targetUniverseId, stageId, stageName],
    enabled:
      !!targetUniverseId &&
      !!stageName &&
      !!enableStageQuery &&
      !!universeInfo?.data &&
      universeInfo.data.enabled !== false,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<IStageDoc[]> => {
      const params: Record<string, string> = {};
      if (stageId) params.stageId = stageId;
      if (stageName) params.stageName = stageName;
      if (!params.stageId && !params.stageName) {
        params.stageId = GC.FALLBACK.STAGE_ID;
        params.stageName = GC.FALLBACK.STAGE_NAME;
      }

      const out = await fetchClient.get<StageDataResponseType>(`/universe/${targetUniverseId}/stage`, {
        params,
        responseType: "auto",
      });
      const payload = out.data;
      if (!payload?.success) throw new Error(payload?.message || "스테이지 데이터 조회 실패");
      const doc = payload.data;
      if (!doc || typeof doc !== "object") throw new Error("잘못된 스테이지 응답 포맷");
      return [doc];
    },
  });

  // 외부에서 스테이지 수동 변경 시 사용
  const changeStage = (newStageName: string) => {
    logger.log("스테이지 변경 요청:", newStageName);

    // stages 배열에서 stageId 찾기
    const stages = (universeInfo?.data?.stages ?? []) as Array<{ stageId: string; stageName: string }>;
    const targetStage = stages.find((s) => s.stageName === newStageName);

    if (targetStage) {
      setStage(targetStage.stageId, targetStage.stageName);
    } else {
      // 찾지 못하면 stageName만 업데이트 (stageId는 API 응답으로 동기화)
      setStage("", newStageName);
    }
  };

  return {
    universeId,
    universeName,

    stageId,
    stageName,

    // 동작 유틸
    changeStage, //스테이지 수동 변경
    initStageFromUniverse, // 스테이지 초기화

    // 유니버스 정보 및 상태
    universeInfo,
    isUniverseLoading,
    universeError,
    isCommerceUniverse, // 유니버스 커머스 타입 체크

    // 스테이지 데이터 및 상태
    stageData,
    isStageDataLoading,
    stageDataError,
  };
}
