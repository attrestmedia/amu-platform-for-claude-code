/**
 * @docHint
 * @purpose CardNews assetId/proxyUrl을 정책 검증된 same-origin URL에서 Canvas-ready image로 준비
 * @process injected resolver → anonymous image decode → dimension validation → disposable asset
 * @domain card-news
 * @scope browser_asset_adapter
 */

import type { CardNewsImageReference } from "types/card-news/scene";
import type { CardNewsPreparedAsset } from "types/card-news/scene";

export type CardNewsResolvedAssetSource = {
  /** assetId는 owner 검증을, proxyUrl은 allowlist/MIME/size 검증을 끝낸 URL이어야 한다. */
  url: string;
  revoke?: () => void;
};

export type CardNewsBrowserAssetResolver = {
  resolve: (reference: CardNewsImageReference, signal?: AbortSignal) => Promise<CardNewsResolvedAssetSource>;
};

export type CardNewsBrowserAssetOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type CardNewsAssetErrorCode =
  | "ASSET_BROWSER_UNAVAILABLE"
  | "ASSET_RESOLVE_FAILED"
  | "ASSET_UNAUTHORIZED"
  | "ASSET_FORBIDDEN"
  | "ASSET_NOT_FOUND"
  | "ASSET_PROXY_REJECTED"
  | "ASSET_INVALID_MIME"
  | "ASSET_TOO_LARGE"
  | "ASSET_ABORTED"
  | "ASSET_DECODE_FAILED"
  | "ASSET_TAINTED"
  | "ASSET_LOAD_FAILED"
  | "ASSET_TIMEOUT"
  | "ASSET_EMPTY";

export class CardNewsAssetError extends Error {
  readonly code: CardNewsAssetErrorCode;

  constructor(code: CardNewsAssetErrorCode, options?: { cause?: unknown }) {
    super(code);
    this.name = "CardNewsAssetError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

function loadImageElement(url: string, timeoutMs: number, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      image.src = "";
      reject(new CardNewsAssetError("ASSET_TIMEOUT"));
    }, timeoutMs);

    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.src = "";
      reject(new CardNewsAssetError("ASSET_ABORTED"));
    };
    signal?.addEventListener("abort", abort, { once: true });

    const settle = (handler: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      handler();
    };

    image.crossOrigin = "anonymous";
    image.onload = () => {
      void (async () => {
        try {
          if (typeof image.decode === "function") await image.decode();
          settle(() => resolve(image));
        } catch (error) {
          settle(() => reject(new CardNewsAssetError("ASSET_DECODE_FAILED", { cause: error })));
        }
      })();
    };
    image.onerror = () => settle(() => reject(new CardNewsAssetError("ASSET_LOAD_FAILED")));
    if (signal?.aborted) {
      abort();
      return;
    }
    image.src = url;
  });
}

function getFetchImpl(fetchImpl?: typeof fetch) {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch === "undefined") throw new CardNewsAssetError("ASSET_BROWSER_UNAVAILABLE");
  return fetch;
}

function mapAssetResponseError(status: number, source: CardNewsImageReference["valueKind"]) {
  if (status === 401) return new CardNewsAssetError("ASSET_UNAUTHORIZED");
  if (status === 403) return new CardNewsAssetError("ASSET_FORBIDDEN");
  if (status === 404) return new CardNewsAssetError("ASSET_NOT_FOUND");
  return new CardNewsAssetError(source === "proxyUrl" ? "ASSET_PROXY_REJECTED" : "ASSET_RESOLVE_FAILED");
}

export function createCardNewsEditorAssetResolver(options: {
  fetchImpl?: typeof fetch;
  assetRoute?: string;
  maxBytes?: number;
} = {}): CardNewsBrowserAssetResolver {
  const fetchImpl = getFetchImpl(options.fetchImpl);
  const maxBytes = Math.max(1, Math.min(10 * 1024 * 1024, Math.floor(options.maxBytes || 10 * 1024 * 1024)));

  return {
    resolve: async (reference, signal) => {
      const path = reference.valueKind === "assetId"
        ? `${options.assetRoute || "/api/lab/studio-images"}/${encodeURIComponent(reference.value)}/editor-file`
        : reference.value;
      if (reference.valueKind === "proxyUrl" && !path.startsWith("/api/proxy/image?url=")) {
        throw new CardNewsAssetError("ASSET_PROXY_REJECTED");
      }

      let response: Response;
      try {
        response = await fetchImpl(path, {
          method: "GET",
          credentials: reference.valueKind === "assetId" ? "same-origin" : "omit",
          cache: "no-store",
          signal,
        });
      } catch (error) {
        if (signal?.aborted || (error as { name?: unknown })?.name === "AbortError") {
          throw new CardNewsAssetError("ASSET_ABORTED", { cause: error });
        }
        throw new CardNewsAssetError(
          reference.valueKind === "proxyUrl" ? "ASSET_PROXY_REJECTED" : "ASSET_RESOLVE_FAILED",
          { cause: error },
        );
      }

      if (!response.ok) throw mapAssetResponseError(response.status, reference.valueKind);
      const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
      if (!/^image\/(?:jpeg|png|webp)$/.test(contentType)) {
        throw new CardNewsAssetError("ASSET_INVALID_MIME");
      }
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > maxBytes) throw new CardNewsAssetError("ASSET_TOO_LARGE");

      let blob: Blob;
      try {
        blob = await response.blob();
      } catch (error) {
        throw new CardNewsAssetError("ASSET_LOAD_FAILED", { cause: error });
      }
      if (blob.size <= 0) throw new CardNewsAssetError("ASSET_EMPTY");
      if (blob.size > maxBytes) throw new CardNewsAssetError("ASSET_TOO_LARGE");
      if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
        throw new CardNewsAssetError("ASSET_BROWSER_UNAVAILABLE");
      }

      const objectUrl = URL.createObjectURL(blob);
      return {
        url: objectUrl,
        revoke: () => URL.revokeObjectURL(objectUrl),
      };
    },
  };
}

export async function prepareCardNewsBrowserAsset(
  reference: CardNewsImageReference,
  resolver: CardNewsBrowserAssetResolver,
  options: CardNewsBrowserAssetOptions = {},
): Promise<CardNewsPreparedAsset> {
  if (typeof Image === "undefined") throw new CardNewsAssetError("ASSET_BROWSER_UNAVAILABLE");

  const timeoutMs = Math.max(1_000, Math.min(60_000, Math.round(options.timeoutMs || 15_000)));
  let resolved: CardNewsResolvedAssetSource;
  try {
    const candidate = await resolver.resolve(reference, options.signal);
    if (
      !candidate ||
      typeof candidate.url !== "string" ||
      !candidate.url ||
      (candidate.revoke !== undefined && typeof candidate.revoke !== "function")
    ) {
      throw new CardNewsAssetError("ASSET_RESOLVE_FAILED");
    }
    resolved = candidate;
  } catch (error) {
    if (error instanceof CardNewsAssetError) throw error;
    throw new CardNewsAssetError("ASSET_RESOLVE_FAILED");
  }

  try {
    const image = await loadImageElement(resolved.url, timeoutMs, options.signal);
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    if (width <= 0 || height <= 0) throw new CardNewsAssetError("ASSET_EMPTY");

    return {
      reference,
      source: image,
      width,
      height,
      dispose: resolved.revoke,
    };
  } catch (error) {
    resolved.revoke?.();
    if (error instanceof CardNewsAssetError) throw error;
    throw new CardNewsAssetError("ASSET_LOAD_FAILED");
  }
}

export function disposeCardNewsBrowserAsset(asset: CardNewsPreparedAsset) {
  asset.dispose?.();
  const source = asset.source as unknown as { close?: () => void };
  source.close?.();
}

export function assertCardNewsCanvasReadable(canvas: HTMLCanvasElement) {
  try {
    const context = canvas.getContext("2d");
    if (!context || typeof context.getImageData !== "function") return;
    context.getImageData(0, 0, 1, 1);
  } catch (error) {
    throw new CardNewsAssetError("ASSET_TAINTED", { cause: error });
  }
}

export function createCardNewsBrowserAssetCache() {
  const entries = new Map<string, CardNewsPreparedAsset>();

  return {
    async prepare(
      reference: CardNewsImageReference,
      resolver: CardNewsBrowserAssetResolver,
      options: CardNewsBrowserAssetOptions = {},
    ) {
      const key = `${reference.valueKind}:${reference.value}`;
      const cached = entries.get(key);
      if (cached) return cached;
      const prepared = await prepareCardNewsBrowserAsset(reference, resolver, options);
      entries.set(key, prepared);
      return prepared;
    },
    release(reference: CardNewsImageReference) {
      const key = `${reference.valueKind}:${reference.value}`;
      const asset = entries.get(key);
      if (!asset) return false;
      entries.delete(key);
      disposeCardNewsBrowserAsset(asset);
      return true;
    },
    get(key: string) {
      return entries.get(key);
    },
    clear() {
      for (const asset of entries.values()) disposeCardNewsBrowserAsset(asset);
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}

export const browserCardNewsAssetAdapter = {
  prepare: prepareCardNewsBrowserAsset,
  dispose: disposeCardNewsBrowserAsset,
  createCache: createCardNewsBrowserAssetCache,
};
