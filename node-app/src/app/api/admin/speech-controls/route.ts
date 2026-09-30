import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  SPEECH_PROVIDER_ROUTABLE,
  SPEECH_QUALITY_PRESETS,
  isSpeechBudgetOwner,
  isSpeechCatalogProvider,
} from "consts/system/speechRuntimeControls";
import { createSystemControlAudit } from "libs/database/system";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getSpeechRuntimeControls, setSpeechRuntimeControls } from "libs/server-utils/system/speechRuntimeControls";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(admin / speech-controls) — speech 런타임 제어 조회·변경
 * @process 관리자 인증  입력 검증  설정 저장  감사 로그 기록
 * @domain system-control
 * @scope admin-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUDGET_CAP_FIELDS = ["perRequestUsdCap", "dailyUsdCap", "monthlyUsdCap"] as const;
const CONCURRENCY_CAP_FIELDS = ["perUserConcurrent", "globalConcurrent"] as const;

/**
 * 상한 객체 검증.
 *
 * normalizeSpeechRuntimeControls의 normalizeCap은 음수·NaN·Infinity를 **조용히 null로 되돌린다.**
 * 정규화 단계에서는 그게 맞지만(저장값은 신뢰할 수 없는 입력), 관리자가 방금 입력한 값에는 맞지 않는다 —
 * "-1을 넣었더니 미확정이 됐다"가 오류 없이 저장되면 상한을 걸었다고 착각하게 된다.
 * 그래서 입력 경계에서는 거부하고, 정규화는 저장값 방어선으로 남긴다.
 */
function validateCapObject(value: unknown, label: string, allowedFields: readonly string[]): string | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return `${label}은 객체여야 합니다.`;
  for (const [field, raw] of Object.entries(value as UnknownRecord)) {
    if (!allowedFields.includes(field)) return `${label}에 지원하지 않는 항목이 있습니다: ${field}`;
    // null은 "미확정"이라는 명시적 값이므로 허용한다. 0(차단)과 구분된다.
    if (raw === null) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return `${label}.${field}는 0 이상의 유한한 숫자 또는 null이어야 합니다.`;
    }
  }
  return null;
}

function validatePatchBody(data: UnknownRecord) {
  if (typeof data?.reason !== "string" || !String(data.reason).trim()) {
    return { valid: false, error: "변경 사유가 필요합니다." };
  }
  if (data?.killSwitch !== undefined && typeof data.killSwitch !== "boolean") {
    return { valid: false, error: "killSwitch는 boolean이어야 합니다." };
  }
  if (data?.preset !== undefined && !(SPEECH_QUALITY_PRESETS as readonly string[]).includes(String(data.preset))) {
    return { valid: false, error: "지원하지 않는 preset입니다." };
  }
  if (data?.providerEnabled !== undefined) {
    if (!data.providerEnabled || typeof data.providerEnabled !== "object") {
      return { valid: false, error: "providerEnabled는 객체여야 합니다." };
    }
    for (const [provider, enabled] of Object.entries(data.providerEnabled as UnknownRecord)) {
      if (!isSpeechCatalogProvider(provider)) {
        return { valid: false, error: `지원하지 않는 speech provider입니다: ${provider}` };
      }
      if (typeof enabled !== "boolean") {
        return { valid: false, error: "providerEnabled 값은 boolean이어야 합니다." };
      }
    }
  }
  if (data?.voiceAllowlist !== undefined && !Array.isArray(data.voiceAllowlist)) {
    return { valid: false, error: "voiceAllowlist는 배열이어야 합니다." };
  }
  const budgetError = validateCapObject(data?.budget, "budget", BUDGET_CAP_FIELDS);
  if (budgetError) return { valid: false, error: budgetError };
  if (data?.budgetByOwner !== undefined) {
    if (!data.budgetByOwner || typeof data.budgetByOwner !== "object" || Array.isArray(data.budgetByOwner)) {
      return { valid: false, error: "budgetByOwner는 객체여야 합니다." };
    }
    for (const [owner, limits] of Object.entries(data.budgetByOwner as UnknownRecord)) {
      if (!isSpeechBudgetOwner(owner)) {
        return { valid: false, error: `지원하지 않는 budget owner입니다: ${owner}` };
      }
      const ownerError = validateCapObject(limits, `budgetByOwner.${owner}`, BUDGET_CAP_FIELDS);
      if (ownerError) return { valid: false, error: ownerError };
    }
  }
  const concurrencyError = validateCapObject(data?.concurrency, "concurrency", CONCURRENCY_CAP_FIELDS);
  if (concurrencyError) return { valid: false, error: concurrencyError };
  if (data?.tutorsStt !== undefined) {
    const t = data.tutorsStt;
    if (!t || typeof t !== "object" || Array.isArray(t)) {
      return { valid: false, error: "tutorsStt는 객체여야 합니다." };
    }
    const tutors = t as UnknownRecord;
    if (tutors.provider !== undefined && String(tutors.provider) !== "openai") {
      return { valid: false, error: "tutorsStt.provider는 openai만 허용합니다." };
    }
    if (tutors.enabled !== undefined && typeof tutors.enabled !== "boolean") {
      return { valid: false, error: "tutorsStt.enabled는 boolean이어야 합니다." };
    }
    if (tutors.modelName !== undefined && typeof tutors.modelName !== "string") {
      return { valid: false, error: "tutorsStt.modelName은 문자열이어야 합니다." };
    }
    if (
      tutors.allowedLanguages !== undefined &&
      (!Array.isArray(tutors.allowedLanguages) || tutors.allowedLanguages.some((value) => typeof value !== "string"))
    ) {
      return { valid: false, error: "tutorsStt.allowedLanguages는 문자열 배열이어야 합니다." };
    }
    for (const field of ["maxDurationMs", "maxAudioBytes", "maxRequestsPerUserPerDay"] as const) {
      const value = tutors[field];
      if (value !== undefined && value !== null) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          return { valid: false, error: `tutorsStt.${field}는 0 이상의 유한한 숫자 또는 null이어야 합니다.` };
        }
      }
    }
    if (tutors.minorProtectionReady !== undefined && typeof tutors.minorProtectionReady !== "boolean") {
      return { valid: false, error: "tutorsStt.minorProtectionReady는 boolean이어야 합니다." };
    }
    if (tutors.allowUnknownAudience !== undefined && typeof tutors.allowUnknownAudience !== "boolean") {
      return { valid: false, error: "tutorsStt.allowUnknownAudience는 boolean이어야 합니다." };
    }
  }
  return { valid: true };
}

async function getHandler() {
  return NextResponse.json({
    ok: true,
    controls: await getSpeechRuntimeControls(),
    // 코드 정책 상한. DB는 이 값을 끌 수만 있고 켤 수 없다.
    providerRoutable: SPEECH_PROVIDER_ROUTABLE,
  });
}

async function patchHandler(data: UnknownRecord, user: AuthenticatedUserType, request: Request) {
  const reason = String(data.reason || "").trim();
  const actorId = String(user?.uid || user?.ID || "");
  const requestId =
    String(request.headers.get("x-request-id") || request.headers.get("x-amu-request-id") || "").trim() || randomUUID();

  const before = await getSpeechRuntimeControls();
  const controls = await setSpeechRuntimeControls({
    patch: {
      killSwitch: data.killSwitch as boolean | undefined,
      preset: data.preset as never,
      providerEnabled: data.providerEnabled as never,
      voiceAllowlist: data.voiceAllowlist as string[] | undefined,
      budget: data.budget as never,
      budgetByOwner: data.budgetByOwner as never,
      concurrency: data.concurrency as never,
      tutorsStt: data.tutorsStt as never,
    },
    updatedBy: actorId,
  });

  if (JSON.stringify(before) === JSON.stringify(controls)) {
    return NextResponse.json({ ok: true, controls, changed: false });
  }

  const auditId = `sys-audit-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await createSystemControlAudit({
    auditId,
    requestId,
    targetType: "system_flag",
    actionType: "speech_runtime_controls_update",
    actorId,
    reason,
    confirmPolicy: { type: "reason_only", phrase: "" },
    beforeSnapshot: { controls: before },
    afterSnapshot: { controls },
    summary: [
      `speech kill switch: ${before.killSwitch ? "ON" : "OFF"} → ${controls.killSwitch ? "ON" : "OFF"}`,
      `speech providers: ${JSON.stringify(before.providerEnabled)} → ${JSON.stringify(controls.providerEnabled)}`,
    ],
  });

  logger.info("[speech-runtime-controls] 런타임 제어 변경", { auditId, requestId, actorId, reason });

  return NextResponse.json({ ok: true, controls, changed: true });
}

export const GET = withAuth(getHandler, undefined, "admin/speech-controls:get", {
  requireAdmin: true,
  bodyParser: "none",
});
export const PATCH = withAuth(patchHandler, validatePatchBody, "admin/speech-controls:patch", {
  requireAdmin: true,
  bodyParser: "json",
});
