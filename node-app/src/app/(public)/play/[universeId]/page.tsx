"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Preloader, Toaster } from "@amu-labs/ui";
import { getAllPersonas } from "libs/api/universe";
import { listMySelectableGameCharacters } from "libs/api/game";
import type { IExtendedNpcData, BehaviorType, IUniverse, INpcImage, IBlockImage } from "types/game";
import { useGameStore, useGameCharacterStore } from "store/game";
import { useAuthStore } from "store/auth";
import { GameStage } from "components/template/game-stage";
import type { GameStageHandle } from "components/template/game-stage";
import { CommerceWelcome, PlayOnboardingGuide } from "components/module/game";
import { Lang, lang } from "components/module/i18n";
import { GAME_CONSTANTS as GC } from "consts/game";
import fetchClient from "libs/api/fetchClient";
import { useUniverseData, isUniverseNotFoundError } from "hooks/game/core";
import { useNpcAction } from "hooks/game/npc";
import { useUserData } from "hooks/auth";
import { useCommerceData } from "hooks/commerce";
import { useEnrichedPersonas } from "hooks/game/npc";
import { logger } from "utils/log";
import {
  advancePlayOnboarding,
  buildBlockImagesForStageDoc,
  isControllablePersona,
  readPlayOnboardingProgress,
  resetPlayOnboardingProgress,
  writePlayOnboardingProgress,
  type PlayOnboardingStep,
} from "utils/game";
import { getRandomDatas } from "utils/data";
import { getResponseStatus, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";
import { shouldShowWelcome, markWelcomeShown } from "utils/commerce";
import { ensureGuestId } from "utils/normalize";
import { DEFAULT_WORLD_UNIVERSE } from "consts/app";
import {
  getPlaySelectCharacterPath,
  getStorePath,
  isCommerceShowroomAccessible,
  isCommerceShowroomPublicOpen,
  PLAY_ROUTE_ROOT,
} from "utils/app";
import { ShoppingBag } from "lucide-react";
import { trackPlayEvent } from "utils/analytics/play";

export default function UniversePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, hasHydrated, isLogged } = useAuthStore();
  const { fetchUserData, updateLastAccessedUniverse, refetchUserData, isAdministrator, isLoading: isUserDataLoading } =
    useUserData();

  const [isServerInitialized, setIsServerInitialized] = useState(false); // 서버 초기화 여부
  const [isUserDataChecked, setIsUserDataChecked] = useState<boolean | null>(null);
  const [isGameStageInitialized, setIsGameStageInitialized] = useState(false); // GameStage 초기화 완료 상태 추적

  const lastAppliedCharacterId = useRef<string>(""); // 마지막으로 적용된 캐릭터 ID 추적
  const guestRedirectTimerRef = useRef<number | null>(null); // 게스트 리다리렉트 판정 타이머 추적

  // 스테이지 안전한 초기값 + 브라우저 사이즈 추적
  const [windowSize, setWindowSize] = useState(() => {
    if (typeof window !== "undefined") {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    return { width: 360, height: 800 }; // SSR 환경에서는 임시 기본값
  });
  const [showCommerceWelcome, setShowCommerceWelcome] = useState(false); // 커머스용 웰컴 팝업

  const didCheckRef = useRef(false);
  const gameStageRef = useRef<GameStageHandle>(null);

  const {
    universeId,
    universeInfo,
    isUniverseLoading,
    universeError,
    stageData,
    isStageDataLoading,
    stageDataError,
    isCommerceUniverse,
  } = useUniverseData({ enableStageQuery: isServerInitialized });
  const [onboardingProgress, setOnboardingProgress] = useState(() => readPlayOnboardingProgress(universeId));

  const completeOnboardingStep = useCallback(
    (step: PlayOnboardingStep) => {
      setOnboardingProgress((current) => advancePlayOnboarding(current, step));
    },
    [],
  );

  useEffect(() => {
    writePlayOnboardingProgress(universeId, onboardingProgress);
  }, [onboardingProgress, universeId]);

  const universeEntity = useMemo(() => (universeInfo?.data as IUniverse) || undefined, [universeInfo?.data]);
  const isUniverseDisabled = universeEntity?.enabled === false;
  const isShowroomPublicOpen = useMemo(
    () => isCommerceShowroomPublicOpen(universeEntity),
    [universeEntity],
  );
  const isShowroomAccessible = useMemo(
    () =>
      isCommerceShowroomAccessible(universeEntity, {
        isAdministrator,
        userEmail: user?.email,
      }),
    [universeEntity, isAdministrator, user?.email],
  );
  const shouldWaitForShowroomAccess = useMemo(() => {
    return Boolean(universeEntity?.type === "commerce" && hasHydrated && isLogged() && !isShowroomPublicOpen && isUserDataLoading);
  }, [universeEntity?.type, hasHydrated, isLogged, isShowroomPublicOpen, isUserDataLoading]);
  const isShowroomBlocked = useMemo(() => {
    if (universeEntity?.type !== "commerce") return false;
    if (shouldWaitForShowroomAccess) return false;
    return !isShowroomAccessible;
  }, [universeEntity?.type, shouldWaitForShowroomAccess, isShowroomAccessible]);

  // "없음" 플래그 추출
  const universeNotFound = useMemo(() => isUniverseNotFoundError(universeError), [universeError]);

  // 주인공(선택/저장/이미지) 카탈로그: 커머스면 `DEFAULT_WORLD_UNIVERSE`
  const catalogUniverseIdForUser = isCommerceUniverse ? DEFAULT_WORLD_UNIVERSE : universeId;
  // NPC 카탈로그: 언제나 현재 유니버스
  const catalogUniverseIdForNpc = universeId;

  // Zustand 캐릭터 스토어 구독
  const selectedCharacter = useGameCharacterStore((state) => state.selectedCharacter);
  const selectedCharacterId = useGameCharacterStore((state) => state.selectedCharacterId);
  const setSelectedCharacter = useGameCharacterStore((state) => state.setSelectedCharacter);

  // 브라우저 리사이즈 감지
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // GameStage 초기화 완료 시 호출될 콜백 함수
  const handleGameStageInitialized = useCallback(() => {
    logger.log("✨ 게임 스테이지 초기화 완료");
    setIsGameStageInitialized(true);
    completeOnboardingStep("character");
  }, [completeOnboardingStep]);

  // 서버 초기화 처리
  useEffect(() => {
    let attempt = 0;
    let cancelled = false;

    const init = async () => {
      while (attempt < 3 && !cancelled) {
        try {
          attempt++;
          await fetchClient.get("/init", { timeout: 10_000 });
          logger.log("서버 초기화 완료");
          setIsServerInitialized(true);
          return;
        } catch (e) {
          const errRecord = toUnknownRecord(e);
          const responseRecord = toUnknownRecord(errRecord.response);
          const status = getResponseStatus(e);
          const data = responseRecord.data ?? errRecord.data;
          logger.warn(`서버 초기화 실패/오류(시도 ${attempt}):`, {
            status,
            data,
            message: toErrorMessage(e, String(e)),
          });
        }
        await new Promise((r) => setTimeout(r, Math.min(300 * 2 ** attempt, 1500)));
      }
      // 3회 실패 후에도 진행은 허용
      if (!cancelled) {
        logger.warn("서버 초기화 반복 실패 → 제한적으로 진행합니다.");
        setIsServerInitialized(true);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // 유저 페르소나 데이터 가져오기
  const {
    data: userPersonas,
    isLoading: isUserPersonasLoading,
    error: userPersonasError,
  } = useQuery<IExtendedNpcData[]>({
    queryKey: ["userPersonas", catalogUniverseIdForUser],
    queryFn: () => {
      if (!universeId) throw new Error("유니버스 ID가 유효하지 않습니다.");
      return getAllPersonas(catalogUniverseIdForUser);
    },
    enabled: !!universeId, // 유니버스가 준비된 뒤에만
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const {
    data: myGameCharacters,
    isLoading: isMyGameCharactersLoading,
    error: myGameCharactersError,
  } = useQuery({
    queryKey: ["my-selectable-game-characters", universeId],
    queryFn: () =>
      listMySelectableGameCharacters({
        universeId,
        limit: 20,
      }),
    enabled: hasHydrated && isLogged() && Boolean(universeId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const runtimeUserPersonas = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(myGameCharacters || []).map((item) => item.persona),
      ...(userPersonas || []),
    ].filter((persona) => {
      const pid = String(persona.pid || "").trim();
      if (!pid || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    });
  }, [myGameCharacters, userPersonas]);

  // npc 페르소나 데이터 가져오기
  const {
    data: npcPersonas,
    isLoading: isNpcPersonasLoading,
    error: npcPersonasError,
  } = useQuery<IExtendedNpcData[]>({
    queryKey: ["npcPersonas", catalogUniverseIdForNpc],
    queryFn: () => {
      if (!universeId) throw new Error("유니버스 ID가 유효하지 않습니다.");
      return getAllPersonas(catalogUniverseIdForNpc);
    },
    enabled: !!catalogUniverseIdForNpc,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // commerce welcome 팝업 표시 (커머스 + 스테이지 초기화 완료 + 유니버스 정보 존재)
  useEffect(() => {
    if (!isCommerceUniverse || !isGameStageInitialized || !universeId || !universeInfo?.data) return;

    // universes 문서의 typeSpecific.welcomePopup 설정(옵션) 읽기
    const cfg = toUnknownRecord(toUnknownRecord(universeInfo.data.typeSpecific).welcomePopup) as {
      enabled?: boolean;
      cooldownHours?: number;
      message?: { ko?: string; en?: string };
    };

    const enabled = cfg?.enabled !== false; // 명시 false 아닌 이상 기본 true
    const cooldown = cfg?.cooldownHours ?? 24;

    if (enabled && shouldShowWelcome(universeId, cooldown)) {
      // 외부 cooldown/유니버스 설정에 따라 환영 다이얼로그 노출 결정
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCommerceWelcome(true);
    }
  }, [isCommerceUniverse, isGameStageInitialized, universeId, universeInfo?.data]);

  // stageData를 zustand store에 업데이트하기 위한 함수
  const setStageGlobalMetaData = useGameStore((state) => state.setStageGlobalMetaData);

  // stageData가 변경될 때 메타 정보만 추출하여 store 업데이트
  useEffect(() => {
    if (stageData && stageData.length > 0) {
      const stage = stageData[0];
      // data 프로퍼티를 제외한 나머지 정보 추출
      const { ...meta } = stage;
      logger.log("[UniversePage] stageData:", stage);
      setStageGlobalMetaData(meta);
    }
  }, [stageData, universeId, setStageGlobalMetaData]);

  // useNpcAction 훅 사용
  const { triggerNpcAction } = useNpcAction();

  // 페르소나 enriched 훅 사용
  const { enrichedUser, enrichedNpc } = useEnrichedPersonas({
    universe: universeEntity,
    userPersonas: runtimeUserPersonas,
    npcPersonas,
    catalogUniverseIdForUser,
    catalogUniverseIdForNpc,
    isCommerceUniverse,
  });

  // 유저 캐릭터 템플릿 스토어 초기화(머지된 결과 사용)
  useEffect(() => {
    if (enrichedUser.length) {
      useGameStore.getState().setCharacterTemplates(enrichedUser);
      logger.log("유저 캐릭터 템플릿(머지 후) 초기화 완료", enrichedUser);
    }
  }, [enrichedUser]);

  // 사용 가능한 NPC 목록에서 선택된 캐릭터 제외
  const availableNpcPersonas = useMemo(() => {
    const base = enrichedNpc ?? [];
    return selectedCharacter ? base.filter((p: IExtendedNpcData) => p.pid !== selectedCharacter.pid) : base;
  }, [enrichedNpc, selectedCharacter]);

  // v2 단일 스테이지에 배치할 NPC 선택
  const availableNpcs = useMemo<IExtendedNpcData[]>(() => {
    if (availableNpcPersonas.length === 0) return [];

    // 최종 NPC 목록을 담을 배열
    const selectedNpcs: IExtendedNpcData[] = [];

    // 2. 남은 슬롯을 랜덤 NPC로 채움
    const remainingNpcs = availableNpcPersonas.filter(
      (npc: IExtendedNpcData) => !selectedNpcs.some((selected) => selected.pid === npc.pid),
    );

    const maxInitialNpcs = 10;

    // 남은 슬롯 수 계산 (최대 NPC 수에서 이미 선택된 NPC 수를 뺌)
    const remainingSlots = Math.max(0, maxInitialNpcs - selectedNpcs.length);

    // 남은 슬롯에 랜덤 NPC 추가
    if (remainingSlots > 0 && remainingNpcs.length > 0) {
      const randomlySelectedNpcs = getRandomDatas(remainingNpcs, remainingSlots, {
        uniqueOnly: true,
      }) as IExtendedNpcData[];

      selectedNpcs.push(...randomlySelectedNpcs);
    }

    // 중복 제거 (pid 기준)
    const uniqueNpcs = selectedNpcs.filter(
      (npc, index, array) => npc.pid && array.findIndex((item) => item.pid === npc.pid) === index,
    );

    logger.log(`초기 스테이지에 배치할 NPC 생성 완료: ${uniqueNpcs.length}개`, {
      maxInitialNpcs: maxInitialNpcs,
    });

    return uniqueNpcs;
  }, [availableNpcPersonas]);

  // 스테이지에 추가할 NPC 이미지 생성
  const npcImages = useMemo<INpcImage[]>(() => {
    if (!availableNpcs || availableNpcs.length === 0) return [];

    const behaviorTypes: BehaviorType[] = ["wander", "follow", "patrol", "stationary", "random"];
    const patrolPointCount = 5;

    return availableNpcs
      .filter((d): d is IExtendedNpcData & { pid: string } => !!d.pid)
      .map((persona) => {
        // NPC별 임의 경로/행동/속도 시드 (의도된 impure 사용) — 매 dep 변경 시 새 시드 허용
        /* eslint-disable react-hooks/purity */
        const pathPointsArray = Array.from({ length: patrolPointCount }, () => ({
          x: Math.random() * windowSize.width * 0.8 + windowSize.width * 0.1,
          y: Math.random() * windowSize.height * 0.8 + windowSize.height * 0.1,
        }));

        const npcImage: INpcImage = {
          persona,
          displayName: persona.name || "???",
          behavior: {
            type: behaviorTypes[Math.floor(Math.random() * behaviorTypes.length)],
            params: {
              wanderRadius: 50 + Math.random() * 100,
              targetDistance: 80 + Math.random() * 40,
              pathPoints: pathPointsArray,
              speed: 0.5 + Math.random() * 1.5,
            },
          },
        };
        /* eslint-enable react-hooks/purity */
        return npcImage;
      });
  }, [availableNpcs, windowSize]);

  const navigatedRef = useRef(false); // 경합 시 중복 이동 가드

  // 최초 캐릭터 선택 시에만 이동
  const gotoSelectCharacterPage = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    useGameCharacterStore.getState().setSelectedCharacter(null);
    router.push(getPlaySelectCharacterPath(universeId));
  }, [router, universeId]);

  // 로딩 시작 상태 보장
  useEffect(function ensureUserDataCheckedInitialized() {
    // 외부 인증 흐름이 isUserDataChecked를 비워 둔 경우 false로 시드
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isUserDataChecked === null) setIsUserDataChecked(false);
  }, [isUserDataChecked]);

  // 캐릭터 변경 감지 및 GameStage 업데이트
  useEffect(() => {
    // GameStage 컴포넌트가 마운트되었는지 확인
    if (!gameStageRef.current) return;

    // 새로운 캐릭터가 선택되었고, 이전에 적용된 캐릭터와 다른 경우에만 업데이트
    const isNewSelectedCharacter = selectedCharacterId !== lastAppliedCharacterId.current;

    logger.log("캐릭터 변경 감지 및 GameStage 업데이트:", {
      selectedCharacter: selectedCharacter,
      selectedCharacterId: selectedCharacterId,
      lastAppliedCharacterId: lastAppliedCharacterId,
      "lastAppliedCharacterId.current": lastAppliedCharacterId.current,
      isNewSelectedCharacter: isNewSelectedCharacter,
    });

    if (selectedCharacter && isNewSelectedCharacter) {
      logger.log("💫 캐릭터 변경 감지:", selectedCharacter.name, selectedCharacterId);

      // GameStage의 프로타고니스트 텍스처 업데이트 - 비동기 처리 개선
      gameStageRef.current
        .updateProtagonist(selectedCharacter)
        .then(() => {
          // 업데이트 성공 시 적용된 ID 저장
          lastAppliedCharacterId.current = selectedCharacter.pid;
          logger.log("✨ 게임 스테이지 캐릭터 업데이트 완료");
        })
        .catch((error) => {
          logger.error("게임 스테이지 캐릭터 업데이트 실패:", error);
        });
    }
  }, [selectedCharacter, selectedCharacterId, gameStageRef]);

  // 블록 이미지 생성
  const blockImages = useMemo<IBlockImage[]>(() => {
    if (!stageData || stageData.length === 0) {
      logger.warn("스테이지 데이터가 없어 빈 블록 이미지 배열 반환");
      return [];
    }
    const stage = stageData[0];
    const { blockImages: converted } = buildBlockImagesForStageDoc(stage);
    logger.log(`블록 이미지 변환 완료: ${converted.length}개`, {
      stageId: stage.stageId,
      stageName: stage.stageName,
      assetsCount: stage.assets?.length ?? 0,
      tilesCount: stage.layout?.tiles.length ?? 0,
      converted,
    });
    return converted;
  }, [stageData]);

  // 컴포넌트가 마운트될 때마다 캐릭터 데이터 새로 가져오기
  useEffect(() => {
    if (!universeId) return;

    // 카탈로그는 항상 최신 보장
    queryClient.invalidateQueries({ queryKey: ["userPersonas", catalogUniverseIdForUser] });
    queryClient.invalidateQueries({ queryKey: ["npcPersonas", catalogUniverseIdForNpc] });
    queryClient.invalidateQueries({ queryKey: ["my-selectable-game-characters", universeId] });

    // 로그인 확정 시에만 사용자 데이터 새로 고침
    if (hasHydrated && isLogged()) {
      refetchUserData();
    }
  }, [universeId, catalogUniverseIdForUser, catalogUniverseIdForNpc, hasHydrated, isLogged, queryClient, refetchUserData]);

  // 커머스 데이터 훅 사용
  const { commerceProducts, error: commerceError } = useCommerceData({
    universeId: universeId || "",
    enabled: isCommerceUniverse && !!universeId,
  });

  const stageGlobalMetaData = useGameStore((state) => state.stageGlobalMetaData);

  // '하드 에러' 계산
  const hardError = useMemo(() => {
    if (universeNotFound) return null;
    const anyLoading =
      isUserPersonasLoading ||
      isMyGameCharactersLoading ||
      isNpcPersonasLoading ||
      isStageDataLoading ||
      isUniverseLoading;
    if (anyLoading) return null;
    return (userPersonasError || myGameCharactersError || npcPersonasError || stageDataError || universeError) ?? null;
  }, [
    universeNotFound,
    isUserPersonasLoading,
    isMyGameCharactersLoading,
    isNpcPersonasLoading,
    isStageDataLoading,
    isUniverseLoading,
    userPersonasError,
    myGameCharactersError,
    npcPersonasError,
    stageDataError,
    universeError,
  ]);

  // '소프트 에러' 계산
  const softCommerceError = commerceError;

  // isLoading은 순수 로딩 플래그만 계산
  const isLoading = useMemo(() => {
    const userDataCheckPending = isUserDataChecked === null || isUserDataChecked === false;
    const personaLoading =
      isUserPersonasLoading || isMyGameCharactersLoading || isNpcPersonasLoading;
    return personaLoading || isStageDataLoading || isUniverseLoading || userDataCheckPending;
  }, [
    isUserDataChecked,
    isUserPersonasLoading,
    isMyGameCharactersLoading,
    isNpcPersonasLoading,
    isStageDataLoading,
    isUniverseLoading,
  ]);

  const isReady = useMemo(() => {
    const ready =
      !isUniverseDisabled &&
      !isLoading &&
      !!stageGlobalMetaData &&
      isControllablePersona(selectedCharacter) &&
      blockImages.length > 0 &&
      isServerInitialized;

    // 상태가 변경될 때만 로그 출력
    if (ready) {
      logger.log("게임 스테이지 초기화 완료! 렌더링 시작");
    }

    return ready;
  }, [isUniverseDisabled, isLoading, stageGlobalMetaData, selectedCharacter, blockImages.length, isServerInitialized]);

  // 체크 준비 여부 플래그
  const canCheckUserCharacter =
    !isUniverseLoading &&
    !isMyGameCharactersLoading &&
    !!universeInfo?.data &&
    !!runtimeUserPersonas &&
    hasHydrated === true &&
    !isUniverseDisabled &&
    !universeNotFound;

  // universeId가 바뀌면 다시 1회 실행 허용
  useEffect(() => {
    didCheckRef.current = false;
  }, [universeId]);

  // 게스트 → 로그인 전환 시  1회 실행 허용
  useEffect(() => {
    if (!hasHydrated) return;
    didCheckRef.current = false;
  }, [universeId, hasHydrated, user?.id]);

  useEffect(() => {
    if (!canCheckUserCharacter || didCheckRef.current) return;
    didCheckRef.current = true;

    let cancelled = false;

    // 혹시 남아있던 타이머 정리
    if (guestRedirectTimerRef.current) {
      clearTimeout(guestRedirectTimerRef.current);
      guestRedirectTimerRef.current = null;
    }

    (async () => {
      logger.log("사용자 캐릭터 체크 시작: ", { isAuthenticated, userId: user?.id });

      try {
        if (isLogged() && user?.id) {
          // 1) 로그인 사용자 분기
          const data = await fetchUserData(user.id);
          await updateLastAccessedUniverse(universeId);

          // 선택된 캐릭터 확인
          const currentPersonaID = data?.selectedPersonas?.[universeId];
          const currentPersona = currentPersonaID
            ? enrichedUser.find((persona) => persona.pid === currentPersonaID)
            : undefined;

          if (!currentPersonaID) {
            logger.log("로그인했지만 현재 유니버스에 선택된 캐릭터가 없음 - select-character로 이동");
            gotoSelectCharacterPage();
            return;
          }

          if (!isControllablePersona(currentPersona)) {
            logger.warn("선택된 페르소나 ID에 해당 캐릭터를 찾을 수 없습니다:", currentPersonaID);
            gotoSelectCharacterPage();
            return;
          }

          // 스토어/스테이지 동기화
          if (!selectedCharacter || currentPersona.pid !== selectedCharacter.pid) {
            setSelectedCharacter(currentPersona);
            lastAppliedCharacterId.current = currentPersona.pid;

            // GameStage 반영 (약간의 렌더 여유)
            setTimeout(() => {
              gameStageRef.current
                ?.updateProtagonist(currentPersona)
                .then(() =>
                  logger.log("✨ 로그인 사용자 캐릭터로 스테이지 업데이트 완료", lastAppliedCharacterId.current),
                )
                .catch((e) => logger.error("게임 스테이지 캐릭터 업데이트 실패:", e));
            }, 100);
          }
        } else {
          // 2) 게스트 분기
          const REDIRECT_DELAY = 700;

          guestRedirectTimerRef.current = window.setTimeout(() => {
            if (cancelled) return;

            // 대기 중 로그인으로 전환되면 종료
            if (useAuthStore.getState().isLogged()) {
              logger.log("게스트 분기 지연 중 로그인 전환 감지: 리다이렉트 취소");
              return;
            }

            // 이미 캐릭터 적용돼 있으면 종료
            const already = useGameCharacterStore.getState().selectedCharacter;
            if (isControllablePersona(already)) {
              logger.log("게스트 타이머: 이미 캐릭터 적용됨 → 리다이렉트 취소");
              return;
            }

            const key = `universe_${universeId}_character`;
            const raw = localStorage.getItem(key);
            const localSavedCharacterId = raw?.trim() || "";

            const findInCatalog = (pid: string) =>
              enrichedUser.find((persona) => persona.pid === pid);
            const localSavedCharacter = localSavedCharacterId ? findInCatalog(localSavedCharacterId) : undefined;

            // 커머스에서 카탈로그 전환/지연될 수 있어 1차 보류
            if (localSavedCharacterId && !localSavedCharacter && isCommerceUniverse) {
              logger.log("커머스 카탈로그 전환 대기: 리다이렉트 보류");
              return;
            }

            // 1회 재시도(카탈로그 늦게 도착했을 때)
            if (localSavedCharacterId && !localSavedCharacter) {
              logger.warn("로컬 PID는 있으나 현재 카탈로그에서 못 찾음. 1회 재시도 예약:", {
                key,
                localSavedCharacterId,
                catalogLoaded: enrichedUser.length > 0,
              });

              setTimeout(() => {
                if (cancelled) return;
                const retry = findInCatalog(localSavedCharacterId);

                if (isControllablePersona(retry)) {
                  setSelectedCharacter(retry);
                  lastAppliedCharacterId.current = retry.pid;

                  setTimeout(() => {
                    gameStageRef.current
                      ?.updateProtagonist(retry)
                      .then(() =>
                        logger.log("✨ 비로그인 사용자 캐릭터 적용 완료(재시도)", lastAppliedCharacterId.current),
                      )
                      .catch((e) => logger.error("게임 스테이지 캐릭터 업데이트 실패:", e));
                  }, 100);
                } else {
                  logger.log("재시도 실패: select-character로 이동");
                  gotoSelectCharacterPage();
                }
              }, 250);

              return;
            }

            // 로컬 저장 성공 케이스
            if (localSavedCharacterId && isControllablePersona(localSavedCharacter)) {
              setSelectedCharacter(localSavedCharacter);
              lastAppliedCharacterId.current = localSavedCharacter.pid;

              setTimeout(() => {
                gameStageRef.current
                  ?.updateProtagonist(localSavedCharacter)
                  .then(() => logger.log("✨ 비로그인 사용자 캐릭터 적용 완료", lastAppliedCharacterId.current))
                  .catch((e) => logger.error("게임 스테이지 캐릭터 업데이트 실패:", e));
              }, 100);
              return;
            }

            // 로컬에도 없으면 선택 페이지로
            logger.log("비로그인 확정: 캐릭터 없음 → select-character 이동", { key, raw });
            gotoSelectCharacterPage();
          }, REDIRECT_DELAY);
        }
      } catch (e) {
        logger.error("사용자 캐릭터 확인 중 오류:", e);
      } finally {
        if (!cancelled) setIsUserDataChecked(true);
      }
    })();

    return () => {
      cancelled = true;
      if (guestRedirectTimerRef.current) {
        clearTimeout(guestRedirectTimerRef.current);
        guestRedirectTimerRef.current = null;
      }
    };
  }, [
    canCheckUserCharacter,
    universeId,
    gotoSelectCharacterPage,
    fetchUserData,
    updateLastAccessedUniverse,
    isAuthenticated,
    isCommerceUniverse,
    isLogged,
    selectedCharacter,
    setSelectedCharacter,
    user?.id,
    enrichedUser,
    isUniverseDisabled,
  ]);

  // "없음" 감지 시 안내 후 홈으로 이동
  useEffect(() => {
    if (!universeNotFound) return;

    logger.warn(`유니버스 미존재: ${universeId} → 홈으로 이동`);

    // 게스트 타이머/기타 대기 취소
    if (guestRedirectTimerRef.current) {
      clearTimeout(guestRedirectTimerRef.current);
      guestRedirectTimerRef.current = null;
    }

    const t = setTimeout(() => {
      // 필요하면 쿼리 스트링으로 플래시 메시지를 홈에 전달할 수도 있음: "/?msg=universe_not_found"
      router.replace(PLAY_ROUTE_ROOT);
    }, 1200);

    return () => clearTimeout(t);
  }, [universeNotFound, universeId, router]);

  useEffect(() => {
    if (!isShowroomBlocked || !universeId || !universeEntity) return;

    const t = setTimeout(() => {
      router.replace(getStorePath(universeId, { universe: universeEntity }));
    }, 1800);

    return () => clearTimeout(t);
  }, [isShowroomBlocked, universeId, universeEntity, router]);

  // 타임아웃 후 강제 로딩 완료
  useEffect(() => {
    // 5초 후에도 로딩이 완료되지 않으면 강제로 완료 처리
    const timeoutId = setTimeout(() => {
      if (isUserDataChecked === false) {
        logger.warn("로딩 타임아웃 - 사용자 데이터 확인 강제 완료");
        setIsUserDataChecked(true);
      }
    }, 5000); // 5초 타임아웃

    return () => clearTimeout(timeoutId);
  }, [isUserDataChecked, selectedCharacter, universeId]);

  // isReady 상태 로깅 추가 (디버깅용)
  useEffect(() => {
    // 상태 확인 로깅
    logger.log("게임 스테이지 초기화 상태:", {
      isLoading,
      stageGlobalMetaData: !!stageGlobalMetaData,
      selectedCharacterId: selectedCharacter?.pid,
      blockImagesCount: blockImages.length,
      isServerInitialized,
      isReady:
        !isLoading && stageGlobalMetaData && selectedCharacter?.pid && blockImages.length > 0 && isServerInitialized,
    });
  }, [isLoading, stageGlobalMetaData, selectedCharacter, blockImages.length, isServerInitialized]);

  useEffect(() => {
    if (selectedCharacter?.pid) {
      logger.log("게임 스테이지 캐릭터 정보:", {
        pid: selectedCharacter.pid,
        name: selectedCharacter.name,
        universeId,
        isReady,
      });
    }
  }, [selectedCharacter, isReady, universeId]);

  // 커머스 에러 표시
  useEffect(() => {
    if (softCommerceError && isReady) {
      toast.error(softCommerceError, {
        duration: 5000, // 5초 후 자동으로 사라짐
        position: "bottom-center",
      });
    }
  }, [softCommerceError, isReady]);

  // 게스트 모드 디버깅 체크
  const guestId = ensureGuestId(); // 게스트 ID 미리 생성
  useEffect(() => {
    if (isCommerceUniverse && hasHydrated && !isLogged() && guestId) {
      logger.log("커머스 게스트 모드 활성화", { guest: `${guestId.slice(0, 8)}...` });
    }
  }, [isCommerceUniverse, hasHydrated, isLogged, guestId]);

  const errMsg =
    userPersonasError ||
    myGameCharactersError ||
    npcPersonasError ||
    stageDataError ||
    universeError ||
    commerceError;
  const errText = toErrorMessage(errMsg, String(errMsg));
  const welcomePopup = toUnknownRecord(toUnknownRecord(universeInfo?.data?.typeSpecific).welcomePopup);
  const welcomeMessage = toUnknownRecord(welcomePopup.message) as { ko?: string; en?: string };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {universeNotFound ? (
        <div className="flex flex-col items-center text-center p-4">
          <span className="text-red-500">
            <Lang text={{ ko: "해당 유니버스는 존재하지 않습니다", en: "This universe does not exist" }} />
          </span>
          <span className="mt-2 text-gray-500">
            <Lang text={{ ko: "잠시 후 홈으로 이동합니다...", en: "Redirecting to Home..." }} />
          </span>
        </div>
      ) : isUniverseDisabled ? (
        <div className="flex max-w-[34rem] flex-col items-center text-center p-6">
          <span className="text-lg font-semibold text-primary-text">
            <Lang
              text={{
                ko: "아직 입장할 수 없는 유니버스입니다.",
                en: "This universe is not open yet.",
              }}
            />
          </span>
          <span className="mt-2 text-sm leading-6 text-secondary-text">
            <Lang
              text={{
                ko: "정식 출시 전까지 이 유니버스는 비활성 상태로 유지됩니다.",
                en: "This universe remains disabled until its official release.",
              }}
            />
          </span>
          <Button className="mt-5" onClick={() => router.push(PLAY_ROUTE_ROOT)}>
            <Lang text={{ ko: "AMU Play로 돌아가기", en: "Back to AMU Play" }} />
          </Button>
        </div>
      ) : isShowroomBlocked ? (
        <div className="flex max-w-[34rem] flex-col items-center text-center p-6">
          <span className="text-lg font-semibold text-primary-text">
            <Lang
              text={{
                ko: "이 레거시 쇼룸은 현재 오픈 기간이 아닙니다.",
                en: "This legacy showroom is not open right now.",
              }}
            />
          </span>
          <span className="mt-2 text-sm leading-6 text-secondary-text">
            <Lang
              text={{
                ko: "브랜드 쇼룸은 이벤트 기간에만 열립니다. 잠시 후 스토어 홈으로 이동합니다.",
                en: "The brand showroom opens only during event windows. Redirecting you to the store home shortly.",
              }}
            />
          </span>
          <div className="mt-5">
            <Button onClick={() => router.push(getStorePath(universeId, { universe: universeEntity }))}>
              <ShoppingBag className="mr-2 h-4 w-4" />
              <Lang text={{ ko: "스토어 홈으로", en: "Go to Store Home" }} />
            </Button>
          </div>
        </div>
      ) : hardError ? (
        <div className="flex flex-col text-red-500 p-4 max-w-[90vw]">
          <span>
            <Lang
              text={{
                ko: "데이터를 가져오는 중 오류가 발생했습니다: ",
                en: "An error occurred while retrieving data: ",
              }}
            />
          </span>
          <span className="break-words">
            {errText}
          </span>
        </div>
      ) : isLoading || !isReady ? (
        <Preloader
          variant="spin"
          size="lg"
          container
          fullScreen
          text={lang({ ko: "데이터를 가져오는 중입니다...", en: "Retrieving data..." })}
        />
      ) : (
        <>
          {isCommerceUniverse && universeEntity && (
            <div className="pointer-events-none absolute top-4 right-4 z-[70] flex justify-end">
              <Button
                variant="outline"
                className="pointer-events-auto bg-background/92 backdrop-blur"
                onClick={() => router.push(getStorePath(universeId, { universe: universeEntity }))}
              >
                <ShoppingBag className="mr-2 h-4 w-4" />
                <Lang text={{ ko: "스토어 홈", en: "Store Home" }} />
              </Button>
            </div>
          )}

          {/* 게임 스테이지 */}
          {isControllablePersona(selectedCharacter) && blockImages.length > 0 && (
            <GameStage
              ref={gameStageRef}
              universeInfo={universeEntity}
              step={GC.DEFAULT_SPEED}
              userSize={GC.DEFAULT_USER_SIZE}
              npcSize={GC.DEFAULT_NPC_SIZE}
              user={selectedCharacter}
              blocks={blockImages}
              npcs={isCommerceUniverse ? [] : npcImages}
              onNpcAction={triggerNpcAction}
              stageWidth={windowSize.width}
              stageHeight={windowSize.height}
              onInitialized={handleGameStageInitialized}
              onFirstMove={() => completeOnboardingStep("move")}
              onNpcTalkStart={() => {
                completeOnboardingStep("talk");
                trackPlayEvent("npc_talk_start", { universeId });
              }}
              universeType={isCommerceUniverse ? "commerce" : "game"}
              commerceProducts={isCommerceUniverse ? commerceProducts : undefined}
            />
          )}

          {!isCommerceUniverse && isGameStageInitialized ? (
            <PlayOnboardingGuide
              progress={onboardingProgress}
              onReset={() =>
                setOnboardingProgress(advancePlayOnboarding(resetPlayOnboardingProgress(), "character"))
              }
            />
          ) : null}

          {showCommerceWelcome && isGameStageInitialized && isCommerceUniverse && universeInfo?.data?.name && (
            <CommerceWelcome
              universeName={universeInfo.data.name}
              message={welcomeMessage}
              onClose={() => {
                markWelcomeShown(universeId); // 닫힐 때 마지막 표시 시각 기록 (24시간 쿨다운 체크 시 필요)
                setShowCommerceWelcome(false);
              }}
            />
          )}
        </>
      )}
      <Toaster />
    </div>
  );
}
