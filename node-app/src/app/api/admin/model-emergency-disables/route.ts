import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common/typeUtils";
import {
  createModelEmergencyDisable,
  getModelEmergencyDisableAdminError,
  listModelEmergencyDisables,
} from "libs/server-utils/system/modelEmergencyDisableAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getHandler() {
  try {
    return NextResponse.json({ ok: true, ...(await listModelEmergencyDisables()) });
  } catch {
    return NextResponse.json(
      { ok: false, readable: false, errorCode: "SYSTEM_CONTROL_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

async function postHandler(data: UnknownRecord, user: AuthenticatedUserType, request: Request) {
  const actorId = String(user?.uid || user?.ID || "");
  const requestId =
    String(request.headers.get("x-request-id") || request.headers.get("x-amu-request-id") || "").trim() || randomUUID();
  try {
    const result = await createModelEmergencyDisable({ body: data, actorId, requestId });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const result = getModelEmergencyDisableAdminError(error);
    return NextResponse.json(
      { ok: false, errorCode: result.errorCode, error: result.error },
      { status: result.status },
    );
  }
}

export const GET = withAuth(getHandler, undefined, "admin/model-emergency-disables:get", {
  requireAdmin: true,
  bodyParser: "none",
});

export const POST = withAuth(postHandler, undefined, "admin/model-emergency-disables:post", {
  requireAdmin: true,
  bodyParser: "json",
});
