"use client";

import type { NormalizedFrameGuide } from "../../CanvasDrawingTypes";
import { AnchorAlignmentTool } from "./AnchorAlignmentTool";
import { BibleReferenceOverlay } from "./BibleReferenceOverlay";
import { OnionSkinOverlay } from "./OnionSkinOverlay";
import type { SpritePostProductionConfig } from "./SpritePostProductionTypes";
import type { SpritePostProductionController } from "./useSpritePostProduction";

export function SpritePostProductionOverlays({
  imageSrc,
  guide,
  config,
  controller,
}: {
  imageSrc: string;
  guide: NormalizedFrameGuide;
  config: SpritePostProductionConfig;
  controller: SpritePostProductionController;
}) {
  const direction = config.directionRows[controller.activeRow] || config.directionRows[0];
  return (
    <>
      {controller.onionVisible ? (
        <OnionSkinOverlay
          imageSrc={imageSrc}
          guide={guide}
          row={controller.activeRow}
          frame={controller.activeFrame}
        />
      ) : null}
      {controller.bibleVisible && config.bibleSourceUrl && direction ? (
        <BibleReferenceOverlay
          bibleSourceUrl={config.bibleSourceUrl}
          bibleDirections={config.bibleDirections || []}
          direction={direction}
          guide={guide}
          row={controller.activeRow}
          frame={controller.activeFrame}
        />
      ) : null}
      {controller.alignmentVisible && controller.analysis ? (
        <AnchorAlignmentTool analysis={controller.analysis} />
      ) : null}
    </>
  );
}
