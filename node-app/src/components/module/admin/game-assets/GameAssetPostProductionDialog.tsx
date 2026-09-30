"use client";

import { toast } from "sonner";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app";
import { SPRITE_SHEET_V2_CONTRACT } from "consts/game/gameAssetTemplates";
import { ImageOverlayDrawingDialog } from "components/module/image/ImageOverlayDrawingDialog";
import { Lang, lang } from "components/module/i18n";
import { updateGameAsset, uploadGameAssetImage } from "libs/api/game";
import type { NormalizedFrameGuide } from "components/template/canvas-drawing/CanvasDrawingTypes";
import type { SpritePostProductionConfig } from "components/template/canvas-drawing/modules/sprite/SpritePostProductionTypes";
import type { IPersonaSprite, PersonaSpriteDirection } from "types/ai";
import type { IGameAssetDoc } from "types/game";
import { toUnknownRecord } from "utils/common/typeUtils";
import { useSpritePostProductionContext } from "./useSpritePostProductionContext";

function getFrameGuide(asset: IGameAssetDoc): NormalizedFrameGuide | null {
  const sheet = asset.spriteSheet;
  if (sheet) {
    return {
      columns: sheet.columns,
      rows: sheet.rows,
      anchorX: asset.runtime?.anchor?.x ?? 0.5,
      anchorY: asset.runtime?.anchor?.y ?? 0.88,
      safeAreaInset: 0.08,
      showFrameNumbers: true,
    };
  }
  if (["character-sprite", "stage-tileset", "prop-sheet", "building-sheet"].includes(asset.assetType)) {
    return {
      columns: 4,
      rows: asset.assetType === "character-sprite" ? 8 : 4,
      anchorX: 0.5,
      anchorY: asset.assetType === "character-sprite" ? 0.88 : 0.9,
      safeAreaInset: 0.08,
      showFrameNumbers: true,
    };
  }
  return null;
}

function getSpritePostProductionConfig(
  asset: IGameAssetDoc,
  bible?: { bibleSourceUrl?: string; bibleDirections?: string[] },
): SpritePostProductionConfig | null {
  const sheet = asset.spriteSheet;
  if (asset.assetType !== "character-sprite" || !sheet) return null;

  const contractRows = (SPRITE_SHEET_V2_CONTRACT.rowOrder as readonly PersonaSpriteDirection[]).slice(
    0,
    sheet.rows >= 8 ? 8 : 4,
  );
  const directionRows = Array.from({ length: Math.min(sheet.rows, contractRows.length) }, (_, row) => {
    return (
      contractRows.find((direction) => Number(sheet.animations?.[direction]?.row) === row) ||
      contractRows[row] ||
      "down"
    );
  });
  const fallbackFrames = Array.from({ length: Math.max(1, sheet.columns) }, (_, index) => index);
  const animations = Object.fromEntries(
    contractRows.map((direction, fallbackRow) => {
      const source = sheet.animations?.[direction];
      return [
        direction,
        {
          row: Math.min(sheet.rows - 1, Math.max(0, Number(source?.row ?? fallbackRow))),
          frames: source?.frames?.length ? source.frames : fallbackFrames,
        },
      ];
    }),
  ) as IPersonaSprite["animations"];
  const meta = toUnknownRecord(asset.meta);

  return {
    directionRows,
    bibleSourceUrl: String(bible?.bibleSourceUrl || ""),
    bibleDirections: bible?.bibleDirections || [],
    exportBaseName: asset.gameAssetId,
    sprite: {
      url: asset.storage.url,
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      columns: sheet.columns,
      rows: sheet.rows,
      fps: sheet.fps || 8,
      directionCount: sheet.rows >= 8 ? 8 : 4,
      animations,
    },
    manifest: {
      version: 2,
      image: `${asset.gameAssetId}.webp`,
      spriteSheet: sheet,
      runtime: {
        anchor: asset.runtime?.anchor || { x: 0.5, y: 0.88 },
        textureKey: asset.runtime?.textureKey || asset.gameAssetId,
        scale: asset.runtime?.scale ?? 1,
      },
      meta: {
        pipelineId: String(meta.pipelineId || ""),
        spriteSheetProfile: String(meta.spriteSheetProfile || "v2"),
        frameCount: Number(meta.frameCount || sheet.columns),
        spriteAction: toUnknownRecord(meta.spriteAction),
      },
    },
  };
}

export function GameAssetPostProductionDialog({
  open,
  asset,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  asset: IGameAssetDoc | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const spriteContext = useSpritePostProductionContext(asset, open && asset?.assetType === "character-sprite");
  if (!asset?.storage?.url) return null;
  const frameGuide = getFrameGuide(asset);
  const spritePostProduction = getSpritePostProductionConfig(asset, spriteContext.data);

  return (
    <ImageOverlayDrawingDialog
      key={`${asset.gameAssetId}:${asset.storage.url}`}
      open={open}
      onOpenChange={onOpenChange}
      imageSrc={asset.storage.url}
      imageName={asset.name || asset.gameAssetId}
      disabled={asset.status === "published"}
      postProductionMode
      frameGuide={frameGuide}
      spritePostProduction={spritePostProduction}
      titleText={{ ko: "게임 에셋 후보정 스튜디오", en: "Game asset post-production studio" }}
      regionCaptureLabel={{ ko: "영역 선택", en: "Select region" }}
      cropRegionLabel={{ ko: "선택 영역으로 자르기", en: "Crop to selection" }}
      applyLabel={<Lang text={{ ko: "최종 에셋 저장", en: "Save final asset" }} />}
      applyingLabel={<Lang text={{ ko: "R2에 저장 중...", en: "Saving to R2..." }} />}
      onApply={async (file, options) => {
        const storage = await uploadGameAssetImage({
          gameAssetId: asset.gameAssetId,
          universeId: asset.universeId || DEFAULT_PLAY_UNIVERSE,
          file,
          preferredFileName: `${asset.gameAssetId}-post-processed.png`,
        });
        await updateGameAsset({
          gameAssetId: asset.gameAssetId,
          sourceType: "edited",
          storage,
          meta: {
            ...(asset.meta || {}),
            postProduction: {
              version: 2,
              editor: "canvas-drawing",
              editedAt: new Date().toISOString(),
              sourceStorageKey: asset.storage.key || "",
              ...(options.spriteNormalization ? { spriteNormalization: options.spriteNormalization } : {}),
            },
          },
        });
        toast.success(lang({ ko: "후보정 에셋을 R2에 저장했습니다.", en: "Saved the post-processed asset to R2." }));
        await onSaved();
      }}
    />
  );
}
