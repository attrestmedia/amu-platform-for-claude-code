"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IStageDoc } from "types/game/stage-doc";
import type { GridPoint, ScreenPoint } from "types/game/coordinates";
import {
  buildEditorTileOccupancy,
  buildStageDataFromDoc,
  compareIsometricDepth,
  createIsometricEditorTransform,
  getIsometricEditorCellPolygon,
  panIsometricEditorTransform,
  pickIsometricEditorCell,
  resolveEditorGhostPlacement,
  resolveIsometricEditorRuntime,
  stageScreenToEditorCanvas,
  zoomIsometricEditorTransform,
  gridToScreen,
  getIsometricSpriteSize,
  doStageAuthoringLayersConflict,
  resolveStageAssetAuthoringLayer,
  resolveStageTileAuthoringLayer,
  type StageAuthoringLayerType,
  type IsometricEditorTransform,
} from "utils/game";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Stage Map Editor의 다이아몬드(아이소) 편집면 — hover cell, ghost placement, footprint/충돌 overlay 렌더링과 셀 피킹
 * @process editor 커널로 fit/zoom/pan 변환 유지  canvas 2D로 grid/tile/overlay 드로잉  포인터 이벤트를 셀 클릭으로 변환
 * @domain game-stage-editor
 * @scope admin-authoring
 */

// 편집면은 장식/게임 성격의 canvas 렌더링 예외 (text-rendering Rule A) — 사용자 가독 텍스트는 DOM 패널에 유지
const COLORS = {
  background: "#101418",
  worldFill: "#18252c",
  worldStroke: "#3a4a55",
  gridLine: "rgba(255,255,255,0.06)",
  tileGround: "rgba(74,222,128,0.35)",
  tileBlocking: "rgba(251,191,36,0.45)",
  tileBoundary: "rgba(248,113,113,0.5)",
  tileStroke: "rgba(255,255,255,0.25)",
  selectedStroke: "#60a5fa",
  hoverStroke: "rgba(255,255,255,0.9)",
  collisionFill: "rgba(239,68,68,0.32)",
  ghostValid: "rgba(96,165,250,0.45)",
  ghostInvalid: "rgba(248,113,113,0.55)",
} as const;

const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 40;
const GRID_LINE_MIN_TILE_PX = 14;
const DRAG_THRESHOLD_PX = 5;

interface IsometricStageCanvasProps {
  stageDoc: IStageDoc;
  selectedTileId: string | null;
  selectedAssetName: string | null;
  showCollision: boolean;
  readOnly?: boolean;
  height?: number;
  fitRequestKey?: number;
  visibleLayers?: ReadonlySet<StageAuthoringLayerType>;
  interactionMode?: "navigate" | "paint" | "rectangle";
  onCellClick: (cell: GridPoint) => void;
  onCellStroke?: (cells: GridPoint[]) => void;
  onAssetDrop?: (cell: GridPoint, assetName: string) => void;
}

export function IsometricStageCanvas({
  stageDoc,
  selectedTileId,
  selectedAssetName,
  showCollision,
  readOnly = false,
  height = 560,
  fitRequestKey = 0,
  visibleLayers,
  interactionMode = "navigate",
  onCellClick,
  onCellStroke,
  onAssetDrop,
}: IsometricStageCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height });
  const [transform, setTransform] = useState<IsometricEditorTransform | null>(null);
  const [hoverCell, setHoverCell] = useState<GridPoint | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageRevision, setImageRevision] = useState(0);

  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const paintStateRef = useRef<{ pointerId: number; cells: GridPoint[]; keys: Set<string> } | null>(null);

  const runtime = useMemo(() => resolveIsometricEditorRuntime(stageDoc), [stageDoc]);
  const assetsByName = useMemo(
    () => new Map((stageDoc.assets || []).map((asset) => [asset.name, asset])),
    [stageDoc.assets],
  );
  const tiles = useMemo(() => stageDoc.layout?.tiles ?? [], [stageDoc.layout?.tiles]);
  const occupancy = useMemo(() => buildEditorTileOccupancy(tiles, assetsByName), [tiles, assetsByName]);
  const visibleTileIds = useMemo(() => {
    if (!visibleLayers) return new Set(tiles.map((tile) => tile.id));
    return new Set(
      tiles
        .filter((tile) => visibleLayers.has(resolveStageTileAuthoringLayer(tile, assetsByName.get(tile.assetName))))
        .map((tile) => tile.id),
    );
  }, [assetsByName, tiles, visibleLayers]);
  const selectedAsset = selectedAssetName ? assetsByName.get(selectedAssetName) : undefined;
  const renderObstacles = useMemo(() => {
    try {
      return buildStageDataFromDoc(stageDoc).data.obstacles
        .filter((obstacle) => visibleTileIds.has(obstacle.id))
        .filter((obstacle) => obstacle.isoRender)
        .sort((left, right) => compareIsometricDepth(left.isoRender!.depthKey, right.isoRender!.depthKey));
    } catch {
      return [];
    }
  }, [stageDoc, visibleTileIds]);

  useEffect(function loadStageAssetImages() {
    let active = true;
    const urls = Array.from(new Set((stageDoc.assets || []).map((asset) => asset.fileName).filter(Boolean)));
    urls.forEach((url) => {
      if (imageCacheRef.current.has(url)) return;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (!active) return;
        imageCacheRef.current.set(url, image);
        setImageRevision((current) => current + 1);
      };
      image.onerror = () => {
        if (active) imageCacheRef.current.delete(url);
      };
      imageCacheRef.current.set(url, image);
      image.src = url;
    });
    return () => {
      active = false;
    };
  }, [stageDoc.assets]);

  // 컨테이너 실측 → canvas 픽셀 크기 동기화 (canvas 편집면 측정 — 텍스트 측정 아님)
  useEffect(function observeCanvasSize() {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.floor(entry.contentRect.width);
      if (width > 0) {
        setCanvasSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [height]);

  // runtime/캔버스 크기 준비 시 fit 변환 초기화
  useEffect(function initializeTransform() {
    if (!runtime || canvasSize.width <= 40) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 실측 canvas 크기에 종속된 초기 변환 계산
      setTransform(createIsometricEditorTransform(runtime, canvasSize.width, canvasSize.height));
    } catch (error) {
      logger.warn("[IsometricStageCanvas] fit transform 생성 실패:", error);
    }
  }, [runtime, canvasSize.width, canvasSize.height]);

  const fitScale = useMemo(() => {
    if (!runtime || canvasSize.width <= 40) return null;
    try {
      return createIsometricEditorTransform(runtime, canvasSize.width, canvasSize.height).scale;
    } catch {
      return null;
    }
  }, [runtime, canvasSize.width, canvasSize.height]);

  const ghost = useMemo(() => {
    if (!runtime || !transform || !hoverCell || !selectedAsset || readOnly) return null;
    const selectedLayer = resolveStageAssetAuthoringLayer(selectedAsset);
    const conflictingOccupancy = occupancy.filter((entry) => {
      const layer = resolveStageTileAuthoringLayer(entry.tile, assetsByName.get(entry.tile.assetName));
      return doStageAuthoringLayersConflict(selectedLayer, layer);
    });
    return resolveEditorGhostPlacement(hoverCell, selectedAsset, conflictingOccupancy, transform, runtime);
  }, [runtime, transform, hoverCell, selectedAsset, occupancy, readOnly, assetsByName]);

  // 메인 드로잉 — 상태 변경 시 1회 (RAF로 병합)
  useEffect(function drawEditorSurface() {
    const canvas = canvasRef.current;
    if (!canvas || !runtime || !transform) return;

    const frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const drawPolygon = (points: readonly ScreenPoint[]) => {
        ctx.beginPath();
        points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.screenX, point.screenY);
          else ctx.lineTo(point.screenX, point.screenY);
        });
        ctx.closePath();
      };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 1) 월드 다이아몬드
      const cornerCells = [
        { gridX: -0.5, gridY: -0.5 },
        { gridX: runtime.gridWidth - 0.5, gridY: -0.5 },
        { gridX: runtime.gridWidth - 0.5, gridY: runtime.gridHeight - 0.5 },
        { gridX: -0.5, gridY: runtime.gridHeight - 0.5 },
      ].map((corner) => stageScreenToEditorCanvas(gridToScreen(corner, runtime.projection), transform));
      drawPolygon(cornerCells);
      ctx.fillStyle = COLORS.worldFill;
      ctx.fill();
      ctx.strokeStyle = COLORS.worldStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 2) 그리드 라인 — 충분히 확대된 경우에만
      if (transform.scale * runtime.projection.tileWidth >= GRID_LINE_MIN_TILE_PX) {
        ctx.strokeStyle = COLORS.gridLine;
        ctx.lineWidth = 1;
        for (let gx = 0; gx <= runtime.gridWidth; gx++) {
          const from = stageScreenToEditorCanvas(
            gridToScreen({ gridX: gx - 0.5, gridY: -0.5 }, runtime.projection),
            transform,
          );
          const to = stageScreenToEditorCanvas(
            gridToScreen({ gridX: gx - 0.5, gridY: runtime.gridHeight - 0.5 }, runtime.projection),
            transform,
          );
          ctx.beginPath();
          ctx.moveTo(from.screenX, from.screenY);
          ctx.lineTo(to.screenX, to.screenY);
          ctx.stroke();
        }
        for (let gy = 0; gy <= runtime.gridHeight; gy++) {
          const from = stageScreenToEditorCanvas(
            gridToScreen({ gridX: -0.5, gridY: gy - 0.5 }, runtime.projection),
            transform,
          );
          const to = stageScreenToEditorCanvas(
            gridToScreen({ gridX: runtime.gridWidth - 0.5, gridY: gy - 0.5 }, runtime.projection),
            transform,
          );
          ctx.beginPath();
          ctx.moveTo(from.screenX, from.screenY);
          ctx.lineTo(to.screenX, to.screenY);
          ctx.stroke();
        }
      }

      // 3) 타일 footprint (role 색상) + 선택 강조 + 충돌 overlay
      for (const obstacle of renderObstacles) {
        const placement = obstacle.isoRender;
        const asset = assetsByName.get(obstacle.assetName);
        const image = asset ? imageCacheRef.current.get(asset.fileName) : undefined;
        if (!placement || !image?.complete || !image.naturalWidth) continue;
        const baseSize = getIsometricSpriteSize(
          placement.footprint,
          runtime.projection,
          placement.layer,
          placement.visualHeightPx,
        );
        const instanceScale = Number.isFinite(Number(obstacle.scale)) ? Number(obstacle.scale) : 1;
        const width = baseSize.width * transform.scale * instanceScale;
        const height = baseSize.height * transform.scale * instanceScale;
        const anchorPoint = stageScreenToEditorCanvas(placement.screenPoint, transform);
        ctx.save();
        ctx.translate(anchorPoint.screenX, anchorPoint.screenY);
        ctx.rotate(((Number(obstacle.rotation) || 0) * Math.PI) / 180);
        ctx.drawImage(image, -placement.anchor.x * width, -placement.anchor.y * height, width, height);
        ctx.restore();
      }

      // 4) 타일 footprint (role 색상) + 선택 강조 + 충돌 overlay
      for (const entry of occupancy) {
        if (!visibleTileIds.has(entry.tile.id)) continue;
        const asset = assetsByName.get(entry.tile.assetName);
        const roles = [
          ...(Array.isArray(asset?.roles) ? (asset?.roles as string[]) : []),
          ...(Array.isArray(entry.tile.meta?.roles) ? (entry.tile.meta?.roles as string[]) : []),
        ];
        const isBoundary = roles.some((role) => role.startsWith("boundary"));
        const fill = isBoundary ? COLORS.tileBoundary : entry.blocking ? COLORS.tileBlocking : COLORS.tileGround;
        const isSelected = entry.tile.id === selectedTileId;

        for (const cell of entry.cells) {
          const polygon = getIsometricEditorCellPolygon(cell, transform, runtime);
          drawPolygon(polygon);
          ctx.fillStyle = fill;
          ctx.fill();
          if (showCollision && entry.blocking) {
            ctx.fillStyle = COLORS.collisionFill;
            ctx.fill();
          }
          ctx.strokeStyle = isSelected ? COLORS.selectedStroke : COLORS.tileStroke;
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.stroke();
        }
      }

      // 5) ghost placement
      if (ghost) {
        ctx.fillStyle = ghost.inBounds && ghost.overlappingTileIds.length === 0 ? COLORS.ghostValid : COLORS.ghostInvalid;
        for (const polygon of ghost.cellPolygons) {
          drawPolygon(polygon);
          ctx.fill();
        }
      }

      // 6) hover cell
      if (hoverCell) {
        const polygon = getIsometricEditorCellPolygon(hoverCell, transform, runtime);
        drawPolygon(polygon);
        ctx.strokeStyle = COLORS.hoverStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [runtime, transform, occupancy, assetsByName, selectedTileId, showCollision, ghost, hoverCell, renderObstacles, imageRevision, visibleTileIds]);

  const toCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): ScreenPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { screenX: 0, screenY: 0 };
    const rect = canvas.getBoundingClientRect();
    return { screenX: event.clientX - rect.left, screenY: event.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = toCanvasPoint(event);
      if (interactionMode !== "navigate" && runtime && transform && !readOnly) {
        const cell = pickIsometricEditorCell(point, transform, runtime);
        if (cell) {
          paintStateRef.current = {
            pointerId: event.pointerId,
            cells: [cell],
            keys: new Set([`${cell.gridX}:${cell.gridY}`]),
          };
          setHoverCell(cell);
          canvasRef.current?.setPointerCapture(event.pointerId);
        }
        return;
      }
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: point.screenX,
        startY: point.screenY,
        lastX: point.screenX,
        lastY: point.screenY,
        moved: false,
      };
      canvasRef.current?.setPointerCapture(event.pointerId);
    },
    [interactionMode, readOnly, runtime, toCanvasPoint, transform],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!runtime || !transform) return;
      const point = toCanvasPoint(event);
      const paint = paintStateRef.current;
      if (paint && paint.pointerId === event.pointerId) {
        const cell = pickIsometricEditorCell(point, transform, runtime);
        if (cell) {
          setHoverCell(cell);
          if (interactionMode === "rectangle") {
            paint.cells = [paint.cells[0], cell];
          } else {
            const key = `${cell.gridX}:${cell.gridY}`;
            if (!paint.keys.has(key)) {
              paint.keys.add(key);
              paint.cells.push(cell);
            }
          }
        }
        return;
      }
      const drag = dragStateRef.current;

      if (drag && drag.pointerId === event.pointerId) {
        const totalDx = point.screenX - drag.startX;
        const totalDy = point.screenY - drag.startY;
        if (drag.moved || Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD_PX) {
          drag.moved = true;
          setTransform((prev) =>
            prev ? panIsometricEditorTransform(prev, point.screenX - drag.lastX, point.screenY - drag.lastY) : prev,
          );
        }
        drag.lastX = point.screenX;
        drag.lastY = point.screenY;
      }

      const cell = pickIsometricEditorCell(point, transform, runtime);
      setHoverCell((prev) =>
        prev?.gridX === cell?.gridX && prev?.gridY === cell?.gridY ? prev : cell,
      );
    },
    [interactionMode, runtime, transform, toCanvasPoint],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const paint = paintStateRef.current;
      if (paint && paint.pointerId === event.pointerId) {
        paintStateRef.current = null;
        canvasRef.current?.releasePointerCapture?.(event.pointerId);
        if (paint.cells.length > 0) onCellStroke?.(paint.cells);
        return;
      }
      const drag = dragStateRef.current;
      dragStateRef.current = null;
      canvasRef.current?.releasePointerCapture?.(event.pointerId);
      if (!runtime || !transform || !drag || drag.moved) return;

      const cell = pickIsometricEditorCell(toCanvasPoint(event), transform, runtime);
      if (cell) onCellClick(cell);
    },
    [runtime, transform, toCanvasPoint, onCellClick, onCellStroke],
  );

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (paintStateRef.current?.pointerId === event.pointerId) paintStateRef.current = null;
    if (dragStateRef.current?.pointerId === event.pointerId) dragStateRef.current = null;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoverCell(null);
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      if (!transform || fitScale == null) return;
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      const nextScale = Math.min(Math.max(transform.scale * factor, fitScale * MIN_ZOOM_FACTOR), fitScale * MAX_ZOOM_FACTOR);
      if (nextScale === transform.scale) return;
      setTransform(zoomIsometricEditorTransform(transform, nextScale, toCanvasPoint(event)));
    },
    [transform, fitScale, toCanvasPoint],
  );

  const resetView = useCallback(() => {
    if (!runtime || canvasSize.width <= 40) return;
    try {
      setTransform(createIsometricEditorTransform(runtime, canvasSize.width, canvasSize.height));
    } catch (error) {
      logger.warn("[IsometricStageCanvas] fit reset 실패:", error);
    }
  }, [runtime, canvasSize.width, canvasSize.height]);

  useEffect(function respondToFitRequest() {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- toolbar command synchronizes the canvas viewport.
    if (fitRequestKey > 0) resetView();
  }, [fitRequestKey, resetView]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (readOnly || !runtime || !transform || !onAssetDrop) return;
      const assetName = event.dataTransfer.getData("application/x-amu-stage-asset") || event.dataTransfer.getData("text/plain");
      const rect = event.currentTarget.getBoundingClientRect();
      const cell = pickIsometricEditorCell(
        { screenX: event.clientX - rect.left, screenY: event.clientY - rect.top },
        transform,
        runtime,
      );
      if (cell && assetName) onAssetDrop(cell, assetName);
    },
    [onAssetDrop, readOnly, runtime, transform],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!runtime) return;
      const current = hoverCell || { gridX: 0, gridY: 0 };
      const delta =
        event.key === "ArrowLeft" ? { gridX: -1, gridY: 0 } :
        event.key === "ArrowRight" ? { gridX: 1, gridY: 0 } :
        event.key === "ArrowUp" ? { gridX: 0, gridY: -1 } :
        event.key === "ArrowDown" ? { gridX: 0, gridY: 1 } : null;
      if (delta) {
        event.preventDefault();
        setHoverCell({
          gridX: Math.min(runtime.gridWidth - 1, Math.max(0, current.gridX + delta.gridX)),
          gridY: Math.min(runtime.gridHeight - 1, Math.max(0, current.gridY + delta.gridY)),
        });
      } else if ((event.key === "Enter" || event.key === " ") && hoverCell) {
        event.preventDefault();
        onCellClick(hoverCell);
      } else if (event.key === "Escape") {
        paintStateRef.current = null;
      }
    },
    [hoverCell, onCellClick, runtime],
  );

  if (!runtime) {
    return (
      <div ref={containerRef} className="flex items-center justify-center border rounded-default bg-background" style={{ height }}>
        <span className="text-xs text-muted-foreground">layout이 없어 아이소 편집면을 표시할 수 없습니다.</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative border rounded-default overflow-hidden" style={{ height }}>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          display: "block",
          touchAction: "none",
          cursor: readOnly ? "default" : interactionMode === "navigate" ? "crosshair" : "cell",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
        onDoubleClick={resetView}
        onDragOver={(event) => {
          if (!readOnly) event.preventDefault();
        }}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="application"
        aria-label="Isometric stage map editing canvas"
      />
    </div>
  );
}

export default IsometricStageCanvas;
