"use client";

import { useState } from "react";
import type { BgMode, SizeMode } from "../CanvasDrawingTypes";

export function useCanvasStageSettings({
  fixedStageSize,
  embedded,
  forceTransparentBackground,
  backgroundImageSrc,
}: {
  fixedStageSize?: { width: number; height: number } | null;
  embedded: boolean;
  forceTransparentBackground: boolean;
  backgroundImageSrc?: string | null;
}) {
  const [sizeMode, setSizeMode] = useState<SizeMode>(fixedStageSize ? "fixed" : embedded ? "parent" : "window");
  const [fixedW, setFixedW] = useState(fixedStageSize?.width ?? 900);
  const [fixedH, setFixedH] = useState(fixedStageSize?.height ?? 540);
  const [bgMode, setBgMode] = useState<BgMode>(forceTransparentBackground || backgroundImageSrc ? "transparent" : "white");
  const [bgColor, setBgColor] = useState("#0b1020");

  const fixedSizeKey = fixedStageSize ? `${fixedStageSize.width}:${fixedStageSize.height}` : "";
  const [trackedFixedSizeKey, setTrackedFixedSizeKey] = useState(fixedSizeKey);
  if (trackedFixedSizeKey !== fixedSizeKey) {
    setTrackedFixedSizeKey(fixedSizeKey);
    if (fixedStageSize) {
      setFixedW(fixedStageSize.width);
      setFixedH(fixedStageSize.height);
      setSizeMode("fixed");
    }
  }

  const wantsTransparent = forceTransparentBackground || Boolean(backgroundImageSrc);
  const [trackedTransparent, setTrackedTransparent] = useState(wantsTransparent);
  if (trackedTransparent !== wantsTransparent) {
    setTrackedTransparent(wantsTransparent);
    if (wantsTransparent) setBgMode("transparent");
  }

  return { bgColor, bgMode, fixedH, fixedW, setBgColor, setBgMode, setFixedH, setFixedW, setSizeMode, sizeMode };
}
