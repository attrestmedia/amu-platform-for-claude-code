import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { validateJevRuntimeControlsRequest, type JevRuntimeControls } from "consts/system/jevRuntimeControls";
import { createSystemControlAudit } from "libs/database/system";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getJevRuntimeControls,
  getJevRuntimeControlsWriteBase,
  setJevRuntimeControls,
} from "libs/server-utils/system/jevRuntimeControls";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(admin / jev-controls) — JEV 런타임 제어 조회·변경
 * @process 관리자 인증  PATCH 입력 검증  설정 저장  변경 감사 기록
 * @domain system-control
 * @scope admin-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function validatePatchBody(data: UnknownRecord) {
  return validateJevRuntimeControlsRequest(data);
}

async function getHandler() {
  const result = await getJevRuntimeControls();
  // 손상 저장값이면 편집 잠금 대신 코드 기본값 기준 복구 저장을 허용한다(SSI-001 A1-RECOVER). 장애는 여전히 잠근다.
  const recoverable = !result.readable && (await getJevRuntimeControlsWriteBase()).writable;
  return NextResponse.json({
    ok: true,
    readable: result.readable,
    recoverable,
    controls: result.readable ? result.controls : null,
  });
}

async function patchHandler(data: UnknownRecord, user: AuthenticatedUserType, request: Request) {
  const validated = validateJevRuntimeControlsRequest(data);
  if (!validated.valid) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const actorId = String(user?.uid || user?.ID || "");
  const requestId =
    String(request.headers.get("x-request-id") || request.headers.get("x-amu-request-id") || "").trim() || randomUUID();
  const before = await getJevRuntimeControlsWriteBase();
  if (!before.writable) {
    return NextResponse.json(
      { ok: false, readable: false, error: "JEV 설정을 읽을 수 없어 변경을 저장하지 않았습니다." },
      { status: 503 },
    );
  }
  const recoveredFrom = before.recoveredFromValueType;

  let controls: JevRuntimeControls;
  try {
    controls = await setJevRuntimeControls({ patch: validated.patch, updatedBy: actorId });
  } catch (error) {
    if (error instanceof Error && error.message === "JEV_RUNTIME_CONTROLS_UNREADABLE") {
      return NextResponse.json(
        { ok: false, readable: false, error: "JEV 설정을 읽을 수 없어 변경을 저장하지 않았습니다." },
        { status: 503 },
      );
    }
    throw error;
  }

  if (!recoveredFrom && JSON.stringify(before.controls) === JSON.stringify(controls)) {
    return NextResponse.json({ ok: true, readable: true, controls, changed: false });
  }

  const auditId = `sys-audit-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await createSystemControlAudit({
    auditId,
    requestId,
    targetType: "system_flag",
    actionType: "jev_runtime_controls_update",
    actorId,
    reason: validated.reason,
    confirmPolicy: { type: "reason_only", phrase: "" },
    beforeSnapshot: recoveredFrom
      ? { controls: null, invalidStoredValueType: recoveredFrom }
      : { controls: before.controls },
    afterSnapshot: { controls },
    summary: [
      ...(recoveredFrom ? [`JEV 설정 손상 값(${recoveredFrom})을 코드 기본값 기준으로 덮어써 복구`] : []),
      `JEV kill switch: ${before.controls.killSwitch ? "ON" : "OFF"} → ${controls.killSwitch ? "ON" : "OFF"}`,
      `JEV provider: ${before.controls.providerEnabled ? "ON" : "OFF"} → ${controls.providerEnabled ? "ON" : "OFF"}`,
      `JEV daily COGS cap: ${before.controls.dailyCogsUsdCap} → ${controls.dailyCogsUsdCap} USD`,
    ],
  });

  logger.info("[jev-runtime-controls] 런타임 제어 변경", {
    auditId,
    requestId,
    actorId,
    reason: validated.reason,
    recoveredFromValueType: recoveredFrom,
  });
  return NextResponse.json({ ok: true, readable: true, controls, changed: true });
}

export const GET = withAuth(getHandler, undefined, "admin/jev-controls:get", {
  requireAdmin: true,
  bodyParser: "none",
});
export const PATCH = withAuth(patchHandler, validatePatchBody, "admin/jev-controls:patch", {
  requireAdmin: true,
  bodyParser: "json",
});
