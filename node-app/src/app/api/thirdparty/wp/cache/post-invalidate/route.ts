import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import wpCacheService from "libs/services/wpCacheService";
import { logger } from "utils/log";

export const runtime = "nodejs";

function errorCodeForBridgeError(error: string) {
  return (
    {
      wp_bridge_not_configured: "WP_BRIDGE_NOT_CONFIGURED",
      site_required: "SIGNATURE_REQUIRED",
      signature_required: "SIGNATURE_REQUIRED",
      site_not_allowed: "SITE_NOT_ALLOWED",
      invalid_timestamp: "TIMESTAMP_EXPIRED",
      timestamp_expired: "TIMESTAMP_EXPIRED",
      body_hash_invalid: "BODY_HASH_INVALID",
      signature_invalid: "SIGNATURE_INVALID",
    } as Record<string, string>
  )[error] || "SIGNATURE_INVALID";
}

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: verified.error, errorCode: errorCodeForBridgeError(verified.error) },
      { status: verified.status },
    );
  }

  let body: { postId?: unknown; slug?: unknown; previousSlug?: unknown };
  try {
    const decoded: unknown = JSON.parse(bodyText || "{}");
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("malformed_json");
    }
    body = decoded as { postId?: unknown; slug?: unknown; previousSlug?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "malformed_json", errorCode: "MALFORMED_JSON" }, { status: 400 });
  }

  const postId = Number(body.postId);
  const hasValidPostId = Number.isInteger(postId) && postId > 0;
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const previousSlug = typeof body.previousSlug === "string" ? body.previousSlug.trim() : "";

  if (!hasValidPostId && !slug && !previousSlug) {
    return NextResponse.json({ ok: false, error: "post_id_or_slug_required", errorCode: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const result = await wpCacheService.invalidatePostCache({
      postId: hasValidPostId ? postId : undefined,
      slug: slug || undefined,
      previousSlug: previousSlug || undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: "invalidation_failed", errorCode: "INTERNAL_ERROR" }, { status: 500 });
    }
    logger.info(`WP 캐시 무효화 webhook 처리 완료: postId=${result.postId ?? "-"} deleted=${result.deleted}`);
    return NextResponse.json({ ok: true, postId: result.postId ?? null, deleted: result.deleted });
  } catch (error) {
    logger.error("WP 캐시 무효화 webhook 처리 실패:", error);
    return NextResponse.json({ ok: false, error: "internal_error", errorCode: "INTERNAL_ERROR" }, { status: 500 });
  }
}
