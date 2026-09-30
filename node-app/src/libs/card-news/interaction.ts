/**
 * @docHint
 * @purpose CardNews gesture 중 active card만 rAF redraw하고 pointerup에서 한 번 commit
 * @process transient ref updates → scheduled active-card redraw → history/autosave commit
 * @domain card-news
 * @scope editor_state
 */

export type CardNewsEditorGestureOptions<T> = {
  redrawActiveCard: (activeCardId: string, document: T) => void;
  commit: (document: T, activeCardId: string) => void;
  autosave?: (document: T, activeCardId: string) => void;
  scheduleFrame?: (callback: () => void) => void;
  serialize?: (value: T) => string;
};

function defaultScheduleFrame(callback: () => void) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(callback);
  else setTimeout(callback, 0);
}

export function createCardNewsEditorGesture<T>(options: CardNewsEditorGestureOptions<T>) {
  let activeCardId = "";
  let baseDocument: T | null = null;
  let transientDocument: T | null = null;
  let framePending = false;
  const scheduleFrame = options.scheduleFrame || defaultScheduleFrame;
  const serialize = options.serialize || ((value: T) => JSON.stringify(value) ?? "null");

  const scheduleRedraw = () => {
    if (framePending || transientDocument === null) return;
    framePending = true;
    scheduleFrame(() => {
      framePending = false;
      if (transientDocument !== null) options.redrawActiveCard(activeCardId, transientDocument);
    });
  };

  return {
    begin(document: T, cardId: string) {
      activeCardId = cardId;
      baseDocument = document;
      transientDocument = document;
      framePending = false;
    },
    update(document: T) {
      if (baseDocument === null) return false;
      transientDocument = document;
      scheduleRedraw();
      return true;
    },
    end() {
      if (baseDocument === null || transientDocument === null) return false;
      const changed = serialize(baseDocument) !== serialize(transientDocument);
      const document = transientDocument;
      const cardId = activeCardId;
      if (changed) {
        options.commit(document, cardId);
        options.autosave?.(document, cardId);
      }
      baseDocument = null;
      transientDocument = null;
      activeCardId = "";
      return changed;
    },
    cancel() {
      baseDocument = null;
      transientDocument = null;
      activeCardId = "";
      framePending = false;
    },
    get transient() {
      return transientDocument;
    },
    get isActive() {
      return baseDocument !== null;
    },
  };
}

export function createCardNewsAutosaveScheduler<T>(options: {
  save: (document: T) => Promise<void> | void;
  debounceMs?: number;
  maxRetry?: number;
  onError?: (error: unknown) => void;
}) {
  const debounceMs = Math.max(0, Math.floor(options.debounceMs ?? 500));
  const maxRetry = Math.max(0, Math.floor(options.maxRetry ?? 1));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending === null) return false;
    const document = pending;
    pending = null;
    let attempt = 0;
    while (true) {
      try {
        await options.save(document);
        return true;
      } catch (error) {
        if (attempt >= maxRetry) throw error;
        attempt += 1;
      }
    }
  };

  return {
    schedule(document: T) {
      pending = document;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void flush().catch((error: unknown) => options.onError?.(error));
      }, debounceMs);
    },
    flush,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
    get isPending() {
      return pending !== null;
    },
  };
}
