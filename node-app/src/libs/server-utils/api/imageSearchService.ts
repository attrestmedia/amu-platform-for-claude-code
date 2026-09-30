import "server-only";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";

export const STOCK_IMAGE_SEARCH_PROVIDERS = ["pexels", "pixabay", "unsplash"] as const;
export type StockImageSearchProvider = (typeof STOCK_IMAGE_SEARCH_PROVIDERS)[number];
export type StockImageSearchOrientation = "landscape" | "portrait" | "square";

export type StockImageSearchItem = {
  id: string;
  source: StockImageSearchProvider;
  url: string;
  thumbnailUrl: string;
  alt: string;
  width: number;
  height: number;
  author: string;
  authorUrl: string;
  sourceUrl: string;
  attribution: string;
  licenseUrl: string;
};

type SearchParams = {
  query: string;
  providers: StockImageSearchProvider[];
  count: number;
  random: boolean;
  orientation?: StockImageSearchOrientation;
};

type ProviderResult = {
  provider: StockImageSearchProvider;
  items: StockImageSearchItem[];
  error?: string;
};

function takeRandom<T>(items: T[], count: number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, count);
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`upstream_http_${response.status}`);
  return (await response.json()) as T;
}

async function searchPexels(params: SearchParams): Promise<ProviderResult> {
  try {
    const key = (await resolvePlatformCredential("stock.pexels.search")).payload.apiKey;
    const perPage = params.random ? 50 : params.count;
    const searchParams = new URLSearchParams({ query: params.query, per_page: String(perPage) });
    if (params.orientation) searchParams.set("orientation", params.orientation);
    const data = await fetchJson<{
      photos?: Array<{
        id?: number;
        width?: number;
        height?: number;
        url?: string;
        photographer?: string;
        photographer_url?: string;
        alt?: string;
        src?: { large2x?: string; medium?: string };
      }>;
    }>(`https://api.pexels.com/v1/search?${searchParams.toString()}`, {
      headers: { Authorization: key },
    });
    const rows = Array.isArray(data.photos) ? data.photos : [];
    const selected = params.random ? takeRandom(rows, params.count) : rows.slice(0, params.count);
    return {
      provider: "pexels",
      items: selected
        .map((item) => ({
          id: String(item.id || ""),
          source: "pexels" as const,
          url: String(item.src?.large2x || ""),
          thumbnailUrl: String(item.src?.medium || item.src?.large2x || ""),
          alt: String(item.alt || params.query),
          width: Number(item.width || 0),
          height: Number(item.height || 0),
          author: String(item.photographer || ""),
          authorUrl: String(item.photographer_url || ""),
          sourceUrl: String(item.url || ""),
          attribution: `Photo by ${String(item.photographer || "Pexels contributor")} on Pexels`,
          licenseUrl: "https://www.pexels.com/license/",
        }))
        .filter((item) => item.id && item.url),
    };
  } catch (error) {
    return { provider: "pexels", items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function searchPixabay(params: SearchParams): Promise<ProviderResult> {
  try {
    const key = (await resolvePlatformCredential("stock.pixabay.search")).payload.apiKey;
    const perPage = params.random ? 50 : Math.max(3, params.count);
    const searchParams = new URLSearchParams({
      key,
      q: params.query,
      image_type: "photo",
      per_page: String(perPage),
      safesearch: "true",
    });
    if (params.orientation === "landscape") searchParams.set("orientation", "horizontal");
    if (params.orientation === "portrait") searchParams.set("orientation", "vertical");
    const data = await fetchJson<{
      hits?: Array<{
        id?: number;
        pageURL?: string;
        largeImageURL?: string;
        webformatURL?: string;
        imageWidth?: number;
        imageHeight?: number;
        tags?: string;
        user?: string;
        userImageURL?: string;
      }>;
    }>(`https://pixabay.com/api/?${searchParams.toString()}`);
    const rows = Array.isArray(data.hits) ? data.hits : [];
    const selected = params.random ? takeRandom(rows, params.count) : rows.slice(0, params.count);
    return {
      provider: "pixabay",
      items: selected
        .map((item) => ({
          id: String(item.id || ""),
          source: "pixabay" as const,
          url: String(item.largeImageURL || item.webformatURL || ""),
          thumbnailUrl: String(item.webformatURL || item.largeImageURL || ""),
          alt: String(item.tags || params.query),
          width: Number(item.imageWidth || 0),
          height: Number(item.imageHeight || 0),
          author: String(item.user || ""),
          authorUrl: String(item.userImageURL || ""),
          sourceUrl: String(item.pageURL || ""),
          attribution: `Image by ${String(item.user || "Pixabay contributor")} from Pixabay`,
          licenseUrl: "https://pixabay.com/service/license-summary/",
        }))
        .filter((item) => item.id && item.url),
    };
  } catch (error) {
    return { provider: "pixabay", items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function searchUnsplash(params: SearchParams): Promise<ProviderResult> {
  try {
    const key = (await resolvePlatformCredential("stock.unsplash.search")).payload.apiKey;
    const orientation =
      params.orientation === "square" ? "squarish" : params.orientation === "landscape" || params.orientation === "portrait"
        ? params.orientation
        : "";
    const searchParams = new URLSearchParams({ query: params.query });
    if (orientation) searchParams.set("orientation", orientation);
    const url = params.random
      ? `https://api.unsplash.com/photos/random?${new URLSearchParams({
          ...Object.fromEntries(searchParams),
          count: String(params.count),
        }).toString()}`
      : `https://api.unsplash.com/search/photos?${new URLSearchParams({
          ...Object.fromEntries(searchParams),
          per_page: String(params.count),
        }).toString()}`;
    const data = await fetchJson<
      | Array<{
          id?: string;
          width?: number;
          height?: number;
          alt_description?: string;
          description?: string;
          urls?: { regular?: string; small?: string };
          links?: { html?: string };
          user?: { name?: string; links?: { html?: string } };
        }>
      | {
          results?: Array<{
            id?: string;
            width?: number;
            height?: number;
            alt_description?: string;
            description?: string;
            urls?: { regular?: string; small?: string };
            links?: { html?: string };
            user?: { name?: string; links?: { html?: string } };
          }>;
        }
    >(url, { headers: { Authorization: `Client-ID ${key}` } });
    const rows = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];
    return {
      provider: "unsplash",
      items: rows
        .slice(0, params.count)
        .map((item) => ({
          id: String(item.id || ""),
          source: "unsplash" as const,
          url: String(item.urls?.regular || ""),
          thumbnailUrl: String(item.urls?.small || item.urls?.regular || ""),
          alt: String(item.alt_description || item.description || params.query),
          width: Number(item.width || 0),
          height: Number(item.height || 0),
          author: String(item.user?.name || ""),
          authorUrl: String(item.user?.links?.html || ""),
          sourceUrl: String(item.links?.html || ""),
          attribution: `Photo by ${String(item.user?.name || "Unsplash contributor")} on Unsplash`,
          licenseUrl: "https://unsplash.com/license",
        }))
        .filter((item) => item.id && item.url),
    };
  } catch (error) {
    return { provider: "unsplash", items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function searchStockImages(params: SearchParams) {
  const results = await Promise.all(
    params.providers.map((provider) => {
      if (provider === "pexels") return searchPexels(params);
      if (provider === "pixabay") return searchPixabay(params);
      return searchUnsplash(params);
    }),
  );
  return {
    items: results.flatMap((result) => result.items),
    errors: results
      .filter((result) => result.error)
      .map((result) => ({ provider: result.provider, error: result.error || "unknown_error" })),
  };
}
