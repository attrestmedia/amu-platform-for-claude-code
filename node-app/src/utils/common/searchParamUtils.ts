type SearchParamsLike = {
  get(name: string): string | null;
  has(name: string): boolean;
  toString(): string;
};

const AMP_ENCODED_PREFIXES = ["amp;", "amp%3B"] as const;

function getAmpEncodedKeys(key: string) {
  return AMP_ENCODED_PREFIXES.map((prefix) => `${prefix}${key}`);
}

export function getSearchParamWithAmpFallback(searchParams: SearchParamsLike, key: string) {
  const direct = searchParams.get(key);
  if (direct != null) return direct;

  for (const encodedKey of getAmpEncodedKeys(key)) {
    const value = searchParams.get(encodedKey);
    if (value != null) return value;
  }

  return null;
}

export function hasSearchParamWithAmpFallback(searchParams: SearchParamsLike, key: string) {
  if (searchParams.has(key)) return true;
  return getAmpEncodedKeys(key).some((encodedKey) => searchParams.has(encodedKey));
}

export function createCanonicalSearchParams(searchParams: SearchParamsLike, keys: readonly string[]) {
  const next = new URLSearchParams(searchParams.toString());

  keys.forEach((key) => {
    getAmpEncodedKeys(key).forEach((encodedKey) => {
      const value = next.get(encodedKey);
      if (value != null && !next.has(key)) next.set(key, value);
      next.delete(encodedKey);
    });
  });

  return next;
}
