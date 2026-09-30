/**
 * @docHint
 * @purpose CardNews editor가 renderer와 분리해 소유할 선택·입력 overlay·문서 commit 계약
 * @process editor interaction → CardDeck commit → prepared scene redraw
 * @domain card-news
 * @scope editor_controller
 */

import type {
  CardNewsEditorOnlyOverlay,
  CardNewsEditorOverlayState,
  CardNewsPreparedScene,
} from "types/card-news/scene";
import type { CardNewsDeckPayload } from "types/card-news/cardDeck";
import type { CardNewsLayer } from "types/card-news/cardDeck";

export type CardNewsEditorDocumentChange = {
  document: CardNewsDeckPayload;
  reason: "text-input" | "layer-edit" | "card-edit" | "reorder";
};

export type CardNewsEditorController = {
  getOverlayState: () => CardNewsEditorOverlayState;
  setActiveCard: (cardId: string) => void;
  setSelectedLayer: (layerId: string | null) => void;
  beginTextInput: (layerId: string) => void;
  endTextInput: (change: CardNewsEditorDocumentChange) => void;
  commit: (change: CardNewsEditorDocumentChange) => void;
  render: (scene: CardNewsPreparedScene) => void;
};

export type CardNewsEditorOverlayContract = {
  overlays: readonly CardNewsEditorOnlyOverlay[];
  exportIncludes: readonly [];
  rendererOwns: readonly ["background", "layers", "watermark"];
};

export const CARD_NEWS_EDITOR_OVERLAY_CONTRACT: CardNewsEditorOverlayContract = {
  overlays: ["selection", "guide", "cursor", "text-input", "layer-list"],
  exportIncludes: [],
  rendererOwns: ["background", "layers", "watermark"],
};

export type CardNewsLayerHit = {
  layerId: string;
  layerType: CardNewsLayer["type"];
};

export function hitTestCardNewsLayers(
  layers: readonly CardNewsLayer[],
  normalizedPoint: { x: number; y: number },
): CardNewsLayerHit | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (
      normalizedPoint.x >= layer.box.x &&
      normalizedPoint.x <= layer.box.x + layer.box.w &&
      normalizedPoint.y >= layer.box.y &&
      normalizedPoint.y <= layer.box.y + layer.box.h
    ) {
      return { layerId: layer.id, layerType: layer.type };
    }
  }
  return null;
}
