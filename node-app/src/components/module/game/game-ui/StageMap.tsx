import React, { useEffect, useMemo, useRef } from "react";
import type { IStageDoc, IWorldData, IWorldObject } from "types/game";
import { GAME_COLORS } from "consts/game";
import { useGameStore, useUiControlStore } from "store/game";
import {
  createIsometricMinimapTransform,
  projectCameraViewportToMinimap,
  projectStageScreenPointToMinimap,
  resolveIsometricViewportRuntimeFromDoc,
  type IsometricMinimapTransform,
} from "utils/game";
import { cn } from "utils/common";

// 개별 오브젝트 컴포넌트
const MapObject = React.memo(
  ({
    obj,
    isometricTransform,
  }: {
    obj: IWorldObject;
    isometricTransform?: IsometricMinimapTransform;
  }) => {
    // 객체 유형에 따른 배경색 결정
    let bgColor = GAME_COLORS.MAP.NPC; // 기본값은 NPC 색상

    if (obj.type === "protagonist") bgColor = GAME_COLORS.MAP.PROTAGONIST;
    else if (obj.type === "obstacle") {
      if (obj.role?.includes("road")) {
        bgColor = GAME_COLORS.MAP.ROAD;
      } else {
        bgColor = GAME_COLORS.MAP.OBSTACLE;
      }
    }

    // 유틸리티 함수를 사용하여 월드 좌표를 맵 좌표로 변환
    if (!isometricTransform) return null;
    const isometricPoint = projectStageScreenPointToMinimap(
      { screenX: obj.x, screenY: obj.y },
      isometricTransform,
    );
    const objectScale = isometricTransform.scale;
    const width = Math.max(2, Math.min(obj.width * objectScale, 18));
    const height = Math.max(2, Math.min(obj.height * objectScale, 18));

    return (
      <div
        className={cn(
          "map-object relative z-2",
          obj.type === "protagonist" &&
            "before:absolute before:content-[''] before:inset-0 before:rounded-full before:bg-current before:opacity-0 before:animate-pulse-radar before:z-1",
        )}
        style={{
          position: "absolute",
          left: isometricPoint.screenX - width / 2,
          top: isometricPoint.screenY - height / 2,
          width,
          height,
          backgroundColor: bgColor,
          opacity: obj.type !== "obstacle" ? 0.8 : 0.4,
          borderRadius: obj.type !== "obstacle" ? "0.25rem" : "0.1rem",
          color: bgColor,
        }}
      />
    );
  },
);

// 명시적 displayName 설정
MapObject.displayName = "MapObject";

interface StageMapProps {
  worldData: IWorldData;
  stageDoc?: IStageDoc | null;
}

const IsometricCameraViewport = React.memo(
  ({ transform }: { transform: IsometricMinimapTransform }) => {
    const polygonRef = useRef<SVGPolygonElement>(null);

    useEffect(() => {
      let animationFrameId = 0;
      let cancelled = false;
      const update = () => {
        if (cancelled) return;
        const points = projectCameraViewportToMinimap(useGameStore.getState().camera, transform);
        if (polygonRef.current) {
          polygonRef.current.setAttribute(
            "points",
            points.map((point) => `${point.screenX},${point.screenY}`).join(" "),
          );
        }
        animationFrameId = requestAnimationFrame(update);
      };
      animationFrameId = requestAnimationFrame(update);
      return () => {
        cancelled = true;
        cancelAnimationFrame(animationFrameId);
      };
    }, [transform]);

    return (
      <svg
        className="pointer-events-none absolute inset-0 z-10"
        width={transform.mapWidth}
        height={transform.mapHeight}
        aria-hidden="true"
      >
        <polygon
          ref={polygonRef}
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="1"
        />
      </svg>
    );
  },
);

IsometricCameraViewport.displayName = "IsometricCameraViewport";

// StageMap 컴포넌트 - React.memo 적용
const StageMap = React.memo(({ worldData, stageDoc }: StageMapProps) => {
  const { objects } = worldData;
  const showMap = useUiControlStore((state) => state.showMap);
  const isometricRuntime = useMemo(
    () => resolveIsometricViewportRuntimeFromDoc(stageDoc),
    [stageDoc],
  );
  const isometricTransform = useMemo(
    () =>
      isometricRuntime
        ? createIsometricMinimapTransform(isometricRuntime, 320, 200)
        : null,
    [isometricRuntime],
  );
  const diamondPoints = useMemo(
    () =>
      isometricRuntime && isometricTransform
        ? isometricRuntime.bounds.corners
            .map((point) => projectStageScreenPointToMinimap(point, isometricTransform))
            .map((point) => `${point.screenX},${point.screenY}`)
            .join(" ")
        : "",
    [isometricRuntime, isometricTransform],
  );

  // 맵 크기 계산에 유틸리티 함수 사용
  const worldDimensions = useMemo(() => {
    return {
      width: isometricTransform?.mapWidth ?? 0,
      height: isometricTransform?.mapHeight ?? 0,
    };
  }, [isometricTransform]);

  if (!showMap || !isometricTransform) return null;

  return (
    <div
      className="stage-map fixed bottom-0 right-0 bg-black/70 overflow-hidden rounded-tl-lg z-50 animate-fade-in"
      style={{
        width: worldDimensions.width,
        height: worldDimensions.height,
        boxShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}
    >
      {isometricTransform && (
        <>
          <svg
            className="pointer-events-none absolute inset-0 z-0"
            width={worldDimensions.width}
            height={worldDimensions.height}
            aria-hidden="true"
          >
            <polygon
              points={diamondPoints}
              fill="rgba(74, 222, 128, 0.08)"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="1"
            />
          </svg>
          <IsometricCameraViewport transform={isometricTransform} />
        </>
      )}

      {/* 각 오브젝트 렌더링 - props 추가 */}
      {objects.map((obj, i) => (
        <MapObject
          key={`${obj.type}-${obj.x}-${obj.y}-${i}`}
          obj={obj}
          isometricTransform={isometricTransform ?? undefined}
        />
      ))}
    </div>
  );
});

// 명시적 displayName 설정
StageMap.displayName = "StageMap";

export default StageMap;
