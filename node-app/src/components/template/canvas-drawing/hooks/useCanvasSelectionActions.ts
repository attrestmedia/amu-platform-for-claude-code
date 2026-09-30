"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Point } from "../CanvasDrawingTypes";
import type { useCanvasDrawingRefs } from "./useCanvasDrawingRefs";
import type { useDrawingDoc } from "./useDrawingDoc";
import type { useOverlayRenderer } from "./useOverlayRenderer";
import type { useSnapGuides } from "./useSnapGuides";
import type { useStageCanvas } from "./useStageCanvas";

export function useCanvasSelectionActions({
  selectedItemId,
  selectedCommentId,
  setSelectedItemId,
  setSelectedCommentId,
  setPolyPoints,
  docApi,
  stageApi,
  overlayApi,
  snapApi,
  refs,
}: {
  selectedItemId: string | null;
  selectedCommentId: string | null;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedCommentId: Dispatch<SetStateAction<string | null>>;
  setPolyPoints: Dispatch<SetStateAction<Point[]>>;
  docApi: ReturnType<typeof useDrawingDoc>;
  stageApi: ReturnType<typeof useStageCanvas>;
  overlayApi: ReturnType<typeof useOverlayRenderer>;
  snapApi: ReturnType<typeof useSnapGuides>;
  refs: ReturnType<typeof useCanvasDrawingRefs>;
}) {
  const clearAll = () => {
    const empty = { items: [], comments: [] };
    docApi.reset(empty);
    setSelectedItemId(null);
    setSelectedCommentId(null);
    setPolyPoints([]);
    refs.clearPolyHover();
    snapApi.clearGuides();
    overlayApi.clearOverlay();
    stageApi.renderBase(empty);
  };

  const deleteSelected = () => {
    const current = docApi.docRef.current;
    if (selectedCommentId) {
      docApi.applyPush({ ...current, comments: current.comments.filter((comment) => comment.id !== selectedCommentId) });
      setSelectedCommentId(null);
    } else if (selectedItemId) {
      const next = { ...current, items: current.items.filter((item) => item.id !== selectedItemId) };
      docApi.applyPush(next);
      stageApi.renderBase(next);
      setSelectedItemId(null);
      overlayApi.clearOverlay();
    }
  };

  return { clearAll, deleteSelected };
}
