import "server-only";

import { wpApiUri } from "consts/env/runtime";
import { isUnknownRecord, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

const GENSTUDIO_ASSET_ID_RE = /^asset_[a-z0-9]+$/i;

function firstString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = firstString(item);
      if (resolved) return resolved;
    }
  }
  if (isUnknownRecord(value)) {
    const maybeRendered = firstString(value.rendered);
    if (maybeRendered) return maybeRendered;
    const maybeUrl = firstString(value.url || value.source_url);
    if (maybeUrl) return maybeUrl;
  }

  return "";
}

function getConfiguredWpSiteOrigin() {
  for (const raw of [process.env.WP_HOME_URL, process.env.NEXT_PUBLIC_WP_HOME_URL]) {
    const value = String(raw || "").trim();
    if (!value) continue;

    try {
      const parsed = new URL(value);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
    } catch {
      // Ignore malformed optional configuration and try the next source.
    }
  }

  return "";
}

function isWpResourcePath(pathname: string) {
  return /^\/wp-resource(?:\/|$)/i.test(pathname);
}

function getWpSiteOrigin() {
  const configuredOrigin = getConfiguredWpSiteOrigin();
  if (configuredOrigin) return configuredOrigin;

  try {
    return new URL(wpApiUri()).origin;
  } catch {
    return "";
  }
}

export function toAbsoluteWpUrl(raw: unknown) {
  const value = firstString(raw);
  if (!value || GENSTUDIO_ASSET_ID_RE.test(value)) return "";

  const absoluteValue = value.startsWith("//") ? `https:${value}` : value;
  if (/^https?:\/\//i.test(absoluteValue)) {
    try {
      const parsed = new URL(absoluteValue);
      const configuredOrigin = getConfiguredWpSiteOrigin();
      if (configuredOrigin && isWpResourcePath(parsed.pathname)) {
        return `${configuredOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      // Return the original absolute value when it cannot be parsed further.
    }
    return absoluteValue;
  }

  const origin = getWpSiteOrigin();
  if (!origin) return value;
  return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
}

function normalizeGenStudioAssetId(raw: unknown) {
  const value = firstString(raw).replace(/\s+/g, "");
  return GENSTUDIO_ASSET_ID_RE.test(value) ? value : "";
}

function getPostField(post: UnknownRecord, fieldNames: string[]) {
  const acf = toUnknownRecord(post.acf);
  const meta = toUnknownRecord(post.meta);

  for (const fieldName of fieldNames) {
    const acfValue = firstString(acf[fieldName]);
    if (acfValue) return acfValue;

    const metaValue = firstString(meta[fieldName]);
    if (metaValue) return metaValue;

    const directValue = firstString(post[fieldName]);
    if (directValue) return directValue;
  }

  return "";
}

function getCustomThumbnailRaw(post: UnknownRecord) {
  return getPostField(post, [
    "set_custom_thumbnail",
    "custom_thumbnail",
    "custom_thumbnail_url",
    "thumbnail_url",
    "amu_thumbnail_url",
  ]);
}

function getGenStudioThumbnailAssetId(post: UnknownRecord) {
  const explicitAssetId = getPostField(post, [
    "amu_genstudio_thumbnail_asset_id",
    "genstudio_thumbnail_asset_id",
    "thumbnail_asset_id",
  ]);
  const normalizedExplicit = normalizeGenStudioAssetId(explicitAssetId);
  if (normalizedExplicit) return normalizedExplicit;

  return normalizeGenStudioAssetId(getCustomThumbnailRaw(post));
}

function getYoastImageUrl(post: UnknownRecord) {
  const yoast = toUnknownRecord(post.yoast_head_json);
  const ogImage = Array.isArray(yoast.og_image) ? yoast.og_image[0] : undefined;
  const image = ogImage || yoast.twitter_image;
  return toAbsoluteWpUrl(image);
}

function getFeaturedMediaUrl(post: UnknownRecord) {
  const embedded = toUnknownRecord(post._embedded);
  const featuredArr = embedded["wp:featuredmedia"];
  const media = toUnknownRecord(Array.isArray(featuredArr) ? featuredArr[0] : undefined);
  const sizes = toUnknownRecord(toUnknownRecord(media.media_details).sizes);

  const pickSize = (key: string) => firstString(toUnknownRecord(sizes[key]).source_url);

  return (
    toAbsoluteWpUrl(pickSize("medium_large")) ||
    toAbsoluteWpUrl(pickSize("large")) ||
    toAbsoluteWpUrl(pickSize("medium")) ||
    toAbsoluteWpUrl(pickSize("thumbnail")) ||
    toAbsoluteWpUrl(media.source_url)
  );
}

function getContentImageCandidates(post: UnknownRecord) {
  const content = firstString(toUnknownRecord(post.content).rendered);
  if (!content) return [] as string[];

  const out: string[] = [];

  for (const match of content.matchAll(/\bdata-asset-id=["'](asset_[a-z0-9]+)["']/gi)) {
    const assetId = normalizeGenStudioAssetId(match[1]);
    if (assetId) out.push(assetId);
  }

  for (const match of content.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const url = toAbsoluteWpUrl(match[1]);
    if (url) out.push(url);
  }

  return Array.from(new Set(out)).slice(0, 8);
}

export function extractMarketingPostImageFields(rawPost: unknown) {
  const post = toUnknownRecord(rawPost);
  const customThumbnailUrl = toAbsoluteWpUrl(getCustomThumbnailRaw(post));
  const genStudioImageAssetId = getGenStudioThumbnailAssetId(post);
  const yoastImageUrl = getYoastImageUrl(post);
  const featuredMediaUrl = toAbsoluteWpUrl(post.featured_media_url) || getFeaturedMediaUrl(post);
  const contentCandidates = getContentImageCandidates(post);
  const contentAssetId = contentCandidates.map(normalizeGenStudioAssetId).find(Boolean) || "";
  const contentImageUrl = contentCandidates.find((candidate) => !normalizeGenStudioAssetId(candidate)) || "";
  const imageUrl = customThumbnailUrl || yoastImageUrl || featuredMediaUrl || contentImageUrl;

  const embedded = toUnknownRecord(post._embedded);
  const featuredArr = embedded["wp:featuredmedia"];
  const featuredMedia = toUnknownRecord(Array.isArray(featuredArr) ? featuredArr[0] : undefined);

  return {
    imageUrl,
    imageAlt: firstString(post.featured_media_alt || featuredMedia.alt_text || post.title),
    imageSource: customThumbnailUrl
      ? "custom_meta"
      : genStudioImageAssetId
        ? "genstudio_asset"
        : yoastImageUrl
          ? "yoast"
          : featuredMediaUrl
            ? "featured_media"
            : contentImageUrl
              ? "content_image"
              : "",
    genStudioImageAssetId: genStudioImageAssetId || contentAssetId,
    imageUrls: Array.from(new Set([imageUrl, ...contentCandidates.filter((candidate) => !normalizeGenStudioAssetId(candidate))].filter(Boolean))).slice(0, 8),
  };
}
