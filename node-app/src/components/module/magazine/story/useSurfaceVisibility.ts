"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { getSharedSurfaceArbiter, MOTION_TOKENS } from "../../../../motion-story";

/** 페이지 전체에서 가장 많이 보이는(≥ 0.6) 모션 표면 1개만 true */
export function useActiveSurface(ref: RefObject<Element | null>, enabled: boolean): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      setActive(false);
      return;
    }
    return getSharedSurfaceArbiter().register(element, setActive);
  }, [enabled, ref]);
  return enabled && active;
}

/**
 * 노출 계측: 가시 비율 ≥ 0.6 상태가 1초 유지되면 1회 호출한다 (MEASUREMENT-PLAN — 새 이벤트 없이 기존
 * `article_experience_impression` 에 surface 속성을 싣는 용도).
 */
export function useSurfaceImpression(
  ref: RefObject<Element | null>,
  onImpression: (() => void) | undefined,
  { ratio = MOTION_TOKENS.card.activeRatio, dwellMs = MOTION_TOKENS.card.impressionMs }: { ratio?: number; dwellMs?: number } = {},
) {
  const callbackRef = useRef(onImpression);
  useEffect(() => {
    callbackRef.current = onImpression;
  });
  const enabled = Boolean(onImpression);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fired = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= ratio);
        if (visible && !timer && !fired) {
          timer = setTimeout(() => {
            fired = true;
            observer.disconnect();
            callbackRef.current?.();
          }, dwellMs);
        } else if (!visible && timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, ratio, 1] },
    );
    observer.observe(element);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [dwellMs, enabled, ratio, ref]);
}
