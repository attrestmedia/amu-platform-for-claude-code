"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Preloader } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { useGlobalLoadingStore } from "store/global";

const SHOW_DELAY_MS = 200;
const MIN_VISIBLE_MS = 300;

function clearTimer(timerRef: RefObject<number | null>) {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}

/**
 * App root에서 한 번만 렌더링하는 전역 요청 Preloader다.
 * 짧은 요청은 표시하지 않고, 표시된 요청은 최소 시간 동안 유지해 깜빡임을 줄인다.
 */
export default function GlobalPreloader() {
  const isLoading = useGlobalLoadingStore((state) => state.pendingRequestIds.size > 0);
  const [isVisible, setIsVisible] = useState(false);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const visibleAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      clearTimer(hideTimerRef);

      if (isVisible || showTimerRef.current !== null) return;

      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        if (useGlobalLoadingStore.getState().pendingRequestIds.size === 0) return;

        visibleAtRef.current = Date.now();
        setIsVisible(true);
      }, SHOW_DELAY_MS);

      return;
    }

    clearTimer(showTimerRef);
    if (!isVisible) return;

    const visibleAt = visibleAtRef.current ?? Date.now();
    const remainingMs = Math.max(0, MIN_VISIBLE_MS - (Date.now() - visibleAt));

    const hide = () => {
      hideTimerRef.current = null;
      visibleAtRef.current = null;
      setIsVisible(false);
    };

    if (remainingMs === 0) {
      hide();
      return;
    }

    hideTimerRef.current = window.setTimeout(hide, remainingMs);
  }, [isLoading, isVisible]);

  useEffect(() => {
    return () => {
      clearTimer(showTimerRef);
      clearTimer(hideTimerRef);
    };
  }, []);

  if (!isVisible) return null;

  const loadingLabel = lang({ ko: "처리 중입니다.", en: "Loading." });

  return (
    <Preloader
      container
      fullScreen
      variant="spin"
      size="lg"
      role="status"
      aria-label={loadingLabel}
      data-global-preloader="true"
      text={loadingLabel}
      iconClassName="motion-reduce:animate-none"
    />
  );
}
