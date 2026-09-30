"use client";

import { listContentPrompts, listContentPromptsPage, listImagePrompts, listImagePromptsPage } from "libs/api/lab";
import { lang } from "components/module/i18n";
import { getPerImageCost, resolveMediaBillingStrategy } from "../payment";
import { normalizeAspectRatioClient } from "../ai";
import {
  DEFAULT_IMAGE_SIZE,
  ASPECT_TO_OPENAI_COMPAT_SIZE,
  IMAGE_SELECTABLE_MODEL_MAP,
  OPENAI_COMPAT_IMAGE_SIZES,
  OPENAI_COMPAT_UI_RATIOS,
  supportsOpenAIFlexibleImageSize,
  SUPPORTED_ASPECT_RATIOS,
  getDefaultGoogleImageSize,
  getImageModelAliasLabel,
  getSupportedGoogleAspectRatios,
  getSupportedGoogleImageSizes,
  getSupportedOpenAIAspectRatios,
  type OpenAICompatImageSize,
  type SupportedAspectRatio,
} from "consts/ai";
import type { ImageProviderType, UiScopeType } from "types/ai";
import type { ImagePromptMetaType, PromptItemExtendedType, PromptItemType, PromptVisibilityType } from "types/app";
import { toSafeString, toTimestamp, toSortIndex } from "utils/common";
import { deduplicateStudioTemplateItems } from "./genStudioTemplateCatalog";

type StudioPromptPageArgs = {
  q?: string;
  enabled?: boolean;
  isLoggedIn?: boolean;
  limit?: number;
  skip?: number;
};

type MergeStudioRecentMetaRowsArgs = {
  ownedRows?: ImagePromptMetaType[];
  publicRows?: ImagePromptMetaType[];
};

function toVisibility(value: unknown): PromptVisibilityType {
  return toSafeString(value).toLowerCase() === "public" ? "public" : "private";
}

function toPromptPageLimit(value: unknown) {
  const limit = Number(value || 30);
  if (!Number.isFinite(limit)) return 30;
  return Math.max(1, Math.min(48, Math.floor(limit)));
}

function toPromptPageSkip(value: unknown) {
  const skip = Number(value || 0);
  if (!Number.isFinite(skip)) return 0;
  return Math.max(0, Math.floor(skip));
}

type WithUpdatedAt = { updatedAt?: unknown };

function mergeStudioPromptRows<T extends PromptItemExtendedType>(
  systemRows: T[] = [],
  userRows: T[] = [],
): Array<T & { templateScope: UiScopeType }> {
  const mergedRows = deduplicateStudioTemplateItems(
    [
      ...userRows.map((row) => ({ ...row, templateScope: "user" as const })),
      ...systemRows.map((row) => ({ ...row, templateScope: "system" as const })),
    ],
    { keep: "first" },
  );

  return mergedRows.sort((a, b) => {
    const diff = toTimestamp((b as WithUpdatedAt)?.updatedAt) - toTimestamp((a as WithUpdatedAt)?.updatedAt);
    if (diff !== 0) return diff;
    return String(a?.title || a?.key || "").localeCompare(String(b?.title || b?.key || ""));
  });
}

export function mergeStudioPromptPageItems<T extends PromptItemType>(currentItems: T[] = [], nextItems: T[] = []) {
  const mergedItems = deduplicateStudioTemplateItems([...currentItems, ...nextItems], { keep: "last" });

  return mergedItems.sort((a, b) => {
    const diff = toTimestamp((b as WithUpdatedAt)?.updatedAt) - toTimestamp((a as WithUpdatedAt)?.updatedAt);
    if (diff !== 0) return diff;
    return String(a?.title || a?.key || "").localeCompare(String(b?.title || b?.key || ""));
  });
}

export async function loadStudioImagePromptItems(args?: { enabled?: boolean; isLoggedIn?: boolean }) {
  const [systemResult, userResult] = await Promise.allSettled([
    listImagePrompts({ enabled: args?.enabled }),
    args?.isLoggedIn ? listImagePrompts({ enabled: args?.enabled, scope: "user" }) : Promise.resolve([]),
  ]);

  const systemRows = systemResult.status === "fulfilled" && Array.isArray(systemResult.value) ? systemResult.value : [];
  const userRows = userResult.status === "fulfilled" && Array.isArray(userResult.value) ? userResult.value : [];

  return mergeStudioPromptRows(systemRows, userRows);
}

export async function loadStudioImagePromptItemsPage(args?: StudioPromptPageArgs) {
  const limit = toPromptPageLimit(args?.limit);
  const skip = toPromptPageSkip(args?.skip);
  const [systemResult, userResult] = await Promise.allSettled([
    listImagePromptsPage({ q: args?.q, enabled: args?.enabled, limit, skip }),
    args?.isLoggedIn
      ? listImagePromptsPage({ q: args?.q, enabled: args?.enabled, scope: "user", limit, skip })
      : Promise.resolve(null),
  ]);

  const systemPage = systemResult.status === "fulfilled" ? systemResult.value : null;
  const userPage = userResult.status === "fulfilled" ? userResult.value : null;
  const systemRows = Array.isArray(systemPage?.items) ? systemPage.items : [];
  const userRows = Array.isArray(userPage?.items) ? userPage.items : [];

  return {
    items: mergeStudioPromptRows(systemRows, userRows),
    hasMore: Boolean(systemPage?.hasMore || userPage?.hasMore),
    nextSkip: skip + limit,
    total: (systemPage?.total || 0) + (userPage?.total || 0),
    limit,
    skip,
  };
}

export async function loadStudioContentPromptItems(args?: { enabled?: boolean; isLoggedIn?: boolean }) {
  const [systemResult, userResult] = await Promise.allSettled([
    listContentPrompts({ enabled: args?.enabled }),
    args?.isLoggedIn ? listContentPrompts({ enabled: args?.enabled, scope: "user" }) : Promise.resolve([]),
  ]);

  const systemRows = systemResult.status === "fulfilled" && Array.isArray(systemResult.value) ? systemResult.value : [];
  const userRows = userResult.status === "fulfilled" && Array.isArray(userResult.value) ? userResult.value : [];

  return mergeStudioPromptRows(systemRows, userRows);
}

export async function loadStudioContentPromptItemsPage(args?: StudioPromptPageArgs) {
  const limit = toPromptPageLimit(args?.limit);
  const skip = toPromptPageSkip(args?.skip);
  const [systemResult, userResult] = await Promise.allSettled([
    listContentPromptsPage({ q: args?.q, enabled: args?.enabled, limit, skip }),
    args?.isLoggedIn
      ? listContentPromptsPage({ q: args?.q, enabled: args?.enabled, scope: "user", limit, skip })
      : Promise.resolve(null),
  ]);

  const systemPage = systemResult.status === "fulfilled" ? systemResult.value : null;
  const userPage = userResult.status === "fulfilled" ? userResult.value : null;
  const systemRows = Array.isArray(systemPage?.items) ? systemPage.items : [];
  const userRows = Array.isArray(userPage?.items) ? userPage.items : [];

  return {
    items: mergeStudioPromptRows(systemRows, userRows),
    hasMore: Boolean(systemPage?.hasMore || userPage?.hasMore),
    nextSkip: skip + limit,
    total: (systemPage?.total || 0) + (userPage?.total || 0),
    limit,
    skip,
  };
}

export function mergeStudioRecentMetaRows({ ownedRows = [], publicRows = [] }: MergeStudioRecentMetaRowsArgs): {
  images: string[];
  metaBySrc: Record<string, ImagePromptMetaType>;
} {
  const mergedRows = [...ownedRows, ...publicRows].sort((a, b) => {
    const timeDiff = toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt);
    if (timeDiff !== 0) return timeDiff;
    const indexDiff = toSortIndex(a?.outputIndex) - toSortIndex(b?.outputIndex);
    if (indexDiff !== 0) return indexDiff;
    return toSafeString(a?.assetId || a?.url).localeCompare(toSafeString(b?.assetId || b?.url));
  });
  const images: string[] = [];
  const metaBySrc: Record<string, ImagePromptMetaType> = {};
  const seenAssetKeys = new Set<string>();

  mergedRows.forEach((row) => {
    const url = toSafeString(row?.url);
    const assetKey = toSafeString(row?.assetId) || url;
    if (!url || metaBySrc[url] || seenAssetKeys.has(assetKey)) return;
    seenAssetKeys.add(assetKey);
    metaBySrc[url] = {
      ...(row || {}),
      url,
      visibility: toVisibility(row?.visibility),
      canEdit: Boolean(row?.canEdit),
      isOwner: Boolean(row?.isOwner),
    };
    images.push(url);
  });

  return { images, metaBySrc };
}

export function clampAspectForProvider(
  provider: ImageProviderType,
  raw: string,
  modelName?: string,
): SupportedAspectRatio {
  const allowed =
    provider === "google"
      ? getSupportedGoogleAspectRatios(modelName)
      : provider === "openai"
        ? getSupportedOpenAIAspectRatios(modelName)
        : provider === "xai"
          ? (OPENAI_COMPAT_UI_RATIOS as readonly SupportedAspectRatio[])
          : SUPPORTED_ASPECT_RATIOS;
  const a = normalizeAspectRatioClient(raw, allowed) as SupportedAspectRatio;
  if (provider === "openai" && supportsOpenAIFlexibleImageSize(modelName)) return a;

  if (provider === "openai" || provider === "xai" || provider === "zai") {
    const mappedSize =
      (ASPECT_TO_OPENAI_COMPAT_SIZE as Record<string, string>)[a] || DEFAULT_IMAGE_SIZE;
    if (mappedSize === "1024x1024") return "1:1";
    if (mappedSize === "1536x1024") return "16:9";
    return "9:16";
  }
  return a;
}

export function normalizeGoogleImageSizeForModel(modelName: string, raw?: string) {
  const allowed = getSupportedGoogleImageSizes(modelName);
  const value = String(raw || "").trim();
  if ((allowed as readonly string[]).includes(value)) return value;
  return getDefaultGoogleImageSize(modelName);
}

export function resolveGoogleImagePriceVariant(modelName: string, rawSize?: string) {
  return normalizeGoogleImageSizeForModel(modelName, rawSize);
}

export function coerceOpenAICompatImageSize(raw: unknown): OpenAICompatImageSize | null {
  const s = typeof raw === "string" ? raw : String(raw ?? "");
  return (OPENAI_COMPAT_IMAGE_SIZES as readonly string[]).includes(s) ? (s as OpenAICompatImageSize) : null;
}

export function inferProviderFromModelName(modelName?: string): ImageProviderType {
  const m = String(modelName || "").trim();
  if (m && (IMAGE_SELECTABLE_MODEL_MAP.openai as readonly string[]).includes(m)) return "openai";
  if (m && (IMAGE_SELECTABLE_MODEL_MAP.xai as readonly string[]).includes(m)) return "xai";
  if (m && (IMAGE_SELECTABLE_MODEL_MAP.zai as readonly string[]).includes(m)) return "zai";
  return "google";
}

export function getImageModelLabel(
  provider: ImageProviderType,
  modelName: string,
  modelNameOnly?: boolean,
  variant?: string,
) {
  const perImage = getPerImageCost(provider, modelName, "image", variant);
  const billingStrategy = resolveMediaBillingStrategy({ provider, modelName, modality: "image", variant });
  const isUsageBilled = billingStrategy === "token" || billingStrategy === "hybrid";
  const provLabel = provider === "openai" ? "openai" : provider === "xai" ? "xai" : "google";
  const aliasLabel = getImageModelAliasLabel(provider, modelName);
  if (!perImage) {
    return (
      <>
        <span className="flex items-center gap-2">
          <span>{provLabel}</span>
          {aliasLabel ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold uppercase tracking-[0.02em] text-muted-foreground">
              {aliasLabel}
            </span>
          ) : null}
        </span>
        <span>{modelName}</span>
        {!modelNameOnly && isUsageBilled ? (
          <span
            className="absolute top-3 right-4 coin-badge"
            title={lang({
              ko: "입력/출력 사용량에 따라 생성 완료 후 코인이 차감됩니다.",
              en: "Coins are charged after generation based on token usage.",
            })}
          >
            <b className="text-xxs">Usage</b>
          </span>
        ) : null}
      </>
    );
  }

  // 모델 정보만 반환
  if (modelNameOnly) return <span>{modelName}</span>;

  return (
    <>
      <span className="flex items-center gap-2">
        <span className="font-bold">{provLabel}</span>
        {aliasLabel ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold uppercase tracking-[0.02em] text-muted-foreground">
            {aliasLabel}
          </span>
        ) : null}
      </span>
      <span>{modelName}</span>
      <span className="absolute top-3 right-4 coin-badge">
        <b>{perImage}</b>
        <span className="text-xxs font-mono">Coins</span>
      </span>
    </>
  );
}
