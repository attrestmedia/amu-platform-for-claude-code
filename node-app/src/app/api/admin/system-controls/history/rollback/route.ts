import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE } from "consts/system/systemControl";
import { createSystemControlAudit, getSystemControlAuditByAuditId, markSystemControlAuditRolledBack } from "libs/database/system";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  listSystemModelControls,
  pickSystemModelControlSnapshotByKeys,
  restoreSystemModelControlSnapshot,
} from "libs/server-utils/api/systemModelControl";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

type SystemModelSnapshotItem = Parameters<typeof restoreSystemModelControlSnapshot>[0][number];
type SystemModelAuditSnapshotItem = SystemModelSnapshotItem & { key?: string };

function getSnapshotItems(snapshot: unknown): SystemModelAuditSnapshotItem[] {
  const items = toUnknownRecord(snapshot).items;
  return Array.isArray(items) ? (items as SystemModelAuditSnapshotItem[]) : [];
}

function validateRollbackBody(data: unknown) {
  const body = toUnknownRecord(data);
  if (typeof body.auditId !== "string" || !String(body.auditId).trim()) {
    return { valid: false, error: "auditId가 필요합니다." };
  }
  if (typeof body.reason !== "string" || !String(body.reason).trim()) {
    return { valid: false, error: "롤백 사유가 필요합니다." };
  }
  if (String(body.confirmPhrase || "").trim() !== SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE) {
    return { valid: false, error: `confirmPhrase는 ${SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE} 이어야 합니다.` };
  }
  return { valid: true };
}

/**
 * @docHint
 * @purpose API 라우트(admin / system-controls / history / rollback) 기능 요청 처리
 * @process 인증/권한 검증  감사 로그 조회  snapshot 복원  rollback 감사 로그 저장  JSON 응답 반환
 * @domain system-control
 * @scope admin-api
 */
async function postHandler(data: unknown, user: unknown, request: Request) {
  const body = toUnknownRecord(data);
  const userRecord = toUnknownRecord(user);
  const actorId = String(userRecord.uid || userRecord.ID || "");
  const reason = String(body.reason || "").trim();
  const requestId =
    String(request.headers.get("x-request-id") || request.headers.get("x-amu-request-id") || "").trim() || randomUUID();
  const target = await getSystemControlAuditByAuditId(String(body.auditId || "").trim());

  if (!target) {
    return NextResponse.json({ ok: false, error: "audit_not_found", errorCode: "NOT_FOUND" }, { status: 404 });
  }
  if (target.status === "rolled_back") {
    return NextResponse.json({ ok: false, error: "audit_already_rolled_back", errorCode: "INVALID_STATE" }, { status: 409 });
  }
  if (target.targetType !== "model_catalog") {
    return NextResponse.json(
      { ok: false, error: "rollback_not_supported_for_target", errorCode: "INVALID_TARGET" },
      { status: 400 },
    );
  }

  const beforeItems = getSnapshotItems(target.beforeSnapshot);
  const afterItems = getSnapshotItems(target.afterSnapshot);
  if (!beforeItems.length || !afterItems.length) {
    return NextResponse.json({ ok: false, error: "audit_snapshot_missing", errorCode: "INVALID_SNAPSHOT" }, { status: 400 });
  }

  const currentModels = await listSystemModelControls();
  const currentSnapshot = pickSystemModelControlSnapshotByKeys(
    currentModels,
    afterItems.map((item) => String(item?.key || "").trim()),
  );
  const restoredModels = await restoreSystemModelControlSnapshot(beforeItems);
  const restoredSnapshot = pickSystemModelControlSnapshotByKeys(
    restoredModels,
    beforeItems.map((item) => String(item?.key || "").trim()),
  );

  const rollbackAuditId = `sys-audit-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await createSystemControlAudit({
    auditId: rollbackAuditId,
    requestId,
    targetType: "model_catalog",
    actionType: "rollback",
    actorId,
    reason,
    confirmPolicy: {
      type: "confirm_phrase",
      phrase: SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE,
    },
    beforeSnapshot: { items: currentSnapshot },
    afterSnapshot: { items: restoredSnapshot },
    summary: [`rollback of ${target.auditId}`],
    rollbackOfAuditId: target.auditId,
  });

  await markSystemControlAuditRolledBack({
    auditId: target.auditId,
    rolledBackBy: actorId,
    rolledBackByAuditId: rollbackAuditId,
  });

  logger.warn("[system-control] rollback applied", {
    auditId: rollbackAuditId,
    rollbackOfAuditId: target.auditId,
    requestId,
    actorId,
    reason,
    confirmPolicy: "confirm_phrase",
    confirmPhrase: SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE,
  });

  return NextResponse.json({
    ok: true,
    auditId: rollbackAuditId,
    rollbackOfAuditId: target.auditId,
    models: restoredModels,
  });
}

export const POST = withAuth(postHandler, validateRollbackBody, "admin/system-controls/history/rollback:post", {
  requireAdmin: true,
});
