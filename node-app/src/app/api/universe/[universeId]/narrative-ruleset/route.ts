import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPublishedUniverseNarrativeRuleset, getUniverseById } from "libs/database/universe";
import { logger } from "utils/log";

export const runtime = "nodejs";

function resolveRequestId(request: NextRequest) {
  return request.headers.get("x-request-id")?.trim() || randomUUID();
}

function toPublicRuleset(doc: Awaited<ReturnType<typeof getPublishedUniverseNarrativeRuleset>>) {
  if (!doc) return null;

  return {
    universeId: doc.universeId,
    rulesetVersion: doc.rulesetVersion,
    algorithmVersion: doc.algorithmVersion,
    status: doc.status,
    attributes: doc.attributes,
    affinityMatrix: doc.affinityMatrix,
    stats: doc.stats,
    archetypes: doc.archetypes,
    traits: doc.traits,
    supersedesVersion: doc.supersedesVersion ?? null,
    publishedAt: doc.publishedAt ?? null,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ universeId: string }> }) {
  const requestId = resolveRequestId(request);

  try {
    const { universeId } = await params;
    const normalizedUniverseId = String(universeId || "").trim();
    if (!normalizedUniverseId || normalizedUniverseId.length > 120) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_UNIVERSE_ID", message: "universeId가 올바르지 않습니다." }, meta: { requestId } },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const universe = await getUniverseById(normalizedUniverseId);
    if (!universe) {
      return NextResponse.json(
        { ok: false, error: { code: "UNIVERSE_NOT_FOUND", message: "유니버스를 찾을 수 없습니다." }, meta: { requestId } },
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }
    if (universe.enabled === false) {
      return NextResponse.json(
        { ok: false, error: { code: "UNIVERSE_DISABLED", message: "비활성 유니버스입니다." }, meta: { requestId } },
        { status: 423, headers: { "x-request-id": requestId } },
      );
    }

    const ruleset = await getPublishedUniverseNarrativeRuleset(normalizedUniverseId);
    if (!ruleset) {
      return NextResponse.json(
        { ok: false, error: { code: "NARRATIVE_RULESET_NOT_PUBLISHED", message: "공개된 세계관 규칙이 없습니다." }, meta: { requestId } },
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }

    return NextResponse.json(
      { ok: true, data: toPublicRuleset(ruleset), meta: { requestId } },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    logger.error("[universe/narrative-ruleset] 조회 실패", { requestId, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json(
      { ok: false, error: { code: "NARRATIVE_RULESET_READ_FAILED", message: "세계관 규칙을 조회할 수 없습니다." }, meta: { requestId } },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
