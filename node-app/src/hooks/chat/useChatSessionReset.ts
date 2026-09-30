"use client";

import { useEffect, useRef } from "react";

/**
 * @docHint
 * @purpose useChatSessionReset 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain chat-session
 * @scope client
 */

export type ChatSessionResetReason = "pid-change" | "close";

export function useChatSessionReset(args: {
  open: boolean;
  characterPid: string | null;
  onReset: (reason: ChatSessionResetReason) => void;
  resetOnClose?: boolean;
  resetOnPidChange?: boolean;
}) {
  // args 전체 deps 요구 회피 — 상단에서 필요한 필드만 추출.
  const { open, characterPid, onReset, resetOnClose: resetOnCloseProp, resetOnPidChange: resetOnPidChangeProp } = args;

  const prevPidRef = useRef<string | null>(null);
  const prevOpenRef = useRef<boolean>(false);

  useEffect(() => {
    const pid = characterPid ?? null;

    const resetOnClose = resetOnCloseProp !== false;
    const resetOnPidChange = resetOnPidChangeProp !== false;

    // 1) close 트리거 (open: true -> false)
    if (resetOnClose && prevOpenRef.current && !open) {
      onReset("close");
    }

    // 2) pid-change 트리거 (open 상태에서 pid 교체)
    if (resetOnPidChange && open && pid && prevPidRef.current && prevPidRef.current !== pid) {
      onReset("pid-change");
    }

    prevOpenRef.current = open;
    prevPidRef.current = pid;
  }, [open, characterPid, onReset, resetOnCloseProp, resetOnPidChangeProp]);
}
