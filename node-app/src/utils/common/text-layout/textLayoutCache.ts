import type { PreparedTextLayoutHandle } from "types/ui";

const PREPARED_CACHE_LIMIT = 200;
const WIDTH_CACHE_LIMIT = 4000;

const preparedCache = new Map<string, PreparedTextLayoutHandle>();
const widthCache = new Map<string, number>();

function rememberWithLimit<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);

  if (cache.size <= limit) return;

  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

export function getPreparedTextLayoutCache(cacheKey: string) {
  return preparedCache.get(cacheKey) || null;
}

export function setPreparedTextLayoutCache(handle: PreparedTextLayoutHandle) {
  rememberWithLimit(preparedCache, handle.cacheKey, handle, PREPARED_CACHE_LIMIT);
}

export function getTextLayoutWidthCache(cacheKey: string) {
  return widthCache.get(cacheKey);
}

export function setTextLayoutWidthCache(cacheKey: string, width: number) {
  rememberWithLimit(widthCache, cacheKey, width, WIDTH_CACHE_LIMIT);
}

export function clearTextLayoutCaches() {
  preparedCache.clear();
  widthCache.clear();
}

