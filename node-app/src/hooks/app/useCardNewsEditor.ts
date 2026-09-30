"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCardNewsDeck,
  getCardNewsDeck,
  updateCardNewsDeck,
  CardNewsDeckApiError,
} from "libs/api/lab";
import {
  createCardNewsEditorGesture,
  createCardNewsAutosaveScheduler,
} from "libs/card-news/interaction";
import { trackCardNewsDeckCreated } from "utils/analytics/cardNews";
import { CardNewsHistory, createCardNewsHistory } from "libs/card-news/history";
import type { CardNewsDeck, CardNewsDeckPayload, CardNewsLayer } from "types/card-news";

type EditorPhase = "loading" | "ready" | "login-required" | "error";
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

type UseCardNewsEditorOptions = {
  deckId?: string;
  hasHydrated: boolean;
  isLoggedIn: boolean;
  onDeckCreated?: (deckId: string) => void;
};

type DocumentCommitOptions = {
  coalesceKey?: string;
  scheduleSave?: boolean;
};

export function useCardNewsEditor({ deckId, hasHydrated, isLoggedIn, onDeckCreated }: UseCardNewsEditorOptions) {
  const [deck, setDeck] = useState<CardNewsDeck | null>(null);
  const [phase, setPhase] = useState<EditorPhase>("loading");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [activeCardId, setActiveCardId] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [textInputLayerId, setTextInputLayerId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });

  const deckRef = useRef<CardNewsDeck | null>(null);
  const historyRef = useRef<CardNewsHistory<CardNewsDeckPayload> | null>(null);
  const revisionRef = useRef(0);
  const deckIdRef = useRef("");
  const textBaseRef = useRef<CardNewsDeckPayload | null>(null);
  const autosaveRef = useRef<ReturnType<typeof createCardNewsAutosaveScheduler<CardNewsDeckPayload>> | null>(null);
  const gestureRef = useRef<ReturnType<typeof createCardNewsEditorGesture<CardNewsDeckPayload>> | null>(null);
  const transformSequenceRef = useRef(0);
  const commitRef = useRef<(next: CardNewsDeckPayload, options?: DocumentCommitOptions) => boolean>(() => false);
  const transientRef = useRef<(next: CardNewsDeckPayload) => void>(() => undefined);

  const syncHistoryAvailability = useCallback(() => {
    const history = historyRef.current;
    setHistoryAvailability({ canUndo: Boolean(history?.canUndo), canRedo: Boolean(history?.canRedo) });
  }, []);

  const applyPayload = useCallback((payload: CardNewsDeckPayload) => {
    const current = deckRef.current;
    if (!current) return;
    const next = { ...current, ...payload };
    deckRef.current = next;
    setDeck(next);
  }, []);

  const reloadFromServer = useCallback(async () => {
    const currentDeckId = deckIdRef.current;
    if (!currentDeckId) return false;
    try {
      const latest = await getCardNewsDeck(currentDeckId);
      deckRef.current = latest;
      revisionRef.current = latest.revision;
      historyRef.current = createCardNewsHistory(latest as CardNewsDeckPayload);
      syncHistoryAvailability();
      setDeck(latest);
      setActiveCardId(latest.cards[0]?.cardId || "");
      setSelectedLayerId(null);
      setTextInputLayerId(null);
      setTextDraft("");
      setSaveState("saved");
      setError("");
      return true;
    } catch {
      setSaveState("error");
      setError("최신 카드뉴스를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      return false;
    }
  }, [syncHistoryAvailability]);

  const saveDraft = useCallback(async (payload: CardNewsDeckPayload) => {
    const currentDeckId = deckIdRef.current;
    if (!currentDeckId) return;
    setSaveState("saving");
    try {
      const saved = await updateCardNewsDeck(currentDeckId, payload, revisionRef.current);
      revisionRef.current = saved.revision;
      const current = deckRef.current;
      if (current) {
        const next = { ...current, revision: saved.revision, updatedAt: saved.updatedAt };
        deckRef.current = next;
        setDeck(next);
      }
      setSaveState("saved");
      setError("");
    } catch (saveError) {
      if (saveError instanceof CardNewsDeckApiError && saveError.status === 409) {
        await reloadFromServer();
        return;
      }
      setSaveState("error");
      setError("저장하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
      throw saveError;
    }
  }, [reloadFromServer]);

  const ensureAutosave = useCallback(() => {
    if (autosaveRef.current) return autosaveRef.current;
    autosaveRef.current = createCardNewsAutosaveScheduler<CardNewsDeckPayload>({
      save: saveDraft,
      debounceMs: 500,
      maxRetry: 1,
      onError: () => {
        setSaveState("error");
        setError("저장하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
      },
    });
    return autosaveRef.current;
  }, [saveDraft]);

  const scheduleSave = useCallback((payload: CardNewsDeckPayload) => {
    setSaveState("pending");
    ensureAutosave().schedule(payload);
  }, [ensureAutosave]);

  const commitDocument = useCallback((next: CardNewsDeckPayload, options: DocumentCommitOptions = {}) => {
    const history = historyRef.current;
    if (!history) return false;
    const changed = history.push(next, options.coalesceKey);
    if (!changed) return false;
    syncHistoryAvailability();
    applyPayload(next);
    if (options.scheduleSave !== false) scheduleSave(next);
    return true;
  }, [applyPayload, scheduleSave, syncHistoryAvailability]);

  useEffect(() => {
    commitRef.current = commitDocument;
    transientRef.current = applyPayload;
  }, [applyPayload, commitDocument]);

  useEffect(() => {
    gestureRef.current = createCardNewsEditorGesture<CardNewsDeckPayload>({
      redrawActiveCard: (_cardId, next) => transientRef.current(next),
      commit: (next) => commitRef.current(next, { coalesceKey: `layer-transform-${transformSequenceRef.current}` }),
    });
    return () => {
      gestureRef.current?.cancel();
      gestureRef.current = null;
    };
  }, []);

  const initialize = useCallback((loaded: CardNewsDeck, replaceUrl: boolean) => {
    deckIdRef.current = loaded.deckId;
    revisionRef.current = loaded.revision;
    deckRef.current = loaded;
    historyRef.current = createCardNewsHistory(loaded as CardNewsDeckPayload);
    syncHistoryAvailability();
    autosaveRef.current?.cancel();
    setDeck(loaded);
    setActiveCardId(loaded.cards[0]?.cardId || "");
    setSelectedLayerId(null);
    setTextInputLayerId(null);
    setTextDraft("");
    setPhase("ready");
    setSaveState("saved");
    setError("");
    if (replaceUrl) {
      trackCardNewsDeckCreated({ cardCount: loaded.cards.length, aspectRatio: loaded.aspectRatio });
      onDeckCreated?.(loaded.deckId);
    }
  }, [onDeckCreated, syncHistoryAvailability]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isLoggedIn) {
      autosaveRef.current?.cancel();
      return;
    }

    let cancelled = false;

    void (async () => {
      setPhase("loading");
      setError("");
      try {
        const loaded = deckId
          ? await getCardNewsDeck(deckId)
          : await createCardNewsDeck();
        if (cancelled) return;
        initialize(loaded, !deckId);
      } catch (loadError) {
        if (cancelled) return;
        setPhase("error");
        const status = loadError instanceof CardNewsDeckApiError ? loadError.status : 0;
        setError(
          status === 403
            ? "이 카드뉴스에 접근할 권한이 없습니다."
            : status === 404
              ? "카드뉴스를 찾을 수 없습니다."
              : "카드뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deckId, hasHydrated, initialize, isLoggedIn]);

  useEffect(() => () => {
    autosaveRef.current?.cancel();
  }, []);

  const visibleDeck = hasHydrated && !isLoggedIn ? null : deck;
  const visiblePhase: EditorPhase = hasHydrated && !isLoggedIn ? "login-required" : phase;
  const activeCard = visibleDeck?.cards.find((card) => card.cardId === activeCardId) || visibleDeck?.cards[0] || null;
  const selectedLayer = activeCard?.layers.find((layer) => layer.id === selectedLayerId) || null;

  const selectCard = useCallback((cardId: string) => {
    setActiveCardId(cardId);
    setSelectedLayerId(null);
    setTextInputLayerId(null);
  }, []);

  const selectLayer = useCallback((layerId: string | null) => {
    setSelectedLayerId(layerId);
    if (layerId !== textInputLayerId) setTextInputLayerId(null);
  }, [textInputLayerId]);

  const updateTransient = useCallback((next: CardNewsDeckPayload) => {
    if (!gestureRef.current?.isActive) {
      applyPayload(next);
      return;
    }
    gestureRef.current.update(next);
    applyPayload(next);
  }, [applyPayload]);

  const beginTransform = useCallback(() => {
    const current = deckRef.current;
    if (!current || !activeCardId) return;
    transformSequenceRef.current += 1;
    gestureRef.current?.begin(current as CardNewsDeckPayload, activeCardId);
  }, [activeCardId]);

  const updateTransform = useCallback((next: CardNewsDeckPayload) => {
    updateTransient(next);
  }, [updateTransient]);

  const endTransform = useCallback(() => {
    gestureRef.current?.end();
  }, []);

  const beginTextInput = useCallback((layerId: string) => {
    const current = deckRef.current;
    const textLayer = current?.cards.find((card) => card.cardId === activeCardId)?.layers.find((layer) => layer.id === layerId);
    if (!current || !textLayer || textLayer.type !== "text") return;
    transformSequenceRef.current += 1;
    gestureRef.current?.begin(current as CardNewsDeckPayload, activeCardId);
    textBaseRef.current = current as CardNewsDeckPayload;
    setSelectedLayerId(layerId);
    setTextInputLayerId(layerId);
    setTextDraft(textLayer.text);
  }, [activeCardId]);

  const updateTextInput = useCallback((value: string, isComposing = false) => {
    setTextDraft(value);
    if (isComposing || !activeCardId || !textInputLayerId) return;
    const current = deckRef.current;
    if (!current) return;
    const next = {
      ...current,
      cards: current.cards.map((card) => card.cardId !== activeCardId
        ? card
        : {
            ...card,
            layers: card.layers.map((layer) => layer.id === textInputLayerId && layer.type === "text"
              ? { ...layer, text: value }
              : layer),
          }),
    } as CardNewsDeckPayload;
    updateTransient(next);
  }, [activeCardId, textInputLayerId, updateTransient]);

  const endTextInput = useCallback((cancel = false) => {
    if (!textInputLayerId) return;
    if (cancel && textBaseRef.current) {
      gestureRef.current?.cancel();
      applyPayload(textBaseRef.current);
    } else {
      gestureRef.current?.end();
    }
    textBaseRef.current = null;
    setTextInputLayerId(null);
  }, [applyPayload, textInputLayerId]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const current = history?.undo();
    if (!history || current === null || current === undefined) return false;
    applyPayload(current);
    scheduleSave(current);
    syncHistoryAvailability();
    setSelectedLayerId(null);
    return true;
  }, [applyPayload, scheduleSave, syncHistoryAvailability]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const current = history?.redo();
    if (!history || current === null || current === undefined) return false;
    applyPayload(current);
    scheduleSave(current);
    syncHistoryAvailability();
    setSelectedLayerId(null);
    return true;
  }, [applyPayload, scheduleSave, syncHistoryAvailability]);

  const flushSave = useCallback(async () => {
    await autosaveRef.current?.flush();
  }, []);

  return {
    deck: visibleDeck,
    phase: visiblePhase,
    error,
    saveState,
    activeCard,
    activeCardId,
    selectedLayer: selectedLayer as CardNewsLayer | null,
    selectedLayerId,
    textInputLayerId,
    textDraft,
    selectCard,
    selectLayer,
    commitDocument,
    applyPayload,
    beginTransform,
    updateTransform,
    endTransform,
    beginTextInput,
    updateTextInput,
    endTextInput,
    undo,
    redo,
    flushSave,
    canUndo: historyAvailability.canUndo,
    canRedo: historyAvailability.canRedo,
    reloadFromServer,
  };
}
