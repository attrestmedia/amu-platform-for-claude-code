"use client";

import { useCallback, useEffect } from "react";

/**
 * @docHint
 * @purpose useChatScrollAnchor 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain chat-ui
 * @scope client
 */

export function useChatScrollAnchor(args: {
  open: boolean;
  chatMode: boolean;
  viewMode: "talk" | "visual";

  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  bottomAnchorRef: React.RefObject<HTMLDivElement | null>;

  // 메시지/필터 변경 트리거 키(길이 등). 호출자에서 string/number 등 안정 키를 넘김.
  scrollKey: unknown;
}) {
  // args 다중 접근 시 lint가 args 전체를 deps로 요구하므로 상단에서 ref/값 추출.
  const { open, chatMode, viewMode, messagesContainerRef, bottomAnchorRef, scrollKey } = args;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // 1) fallback — DOM element 속성 할당(ref.current에 대한 정상적 mutation)
    container.scrollTop = container.scrollHeight;

    // 2) anchor
    bottomAnchorRef.current?.scrollIntoView({ behavior, block: "end" });
  }, [messagesContainerRef, bottomAnchorRef]);

  // talk 모드에서 메시지 변화마다 하단 고정
  useEffect(() => {
    if (!open || !chatMode) return;
    const id = requestAnimationFrame(() => scrollToBottom("auto"));
    return () => cancelAnimationFrame(id);
  }, [open, chatMode, viewMode, scrollKey, scrollToBottom]);

  // 리사이즈에도 하단 고정
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    let ticking = false;
    const ro = new ResizeObserver(() => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (open && chatMode) scrollToBottom("auto");
        ticking = false;
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [open, chatMode, messagesContainerRef, scrollToBottom]);

  return { scrollToBottom };
}
