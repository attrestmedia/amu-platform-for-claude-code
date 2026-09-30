import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  getAppMagazineContentBySlug,
  upsertAppMagazineContent,
} from "libs/server-utils/magazine/appContentRepo";
import { isAppContentSlug } from "libs/server-utils/magazine/appContentValidate";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 관리자 승인 하에 App Magazine 콘텐츠를 node-app 정본 컬렉션에 적재
 * @process 관리자 인증 -> slug/revision 입력 경계 -> app-content 계약 검증·CAS upsert -> SSR projection 반환
 * @domain magazine-content-experience
 * @scope admin-api
 */

const responseHeaders = { "Cache-Control": "no-store, max-age=0" };

function actorOf(user: AuthenticatedUserType) {
  const record = (user || {}) as { ID?: unknown; uid?: unknown };
  return String(record.ID ?? record.uid ?? "").trim() || "unknown";
}

async function getHandler(_body: unknown, _user: AuthenticatedUserType, request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim() || "";
  if (!isAppContentSlug(slug)) {
    return NextResponse.json(
      { ok: false, error: "유효한 App 콘텐츠 slug가 필요합니다.", errorCode: "INVALID_INPUT" },
      { status: 400, headers: responseHeaders },
    );
  }
  const result = await getAppMagazineContentBySlug(slug);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, errorCode: result.error === "not_found" ? "NOT_FOUND" : "SERVICE_UNAVAILABLE" },
      { status: result.error === "not_found" ? 404 : 503, headers: responseHeaders },
    );
  }
  return NextResponse.json({ ok: true, data: result.data }, { headers: responseHeaders });
}

export const GET = withAuth(
  getHandler,
  undefined,
  "admin/magazine-app-content:read",
  { requireAdmin: true, bodyParser: "none" },
);

async function postHandler(body: unknown, user: AuthenticatedUserType) {
  const payload = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  if (payload.expectedRevision !== undefined && typeof payload.expectedRevision !== "string") {
    return NextResponse.json(
      { ok: false, error: "expectedRevision 형식이 올바르지 않습니다.", errorCode: "INVALID_INPUT" },
      { status: 400, headers: responseHeaders },
    );
  }
  const content = payload.content ?? body;
  const expectedRevision = typeof payload.expectedRevision === "string"
    ? payload.expectedRevision.trim() || undefined
    : undefined;
  const result = await upsertAppMagazineContent(content, {
    actor: actorOf(user),
    source: "admin",
    expectedRevision,
  });
  if (!result.ok && result.error === "validation_failed") {
    return NextResponse.json(
      { ok: false, error: result.error, issues: result.issues, errorCode: "INVALID_INPUT" },
      { status: 400, headers: responseHeaders },
    );
  }
  if (!result.ok && result.error === "conflict") {
    return NextResponse.json(
      { ok: false, error: "conflict", message: "최신 App 콘텐츠를 다시 읽은 뒤 expectedRevision과 함께 재시도하세요.", errorCode: "CONFLICT" },
      { status: 409, headers: responseHeaders },
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "app_content_store_unavailable", errorCode: "SERVICE_UNAVAILABLE" },
      { status: 503, headers: { ...responseHeaders, "Retry-After": "30" } },
    );
  }
  return NextResponse.json(
    { ok: true, created: result.created, data: result.data },
    { status: result.created ? 201 : 200, headers: responseHeaders },
  );
}

export const POST = withAuth(
  postHandler,
  undefined,
  "admin/magazine-app-content:upsert",
  { requireAdmin: true, bodyParser: "json" },
);
