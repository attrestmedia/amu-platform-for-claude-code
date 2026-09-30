import { NextRequest, NextResponse } from "next/server";
import wpCacheService from "libs/services/wpCacheService";
import { stripHtmlToText } from "libs/server-utils/api/convertHtmlUtils";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_WP_PROXY_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { logger } from "utils/log";

import { extractCodedError } from "utils/common";
export const runtime = "nodejs";

const AGENT_WP_ENDPOINT = "ai/agent/wp-posts";

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function toBool(raw?: string | null, fallback = false) {
  const s = toSafeString(raw).toLowerCase();
  if (!s) return fallback;
  return s === "1" || s === "true" || s === "yes";
}

function toBoundedInt(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number(raw || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function toOptionalPositiveInt(raw: string | null): number | undefined | null {
  const value = toSafeString(raw);
  if (!value) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return null;
  return Math.floor(num);
}

function toPositiveIntList(raw: string | null, maxItems = 20): number[] | null {
  const value = toSafeString(raw);
  if (!value) return [];

  const out: number[] = [];
  const seen = new Set<number>();

  for (const token of value.split(",")) {
    const part = toSafeString(token);
    if (!part) continue;
    const num = Number(part);
    if (!Number.isFinite(num) || num < 1) return null;
    const safeNum = Math.floor(num);
    if (seen.has(safeNum)) continue;
    seen.add(safeNum);
    out.push(safeNum);
    if (out.length > maxItems) return null;
  }

  return out;
}

function toSlugList(raw: string | null, maxItems = 20): string[] | null {
  const value = toSafeString(raw);
  if (!value) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const token of value.split(",")) {
    const slug = toSafeString(token);
    if (!slug) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length > maxItems) return null;
  }

  return out;
}

function toMode(raw: string | null) {
  const mode = toSafeString(raw).toLowerCase();
  if (mode === "search" || mode === "detail" || mode === "list" || mode === "details") return mode;
  return "latest";
}

type WpPostLike = {
  id?: unknown;
  slug?: unknown;
  link?: unknown;
  date?: unknown;
  modified?: unknown;
  title?: { rendered?: unknown };
  excerpt?: { rendered?: unknown };
  content?: { rendered?: unknown };
  categories?: unknown;
  tags?: unknown;
  acf?: unknown;
};

function normalizePreview(post: WpPostLike) {
  return {
    id: Number(post?.id || 0),
    slug: toSafeString(post?.slug),
    link: toSafeString(post?.link),
    date: toSafeString(post?.date),
    modified: toSafeString(post?.modified),
    title: {
      rendered: toSafeString(post?.title?.rendered),
      text: stripHtmlToText(post?.title?.rendered),
    },
    excerpt: {
      rendered: toSafeString(post?.excerpt?.rendered),
      text: stripHtmlToText(post?.excerpt?.rendered),
    },
    categories: Array.isArray(post?.categories) ? post.categories : [],
    tags: Array.isArray(post?.tags) ? post.tags : [],
  };
}

function normalizeDetail(post: WpPostLike, options: { includeHtml: boolean; maxContentChars: number }) {
  const titleText = stripHtmlToText(post?.title?.rendered);
  const excerptText = stripHtmlToText(post?.excerpt?.rendered);
  const fullContentText = stripHtmlToText(post?.content?.rendered);
  const safeContentText = fullContentText.slice(0, options.maxContentChars);
  const fullWordCount = fullContentText ? fullContentText.split(/\s+/).filter(Boolean).length : 0;

  return {
    id: Number(post?.id || 0),
    slug: toSafeString(post?.slug),
    link: toSafeString(post?.link),
    date: toSafeString(post?.date),
    modified: toSafeString(post?.modified),
    title: {
      text: titleText,
      ...(options.includeHtml ? { rendered: toSafeString(post?.title?.rendered) } : {}),
    },
    excerpt: {
      text: excerptText,
      ...(options.includeHtml ? { rendered: toSafeString(post?.excerpt?.rendered) } : {}),
    },
    content: {
      text: safeContentText,
      isTruncated: fullContentText.length > safeContentText.length,
      wordCount: fullWordCount,
      readingMinutes: Math.max(1, Math.ceil(fullWordCount / 220)),
      ...(options.includeHtml ? { rendered: toSafeString(post?.content?.rendered) } : {}),
    },
    categories: Array.isArray(post?.categories) ? post.categories : [],
    tags: Array.isArray(post?.tags) ? post.tags : [],
    acf: post?.acf && typeof post.acf === "object" ? post.acf : {},
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "wp:posts:read" });
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_WP_ENDPOINT,
      limitPerMinute: AGENT_WP_PROXY_POLICY.maxReadRequestsPerMinute,
      keyHash: auth.keyHash,
    });

    const searchParams = new URL(request.url).searchParams;
    const mode = toMode(searchParams.get("mode"));
    const forceRefresh = toBool(searchParams.get("refresh"), false);

    if (mode === "details") {
      const postIds = toPositiveIntList(searchParams.get("ids"));
      const slugs = toSlugList(searchParams.get("slugs"));
      const includeHtml = toBool(searchParams.get("includeHtml"), false);
      const maxContentChars = toBoundedInt(searchParams.get("maxContentChars"), 12000, 500, 50000);

      if (postIds === null) {
        return NextResponse.json(
          { ok: false, error: "invalid_post_ids", errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }

      if (slugs === null) {
        return NextResponse.json(
          { ok: false, error: "invalid_slugs", errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }

      if (postIds.length === 0 && slugs.length === 0) {
        return NextResponse.json(
          { ok: false, error: "ids_or_slugs_required", errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }

      const requestedItems: Array<{ postId?: number; slug?: string }> = [
        ...postIds.map((postId) => ({ postId })),
        ...slugs.map((slug) => ({ slug })),
      ];

      const results = await Promise.all(
        requestedItems.map(async (item) => {
          const post = await wpCacheService.getPostDetail({
            postId: item.postId,
            slug: item.slug,
            forceRefresh,
          });

          if (!post) {
            return {
              found: false,
              postId: item.postId || null,
              slug: item.slug || "",
            };
          }

          return {
            found: true,
            postId: item.postId || Number(post?.id || 0) || null,
            slug: item.slug || toSafeString(post?.slug),
            post: normalizeDetail(post, { includeHtml, maxContentChars }),
          };
        }),
      );

      return NextResponse.json({
        ok: true,
        mode,
        count: results.filter((item) => item.found).length,
        requestedCount: requestedItems.length,
        missing: results.filter((item) => !item.found).map(({ postId, slug }) => ({ postId, slug })),
        data: results.filter((item) => item.found).map((item) => item.post),
      });
    }

    if (mode === "detail") {
      const postId = toOptionalPositiveInt(searchParams.get("id"));
      const slug = toSafeString(searchParams.get("slug"));
      const includeHtml = toBool(searchParams.get("includeHtml"), false);
      const maxContentChars = toBoundedInt(searchParams.get("maxContentChars"), 12000, 500, 50000);

      if (postId === null) {
        return NextResponse.json(
          { ok: false, error: "invalid_post_id", errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }

      if (!postId && !slug) {
        return NextResponse.json(
          { ok: false, error: "id_or_slug_required", errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }

      const post = await wpCacheService.getPostDetail({
        postId: postId || undefined,
        slug: slug || undefined,
        forceRefresh,
      });

      if (!post) {
        return NextResponse.json(
          { ok: false, error: "post_not_found", errorCode: "NOT_FOUND" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        ok: true,
        mode,
        data: normalizeDetail(post, { includeHtml, maxContentChars }),
      });
    }

    if (mode === "search") {
      const query = toSafeString(searchParams.get("q"));
      if (query.length < 2) {
        return NextResponse.json(
          { ok: false, error: "query_min_2_chars", errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }

      const page = toBoundedInt(searchParams.get("page"), 1, 1, 50);
      const perPage = toBoundedInt(searchParams.get("per_page"), 10, 1, 20);
      const categoryId = toOptionalPositiveInt(searchParams.get("category"));

      if (categoryId === null) {
        return NextResponse.json(
          { ok: false, error: "invalid_category_id", errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }

      await wpCacheService.ensureTextIndex();

      const result = await wpCacheService.searchPosts({
        query,
        page,
        perPage,
        categoryId,
        forceRefresh,
      });

      return NextResponse.json({
        ok: true,
        mode,
        query,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
        data: (result.posts || []).map(normalizePreview),
      });
    }

    if (mode === "list") {
      const page = toBoundedInt(searchParams.get("page"), 1, 1, 50);
      const perPage = toBoundedInt(searchParams.get("per_page"), 10, 1, 50);
      const categoryId = toOptionalPositiveInt(searchParams.get("category"));

      if (categoryId === null) {
        return NextResponse.json(
          { ok: false, error: "invalid_category_id", errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }

      const result = await wpCacheService.getPosts({
        page,
        perPage,
        categories: categoryId,
        forceRefresh,
      });

      const rows = Array.isArray(result?.data) ? result.data : [];
      const totalCount = Number(result?.totalPosts || rows.length || 0);
      const totalPages = Number(result?.totalPages || 0);

      return NextResponse.json({
        ok: true,
        mode,
        page,
        perPage,
        totalCount,
        totalPages,
        data: rows.map(normalizePreview),
      });
    }

    const count = toBoundedInt(searchParams.get("count"), 10, 1, 20);
    const categoryId = toOptionalPositiveInt(searchParams.get("category"));

    if (categoryId === null) {
      return NextResponse.json(
        { ok: false, error: "invalid_category_id", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const rows = await wpCacheService.getLatestPosts({
      count,
      categoryId,
      forceRefresh,
    });

    return NextResponse.json({
      ok: true,
      mode: "latest",
      count: rows.length,
      data: (rows || []).map(normalizePreview),
    });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, {
      message: "internal_server_error",
    });
    logger.error("[agent-wp-posts] failed", {
      endpoint: AGENT_WP_ENDPOINT,
      error: message,
      errorCode,
      status,
    });

    return NextResponse.json(
      { ok: false, error: message, errorCode },
      { status },
    );
  }
}
