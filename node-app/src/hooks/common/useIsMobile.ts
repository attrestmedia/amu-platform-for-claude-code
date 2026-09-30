"use client";

import { useEffect, useState } from "react";

// Tailwind sm 미만(< 640px)을 모바일로 판정 — 플로팅 UI(브러시 슬라이더/오버플로우 메뉴) 분기에 사용
export function useIsMobile(query = "(max-width: 639px)") {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(
    function subscribeMediaQuery() {
      if (typeof window === "undefined" || !window.matchMedia) return;
      const mql = window.matchMedia(query);
      const handleChange = () => setIsMobile(mql.matches);
      handleChange();
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    },
    [query],
  );

  return isMobile;
}
