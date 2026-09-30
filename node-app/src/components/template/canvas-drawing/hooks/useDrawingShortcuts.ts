"use client";

import { useEffect } from "react";
import type { DrawingDoc } from "../CanvasDrawingTypes";

export function useDrawingShortcuts(args: {
  tool: "select" | string;

  selectedItemId: string | null;
  selectedCommentId: string | null;

  polyVertexHoverRef: { current: { id: string; index: number } | null };
  stageRef: React.RefObject<HTMLDivElement | null>;

  docRef: { current: DrawingDoc };
  applyPush: (next: DrawingDoc) => DrawingDoc;

  undo: () => DrawingDoc | null;
  redo: () => DrawingDoc | null;

  deleteSelected: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = (navigator?.platform || "").toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) args.redo();
        else args.undo();
        return;
      }

      if ((mod && e.key.toLowerCase() === "y") || (mod && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        args.redo();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        // select 모드 + polygon vertex hover → 점 삭제 우선
        const vh = args.polyVertexHoverRef.current;
        if (args.tool === "select" && vh && args.selectedItemId === vh.id && !args.selectedCommentId) {
          const cur = args.docRef.current;
          const idx = cur.items.findIndex((x) => x.id === vh.id);
          if (idx >= 0) {
            const it = cur.items[idx];
            if (it.type === "polygon" && it.points.length > 3) {
              const nextPts = it.points.slice();
              nextPts.splice(vh.index, 1);
              const nextItems = cur.items.slice();
              nextItems[idx] = { ...it, points: nextPts };
              args.applyPush({ ...cur, items: nextItems });
              return;
            }
          }
        }

        args.deleteSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [args]);
}
