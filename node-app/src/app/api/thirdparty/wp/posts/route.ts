import { NextRequest, NextResponse } from "next/server";
import fetchClient from "libs/api/fetchClient";
import { listImageAssets } from "libs/database/lab";
import { toAbsoluteWpUrl } from "libs/marketing/sourceImageFields";
import { wpApiUri } from "consts/env/runtime";
import { logger } from "utils/log";
import type { IWpPostsResponse } from "types/thirdparty";
import { extractApiErrorMessage, getResponseStatus, toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const revalidate = 0;

const GENSTUDIO_ASSET_ID_RE = /^asset_[a-z0-9]+$/i;

type WpPostLike = UnknownRecord;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toBool(raw?: string | null) {
  const value = toSafeString(raw).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function firstString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = firstString(item);
      if (resolved) return resolved;
    }
  }
  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    const maybeRendered = firstString(record.rendered);
    if (maybeRendered) return maybeRendered;
    const maybeUrl = firstString(record.url || record.source_url);
    if (maybeUrl) return maybeUrl;
  }

  return "";
}

function toAbsoluteAppUrl(raw: unknown) {
  const value = firstString(raw);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;

  const siteDomain = toSafeString(process.env.SITE_DOMAIN)
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  if (!siteDomain) return value;
  return `https://${siteDomain}${value.startsWith("/") ? value : `/${value}`}`;
}

function getPostField(post: WpPostLike, fieldNames: string[]) {
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

function getCustomThumbnailRaw(post: WpPostLike) {
  return getPostField(post, [
    "set_custom_thumbnail",
    "custom_thumbnail",
    "custom_thumbnail_url",
    "thumbnail_url",
    "amu_thumbnail_url",
  ]);
}

function normalizeGenStudioAssetId(raw: unknown) {
  const value = firstString(raw).replace(/\s+/g, "");
  return GENSTUDIO_ASSET_ID_RE.test(value) ? value : "";
}

function getGenStudioThumbnailAssetId(post: WpPostLike) {
  const explicitAssetId = getPostField(post, [
    "amu_genstudio_thumbnail_asset_id",
    "genstudio_thumbnail_asset_id",
    "thumbnail_asset_id",
  ]);
  const normalizedExplicit = normalizeGenStudioAssetId(explicitAssetId);
  if (normalizedExplicit) return normalizedExplicit;

  return normalizeGenStudioAssetId(getCustomThumbnailRaw(post));
}

function getYoastImageUrl(post: WpPostLike) {
  const yoast = toUnknownRecord(post.yoast_head_json);
  const ogImage = Array.isArray(yoast.og_image) ? yoast.og_image[0] : undefined;
  const image = ogImage || yoast.twitter_image;
  return toAbsoluteWpUrl(image);
}

function getFeaturedMediaUrl(post: WpPostLike) {
  const embedded = toUnknownRecord(post._embedded);
  const featuredMediaList = Array.isArray(embedded["wp:featuredmedia"]) ? embedded["wp:featuredmedia"] : [];
  const media = toUnknownRecord(featuredMediaList[0]);
  const sizes = toUnknownRecord(toUnknownRecord(media.media_details).sizes);
  const pickSourceUrl = (key: string) => toSafeString(toUnknownRecord(sizes[key]).source_url);

  return (
    pickSourceUrl("medium_large") ||
    pickSourceUrl("large") ||
    pickSourceUrl("medium") ||
    pickSourceUrl("thumbnail") ||
    toSafeString(media.source_url) ||
    ""
  );
}

function pickFirstContentImageUrl(post: WpPostLike) {
  const content = firstString(toUnknownRecord(post.content).rendered);
  if (!content) return "";

  const assetMatch = content.match(/\bdata-asset-id=["'](asset_[a-z0-9]+)["']/i);
  if (assetMatch?.[1]) return normalizeGenStudioAssetId(assetMatch[1]);

  const imageMatch = content.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  return toAbsoluteWpUrl(imageMatch?.[1]);
}

async function getGenStudioAssetUrlMap(assetIds: string[]) {
  const ids = Array.from(new Set(assetIds.map(normalizeGenStudioAssetId).filter(Boolean)));
  if (!ids.length) return new Map<string, string>();

  try {
    const assets = await listImageAssets({
      scope: "all",
      visibility: "public",
      state: "active",
      assetIds: ids,
      limit: ids.length,
    });

    return new Map(
      (assets || [])
        .map((asset) => {
          const record = toUnknownRecord(asset);
          const storage = toUnknownRecord(record.storage);
          return [normalizeGenStudioAssetId(record.assetId), toAbsoluteAppUrl(storage.url)] as const;
        })
        .filter(([assetId, url]) => assetId && url),
    );
  } catch (error) {
    logger.warn("[thirdparty/wp/posts] Gen Studio 썸네일 조회 실패:", toErrorMessage(error));
    return new Map<string, string>();
  }
}

async function withThumbnailFields(posts: WpPostLike[]) {
  const assetIds = posts
    .flatMap((post) => {
      const ids = [getGenStudioThumbnailAssetId(post)];
      const contentCandidate = pickFirstContentImageUrl(post);
      if (GENSTUDIO_ASSET_ID_RE.test(contentCandidate)) ids.push(contentCandidate);
      return ids;
    })
    .filter(Boolean);

  const assetUrlMap = await getGenStudioAssetUrlMap(assetIds);

  return posts.map((post) => withFeaturedMediaFields(post, assetUrlMap));
}

function withFeaturedMediaFields(post: WpPostLike, assetUrlMap: Map<string, string>) {
  const embedded = toUnknownRecord(post._embedded);
  const featuredMediaList = Array.isArray(embedded["wp:featuredmedia"]) ? embedded["wp:featuredmedia"] : [];
  const media = toUnknownRecord(featuredMediaList[0]);
  const { _embedded: _ignoreEmbedded, ...rest } = post;
  const customThumbnailUrl = toAbsoluteWpUrl(getCustomThumbnailRaw(post));
  const genStudioAssetId = getGenStudioThumbnailAssetId(post);
  const genStudioUrl = genStudioAssetId ? assetUrlMap.get(genStudioAssetId) || "" : "";
  const yoastImageUrl = getYoastImageUrl(post);
  const featuredMediaUrl = getFeaturedMediaUrl(post);
  const contentImageCandidate = pickFirstContentImageUrl(post);
  const contentImageUrl = GENSTUDIO_ASSET_ID_RE.test(contentImageCandidate)
    ? assetUrlMap.get(contentImageCandidate) || ""
    : contentImageCandidate;
  const featuredMediaAlt = String(media.alt_text || "").trim();
  const featuredMediaSource = customThumbnailUrl
    ? "custom_meta"
    : genStudioUrl
      ? "genstudio_asset"
      : yoastImageUrl
        ? "yoast"
        : featuredMediaUrl
          ? "featured_media"
          : contentImageUrl
            ? "content_image"
            : "";

  return {
    ...rest,
    featured_media_url: customThumbnailUrl || genStudioUrl || yoastImageUrl || featuredMediaUrl || contentImageUrl,
    featured_media_alt: featuredMediaAlt || firstString(post.title),
    featured_media_source: featuredMediaSource,
    genstudio_thumbnail_asset_id: genStudioAssetId || undefined,
  };
}

/**
 * @docHint
 * @purpose API 라우트(thirdparty / wp / posts) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain content.wp
 * @scope public_api
 */

export async function GET(req: NextRequest) {
  try {
    // URL의 쿼리 파라미터에서 per_page, page, orderby 및 categories를 추출
    const { searchParams } = new URL(req.url);
    const forceRefresh = toBool(searchParams.get("refresh"));
    const perPage = searchParams.get("per_page") || "10";
    const page = searchParams.get("page") || "1";
    const orderby = searchParams.get("orderby");
    const search = searchParams.get("search");
    const includeMedia = toBool(searchParams.get("media") || searchParams.get("include_media"));

    const paramFields = new Set([
      "id",
      "date",
      "date_gmt",
      "guid",
      "modified",
      "modified_gmt",
      "slug",
      "status",
      "type",
      "link",
      "title",
      "content",
      "excerpt",
      "author",
      "featured_media",
      "comment_status",
      "ping_status",
      "sticky",
      "template",
      "format",
      "meta",
      "categories",
      "tags",
      "class_list",
      "acf",
      "yoast_head_json",
    ]);
    if (includeMedia) paramFields.add("_embedded");

    const params: Record<string, unknown> = {
      per_page: parseInt(perPage, 10),
      page: parseInt(page, 10),
      _fields: Array.from(paramFields).join(","),
      _embed: includeMedia ? "wp:featuredmedia" : false,
    };

    // search 파라미터 처리
    if (search && search.trim()) {
      params.search = search.trim();
    }

    if (orderby) {
      params.orderby = orderby;
      // relevance 정렬은 search가 있을 때만 허용
      if (orderby === "relevance" && !params.search) {
        logger.warn("orderby=relevance는 search 파라미터가 필요합니다. date로 변경합니다.");
        params.orderby = "date";
      }
    }

    // 카테고리 필터링 파라미터 추가
    const categoriesParam = searchParams.get("categories");
    if (categoriesParam && categoriesParam !== "0") {
      if (categoriesParam.includes(",")) {
        params.categories = categoriesParam;
      } else {
        params.categories = parseInt(categoriesParam, 10);
      }
    }

    if (forceRefresh) {
      params._cb = Date.now();
    }

    const response = await fetchClient.get(`${wpApiUri()}/posts`, {
      params,
      timeout: 10000,
      credentials: "omit",
      cache: forceRefresh ? "no-store" : undefined,
      headers: forceRefresh
        ? {
            "Cache-Control": "no-cache, no-store, max-age=0",
            Pragma: "no-cache",
          }
        : undefined,
    });

    logger.log("WP API => ", `${wpApiUri()}/posts`, params);

    const totalPosts = parseInt(response.headers.get("x-wp-total") || "0", 10);
    const totalPages = parseInt(response.headers.get("x-wp-totalpages") || "0", 10);

    const result: IWpPostsResponse = {
      totalPosts,
      totalPages,
      data: includeMedia && Array.isArray(response.data) ? await withThumbnailFields(response.data) : response.data,
    };

    return new NextResponse(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": forceRefresh ? "no-store, max-age=0" : "s-maxage=60, stale-while-revalidate",
      },
    });
  } catch (error) {
    const message = extractApiErrorMessage(error, "포스트를 가져오는 데 실패했습니다.");
    logger.error("포스트 가져오기 오류:", message);

    return new NextResponse(
      JSON.stringify({ message }),
      { status: getResponseStatus(error) || 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
