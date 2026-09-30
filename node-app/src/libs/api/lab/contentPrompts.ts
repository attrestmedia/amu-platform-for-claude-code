import fetchClient from "libs/api/fetchClient";
import type { UiScopeType } from "types/ai";
import type { UserExtendedScopeType } from "types/ai";
import type {
  ContentAssetMetaType,
  ContentAssetPreviewType,
  PromptItemExtendedType,
  PromptVisibilityType,
  DeletePolicyType,
  PromptListViewType,
} from "types/app";
import { getResponseStatus, type UnknownRecord } from "utils/common";

type ApiEnvelopeType<T = unknown> = {
  ok?: boolean;
  data?: T;
  error?: string;
  pageInfo?: PromptOffsetPageInfo;
};
type BookmarkKeysResponse = { keys?: string[] };

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/lab/content-prompts) 호출 구성  응답/에러 정리 반환
 * @domain lab
 * @scope client
 */

const BASE_SYSTEM = "/lab/content-prompts";
const BASE_USER = "/lab/content-prompts/user";

const pickBase = (scope?: UiScopeType) => (scope === "user" ? BASE_USER : BASE_SYSTEM);

export type PromptOffsetPageInfo = {
  limit: number;
  skip: number;
  nextSkip: number | null;
  hasMore: boolean;
  total?: number;
};

type ContentPromptListParams = {
  q?: string;
  category?: string;
  enabled?: boolean;
  scope?: UiScopeType;
  view?: PromptListViewType;
  limit?: number;
  skip?: number;
};

export async function listContentPromptsPage(params?: ContentPromptListParams) {
  const base =
    params?.scope === "user" ? BASE_USER : params?.view === "admin" ? `${BASE_SYSTEM}/admin` : BASE_SYSTEM;

  const out = await fetchClient.get<ApiEnvelopeType<PromptItemExtendedType[]>>(base, {
    params: {
      ...(params?.q ? { q: params.q } : {}),
      ...(params?.category ? { category: params.category } : {}),
      ...(typeof params?.enabled === "boolean" ? { enabled: params.enabled } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(typeof params?.skip === "number" ? { skip: params.skip } : {}),
    },
    responseType: "auto",
  });
  const items = out.data?.data || [];
  const pageInfo = out.data?.pageInfo;
  return {
    items,
    pageInfo,
    hasMore: Boolean(pageInfo?.hasMore),
    nextSkip: typeof pageInfo?.nextSkip === "number" ? pageInfo.nextSkip : null,
    total: typeof pageInfo?.total === "number" ? pageInfo.total : undefined,
  };
}

export async function listContentPrompts(params?: ContentPromptListParams) {
  const page = await listContentPromptsPage(params);
  return page.items;
}

export async function getContentPrompt(key: string, opts?: { scope?: UiScopeType }) {
  const base = pickBase(opts?.scope);
  try {
    const out = await fetchClient.get<ApiEnvelopeType<unknown>>(`${base}/${encodeURIComponent(key)}`, {
      responseType: "auto",
    });
    return out.data?.data;
  } catch (e: unknown) {
    if (getResponseStatus(e) === 404) return null;
    throw e;
  }
}

export async function upsertContentPrompt(
  payload: {
    key: string;
    title: string;
    categories?: string[];
    templateText: string;
    defaultParams?: UnknownRecord;
    tags?: string[];
    enabled?: boolean;
  },
  opts?: { strictNew?: boolean; originalKey?: string; overwrite?: boolean; scope?: UiScopeType },
) {
  const base = pickBase(opts?.scope);

  const out = await fetchClient.post<ApiEnvelopeType<PromptItemExtendedType>>(
    base,
    {
      ...payload,
      strictNew: opts?.strictNew === true,
      originalKey: opts?.originalKey,
      overwrite: opts?.overwrite === true,
    },
    { responseType: "auto", loading: "global" },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "save_failed");
  return json?.data;
}

export async function deleteContentPrompt(key: string, opts?: { scope?: UiScopeType }) {
  const base = pickBase(opts?.scope);
  await fetchClient.delete(`${base}/${encodeURIComponent(key)}`, { loading: "global" });
}

export async function listContentPromptBookmarks() {
  const out = await fetchClient.get<ApiEnvelopeType<BookmarkKeysResponse>>("/lab/content-prompts/bookmarks", {
    responseType: "auto",
  });
  return (out.data?.data?.keys || []) as string[];
}

export async function setContentPromptBookmark(templateKey: string, bookmarked: boolean) {
  const out = await fetchClient.post<ApiEnvelopeType<BookmarkKeysResponse>>(
    "/lab/content-prompts/bookmarks",
    { action: "set", templateKey, bookmarked },
    { responseType: "auto" },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "set_content_bookmark_failed");
  return (json?.data?.keys || []) as string[];
}

export async function clearContentPromptBookmarks() {
  const out = await fetchClient.post<ApiEnvelopeType<BookmarkKeysResponse>>(
    "/lab/content-prompts/bookmarks",
    { action: "clear_all" },
    { responseType: "auto" },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "clear_content_bookmarks_failed");
  return (json?.data?.keys || []) as string[];
}

export async function listStudioContents(params?: {
  scope?: UserExtendedScopeType;
  universeId?: string;
  templateKey?: string;
  limit?: number;
  visibility?: PromptVisibilityType;
  includeMeta?: boolean;
}) {
  const isSharedPublicRead = params?.scope === "all" && params?.visibility === "public";
  const endpoint = isSharedPublicRead ? "/lab/studio-contents/public" : "/lab/studio-contents";

  const out = await fetchClient.get<ApiEnvelopeType<string[]>>(endpoint, {
    params: {
      ...(params?.scope ? { scope: params.scope } : {}),
      ...(params?.universeId ? { universeId: params.universeId } : {}),
      ...(params?.templateKey ? { templateKey: params.templateKey } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(params?.visibility ? { visibility: params.visibility } : {}),
      ...(params?.includeMeta ? { includeMeta: true } : {}),
    },
    responseType: "auto",
  });
  return (out.data?.data || []) as string[];
}

export async function listStudioContentMetas(params?: {
  scope?: UserExtendedScopeType;
  universeId?: string;
  templateKey?: string;
  limit?: number;
  visibility?: PromptVisibilityType;
}) {
  const isSharedPublicRead = params?.scope === "all" && params?.visibility === "public";
  const endpoint = isSharedPublicRead ? "/lab/studio-contents/public" : "/lab/studio-contents";

  const out = await fetchClient.get<ApiEnvelopeType<ContentAssetPreviewType[]>>(endpoint, {
    params: {
      ...(params?.scope ? { scope: params.scope } : {}),
      ...(params?.universeId ? { universeId: params.universeId } : {}),
      ...(params?.templateKey ? { templateKey: params.templateKey } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(params?.visibility ? { visibility: params.visibility } : {}),
      includeMeta: true,
    },
    responseType: "auto",
  });
  return (out.data?.data || []) as ContentAssetPreviewType[];
}

export async function listStudioContentTemplatePreviewMetas(params?: {
  templateKeys?: string[];
  perTemplate?: number;
}) {
  const templateKeys = Array.from(
    new Set((params?.templateKeys || []).map((key) => String(key || "").trim()).filter(Boolean)),
  );
  if (!templateKeys.length) return {} as Record<string, ContentAssetPreviewType[]>;

  const out = await fetchClient.get<ApiEnvelopeType<Record<string, ContentAssetPreviewType[]>>>(
    "/lab/studio-contents/public/template-previews",
    {
      params: {
        templateKeys: templateKeys.join(","),
        ...(typeof params?.perTemplate === "number" ? { perTemplate: params.perTemplate } : {}),
      },
      responseType: "auto",
    },
  );

  return (out.data?.data || {}) as Record<string, ContentAssetPreviewType[]>;
}

export async function listOwnedStudioContentTemplatePreviewMetas(params: {
  templateKeys: string[];
  perTemplate?: number;
  scope?: "user" | "universe";
  universeId?: string;
}) {
  const templateKeys = Array.from(
    new Set((params.templateKeys || []).map((key) => String(key || "").trim()).filter(Boolean)),
  );
  if (!templateKeys.length) return {} as Record<string, ContentAssetPreviewType[]>;

  const out = await fetchClient.get<ApiEnvelopeType<Record<string, ContentAssetPreviewType[]>>>(
    "/lab/studio-contents/template-previews",
    {
      params: {
        templateKeys: templateKeys.join(","),
        ...(typeof params.perTemplate === "number" ? { perTemplate: params.perTemplate } : {}),
        ...(params.scope ? { scope: params.scope } : {}),
        ...(params.universeId ? { universeId: params.universeId } : {}),
      },
      responseType: "auto",
      cache: "no-store",
    },
  );

  return (out.data?.data || {}) as Record<string, ContentAssetPreviewType[]>;
}

export async function getPublicStudioContentMeta(assetId: string) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.get<ApiEnvelopeType<ContentAssetMetaType>>(
    `/lab/studio-contents/public/${safeAssetId}`,
    { responseType: "auto" },
  );
  return (out.data?.data || null) as ContentAssetMetaType | null;
}

export async function getStudioContentMeta(
  assetId: string,
  visibility: PromptVisibilityType,
  preferAuthenticated = false,
) {
  if (visibility === "public" && !preferAuthenticated) return getPublicStudioContentMeta(assetId);
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.get<ApiEnvelopeType<ContentAssetMetaType>>(`/lab/studio-contents/${safeAssetId}`, {
    responseType: "auto",
    cache: "no-store",
  });
  return (out.data?.data || null) as ContentAssetMetaType | null;
}

export async function setStudioContentVisibility(assetId: string, visibility: PromptVisibilityType) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.patch<ApiEnvelopeType<unknown>>(`/lab/studio-contents/${safeAssetId}`, {
    action: "set_visibility",
    visibility,
  }, { loading: "global" });
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "set_visibility_failed");
  return json?.data;
}

export async function deleteStudioContent(assetId: string, opts?: { policy?: DeletePolicyType; reason?: string }) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.deleteWithBody<ApiEnvelopeType<unknown>>(`/lab/studio-contents/${safeAssetId}`, {
    policy: opts?.policy || "soft",
    reason: opts?.reason || "user_delete",
  }, { loading: "global" });
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "delete_studio_content_failed");
  return json?.data;
}
