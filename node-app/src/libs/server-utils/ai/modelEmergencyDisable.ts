import "server-only";
import { readSystemSetting } from "libs/database/system/systemSettingRepo";
import { logger } from "utils/log";
import {
  deriveModelEmergencyDisableKey,
  isModelEmergencyDisableActive,
  normalizeModelEmergencyDisableRecord,
  resolveManifestModelRef,
  type ModelEmergencyDisableRecordV1,
  type ModelEmergencyDisableTarget,
} from "./modelEmergencyDisableRecord";

export function createSystemControlUnavailableError(): Error & {
  errorCode: "SYSTEM_CONTROL_UNAVAILABLE";
  status: 503;
} {
  const error = new Error("system_control_unavailable") as Error & {
    errorCode: "SYSTEM_CONTROL_UNAVAILABLE";
    status: 503;
  };
  error.errorCode = "SYSTEM_CONTROL_UNAVAILABLE";
  error.status = 503;
  return error;
}

function failClosed(key: string, reasonCode: string): never {
  logger.error("[model-emergency-disable] read failed closed", { key, reasonCode });
  throw createSystemControlUnavailableError();
}

/**
 * 모델 호출마다 비상차단 설정을 DB 에서 읽지 않도록 정상 판독값(없음·유효 레코드)만 짧게 캐시한다
 * (JEV-117 F4, OD-JEV-14 와 같은 3초 기준). 읽기 실패·손상은 캐시하지 않아 매번 fail-closed 로 재평가된다.
 * 같은 프로세스의 차단·해제는 즉시 무효화하고, 다른 인스턴스 반영은 최대 TTL 만큼 늦다.
 */
export const MODEL_EMERGENCY_DISABLE_CACHE_TTL_MS = 3_000;

const emergencyDisableCache = new Map<string, { record: ModelEmergencyDisableRecordV1 | null; expiresAt: number }>();

export function invalidateModelEmergencyDisableCache(key?: string) {
  if (key) emergencyDisableCache.delete(key);
  else emergencyDisableCache.clear();
}

export async function readModelEmergencyDisable(
  target: ModelEmergencyDisableTarget,
  now = new Date(),
): Promise<{ state: "none" } | { state: "active" | "inactive"; record: ModelEmergencyDisableRecordV1 }> {
  let key: string;
  try {
    key = deriveModelEmergencyDisableKey(target);
  } catch {
    return failClosed("", "INVALID_TARGET");
  }

  const nowMs = Date.now();
  const cached = emergencyDisableCache.get(key);
  if (cached && cached.expiresAt > nowMs) {
    if (!cached.record) return { state: "none" };
    return {
      state: isModelEmergencyDisableActive(cached.record, now) ? "active" : "inactive",
      record: cached.record,
    };
  }
  emergencyDisableCache.delete(key);

  let read: Awaited<ReturnType<typeof readSystemSetting>>;
  try {
    read = await readSystemSetting(key);
  } catch {
    return failClosed(key, "SYSTEM_SETTING_READ_FAILED");
  }

  if (read.status === "missing") {
    emergencyDisableCache.set(key, { record: null, expiresAt: nowMs + MODEL_EMERGENCY_DISABLE_CACHE_TTL_MS });
    return { state: "none" };
  }
  if (read.status !== "ok") return failClosed(key, "SYSTEM_SETTING_INVALID");

  const normalized = normalizeModelEmergencyDisableRecord(read.value, key);
  if (!normalized.ok) return failClosed(key, "RECORD_INVALID");
  emergencyDisableCache.set(key, { record: normalized.record, expiresAt: nowMs + MODEL_EMERGENCY_DISABLE_CACHE_TTL_MS });

  return {
    state: isModelEmergencyDisableActive(normalized.record, now) ? "active" : "inactive",
    record: normalized.record,
  };
}

export async function assertModelProfileNotEmergencyDisabledOrThrow(args: {
  provider: string;
  modelName: string;
  modality: string;
}): Promise<void> {
  const modelRef = resolveManifestModelRef(args);
  if (!modelRef) return;

  const state = await readModelEmergencyDisable({ kind: "modelProfile", modelRef });
  if (state.state !== "active") return;

  const error = new Error("model_disabled") as Error & {
    errorCode: "MODEL_DISABLED";
    status: 403;
    detail: {
      provider: string;
      modelName: string;
      modality: string;
      emergencyDisabled: true;
      disabledUntil: string;
    };
  };
  error.errorCode = "MODEL_DISABLED";
  error.status = 403;
  error.detail = {
    provider: args.provider,
    modelName: args.modelName,
    modality: args.modality,
    emergencyDisabled: true,
    disabledUntil: state.record.disabledUntil,
  };
  throw error;
}

export async function readExecutionRouteEmergencyState(args: {
  modelRef: string;
  route: string;
}): Promise<{ disabled: boolean }> {
  const state = await readModelEmergencyDisable({
    kind: "executionRoute",
    modelRef: args.modelRef,
    route: args.route,
  });
  return { disabled: state.state === "active" };
}
