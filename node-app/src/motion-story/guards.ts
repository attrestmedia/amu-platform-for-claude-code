import { MOTION_TOKENS } from "./tokens";

/**
 * 재생 가드 — 모든 자동 재생 표면이 공유한다.
 *  1. prefers-reduced-motion 이면 최종 상태를 정적으로 보여준다.
 *  2. document.hidden 이면 정지한다.
 *  3. 뷰포트당 active 모션 표면은 1개 (가시 비율 ≥ 0.6 인 것 중 가장 많이 보이는 것).
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function subscribeReducedMotion(callback: (reduced: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  const handler = () => callback(media.matches);
  media.addEventListener?.("change", handler);
  return () => media.removeEventListener?.("change", handler);
}

export function subscribeDocumentHidden(callback: (hidden: boolean) => void): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = () => callback(document.hidden);
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

export type ActiveSurfaceArbiter = {
  register: (element: Element, onActiveChange: (active: boolean) => void) => () => void;
  readonly activeElement: Element | null;
};

type Entry = { onActiveChange: (active: boolean) => void; ratio: number; active: boolean };

/**
 * 가장 많이 보이는 표면 1개만 active 로 만든다. IntersectionObserver 가 없으면 아무것도 active 로 만들지 않는다
 * (fail-closed → 정적 표시).
 */
export function createActiveSurfaceArbiter(threshold: number = MOTION_TOKENS.card.activeRatio): ActiveSurfaceArbiter {
  const entries = new Map<Element, Entry>();
  let activeElement: Element | null = null;
  let observer: IntersectionObserver | null = null;

  const recompute = () => {
    let best: Element | null = null;
    let bestRatio = threshold;
    for (const [element, entry] of entries) {
      if (entry.ratio < threshold) continue;
      const beats =
        best === null ||
        entry.ratio > bestRatio + 0.001 ||
        (Math.abs(entry.ratio - bestRatio) <= 0.001 && Boolean(best.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING));
      if (beats) {
        best = element;
        bestRatio = entry.ratio;
      }
    }
    activeElement = best;
    for (const [element, entry] of entries) {
      const active = element === best;
      if (active !== entry.active) {
        entry.active = active;
        entry.onActiveChange(active);
      }
    }
  };

  const ensureObserver = () => {
    if (observer || typeof IntersectionObserver === "undefined") return observer;
    observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const entry = entries.get(record.target);
          if (entry) entry.ratio = record.isIntersecting ? record.intersectionRatio : 0;
        }
        recompute();
      },
      { threshold: [0, 0.25, 0.5, threshold, 0.75, 0.9, 1] },
    );
    return observer;
  };

  return {
    register(element, onActiveChange) {
      entries.set(element, { onActiveChange, ratio: 0, active: false });
      ensureObserver()?.observe(element);
      return () => {
        const entry = entries.get(element);
        observer?.unobserve(element);
        entries.delete(element);
        if (entry?.active) entry.onActiveChange(false);
        if (activeElement === element) recompute();
      };
    },
    get activeElement() {
      return activeElement;
    },
  };
}

let sharedArbiter: ActiveSurfaceArbiter | null = null;

/** 페이지 전체가 공유하는 arbiter — 홈 카드·Hero 가 같이 등록하면 한 번에 하나만 움직인다. */
export function getSharedSurfaceArbiter(): ActiveSurfaceArbiter {
  if (!sharedArbiter) sharedArbiter = createActiveSurfaceArbiter();
  return sharedArbiter;
}
