import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  getMagazineArticleDeclaration,
  listMagazineArticleDeclarations,
  upsertMagazineArticleDeclaration,
} from "libs/server-utils/magazine/magazineArticleDeclaration";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 관리자용 Article Experience declaration 편집 API
 * @process 관리자 인증 -> contract validation -> node-app 저장 -> revision conflict response
 * @domain magazine-content-experience
 * @scope admin-api
 */

function headers(retryable = false) {
  return { "Cache-Control": "no-store, max-age=0", ...(retryable ? { "Retry-After": "30" } : {}) };
}

function queryIdentifier(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const refId = String(params.get("refId") || "").trim();
  if (!refId) return {};
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(refId)) return null;
  return { refId };
}

function queryLimit(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get("limit");
  if (!raw) return 100;
  const limit = Number(raw);
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
}

async function getHandler(_body: unknown, _user: AuthenticatedUserType, request: NextRequest) {
  const identifier = queryIdentifier(request);
  if (identifier === null) return NextResponse.json({ ok: false, error: "invalid_identifier" }, { status: 400, headers: headers() });
  const limit = queryLimit(request);
  if (limit === null) return NextResponse.json({ ok: false, error: "invalid_limit" }, { status: 400, headers: headers() });

  const result = Object.keys(identifier).length === 0
    ? await listMagazineArticleDeclarations(limit)
    : await getMagazineArticleDeclaration(identifier);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error === "not_found" ? 404 : 503, headers: headers(result.error === "unavailable") },
    );
  }
  return NextResponse.json({ ok: true, data: result.data }, { headers: headers() });
}

export const GET = withAuth(getHandler, undefined, "admin/magazine-article-declarations:list", { requireAdmin: true, bodyParser: "none" });

async function postHandler(body: unknown, user: AuthenticatedUserType) {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  if (payload.expectedRevision !== undefined && typeof payload.expectedRevision !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400, headers: headers() });
  }
  const declaration = payload.declaration ?? body;
  const expectedRevision = typeof payload.expectedRevision === "string" ? payload.expectedRevision.trim() || undefined : undefined;
  const record = (user || {}) as { ID?: unknown; uid?: unknown };
  const actor = String(record.ID ?? record.uid ?? "").trim() || "unknown";
  const result = await upsertMagazineArticleDeclaration(declaration, { actor, source: "admin", expectedRevision });

  if (!result.ok && result.error === "validation_failed") {
    return NextResponse.json({ ok: false, error: result.error, issues: result.issues }, { status: 400, headers: headers() });
  }
  if (!result.ok && result.error === "conflict") {
    return NextResponse.json({ ok: false, error: "conflict", message: "최신 declaration을 다시 읽은 뒤 expectedRevision과 함께 재시도하세요." }, { status: 409, headers: headers() });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: "declaration_store_unavailable" }, { status: 503, headers: headers(true) });
  return NextResponse.json({ ok: true, created: result.created, data: result.data }, { status: result.created ? 201 : 200, headers: headers() });
}

export const POST = withAuth(postHandler, undefined, "admin/magazine-article-declarations:upsert", { requireAdmin: true });
