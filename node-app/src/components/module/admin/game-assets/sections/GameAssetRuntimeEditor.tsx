"use client";

import { Button, Input, Label } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { SpriteSheetPreview } from "components/module/game";
import { Lang, lang } from "components/module/i18n";
import { Eraser, ImagePlus, Paintbrush, Pause, Play, Save } from "lucide-react";
import { resolveChromaKeyProfileForAssetType } from "../GameAssetChromaKeyDialog";
import type { IGameAssetDoc } from "types/game";
import { cn } from "utils/common";
import { validateStageAssetProjectionMeta } from "utils/game";
import {
  REGION_MIN_SIZE,
  REGION_RESIZE_HANDLES,
  SPRITE_DIRECTION_GUIDES,
  clampNumber,
  getRegionRect,
} from "../gameAssetForgeModel";
import type { useGameAssetRuntimeEditor } from "../useGameAssetRuntimeEditor";
import { GameAssetPublishSection } from "./GameAssetPublishSection";

type RuntimeEditorType = ReturnType<typeof useGameAssetRuntimeEditor>;
type ProjectionValidationType = ReturnType<typeof validateStageAssetProjectionMeta> | null;

export function GameAssetRuntimeEditor({
  selectedAsset,
  editor,
  projectionMetaValidation,
  busy,
  onOpenPostProduction,
  onOpenChromaKey,
}: {
  selectedAsset: IGameAssetDoc | null;
  editor: RuntimeEditorType;
  projectionMetaValidation: ProjectionValidationType;
  busy: boolean;
  onOpenPostProduction: () => void;
  onOpenChromaKey: () => void;
}) {
  if (!selectedAsset) return null;

  const {
    activeRegionIndex,
    addRegion,
    beginRegionPointerDrag,
    changeRegion,
    metadataForm,
    regionPreviewRef,
    regionPreviewSize,
    removeRegion,
    saveMetadata,
    setActiveRegionIndex,
    setMetadataForm,
    spritePreview,
    spritePreviewPlaying,
    spriteSequenceIndex,
    setSpritePreviewPlaying,
  } = editor;

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-primary/20 bg-background p-4">
      <div>
        <h4 className="font-semibold"><Lang text={{ ko: "런타임 메타 편집", en: "Runtime Metadata" }} /></h4>
        <p className="text-sm text-muted-foreground">
          <Lang
            text={{
              ko: "캐릭터 스프라이트는 프레임 정보를, 타일/오브젝트 시트는 region 좌표를 저장합니다.",
              en: "Save frame metadata for character sprites and region coordinates for tiles/object sheets.",
            }}
          />
        </p>
      </div>

      {selectedAsset.storage?.url ? (
        <div className="space-y-3">
          <div className="flex max-h-56 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            <ImageBox
              src={selectedAsset.storage.url}
              alt={selectedAsset.name}
              minWidth={180}
              maxWidth={520}
              minHeight={160}
              maxHeight={220}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              <Lang
                text={{
                  ko:
                    selectedAsset.status === "published"
                      ? "발행된 에셋은 직접 덮어쓰지 않습니다. 상태를 변경하거나 새 드래프트를 만드세요."
                      : "프레임 가이드, 영역 복사·잘라내기·붙여넣기, 배경 제거를 사용할 수 있습니다.",
                  en:
                    selectedAsset.status === "published"
                      ? "Published assets are not overwritten. Change status or create a new draft."
                      : "Use frame guides, copy/cut/paste, and background removal.",
                }}
              />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={selectedAsset.status === "published"}
                onClick={onOpenPostProduction}
              >
                <Paintbrush className="size-4" aria-hidden />
                <Lang text={{ ko: "후보정 스튜디오", en: "Post-production studio" }} />
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={
                  selectedAsset.status === "published" ||
                  selectedAsset.storage.driver !== "r2" ||
                  !resolveChromaKeyProfileForAssetType(selectedAsset.assetType)
                }
                onClick={onOpenChromaKey}
              >
                <Eraser className="size-4" aria-hidden />
                <Lang text={{ ko: "크로마키 배경 제거", en: "Chroma key background removal" }} />
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-2 text-xxs text-muted-foreground">
            <span className="font-semibold"><Lang text={{ ko: "저장소 출처", en: "Storage provenance" }} /></span>
            <span className="ml-2">
              {selectedAsset.storage.driver === "r2"
                ? `r2 · ${selectedAsset.storage.access || "?"} · ${selectedAsset.storage.bucket || "?"}/${
                    selectedAsset.storage.key || "?"
                  }`
                : lang({ ko: "R2 이관 필요 (발행 차단 대상)", en: "R2 migration required (publish blocked)" })}
            </span>
          </div>

          {spritePreview ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold"><Lang text={{ ko: "스프라이트 미리보기", en: "Sprite Preview" }} /></p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  aria-pressed={spritePreviewPlaying}
                  onClick={() => setSpritePreviewPlaying((current) => !current)}
                >
                  {spritePreviewPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  {spritePreviewPlaying
                    ? <Lang text={{ ko: "일시정지", en: "Pause" }} />
                    : <Lang text={{ ko: "재생", en: "Play" }} />}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SPRITE_DIRECTION_GUIDES.map((guide) => (
                  <div key={guide.direction} className="space-y-1">
                    <div className="text-xxs font-medium text-muted-foreground">{guide.direction} · {guide.iso}</div>
                    <SpriteSheetPreview
                      sprite={spritePreview}
                      direction={guide.direction}
                      sequenceIndex={spriteSequenceIndex}
                      className="aspect-square rounded-lg border border-border bg-white"
                      imageClassName="bg-white"
                      alt={`${guide.direction}-${guide.iso}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {metadataForm.regions.length > 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold"><Lang text={{ ko: "Region 좌표 편집", en: "Region Coordinate Editor" }} /></p>
              <p className="mb-2 text-xxs text-muted-foreground">
                <Lang
                  text={{
                    ko: "박스를 드래그해 이동하고, 모서리를 드래그해 크기를 조정하세요.",
                    en: "Drag a box to move it, and drag its corners to resize it.",
                  }}
                />
              </p>
              <div
                ref={regionPreviewRef}
                className="relative mx-auto max-h-80 w-full max-w-xl touch-none overflow-hidden rounded-md border border-border bg-background"
                style={{
                  aspectRatio: `${regionPreviewSize.width} / ${regionPreviewSize.height}`,
                  backgroundImage: `url(${selectedAsset.storage.url})`,
                  backgroundSize: "100% 100%",
                  backgroundRepeat: "no-repeat",
                }}
              >
                {metadataForm.regions.map((region, index) => {
                  const rect = getRegionRect(region);
                  const x = clampNumber(rect.x, 0, regionPreviewSize.width - REGION_MIN_SIZE);
                  const y = clampNumber(rect.y, 0, regionPreviewSize.height - REGION_MIN_SIZE);
                  const width = clampNumber(rect.width, REGION_MIN_SIZE, regionPreviewSize.width - x);
                  const height = clampNumber(rect.height, REGION_MIN_SIZE, regionPreviewSize.height - y);
                  if (!width || !height) return null;
                  const isActive = activeRegionIndex === index;
                  return (
                    <div
                      key={`${region.key}-${index}-overlay`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveRegionIndex(index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setActiveRegionIndex(index);
                      }}
                      onPointerDown={(event) => beginRegionPointerDrag(event, index, "move")}
                      className={cn(
                        "absolute cursor-move touch-none border text-left transition",
                        isActive
                          ? "z-10 border-primary bg-primary/20 ring-2 ring-primary/30"
                          : "border-amber-400 bg-amber-300/15 hover:bg-amber-300/25",
                      )}
                      style={{
                        left: `${(x / regionPreviewSize.width) * 100}%`,
                        top: `${(y / regionPreviewSize.height) * 100}%`,
                        width: `${(width / regionPreviewSize.width) * 100}%`,
                        height: `${(height / regionPreviewSize.height) * 100}%`,
                      }}
                    >
                      <span className="absolute left-1 top-1 max-w-[90%] truncate rounded bg-background/90 px-1 text-xxs font-medium">
                        {region.key || `#${index + 1}`}
                      </span>
                      {isActive
                        ? REGION_RESIZE_HANDLES.map((handle) => (
                            <span
                              key={`${region.key}-${index}-${handle.mode}`}
                              className={cn(
                                "absolute h-3 w-3 touch-none rounded-full border border-background bg-primary",
                                handle.className,
                              )}
                              onPointerDown={(event) => beginRegionPointerDrag(event, index, handle.mode)}
                            />
                          ))
                        : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-5">
        {([
          ["Frame W", "frameWidth"],
          ["Frame H", "frameHeight"],
          ["Columns", "columns"],
          ["Rows", "rows"],
          ["FPS", "fps"],
        ] as const).map(([label, key]) => (
          <Label key={key} label={label}>
            <Input
              type="number"
              min={1}
              value={metadataForm[key]}
              onChange={(event) => setMetadataForm((prev) => ({ ...prev, [key]: event.target.value }))}
            />
          </Label>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold"><Lang text={{ ko: "시트 Regions", en: "Sheet Regions" }} /></p>
          <Button variant="outline" size="xs" onClick={addRegion}>
            <ImagePlus size={12} />
            <Lang text={{ ko: "추가", en: "Add" }} />
          </Button>
        </div>
        {metadataForm.regions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            <Lang text={{ ko: "region이 없습니다.", en: "No regions." }} />
          </div>
        ) : (
          <div className="space-y-2">
            {metadataForm.regions.map((region, index) => (
              <div
                key={`${region.key}-${index}`}
                className={cn(
                  "grid gap-2 rounded-lg border p-2 sm:grid-cols-7",
                  activeRegionIndex === index && "border-primary bg-primary/5",
                )}
                onFocus={() => setActiveRegionIndex(index)}
              >
                {(["key", "x", "y", "width", "height", "role"] as const).map((key) => (
                  <Input
                    key={key}
                    value={region[key]}
                    onChange={(event) => changeRegion(index, { [key]: event.target.value })}
                    placeholder={key === "width" ? "w" : key === "height" ? "h" : key}
                  />
                ))}
                <Button variant="outline" size="xs" onClick={() => removeRegion(index)}>
                  <Lang text={{ ko: "삭제", en: "Remove" }} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button onClick={saveMetadata} disabled={busy}>
        <Save size={16} />
        <Lang text={{ ko: "메타 저장", en: "Save Metadata" }} />
      </Button>

      <GameAssetPublishSection
        selectedAsset={selectedAsset}
        editor={editor}
        projectionMetaValidation={projectionMetaValidation}
        busy={busy}
      />
    </div>
  );
}
