import "server-only";

import { listImageAssets } from "libs/database/lab";
import { resolveMarketingContentImagesByIds } from "libs/marketing/images/contentImageService";
import { toAbsoluteWpUrl } from "libs/marketing/sourceImageFields";
import type { MarketingSourceSnapshot } from "libs/marketing/bridge/types";

const GENSTUDIO_ASSET_ID_RE = /^asset_[a-z0-9]+$/i;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function normalizeGenStudioAssetId(raw: unknown) {
  const value = toSafeString(raw).replace(/\s+/g, "");
  return GENSTUDIO_ASSET_ID_RE.test(value) ? value : "";
}

function isWpResourceUrl(value: string) {
  try {
    return /^\/wp-resource(?:\/|$)/i.test(new URL(value, "https://amu.invalid").pathname);
  } catch {
    return false;
  }
}

export function toAbsoluteMarketingImageUrl(raw: unknown) {
  const value = toSafeString(raw);
  if (!value) return "";
  if (isWpResourceUrl(value)) return toAbsoluteWpUrl(value);
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;

  const siteDomain = toSafeString(process.env.SITE_DOMAIN || process.env.NEXT_PUBLIC_SITE_URL)
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!siteDomain || !value.startsWith("/")) return value;

  return `https://${siteDomain}${value}`;
}

function isPublicImageUrl(raw: unknown) {
  const url = toAbsoluteMarketingImageUrl(raw);
  if (!/^https?:\/\//i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return (
      /\/wp-resource\//i.test(parsed.pathname) ||
      /\/apps\/gen-studio\//i.test(parsed.pathname) ||
      /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function resolvePublicGenStudioAssetUrl(assetId: string) {
  const safeAssetId = normalizeGenStudioAssetId(assetId);
  if (!safeAssetId) return "";

  const rows = await listImageAssets({
    scope: "all",
    visibility: "public",
    state: "active",
    assetIds: [safeAssetId],
    limit: 1,
  }).catch(() => []);

  return toAbsoluteMarketingImageUrl((rows || [])[0]?.storage?.url);
}

function toImageCandidateValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => toImageCandidateValues(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [record.url, record.imageUrl, record.image_url].map(toSafeString).filter(Boolean);
  }
  return toSafeString(value).split(/[\r\n,]+/).map(toSafeString).filter(Boolean);
}

export function toMarketingImageUrlValues(value: unknown, limit = 20): string[] {
  return Array.from(
    new Set(
      toImageCandidateValues(value)
        .map(toAbsoluteMarketingImageUrl)
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

export async function resolveMarketingPublishImages(args: {
  universeId?: string;
  draft?: Record<string, unknown>;
  sourceSnapshot?: Partial<MarketingSourceSnapshot> | null;
  sourceImageUrl?: string;
  limit?: number;
}) {
  const draft = args.draft || {};
  const source = args.sourceSnapshot || {};
  const directCandidates = toMarketingImageUrlValues([
    draft.imageUrl,
    draft.image_url,
    draft.thumbnailUrl,
    draft.thumbnail_url,
    draft.imageUrls,
    draft.images,
    args.sourceImageUrl,
    source.imageUrl,
    ...(Array.isArray(source.imageUrls) ? source.imageUrls : []),
  ]);

  const resolvedUrls: string[] = [];
  for (const candidate of directCandidates) {
    const url = toAbsoluteMarketingImageUrl(candidate);
    if (isPublicImageUrl(url) && !resolvedUrls.includes(url)) resolvedUrls.push(url);
  }

  const assetCandidates = [
    draft.imageAssetId,
    draft.assetId,
    draft.genStudioImageAssetId,
    ...(Array.isArray(draft.imageAssetIds) ? draft.imageAssetIds : []),
    source.genStudioImageAssetId,
    ...(Array.isArray(source.imageAssetIds) ? source.imageAssetIds : []),
    ...(Array.isArray(source.imageLineage)
      ? source.imageLineage.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).assetId : ""))
      : []),
  ];
  for (const candidate of assetCandidates) {
    const url = await resolvePublicGenStudioAssetUrl(toSafeString(candidate));
    if (isPublicImageUrl(url) && !resolvedUrls.includes(url)) resolvedUrls.push(url);
  }

  const marketingUploadAssetIds = Array.isArray(draft.marketingUploadAssetIds)
    ? draft.marketingUploadAssetIds.map(toSafeString).filter(Boolean)
    : [];
  if (args.universeId && marketingUploadAssetIds.length) {
    const rows = await resolveMarketingContentImagesByIds({
      universeId: args.universeId,
      assetIds: marketingUploadAssetIds,
      strict: false,
    });
    rows.forEach((asset) => {
      const url = toAbsoluteMarketingImageUrl(asset?.url);
      if (isPublicImageUrl(url) && !resolvedUrls.includes(url)) resolvedUrls.push(url);
    });
  }

  return resolvedUrls.slice(0, Math.max(1, Math.min(20, Number(args.limit || 1))));
}

export async function resolveMarketingPublishImage(args: {
  universeId?: string;
  draft?: Record<string, unknown>;
  sourceSnapshot?: Partial<MarketingSourceSnapshot> | null;
  sourceImageUrl?: string;
}) {
  return (await resolveMarketingPublishImages({ ...args, limit: 1 }))[0] || "";
}
