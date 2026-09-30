"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCardNewsEditorAssetResolver, createCardNewsBrowserAssetCache } from "libs/card-news/browserAsset";
import { CardNewsFontError, getCardNewsFontLoadPolicy, prepareCardNewsBrowserFont } from "libs/card-news/browserFont";
import { createCardNewsScene } from "libs/card-news/scene";
import { getCardNewsAssetKey, getCardNewsFontKey, type CardNewsDeck, type CardNewsFontFamily } from "types/card-news";
import type {
  CardNewsImageReference,
  CardNewsPreparedAsset,
  CardNewsPreparedFont,
  CardNewsPreparedScene,
} from "types/card-news/scene";

type PreparationStatus = "idle" | "preparing" | "ready" | "error";

function getFontRequests(deck: CardNewsDeck, cardId: string) {
  const card = deck.cards.find((candidate) => candidate.cardId === cardId);
  const requests = new Map<string, {
    family: CardNewsFontFamily;
    weight: number;
    fontSizePx: number;
    lineHeightPx: number;
    sampleText: string;
  }>();

  card?.layers.forEach((layer) => {
    if (layer.type !== "text") return;
    const key = getCardNewsFontKey({ family: layer.fontFamily, weight: layer.fontWeight, fontSizePx: layer.fontSize });
    if (!requests.has(key)) {
      requests.set(key, {
        family: layer.fontFamily,
        weight: layer.fontWeight,
        fontSizePx: layer.fontSize,
        lineHeightPx: layer.lineHeight,
        sampleText: layer.text || "한글 English",
      });
    }
  });

  if (deck.watermark?.enabled && card?.watermarkEnabled !== false && deck.watermark.text) {
    const key = getCardNewsFontKey({ family: deck.theme.fontFamily, weight: 700, fontSizePx: deck.watermark.size });
    if (!requests.has(key)) {
      requests.set(key, {
        family: deck.theme.fontFamily,
        weight: 700,
        fontSizePx: deck.watermark.size,
        lineHeightPx: Math.round(deck.watermark.size * 1.33),
        sampleText: deck.watermark.text,
      });
    }
  }

  return requests;
}

function getAssetReferences(deck: CardNewsDeck, cardId: string) {
  const card = deck.cards.find((candidate) => candidate.cardId === cardId);
  const references = new Map<string, CardNewsImageReference>();
  if (!card) return references;
  if (card.background.type === "image") {
    const reference = { value: card.background.value, valueKind: card.background.valueKind } satisfies CardNewsImageReference;
    references.set(getCardNewsAssetKey(reference), reference);
  }
  card.layers.forEach((layer) => {
    if (layer.type !== "image") return;
    const reference = { value: layer.src, valueKind: layer.srcKind } satisfies CardNewsImageReference;
    references.set(getCardNewsAssetKey(reference), reference);
  });
  if (deck.watermark?.enabled && card.watermarkEnabled !== false && deck.watermark.logo) {
    const reference = {
      value: deck.watermark.logo.value,
      valueKind: deck.watermark.logo.valueKind,
    } satisfies CardNewsImageReference;
    references.set(getCardNewsAssetKey(reference), reference);
  }
  return references;
}

function createCachedCardNewsScene(
  deck: CardNewsDeck,
  cardId: string,
  fontCache: ReadonlyMap<string, CardNewsPreparedFont>,
  assetCache: { get: (key: string) => CardNewsPreparedAsset | undefined },
) {
  const fonts = new Map<string, CardNewsPreparedFont>();
  for (const [key] of getFontRequests(deck, cardId)) {
    const font = fontCache.get(key);
    if (!font) return null;
    fonts.set(key, font);
  }

  const assets = new Map<string, CardNewsPreparedAsset>();
  for (const [key] of getAssetReferences(deck, cardId)) {
    const asset = assetCache.get(key);
    if (!asset) return null;
    assets.set(key, asset);
  }

  try {
    return createCardNewsScene(deck, { fonts, assets }, cardId);
  } catch {
    return null;
  }
}

function removeDeletedLayersFromScene(scene: CardNewsPreparedScene, deck: CardNewsDeck, cardId: string) {
  const card = deck.cards.find((candidate) => candidate.cardId === cardId);
  if (!card) return scene;
  const activeLayerIds = new Set(card.layers.map((layer) => layer.id));
  return {
    ...scene,
    layers: scene.layers.filter((layer) => activeLayerIds.has(layer.source.id)),
  };
}

export function useCardNewsScenePreparation(deck: CardNewsDeck | null, activeCardId: string) {
  const assetCacheRef = useRef(createCardNewsBrowserAssetCache());
  const resolverRef = useRef(createCardNewsEditorAssetResolver());
  const fontCacheRef = useRef(new Map<string, CardNewsPreparedFont>());
  const sceneRef = useRef<CardNewsPreparedScene | null>(null);
  const [scene, setScene] = useState<CardNewsPreparedScene | null>(null);
  const [thumbnailScenes, setThumbnailScenes] = useState<Record<string, CardNewsPreparedScene>>({});
  const [status, setStatus] = useState<PreparationStatus>("idle");
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const prepareCard = useCallback(async (snapshot: CardNewsDeck, cardId: string, signal?: AbortSignal) => {
    const fontRequests = getFontRequests(snapshot, cardId);
    const fontLoadPolicy = getCardNewsFontLoadPolicy();
    await Promise.all(Array.from(fontRequests.entries()).map(async ([key, request]) => {
      if (fontCacheRef.current.has(key)) return;
      const prepared = await prepareCardNewsBrowserFont({ ...request, fontLoadPolicy });
      fontCacheRef.current.set(key, prepared);
    }));

    const assetReferences = getAssetReferences(snapshot, cardId);
    await Promise.all(Array.from(assetReferences.values()).map(async (reference) => {
      await assetCacheRef.current.prepare(reference, resolverRef.current, { signal });
    }));

    const fonts = new Map(fontCacheRef.current);
    const assets = new Map<string, CardNewsPreparedAsset>();
    assetReferences.forEach((reference, key) => {
      const asset = assetCacheRef.current.get(key);
      if (asset) assets.set(key, asset);
    });
    return createCardNewsScene(snapshot, { fonts, assets }, cardId);
  }, []);

  useEffect(() => {
    if (!deck || !activeCardId) {
      sceneRef.current = null;
      return;
    }

    const controller = new AbortController();
    const currentScene = sceneRef.current;
    const canKeepCurrentScene = Boolean(
      currentScene
      && currentScene.cardId === activeCardId
      && currentScene.frameSize.w === deck.frameSize.w
      && currentScene.frameSize.h === deck.frameSize.h,
    );
    const cachedScene = canKeepCurrentScene
      ? createCachedCardNewsScene(deck, activeCardId, fontCacheRef.current, assetCacheRef.current)
      : null;
    if (cachedScene) {
      // 리사이즈·이동처럼 리소스가 바뀌지 않는 편집은 준비된 폰트·이미지로 즉시 scene만 갱신한다.
      sceneRef.current = cachedScene;
      setScene(cachedScene);
      setThumbnailScenes((current) => ({ ...current, [activeCardId]: cachedScene }));
      setStatus("ready");
      setError("");
      return;
    }
    if (canKeepCurrentScene) {
      // 드래그·리사이즈는 deck 객체를 매번 교체하므로 기존 scene을 유지해 캔버스가 깜빡이지 않게 한다.
      setStatus("ready");
    } else {
      setStatus("preparing");
      setScene(null);
    }
    setError("");
    void prepareCard(deck, activeCardId, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setScene(next);
        setThumbnailScenes((current) => ({ ...current, [activeCardId]: next }));
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const fallbackScene = canKeepCurrentScene && currentScene
          ? removeDeletedLayersFromScene(currentScene, deck, activeCardId)
          : null;
        if (fallbackScene) {
          // 새 자산 준비가 실패해도 삭제된 레이어를 이전 Canvas에서 계속 보여주지 않는다.
          sceneRef.current = fallbackScene;
          setScene(fallbackScene);
          setThumbnailScenes((current) => ({ ...current, [activeCardId]: fallbackScene }));
        }
        setStatus("error");
        setError(reason instanceof CardNewsFontError
          ? reason.code
          : reason instanceof Error ? reason.message : "SCENE_PREPARATION_FAILED");
      });

    return () => controller.abort();
  }, [activeCardId, deck, prepareCard, retryToken]);

  useEffect(() => {
    if (!deck || !activeCardId || deck.cards.length < 2) return;
    const snapshot = deck;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const next: Record<string, CardNewsPreparedScene> = {};
        for (const card of snapshot.cards) {
          if (cancelled || card.cardId === activeCardId) continue;
          try {
            next[card.cardId] = await prepareCard(snapshot, card.cardId);
          } catch {
            // 썸네일은 지연 보조 UI이므로 준비 실패 시 다음 카드로 진행한다.
          }
        }
        if (!cancelled) setThumbnailScenes(next);
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeCardId, deck, prepareCard]);

  useEffect(() => () => {
    assetCacheRef.current.clear();
  }, []);

  const prepareAllScenes = useCallback(async () => {
    if (!deck) return [];
    const scenes: CardNewsPreparedScene[] = [];
    for (const card of deck.cards) scenes.push(await prepareCard(deck, card.cardId));
    return scenes;
  }, [deck, prepareCard]);

  const retryScene = useCallback(() => {
    setRetryToken((current) => current + 1);
  }, []);

  const sceneMatchesActiveCard = Boolean(
    deck
    && activeCardId
    && scene?.cardId === activeCardId
    && scene.frameSize.w === deck.frameSize.w
    && scene.frameSize.h === deck.frameSize.h,
  );

  return {
    scene: sceneMatchesActiveCard ? scene : null,
    thumbnailScenes,
    status: !deck || !activeCardId ? "idle" : sceneMatchesActiveCard ? status : "preparing",
    error,
    prepareAllScenes,
    retryScene,
  };
}
