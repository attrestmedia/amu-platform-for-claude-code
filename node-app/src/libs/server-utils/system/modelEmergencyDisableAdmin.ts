import "server-only";
import { randomUUID } from "node:crypto";
import {
  createSystemControlAudit,
} from "libs/database/system";
import {
  deleteSystemSettingIfUnchanged,
  insertSystemSettingIfAbsent,
  listSystemSettingsByKeyPrefix,
  readSystemSettingDocument,
  replaceSystemSettingValueIfUnchanged,
} from "libs/database/system/systemSettingRepo";
import {
  deriveModelEmergencyDisableKey,
  isManifestEmergencyDisableTarget,
  isModelEmergencyDisableActive,
  listManifestEmergencyDisableTargets,
  MODEL_EMERGENCY_DISABLE_KEY_PREFIX,
  normalizeModelEmergencyDisableRecord,
  normalizeModelEmergencyDisableTarget,
  type ModelEmergencyDisableRecordV1,
  type ModelEmergencyDisableTarget,
} from "libs/server-utils/ai/modelEmergencyDisableRecord";
import { invalidateModelEmergencyDisableCache } from "libs/server-utils/ai/modelEmergencyDisable";
import { logger } from "utils/log";

type AdminErrorCode =
  | "INVALID_INPUT"
  | "ALREADY_DISABLED"
  | "EMERGENCY_DISABLE_NOT_FOUND"
  | "EMERGENCY_DISABLE_NOT_ACTIVE"
  | "SYSTEM_CONTROL_UNAVAILABLE"
  | "SYSTEM_CONTROL_AUDIT_FAILED";

const ADMIN_ERROR_DETAILS: Record<AdminErrorCode, { status: number; message: string }> = {
  INVALID_INPUT: { status: 400, message: "요청 형식이 올바르지 않습니다." },
  ALREADY_DISABLED: { status: 409, message: "이미 활성 상태인 비상 차단이 있습니다." },
  EMERGENCY_DISABLE_NOT_FOUND: { status: 404, message: "비상 차단 항목을 찾을 수 없습니다." },
  EMERGENCY_DISABLE_NOT_ACTIVE: { status: 409, message: "활성 상태인 비상 차단만 조기 해제할 수 있습니다." },
  SYSTEM_CONTROL_UNAVAILABLE: { status: 503, message: "비상 차단 설정을 읽거나 저장할 수 없습니다." },
  SYSTEM_CONTROL_AUDIT_FAILED: { status: 500, message: "감사 기록을 저장하지 못해 설정 변경을 완료하지 못했습니다." },
};

export class ModelEmergencyDisableAdminError extends Error {
  readonly errorCode: AdminErrorCode;
  readonly status: number;

  constructor(errorCode: AdminErrorCode) {
    super(ADMIN_ERROR_DETAILS[errorCode].message);
    this.name = "ModelEmergencyDisableAdminError";
    this.errorCode = errorCode;
    this.status = ADMIN_ERROR_DETAILS[errorCode].status;
  }
}

type StoredRecord = {
  record: ModelEmergencyDisableRecordV1;
  updatedAt: Date;
};

type StoredRead = { kind: "missing" } | ({ kind: "found" } & StoredRecord);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  try {
    return new Date(timestamp).toISOString() === value;
  } catch {
    return false;
  }
}

function normalizeReason(value: unknown) {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length > 0 && reason.length <= 500 ? reason : null;
}

function getActorId(actorId: string) {
  const actor = String(actorId || "").trim();
  if (!actor) throw new ModelEmergencyDisableAdminError("SYSTEM_CONTROL_UNAVAILABLE");
  return actor;
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

function recordsEqual(
  left: ModelEmergencyDisableRecordV1,
  right: ModelEmergencyDisableRecordV1,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readFailure() {
  return new ModelEmergencyDisableAdminError("SYSTEM_CONTROL_UNAVAILABLE");
}

async function readStoredRecord(key: string): Promise<StoredRead> {
  let result: Awaited<ReturnType<typeof readSystemSettingDocument>>;
  try {
    result = await readSystemSettingDocument(key);
  } catch {
    throw readFailure();
  }

  if (result.read.status === "missing") return { kind: "missing" };
  if (result.read.status !== "ok") throw readFailure();

  const normalized = normalizeModelEmergencyDisableRecord(result.read.value, key);
  if (!normalized.ok || !(result.updatedAt instanceof Date) || !Number.isFinite(result.updatedAt.getTime())) {
    throw readFailure();
  }
  return { kind: "found", record: normalized.record, updatedAt: result.updatedAt };
}

async function readAppliedRecord(key: string, expected: ModelEmergencyDisableRecordV1): Promise<StoredRecord> {
  const stored = await readStoredRecord(key);
  if (stored.kind !== "found") throw readFailure();
  if (!recordsEqual(stored.record, expected)) {
    throw new ModelEmergencyDisableAdminError("ALREADY_DISABLED");
  }
  return stored;
}

function validateCreateBody(body: unknown, now: Date): {
  target: ModelEmergencyDisableTarget;
  disabledUntil: string;
  reason: string;
} {
  if (!isPlainObject(body) || !hasExactKeys(body, ["target", "disabledUntil", "reason"])) {
    throw new ModelEmergencyDisableAdminError("INVALID_INPUT");
  }

  const targetResult = normalizeModelEmergencyDisableTarget(body.target);
  if (!targetResult.ok || !isManifestEmergencyDisableTarget(targetResult.target)) {
    throw new ModelEmergencyDisableAdminError("INVALID_INPUT");
  }

  if (!isCanonicalIsoDate(body.disabledUntil) || Date.parse(body.disabledUntil) <= now.getTime()) {
    throw new ModelEmergencyDisableAdminError("INVALID_INPUT");
  }
  const reason = normalizeReason(body.reason);
  if (!reason) throw new ModelEmergencyDisableAdminError("INVALID_INPUT");

  return { target: targetResult.target, disabledUntil: body.disabledUntil, reason };
}

function validateReleaseBody(body: unknown) {
  if (!isPlainObject(body) || !hasExactKeys(body, ["key", "reason"])) {
    throw new ModelEmergencyDisableAdminError("INVALID_INPUT");
  }
  const key = body.key;
  const escapedPrefix = MODEL_EMERGENCY_DISABLE_KEY_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (typeof key !== "string" || !new RegExp(`^${escapedPrefix}[a-f0-9]{64}\\.v1$`).test(key)) {
    throw new ModelEmergencyDisableAdminError("INVALID_INPUT");
  }
  const reason = normalizeReason(body.reason);
  if (!reason) throw new ModelEmergencyDisableAdminError("INVALID_INPUT");
  return { key, reason };
}

async function recordAuditAndCompensate(args: {
  key: string;
  actionType: "model_emergency_disable" | "model_emergency_release";
  actorId: string;
  reason: string;
  requestId: string;
  before: ModelEmergencyDisableRecordV1 | null;
  after: ModelEmergencyDisableRecordV1;
  afterUpdatedAt: Date;
  auditId: string;
}) {
  try {
    await createSystemControlAudit({
      auditId: args.auditId,
      requestId: args.requestId,
      targetType: "system_flag",
      actionType: args.actionType,
      actorId: args.actorId,
      reason: args.reason,
      confirmPolicy: { type: "reason_only", phrase: "" },
      beforeSnapshot: { key: args.key, record: args.before },
      afterSnapshot: { key: args.key, record: args.after },
      summary: [args.actionType === "model_emergency_disable" ? "모델 비상 차단 추가" : "모델 비상 차단 조기 해제"],
    });
  } catch {
    let restored = false;
    try {
      if (args.before === null) {
        restored = (await deleteSystemSettingIfUnchanged({
          key: args.key,
          expectedUpdatedAt: args.afterUpdatedAt,
        })).deleted;
      } else {
        restored = (await replaceSystemSettingValueIfUnchanged({
          key: args.key,
          expectedUpdatedAt: args.afterUpdatedAt,
          value: args.before as unknown as Record<string, unknown>,
          updatedBy: args.before.actor,
        })).applied;
      }
    } catch {
      restored = false;
    }
    if (!restored) {
      logger.error("[model-emergency-disable] audit compensation failed", {
        key: args.key,
        requestId: args.requestId,
        phase: "restore_after_audit_failure",
      });
    }
    throw new ModelEmergencyDisableAdminError("SYSTEM_CONTROL_AUDIT_FAILED");
  }
}

function makeAuditId() {
  return `sys-audit-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export async function listModelEmergencyDisables(now = new Date()) {
  let entries: Awaited<ReturnType<typeof listSystemSettingsByKeyPrefix>>;
  try {
    entries = await listSystemSettingsByKeyPrefix(MODEL_EMERGENCY_DISABLE_KEY_PREFIX);
  } catch {
    throw readFailure();
  }

  const records: Array<{
    key: string;
    state: "active" | "expired" | "released";
    record: ModelEmergencyDisableRecordV1;
  }> = [];
  const invalidKeys: Array<{ key: string; reason: string }> = [];
  for (const entry of entries) {
    if (entry.read.status !== "ok") {
      invalidKeys.push({
        key: entry.key,
        reason: entry.read.status === "invalid" ? `stored_value_${entry.read.valueType}` : "stored_value_missing",
      });
      continue;
    }
    const normalized = normalizeModelEmergencyDisableRecord(entry.read.value, entry.key);
    if (!normalized.ok) {
      invalidKeys.push({ key: entry.key, reason: normalized.reason });
      continue;
    }
    const state = normalized.record.releasedAt !== null
      ? "released"
      : isModelEmergencyDisableActive(normalized.record, now)
        ? "active"
        : "expired";
    records.push({ key: entry.key, state, record: normalized.record });
  }

  records.sort((left, right) => {
    const rank = (state: typeof left.state) => state === "active" ? 0 : 1;
    return rank(left.state) - rank(right.state)
      || Date.parse(right.record.issuedAt) - Date.parse(left.record.issuedAt)
      || left.key.localeCompare(right.key);
  });

  return {
    readable: true as const,
    now: now.toISOString(),
    records,
    invalidKeys,
    targets: listManifestEmergencyDisableTargets(),
  };
}

export async function createModelEmergencyDisable(
  args: { body: unknown; actorId: string; requestId: string },
  now = new Date(),
) {
  const actorId = getActorId(args.actorId);
  const { target, disabledUntil, reason } = validateCreateBody(args.body, now);
  const key = deriveModelEmergencyDisableKey(target);
  const record: ModelEmergencyDisableRecordV1 = {
    schemaVersion: 1,
    target,
    disabledUntil,
    reason,
    actor: actorId,
    issuedAt: now.toISOString(),
    releasedAt: null,
    releasedBy: null,
    releaseReason: null,
  };

  let before = await readStoredRecord(key);
  if (before.kind === "missing") {
    let inserted = false;
    try {
      inserted = (await insertSystemSettingIfAbsent({
        key,
        value: record as unknown as Record<string, unknown>,
        description: "AI model emergency disable overlay",
        updatedBy: actorId,
      })).inserted;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw readFailure();
    }

    if (inserted) {
      const after = await readAppliedRecord(key, record);
      const auditId = makeAuditId();
      await recordAuditAndCompensate({
        key,
        actionType: "model_emergency_disable",
        actorId,
        reason,
        requestId: args.requestId,
        before: null,
        after: record,
        afterUpdatedAt: after.updatedAt,
        auditId,
      });
      invalidateModelEmergencyDisableCache(key);
  return { key, record, auditId };
    }

    before = await readStoredRecord(key);
    if (before.kind === "missing") throw readFailure();
  }

  if (isModelEmergencyDisableActive(before.record, now)) {
    throw new ModelEmergencyDisableAdminError("ALREADY_DISABLED");
  }
  const updated = await replaceSystemSettingValueIfUnchanged({
    key,
    expectedUpdatedAt: before.updatedAt,
    value: record as unknown as Record<string, unknown>,
    updatedBy: actorId,
  }).catch(() => {
    throw readFailure();
  });
  if (!updated.applied) {
    await readStoredRecord(key);
    throw new ModelEmergencyDisableAdminError("ALREADY_DISABLED");
  }

  const after = await readAppliedRecord(key, record);
  const auditId = makeAuditId();
  await recordAuditAndCompensate({
    key,
    actionType: "model_emergency_disable",
    actorId,
    reason,
    requestId: args.requestId,
    before: before.record,
    after: record,
    afterUpdatedAt: after.updatedAt,
    auditId,
  });
  invalidateModelEmergencyDisableCache(key);
  return { key, record, auditId };
}

export async function releaseModelEmergencyDisable(
  args: { body: unknown; actorId: string; requestId: string },
  now = new Date(),
) {
  const actorId = getActorId(args.actorId);
  const { key, reason } = validateReleaseBody(args.body);
  const before = await readStoredRecord(key);
  if (before.kind === "missing") {
    throw new ModelEmergencyDisableAdminError("EMERGENCY_DISABLE_NOT_FOUND");
  }
  if (!isModelEmergencyDisableActive(before.record, now)) {
    throw new ModelEmergencyDisableAdminError("EMERGENCY_DISABLE_NOT_ACTIVE");
  }

  const record: ModelEmergencyDisableRecordV1 = {
    ...before.record,
    releasedAt: now.toISOString(),
    releasedBy: actorId,
    releaseReason: reason,
  };
  const updated = await replaceSystemSettingValueIfUnchanged({
    key,
    expectedUpdatedAt: before.updatedAt,
    value: record as unknown as Record<string, unknown>,
    updatedBy: actorId,
  }).catch(() => {
    throw readFailure();
  });
  if (!updated.applied) {
    await readStoredRecord(key);
    throw new ModelEmergencyDisableAdminError("EMERGENCY_DISABLE_NOT_ACTIVE");
  }

  const after = await readAppliedRecord(key, record);
  const auditId = makeAuditId();
  await recordAuditAndCompensate({
    key,
    actionType: "model_emergency_release",
    actorId,
    reason,
    requestId: args.requestId,
    before: before.record,
    after: record,
    afterUpdatedAt: after.updatedAt,
    auditId,
  });
  invalidateModelEmergencyDisableCache(key);
  return { key, record, auditId };
}

export function getModelEmergencyDisableAdminError(error: unknown) {
  if (error instanceof ModelEmergencyDisableAdminError) {
    return { errorCode: error.errorCode, status: error.status, error: error.message };
  }
  const fallback = ADMIN_ERROR_DETAILS.SYSTEM_CONTROL_UNAVAILABLE;
  return { errorCode: "SYSTEM_CONTROL_UNAVAILABLE" as const, status: fallback.status, error: fallback.message };
}
