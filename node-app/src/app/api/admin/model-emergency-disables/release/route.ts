import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common/typeUtils";
import {
  getModelEmergencyDisableAdminError,
  releaseModelEmergencyDisable,
} from "libs/server-utils/system/modelEmergencyDisableAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function postHandler(data: UnknownRecord, user: AuthenticatedUserType, request: Request) {
  const actorId = String(user?.uid || user?.ID || "");
  const requestId =
    String(request.headers.get("x-request-id") || request.headers.get("x-amu-request-id") || "").trim() || randomUUID();
  try {
    const result = await releaseModelEmergencyDisable({ body: data, actorId, requestId });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const result = getModelEmergencyDisableAdminError(error);
    return NextResponse.json(
      { ok: false, errorCode: result.errorCode, error: result.error },
      { status: result.status },
    );
  }
}

export const POST = withAuth(postHandler, undefined, "admin/model-emergency-disables/release:post", {
  requireAdmin: true,
  bodyParser: "json",
});
