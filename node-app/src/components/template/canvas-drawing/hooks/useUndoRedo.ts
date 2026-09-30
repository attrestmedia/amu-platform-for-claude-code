"use client";

import { useCallback, useRef, useState } from "react";

type HistoryRef<T> = {
  stack: T[];
  index: number;
};

export function useUndoRedo<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial);
  // 렌더에 노출되는 히스토리 메타 — ref는 동기 갱신, 이 state는 canUndo/canRedo 도출용
  const [historyMeta, setHistoryMeta] = useState<{ index: number; length: number }>({ index: 0, length: 1 });

  const ref = useRef<HistoryRef<T>>({
    stack: [initial],
    index: 0,
  });

  const canUndo = historyMeta.index > 0;
  const canRedo = historyMeta.index < historyMeta.length - 1;

  // 히스토리 없이 현재 상태만 교체(드래그 중 실시간 편집 같은 케이스)
  const replace = useCallback((next: T) => {
    setPresent(next);
    return next;
  }, []);

  // 히스토리에 push
  const push = useCallback((next: T) => {
    const h = ref.current;
    const base = h.stack.slice(0, h.index + 1);
    base.push(next);
    h.stack = base;
    h.index = base.length - 1;
    setPresent(next);
    setHistoryMeta({ index: h.index, length: h.stack.length });
    return next;
  }, []);

  const undo = useCallback((): T | null => {
    const h = ref.current;
    if (h.index <= 0) return null;
    h.index -= 1;
    const next = h.stack[h.index];
    setPresent(next);
    setHistoryMeta({ index: h.index, length: h.stack.length });
    return next;
  }, []);

  const redo = useCallback((): T | null => {
    const h = ref.current;
    if (h.index >= h.stack.length - 1) return null;
    h.index += 1;
    const next = h.stack[h.index];
    setPresent(next);
    setHistoryMeta({ index: h.index, length: h.stack.length });
    return next;
  }, []);

  const reset = useCallback((next: T) => {
    ref.current = { stack: [next], index: 0 };
    setPresent(next);
    setHistoryMeta({ index: 0, length: 1 });
    return next;
  }, []);

  const get = useCallback(() => {
    const h = ref.current;
    return h.stack[h.index];
  }, []);

  return { present, push, replace, undo, redo, reset, canUndo, canRedo, get };
}
