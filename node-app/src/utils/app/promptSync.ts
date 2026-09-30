import type { PromptScopeType } from "types/app";

const EVENT_NAME = "genstudio:prompt-sync";
const STORAGE_KEY = "genstudio:prompt-sync";

export function notifyPromptListChanged(kind: PromptScopeType) {
  if (typeof window === "undefined") return;
  const detail = { kind, ts: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(detail));
  } catch {}
}

export function subscribePromptListChanged(handler: (detail: { kind: PromptScopeType; ts: number }) => void) {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail as { kind?: PromptScopeType; ts?: number };
    if (!detail?.kind) return;
    handler({ kind: detail.kind, ts: detail.ts || Date.now() });
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const detail = JSON.parse(e.newValue);
      if (!detail?.kind) return;
      handler({ kind: detail.kind, ts: detail.ts || Date.now() });
    } catch {}
  };
  window.addEventListener(EVENT_NAME, onEvent as EventListener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onEvent as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
