"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentBreakpoint } from "utils/common";

type Args = {
  minLeftWidthPx?: number;
  minRightWidthPx?: number;
  handleWidthPx?: number;
  storageKey?: string;
};

const DEFAULT_SPLIT_WIDTH_STORAGE_KEY = "amu:gen-studio:preset-detail:left-panel-width";

export function useResizableSplitLayout({
  minLeftWidthPx = 320,
  minRightWidthPx = 320,
  handleWidthPx = 8,
  storageKey = DEFAULT_SPLIT_WIDTH_STORAGE_KEY,
}: Args = {}) {
  const [isWideLayout, setIsWideLayout] = useState(() => getCurrentBreakpoint() !== "sm");
  const [leftPanelWidthPx, setLeftPanelWidthPx] = useState<number | null>(null);
  const [isSplitResizing, setIsSplitResizing] = useState(false);

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const splitDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const readStoredWidth = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  const persistWidth = useCallback(
    (width: number) => {
      try {
        window.localStorage.setItem(storageKey, String(Math.round(width)));
      } catch {
        // localStorage 접근 실패 시 무시
      }
    },
    [storageKey],
  );

  useEffect(() => {
    const syncLayout = () => setIsWideLayout(getCurrentBreakpoint() !== "sm");
    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  useEffect(function syncSplitOnLayoutChange() {
    if (!isWideLayout) {
      splitDragRef.current = null;
      // 모바일 레이아웃으로 전환되면 분할 상태/너비 초기화 (외부 viewport에 sync)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSplitResizing(false);
      setLeftPanelWidthPx(null);
    }
  }, [isWideLayout]);

  const clampLeftPanelWidth = useCallback(
    (rawWidth: number) => {
      const containerWidth = splitContainerRef.current?.clientWidth ?? 0;
      if (!containerWidth) return rawWidth;

      const maxWidth = Math.max(minLeftWidthPx, containerWidth - minRightWidthPx - handleWidthPx);
      return Math.min(maxWidth, Math.max(minLeftWidthPx, rawWidth));
    },
    [handleWidthPx, minLeftWidthPx, minRightWidthPx],
  );

  useEffect(function hydrateLeftPanelWidthFromStorage() {
    if (!isWideLayout) return;
    const stored = readStoredWidth();
    if (stored == null) return;
    // localStorage(외부 시스템)에서 너비 복원
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeftPanelWidthPx(clampLeftPanelWidth(stored));
  }, [isWideLayout, readStoredWidth, clampLeftPanelWidth]);

  useEffect(function clampLeftPanelOnConstraintChange() {
    if (!isWideLayout) return;
    // 컨테이너 폭 변화에 따른 clamp 재적용 (외부 viewport에 sync)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeftPanelWidthPx((prev) => {
      if (prev == null) return prev;
      const next = clampLeftPanelWidth(prev);
      return next === prev ? prev : next;
    });
  }, [isWideLayout, clampLeftPanelWidth]);

  useEffect(() => {
    if (!isWideLayout) return;
    const handleResize = () => {
      setLeftPanelWidthPx((prev) => {
        if (prev == null) return prev;
        const next = clampLeftPanelWidth(prev);
        return next === prev ? prev : next;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isWideLayout, clampLeftPanelWidth]);

  useEffect(() => {
    if (!isWideLayout || isSplitResizing || leftPanelWidthPx == null) return;
    persistWidth(leftPanelWidthPx);
  }, [isWideLayout, isSplitResizing, leftPanelWidthPx, persistWidth]);

  const handleSplitResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isWideLayout) return;

      const startWidth = leftPanelRef.current?.getBoundingClientRect().width ?? leftPanelWidthPx ?? 0;
      if (!startWidth) return;

      splitDragRef.current = { startX: e.clientX, startWidth };
      setIsSplitResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [isWideLayout, leftPanelWidthPx],
  );

  const handleSplitResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = splitDragRef.current;
      if (!drag) return;

      const nextWidth = clampLeftPanelWidth(drag.startWidth + (e.clientX - drag.startX));
      setLeftPanelWidthPx(nextWidth);
    },
    [clampLeftPanelWidth],
  );

  const handleSplitResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    splitDragRef.current = null;
    setIsSplitResizing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return {
    isWideLayout,
    leftPanelWidthPx,
    isSplitResizing,
    splitContainerRef,
    leftPanelRef,
    handleSplitResizeStart,
    handleSplitResizeMove,
    handleSplitResizeEnd,
  };
}
