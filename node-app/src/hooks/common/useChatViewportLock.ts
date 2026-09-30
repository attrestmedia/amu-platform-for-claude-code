"use client";

import { useEffect, useState } from "react";

export type ChatViewportLock = {
  /** 키보드가 닫힌 전체 화면 높이(px). 배경 고정 기준값. null이면 미측정(SSR) */
  stableHeight: number | null;
  /** 현재 가시 영역 높이(px). 전경 컬럼 높이 기준값 */
  visibleHeight: number | null;
  /** visual viewport 상단 오프셋(px). 전경 translateY 보정값 */
  offsetTop: number;
};

const INITIAL: ChatViewportLock = { stableHeight: null, visibleHeight: null, offsetTop: 0 };

/**
 * 가상 키보드 등장 시 배경은 고정(stableHeight)하고 전경만 가시영역(visibleHeight)에
 * 맞추기 위한 뷰포트 기하값을 제공한다.
 * - VisualViewport 미지원 환경은 window.innerHeight로 폴백(보정 없음, 기존 동작 보존).
 * @param active 대화 화면(chatMode) 활성 여부. false면 추적 중단.
 */
export function useChatViewportLock(active: boolean): ChatViewportLock {
  const [lock, setLock] = useState<ChatViewportLock>(INITIAL);

  useEffect(
    function trackChatViewport() {
      if (!active || typeof window === "undefined") return;

      const vv = window.visualViewport;
      let maxStable = 0;

      const updateViewportLock = () => {
        const visible = vv?.height ?? window.innerHeight;
        const offsetTop = vv?.offsetTop ?? 0;
        // 키보드가 닫힌 상태의 전체 높이를 최댓값으로 보존 → 배경 고정 기준
        maxStable = Math.max(maxStable, visible + offsetTop, window.innerHeight);
        setLock({ stableHeight: maxStable, visibleHeight: visible, offsetTop });
      };

      const resetOnOrientation = () => {
        // 화면 회전 시 이전 방향의 stable 값이 부정확하므로 재산정
        maxStable = 0;
        updateViewportLock();
      };

      updateViewportLock();

      vv?.addEventListener("resize", updateViewportLock);
      vv?.addEventListener("scroll", updateViewportLock);
      window.addEventListener("resize", updateViewportLock);
      window.addEventListener("orientationchange", resetOnOrientation);

      return () => {
        vv?.removeEventListener("resize", updateViewportLock);
        vv?.removeEventListener("scroll", updateViewportLock);
        window.removeEventListener("resize", updateViewportLock);
        window.removeEventListener("orientationchange", resetOnOrientation);
      };
    },
    [active],
  );

  return lock;
}
