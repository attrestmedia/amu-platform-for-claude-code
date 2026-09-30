import { useEffect, useRef, useCallback } from "react";
import type {
  DirectionType,
  NpcSpriteType,
  ICameraState,
  ITextureRefs,
  IStageData,
} from "types/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import type { Application, Container } from "pixi.js";
import {
  SpatialGrid,
  calculateDirection8,
  CHARACTER_FOOTPRINT_TILES,
  NPC_INTERACTION_DISTANCE_TILES,
  assignStableIsometricZ,
  createCharacterDepthKey,
  createLogicalEntityRect,
  directionToScreenVector,
  logicalDistanceInTiles,
  projectLogicalPosition,
  getIsometricViewportGridBounds,
  getSoftLockCameraTarget,
  isIsometricGridFootprintVisible,
  resolveIsometricMovementRuntime,
  resolveIsometricViewportRuntime,
  resolveSweptLogicalMovement,
  screenVectorToLogicalDelta,
} from "utils/game";
import { logger } from "utils/log";
import { useGameStore, useUiControlStore } from "store/game";
import { useGameContext } from "contexts/GameContext";
import {
  applyProtagonistTextureFrame,
  getProtagonistAnimation,
  resolveProtagonistDirection,
} from "./gameLoopProtagonistAnimation";

/**
 * @docHint
 * @purpose useGameLoop 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-core
 * @scope stage
 */

function setContainerCameraOffset(
  container: Container | null | undefined,
  cameraX: number,
  cameraY: number,
) {
  if (!container || container.destroyed) return false;
  container.x = -cameraX;
  container.y = -cameraY;
  return true;
}

// 다른 경로(과거 drag 구현 등)가 남긴 잔여 오프셋 정리 — 이중 오프셋 방지 (ISO-5R)
function resetContainerCameraOffset(container: Container | null | undefined) {
  if (!container || container.destroyed) return;
  if (container.x !== 0 || container.y !== 0) {
    container.x = 0;
    container.y = 0;
  }
}

interface UseGameLoopProps {
  // 게임 설정 관련 속성
  step: number;
  stageSize: { width: number; height: number };
  userSize: number;
  npcSize: number;

  // DOM 요소 참조
  protagonistRef: React.RefObject<NpcSpriteType | null>;
  protagonistBaseYRef: React.RefObject<number | null>;
  npcsRef: React.RefObject<NpcSpriteType[]>;
  obstaclesRef: React.RefObject<NpcSpriteType[]>;
  texturesRef: React.RefObject<ITextureRefs>;
  logicalSpatialGridRef: React.RefObject<SpatialGrid>;
  stageDataRef: React.RefObject<Record<string, IStageData>>;
  isResizingRef: React.RefObject<boolean>;
  needsMapUpdateRef: React.RefObject<boolean>;
  needsCollisionUpdate: React.RefObject<boolean>;
  currentStageContainerRef: React.RefObject<Container | null>;
  appRef?: React.RefObject<Application | null>;

  // 게임 메커니즘 함수
  updateCollisionGrid: () => void;
  updateWorldData: () => void;
  npcInteraction: {
    handleNpcInteraction: (npc: NpcSpriteType, protagonistX?: number, protagonistY?: number) => void;
    removeNpcMessage: (npc: NpcSpriteType) => void;
  };

  // 애니메이션 관련 데이터
  preCalculatedAnimationOffsets: {
    walkingOffsets: number[];
    breathingOffsets: number[];
  };
  ANIMATION_FRAMES: number;

}

export function useGameLoop({
  step,
  stageSize,
  userSize,
  npcSize,
  protagonistRef,
  protagonistBaseYRef,
  npcsRef,
  obstaclesRef,
  texturesRef,
  logicalSpatialGridRef,
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
}: UseGameLoopProps) {
  // GameContext에서 상태 및 dispatch 가져오기
  const { state, dispatch } = useGameContext();

  // Zustand 스토어에서 주인공 위치 업데이트 함수 가져오기
  const setProtagonist = useGameStore((state) => state.setProtagonist);
  const setCameraState = useGameStore((state) => state.setCameraState);

  // 상품 다이얼로그 상태 체크
  const isProductDialogOpen = useUiControlStore((state) => state.productConfirmOpen || state.productDetailOpen);
  const isInputLocked = useUiControlStore((state) => state.isInputLocked);

  // 방향 상태 - 컨텍스트에서 가져옴
  const keyboardDirectionRef = useRef<DirectionType>(state.direction.keyboard);
  useEffect(() => {
    keyboardDirectionRef.current = state.direction.keyboard;
  }, [state.direction.keyboard]);

  const lastFrameTimeRef = useRef<number>(0); // 프레임 간 시간 저장
  const lastLoopErrorAtRef = useRef<number>(0); // RAF 오류 로그 폭주 방지
  const loopGenerationRef = useRef(0);
  const loopDependencySnapshotRef = useRef<Record<string, unknown> | null>(null);
  const updateCollisionGridRef = useRef(updateCollisionGrid);
  const updateWorldDataRef = useRef(updateWorldData);
  const npcInteractionRef = useRef(npcInteraction);

  useEffect(() => {
    updateCollisionGridRef.current = updateCollisionGrid;
    updateWorldDataRef.current = updateWorldData;
    npcInteractionRef.current = npcInteraction;
  }, [updateCollisionGrid, updateWorldData, npcInteraction]);

  const applyCameraOffset = useCallback(
    (cameraX: number, cameraY: number) => {
      const stageContainer = currentStageContainerRef?.current;
      if (setContainerCameraOffset(stageContainer, cameraX, cameraY)) {
        resetContainerCameraOffset(appRef?.current?.stage);
        return;
      }
      setContainerCameraOffset(appRef?.current?.stage, cameraX, cameraY);
    },
    [appRef, currentStageContainerRef],
  );

  // 카메라 팔로우 업데이트
  const updateCameraFollow = useCallback(
    (worldX: number, worldY: number, deltaMs: number) => {
      if (!appRef?.current) return;

      const { camera: prevCam } = useGameStore.getState();

      // 잠금/컷씬/프리 모드에서 카메라 이동 금지
      if (prevCam.isLocked || prevCam.mode === "locked" || prevCam.mode === "cutscene" || prevCam.mode === "free") {
        return;
      }

      const fallbackWidth = stageSize.width;
      const fallbackHeight = stageSize.height;

      const cam: ICameraState = {
        ...prevCam,
        width: Number.isFinite(prevCam.width) && prevCam.width > 0 ? prevCam.width : fallbackWidth,
        height: Number.isFinite(prevCam.height) && prevCam.height > 0 ? prevCam.height : fallbackHeight,
      };

      // 주인공 중심 기준 목표 지점
      const hasLogicalAnchor = protagonistRef.current?.__logicalPosition != null;
      const targetCenterX = worldX + (hasLogicalAnchor ? 0 : userSize / 2);
      const targetCenterY = worldY + (hasLogicalAnchor ? 0 : userSize / 2);

      // 소프트 락 경계를 넘은 거리만큼만 연속 추적한다. 중앙을 향한 보간을
      // 매번 재시작하지 않아 경계에서 캐릭터/스테이지가 떨리는 현상을 막는다.
      const targetCamera = getSoftLockCameraTarget(cam, { x: targetCenterX, y: targetCenterY });
      cam.targetX = targetCamera.x;
      cam.targetY = targetCamera.y;

      // delta 기반 lerp 보정
      const baseLerp = cam.lerpFactor > 0 && cam.lerpFactor < 1 ? cam.lerpFactor : 0.12;
      const baseDelta = 16.67; // 60fps 기준
      const ratio = Math.max(0, deltaMs) / baseDelta;
      const tRaw = 1 - Math.pow(1 - baseLerp, ratio || 1); // 프레임 레이트 보정
      const lerp = Number.isFinite(tRaw) ? Math.min(Math.max(tRaw, 0), 1) : baseLerp;

      if (cam.targetX != null) {
        cam.x += (cam.targetX - cam.x) * lerp;
      }
      if (cam.targetY != null) {
        cam.y += (cam.targetY - cam.y) * lerp;
      }

      // 1) 스토어 카메라 상태 갱신
      setCameraState(cam);

      // 2) 실제 월드 컨테이너 위치 갱신
      applyCameraOffset(cam.x, cam.y);
    },
    [
      appRef,
      setCameraState,
      stageSize.width,
      stageSize.height,
      userSize,
      applyCameraOffset,
      protagonistRef,
    ],
  );

  // 주인공의 월드 좌표 변환, 카메라 동기화 헬퍼
  const syncCameraToProtagonist = useCallback(
    (deltaMs: number) => {
      const protagonist = protagonistRef.current;
      const baseY = protagonistBaseYRef.current;
      if (!protagonist || protagonist.destroyed || baseY == null) return;

      updateCameraFollow(protagonist.x, baseY, deltaMs);
    },
    [protagonistRef, protagonistBaseYRef, updateCameraFollow],
  );

  // 방향 설정 함수 정의 - 컨텍스트 업데이트
  const setKeyboardDirection = useCallback(
    (direction: DirectionType) => {
      keyboardDirectionRef.current = direction;
      dispatch({ type: "SET_KEYBOARD_DIRECTION", payload: direction });
    },
    [dispatch],
  );

  // 프레임 관리를 위한 ref
  const frameCount = useRef<number>(0);
  const mapUpdateFrameCounter = useRef<number>(0);
  const collisionUpdateCounter = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);

  // worldData 업데이트 기준이 되는 "마지막 카메라 중심 좌표" 기록
  const lastWorldDataCameraCenterRef = useRef<{ x: number; y: number } | null>(null);

  // 메인 게임 루프 효과
  useEffect(() => {
    const loopGeneration = ++loopGenerationRef.current;
    const dependencySnapshot: Record<string, unknown> = {
      step,
      stageWidth: stageSize.width,
      stageHeight: stageSize.height,
      userSize,
      npcSize,
      preCalculatedAnimationOffsets,
      animationFrames: ANIMATION_FRAMES,
      setProtagonist,
      texturesRef,
      isProductDialogOpen,
      syncCameraToProtagonist,
      isInputLocked,
      appRef,
      currentStageContainerRef,
      applyCameraOffset,
      isResizingRef,
      needsCollisionUpdate,
      needsMapUpdateRef,
      npcsRef,
      obstaclesRef,
      protagonistBaseYRef,
      protagonistRef,
      logicalSpatialGridRef,
      stageDataRef,
    };
    const previousDependencySnapshot = loopDependencySnapshotRef.current;
    const changedDependencies = previousDependencySnapshot
      ? Object.keys(dependencySnapshot).filter(
          (key) => !Object.is(previousDependencySnapshot[key], dependencySnapshot[key]),
        )
      : ["initial-mount"];
    loopDependencySnapshotRef.current = dependencySnapshot;
    let animationFrameId: number;
    let cancelled = false;
    let lastMovementTime = performance.now();
    let lastMapUpdateTime = performance.now();
    let runtimeRecoveryLogged = false;
    let lastObservedDirection: DirectionType | "__unset" = "__unset";
    let lastMovementDiagnosticDirection: DirectionType | "__unset" = "__unset";

    logger.log("[useGameLoop][effect-start]", { loopGeneration, changedDependencies });

    const logMovementDiagnostic = (outcome: string, details: Record<string, unknown> = {}) => {
      const direction = keyboardDirectionRef.current;
      if (!direction || lastMovementDiagnosticDirection === direction) return;
      lastMovementDiagnosticDirection = direction;
      logger.log("[useGameLoop][movement-diagnostic]", {
        direction,
        outcome,
        ...details,
      });
    };

    function loop(now: number) {
      if (cancelled) return;
      try {
      const prevFrameTime = lastFrameTimeRef.current || now;
      const deltaMs = now - prevFrameTime || 16;
      lastFrameTimeRef.current = now;
      const keyboardDirection = keyboardDirectionRef.current;

      if (lastObservedDirection !== keyboardDirection) {
        lastObservedDirection = keyboardDirection;
        lastMovementDiagnosticDirection = "__unset";
        if (keyboardDirection) {
          const inputStoreSnapshot = useGameStore.getState();
          const activeStageData = Object.values(stageDataRef.current).find(
            (candidate) => resolveIsometricMovementRuntime(candidate) !== null,
          );
          logger.log("[useGameLoop][input-observed]", {
            direction: keyboardDirection,
            isInputLocked,
            isProductDialogOpen,
            stageTransitionActive: inputStoreSnapshot.stageTransition.active,
            isResizing: isResizingRef.current,
            appReady: Boolean(appRef?.current && !appRef.current.stage.destroyed),
            stageContainerReady: Boolean(
              currentStageContainerRef.current && !currentStageContainerRef.current.destroyed,
            ),
            protagonistReady: Boolean(protagonistRef.current && !protagonistRef.current.destroyed),
            protagonistBaseYReady: protagonistBaseYRef.current !== null,
            runtimeKind: resolveIsometricMovementRuntime(activeStageData) ? "isometric-v2" : "unavailable",
          });
        }
      }

      // 0) 스테이지 전환 연출이 진행 중이면
      // - 카메라 패닝 + 페이드 오버레이 + 주인공 숨쉬기만 처리하고 조기 종료
      const storeSnapshot = useGameStore.getState();
      const st = storeSnapshot.stageTransition;

      // Context ready와 Pixi ref가 일시적으로 분리된 경우 현재 stage가 소유한
      // label 기반 protagonist를 복구한다. init generation cleanup은 identity가
      // 일치하는 runtime만 해제하므로 최신 객체를 이전 cleanup이 지우지 못한다.
      const currentProtagonist = protagonistRef.current;
      if (!currentProtagonist || currentProtagonist.destroyed || protagonistBaseYRef.current === null) {
        const recovered = currentStageContainerRef.current?.getChildByLabel(
          "protagonist",
          true,
        ) as NpcSpriteType | null;

        if (recovered && !recovered.destroyed) {
          protagonistRef.current = recovered;
          const storedBaseY = storeSnapshot.protagonist.baseY;
          protagonistBaseYRef.current = Number.isFinite(storedBaseY) ? storedBaseY : recovered.y;

          if (!runtimeRecoveryLogged) {
            runtimeRecoveryLogged = true;
            logger.warn("[useGameLoop] protagonist runtime ref recovered from active stage");
          }
        }
      }

      if (st.active) {
        logMovementDiagnostic("blocked-stage-transition", {
          transitionType: st.type,
          transitionStartedAt: st.startedAt,
          transitionDurationMs: st.durationMs,
        });
        const transitionProtagonist = protagonistRef.current;
        const transitionBaseY = protagonistBaseYRef.current;
        // 주인공은 움직이지 않고 숨쉬기 애니메이션만
        if (transitionProtagonist && !transitionProtagonist.destroyed && transitionBaseY !== null) {
          const nowTime = now;
          if (nowTime - lastRenderTimeRef.current >= 16) {
            lastRenderTimeRef.current = nowTime;
            frameCount.current = (frameCount.current + 1) % 1000;
          }

          const { frameIndex, animationYOffset } = getProtagonistAnimation(
            preCalculatedAnimationOffsets,
            ANIMATION_FRAMES,
            frameCount.current,
            false, // 항상 idle
          );

          transitionProtagonist.y = transitionBaseY + animationYOffset;

          const idleDir = resolveProtagonistDirection(transitionProtagonist);

          applyProtagonistTextureFrame(texturesRef, idleDir, frameIndex, false, transitionProtagonist);
        }

        // 카메라 패닝 (from -> to)
        const duration = st.durationMs || GC.CAMERA.TRANSITION.DEFAULT_DURATION;
        const elapsed = now - st.startedAt || 0;
        const rawT = duration > 0 ? Math.min(Math.max(elapsed / duration, 0), 1) : 1;
        const t = rawT * rawT * (3 - 2 * rawT); // 부드러운 easeInOut

        const nextX = st.fromCameraX + (st.toCameraX - st.fromCameraX) * t;
        const nextY = st.fromCameraY + (st.toCameraY - st.fromCameraY) * t;

        storeSnapshot.setCameraPosition(nextX, nextY, { clampToConstraints: true });

        // 페이드 오버레이 알파 계산
        if (st.type === "fade" || st.type === "pan-and-fade") {
          const half = 0.5;
          let normalized = rawT <= half ? rawT / half : (1 - rawT) / half;
          if (!Number.isFinite(normalized) || normalized < 0) normalized = 0;
          if (normalized > 1) normalized = 1;

          const alphaTarget = (st.overlayMaxAlpha || GC.CAMERA.TRANSITION.FADE_MAX_ALPHA) * normalized;

          storeSnapshot.setStageTransition({
            overlayAlpha: alphaTarget,
          });
        } else if (st.overlayAlpha !== 0) {
          // 페이드가 아닌 전환 타입이면 알파는 0으로
          storeSnapshot.setStageTransition({ overlayAlpha: 0 });
        }

        const cameraAfter = useGameStore.getState().camera;

        // Pixi 월드 컨테이너 위치 반영
        applyCameraOffset(cameraAfter.x, cameraAfter.y);

        // 전환 완료 처리
        if (rawT >= 1) {
          storeSnapshot.finishStageTransition();
        }

        return;
      }

      let cameraUpdatedInFrame = false;

      // 1) 입력 잠금 / 다이얼로그 오픈 시 - 이동/충돌은 스킵, 숨쉬기 + 카메라만 유지
      if (isProductDialogOpen || isInputLocked) {
        logMovementDiagnostic("blocked-input-gate", {
          isProductDialogOpen,
          isInputLocked,
        });
        const nowTime = now; // 맨 위의 now 재사용
        const lockedProtagonist = protagonistRef.current;
        const lockedBaseY = protagonistBaseYRef.current;

        if (nowTime - lastRenderTimeRef.current >= 16) {
          lastRenderTimeRef.current = nowTime;
          frameCount.current = (frameCount.current + 1) % 1000;
        }

        if (lockedProtagonist && !lockedProtagonist.destroyed && lockedBaseY !== null) {
          const { frameIndex, animationYOffset } = getProtagonistAnimation(
            preCalculatedAnimationOffsets,
            ANIMATION_FRAMES,
            frameCount.current,
            false, // 입력 잠금 시에는 항상 숨쉬기 모드
          );

          lockedProtagonist.y = lockedBaseY + animationYOffset;

          const idleDir = resolveProtagonistDirection(lockedProtagonist);

          if (lockedProtagonist.data?.direction !== idleDir) {
            lockedProtagonist.data = {
              ...lockedProtagonist.data,
              direction: idleDir,
            };
          }

          applyProtagonistTextureFrame(texturesRef, idleDir, frameIndex, false, lockedProtagonist);

          syncCameraToProtagonist(deltaMs);
          cameraUpdatedInFrame = true;
        }

        return;
      }

      if (keyboardDirection && isResizingRef.current) {
        logMovementDiagnostic("blocked-resizing");
      }

      if (
        keyboardDirection &&
        (!protagonistRef.current || protagonistRef.current.destroyed || protagonistBaseYRef.current === null)
      ) {
        logMovementDiagnostic("blocked-protagonist-runtime", {
          protagonistPresent: Boolean(protagonistRef.current),
          protagonistDestroyed: protagonistRef.current?.destroyed ?? null,
          protagonistBaseYReady: protagonistBaseYRef.current !== null,
        });
      }

      // 2) 이동/충돌 업데이트 (GC.INTERVALS.MOVEMENT 간격마다 실행)
      if (now - lastMovementTime >= GC.INTERVALS.MOVEMENT) {
        if (!isResizingRef.current) {
          // 충돌 업데이트 빈도  → 15 프레임 마다 업데이트
          collisionUpdateCounter.current = (collisionUpdateCounter.current + 1) % 15;

          // 주인공이 실제로 이동했거나 NPC 상태가 변경된 경우에만 업데이트
          if (
            collisionUpdateCounter.current === 0 &&
            // 주인공이 이동 중인 경우에만 충돌 그리드 업데이트
            // 또는 30프레임마다 한 번씩 전체 업데이트 (60fps 기준 0.5초)
            (keyboardDirection || frameCount.current % 30 === 0)
          ) {
            needsCollisionUpdate.current = true;
          }

          // 실제 업데이트는 필요할 때만 수행
          if (needsCollisionUpdate.current) {
            updateCollisionGridRef.current();
            needsCollisionUpdate.current = false;
          }

          if (now - lastRenderTimeRef.current >= 16) {
            // 약 60fps 목표
            lastRenderTimeRef.current = now;
            frameCount.current = (frameCount.current + 1) % 1000;
            mapUpdateFrameCounter.current = (mapUpdateFrameCounter.current + 1) % 6;

            const protagonist = protagonistRef.current;
            const protagonistBaseY = protagonistBaseYRef.current;
            if (protagonist && !protagonist.destroyed && protagonistBaseY !== null) {
              if (keyboardDirection) {
                const effectiveDirection = keyboardDirection;
                if (effectiveDirection) {
                  const activeStageData = Object.values(stageDataRef.current).find(
                    (candidate) => resolveIsometricMovementRuntime(candidate) !== null,
                  );
                  const movementRuntime = resolveIsometricMovementRuntime(activeStageData);
                  const logicalPosition = protagonist.__logicalPosition;
                  const logicalGrid = logicalSpatialGridRef.current;

                  if (movementRuntime && logicalPosition && logicalGrid) {
                    const unitVector = directionToScreenVector(effectiveDirection);
                    const screenDelta = {
                      screenX: unitVector.screenX * step,
                      screenY: unitVector.screenY * step,
                    };
                    const logicalDelta = screenVectorToLogicalDelta(
                      screenDelta,
                      movementRuntime.projection,
                      movementRuntime.logicalUnitsPerTile,
                    );
                    const currentRect = createLogicalEntityRect(
                      logicalPosition,
                      CHARACTER_FOOTPRINT_TILES,
                      movementRuntime.logicalUnitsPerTile,
                      "__protagonist__",
                    );
                    let movement = resolveSweptLogicalMovement(currentRect, logicalDelta, (broadPhase) =>
                      logicalGrid.queryRect(
                        broadPhase,
                        (obj) => obj.id !== "__protagonist__" && !obj.role?.includes("pass"),
                      ),
                    );
                    const halfFootprint =
                      (CHARACTER_FOOTPRINT_TILES * movementRuntime.logicalUnitsPerTile) / 2;
                    const minWorld = -movementRuntime.logicalUnitsPerTile / 2 + halfFootprint;
                    const maxWorldX =
                      (movementRuntime.gridWidth - 0.5) * movementRuntime.logicalUnitsPerTile - halfFootprint;
                    const maxWorldY =
                      (movementRuntime.gridHeight - 0.5) * movementRuntime.logicalUnitsPerTile - halfFootprint;
                    const blockedByBounds =
                      movement.position.worldX < minWorld ||
                      movement.position.worldY < minWorld ||
                      movement.position.worldX > maxWorldX ||
                      movement.position.worldY > maxWorldY;
                    if (blockedByBounds) {
                      movement = {
                        position: logicalPosition,
                        appliedDelta: { worldX: 0, worldY: 0 },
                        collidedX:
                          movement.position.worldX < minWorld || movement.position.worldX > maxWorldX,
                        collidedY:
                          movement.position.worldY < minWorld || movement.position.worldY > maxWorldY,
                      };
                    }
                    const screenPosition = projectLogicalPosition(movement.position, movementRuntime);
                    const isMoving =
                      Math.abs(movement.appliedDelta.worldX) > 0 || Math.abs(movement.appliedDelta.worldY) > 0;
                    const { frameIndex, animationYOffset } = getProtagonistAnimation(
                      preCalculatedAnimationOffsets,
                      ANIMATION_FRAMES,
                      frameCount.current,
                      isMoving,
                    );
                    const facingDir = calculateDirection8(screenDelta.screenX, screenDelta.screenY, isMoving);

                    if (protagonistRef.current !== protagonist || protagonist.destroyed) {
                      logMovementDiagnostic("aborted-protagonist-generation-change");
                      return;
                    }

                    protagonist.__logicalPosition = movement.position;
                    protagonist.__logicalCollision = createLogicalEntityRect(
                      movement.position,
                      CHARACTER_FOOTPRINT_TILES,
                      movementRuntime.logicalUnitsPerTile,
                      "__protagonist__",
                    );
                    protagonist.__logicalCollision.type = "protagonist";
                    protagonist.__isoDepthKey = createCharacterDepthKey(
                      "protagonist",
                      movement.position,
                      movementRuntime,
                    );
                    protagonist.data = {
                      ...protagonist.data,
                      direction: facingDir,
                      logicalPosition: movement.position,
                    };
                    protagonist.x = screenPosition.screenX;
                    protagonistBaseYRef.current = screenPosition.screenY;
                    protagonist.y = screenPosition.screenY + animationYOffset;
                    logicalGrid.upsert(protagonist.__logicalCollision);
                    applyProtagonistTextureFrame(
                      texturesRef,
                      facingDir,
                      frameIndex,
                      isMoving,
                      protagonist,
                    );

                    if (protagonist.nameContainer) {
                      protagonist.nameContainer.x = screenPosition.screenX;
                      protagonist.nameContainer.y =
                        screenPosition.screenY + GC.INTERACTION.MESSAGE_OFFSET_Y;
                    }

                    const depthEntries = [
                      ...obstaclesRef.current
                        .filter((sprite) => sprite.__isoDepthKey)
                        .map((sprite) => ({ value: sprite, key: sprite.__isoDepthKey! })),
                      ...npcsRef.current
                        .filter((sprite) => sprite.__logicalPosition)
                        .map((sprite) => {
                          const stableId = sprite.label || sprite.data?.id || "npc";
                          const key = createCharacterDepthKey(stableId, sprite.__logicalPosition!, movementRuntime);
                          sprite.__isoDepthKey = key;
                          return { value: sprite, key };
                      }),
                      {
                        value: protagonist,
                        key: protagonist.__isoDepthKey,
                      },
                    ];
                    assignStableIsometricZ(depthEntries).forEach(({ value, zIndex }) => {
                      value.zIndex = zIndex;
                    });

                    setProtagonist(
                      screenPosition.screenX,
                      screenPosition.screenY,
                      screenPosition.screenY,
                      facingDir,
                    );
                    logMovementDiagnostic("isometric-v2-result", {
                      fromLogical: logicalPosition,
                      requestedLogicalDelta: logicalDelta,
                      appliedLogicalDelta: movement.appliedDelta,
                      toLogical: movement.position,
                      screenPosition,
                      collidedX: movement.collidedX,
                      collidedY: movement.collidedY,
                      blockedByBounds,
                    });
                    syncCameraToProtagonist(deltaMs);
                    cameraUpdatedInFrame = true;
                    if (mapUpdateFrameCounter.current === 0) needsMapUpdateRef.current = true;
                  } else {
                    logMovementDiagnostic("blocked-native-runtime", {
                      movementRuntimeReady: Boolean(movementRuntime),
                      logicalPositionReady: Boolean(logicalPosition),
                      logicalGridReady: Boolean(logicalGrid),
                    });
                  }
                }
                // NPC와의 상호작용 체크 (근접 감지)
                if (frameCount.current % 5 === 0) {
                  const activeStageData = Object.values(stageDataRef.current).find(
                    (candidate) => resolveIsometricMovementRuntime(candidate) !== null,
                  );
                  const movementRuntime = resolveIsometricMovementRuntime(activeStageData);
                  const protagonistLogical = protagonist.__logicalPosition;
                  if (!movementRuntime || !protagonistLogical) {
                    logMovementDiagnostic("blocked-native-npc-runtime", {
                      movementRuntimeReady: Boolean(movementRuntime),
                      protagonistLogicalReady: Boolean(protagonistLogical),
                    });
                    return;
                  }
                  const protagonistCenterX = protagonist.x;
                  const protagonistCenterY = protagonistBaseY;

                  const { camera } = useGameStore.getState();
                  const camWidth = camera.width || stageSize.width;
                  const camHeight = camera.height || stageSize.height;

                  npcsRef.current?.forEach((npc) => {
                    const isVisible =
                      npc.x + npcSize > camera.x &&
                      npc.x < camera.x + camWidth &&
                      npc.y + npcSize > camera.y &&
                      npc.y < camera.y + camHeight;

                    if (!isVisible) return;

                    if (!npc.__logicalPosition) return;
                    const distance = logicalDistanceInTiles(
                      protagonistLogical,
                      npc.__logicalPosition,
                      movementRuntime.logicalUnitsPerTile,
                    );

                    if (distance <= NPC_INTERACTION_DISTANCE_TILES) {
                      if (!npc.getChildByLabel("message")) {
                        npcInteractionRef.current.handleNpcInteraction(npc, protagonistCenterX, protagonistCenterY);
                      }
                    } else {
                      npcInteractionRef.current.removeNpcMessage(npc);
                    }
                  });
                }

              } else {
                // 정지 상태일 때 숨쉬기 애니메이션만 적용
                const idleProtagonist = protagonistRef.current;
                const idleBaseY = protagonistBaseYRef.current;
                if (!idleProtagonist || idleProtagonist.destroyed || idleBaseY == null) {
                  return;
                }
                const { frameIndex, animationYOffset } = getProtagonistAnimation(
                  preCalculatedAnimationOffsets,
                  ANIMATION_FRAMES,
                  frameCount.current,
                  false,
                );
                idleProtagonist.y = idleBaseY + animationYOffset;

                // 정지 상태에서 기본 방향 유지 + 프레임만 갱신
                const idleDir = resolveProtagonistDirection(idleProtagonist);

                if (idleProtagonist.data?.direction !== idleDir) {
                  idleProtagonist.data = {
                    ...idleProtagonist.data,
                    direction: idleDir,
                  };
                }

                applyProtagonistTextureFrame(texturesRef, idleDir, frameIndex, false, idleProtagonist);
                syncCameraToProtagonist(deltaMs);
                cameraUpdatedInFrame = true;
              }

              // 정기적으로 culling 실행 (성능 최적화)
              // 이동/정지 무관 실행 (P1-6) — 정지 상태의 카메라 lerp 잔여 이동/전환 직후에도 프루닝 갱신
              if (GC.PERF?.CULLING?.ENABLED && currentStageContainerRef.current) {
                const interval = GC.PERF.CULLING.INTERVAL_FRAMES ?? 30;

                if (interval > 0 && frameCount.current % interval === 0) {
                  const { camera } = useGameStore.getState();
                  const camWidth = camera.width || stageSize.width;
                  const camHeight = camera.height || stageSize.height;
                  const padding = GC.PERF.CULLING.VIEWPORT_PADDING ?? Math.max(userSize, npcSize) * 2;

                  const cullRect = {
                    x: -padding,
                    y: -padding,
                    width: camWidth + padding * 2,
                    height: camHeight + padding * 2,
                  };

                  const worldContainer = currentStageContainerRef.current as Container;
                  const activeStageData = Object.values(stageDataRef.current).find(
                    (candidate) => resolveIsometricViewportRuntime(candidate) !== null,
                  );
                  const viewportRuntime = resolveIsometricViewportRuntime(activeStageData);
                  const gridViewport = viewportRuntime
                    ? getIsometricViewportGridBounds(camera, viewportRuntime, padding)
                    : null;

                  // 직계 자식 프루닝. native-v2 obstacle은 getBounds 없이 논리 footprint로 판정한다.
                  worldContainer.children.forEach((child) => {
                    const isoCullFootprint = (child as NpcSpriteType).__isoCullFootprint;
                    if (gridViewport && isoCullFootprint) {
                      child.renderable = isIsometricGridFootprintVisible(isoCullFootprint, gridViewport);
                      return;
                    }

                    const bounds = child.getBounds?.();
                    if (!bounds) return;

                    const isVisible =
                      bounds.x + bounds.width >= cullRect.x &&
                      bounds.x <= cullRect.x + cullRect.width &&
                      bounds.y + bounds.height >= cullRect.y &&
                      bounds.y <= cullRect.y + cullRect.height;

                    // 렌더링만 제어 (transform 업데이트와 내부 로직은 계속 유지)
                    child.renderable = isVisible;
                  });
                }
              }
            }
          }
        }
        lastMovementTime = now;
      }

      // 3) 월드 데이터 업데이트 (맵)
      // 3) 월드 데이터 업데이트 (맵)
      const perfWorld = GC.PERF?.WORLD_DATA;
      const minInterval = perfWorld?.MIN_UPDATE_INTERVAL_MS ?? 250;

      if (now - lastMapUpdateTime >= minInterval) {
        if (needsMapUpdateRef.current) {
          const { camera } = useGameStore.getState();
          const camWidth = camera.width || stageSize.width;
          const camHeight = camera.height || stageSize.height;

          // 카메라 중심(world) 좌표
          const centerX = camera.x + camWidth / 2;
          const centerY = camera.y + camHeight / 2;

          const prevCenter = lastWorldDataCameraCenterRef.current;
          const deltaThreshold = perfWorld?.MIN_CAMERA_DELTA ?? Math.max(stageSize.width, stageSize.height) * 0.3; // 기본값: 스테이지 한 변의 30% 정도

          let shouldUpdate = true;

          if (prevCenter) {
            const dx = centerX - prevCenter.x;
            const dy = centerY - prevCenter.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < deltaThreshold * deltaThreshold) {
              // 카메라가 충분히 움직이지 않았다면 이번 업데이트는 스킵
              shouldUpdate = false;
            }
          }

          if (shouldUpdate) {
            updateWorldDataRef.current();
            needsMapUpdateRef.current = false;
            lastWorldDataCameraCenterRef.current = { x: centerX, y: centerY };
            lastMapUpdateTime = now;
          }
        } else {
          // 업데이트 플래그가 없으면 시간만 갱신해서 불필요한 반복 검사 방지
          lastMapUpdateTime = now;
        }
      }

      // 4) 이 프레임 동안 카메라가 한 번도 갱신되지 않았다면, 마지막 주인공 위치 기준 lerp 추가 적용
      if (!cameraUpdatedInFrame && protagonistRef.current && protagonistBaseYRef.current !== null) {
        syncCameraToProtagonist(deltaMs);
      }

      } catch (error) {
        const loggedAt = performance.now();
        if (loggedAt - lastLoopErrorAtRef.current >= 1000) {
          lastLoopErrorAtRef.current = loggedAt;
          logger.error("[useGameLoop] frame failed; scheduling recovery frame:", error);
        }
      } finally {
        // 프레임 중 일시적인 ref/Pixi lifecycle 오류가 발생해도 RAF 체인을 끊지 않는다.
        if (!cancelled) animationFrameId = requestAnimationFrame(loop);
      }
    }

    animationFrameId = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    step,
    stageSize.width,
    stageSize.height,
    userSize,
    npcSize,
    preCalculatedAnimationOffsets,
    ANIMATION_FRAMES,
    setProtagonist,
    texturesRef,
    isProductDialogOpen,
    syncCameraToProtagonist,
    isInputLocked,
    appRef,
    currentStageContainerRef,
    applyCameraOffset,
    isResizingRef,
    needsCollisionUpdate,
    needsMapUpdateRef,
    npcsRef,
    obstaclesRef,
    protagonistBaseYRef,
    protagonistRef,
    logicalSpatialGridRef,
    stageDataRef,
  ]);

  return {
    frameCount,
    mapUpdateFrameCounter,
    collisionUpdateCounter,
    lastRenderTimeRef,
    setKeyboardDirection,
  };
}
