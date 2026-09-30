import { useEffect, useRef } from "react";
import { Application, Sprite, Container } from "pixi.js";
import type { NpcSpriteType, ITextureRefs, IExtendedNpcData, IGlobalNpcData, IStageData } from "types/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import {
  SpatialGrid,
  getSpriteRatio,
  calculateSpriteSize,
  createCharacterNameContainer,
  getSpriteIdleDirection,
  pickDirectionTexture,
  CHARACTER_FOOTPRINT_TILES,
  createLogicalEntityRect,
  getIsometricCameraConstraints,
  projectLogicalPosition,
  resolveIsometricMovementRuntime,
  resolveIsometricViewportRuntime,
} from "utils/game";
import { logger } from "utils/log";
import { useGameStore, useGameCharacterStore } from "store/game";
import { useGameContext } from "contexts/GameContext";
import { useNicknameManager } from "../input";
import { useUniverseData } from "./useUniverseData";

/**
 * @docHint
 * @purpose useGameInit 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-core
 * @scope stage
 */

interface UseGameInitProps {
  stageDocReady: boolean;

  containerRef: React.RefObject<HTMLDivElement | null>;
  appRef: React.RefObject<Application | null>;
  isInitialized: React.RefObject<boolean>;
  stageSize: { width: number; height: number };

  user: IExtendedNpcData;
  userSize: number;

  texturesRef: React.RefObject<ITextureRefs>;
  protagonistRef: React.RefObject<NpcSpriteType | null>;
  protagonistBaseYRef: React.RefObject<number | null>;

  globalNpcDataRef: React.RefObject<IGlobalNpcData[]>;
  stageDataRef: React.RefObject<Record<string, IStageData>>;
  currentStageContainerRef: React.RefObject<Container | null>;
  createStageContainer: () => Container;

  globalNpcData: IGlobalNpcData[];

  updateWorldData: () => void;
  updateCollisionGrid: () => void;

  preloadTextures: () => Promise<ITextureRefs | null>;

  logicalSpatialGridRef: React.RefObject<SpatialGrid>;
  onInitializationStateChange?: (state: {
    phase: "initializing" | "ready" | "failed";
    error?: string;
    runtimeReady?: boolean;
    generation?: number;
  }) => void;
}

interface OwnedPixiRuntime {
  generation: number;
  app: Application;
  stageContainer: Container | null;
  protagonist: NpcSpriteType | null;
}

function destroyPixiApplication(app: Application) {
  try {
    app.stop();
    app.ticker?.stop();
  } catch {}
  try {
    app.destroy(true, { children: true });
  } catch {}
}

export function useGameInit({
  stageDocReady,
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
  preloadTextures,
  logicalSpatialGridRef,
  onInitializationStateChange,
}: UseGameInitProps) {
  const { dispatch } = useGameContext();
  const setNpcs = useGameStore((state) => state.setNpcs);
  const setTextures = useGameStore((state) => state.setTextures);

  const setCameraViewSize = useGameStore((state) => state.setCameraViewSize);
  const setCameraBoundaryMode = useGameStore((state) => state.setCameraBoundaryMode);
  const setCameraConstraints = useGameStore((state) => state.setCameraConstraints);
  const focusCameraOn = useGameStore((state) => state.focusCameraOn);
  const attachCameraToProtagonist = useGameStore((state) => state.attachCameraToProtagonist);

  const { getDisplayName } = useNicknameManager();
  const { universeId } = useUniverseData();

  const gameCharacterStore = useGameCharacterStore.getState();
  const selectedCharacter = gameCharacterStore.selectedCharacter;

  // StrictMode의 폐기된 마운트와 실제 언마운트만 식별한다.
  // init effect의 의존성 변경은 정상 렌더 수명 안에서 발생하므로 초기화를 취소하지 않는다.
  const lifecycleGenerationRef = useRef(0);
  const ownedRuntimeRef = useRef<OwnedPixiRuntime | null>(null);
  useEffect(() => {
    const generation = ++lifecycleGenerationRef.current;
    return () => {
      if (lifecycleGenerationRef.current === generation) {
        lifecycleGenerationRef.current += 1;
      }
    };
  }, []);

  useEffect(() => {
    // stageDoc 준비 전에는 init 자체를 막음("빈 stageData 캐시" 사고 방지)
    if (!stageDocReady) return;
    if (!containerRef.current || isInitialized.current || appRef.current) return;
    const lifecycleGeneration = lifecycleGenerationRef.current;
    onInitializationStateChange?.({
      phase: "initializing",
      runtimeReady: false,
      generation: lifecycleGeneration,
    });

    // 텍스처 프리로드를 먼저 걸어둠
    const initTexturesPromise = preloadTextures();

    const initPixi = async (): Promise<void> => {
      const appWidth = stageSize.width;
      const appHeight = stageSize.height;

      const app = new Application();
      await app.init({
        width: appWidth,
        height: appHeight,
        backgroundColor: GC.UI.BACKGROUND_COLOR,
        antialias: true,
        autoStart: false,
        hello: false,
      });

      if (lifecycleGenerationRef.current !== lifecycleGeneration) {
        destroyPixiApplication(app);
        return;
      }

      if (!containerRef.current) {
        logger.error("Container reference is null after app initialization");
        destroyPixiApplication(app);
        return;
      }

      // 이중 init 방어: app.init(await) 사이에 다른 initPixi가 앱을 세웠으면 이 앱은 폐기 (canvas 중복 방지)
      if (appRef.current) {
        destroyPixiApplication(app);
        return;
      }

      // GameStage의 configurePixiView 정책 동기화 (리사이즈/웹뷰 대응)
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      app.canvas.style.display = "block";
      app.canvas.style.touchAction = "none";
      appRef.current = app;
      ownedRuntimeRef.current = {
        generation: lifecycleGeneration,
        app,
        stageContainer: null,
        protagonist: null,
      };
      // 컨테이너에 남은 이전 canvas 제거 후 부착 (재마운트 잔여 방지)
      while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);
      containerRef.current.appendChild(app.canvas);

      try {
        const textureData = await initTexturesPromise;
        if (
          lifecycleGenerationRef.current !== lifecycleGeneration ||
          appRef.current !== app ||
          !app.stage ||
          app.stage.destroyed
        ) {
          if (appRef.current === app) appRef.current = null;
          if (ownedRuntimeRef.current?.app === app) ownedRuntimeRef.current = null;
          if (app.stage && !app.stage.destroyed) {
            destroyPixiApplication(app);
          }
          return;
        }
        if (!textureData) {
          throw new Error("texture_initialization_failed");
        }

        texturesRef.current = textureData;
        setTextures(textureData);

        const protagonistSprite = textureData.protagonist?.sprite;
        const initialDirection = getSpriteIdleDirection(user.sprite);
        const baseProtagonistTexture = pickDirectionTexture(protagonistSprite, initialDirection, 0);

        if (!baseProtagonistTexture) {
          throw new Error("protagonist_texture_unavailable");
        }

        // 글로벌 NPC 데이터는 store/ref에 동기화
        globalNpcDataRef.current = globalNpcData;
        setNpcs(globalNpcData);

        // 초기 스테이지 컨테이너 생성
        // - stageData는 createStageContainer 내부에서 stageDoc 기반 resolve 후 stageDataRef에 캐시
        const stageKey = "active";
        const stageContainer = createStageContainer();
        app.stage.addChild(stageContainer);
        currentStageContainerRef.current = stageContainer;
        if (ownedRuntimeRef.current?.app === app) {
          ownedRuntimeRef.current.stageContainer = stageContainer;
        }

        // stageData 존재 확인 (없으면 stageDoc가 비정상/미구현)
        const stageData = stageDataRef.current?.[stageKey];
        if (!stageData) {
          logger.error("[useGameInit] stageDataRef에 stageData가 없습니다. stageDoc resolve를 확인하세요.", {
            stageKey,
          });
          throw new Error("stage_data_unavailable");
        }

        const logicalGrid = logicalSpatialGridRef.current;
        if (!logicalGrid) throw new Error("logical_spatial_grid_unavailable");
        const movementRuntime = resolveIsometricMovementRuntime(stageData);
        const viewportRuntime = resolveIsometricViewportRuntime(stageData);
        if (!movementRuntime || !viewportRuntime) throw new Error("stage_v2_runtime_unavailable");
        setCameraBoundaryMode("finite-hard");
        setCameraConstraints(getIsometricCameraConstraints(viewportRuntime));

        // 주인공 스프라이트 생성/배치
        const spriteRatio = getSpriteRatio(universeId);
        const protagonistSize = calculateSpriteSize(userSize, spriteRatio);

        const protagonist = new Sprite(baseProtagonistTexture) as NpcSpriteType;
        protagonist.width = protagonistSize.width;
        protagonist.height = protagonistSize.height;
        protagonist.zIndex = GC.STAGE.Z_INDEX.NPC;

        let logicalPosition = {
          worldX: (movementRuntime.gridWidth / 2) * movementRuntime.logicalUnitsPerTile,
          worldY: (movementRuntime.gridHeight / 2) * movementRuntime.logicalUnitsPerTile,
        };
        let logicalRect = createLogicalEntityRect(
          logicalPosition,
          CHARACTER_FOOTPRINT_TILES,
          movementRuntime.logicalUnitsPerTile,
          "__protagonist__",
        );
        if (logicalGrid.checkCollision(logicalRect, (obj) => obj.id !== "__protagonist__")) {
          let found = false;
          for (let gridY = 0; gridY < movementRuntime.gridHeight && !found; gridY += 1) {
            for (let gridX = 0; gridX < movementRuntime.gridWidth; gridX += 1) {
              const candidate = {
                worldX: gridX * movementRuntime.logicalUnitsPerTile,
                worldY: gridY * movementRuntime.logicalUnitsPerTile,
              };
              const candidateRect = createLogicalEntityRect(
                candidate,
                CHARACTER_FOOTPRINT_TILES,
                movementRuntime.logicalUnitsPerTile,
                "__protagonist__",
              );
              if (!logicalGrid.checkCollision(candidateRect, (obj) => obj.id !== "__protagonist__")) {
                logicalPosition = candidate;
                logicalRect = candidateRect;
                found = true;
                break;
              }
            }
          }
          if (!found) throw new Error("protagonist_spawn_unavailable");
        }
        const screenPosition = projectLogicalPosition(logicalPosition, movementRuntime);
        const protagonistX = screenPosition.screenX;
        const protagonistY = screenPosition.screenY;
        protagonist.anchor.set(0.5, 1);
        protagonist.__logicalPosition = logicalPosition;
        protagonist.__logicalCollision = logicalRect;

        protagonist.x = protagonistX;
        protagonist.y = protagonistY;
        protagonist.currentDirection = initialDirection;
        protagonist.data = {
          persona: user,
          direction: initialDirection,
          displayName: selectedCharacter?.name || user.name,
          logicalPosition,
        };
        protagonist.label = "protagonist";

        stageContainer.addChild(protagonist);
        protagonistRef.current = protagonist;
        protagonistBaseYRef.current = protagonistY;
        if (ownedRuntimeRef.current?.app === app) {
          ownedRuntimeRef.current.protagonist = protagonist;
        }

        // 공유 그리드에 주인공 등록
        logicalGrid.upsert(protagonist.__logicalCollision);

        // 이름 라벨
        if (selectedCharacter?.name) {
          const protagonistDisplayName = getDisplayName(selectedCharacter);
          const nameContainer = createCharacterNameContainer({
            stageContainer,
            label: "protagonist-name",
            name: protagonistDisplayName,
            x: protagonistX,
            y: protagonistY,
            size: userSize,
            color: GC.UI.USER_TEXT_COLOR,
          });
          nameContainer.x = protagonistX;
          nameContainer.y = protagonistY + GC.INTERACTION.MESSAGE_OFFSET_Y;
          protagonist.nameContainer = nameContainer;
        }

        // 카메라 초기 포커스
        try {
          setCameraViewSize(stageSize.width, stageSize.height);
          attachCameraToProtagonist();
          focusCameraOn(protagonistX, protagonistY, { immediate: true, clampToConstraints: true });

          // 스폰 좌표를 store에 동기화 (P1-4) — 첫 이동 전에도 상호작용/UI가 올바른 주인공 좌표를 읽도록
          useGameStore.getState().setProtagonist(protagonistX, protagonistY, protagonistY, initialDirection);
        } catch (e) {
          logger.error("카메라 초기화 중 오류:", e);
        }

        updateWorldData();
        updateCollisionGrid();

        const runtimeReady =
          lifecycleGenerationRef.current === lifecycleGeneration &&
          appRef.current === app &&
          !app.stage.destroyed &&
          currentStageContainerRef.current === stageContainer &&
          !stageContainer.destroyed &&
          protagonistRef.current === protagonist &&
          !protagonist.destroyed &&
          protagonistBaseYRef.current !== null;

        if (!runtimeReady) {
          throw new Error("pixi_runtime_ownership_lost");
        }

        // Context ready는 Pixi app/stage/protagonist가 같은 generation으로 준비된 뒤에만 공개한다.
        app.start();
        isInitialized.current = true;
        dispatch({ type: "SET_INITIALIZED", payload: true });
        onInitializationStateChange?.({
          phase: "ready",
          runtimeReady: true,
          generation: lifecycleGeneration,
        });
      } catch (error) {
        logger.error("Error initializing game resources:", error);
        const failedRuntime = ownedRuntimeRef.current?.app === app ? ownedRuntimeRef.current : null;
        if (failedRuntime && currentStageContainerRef.current === failedRuntime.stageContainer) {
          currentStageContainerRef.current = null;
        }
        if (failedRuntime && protagonistRef.current === failedRuntime.protagonist) {
          protagonistRef.current = null;
          protagonistBaseYRef.current = null;
        }
        if (appRef.current === app) appRef.current = null;
        if (failedRuntime) ownedRuntimeRef.current = null;
        isInitialized.current = false;
        dispatch({ type: "SET_INITIALIZED", payload: false });
        destroyPixiApplication(app);
        if (lifecycleGenerationRef.current === lifecycleGeneration) {
          onInitializationStateChange?.({
            phase: "failed",
            error: error instanceof Error ? error.message : "game_initialization_failed",
            runtimeReady: false,
            generation: lifecycleGeneration,
          });
        }
      }
    };

    void initPixi().catch((error) => {
      logger.error("Error creating Pixi application:", error);
      if (lifecycleGenerationRef.current === lifecycleGeneration) {
        isInitialized.current = false;
        dispatch({ type: "SET_INITIALIZED", payload: false });
        onInitializationStateChange?.({
          phase: "failed",
          error: error instanceof Error ? error.message : "pixi_application_initialization_failed",
          runtimeReady: false,
          generation: lifecycleGeneration,
        });
      }
    });
    // 의존성 변경은 진행 중인 초기화를 유지한다.
    // 폐기된 StrictMode 마운트/실제 언마운트는 lifecycleGenerationRef 검증으로 차단한다.
  }, [
    stageDocReady,
    containerRef,
    appRef,
    isInitialized,
    stageSize.width,
    stageSize.height,
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
    preloadTextures,
    dispatch,
    setNpcs,
    setTextures,
    setCameraViewSize,
    setCameraBoundaryMode,
    setCameraConstraints,
    focusCameraOn,
    attachCameraToProtagonist,
    universeId,
    getDisplayName,
    selectedCharacter,
    logicalSpatialGridRef,
    onInitializationStateChange,
  ]);

  // 앱 파괴는 컴포넌트 unmount 시에만 — 텍스처/스테이지 identity 변경으로 인한
  // effect 재실행이 실행 중인 앱을 파괴하지 않도록 분리 (game-pixi 생성/해제 쌍 유지)
  useEffect(() => {
    return () => {
      const ownedRuntime = ownedRuntimeRef.current;
      if (!ownedRuntime) return;

      // 이전 Strict/Fast Refresh generation의 cleanup이 더 최신 runtime ref를
      // null로 덮어쓰지 않도록 자신이 생성한 객체와 identity가 같을 때만 해제한다.
      if (currentStageContainerRef.current === ownedRuntime.stageContainer) {
        currentStageContainerRef.current = null;
      }
      if (protagonistRef.current === ownedRuntime.protagonist) {
        protagonistRef.current = null;
        protagonistBaseYRef.current = null;
      }
      if (appRef.current === ownedRuntime.app) {
        destroyPixiApplication(ownedRuntime.app);
        appRef.current = null;
      }
      if (ownedRuntimeRef.current === ownedRuntime) {
        ownedRuntimeRef.current = null;
        isInitialized.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
