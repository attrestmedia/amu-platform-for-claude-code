"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { lang } from "components/module/i18n";
import { dialog } from "@amu-labs/ui";
import type { GridPoint } from "types/game/coordinates";
import type { IStageAsset, IStageDoc, IStageLayout, IStageLayoutTile } from "types/game/stage-doc";
import {
  STAGE_AUTHORING_LAYERS,
  STAGE_MAP_LIMITS,
  applyStageMapPaint,
  buildAutoLayoutForStageDoc,
  buildEditorTileOccupancy,
  doStageAuthoringLayersConflict,
  listFootprintCells,
  resolveStageAssetAuthoringLayer,
  resolveStageTileAuthoringLayer,
  type StageAuthoringLayerType,
  type StageMapPaintToolType,
} from "utils/game";
import { logger } from "utils/log";

export type StageMapEditorToolType = "select" | StageMapPaintToolType;
export type StageLayerStateType = Record<StageAuthoringLayerType, { visible: boolean; locked: boolean }>;

const DEFAULT_LAYER_STATE: StageLayerStateType = {
  ground: { visible: true, locked: false },
  object: { visible: true, locked: false },
  boundary: { visible: true, locked: false },
  overlay: { visible: true, locked: false },
};

const HISTORY_LIMIT = 30;

type StageMapHistory = {
  past: IStageDoc[];
  future: IStageDoc[];
};

const cloneStageDoc = (stage: IStageDoc): IStageDoc => JSON.parse(JSON.stringify(stage));

function getAssetFootprint(asset: IStageAsset | undefined) {
  return asset?.meta?.isoFootprint || {
    width: Math.max(1, Math.round(asset?.size.width || 1)),
    height: Math.max(1, Math.round(asset?.size.height || 1)),
    offsetX: 0,
    offsetY: 0,
  };
}

export function useStageMapEditor({
  stageDoc,
  readOnly,
  onChange,
  onSave,
}: {
  stageDoc: IStageDoc;
  readOnly: boolean;
  onChange?: (doc: IStageDoc) => void;
  onSave?: (doc: IStageDoc) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<IStageDoc>(() => cloneStageDoc(stageDoc));
  const draftRef = useRef<IStageDoc>(cloneStageDoc(stageDoc));
  const [history, setHistory] = useState<StageMapHistory>({ past: [], future: [] });
  const [selectedAssetName, setSelectedAssetName] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [tool, setTool] = useState<StageMapEditorToolType>("select");
  const [activeLayer, setActiveLayer] = useState<StageAuthoringLayerType>("ground");
  const [brushRadius, setBrushRadius] = useState(1);
  const [layerState, setLayerState] = useState<StageLayerStateType>(DEFAULT_LAYER_STATE);
  const [saving, setSaving] = useState(false);
  const [showCollision, setShowCollision] = useState(false);
  const [mapWidth, setMapWidth] = useState(() => String(stageDoc.layout?.width || 16));
  const [mapHeight, setMapHeight] = useState(() => String(stageDoc.layout?.height || 16));

  useEffect(function syncDraftFromStageDoc() {
    // 외부 StageDoc identity가 바뀔 때만 편집 세션을 초기화한다.
    const nextDraft = cloneStageDoc(stageDoc);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 StageDoc 변경에 맞춰 편집 세션을 초기화한다.
    setDraft(nextDraft);
    draftRef.current = nextDraft;
    setHistory({ past: [], future: [] });
    setSelectedAssetName(null);
    setSelectedTileId(null);
    setTool("select");
    setMapWidth(String(stageDoc.layout?.width || 16));
    setMapHeight(String(stageDoc.layout?.height || 16));
  }, [stageDoc]);

  const layout: IStageLayout = useMemo(
    () => draft.layout || { mode: "auto", width: 16, height: 16, tiles: [] },
    [draft.layout],
  );
  const assets = useMemo(() => draft.assets || [], [draft.assets]);
  const assetsByName = useMemo(() => new Map(assets.map((asset) => [asset.name, asset])), [assets]);
  const tileOccupancy = useMemo(
    () => buildEditorTileOccupancy(layout.tiles, assetsByName),
    [assetsByName, layout.tiles],
  );
  const selectedTile = useMemo(
    () => layout.tiles.find((tile) => tile.id === selectedTileId),
    [layout.tiles, selectedTileId],
  );
  const draftWithLayout = useMemo(() => (draft.layout ? draft : { ...draft, layout }), [draft, layout]);
  const visibleLayers = useMemo(
    () => new Set(STAGE_AUTHORING_LAYERS.filter((layer) => layerState[layer].visible)),
    [layerState],
  );

  const emitChange = useCallback((next: IStageDoc) => {
    setHistory((current) => ({
      past: [...current.past, cloneStageDoc(draftRef.current)].slice(-HISTORY_LIMIT),
      future: [],
    }));
    draftRef.current = next;
    setDraft(next);
    onChange?.(next);
  }, [onChange]);

  const undo = useCallback(() => {
    const previous = history.past[history.past.length - 1];
    if (!previous) return;

    setHistory({
      past: history.past.slice(0, -1),
      future: [cloneStageDoc(draftRef.current), ...history.future].slice(0, HISTORY_LIMIT),
    });
    const next = cloneStageDoc(previous);
    draftRef.current = next;
    setDraft(next);
    onChange?.(next);
  }, [history, onChange]);

  const redo = useCallback(() => {
    const nextFuture = history.future[0];
    if (!nextFuture) return;

    setHistory({
      past: [...history.past, cloneStageDoc(draftRef.current)].slice(-HISTORY_LIMIT),
      future: history.future.slice(1),
    });
    const next = cloneStageDoc(nextFuture);
    draftRef.current = next;
    setDraft(next);
    onChange?.(next);
  }, [history, onChange]);

  const clearHistory = useCallback(() => {
    setHistory({ past: [], future: [] });
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const selectAsset = useCallback((assetName: string) => {
    const asset = assetsByName.get(assetName);
    const layer = resolveStageAssetAuthoringLayer(asset);
    setSelectedAssetName(assetName);
    setActiveLayer(layer);
    setLayerState((current) => ({
      ...current,
      [layer]: { ...current[layer], visible: true },
    }));
  }, [assetsByName]);

  const upsertTileAt = useCallback((gridX: number, gridY: number, assetNameOverride?: string) => {
    if (readOnly) return;
    const assetName = assetNameOverride || selectedAssetName;
    if (!assetName) return;
    const asset = assetsByName.get(assetName);
    const layer = resolveStageAssetAuthoringLayer(asset);
    if (layerState[layer].locked) {
      toast.error(lang({ ko: "잠긴 레이어에는 배치할 수 없습니다.", en: "You cannot place assets on a locked layer." }));
      return;
    }

    let cells: GridPoint[];
    try {
      cells = listFootprintCells({ gridX, gridY }, getAssetFootprint(asset));
    } catch {
      toast.error(lang({ ko: "에셋 풋프린트 메타가 올바르지 않습니다.", en: "The asset footprint metadata is invalid." }));
      return;
    }
    if (!cells.every((cell) => cell.gridX >= 0 && cell.gridY >= 0 && cell.gridX < layout.width && cell.gridY < layout.height)) {
      toast.error(lang({ ko: "에셋 풋프린트가 맵 경계를 벗어납니다.", en: "The asset footprint exceeds the map boundary." }));
      return;
    }

    const existingIndex = layout.tiles.findIndex((tile) =>
      tile.x === gridX && tile.y === gridY && resolveStageTileAuthoringLayer(tile, assetsByName.get(tile.assetName)) === layer,
    );
    const existingTileId = existingIndex >= 0 ? layout.tiles[existingIndex].id : null;
    const targetKeys = new Set(cells.map((cell) => `${cell.gridX}:${cell.gridY}`));
    const overlapping = tileOccupancy.find((entry) => {
      if (entry.tile.id === existingTileId) return false;
      const entryLayer = resolveStageTileAuthoringLayer(entry.tile, assetsByName.get(entry.tile.assetName));
      return doStageAuthoringLayersConflict(layer, entryLayer) && entry.cells.some((cell) => targetKeys.has(`${cell.gridX}:${cell.gridY}`));
    });
    if (overlapping) {
      toast.error(lang({ ko: "같은 물리 레이어의 다른 에셋과 겹칩니다.", en: "This overlaps another asset on the same physical layer." }));
      return;
    }
    if (existingIndex < 0 && layout.tiles.length >= STAGE_MAP_LIMITS.maxTileInstances) {
      toast.error(lang({ ko: `배치 한도 ${STAGE_MAP_LIMITS.maxTileInstances.toLocaleString()}개에 도달했습니다.`, en: `The ${STAGE_MAP_LIMITS.maxTileInstances.toLocaleString()} placement limit has been reached.` }));
      return;
    }

    const current = existingIndex >= 0 ? layout.tiles[existingIndex] : undefined;
    const baseTile: IStageLayoutTile = {
      id: current?.id || `tile_${layer}_${gridX}_${gridY}_${Date.now().toString(36)}`,
      assetName,
      x: gridX,
      y: gridY,
      rotation: current?.rotation ?? 0,
      scale: current?.scale ?? 1,
      state: current?.state ?? "normal",
      meta: {
        ...(current?.meta || {}),
        authoringLayer: layer,
        isoLayer: layer === "boundary" ? "object" : layer,
        ...(layer === "boundary" ? { roles: ["boundary"] } : {}),
      },
    };
    const tiles = [...layout.tiles];
    if (existingIndex >= 0) tiles[existingIndex] = baseTile;
    else tiles.push(baseTile);
    setSelectedTileId(baseTile.id);
    emitChange({ ...draft, layout: { ...layout, mode: "manual", tiles } });
  }, [assetsByName, draft, emitChange, layerState, layout, readOnly, selectedAssetName, tileOccupancy]);

  const applyPaint = useCallback((points: GridPoint[]) => {
    if (readOnly || tool === "select") return;
    if (layerState[activeLayer].locked) {
      toast.error(lang({ ko: "잠긴 레이어는 편집할 수 없습니다.", en: "The locked layer cannot be edited." }));
      return;
    }
    const result = applyStageMapPaint({
      tool,
      points,
      brushRadius,
      activeLayer,
      assetName: selectedAssetName,
      assets,
      tiles: layout.tiles,
      width: layout.width,
      height: layout.height,
      maxTileInstances: STAGE_MAP_LIMITS.maxTileInstances,
    });
    if (result.issue === "asset_not_found") {
      toast.error(lang({ ko: "먼저 페인트할 에셋을 선택하세요.", en: "Select an asset to paint first." }));
      return;
    }
    if (result.issue === "asset_requires_single_cell") {
      toast.error(lang({ ko: "브러시·채우기는 1×1 지형 에셋만 지원합니다.", en: "Brush and fill tools support only 1×1 terrain assets." }));
      return;
    }
    if (result.changed > 0) {
      setSelectedTileId(null);
      emitChange({ ...draft, layout: { ...layout, mode: "manual", tiles: result.tiles } });
    }
    if (result.truncated) {
      toast.warning(lang({ ko: `배치 상한 ${STAGE_MAP_LIMITS.maxTileInstances.toLocaleString()}개에서 작업을 중단했습니다.`, en: `Painting stopped at the ${STAGE_MAP_LIMITS.maxTileInstances.toLocaleString()} placement limit.` }));
    } else if (result.skipped > 0) {
      toast.info(lang({ ko: `겹침 셀 ${result.skipped}개를 건너뛰었습니다.`, en: `Skipped ${result.skipped} overlapping cells.` }));
    }
  }, [activeLayer, assets, brushRadius, draft, emitChange, layerState, layout, readOnly, selectedAssetName, tool]);

  const handleCellClick = useCallback((cell: GridPoint) => {
    if (tool !== "select") {
      applyPaint([cell]);
      return;
    }
    const occupied = tileOccupancy.find((entry) => {
      const layer = resolveStageTileAuthoringLayer(entry.tile, assetsByName.get(entry.tile.assetName));
      return layerState[layer].visible && entry.cells.some(
        (candidate) => candidate.gridX === cell.gridX && candidate.gridY === cell.gridY,
      );
    });
    if (occupied) {
      setSelectedTileId(occupied.tile.id);
      if (!readOnly && selectedAssetName) upsertTileAt(cell.gridX, cell.gridY);
      return;
    }
    upsertTileAt(cell.gridX, cell.gridY);
  }, [applyPaint, assetsByName, layerState, readOnly, selectedAssetName, tileOccupancy, tool, upsertTileAt]);

  const removeSelectedTile = useCallback(() => {
    if (readOnly || !selectedTile) return;
    const layer = resolveStageTileAuthoringLayer(selectedTile, assetsByName.get(selectedTile.assetName));
    if (layerState[layer].locked) return;
    emitChange({ ...draft, layout: { ...layout, tiles: layout.tiles.filter((tile) => tile.id !== selectedTile.id) } });
    setSelectedTileId(null);
  }, [assetsByName, draft, emitChange, layerState, layout, readOnly, selectedTile]);

  const updateSelectedTile = useCallback((patch: Partial<IStageLayoutTile>) => {
    if (readOnly || !selectedTile) return;
    const layer = resolveStageTileAuthoringLayer(selectedTile, assetsByName.get(selectedTile.assetName));
    if (layerState[layer].locked) return;
    emitChange({
      ...draft,
      layout: {
        ...layout,
        tiles: layout.tiles.map((tile) => tile.id === selectedTile.id ? { ...tile, ...patch } : tile),
      },
    });
  }, [assetsByName, draft, emitChange, layerState, layout, readOnly, selectedTile]);

  const handleAutoLayout = useCallback((preserveExisting: boolean) => {
    if (readOnly) return;
    const result = buildAutoLayoutForStageDoc(draft, {
      width: layout.width,
      height: layout.height,
      preserveExistingTiles: preserveExisting,
    });
    setSelectedTileId(null);
    emitChange({ ...draft, layout: result.layout });
  }, [draft, emitChange, layout.height, layout.width, readOnly]);

  const handleResizeMap = useCallback(async () => {
    if (readOnly) return;
    const width = Math.floor(Number(mapWidth));
    const height = Math.floor(Number(mapHeight));
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > STAGE_MAP_LIMITS.maxWidth || height > STAGE_MAP_LIMITS.maxHeight || width * height > STAGE_MAP_LIMITS.maxCells) {
      toast.error(lang({ ko: `맵은 총 ${STAGE_MAP_LIMITS.maxCells.toLocaleString()}셀 이하여야 합니다.`, en: `The map must contain at most ${STAGE_MAP_LIMITS.maxCells.toLocaleString()} cells.` }));
      return;
    }
    const outsideIds = new Set(tileOccupancy.filter((entry) => entry.cells.some((cell) => cell.gridX < 0 || cell.gridY < 0 || cell.gridX >= width || cell.gridY >= height)).map((entry) => entry.tile.id));
    if (outsideIds.size > 0) {
      const confirmed = await dialog.confirm({
        variant: "danger",
        message: lang({ ko: `경계 밖 에셋 ${outsideIds.size}개가 제거됩니다. 계속할까요?`, en: `${outsideIds.size} out-of-bounds assets will be removed. Continue?` }),
      });
      if (!confirmed) return;
    }
    emitChange({ ...draft, layout: { ...layout, width, height, mode: "manual", tiles: layout.tiles.filter((tile) => !outsideIds.has(tile.id)) } });
    setSelectedTileId((current) => current && outsideIds.has(current) ? null : current);
  }, [draft, emitChange, layout, mapHeight, mapWidth, readOnly, tileOccupancy]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    try {
      setSaving(true);
      await onSave(draftWithLayout);
      clearHistory();
      toast.success(lang({ ko: "맵을 저장했습니다.", en: "Map saved." }));
    } catch (error) {
      logger.error("[StageMapEditor] 저장 중 오류:", error);
      toast.error(lang({ ko: "맵 저장에 실패했습니다.", en: "Failed to save the map." }));
    } finally {
      setSaving(false);
    }
  }, [clearHistory, draftWithLayout, onSave]);

  const toggleLayerState = useCallback((layer: StageAuthoringLayerType, key: "visible" | "locked") => {
    setLayerState((current) => ({ ...current, [layer]: { ...current[layer], [key]: !current[layer][key] } }));
    if (key === "visible" && layerState[layer].visible && selectedTile) {
      const selectedLayer = resolveStageTileAuthoringLayer(selectedTile, assetsByName.get(selectedTile.assetName));
      if (selectedLayer === layer) setSelectedTileId(null);
    }
  }, [assetsByName, layerState, selectedTile]);

  return {
    activeLayer,
    assets,
    canRedo,
    canUndo,
    brushRadius,
    draft,
    draftWithLayout,
    handleAutoLayout,
    handleCellClick,
    handleCellStroke: applyPaint,
    handleResizeMap,
    handleSave,
    layerState,
    layout,
    mapHeight,
    mapWidth,
    removeSelectedTile,
    saving,
    redo,
    selectAsset,
    selectedAssetName,
    selectedTile,
    setActiveLayer,
    setBrushRadius,
    setMapHeight,
    setMapWidth,
    setShowCollision,
    setTool,
    showCollision,
    tool,
    toggleLayerState,
    undo,
    updateSelectedTile,
    upsertTileAt,
    visibleLayers,
  };
}
