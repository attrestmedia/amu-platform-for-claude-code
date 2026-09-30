import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import {
  invalidateMagazineNarrationsForContent,
  publishMagazineNarration,
} from "libs/server-utils/magazine/magazineNarrationService";
import { isMagazineNarrationContentRef } from "libs/server-utils/magazine/magazineNarrationContract";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "no-store, max-age=0" };

function actorOf(user: AuthenticatedUserType) {
  const record = (user || {}) as { ID?: unknown; uid?: unknown };
  return String(record.ID ?? record.uid ?? "").trim() || "unknown";
}

function slugOf(context: NextRouteContext) {
  const value = String(context?.params?.slug || "").trim();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : "";
}

function contentRefOf(slug: string, raw: unknown) {
  if (raw === undefined) return { kind: "app_content" as const, contentId: `amu:magazine:${slug}`, slug };
  return isMagazineNarrationContentRef(raw) && raw.slug === slug ? raw : null;
}

function publishStatus(error: string) {
  if (["invalid_content_ref", "article_revision_mismatch", "article_not_indexable", "article_not_allowlisted", "audio_job_not_success", "audio_source_mismatch", "audio_source_incomplete", "audio_voice_not_approved", "audio_storage_invalid", "conflict"].includes(error)) return 409;
  if (["article_not_found", "audio_job_not_found"].includes(error)) return 404;
  return 503;
}

async function postHandler(body: unknown, user: AuthenticatedUserType, _request: NextRequest, context: NextRouteContext) {
  const slug = slugOf(context);
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const contentRef = contentRefOf(slug, payload.contentRef);
  if (!contentRef) return NextResponse.json({ ok: false, error: "contentRef와 slug가 일치하지 않습니다.", errorCode: "INVALID_INPUT" }, { status: 400, headers: responseHeaders });
  const result = await publishMagazineNarration({
    contentRef,
    articleRevision: payload.articleRevision,
    jobId: payload.jobId,
    actor: actorOf(user),
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, message: result.message || "내레이션 게시 조건을 충족하지 못했습니다.", errorCode: result.error.toUpperCase() },
      { status: publishStatus(result.error), headers: responseHeaders },
    );
  }
  return NextResponse.json({ ok: true, reused: result.reused, data: result.data }, { status: result.reused ? 200 : 201, headers: responseHeaders });
}

export const POST = withAuth(postHandler, undefined, "admin/magazine-narrations:publish", { requireAdmin: true, bodyParser: "json" });

async function deleteHandler(_body: unknown, user: AuthenticatedUserType, _request: NextRequest, context: NextRouteContext) {
  const slug = slugOf(context);
  if (!slug) return NextResponse.json({ ok: false, error: "유효한 slug가 필요합니다.", errorCode: "INVALID_INPUT" }, { status: 400, headers: responseHeaders });
  const result = await invalidateMagazineNarrationsForContent({
    contentRef: { kind: "app_content", contentId: `amu:magazine:${slug}`, slug },
    actor: actorOf(user),
    reason: "manual",
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, invalidated: result.invalidated, errorCode: result.error.toUpperCase() },
      { status: result.error === "not_found" ? 404 : 503, headers: responseHeaders },
    );
  }
  return NextResponse.json({ ok: true, invalidated: result.invalidated, pending: result.pending }, { headers: responseHeaders });
}

export const DELETE = withAuth(deleteHandler, undefined, "admin/magazine-narrations:invalidate", { requireAdmin: true, bodyParser: "none" });
