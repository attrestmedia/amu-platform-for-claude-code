"use client";

import { useMemo, useState } from "react";
import {
  Brush,
  Eraser,
  Eye,
  EyeOff,
  Lock,
  Maximize2,
  MousePointer2,
  Paintbrush,
  Play,
  Redo2,
  Square,
  Undo2,
  Unlock,
} from "lucide-react";
import { Button, Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { IStageDoc } from "types/game/stage-doc";
import {
  buildStageDataFromDoc,
  resolveStageAssetAuthoringLayer,
  STAGE_AUTHORING_LAYERS,
  STAGE_BRUSH_RADII,
  STAGE_MAP_LIMITS,
} from "utils/game";
import { cn } from "utils/common";
import { IsometricStageCanvas } from "./IsometricStageCanvas";
import { useStageMapEditor, type StageMapEditorToolType } from "./useStageMapEditor";

interface StageMapEditorProps {
  stageDoc: IStageDoc;
  readOnly?: boolean;
  variant?: "default" | "studio";
  onChange?: (doc: IStageDoc) => void;
  onSave?: (doc: IStageDoc) => Promise<void> | void;
  onPreview?: () => void;
}

const TOOL_CONFIG = [
  { key: "select", icon: MousePointer2, label: { ko: "선택·배치", en: "Select & place" } },
  { key: "brush", icon: Brush, label: { ko: "브러시", en: "Brush" } },
  { key: "rectangle", icon: Square, label: { ko: "사각 채우기", en: "Rectangle fill" } },
  { key: "fill", icon: Paintbrush, label: { ko: "연결 영역 채우기", en: "Flood fill" } },
  { key: "eraser", icon: Eraser, label: { ko: "지우개", en: "Eraser" } },
] as const;

const LAYER_LABELS = {
  ground: { ko: "지형", en: "Ground" },
  object: { ko: "오브젝트", en: "Object" },
  boundary: { ko: "통행 불가", en: "Impassable" },
  overlay: { ko: "장식", en: "Decor" },
} as const;

export function StageMapEditor({
  stageDoc,
  readOnly = false,
  variant = "default",
  onChange,
  onSave,
  onPreview,
}: StageMapEditorProps) {
  const editor = useStageMapEditor({ stageDoc, readOnly, onChange, onSave });
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const studio = variant === "studio";
  const stageDataPreview = useMemo(() => {
    try {
      return buildStageDataFromDoc(editor.draft).data;
    } catch {
      return null;
    }
  }, [editor.draft]);
  const layerPanel = (
    <div
      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      aria-label={lang({ ko: "맵 레이어", en: "Map layers" })}
    >
      {STAGE_AUTHORING_LAYERS.map((layer) => {
        const state = editor.layerState[layer];
        return (
          <div
            key={layer}
            className={cn(
              "flex min-h-11 items-center rounded-md border bg-background",
              editor.activeLayer === layer && "border-primary",
            )}
          >
            <button
              type="button"
              className="min-h-11 flex-1 px-3 text-left text-sm font-medium focus-visible-ring"
              aria-pressed={editor.activeLayer === layer}
              onClick={() => editor.setActiveLayer(layer)}
            >
              <Lang text={LAYER_LABELS[layer]} />
            </button>
            <Button
              variant="ghost"
              size="icon-md"
              rounded="none"
              aria-label={lang(
                state.visible
                  ? { ko: `${LAYER_LABELS[layer].ko} 숨기기`, en: `Hide ${LAYER_LABELS[layer].en}` }
                  : { ko: `${LAYER_LABELS[layer].ko} 보기`, en: `Show ${LAYER_LABELS[layer].en}` },
              )}
              aria-pressed={state.visible}
              onClick={() => editor.toggleLayerState(layer, "visible")}
            >
              {state.visible ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
            </Button>
            <Button
              variant="ghost"
              size="icon-md"
              rounded="none"
              aria-label={lang(
                state.locked
                  ? { ko: `${LAYER_LABELS[layer].ko} 잠금 해제`, en: `Unlock ${LAYER_LABELS[layer].en}` }
                  : { ko: `${LAYER_LABELS[layer].ko} 잠그기`, en: `Lock ${LAYER_LABELS[layer].en}` },
              )}
              aria-pressed={state.locked}
              onClick={() => editor.toggleLayerState(layer, "locked")}
            >
              {state.locked ? <Lock className="size-4" aria-hidden /> : <Unlock className="size-4" aria-hidden />}
            </Button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            <Lang text={{ ko: "스테이지 맵 에디터", en: "Stage Map Editor" }} /> — {editor.draft.stageId} /{" "}
            {editor.draft.stageName}
          </p>
          <p className="text-xs text-muted-foreground">
            {editor.layout.width} × {editor.layout.height} · {editor.layout.tiles.length.toLocaleString()} /{" "}
            {STAGE_MAP_LIMITS.maxTileInstances.toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {studio ? (
            <div
              className="flex items-center gap-1 rounded-lg border border-border bg-background p-1"
              role="toolbar"
              aria-label={lang({ ko: "맵 보기 도구", en: "Map view tools" })}
            >
              <Button
                variant="ghost"
                size="icon-md"
                className="min-h-11 min-w-11"
                aria-label={lang({ ko: "실행 취소", en: "Undo" })}
                disabled={readOnly || !editor.canUndo}
                onClick={editor.undo}
              >
                <Undo2 className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-md"
                className="min-h-11 min-w-11"
                aria-label={lang({ ko: "다시 실행", en: "Redo" })}
                disabled={readOnly || !editor.canRedo}
                onClick={editor.redo}
              >
                <Redo2 className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-md"
                className="min-h-11 min-w-11"
                aria-label={lang({ ko: "맵 전체 보기", en: "Fit map" })}
                onClick={() => setFitRequestKey((current) => current + 1)}
              >
                <Maximize2 className="size-4" aria-hidden />
              </Button>
              {onPreview ? (
                <Button
                  variant="ghost"
                  size="icon-md"
                  className="min-h-11 min-w-11"
                  aria-label={lang({ ko: "맵 미리보기", en: "Preview map" })}
                  onClick={onPreview}
                >
                  <Play className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          ) : null}
          {!studio && !readOnly ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-1">
              <Input
                aria-label={lang({ ko: "맵 너비", en: "Map width" })}
                type="number"
                inputMode="numeric"
                min={1}
                max={STAGE_MAP_LIMITS.maxWidth}
                value={editor.mapWidth}
                onChange={(event) => editor.setMapWidth(event.target.value)}
                className="h-11 w-20"
              />
              <span aria-hidden>×</span>
              <Input
                aria-label={lang({ ko: "맵 높이", en: "Map height" })}
                type="number"
                inputMode="numeric"
                min={1}
                max={STAGE_MAP_LIMITS.maxHeight}
                value={editor.mapHeight}
                onChange={(event) => editor.setMapHeight(event.target.value)}
                className="h-11 w-20"
              />
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => void editor.handleResizeMap()}>
                <Lang text={{ ko: "크기 적용", en: "Resize" }} />
              </Button>
            </div>
          ) : null}
          {!studio && !readOnly ? (
            <>
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => editor.handleAutoLayout(true)}>
                <Lang text={{ ko: "자동 배치", en: "Auto layout" }} />
              </Button>
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => editor.handleAutoLayout(false)}>
                <Lang text={{ ko: "초기화 후 자동 배치", en: "Reset & auto layout" }} />
              </Button>
            </>
          ) : null}
          {onSave ? (
            <Button
              size="sm"
              className="min-h-11"
              onClick={() => void editor.handleSave()}
              disabled={editor.saving || readOnly}
            >
              {studio ? <Play className="mr-1.5 size-4" aria-hidden /> : null}
              <Lang
                text={
                  editor.saving
                    ? { ko: "저장 중...", en: "Saving..." }
                    : studio
                      ? { ko: "맵 저장 및 미리보기", en: "Save & preview map" }
                      : { ko: "맵 저장", en: "Save map" }
                }
              />
            </Button>
          ) : null}
        </div>
      </div>

      {!readOnly ? (
        <section
          aria-label={lang({ ko: "맵 저작 도구", en: "Map authoring tools" })}
          className={cn("rounded-xl border border-border bg-muted/20 p-3", studio && "border-0 bg-transparent p-0")}
        >
          <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between", studio && "lg:items-stretch")}>
            <div
              className={cn("flex flex-wrap gap-2", studio && "md:w-14 md:flex-col")}
              role="toolbar"
              aria-label={lang({ ko: "페인팅 도구", en: "Painting tools" })}
            >
              {TOOL_CONFIG.map(({ key, icon: Icon, label }) => (
                <Button
                  key={key}
                  size="sm"
                  variant={editor.tool === key ? "primary" : "outline"}
                  className={cn("min-h-11", studio && "min-w-11 px-0")}
                  title={lang(label)}
                  aria-pressed={editor.tool === key}
                  onClick={() => editor.setTool(key as StageMapEditorToolType)}
                >
                  <Icon className="size-4" aria-hidden />
                  {studio ? <span className="sr-only"><Lang text={label} /></span> : <Lang text={label} />}
                </Button>
              ))}
              {!studio && (editor.tool === "brush" || editor.tool === "eraser") ? (
                <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
                  <Lang text={{ ko: "반경", en: "Radius" }} />
                  <select
                    value={editor.brushRadius}
                    onChange={(event) => editor.setBrushRadius(Number(event.target.value))}
                    className="bg-transparent font-medium focus-visible-ring"
                  >
                    {STAGE_BRUSH_RADII.map((radius) => (
                      <option key={radius} value={radius}>
                        {radius}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {!studio ? layerPanel : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            <Lang
              text={{
                ko: "브러시·지우개는 드래그, 사각 채우기는 시작점에서 끝점까지 드래그합니다. 방향키와 Enter/Space로도 셀을 편집할 수 있습니다.",
                en: "Drag to brush or erase, and drag from start to end for rectangle fill. Arrow keys and Enter/Space also edit cells.",
              }}
            />
          </p>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_16rem]">
        <aside className="flex min-w-0 flex-col gap-2 rounded-default border bg-background p-2">
          <h3 className="text-sm font-semibold">
            <Lang text={{ ko: "에셋 팔레트", en: "Asset palette" }} />
          </h3>
          <div className="flex max-h-[400px] flex-col gap-1 overflow-auto">
            {editor.assets.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                <Lang text={{ ko: "등록된 Stage 에셋이 없습니다.", en: "No stage assets registered." }} />
              </span>
            ) : null}
            {editor.assets.map((asset) => {
              const layer = resolveStageAssetAuthoringLayer(asset);
              return (
                <Button
                  key={asset.name}
                  disabled={readOnly || editor.layerState[layer].locked}
                  onClick={() => editor.selectAsset(asset.name)}
                  draggable={!readOnly}
                  onDragStart={(event) => {
                    editor.selectAsset(asset.name);
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("application/x-amu-stage-asset", asset.name);
                    event.dataTransfer.setData("text/plain", asset.name);
                  }}
                  className={cn(
                    "min-h-14 w-full justify-start border px-2 py-1 text-left text-xs",
                    editor.selectedAssetName === asset.name ? "bg-accent" : "bg-background",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- R2 런타임 에셋의 저해상도 팔레트 미리보기 */}
                  <img
                    src={asset.fileName}
                    alt=""
                    className="size-12 shrink-0 rounded-md border bg-muted object-contain"
                    draggable={false}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{asset.name}</span>
                    <span className="block truncate text-xxs text-muted-foreground">
                      {lang(LAYER_LABELS[layer])} · {asset.size.width}×{asset.size.height}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-2 rounded-default border bg-background p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <Lang
                text={{
                  ko: "휠 확대 · 선택 도구에서 드래그 이동 · 더블클릭 전체 보기",
                  en: "Wheel zoom · Drag pan with Select · Double-click fit",
                }}
              />
            </p>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              aria-pressed={editor.showCollision}
              onClick={() => editor.setShowCollision((current) => !current)}
            >
              <Lang
                text={
                  editor.showCollision
                    ? { ko: "충돌 숨기기", en: "Hide collision" }
                    : { ko: "충돌 보기", en: "Show collision" }
                }
              />
            </Button>
          </div>
          <div className="relative">
            <IsometricStageCanvas
              stageDoc={editor.draftWithLayout}
              selectedTileId={editor.selectedTile?.id || null}
              selectedAssetName={editor.selectedAssetName}
              showCollision={editor.showCollision}
              readOnly={readOnly}
              height={560}
              fitRequestKey={fitRequestKey}
              visibleLayers={editor.visibleLayers}
              interactionMode={
                editor.tool === "select" ? "navigate" : editor.tool === "rectangle" ? "rectangle" : "paint"
              }
              onCellClick={editor.handleCellClick}
              onCellStroke={editor.handleCellStroke}
              onAssetDrop={(cell, assetName) => {
                editor.selectAsset(assetName);
                editor.upsertTileAt(cell.gridX, cell.gridY, assetName);
              }}
            />
            {studio ? (
              <div className="pointer-events-auto absolute bottom-4 left-4 z-10 max-w-[calc(100%-2rem)] rounded-lg border border-border/80 bg-background/95 p-2 shadow-lg backdrop-blur-sm">
                {layerPanel}
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            <Lang
              text={{
                ko: `권장 ${STAGE_MAP_LIMITS.recommendedDimension}×${STAGE_MAP_LIMITS.recommendedDimension} · 최대 ${STAGE_MAP_LIMITS.maxWidth}×${STAGE_MAP_LIMITS.maxHeight} · 배치 ${STAGE_MAP_LIMITS.maxTileInstances.toLocaleString()}개. 큰 월드는 스테이지와 포털로 분리하세요.`,
                en: `Recommended ${STAGE_MAP_LIMITS.recommendedDimension}×${STAGE_MAP_LIMITS.recommendedDimension} · max ${STAGE_MAP_LIMITS.maxWidth}×${STAGE_MAP_LIMITS.maxHeight} · ${STAGE_MAP_LIMITS.maxTileInstances.toLocaleString()} placements. Split larger worlds into stages and portals.`,
              }}
            />
          </p>
        </section>

        <aside className="flex min-w-0 flex-col gap-2 rounded-default border bg-background p-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              <Lang text={{ ko: "타일 상세", en: "Tile details" }} />
            </h3>
            {!readOnly && editor.selectedTile ? (
              <Button size="sm" variant="outline" className="min-h-11" onClick={editor.removeSelectedTile}>
                <Lang text={{ ko: "삭제", en: "Remove" }} />
              </Button>
            ) : null}
          </div>
          {!editor.selectedTile ? (
            <span className="text-xs text-muted-foreground">
              <Lang text={{ ko: "선택된 타일이 없습니다.", en: "No tile selected." }} />
            </span>
          ) : (
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <span className="block text-xxs text-muted-foreground">assetName</span>
                <strong>{editor.selectedTile.assetName}</strong>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-xxs text-muted-foreground">gridX</span>
                  {editor.selectedTile.x}
                </div>
                <div>
                  <span className="block text-xxs text-muted-foreground">gridY</span>
                  {editor.selectedTile.y}
                </div>
              </div>
              <label>
                <span className="block text-xxs text-muted-foreground">rotation</span>
                <Input
                  type="number"
                  disabled={readOnly}
                  value={editor.selectedTile.rotation ?? 0}
                  onChange={(event) => editor.updateSelectedTile({ rotation: Number(event.target.value) || 0 })}
                />
              </label>
              <label>
                <span className="block text-xxs text-muted-foreground">scale</span>
                <Input
                  type="number"
                  step="0.1"
                  disabled={readOnly}
                  value={editor.selectedTile.scale ?? 1}
                  onChange={(event) => editor.updateSelectedTile({ scale: Number(event.target.value) || 1 })}
                />
              </label>
              <label>
                <span className="block text-xxs text-muted-foreground">state</span>
                <Input
                  disabled={readOnly}
                  value={editor.selectedTile.state ?? "normal"}
                  onChange={(event) => editor.updateSelectedTile({ state: event.target.value || "normal" })}
                />
              </label>
            </div>
          )}
          {stageDataPreview ? (
            <div className="mt-2 border-t pt-2 text-xxs text-muted-foreground">
              <div>obstacles: {stageDataPreview.obstacles.length}</div>
              {stageDataPreview.isoMeta ? (
                <div>
                  isoMeta: {stageDataPreview.isoMeta.gridWidth}×{stageDataPreview.isoMeta.gridHeight}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
