import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUniverseById, listPublishedUniverseCanon } from "libs/database/universe";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 활성 유니버스의 published Canon read API
 * @process universe 상태 확인  published revision만 조회  내부 audit/작성자 정보 제외
 * @domain narrative-canon
 * @scope public-api
 */

function publicRevision(item: Awaited<ReturnType<typeof listPublishedUniverseCanon>>[number]) {
  return {
    universeId: item.universeId,
    layer: item.layer,
    entityType: item.entityType,
    entityId: item.entityId,
    revision: item.revision,
    payload: item.payload,
    payloadHash: item.payloadHash,
    publishedAt: item.publishedAt || null,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ universeId: string }> }) {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  const universeId = String((await params).universeId || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,119}$/.test(universeId)) return NextResponse.json({ ok: false, error: { code: "INVALID_UNIVERSE_ID" }, meta: { requestId } }, { status: 400 });
  const universe = await getUniverseById(universeId);
  if (!universe) return NextResponse.json({ ok: false, error: { code: "UNIVERSE_NOT_FOUND" }, meta: { requestId } }, { status: 404 });
  if (universe.enabled === false) return NextResponse.json({ ok: false, error: { code: "UNIVERSE_DISABLED" }, meta: { requestId } }, { status: 423 });
  const data = await listPublishedUniverseCanon(universeId);
  return NextResponse.json({ ok: true, data: data.map(publicRevision), meta: { requestId, count: data.length } }, { headers: { "x-request-id": requestId, "Cache-Control": "public, max-age=60" } });
}
