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

  let read: Awaited<ReturnType<typeof readSystemSetting>>;
  try {
    read = await readSystemSetting(key);
  } catch {
    return failClosed(key, "SYSTEM_SETTING_READ_FAILED");
  }

  if (read.status === "missing") return { state: "none" };
  if (read.status !== "ok") return failClosed(key, "SYSTEM_SETTING_INVALID");

  const normalized = normalizeModelEmergencyDisableRecord(read.value, key);
  if (!normalized.ok) return failClosed(key, "RECORD_INVALID");

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
