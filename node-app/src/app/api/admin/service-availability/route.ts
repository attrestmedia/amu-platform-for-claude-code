import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { SERVICE_DEFINITIONS, isServiceKey } from "consts/system/serviceAvailability";
import { createSystemControlAudit } from "libs/database/system";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getServiceAvailability, setServiceAvailability } from "libs/server-utils/system/serviceAvailability";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function validatePatchBody(data: UnknownRecord) {
  if (!isServiceKey(data?.key)) return { valid: false, error: "지원하지 않는 서비스 key입니다." };
  if (typeof data?.enabled !== "boolean") return { valid: false, error: "enabled는 boolean이어야 합니다." };
  if (typeof data?.reason !== "string" || !String(data.reason).trim()) {
    return { valid: false, error: "변경 사유가 필요합니다." };
  }
  return { valid: true };
}

async function getHandler() {
  return NextResponse.json({ ok: true, services: await getServiceAvailability() });
}

async function patchHandler(data: UnknownRecord, user: AuthenticatedUserType, request: Request) {
  const key = String(data.key);
  if (!isServiceKey(key)) {
    return NextResponse.json({ ok: false, error: "지원하지 않는 서비스 key입니다." }, { status: 400 });
  }

  const enabled = Boolean(data.enabled);
  const reason = String(data.reason || "").trim();
  const actorId = String(user?.uid || user?.ID || "");
  const requestId =
    String(request.headers.get("x-request-id") || request.headers.get("x-amu-request-id") || "").trim() ||
    randomUUID();
  const before = await getServiceAvailability();
  const services = before[key] === enabled
    ? before
    : await setServiceAvailability({ key, enabled, updatedBy: actorId });

  if (before[key] !== enabled) {
    const definition = SERVICE_DEFINITIONS.find((service) => service.key === key);
    const auditId = `sys-audit-${Date.now()}-${randomUUID().slice(0, 8)}`;
    await createSystemControlAudit({
      auditId,
      requestId,
      targetType: "system_flag",
      actionType: "service_availability_update",
      actorId,
      reason,
      confirmPolicy: { type: "reason_only", phrase: "" },
      beforeSnapshot: { services: before },
      afterSnapshot: { services },
      summary: [`service availability: ${definition?.label || key} (${before[key] ? "ON" : "OFF"} → ${enabled ? "ON" : "OFF"})`],
    });

    logger.info("[service-availability] 공개 상태 변경", {
      auditId,
      requestId,
      actorId,
      key,
      enabled,
      reason,
    });
  }

  return NextResponse.json({ ok: true, services });
}

export const GET = withAuth(getHandler, undefined, "admin/service-availability:get", {
  requireAdmin: true,
  bodyParser: "none",
});
export const PATCH = withAuth(patchHandler, validatePatchBody, "admin/service-availability:patch", {
  requireAdmin: true,
  bodyParser: "json",
});
