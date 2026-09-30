import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import {
  createUniverseCanonDraft,
  listUniverseCanonRevisions,
  transitionUniverseCanonRevision,
} from "libs/database/universe";
import {
  CANON_ACTOR_TYPE_VALUES,
  CANON_NAMESPACE_VALUES,
  CANON_ENTITY_TYPE_VALUES,
  CANON_LAYER_VALUES,
  CANON_REVISION_STATUS_VALUES,
  type CanonEntityType,
  type CanonLayer,
  type CanonNamespace,
  type CanonRevisionStatus,
  type CanonPayload,
} from "types/game";
import { toUnknownRecord } from "utils/common";
import { isCanonWriteAllowed } from "libs/server-utils/narrative/canonValidator";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 관리자 전용 Universe Canon draft/review/publish API
 * @process admin 인증  payload/상태 검증  revision 저장  graph 검증을 거친 publish 전이
 * @domain narrative-canon
 * @scope admin-api
 */

function universeIdOf(context: NextRouteContext) {
  const value = String(context.params?.universeId || "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,119}$/.test(value) ? value : "";
}

function responseError(code: string, status = 400, detail?: unknown) {
  return NextResponse.json({ ok: false, error: { code, ...(detail ? { detail } : {}) } }, { status, headers: { "Cache-Control": "no-store" } });
}

async function handleGET(_body: unknown, _user: AuthenticatedUserType, _request: Request, context: NextRouteContext) {
  const universeId = universeIdOf(context);
  if (!universeId) return responseError("INVALID_UNIVERSE_ID");
  const status = String(new URL(_request.url).searchParams.get("status") || "").trim();
  const statuses = status && CANON_REVISION_STATUS_VALUES.includes(status as CanonRevisionStatus) ? [status as CanonRevisionStatus] : undefined;
  if (status && !statuses) return responseError("INVALID_CANON_STATUS");
  return NextResponse.json({ ok: true, data: await listUniverseCanonRevisions({ universeId, statuses }), meta: { universeId } }, { headers: { "Cache-Control": "no-store" } });
}

async function handlePOST(body: unknown, user: AuthenticatedUserType, _request: Request, context: NextRouteContext) {
  const universeId = universeIdOf(context);
  if (!universeId) return responseError("INVALID_UNIVERSE_ID");
  const input = toUnknownRecord(body);
  try {
    if (input.action === "create") {
      const namespace = String(input.namespace || "official") as CanonNamespace;
      const entityType = String(input.entityType || "") as CanonEntityType;
      const layer = String(input.layer || "") as CanonLayer;
      const createdByType = String(input.createdByType || "admin") as (typeof CANON_ACTOR_TYPE_VALUES)[number];
      const actorId = String(user?.uid || user?.ID || "");
      if (!CANON_NAMESPACE_VALUES.includes(namespace) || namespace !== "official") return responseError("CANON_NAMESPACE_WRITE_FORBIDDEN", 403);
      if (!CANON_ENTITY_TYPE_VALUES.includes(entityType) || !CANON_LAYER_VALUES.includes(layer) || createdByType !== "admin" || !isCanonWriteAllowed({ namespace, entityType, actorType: "admin", actorId })) return responseError("CANON_WRITE_ACTOR_FORBIDDEN", 403);
      const created = await createUniverseCanonDraft({
        universeId,
        namespace,
        entityType,
        layer,
        entityId: String(input.entityId || ""),
        payload: (input.payload || {}) as CanonPayload,
        createdBy: String(user?.uid || user?.ID || ""),
        createdByType,
        supersedesRevision: Number.isInteger(input.supersedesRevision) ? Number(input.supersedesRevision) : undefined,
        changelog: String(input.changelog || ""),
      });
      return NextResponse.json({ ok: true, data: created }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "transition") {
      const to = String(input.to || "") as CanonRevisionStatus;
      if (!CANON_REVISION_STATUS_VALUES.includes(to)) return responseError("CANON_STATUS_INVALID");
      const updated = await transitionUniverseCanonRevision({ revisionId: String(input.revisionId || ""), to, actorId: String(user?.uid || user?.ID || ""), actorType: "admin" });
      return NextResponse.json({ ok: true, data: updated }, { headers: { "Cache-Control": "no-store" } });
    }
    return responseError("CANON_ACTION_INVALID");
  } catch (error) {
    const code = error instanceof Error ? error.message : "CANON_WRITE_FAILED";
    const detail = toUnknownRecord(error).detail;
    const status = code === "CANON_REVISION_NOT_FOUND" ? 404 : code.includes("STALE") || code.includes("STATE_CONFLICT") ? 409 : code.includes("GRAPH") || code.includes("PAYLOAD") ? 422 : 400;
    return responseError(code, status, detail);
  }
}

export const GET = withAuth(handleGET, undefined, "admin/universe-canon:list", { requireAdmin: true, bodyParser: "none" });
export const POST = withAuth(handlePOST, undefined, "admin/universe-canon:write", { requireAdmin: true, bodyParser: "json" });
