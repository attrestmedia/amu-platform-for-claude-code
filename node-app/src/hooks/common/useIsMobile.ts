"use client";

import { useCallback, useSyncExternalStore } from "react";

// Tailwind sm 미만(< 640px)을 모바일로 판정 — 플로팅 UI(브러시 슬라이더/오버플로우 메뉴) 분기에 사용
export function useIsMobile(query = "(max-width: 639px)") {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);

      return () => mql.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
