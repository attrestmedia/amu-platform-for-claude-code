import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { REASONING_EFFORT_LEVELS } from "consts/ai";
import { SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE } from "consts/system/systemControl";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { createSystemControlAudit } from "libs/database/system";
import {
  listSystemModelControls,
  pickSystemModelControlSnapshotByGroup,
  pickSystemModelControlSnapshotByKeys,
  updateSystemDefaultModel,
  updateSystemModelControls,
} from "libs/server-utils/api/systemModelControl";
import { logger } from "utils/log";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

type SystemModelPatch = {
  key: string;
  enabled?: boolean;
  adminOnly?: boolean;
  status?: "active" | "deprecated";
  recommendedModel?: boolean;
  reasoningEffort?: string;
};

export const runtime = "nodejs";

function resolvePatchActionType(args: {
  hasEnabledPatch: boolean;
  hasAdminOnlyPatch: boolean;
  hasStatusPatch: boolean;
  hasRecommendedPatch: boolean;
  hasReasoningEffortPatch: boolean;
}):
  | "model_reasoning_effort_update"
  | "model_recommendation_update"
  | "model_admin_only_update"
  | "model_status_update"
  | "model_enabled_update" {
  const { hasEnabledPatch, hasAdminOnlyPatch, hasStatusPatch, hasRecommendedPatch, hasReasoningEffortPatch } = args;
  if (hasReasoningEffortPatch && !hasEnabledPatch && !hasRecommendedPatch && !hasAdminOnlyPatch && !hasStatusPatch) {
    return "model_reasoning_effort_update";
  }
  if (hasRecommendedPatch && !hasEnabledPatch && !hasAdminOnlyPatch && !hasStatusPatch) {
    return "model_recommendation_update";
  }
  if (hasAdminOnlyPatch && !hasEnabledPatch && !hasStatusPatch) {
    return "model_admin_only_update";
  }
  if (hasStatusPatch && !hasEnabledPatch) {
    return "model_status_update";
  }
  return "model_enabled_update";
}

function validatePatchBody(data: UnknownRecord) {
  const patches = Array.isArray(data?.patches) ? (data.patches as SystemModelPatch[]) : null;
  const hasDefaultModelKey = typeof data?.defaultModelKey === "string" && String(data.defaultModelKey).trim().length > 0;
  if (!patches && !hasDefaultModelKey) return { valid: false, error: "patches 또는 defaultModelKey가 필요합니다." };
  if (typeof data?.reason !== "string" || !String(data.reason).trim()) return { valid: false, error: "변경 사유가 필요합니다." };
  if (patches && patches.length > 100) return { valid: false, error: "한 번에 변경할 수 있는 모델 수를 초과했습니다." };

  if (patches) {
    for (const patch of patches) {
      const hasEnabled = typeof patch?.enabled === "boolean";
      const hasAdminOnly = typeof patch?.adminOnly === "boolean";
      const hasStatus = patch?.status === "active" || patch?.status === "deprecated";
      const hasRecommendedModel = typeof patch?.recommendedModel === "boolean";
      const hasReasoningEffort = typeof patch?.reasoningEffort === "string";
      if (
        !patch ||
        typeof patch.key !== "string" ||
        (!hasEnabled && !hasAdminOnly && !hasStatus && !hasRecommendedModel && !hasReasoningEffort)
      ) {
        return { valid: false, error: "patches 형식이 올바르지 않습니다." };
      }
      if (patch?.status !== undefined && !hasStatus) {
        return { valid: false, error: "status는 active 또는 deprecated여야 합니다." };
      }
      if (
        hasReasoningEffort &&
        !(REASONING_EFFORT_LEVELS as readonly string[]).includes(String(patch.reasoningEffort).trim().toLowerCase())
      ) {
        return { valid: false, error: "지원하지 않는 reasoning effort 값입니다." };
      }
    }
  }

  return { valid: true };
}

/**
 * @docHint
 * @purpose API 라우트(admin / system-controls / models) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  시스템 모델 설정 조회/갱신  JSON 응답 반환
 * @domain system-control
 * @scope admin-api
 */
async function getHandler() {
  const models = await listSystemModelControls();
  return NextResponse.json({ ok: true, models });
}

async function patchHandler(data: UnknownRecord, user: AuthenticatedUserType, request: Request) {
  const updatedBy = String(user?.uid || user?.ID || "");
  const reason = String(data?.reason || "").trim();
  const requestId =
    String(request.headers.get("x-request-id") || request.headers.get("x-amu-request-id") || "").trim() || randomUUID();
  const beforeModels = await listSystemModelControls();
  const patches: SystemModelPatch[] = Array.isArray(data?.patches) ? (data.patches as SystemModelPatch[]) : [];
  const patchKeys = patches.map((patch) => String(patch?.key || "").trim()).filter(Boolean);
  const defaultModelKey = typeof data?.defaultModelKey === "string" ? String(data.defaultModelKey).trim() : "";
  const defaultTarget = defaultModelKey ? beforeModels.find((item) => item.key === defaultModelKey) : null;
  const beforePatchSnapshot = patchKeys.length > 0 ? pickSystemModelControlSnapshotByKeys(beforeModels, patchKeys) : [];
  const beforeDefaultSnapshot = defaultTarget
    ? pickSystemModelControlSnapshotByGroup(beforeModels, defaultTarget.provider, defaultTarget.modality)
    : [];

  if (patches.length > 0) {
    await updateSystemModelControls({
      patches,
      updatedBy,
    });
  }

  if (defaultModelKey) {
    await updateSystemDefaultModel({
      key: defaultModelKey,
      updatedBy,
    });
  }

  const models = await listSystemModelControls();
  const afterPatchSnapshot = patchKeys.length > 0 ? pickSystemModelControlSnapshotByKeys(models, patchKeys) : [];
  const afterDefaultSnapshot =
    defaultTarget ? pickSystemModelControlSnapshotByGroup(models, defaultTarget.provider, defaultTarget.modality) : [];
  const summary = [
    ...patchKeys.map((key: string) => {
      const patch = patches.find((item) => String(item?.key || "").trim() === key);
      const changes = [
        typeof patch?.enabled === "boolean" ? `enabled=${patch.enabled}` : "",
        typeof patch?.adminOnly === "boolean" ? `adminOnly=${patch.adminOnly}` : "",
        patch?.status === "active" || patch?.status === "deprecated" ? `status=${patch.status}` : "",
        typeof patch?.recommendedModel === "boolean" ? `recommended=${patch.recommendedModel}` : "",
        typeof patch?.reasoningEffort === "string" ? `reasoningEffort=${patch.reasoningEffort}` : "",
      ].filter(Boolean);
      return `model patch: ${key}${changes.length ? ` (${changes.join(", ")})` : ""}`;
    }),
    ...(defaultTarget ? [`default model group: ${defaultTarget.provider}:${defaultTarget.modality}`] : []),
  ];

  if (summary.length > 0) {
    const hasEnabledPatch = patches.some((patch) => typeof patch?.enabled === "boolean");
    const hasAdminOnlyPatch = patches.some((patch) => typeof patch?.adminOnly === "boolean");
    const hasStatusPatch = patches.some((patch) => patch?.status === "active" || patch?.status === "deprecated");
    const hasRecommendedPatch = patches.some((patch) => typeof patch?.recommendedModel === "boolean");
    const hasReasoningEffortPatch = patches.some((patch) => typeof patch?.reasoningEffort === "string");
    const actionType =
      patchKeys.length > 0
        ? resolvePatchActionType({
            hasEnabledPatch,
            hasAdminOnlyPatch,
            hasStatusPatch,
            hasRecommendedPatch,
            hasReasoningEffortPatch,
          })
        : "default_model_update";
    const beforeSnapshot = patchKeys.length > 0 ? beforePatchSnapshot : beforeDefaultSnapshot;
    const afterSnapshot = patchKeys.length > 0 ? afterPatchSnapshot : afterDefaultSnapshot;
    const auditId = `sys-audit-${Date.now()}-${randomUUID().slice(0, 8)}`;

    await createSystemControlAudit({
      auditId,
      requestId,
      targetType: "model_catalog",
      actionType,
      actorId: updatedBy,
      reason,
      confirmPolicy: {
        type: "reason_only",
        phrase: "",
      },
      beforeSnapshot: { items: beforeSnapshot },
      afterSnapshot: { items: afterSnapshot },
      summary,
    });

    logger.info("[system-control] model change applied", {
      auditId,
      requestId,
      actorId: updatedBy,
      reason,
      summary,
      confirmPolicy: "reason_only",
      rollbackConfirmPhrase: SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE,
    });
  }

  return NextResponse.json({ ok: true, models });
}

export const GET = withAuth(getHandler, undefined, "admin/system-controls/models:get", { requireAdmin: true });
export const PATCH = withAuth(patchHandler, validatePatchBody, "admin/system-controls/models:patch", {
  requireAdmin: true,
});
