import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getMagazineRegistryExpiryStatus, listMagazineEmbedRegistryEntries, upsertMagazineEmbedRegistryEntry } from "libs/server-utils/magazine/magazineEmbedRegistry";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 관리자용 Magazine Embed Registry 읽기·등록 API
 * @process 관리자 인증  Registry 상태 조회 또는 승인 게이트 검증 후 upsert  secret/provider 정보 제외
 * @domain magazine-content-experience
 * @scope admin-api
 */

async function getHandler(_body: unknown, _user: AuthenticatedUserType) {
  const result = await listMagazineEmbedRegistryEntries();
  if (!result.ok) return NextResponse.json({ ok: false, error: "registry_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({
    ok: true,
    data: result.entries.map((entry) => ({
      ...entry,
      expiryStatus: getMagazineRegistryExpiryStatus(entry.expiresAt),
      reviewedAt: new Date(entry.reviewedAt).toISOString(),
      ...(entry.startsAt ? { startsAt: new Date(entry.startsAt).toISOString() } : {}),
      ...(entry.expiresAt ? { expiresAt: new Date(entry.expiresAt).toISOString() } : {}),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAuth(getHandler, undefined, "admin/magazine-embed-registry:list", { requireAdmin: true, bodyParser: "none" });

async function postHandler(body: unknown, user: AuthenticatedUserType) {
  // 감사 actor는 항상 존재하는 권위 식별자에서만 만든다. 이메일(PII)은 로그에 남기지 않고,
  // 귀속이 불가능하면 쓰기를 거부한다.
  const record = (user || {}) as { ID?: unknown; uid?: unknown };
  const actor = String(record.ID ?? record.uid ?? "").trim() || "unknown";
  const payload = (body && typeof body === "object" ? (body as Record<string, unknown>) : {});
  const expectedUpdatedAt = typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : undefined;
  const result = await upsertMagazineEmbedRegistryEntry(payload.entry ?? payload, actor, expectedUpdatedAt);

  if (!result.ok && result.error === "validation_failed") {
    return NextResponse.json(
      { ok: false, error: "validation_failed", issues: result.issues },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!result.ok && result.error === "conflict") {
    return NextResponse.json(
      { ok: false, error: "conflict", message: "다른 저장이 먼저 반영됐습니다. 최신 상태를 다시 읽고 expectedUpdatedAt과 함께 재시도하세요." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "registry_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      created: result.created,
      updatedAt: result.updatedAt,
      data: {
        ...result.entry,
        reviewedAt: new Date(result.entry.reviewedAt).toISOString(),
        ...(result.entry.startsAt ? { startsAt: new Date(result.entry.startsAt).toISOString() } : {}),
        ...(result.entry.expiresAt ? { expiresAt: new Date(result.entry.expiresAt).toISOString() } : {}),
      },
    },
    { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withAuth(postHandler, undefined, "admin/magazine-embed-registry:upsert", { requireAdmin: true });
