import type { UserExtendedScopeType, UiScopeType } from "types/ai";
import type {
  PromptItemType,
  PromptItemExtendedType,
  PromptItemOptionType,
  PromptGenType,
  PromptVisibilityType,
  DeletePolicyType,
  ImagePromptMetaType,
  ImageExtraPromptBookmarkType,
  LibraryImageKindType,
  PromptListViewType,
  StudioImageSearchFieldType,
  StudioGenerationSourceServiceType,
} from "types/app";
import fetchClient from "libs/api/fetchClient";
import { getResponseStatus } from "utils/common";

type ApiEnvelopeType<T = unknown> = {
  ok?: boolean;
  data?: T;
  error?: string;
  pageInfo?: PromptOffsetPageInfo;
};

export type LibraryImageUploadResult = {
  assetId: string;
  url: string;
  urlKind: "signed" | "worker" | "none";
  urlExpiresAt?: string;
  refreshUrl?: string;
  visibility: "private";
  sourceService: "upload";
  sourceBytes: number;
  bytes: number;
};

export type LibraryImageEditSaveMode = "new" | "overwrite";
export type LibraryImageOptimizationMode = "quality" | "compact";

export type LibraryImageEditResult = Partial<ImagePromptMetaType> & {
  saveMode: LibraryImageEditSaveMode;
  optimizationMode: LibraryImageOptimizationMode;
  assetId: string;
  url: string;
  sourceBytes: number;
  bytes: number;
};

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/lab/image-prompts) 호출 구성  응답/에러 정리 반환
 * @domain lab
 * @scope client
 */

const BASE_SYSTEM = "/lab/image-prompts";
const BASE_USER = "/lab/image-prompts/user";
const BASE_SERVICE = "/lab/image-prompts/service";

const pickBase = (scope?: UiScopeType) => (scope === "user" ? BASE_USER : BASE_SYSTEM);

export type PromptOffsetPageInfo = {
  limit: number;
  skip: number;
  nextSkip: number | null;
  hasMore: boolean;
  total?: number;
};

type ImagePromptListParams = {
  q?: string;
  category?: string;
  enabled?: boolean;
  scope?: UiScopeType;
  view?: PromptListViewType;
  limit?: number;
  skip?: number;
};

export async function listImagePromptsPage(params?: ImagePromptListParams) {
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

export async function listImagePrompts(params?: ImagePromptListParams) {
  const page = await listImagePromptsPage(params);
  return page.items;
}

export async function getImagePrompt(key: string, opts?: { scope?: UiScopeType }) {
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

export async function getServiceInternalImagePrompt(key: string) {
  try {
    const out = await fetchClient.get<ApiEnvelopeType<unknown>>(`${BASE_SERVICE}/${encodeURIComponent(key)}`, {
      responseType: "auto",
    });
    return out.data?.data;
  } catch (e: unknown) {
    if (getResponseStatus(e) === 404) return null;
    throw e;
  }
}

export async function upsertImagePrompt(payload: PromptItemType, opts?: PromptItemOptionType) {
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

export async function deleteImagePrompt(key: string, opts?: { scope?: UiScopeType }) {
  const base = pickBase(opts?.scope);

  // system/user 모두 body-delete 방식 유지
  const out = await fetchClient.deleteWithBody<ApiEnvelopeType<unknown>>(base, { key }, {
    responseType: "auto",
    loading: "global",
  });
  const json = out.data;
  if (json?.ok === false) throw new Error(json?.error || "delete_failed");
  return true;
}

// 생성된 genstudio 이미지 가져오기
export async function listStudioImages(params?: {
  scope?: UserExtendedScopeType;
  universeId?: string;
  folder?: string;
  templateKey?: string;
  generationMode?: PromptGenType;
  limit?: number;
  skip?: number;
  visibility?: PromptVisibilityType;
  includeMeta?: boolean;
}) {
  const isSharedPublicRead = params?.scope === "all" && params?.visibility === "public";
  const endpoint = isSharedPublicRead ? "/lab/studio-images/public" : "/lab/studio-images";

  const out = await fetchClient.get<ApiEnvelopeType<string[]>>(endpoint, {
    params: {
      ...(params?.scope ? { scope: params.scope } : {}),
      ...(params?.universeId ? { universeId: params.universeId } : {}),
      ...(params?.folder && params.folder.trim() ? { folder: params.folder.trim() } : {}),
      ...(params?.templateKey ? { templateKey: params.templateKey } : {}),
      ...(params?.generationMode ? { generationMode: params.generationMode } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(typeof params?.skip === "number" ? { skip: params.skip } : {}),
      ...(params?.visibility ? { visibility: params.visibility } : {}),
      ...(params?.includeMeta ? { includeMeta: true } : {}),
    },
    responseType: "auto",
  });
  return (out.data?.data || []) as string[];
}

// 메타 이미지 가져오기
export async function listStudioImageMetas(params?: {
  scope?: UserExtendedScopeType;
  universeId?: string;
  folder?: string;
  templateKey?: string;
  generationMode?: PromptGenType;
  limit?: number;
  skip?: number;
  visibility?: PromptVisibilityType;
  q?: string;
  searchField?: StudioImageSearchFieldType;
}) {
  const isSharedPublicRead = params?.scope === "all" && params?.visibility === "public";
  const endpoint = isSharedPublicRead ? "/lab/studio-images/public" : "/lab/studio-images";

  const out = await fetchClient.get<ApiEnvelopeType<ImagePromptMetaType[]>>(endpoint, {
    params: {
      ...(params?.scope ? { scope: params.scope } : {}),
      ...(params?.universeId ? { universeId: params.universeId } : {}),
      ...(params?.folder && params.folder.trim() ? { folder: params.folder.trim() } : {}),
      ...(params?.templateKey ? { templateKey: params.templateKey } : {}),
      ...(params?.generationMode ? { generationMode: params.generationMode } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(typeof params?.skip === "number" ? { skip: params.skip } : {}),
      ...(params?.visibility ? { visibility: params.visibility } : {}),
      ...(params?.q ? { q: params.q } : {}),
      ...(params?.searchField ? { searchField: params.searchField } : {}),
      includeMeta: true,
    },
    responseType: "auto",
    cache: "no-store",
  });
  return (out.data?.data || []) as ImagePromptMetaType[];
}

export async function listStudioImageMetasPage(params?: {
  scope?: UserExtendedScopeType | "mine";
  universeId?: string;
  folder?: string;
  templateKey?: string;
  generationMode?: PromptGenType;
  limit?: number;
  skip?: number;
  visibility?: PromptVisibilityType;
  q?: string;
  searchField?: StudioImageSearchFieldType;
  sourceService?: StudioGenerationSourceServiceType;
  libraryKind?: LibraryImageKindType;
  sourceSurface?: string;
  createdFrom?: string;
  createdBefore?: string;
}) {
  const isSharedPublicRead = params?.scope === "all" && params?.visibility === "public";
  const endpoint = isSharedPublicRead ? "/lab/studio-images/public" : "/lab/studio-images";

  const out = await fetchClient.get<ApiEnvelopeType<ImagePromptMetaType[]>>(endpoint, {
    params: {
      ...(params?.scope ? { scope: params.scope } : {}),
      ...(params?.universeId ? { universeId: params.universeId } : {}),
      ...(params?.folder && params.folder.trim() ? { folder: params.folder.trim() } : {}),
      ...(params?.templateKey ? { templateKey: params.templateKey } : {}),
      ...(params?.generationMode ? { generationMode: params.generationMode } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(typeof params?.skip === "number" ? { skip: params.skip } : {}),
      ...(params?.visibility ? { visibility: params.visibility } : {}),
      ...(params?.q ? { q: params.q } : {}),
      ...(params?.searchField ? { searchField: params.searchField } : {}),
      ...(params?.sourceService ? { sourceService: params.sourceService } : {}),
      ...(params?.libraryKind ? { libraryKind: params.libraryKind } : {}),
      ...(params?.sourceSurface ? { sourceSurface: params.sourceSurface } : {}),
      ...(params?.createdFrom ? { createdFrom: params.createdFrom } : {}),
      ...(params?.createdBefore ? { createdBefore: params.createdBefore } : {}),
      includeMeta: true,
    },
    responseType: "auto",
    cache: "no-store",
  });

  const items = (out.data?.data || []) as ImagePromptMetaType[];
  const pageInfo = out.data?.pageInfo;
  return {
    items,
    pageInfo,
    hasMore: Boolean(pageInfo?.hasMore),
    nextSkip: typeof pageInfo?.nextSkip === "number" ? pageInfo.nextSkip : null,
    total: typeof pageInfo?.total === "number" ? pageInfo.total : undefined,
  };
}

export async function uploadLibraryImage(file: File) {
  const form = new FormData();
  form.set("file", file);
  const out = await fetchClient.post<ApiEnvelopeType<LibraryImageUploadResult>>(
    "/lab/studio-images/upload",
    form,
    { timeout: 60_000, loading: "global" },
  );
  if (!out.data?.ok || !out.data.data) throw new Error(out.data?.error || "image_upload_failed");
  return out.data.data;
}

export async function fetchEditableLibraryImageFile(assetId: string, fallbackName = "library-image") {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  if (!safeAssetId) throw new Error("assetId_required");

  const out = await fetchClient.get<ArrayBuffer>(`/lab/studio-images/${safeAssetId}/editable-file`, {
    responseType: "arrayBuffer",
    cache: "no-store",
  });
  const mimeType = String(out.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!(out.data instanceof ArrayBuffer) || out.data.byteLength <= 0) {
    throw new Error("editable_image_empty");
  }
  if (!mimeType.startsWith("image/")) throw new Error("editable_image_invalid_content_type");

  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
  const file = new File([out.data], `${fallbackName}.${ext}`, { type: mimeType });
  return { file, name: file.name };
}

export async function saveEditedLibraryImage(
  assetId: string,
  file: File,
  saveMode: LibraryImageEditSaveMode,
  optimizationMode: LibraryImageOptimizationMode = "quality",
) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const form = new FormData();
  form.set("file", file);
  form.set("saveMode", saveMode);
  form.set("optimizationMode", optimizationMode);
  const out = await fetchClient.post<ApiEnvelopeType<LibraryImageEditResult>>(
    `/lab/studio-images/${safeAssetId}/edit`,
    form,
    { timeout: 60_000, loading: "global" },
  );
  if (!out.data?.ok || !out.data.data) throw new Error(out.data?.error || "image_edit_failed");
  return out.data.data;
}

export async function listStudioImageTemplatePreviewMetas(params?: {
  templateKeys?: string[];
  perTemplate?: number;
}) {
  const templateKeys = Array.from(new Set((params?.templateKeys || []).map((key) => String(key || "").trim()).filter(Boolean)));
  if (!templateKeys.length) return {} as Record<string, ImagePromptMetaType[]>;

  const out = await fetchClient.get<ApiEnvelopeType<Record<string, ImagePromptMetaType[]>>>(
    "/lab/studio-images/public/template-previews",
    {
      params: {
        templateKeys: templateKeys.join(","),
        ...(typeof params?.perTemplate === "number" ? { perTemplate: params.perTemplate } : {}),
      },
      responseType: "auto",
    },
  );

  return (out.data?.data || {}) as Record<string, ImagePromptMetaType[]>;
}

type BookmarkKeysResponse = { keys?: string[] };
type ExtraPromptBookmarkResponse = { items?: ImageExtraPromptBookmarkType[] };

export async function listImagePromptBookmarks() {
  const out = await fetchClient.get<ApiEnvelopeType<BookmarkKeysResponse>>("/lab/image-prompts/bookmarks", {
    responseType: "auto",
  });
  return (out.data?.data?.keys || []) as string[];
}

export async function setImagePromptBookmark(templateKey: string, bookmarked: boolean) {
  const out = await fetchClient.post<ApiEnvelopeType<BookmarkKeysResponse>>(
    "/lab/image-prompts/bookmarks",
    {
      action: "set",
      templateKey,
      bookmarked,
    },
    { responseType: "auto" },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "set_bookmark_failed");
  return (json?.data?.keys || []) as string[];
}

export async function clearImagePromptBookmarks() {
  const out = await fetchClient.post<ApiEnvelopeType<BookmarkKeysResponse>>(
    "/lab/image-prompts/bookmarks",
    {
      action: "clear_all",
    },
    { responseType: "auto" },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "clear_bookmarks_failed");
  return (json?.data?.keys || []) as string[];
}

export async function listImageExtraPromptBookmarks(params?: { templateKey?: string }) {
  const out = await fetchClient.get<ApiEnvelopeType<ExtraPromptBookmarkResponse>>(
    "/lab/image-prompts/extra-prompt-bookmarks",
    {
      params: {
        ...(params?.templateKey ? { templateKey: params.templateKey } : {}),
      },
      responseType: "auto",
    },
  );
  return (out.data?.data?.items || []) as ImageExtraPromptBookmarkType[];
}

export async function addImageExtraPromptBookmark(templateKey: string, text: string) {
  const out = await fetchClient.post<ApiEnvelopeType<ExtraPromptBookmarkResponse>>(
    "/lab/image-prompts/extra-prompt-bookmarks",
    {
      action: "add",
      templateKey,
      text,
    },
    { responseType: "auto" },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "add_extra_prompt_bookmark_failed");
  return (json?.data?.items || []) as ImageExtraPromptBookmarkType[];
}

export async function removeImageExtraPromptBookmark(id: string) {
  const out = await fetchClient.post<ApiEnvelopeType<ExtraPromptBookmarkResponse>>(
    "/lab/image-prompts/extra-prompt-bookmarks",
    {
      action: "remove",
      id,
    },
    { responseType: "auto" },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "remove_extra_prompt_bookmark_failed");
  return (json?.data?.items || []) as ImageExtraPromptBookmarkType[];
}

export async function clearImageExtraPromptBookmarks(params?: { templateKey?: string }) {
  const out = await fetchClient.post<ApiEnvelopeType<ExtraPromptBookmarkResponse>>(
    "/lab/image-prompts/extra-prompt-bookmarks",
    params?.templateKey
      ? {
          action: "clear_template",
          templateKey: params.templateKey,
        }
      : {
          action: "clear_all",
        },
    { responseType: "auto" },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "clear_extra_prompt_bookmarks_failed");
  return (json?.data?.items || []) as ImageExtraPromptBookmarkType[];
}

export async function setStudioImageVisibility(assetId: string, visibility: PromptVisibilityType) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.patch<ApiEnvelopeType<Partial<ImagePromptMetaType>>>(`/lab/studio-images/${safeAssetId}`, {
    action: "set_visibility",
    visibility,
  }, { loading: "global" });
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "set_visibility_failed");
  return json?.data;
}

export async function refreshStudioImageSignedUrl(assetId: string) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.get<ApiEnvelopeType<Partial<ImagePromptMetaType>>>(
    `/lab/studio-images/${safeAssetId}/signed-url`,
    {
      responseType: "auto",
      cache: "no-store",
    },
  );
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "refresh_signed_url_failed");
  return json?.data;
}

export async function setStudioImageTemplateKey(assetId: string, templateKey?: string) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.patch<ApiEnvelopeType<unknown>>(`/lab/studio-images/${safeAssetId}`, {
    action: "set_template_key",
    templateKey: String(templateKey || "").trim(),
  }, { loading: "global" });
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "set_template_key_failed");
  return json?.data;
}

export async function deleteStudioImage(assetId: string, opts?: { policy?: DeletePolicyType; reason?: string }) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.deleteWithBody<ApiEnvelopeType<unknown>>(`/lab/studio-images/${safeAssetId}`, {
    policy: opts?.policy || "soft",
    reason: opts?.reason || "user_delete",
  }, { loading: "global" });
  const json = out.data;
  if (!json?.ok) throw new Error(json?.error || "delete_studio_image_failed");
  return json?.data;
}
