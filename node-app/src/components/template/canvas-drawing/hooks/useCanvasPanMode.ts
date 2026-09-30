"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import type { Tool } from "../CanvasDrawingTypes";

export function useCanvasPanMode({
  enabled,
  captureMode,
  tool,
  draftOpen,
  cancelInteractionRef,
}: {
  enabled: boolean;
  captureMode: "none" | "selecting" | "ready";
  tool: Tool;
  draftOpen: boolean;
  cancelInteractionRef: MutableRefObject<() => void>;
}) {
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || draftOpen || isEditableTarget(event.target)) return;
      event.preventDefault();
      if (event.repeat) return;
      setSpacePanActive(true);
      cancelInteractionRef.current();
    };
    const reset = () => {
      setSpacePanActive(false);
      setIsPanning(false);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") reset();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", reset);
    };
  }, [cancelInteractionRef, draftOpen, enabled]);

  return {
    isPanning,
    panActive: enabled && captureMode === "none" && (tool === "hand" || spacePanActive),
    setIsPanning,
  };
}
