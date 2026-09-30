import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Application, Container, Texture, Sprite, Text } from "pixi.js";
import type {
  IBlockImage,
  INpcImage,
  IStageData,
  NpcSpriteType,
  ITextureRefs,
  IGlobalNpcData,
  IExtendedNpcData,
  IUniverse,
  NpcActionType,
  DirectionBaseType,
  DirectionType,
  CameraBoundaryMode,
  UniverseType,
  IStageDoc,
} from "types/game";
import type { ICommerceProduct } from "types/commerce";
import { Joypad, StageMap, GameItemBox, InteractionController, GameControlBox } from "components/module/game";
import { lang } from "components/module/i18n";
import {
  useCreateStageContainer,
  useIsometricPointerPicking,
  useStageMouseDrag,
} from "hooks/game/stage";
import { useGlobalNpcData, useNpcMovement, useNpcInteraction } from "hooks/game/npc";
import { useWorldData, useGameLoop, useGameInit, useTextureInit } from "hooks/game/core";
import { useAnimationCalculation } from "hooks/game/animation";
import { useCollisionDetection } from "hooks/game/collision";
import useProtagonistUpdate from "hooks/game/stage/useProtagonistUpdate";
import { useNicknameManager } from "hooks/game/input";
import { useUniverseData } from "hooks/game/core";
import { useCommerceProductContact } from "hooks/commerce";
import { cn } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";
import {
  SpatialGrid,
  buildDirectionTexturesFromSprite,
  getSpriteIdleDirection,
  hasSpriteSheet,
  pickDirectionTexture,
  createCharacterNameContainer,
  CHARACTER_FOOTPRINT_TILES,
  createCharacterDepthKey,
  createLogicalEntityRect,
  projectLogicalPosition,
  resolveIsometricMovementRuntime,
  resolveCharacterData,
  resolveStageLogicalWorldSize,
  isStageCoordinateV2RuntimeReady,
} from "utils/game";
import { useGameStore, useGameCharacterStore, useNpcActionStore, useUiControlStore } from "store/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import { Preloader } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { useGameContext } from "contexts/GameContext";
import StageNavigationControls from "./StageNavigationControls";

// 클라이언트 마운트 감지 — SSR 시 false, 하이드레이션 이후 true
const subscribeClientNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// 오버레이 컴포넌트
const StageTransitionOverlay = () => {
  const stageTransition = useGameStore((state) => state.stageTransition);
  const alpha = stageTransition.overlayAlpha;

  // 전환이 아니고, 알파도 0이면 렌더하지 않음
  if (!stageTransition.active && (!alpha || alpha <= 0)) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40"
      style={{
        backgroundColor: "black",
        opacity: alpha,
        transition: "opacity 80ms linear",
      }}
    />
  );
};

// pixi view 설정
const configurePixiView = (app: Application | null) => {
  const pixiApp = app as (Application & { canvas?: HTMLCanvasElement; renderer?: unknown }) | null;
  // Pixi v8: init 미완료/파괴 상태에서 canvas getter(this.renderer.canvas)가 throw — renderer 존재 시에만 접근
  if (!pixiApp || !pixiApp.renderer) return;
  const view = pixiApp.canvas;
  if (!view) return;
  view.style.width = "100%";
  view.style.height = "100%";
  view.style.display = "block";
  view.style.touchAction = "none";
};

type NamedNpcSpriteType = NpcSpriteType & { nameContainer?: Container };

// GameStage 인터페이스 정의
export interface GameStageHandle {
  updateProtagonist: (characterData: IExtendedNpcData) => Promise<void>;
}

/**
 * GameStage 컴포넌트 Props 인터페이스
 */
interface GameStageProps {
  universeInfo: IUniverse;
  step: number;
  userSize: number; // 주인공 크기
  npcSize: number; // NPC 크기
  user: IExtendedNpcData;
  blocks: IBlockImage[]; // 장애물 이미지 객체 배열
  npcs: INpcImage[]; // NPC 이미지 객체 배열
  stageWidth?: number | "auto";
  stageHeight?: number | "auto";
  roadComplexity?: "low" | "medium" | "high"; // 맵 복잡도
  universeType?: UniverseType; // 유니버스 타입
  commerceProducts?: ICommerceProduct[]; // 커머스 상품 데이터
  onNpcAction?: (npcData: NpcActionType, protagonistPos?: { x: number; y: number }) => void; // 주인공 위치 정보를 선택적으로 받음
  onInitialized?: () => void; // 초기화 완료 시 호출될 콜백
  onFirstMove?: () => void;
  onNpcTalkStart?: (npcId: string) => void;
}

/**
 * 내부 구현 컴포넌트 - Context를 사용하는 게임 스테이지 렌더링
 */
const GameStage = forwardRef<GameStageHandle, GameStageProps>(function GameStage(props, ref) {
  const {
    universeInfo,
    step,
    userSize,
    npcSize,
    user,
    blocks,
    npcs,
    stageWidth,
    stageHeight,
    onNpcAction,
    onInitialized,
    onFirstMove,
    onNpcTalkStart,
  } = props;

  const { isCommerceUniverse } = useUniverseData();

  const setNpcs = useGameStore((state) => state.setNpcs);

  // 시트 열기 및 상태
  const {
    productConfirmOpen,
    productDetailOpen,
    isInputLocked,
    inputLockReason,
    askOpenProduct,
    armInitialContactGuard,
    clearInitialContactGuard,
    setStageChatSpeaker,
    unlockInput,
  } = useUiControlStore();
  const isActionOpen = useNpcActionStore((state) => state.isActionOpen);
  const closeNpcAction = useNpcActionStore((state) => state.closeNpcAction);

  // 현재 선택 캐릭터
  const currentSelectedCharacter = useGameCharacterStore((s) => s.selectedCharacter);
  const cameraMode = useGameStore((state) => state.camera.mode);
  const stageTransitionActive = useGameStore((state) => state.stageTransition.active);

  const stageGlobalMetaData = useGameStore((state) => state.stageGlobalMetaData);
  const logicalWorld = useMemo(
    () => resolveStageLogicalWorldSize(stageGlobalMetaData as unknown as IStageDoc | null),
    [stageGlobalMetaData],
  );
  const isIsometricStage = isStageCoordinateV2RuntimeReady(stageGlobalMetaData as unknown as IStageDoc | null);
  const boundaryMode: CameraBoundaryMode = "finite-hard";
  const setCameraViewSize = useGameStore((state) => state.setCameraViewSize);
  const setCameraBoundaryMode = useGameStore((state) => state.setCameraBoundaryMode);

  useEffect(() => {
    setCameraBoundaryMode(boundaryMode);
  }, [boundaryMode, setCameraBoundaryMode]);

  // 클라이언트 마운트 이후 true — effect setState 캐스케이드 회피
  const ready = useSyncExternalStore(subscribeClientNoop, getClientSnapshot, getServerSnapshot);

  const { getDisplayName } = useNicknameManager();
  const { state: gameContextState, dispatch } = useGameContext();

  // GameStage는 NPC action/input lock의 세션 경계다.
  // 이전 stage/route에서 남은 action과 해당 action이 소유한 lock만 정리하고,
  // 상품/결제 등 다른 이유의 입력 잠금은 건드리지 않는다.
  useEffect(() => {
    closeNpcAction();
    unlockInput("npc-action-busy");
    dispatch({ type: "SET_KEYBOARD_DIRECTION", payload: null });

    return () => {
      closeNpcAction();
      unlockInput("npc-action-busy");
      dispatch({ type: "SET_KEYBOARD_DIRECTION", payload: null });
    };
  }, [closeNpcAction, dispatch, unlockInput]);

  // 스테이지 크기 상태 (props가 있으면 우선 사용, 초기화 직후 실측으로 교정)
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>(() => {
    const w = typeof stageWidth === "number" ? stageWidth : 1;
    const h = typeof stageHeight === "number" ? stageHeight : 1;
    return { width: Math.max(1, w), height: Math.max(1, h) };
  });

  // 카메라 뷰포트 크기를 스토어 카메라와 동기화
  useEffect(() => {
    setCameraViewSize(stageSize.width, stageSize.height);
  }, [setCameraViewSize, stageSize.width, stageSize.height]);

  // 텍스처 초기화 상태
  const [isTexturesReady, setIsTexturesReady] = useState(false);
  const [initializationState, setInitializationState] = useState<{
    phase: "idle" | "initializing" | "ready" | "failed";
    error?: string;
    runtimeReady?: boolean;
    generation?: number;
  }>({ phase: "idle", runtimeReady: false, generation: 0 });

  // 충돌 그리드 업데이트 필요 여부를 나타내는 ref
  const needsCollisionUpdate = useRef<boolean>(false);

  // Refs 정의
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const protagonistRef = useRef<NpcSpriteType | null>(null);
  const npcsRef = useRef<NpcSpriteType[]>([]);
  const obstaclesRef = useRef<NpcSpriteType[]>([]);
  const stageDataRef = useRef<Record<string, IStageData>>({});
  const globalNpcDataRef = useRef<Array<IGlobalNpcData>>([]);
  const currentStageContainerRef = useRef<Container | null>(null);
  const isResizingRef = useRef<boolean>(false);
  const isInitialized = useRef(false);
  const needsMapUpdateRef = useRef(false);
  const lastInputDiagnosticDirectionRef = useRef<DirectionType | "__unset">("__unset");

  // 텍스처 참조
  const texturesRef = useRef<ITextureRefs>({
    protagonist: {
      sprite: null,
      profiles: null,
    },
    npcs: new Map() as ITextureRefs["npcs"],
    obstacles: [],
  });

  // 주인공 실제 Y 위치 저장
  const protagonistBaseYRef = useRef<number | null>(null);

  const logicalSpatialGridRef = useRef<SpatialGrid>(null!);

  // 클라이언트 마운트 후 v2 논리 좌표용 SpatialGrid 초기화
  // ready는 useSyncExternalStore로 별도 관리하므로 여기서는 setState 없음
  useEffect(() => {
    if (!logicalSpatialGridRef.current) {
      logicalSpatialGridRef.current = new SpatialGrid(logicalWorld?.logicalUnitsPerTile ?? 1);
      logger.log("GameStage: logicalSpatialGrid initialized");
    }

    logger.log("[GameStage] v2 논리 충돌 그리드 준비 완료");
  }, [logicalWorld?.logicalUnitsPerTile]);

  // 애니메이션 오프셋 계산 훅
  const { preCalculatedAnimationOffsets, ANIMATION_FRAMES } = useAnimationCalculation();

  // 충돌 감지 훅
  const { updateCollisionGrid } = useCollisionDetection({
    logicalSpatialGridRef,
    obstaclesRef,
    npcsRef,
    protagonistRef,
  });

  // 월드 데이터 관리 훅 — 연속 월드는 셀 크기=월드 px (P1-3)
  const { worldData, updateWorldData } = useWorldData({
    stageDataRef,
    protagonistRef,
    userSize,
    npcSize,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
  });

  // 글로벌 NPC 데이터 훅
  const globalNpcData = useGlobalNpcData({
    npcs,
    gridWidth: logicalWorld?.gridWidth ?? 0,
    gridHeight: logicalWorld?.gridHeight ?? 0,
    logicalUnitsPerTile: logicalWorld?.logicalUnitsPerTile ?? 0,
  });

  // 프로타고니스트 업데이트 훅
  const { updateProtagonistTexture, updateProtagonistName } = useProtagonistUpdate({
    protagonistRef,
    texturesRef,
    userSize,
  });

  // 스테이지 화자 선택 로직
  const pickStageSpeaker = React.useCallback((): IExtendedNpcData | null => {
    // 스테이지에 올라간 NPC 후보 추출
    const candidates = npcsRef.current
      .map((s) => ({ sprite: s, data: resolveCharacterData(s) }))
      .filter((it) => !!it.data) as { sprite: NpcSpriteType; data: IExtendedNpcData }[];

    if (candidates.length === 0) return null;

    // 주인공과 가장 가까운 NPC
    const p = protagonistRef.current;
    if (p) {
      let best = { d2: Number.POSITIVE_INFINITY, data: candidates[0].data };
      for (const it of candidates) {
        const dx = it.sprite.x - p.x;
        const dy = it.sprite.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best.d2) best = { d2, data: it.data };
      }
      return best.data;
    }

    // 4) 그 외엔 첫 번째
    return candidates[0].data;
  }, []);

  // 스테이지 사이즈: props 숫자가 바뀌면 우선 적용 — adjusting state during render 패턴으로 effect setState 회피
  const [trackedStageDims, setTrackedStageDims] = useState<{
    w: GameStageProps["stageWidth"];
    h: GameStageProps["stageHeight"];
  }>({ w: stageWidth, h: stageHeight });
  if (trackedStageDims.w !== stageWidth || trackedStageDims.h !== stageHeight) {
    setTrackedStageDims({ w: stageWidth, h: stageHeight });
    if (typeof stageWidth === "number" && typeof stageHeight === "number") {
      setStageSize({ width: stageWidth, height: stageHeight });
    }
  }

  // 스테이지 컨테이너 실측 → Pixi & 컨텍스트 동기화
  useEffect(() => {
    if (!containerRef.current) return;

    const applyResize = (w: number, h: number) => {
      // 1) state
      setStageSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));

      // 2) Pixi renderer
      if (appRef.current?.renderer) {
        try {
          appRef.current.renderer.resize(w, h);
        } catch (e) {
          logger.warn("renderer.resize 실패:", e);
        }
      }

      // 3) 캔버스 스타일 100% 강제
      configurePixiView(appRef.current);

      // 4) 컨텍스트 갱신 + 충돌 그리드 리빌드 요청
      dispatch({ type: "SET_STAGE_SIZE", payload: { width: w, height: h } });
      needsCollisionUpdate.current = true;
    };

    // width/height가 "auto"거나 미지정일 때 실측 사용
    const isAuto =
      stageWidth === "auto" ||
      stageHeight === "auto" ||
      typeof stageWidth !== "number" ||
      typeof stageHeight !== "number";

    if (isAuto) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        applyResize(Math.floor(rect.width), Math.floor(rect.height));
      }
    }

    // 리사이즈 감지
    const ro = new ResizeObserver((entries) => {
      if (!isAuto) return; // 숫자 지정 시 자동 리사이즈 비활성
      const entry = entries[0];
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      if (w > 0 && h > 0) applyResize(w, h);
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [dispatch, stageWidth, stageHeight]);

  // 캔버스 스타일 초기화 직후 보정
  useEffect(() => {
    configurePixiView(appRef.current);
  }, [isTexturesReady]);

  // 컴포넌트 마운트 후 커머스 모드면 초기 접촉 가드 활성화
  useEffect(() => {
    if (isCommerceUniverse) {
      armInitialContactGuard(GC.COMMERCE.INITIAL_CONTACT_BLOCK_MS);
    }
  }, [isCommerceUniverse, armInitialContactGuard]);

  // 텍스처 준비 완료 후 최초 1회 충돌 그리드 빌드 트리거
  useEffect(() => {
    if (isTexturesReady && currentStageContainerRef.current) {
      // 게임 루프에서 updateCollisionGrid()가 실행되도록 플래그 세팅
      needsCollisionUpdate.current = true;
      logger.log("GameStage: request initial collision grid build");
    }
  }, [isTexturesReady, currentStageContainerRef]);

  // 컴포넌트 마운트 시 컨텍스트 상태 초기화
  useEffect(() => {
    dispatch({
      type: "SET_STAGE_SIZE",
      payload: stageSize,
    });
  }, [stageSize, dispatch]);

  // isInitialized.current가 true로 변경되었을 때(초기화 완료) 콜백 호출
  useEffect(() => {
    if (!onInitialized) return;
    let done = false;
    let raf = 0;
    const tick = () => {
      if (isInitialized.current && !done) {
        done = true;
        onInitialized();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
    };
  }, [onInitialized]);

  // 별명 변경 이벤트 리스너
  useEffect(() => {
    const handleNicknameChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        characterId: string;
        newNickname?: string;
        universeId: string;
      }>;

      const { characterId, newNickname, universeId: eventUniverseId } = customEvent.detail;

      if (eventUniverseId !== universeInfo.id) return;

      // 주인공 이름 업데이트

      if (currentSelectedCharacter && currentSelectedCharacter.pid === characterId) {
        updateProtagonistName(newNickname);
      }

      // NPC 이름 업데이트 (현재 스테이지에 해당 NPC가 있는 경우)
      const targetNpc = npcsRef.current.find((npc) => npc.data?.persona?.pid === characterId);
      if (targetNpc) {
        const npcNameContainer = (targetNpc as NamedNpcSpriteType).nameContainer;
        if (npcNameContainer) {
          const nameText = npcNameContainer.children[0];
          if (nameText && nameText instanceof Text) {
            const originalName = targetNpc.data?.persona?.name || "";
            const displayName = newNickname || originalName;
            nameText.text = displayName;
            logger.log(`🔄 NPC 이름 실시간 업데이트: ${displayName}`);
          }
        }
      }
    };

    window.addEventListener("nicknameChanged", handleNicknameChanged as EventListener); // 이벤트 리스너 등록
    return () => {
      window.removeEventListener("nicknameChanged", handleNicknameChanged as EventListener);
    };
  }, [universeInfo.id, updateProtagonistName, currentSelectedCharacter]);

  // 부모 컴포넌트에 메서드 노출
  useImperativeHandle(ref, () => ({
    updateProtagonist: updateProtagonistTexture,
  }));

  // 글로벌 NPC 데이터를 ref로 동기화
  useEffect(() => {
    globalNpcDataRef.current = globalNpcData;
  }, [globalNpcData]);

  const createStageContainer = useCreateStageContainer({
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    stageDataRef,
    globalNpcDataRef,
    npcsRef,
    obstaclesRef,
    texturesRef,
    blocks,
    npcSize,
    logicalSpatialGridRef,
    onGridChanged: () => {
      // 컨테이너/오브젝트 준비 완료 시 즉시 런타임 그리드 빌드
      updateCollisionGrid({ force: true });
      logger.log("GameStage: collision grid rebuilt (onGridChanged)");

      // 커머스 모드 초기 1회 한정 - 그리드 준비 직후 가드 재장전으로 초기 로딩/프리로드 지연 동안 가드 시간이 소진되는 문제 방지
      if (isCommerceUniverse && !isInitialized.current) {
        armInitialContactGuard(GC.COMMERCE.INITIAL_CONTACT_BLOCK_MS);
        logger.log("GameStage: re-armed initial contact guard after grid ready");
      }
    },
  });

  // NPC 상호작용 훅
  const npcInteraction = useNpcInteraction({
    protagonistRef,
    protagonistBaseYRef,
    texturesRef,
    userSize,
    npcSize,
    onNpcAction,
  });

  // NPC 움직임 훅 — 게임 루프에서 최신 ref.current를 읽기 위해 ref 자체를 전달
  useNpcMovement({
    npcsRef,
    movementStep: GC.MOVEMENT_STEPS.DEFAULT,
    protagonistRef,
    logicalSpatialGridRef,
    stageDataRef,
    texturesRef,
  });

  // 리팩토링된 텍스처 초기화 훅
  const { preloadTextures, loadingStatus } = useTextureInit({
    user,
    npcs,
    blocks,
  });

  const loadKey = useMemo(() => {
    const userPaths = hasSpriteSheet(user.sprite) ? [user.sprite.url] : [];
    const npcDefaults = npcs
      .map((n) => (hasSpriteSheet(n.persona?.sprite) ? n.persona.sprite.url : null))
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const blockPaths = blocks.map((block) => block.path).filter(Boolean);

    return [...new Set([...userPaths, ...npcDefaults, ...blockPaths])].sort().join("|");
  }, [user, npcs, blocks]);

  // loadKey가 바뀌면 텍스처 로딩 플래그 리셋 — adjusting state during render 패턴
  const [trackedLoadKey, setTrackedLoadKey] = useState(loadKey);
  if (trackedLoadKey !== loadKey) {
    setTrackedLoadKey(loadKey);
    setIsTexturesReady(false);
  }

  // 텍스처 초기화
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        await preloadTextures(); // 반환값 사용 X
        if (mounted) {
          setIsTexturesReady(true);
        }
      } catch (e) {
        logger.error("텍스처 초기화 오류:", e);
      }
    };
    if (!isTexturesReady) init();
    return () => {
      mounted = false;
    };
  }, [preloadTextures, isTexturesReady]);

  // stageDoc 준비 여부 (store에 stageGlobalMetaData가 올라온 뒤에만 init 허용)
  const stageDocReady = useGameStore((s) => Boolean(s.stageGlobalMetaData));

  // GameInit 훅
  useGameInit({
    stageDocReady,
    logicalSpatialGridRef,
    containerRef,
    appRef,
    isInitialized,
    stageSize,
    user,
    userSize,
    texturesRef,
    protagonistRef,
    protagonistBaseYRef,
    globalNpcDataRef,
    stageDataRef,
    currentStageContainerRef,
    createStageContainer,
    globalNpcData,
    updateWorldData,
    updateCollisionGrid,
    // 텍스처 프리로드 결과를 그대로 반환해야 useGameInit이 초기화를 진행한다.
    // 이전 wrapper는 로드만 하고 return null이라 useGameInit이 항상 null을 받아 게임 초기화가 중단됐다(P3 런타임 검증에서 확인).
    preloadTextures,
    onInitializationStateChange: setInitializationState,
  });

  useIsometricPointerPicking({
    appRef,
    stageDataRef,
    enabled: initializationState.runtimeReady === true,
  });

  // 게임 루프 훅
  const { setKeyboardDirection } = useGameLoop({
    step,
    stageSize,
    userSize,
    npcSize,

    protagonistRef,
    protagonistBaseYRef,
    npcsRef,
    texturesRef,
    logicalSpatialGridRef,
    obstaclesRef,
    stageDataRef,
    isResizingRef,
    needsMapUpdateRef,
    needsCollisionUpdate,
    currentStageContainerRef,
    appRef,

    updateCollisionGrid,
    updateWorldData,
    npcInteraction,
    preCalculatedAnimationOffsets,
    ANIMATION_FRAMES,
  });

  // 첫 조작 시 초기 접촉 가드 해제
  const onKeyboardDirectionChange = useCallback(
    (dir: DirectionType) => {
      if (lastInputDiagnosticDirectionRef.current !== dir) {
        lastInputDiagnosticDirectionRef.current = dir;
        logger.log("[GameStage][input-direction]", {
          direction: dir,
          contextInitialized: gameContextState.isInitialized,
          runtimeReady: initializationState.runtimeReady === true,
          appReady: Boolean(appRef.current && !appRef.current.stage.destroyed),
          stageContainerReady: Boolean(
            currentStageContainerRef.current && !currentStageContainerRef.current.destroyed,
          ),
          protagonistReady: Boolean(protagonistRef.current && !protagonistRef.current.destroyed),
          protagonistBaseYReady: protagonistBaseYRef.current !== null,
          isInputLocked,
          inputLockReason: inputLockReason || null,
          isActionOpen,
          productDialogOpen: productConfirmOpen || productDetailOpen,
          stageTransitionActive,
          nativeV2Runtime: isIsometricStage,
        });
      }

      // 방향이 실제로 들어온 경우 한 번만 가드 해제
      if (dir) {
        clearInitialContactGuard();
        onFirstMove?.();
      }
      setKeyboardDirection(dir);
    },
    [
      setKeyboardDirection,
      clearInitialContactGuard,
      onFirstMove,
      gameContextState.isInitialized,
      initializationState.runtimeReady,
      isInputLocked,
      inputLockReason,
      isActionOpen,
      productConfirmOpen,
      productDetailOpen,
      stageTransitionActive,
      isIsometricStage,
    ],
  );

  // 일반 드래그는 캐릭터 이동, Space/토글 드래그는 스테이지 수동 패닝
  const {
    isStagePanModeEnabled,
    isPanning,
    toggleStagePanMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
  } = useStageMouseDrag({
    appRef,
    currentStageContainerRef,
    onDirectionChange: onKeyboardDirectionChange,
  });

  // 텍스처 로딩 진행 상태를 표시하는 로딩 컴포넌트
  const LoadingIndicator = useMemo(() => {
    if (!isTexturesReady && loadingStatus.total > 0) {
      return (
        <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col items-center justify-center z-50">
          <div className="text-xl font-bold mb-4">{`${lang({ ko: "게임 로딩 중...", en: "Game loading..." })}`}</div>
          <div className="w-64 h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-blue-cyan-tr transition-all"
              style={{ width: `${loadingStatus.progress}%` }}
            ></div>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            {loadingStatus.loaded}/{loadingStatus.total} {`${lang({ ko: "로드됨", en: "loaded" })}`} (
            {loadingStatus.progress}%)
          </div>
          {loadingStatus.failed > 0 && (
            <div className="mt-1 text-sm text-red-500">{`${lang({
              ko: `${loadingStatus.failed}개 리소스 로드 실패`,
              en: `Failed to load ${loadingStatus.failed} resources`,
            })}`}</div>
          )}
        </div>
      );
    }
    return null;
  }, [isTexturesReady, loadingStatus]);

  // 스타일 객체들 메모이제이션
  const containerStyle = useMemo(
    () => ({
      position: "relative" as const,
      width: "100%",
      height: "100%",
      margin: "0 auto",
      border: "1px solid #000",
      overflow: "hidden",
    }),
    [],
  );

  const innerContainerStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    }),
    [],
  );

  const joypadStyle = useMemo(
    () => ({
      position: "absolute" as const,
      bottom: GC.UI.JOYPAD_POSITION.BOTTOM,
      left: GC.UI.JOYPAD_POSITION.LEFT,
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      zIndex: 10,
    }),
    [],
  );

  // NPC를 스테이지에 추가하는 함수
  const addNpcToStage = useCallback(
    async (npcData: IGlobalNpcData): Promise<boolean> => {
      if (!currentStageContainerRef.current) return false;

      const npcInfo = npcData.info;
      const persona: IExtendedNpcData = npcInfo.persona;
      const npcKey = npcInfo.id || persona.pid;
      const logicalPosition = npcData.logicalPosition ?? npcInfo.logicalPosition;
      const runtime = resolveIsometricMovementRuntime(Object.values(stageDataRef.current)[0]);
      if (!logicalPosition || !runtime) {
        logger.error("v2 NPC 소환에는 logicalPosition과 stage runtime이 필요합니다.", { npcKey });
        return false;
      }
      const screen = projectLogicalPosition(logicalPosition, runtime);
      const finalX = screen.screenX;
      const finalY = screen.screenY;

      // 현재 4방향 아이소 기준 idleDirection을 우선 사용
      const initialDir: DirectionBaseType = getSpriteIdleDirection(persona.sprite);

      if (!hasSpriteSheet(persona.sprite)) {
        logger.error("NPC 텍스처 경로를 찾을 수 없음:", {
          npcKey,
          persona,
        });
        return false;
      }

      let texture: Texture | null = null;
      try {
        let directionTextures = texturesRef.current?.npcs?.get(persona.pid || npcKey)?.sprite;
        if (!directionTextures) {
          directionTextures = await buildDirectionTexturesFromSprite(persona.sprite, true);
          if (texturesRef.current) {
            const nextMap = new Map(texturesRef.current.npcs);
            nextMap.set(persona.pid || npcKey, { sprite: directionTextures });
            texturesRef.current = { ...texturesRef.current, npcs: nextMap };
          }
        }
        texture = pickDirectionTexture(directionTextures, initialDir, 0);
      } catch (e) {
        logger.error("NPC 텍스처 로드 실패:", { e, npcKey });
        return false;
      }

      if (!texture) {
        logger.error("NPC 텍스처 로드 실패: Texture가 null입니다.", { npcKey });
        return false;
      }

      // persona 기반으로 이름/behavior 사용
      const npcSprite = new Sprite(texture) as NpcSpriteType;
      npcSprite.width = npcSize;
      npcSprite.height = npcSize;
      npcSprite.anchor.set(0.5, 1);
      npcSprite.x = finalX;
      npcSprite.y = finalY;
      npcSprite.label = npcKey;
      npcSprite.data = { ...npcInfo, logicalPosition };
      npcSprite.zIndex = GC.STAGE.Z_INDEX.NPC;
      npcSprite.currentDirection = initialDir;
      npcSprite.__logicalPosition = logicalPosition;
      npcSprite.__logicalCollision = createLogicalEntityRect(
        logicalPosition,
        CHARACTER_FOOTPRINT_TILES,
        runtime.logicalUnitsPerTile,
        npcKey,
      );
      npcSprite.__logicalCollision.type = "npc";
      npcSprite.__isoDepthKey = createCharacterDepthKey(npcKey, logicalPosition, runtime);

      // 캐릭터 데이터 추출
      const characterData = resolveCharacterData(npcInfo);

      if (!characterData || !characterData.name) {
        logger.warn("유효하지 않은 캐릭터 데이터:", { npcInfo, characterData });
        return false;
      }

      // 공통 유틸로 이름 컨테이너 생성
      const npcDisplayName = getDisplayName(characterData);
      const nameContainer = createCharacterNameContainer({
        stageContainer: currentStageContainerRef.current,
        label: `${npcKey}-name`,
        name: npcDisplayName,
        x: finalX,
        y: finalY,
        size: npcSize,
        color: GC.UI.NPC_TEXT_COLOR,
      });

      (npcSprite as NamedNpcSpriteType).nameContainer = nameContainer;
      logicalSpatialGridRef.current.upsert(npcSprite.__logicalCollision);

      // 스테이지에 추가
      currentStageContainerRef.current.addChild(npcSprite);

      // npcsRef에 추가하여 useNpcMovement 훅에서 관리되도록 함
      npcsRef.current.push(npcSprite);

      // 중요 이벤트 직후는 쓰로틀 없이 강제 리빌드 (스냅샷 지연 방지)
      updateCollisionGrid({ force: true });

      // 새로운 NPC가 추가되었음을 알리는 커스텀 이벤트 발생
      window.dispatchEvent(
        new CustomEvent("npcAdded", {
          detail: {
            npcSprite,
            npcCount: npcsRef.current.length,
          },
        }),
      );

      logger.log("NPC 소환 완료 - 상태 기계 초기화 대기:", npcKey);
      return true;
    },
    [getDisplayName, logicalSpatialGridRef, npcSize, stageDataRef, updateCollisionGrid],
  );

  // NPC 소환 이벤트 리스너
  useEffect(() => {
    const handleSummonNpc = async (event: Event) => {
      if (!appRef.current || !currentStageContainerRef.current) return;

      const customEvent = event as CustomEvent<{ npcData: IGlobalNpcData }>;
      const { npcData } = customEvent.detail;
      logger.log("GameStage: NPC 소환 이벤트 수신:", npcData);

      try {
        // 새 NPC 스프라이트 생성 & 스테이지에 추가
        const ok = await addNpcToStage(npcData);
        if (!ok) return;

        // 글로벌 NPC 데이터 ref 및 스토어 동기화
        const current = globalNpcDataRef.current || [];
        const exists = current.some((n) => n.id === npcData.id);

        const nextGlobalNpcs = exists ? current.map((n) => (n.id === npcData.id ? npcData : n)) : [...current, npcData];
        globalNpcDataRef.current = nextGlobalNpcs;

        setNpcs(nextGlobalNpcs); // store.npcs도 항상 동일한 스냅샷을 유지하도록 업데이트

        const speaker = pickStageSpeaker();
        setStageChatSpeaker(speaker || null);

        logger.log("GameStage: NPC 소환 완료 (store.npcs 동기화 완료)");
      } catch (error) {
        logger.error("GameStage: NPC 소환 실패:", error);
      }
    };

    window.addEventListener("summonNpc", handleSummonNpc as EventListener);
    return () => {
      window.removeEventListener("summonNpc", handleSummonNpc as EventListener);
    };
  }, [addNpcToStage, updateCollisionGrid, pickStageSpeaker, setStageChatSpeaker, setNpcs]);

  // 캐릭터 ↔ 상품 접촉 감지 (커머스 전용 로직)
  useCommerceProductContact({
    enabled: isCommerceUniverse,
    protagonistRef,
    obstaclesRef,
    userSize,
    productDetailOpen,
    productConfirmOpen,
    askOpenProduct,
    pickStageSpeaker,
    setStageChatSpeaker,
  });

  // 준비 전에는 캔버스/스테이지 생성 방지 (hydration mismatch 예방)
  if (!ready || !stageDocReady) {
    return (
      <Preloader
        variant="spin"
        size="lg"
        container
        fullScreen
        text={lang({ ko: "스테이지 로드 중...", en: "Loading stage..." })}
      />
    );
  }

  // 로고 스타일 속성들
  const brandingCfg = toUnknownRecord(toUnknownRecord(universeInfo.typeSpecific).branding);
  const logoTextStyleCfg = toUnknownRecord(brandingCfg.logoTextStyle);
  const uiLogoColor = String(logoTextStyleCfg.color || "");
  const uiLogoShadow = String(logoTextStyleCfg.shadow || "");

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div
        data-game-camera-mode={cameraMode}
        data-game-stage-pan-enabled={isStagePanModeEnabled ? "true" : "false"}
        data-game-initialized={gameContextState.isInitialized ? "true" : "false"}
        data-game-initialization-phase={initializationState.phase}
        data-game-initialization-error={initializationState.error || ""}
        data-game-runtime-ready={initializationState.runtimeReady ? "true" : "false"}
        data-game-runtime-generation={initializationState.generation ?? 0}
        data-game-protagonist-id={currentSelectedCharacter?.pid || ""}
        data-game-direction-count={currentSelectedCharacter?.sprite?.directionCount || 8}
        data-game-input-locked={isInputLocked ? "true" : "false"}
        data-game-input-lock-reason={inputLockReason || ""}
        data-game-action-open={isActionOpen ? "true" : "false"}
        data-game-product-dialog-open={productConfirmOpen || productDetailOpen ? "true" : "false"}
        data-game-transition-active={stageTransitionActive ? "true" : "false"}
        data-game-keyboard-direction={gameContextState.direction.keyboard || ""}
        data-game-coordinate-version={String(
          (stageGlobalMetaData as Partial<IStageDoc> | null)?.coordinateContractVersion ?? "",
        )}
        data-game-release-status={
          (stageGlobalMetaData as Partial<IStageDoc> | null)?.releaseDeployment?.status ?? "unversioned"
        }
        data-game-manifest-version={
          (stageGlobalMetaData as Partial<IStageDoc> | null)?.releaseDeployment?.manifestVersion ?? ""
        }
        style={{
          ...containerStyle,
          cursor: isPanning ? "grabbing" : isStagePanModeEnabled ? "grab" : "default",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
      >
        {/* 로딩 인디케이터 */}
        {LoadingIndicator}

        <div ref={containerRef} style={innerContainerStyle} />

        {initializationState.runtimeReady && (
          <StageNavigationControls
            isPanModeEnabled={isStagePanModeEnabled}
            onTogglePanMode={toggleStagePanMode}
          />
        )}

        {initializationState.phase === "failed" && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 text-white">
            <div className="max-w-md rounded-2xl border border-white/20 bg-neutral-950/95 p-6 text-center shadow-2xl">
              <h2 className="text-lg font-semibold">
                {lang({ ko: "게임 화면을 초기화하지 못했습니다.", en: "Could not initialize the game." })}
              </h2>
              <p className="mt-2 text-sm text-neutral-300">
                {lang({
                  ko: "에셋 또는 브라우저 실행 환경을 확인한 뒤 다시 시도해 주세요.",
                  en: "Check the assets and browser environment, then try again.",
                })}
              </p>
              <code className="mt-3 block break-all rounded bg-white/10 px-3 py-2 text-xs text-neutral-300">
                {initializationState.error || "game_initialization_failed"}
              </code>
              <button
                type="button"
                className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
                onClick={() => window.location.reload()}
              >
                {lang({ ko: "다시 시도", en: "Try again" })}
              </button>
            </div>
          </div>
        )}

        {/* 커머스 로고 */}
        {isCommerceUniverse && (
          <div
            className={cn(
              "absolute z-50",
              "left-6 top-6",
            )}
          >
            {universeInfo.logo ? (
              <ImageBox src={universeInfo.logo} alt={universeInfo.name} width={180} objectPosition="object-top" />
            ) : (
              <h1
                className="font-bold leading-none tracking-tight text-2xl"
                style={{ color: uiLogoColor, textShadow: uiLogoShadow }}
              >
                {universeInfo.name}
              </h1>
            )}
          </div>
        )}

        {/* Joypad 컴포넌트 */}
        <Joypad onKeyboardDirectionChange={onKeyboardDirectionChange} style={joypadStyle} />
      </div>

      {/* StageMap 컴포넌트 */}
      <StageMap
        worldData={worldData}
        stageDoc={stageGlobalMetaData as unknown as IStageDoc | null}
      />

      {/* 게임 아이템 박스 */}
      {!isCommerceUniverse && <GameItemBox />}

      {/* 게임 컨트롤 박스 */}
      <GameControlBox />

      {/* NPC 상호작용 UI */}
      <InteractionController onNpcTalkStart={onNpcTalkStart} />

      {/* 전환 페이드 전용 오버레이 */}
      <StageTransitionOverlay />
    </div>
  );
});

export default GameStage;
