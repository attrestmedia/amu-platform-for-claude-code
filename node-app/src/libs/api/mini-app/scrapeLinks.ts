import fetchClient from "libs/api/fetchClient";

/**
 * @docHint
 * @purpose Scrape Links 미니앱 클라이언트 API 래퍼
 * @process fetchClient로 서버 라우트 호출 → 표준 응답 파싱
 * @domain mini-app.scrape-links
 * @scope client_api
 */

export interface IScrapeLinkItem {
  id: string;
  url: string;
  normalizedUrl: string;
  domain: string;
  label: string;
  note: string;
  categoryId: string;
  categoryName: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogSiteName: string;
  ogStatus: "idle" | "pending" | "success" | "failed";
  ogFetchedAt: string | null;
  checked: boolean;
  checkedAt: string | null;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface IScrapeLinkCategory {
  id: string;
  name: string;
  count: number;
  createdAt: string | null;
  updatedAt: string | null;
}

type SaveLinksInput = {
  text?: string;
  urls?: string[];
  source?: "paste" | "manual" | "text-extract";
  baseDomain?: string | null;
  categoryId?: string | null;
};
type SaveLinksResult = { created: IScrapeLinkItem[]; skipped: number; received: number };

type ListLinksInput = {
  checked?: "all" | "done" | "todo";
  query?: string;
  category?: string | null;
  limit?: number;
  cursor?: string | null;
};
type ListLinksResult = { items: IScrapeLinkItem[]; nextCursor: string | null };
export type ScrapeLinksMarketingUniverseOption = { id: string; name: string };
export type ScrapeLinksMarketingOptions = {
  universes: ScrapeLinksMarketingUniverseOption[];
  maxBatchSize: number;
};
export type ScrapeLinksMarketingEnqueueInput = {
  ids: string[];
  universeId: string;
  queueCategory?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  reviewMode?: string;
  channels?: string[];
};
export type ScrapeLinksMarketingEnqueueResult = {
  enqueued?: Array<{ jobId?: string; url?: string }>;
  skipped?: Array<{ jobId?: string; url?: string; reason?: string }>;
  failed?: Array<{ url?: string; reason?: string; error?: string }>;
  received?: number;
  maxBatchSize?: number;
};

export async function saveLinks(input: SaveLinksInput): Promise<SaveLinksResult> {
  const res = await fetchClient.post<{ ok: boolean; data?: SaveLinksResult; error?: string }>(
    "/mini-apps/scrape-links/links",
    input,
    { timeout: 15000 },
  );
  if (!res.data?.ok) throw new Error(res.data?.error || "save_failed");
  return res.data.data as SaveLinksResult;
}

export async function listLinks(input: ListLinksInput): Promise<ListLinksResult> {
  const params = {
    checked: input.checked,
    q: input.query,
    category: input.category,
    limit: input.limit,
    cursor: input.cursor,
  };
  const res = await fetchClient.get<{ ok: boolean; data?: ListLinksResult; error?: string }>(
    "/mini-apps/scrape-links/links",
    { params, timeout: 15000 },
  );
  if (!res.data?.ok) throw new Error(res.data?.error || "list_failed");
  return res.data.data as ListLinksResult;
}

export async function patchLink(
  id: string,
  patch: { label?: string; note?: string; checked?: boolean; categoryId?: string | null },
): Promise<IScrapeLinkItem> {
  const res = await fetchClient.patch<{ ok: boolean; data?: IScrapeLinkItem; error?: string }>(
    `/mini-apps/scrape-links/links/${encodeURIComponent(id)}`,
    patch,
    { timeout: 10000 },
  );
  if (!res.data?.ok) throw new Error(res.data?.error || "patch_failed");
  return res.data.data as IScrapeLinkItem;
}

export async function deleteLink(id: string): Promise<boolean> {
  const res = await fetchClient.delete<{ ok: boolean; error?: string }>(
    `/mini-apps/scrape-links/links/${encodeURIComponent(id)}`,
    { timeout: 10000 },
  );
  return Boolean(res.data?.ok);
}

export interface IScrapeLinkCategoryList {
  items: IScrapeLinkCategory[];
  total: number;
  uncategorized: number;
}

export async function listCategories(): Promise<IScrapeLinkCategoryList> {
  const res = await fetchClient.get<{
    ok: boolean;
    data?: { items: IScrapeLinkCategory[]; total?: number; uncategorized?: number };
    error?: string;
  }>("/mini-apps/scrape-links/categories", { timeout: 10000 });
  if (!res.data?.ok) throw new Error(res.data?.error || "categories_failed");
  const items = res.data.data?.items || [];
  return {
    items,
    total: Number(res.data.data?.total ?? items.reduce((acc, c) => acc + (c.count || 0), 0)),
    uncategorized: Number(res.data.data?.uncategorized ?? 0),
  };
}

export async function createCategory(name: string): Promise<IScrapeLinkCategory> {
  const res = await fetchClient.post<{ ok: boolean; data?: IScrapeLinkCategory; error?: string }>(
    "/mini-apps/scrape-links/categories",
    { name },
    { timeout: 10000 },
  );
  if (!res.data?.ok) throw new Error(res.data?.error || "category_create_failed");
  return res.data.data as IScrapeLinkCategory;
}

export async function patchCategory(id: string, patch: { name: string }): Promise<IScrapeLinkCategory> {
  const res = await fetchClient.patch<{ ok: boolean; data?: IScrapeLinkCategory; error?: string }>(
    `/mini-apps/scrape-links/categories/${encodeURIComponent(id)}`,
    patch,
    { timeout: 10000 },
  );
  if (!res.data?.ok) throw new Error(res.data?.error || "category_patch_failed");
  return res.data.data as IScrapeLinkCategory;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const res = await fetchClient.delete<{ ok: boolean; error?: string }>(
    `/mini-apps/scrape-links/categories/${encodeURIComponent(id)}`,
    { timeout: 10000 },
  );
  return Boolean(res.data?.ok);
}

export interface IOgFetchResult {
  id: string;
  status: "success" | "failed";
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogSiteName?: string;
}

export async function fetchOg(ids: string[]): Promise<IOgFetchResult[]> {
  const res = await fetchClient.post<{ ok: boolean; data?: { results: IOgFetchResult[] }; error?: string }>(
    "/mini-apps/scrape-links/og",
    { ids },
    { timeout: 60000 },
  );
  if (!res.data?.ok) throw new Error(res.data?.error || "og_failed");
  return res.data.data?.results || [];
}

export async function getScrapeLinksMarketingOptions(): Promise<ScrapeLinksMarketingOptions> {
  const res = await fetchClient.get<{ ok: boolean; data?: ScrapeLinksMarketingOptions; error?: string }>(
    "/mini-apps/scrape-links/marketing",
    { timeout: 10000 },
  );
  if (!res.data?.ok) throw new Error(res.data?.error || "marketing_options_failed");
  return res.data.data as ScrapeLinksMarketingOptions;
}

export async function enqueueScrapeLinksToMarketingQueue(
  input: ScrapeLinksMarketingEnqueueInput,
): Promise<ScrapeLinksMarketingEnqueueResult> {
  const res = await fetchClient.post<{ ok: boolean; data?: ScrapeLinksMarketingEnqueueResult; error?: string }>(
    "/mini-apps/scrape-links/marketing",
    input,
    { timeout: 30000 },
  );
  if (!res.data?.ok) throw new Error(res.data?.error || "marketing_enqueue_failed");
  return res.data.data as ScrapeLinksMarketingEnqueueResult;
}
