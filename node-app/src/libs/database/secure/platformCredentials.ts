import { MONGODB_SECRETS_URL } from "consts/env/server";
import type { ClientSession } from "mongoose";
import {
  getPlatformCredentialDefinition,
  getPlatformCredentialEnvironment,
  PLATFORM_CREDENTIAL_DEFINITIONS,
  type PlatformCredentialKey,
} from "consts/secure/platformCredentials";
import { getModel } from "libs/database/modelCache";
import { decryptSecret, encryptSecret } from "libs/server-utils/secure/SecureVault";
import {
  PlatformCredentialAuditSchema,
  PlatformCredentialSchema,
  type IPlatformCredentialAuditDocument,
  type IPlatformCredentialDocument,
} from "models/secure";
import type {
  PlatformCredentialPayload,
  PlatformCredentialStatusItem,
  PlatformCredentialVerificationStatus,
  QwenCredentialMigrationEligibility,
} from "types/secure/platformCredentials";
import {
  QWEN_DEFAULT_ENDPOINT_KIND,
  QWEN_LEGACY_ENDPOINT_KIND,
  QWEN_MODEL_STUDIO_MIGRATION_REASON,
} from "types/secure/platformCredentials";

type AuditContext = {
  actor?: string;
  actorIp?: string;
  requestId?: string;
};

function credentialError(message: string, errorCode: string, status = 400) {
  return Object.assign(new Error(message), { errorCode, status });
}

async function getPlatformCredentialModel() {
  return getModel<IPlatformCredentialDocument>(
    MONGODB_SECRETS_URL,
    "PlatformCredential",
    PlatformCredentialSchema,
    "platform_credentials",
  );
}

async function getPlatformCredentialAuditModel() {
  return getModel<IPlatformCredentialAuditDocument>(
    MONGODB_SECRETS_URL,
    "PlatformCredentialAudit",
    PlatformCredentialAuditSchema,
    "platform_credential_audits",
  );
}

async function appendAudit(args: AuditContext & {
  credentialKey: string;
  action: IPlatformCredentialAuditDocument["action"];
  version?: number;
  previousVersion?: number;
  migrationId?: string;
  result: "success" | "failure";
  code?: string;
}) {
  const Audit = await getPlatformCredentialAuditModel();
  await Audit.create({
    credentialKey: args.credentialKey,
    environment: getPlatformCredentialEnvironment(),
    action: args.action,
    version: args.version,
    previousVersion: args.previousVersion,
    ...(args.migrationId ? { migrationId: args.migrationId } : {}),
    actor: args.actor,
    actorIp: args.actorIp,
    requestId: args.requestId,
    result: args.result,
    code: args.code,
  });
}

function validatePayload(credentialKey: string, payload: unknown): PlatformCredentialPayload {
  const definition = getPlatformCredentialDefinition(credentialKey);
  if (!definition) throw credentialError("지원하지 않는 플랫폼 자격증명입니다.", "CREDENTIAL_KEY_UNSUPPORTED");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw credentialError("자격증명 payload가 필요합니다.", "CREDENTIAL_PAYLOAD_REQUIRED");
  }

  const record = payload as Record<string, unknown>;
  const normalized: PlatformCredentialPayload = {};
  for (const field of definition.fields) {
    const value = String(record[field.key] ?? "").trim();
    if (!value) {
      throw credentialError(`${field.label.ko} 값이 필요합니다.`, "CREDENTIAL_FIELD_REQUIRED");
    }
    if (value.length > 8_000) {
      throw credentialError(`${field.label.ko} 값이 너무 깁니다.`, "CREDENTIAL_FIELD_TOO_LONG");
    }
    if (field.options && !field.options.some((option) => option.value === value)) {
      throw credentialError(`${field.label.ko} 값이 유효하지 않습니다.`, "CREDENTIAL_FIELD_INVALID");
    }
    normalized[field.key] = value;
  }
  if (credentialKey === "ai.qwen.default") {
    if (record.endpointKind !== undefined && record.endpointKind !== QWEN_DEFAULT_ENDPOINT_KIND) {
      throw credentialError("Model Studio Singapore PAYG 자격증명만 저장할 수 있습니다.", "CREDENTIAL_FIELD_INVALID");
    }
    if (normalized.apiKey.startsWith("sk-sp-")) {
      throw credentialError("Token Plan 키는 사용할 수 없습니다. Model Studio PAYG 키를 입력하세요.", "CREDENTIAL_FIELD_INVALID");
    }
    normalized.endpointKind = QWEN_DEFAULT_ENDPOINT_KIND;
  }
  return normalized;
}

function assertStoredQwenPayloadShape(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw credentialError("저장된 Qwen 자격증명 형식이 올바르지 않습니다.", "CREDENTIAL_FIELD_INVALID", 409);
  }
  const record = payload as Record<string, unknown>;
  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  const knownEndpointKind =
    record.endpointKind === QWEN_DEFAULT_ENDPOINT_KIND || record.endpointKind === QWEN_LEGACY_ENDPOINT_KIND;
  if (!knownEndpointKind || !apiKey || apiKey.startsWith("sk-sp-")) {
    throw credentialError("저장된 Qwen 자격증명은 PAYG 계약과 일치하지 않습니다.", "CREDENTIAL_FIELD_INVALID", 409);
  }
}

function assertStoredQwenPayloadIsModelStudioPayg(payload: unknown) {
  assertStoredQwenPayloadShape(payload);
  const record = payload as Record<string, unknown>;
  if (record.endpointKind !== QWEN_DEFAULT_ENDPOINT_KIND) {
    throw credentialError("기존 QwenCloud 자격증명은 Model Studio 런타임에서 사용할 수 없습니다.", "QWEN_LEGACY_ENDPOINT_BLOCKED", 409);
  }
}

export async function createPendingPlatformCredential(args: AuditContext & {
  credentialKey: string;
  payload: unknown;
}) {
  const definition = getPlatformCredentialDefinition(args.credentialKey);
  if (!definition) throw credentialError("지원하지 않는 플랫폼 자격증명입니다.", "CREDENTIAL_KEY_UNSUPPORTED");
  const payload = validatePayload(args.credentialKey, args.payload);
  const environment = getPlatformCredentialEnvironment();
  const Model = await getPlatformCredentialModel();
  const latest = await Model.findOne({ environment, credentialKey: args.credentialKey })
    .sort({ version: -1 })
    .select({ version: 1 })
    .lean();
  const version = Number(latest?.version || 0) + 1;

  try {
    await Model.create({
      credentialKey: args.credentialKey,
      environment,
      category: definition.category,
      provider: definition.provider,
      encryptedPayload: encryptSecret(JSON.stringify(payload)),
      configuredFields: [
        ...definition.fields.map((field) => field.key),
        ...(args.credentialKey === "ai.qwen.default" ? ["endpointKind"] : []),
      ],
      schemaVersion: 1,
      encryptionKeyVersion: "v1",
      version,
      status: "pending",
      lastVerificationStatus: "unverified",
      createdBy: args.actor,
      updatedBy: args.actor,
    });
    await appendAudit({
      ...args,
      action: "create",
      version,
      result: "success",
    });
    return {
      credentialKey: args.credentialKey,
      environment,
      version,
      status: "pending" as const,
    };
  } catch (error) {
    await appendAudit({
      ...args,
      action: "create",
      version,
      result: "failure",
      code: String((error as { code?: unknown })?.code || "CREATE_FAILED").slice(0, 120),
    }).catch(() => undefined);
    throw error;
  }
}

type QwenMigrationResult = {
  credentialKey: "ai.qwen.default";
  environment: ReturnType<typeof getPlatformCredentialEnvironment>;
  version: number;
  status: IPlatformCredentialDocument["status"];
  migratedFromVersion: number;
};

const QWEN_MIGRATION_REASON_CODES = {
  noCredential: "no_qwen_credential",
  statusNotAllowed: "source_status_not_migratable",
  alreadyClaimed: "source_already_claimed",
  payloadUnavailable: "source_payload_unavailable",
  kindNotLegacy: "source_kind_not_legacy",
  ready: "ready",
} as const;

async function findQwenMigrationResult(args: {
  sourceVersion: number;
  migrationId: string;
  session?: ClientSession;
}): Promise<QwenMigrationResult | null> {
  const Model = await getPlatformCredentialModel();
  const Audit = await getPlatformCredentialAuditModel();
  const environment = getPlatformCredentialEnvironment();
  const credentialQuery = Model.findOne({
    environment,
    credentialKey: "ai.qwen.default",
    migrationId: args.migrationId,
  }).select({ credentialKey: 1, environment: 1, version: 1, status: 1, migratedFromVersion: 1 });
  if (args.session) credentialQuery.session(args.session);
  const existing = await credentialQuery.lean();
  if (!existing) return null;
  if (existing.migratedFromVersion !== args.sourceVersion) {
    throw credentialError("Qwen 이관 기록의 원본 버전이 일치하지 않습니다.", "CREDENTIAL_MIGRATION_ID_CONFLICT", 409);
  }

  const auditQuery = Audit.findOne({
    environment,
    credentialKey: "ai.qwen.default",
    migrationId: args.migrationId,
    result: "success",
  }).select({ _id: 1 });
  if (args.session) auditQuery.session(args.session);
  if (!(await auditQuery.lean())) {
    throw credentialError("Qwen 이관 성공 감사 기록이 없습니다.", "CREDENTIAL_MIGRATION_AUDIT_MISSING", 503);
  }

  return {
    credentialKey: "ai.qwen.default",
    environment,
    version: existing.version,
    status: existing.status,
    migratedFromVersion: args.sourceVersion,
  };
}

async function resolveQwenMigrationEligibility(latest?: {
  version: number;
  status: IPlatformCredentialDocument["status"];
  encryptedPayload?: string;
  migrationClaimId?: string;
} | null): Promise<QwenCredentialMigrationEligibility> {
  if (!latest) return { eligible: false, reasonCode: QWEN_MIGRATION_REASON_CODES.noCredential };
  if (latest.status !== "pending" && latest.status !== "active") {
    return { eligible: false, reasonCode: QWEN_MIGRATION_REASON_CODES.statusNotAllowed };
  }
  if (latest.migrationClaimId) {
    return { eligible: false, reasonCode: QWEN_MIGRATION_REASON_CODES.alreadyClaimed };
  }
  if (!latest.encryptedPayload) {
    return { eligible: false, reasonCode: QWEN_MIGRATION_REASON_CODES.payloadUnavailable };
  }

  try {
    const payload = JSON.parse(decryptSecret(latest.encryptedPayload)) as PlatformCredentialPayload;
    assertStoredQwenPayloadShape(payload);
    if (payload.endpointKind !== QWEN_LEGACY_ENDPOINT_KIND) {
      return { eligible: false, reasonCode: QWEN_MIGRATION_REASON_CODES.kindNotLegacy };
    }
    return { eligible: true, reasonCode: QWEN_MIGRATION_REASON_CODES.ready, sourceVersion: latest.version };
  } catch {
    return { eligible: false, reasonCode: QWEN_MIGRATION_REASON_CODES.payloadUnavailable };
  }
}

/**
 * Explicitly copies only the current latest legacy Qwen version into a new Model Studio version.
 * The target and its success audit commit together; retries return the same migration result.
 */
export async function migratePendingQwenCredentialToModelStudio(args: AuditContext & {
  sourceVersion: number;
  reasonCode: typeof QWEN_MODEL_STUDIO_MIGRATION_REASON;
}) {
  if (args.reasonCode !== QWEN_MODEL_STUDIO_MIGRATION_REASON) {
    throw credentialError("Qwen 이관 사유 코드가 올바르지 않습니다.", "CREDENTIAL_MIGRATION_REASON_INVALID");
  }
  if (!Number.isSafeInteger(args.sourceVersion) || args.sourceVersion < 1) {
    throw credentialError("Qwen 원본 버전이 올바르지 않습니다.", "CREDENTIAL_VERSION_REQUIRED");
  }

  const Model = await getPlatformCredentialModel();
  const Audit = await getPlatformCredentialAuditModel();
  const environment = getPlatformCredentialEnvironment();
  const migrationId = `qwen-model-studio:${args.sourceVersion}`;
  const previousResult = await findQwenMigrationResult({ sourceVersion: args.sourceVersion, migrationId });
  if (previousResult) return previousResult;

  const definition = getPlatformCredentialDefinition("ai.qwen.default");
  if (!definition) throw credentialError("Qwen 자격증명 정의를 찾을 수 없습니다.", "CREDENTIAL_KEY_UNSUPPORTED", 500);

  const session = await Model.db.startSession();
  let result: QwenMigrationResult | null = null;
  try {
    await session.withTransaction(async () => {
      const prior = await findQwenMigrationResult({ sourceVersion: args.sourceVersion, migrationId, session });
      if (prior) {
        result = prior;
        return;
      }

      const latest = await Model.findOne({ environment, credentialKey: "ai.qwen.default" })
        .sort({ version: -1 })
        .select({ version: 1 })
        .session(session)
        .lean();
      if (latest?.version !== args.sourceVersion) {
        throw credentialError("이관 원본이 더 이상 최신 자격증명 버전이 아닙니다. 상태를 새로고침하세요.", "CREDENTIAL_MIGRATION_SOURCE_STALE", 409);
      }

      const source = await Model.findOne({ environment, credentialKey: "ai.qwen.default", version: args.sourceVersion })
        .select("+encryptedPayload")
        .session(session)
        .lean();
      if (!source?.encryptedPayload) {
        throw credentialError("이관할 Qwen 원본 버전을 찾을 수 없습니다.", "CREDENTIAL_VERSION_NOT_FOUND", 404);
      }
      if (source.status !== "pending" && source.status !== "active") {
        throw credentialError("현재 pending 또는 active 상태인 Qwen 원본만 이관할 수 있습니다.", "CREDENTIAL_MIGRATION_SOURCE_STATUS_INVALID", 409);
      }

      let sourcePayload: PlatformCredentialPayload;
      try {
        sourcePayload = JSON.parse(decryptSecret(source.encryptedPayload)) as PlatformCredentialPayload;
        assertStoredQwenPayloadShape(sourcePayload);
      } catch {
        throw credentialError("이관 원본 자격증명을 해독할 수 없습니다.", "CREDENTIAL_MIGRATION_SOURCE_INVALID", 409);
      }
      if (sourcePayload.endpointKind !== QWEN_LEGACY_ENDPOINT_KIND) {
        throw credentialError("Model Studio 이관은 기존 QwenCloud 버전에서만 시작할 수 있습니다.", "CREDENTIAL_MIGRATION_SOURCE_KIND_INVALID", 409);
      }

      // Write a transaction scoped claim on the source so a concurrent disable/status change
      // conflicts with this migration instead of letting a stale snapshot create a new version.
      const sourceClaim = await Model.updateOne(
        {
          environment,
          credentialKey: "ai.qwen.default",
          version: args.sourceVersion,
          status: source.status,
          migrationClaimId: { $exists: false },
        },
        { $set: { migrationClaimId: migrationId, updatedBy: args.actor } },
        { session },
      );
      if (sourceClaim.matchedCount !== 1) {
        throw credentialError("Qwen 이관 원본 상태가 변경되었습니다. 상태를 새로고침하세요.", "CREDENTIAL_MIGRATION_SOURCE_STALE", 409);
      }

      const payload = validatePayload("ai.qwen.default", {
        apiKey: sourcePayload.apiKey,
        endpointKind: QWEN_DEFAULT_ENDPOINT_KIND,
      });
      const version = args.sourceVersion + 1;
      const nowCreated = await Model.create(
        [{
          credentialKey: "ai.qwen.default",
          environment,
          category: definition.category,
          provider: definition.provider,
          encryptedPayload: encryptSecret(JSON.stringify(payload)),
          configuredFields: [...definition.fields.map((field) => field.key), "endpointKind"],
          schemaVersion: 1,
          encryptionKeyVersion: "v1",
          version,
          migrationId,
          migratedFromVersion: args.sourceVersion,
          status: "pending",
          lastVerificationStatus: "unverified",
          createdBy: args.actor,
          updatedBy: args.actor,
        }],
        { session },
      );
      await Audit.create(
        [{
          credentialKey: "ai.qwen.default",
          environment,
          action: "migrate",
          version,
          previousVersion: args.sourceVersion,
          migrationId,
          actor: args.actor,
          actorIp: args.actorIp,
          requestId: args.requestId,
          result: "success",
          code: args.reasonCode,
        }],
        { session },
      );
      result = {
        credentialKey: "ai.qwen.default",
        environment,
        version: nowCreated[0].version,
        status: "pending",
        migratedFromVersion: args.sourceVersion,
      };
    });
    if (!result) throw credentialError("Qwen 이관 결과를 확인할 수 없습니다.", "CREDENTIAL_MIGRATION_FAILED", 503);
    return result;
  } catch (error) {
    if ((error as { code?: unknown })?.code === 11000) {
      const duplicateResult = await findQwenMigrationResult({ sourceVersion: args.sourceVersion, migrationId });
      if (duplicateResult) return duplicateResult;
    }

    const errorCode = String((error as { errorCode?: unknown })?.errorCode || "CREDENTIAL_MIGRATION_FAILED").slice(0, 120);
    await appendAudit({
      ...args,
      credentialKey: "ai.qwen.default",
      action: "migrate",
      version: args.sourceVersion + 1,
      previousVersion: args.sourceVersion,
      result: "failure",
      code: errorCode,
    }).catch(() => undefined);
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function getDecryptedPlatformCredentialVersion(credentialKey: string, version: number) {
  const Model = await getPlatformCredentialModel();
  const document = await Model.findOne({
    environment: getPlatformCredentialEnvironment(),
    credentialKey,
    version,
  })
    .select("+encryptedPayload")
    .lean();
  if (!document?.encryptedPayload) {
    throw credentialError("자격증명 버전을 찾을 수 없습니다.", "CREDENTIAL_VERSION_NOT_FOUND", 404);
  }
  const payload = JSON.parse(decryptSecret(document.encryptedPayload)) as PlatformCredentialPayload;
  if (credentialKey === "ai.qwen.default") assertStoredQwenPayloadShape(payload);
  return { payload, document };
}

export async function getActiveDecryptedPlatformCredential(credentialKey: PlatformCredentialKey) {
  const Model = await getPlatformCredentialModel();
  const document = await Model.findOne({
    environment: getPlatformCredentialEnvironment(),
    credentialKey,
    status: "active",
  })
    .select("+encryptedPayload")
    .lean();
  if (!document?.encryptedPayload) return null;
  const payload = JSON.parse(decryptSecret(document.encryptedPayload)) as PlatformCredentialPayload;
  if (credentialKey === "ai.qwen.default") assertStoredQwenPayloadIsModelStudioPayg(payload);
  return { payload, version: document.version, updatedAt: document.updatedAt };
}

export async function setPlatformCredentialVerification(args: AuditContext & {
  credentialKey: string;
  version: number;
  status: Exclude<PlatformCredentialVerificationStatus, "unverified">;
  code: string;
}) {
  const Model = await getPlatformCredentialModel();
  const result = await Model.updateOne(
    {
      environment: getPlatformCredentialEnvironment(),
      credentialKey: args.credentialKey,
      version: args.version,
      status: "pending",
    },
    {
      $set: {
        lastVerificationStatus: args.status,
        lastVerificationCode: args.code.slice(0, 120),
        lastVerifiedAt: new Date(),
        updatedBy: args.actor,
      },
    },
  );
  if (!result.matchedCount) {
    throw credentialError("검증할 pending 자격증명을 찾을 수 없습니다.", "CREDENTIAL_PENDING_NOT_FOUND", 404);
  }
  await appendAudit({
    ...args,
    action: "verify",
    result: args.status === "valid" ? "success" : "failure",
  });
}

/** 검증 수단 unavailable 결과를 기록하되 credential 상태는 갱신하지 않는다. */
export async function auditUnavailablePlatformCredentialVerification(args: AuditContext & {
  credentialKey: string;
  version: number;
  code: string;
}) {
  const Model = await getPlatformCredentialModel();
  const pending = await Model.findOne({
    environment: getPlatformCredentialEnvironment(),
    credentialKey: args.credentialKey,
    version: args.version,
    status: "pending",
  })
    .select({ _id: 1 })
    .lean();
  if (!pending) {
    throw credentialError("검증할 pending 자격증명을 찾을 수 없습니다.", "CREDENTIAL_PENDING_NOT_FOUND", 404);
  }

  await appendAudit({
    ...args,
    action: "verify",
    result: "failure",
    code: args.code.slice(0, 120),
  });
}

export async function activatePlatformCredential(args: AuditContext & {
  credentialKey: string;
  version: number;
}) {
  if (args.credentialKey === "ai.qwen.default") {
    throw credentialError("Qwen 사용자 호출 출시 게이트가 닫혀 있어 활성화할 수 없습니다.", "QWEN_RUNTIME_NOT_READY", 409);
  }
  const environment = getPlatformCredentialEnvironment();
  const Model = await getPlatformCredentialModel();
  const target = await Model.findOne({
    environment,
    credentialKey: args.credentialKey,
    version: args.version,
    status: "pending",
  }).lean();
  if (!target) throw credentialError("활성화할 pending 버전을 찾을 수 없습니다.", "CREDENTIAL_PENDING_NOT_FOUND", 404);
  if (target.lastVerificationStatus !== "valid" || !target.lastVerifiedAt) {
    throw credentialError("검증에 성공한 버전만 활성화할 수 있습니다.", "CREDENTIAL_VERIFICATION_REQUIRED", 409);
  }

  const current = await Model.findOne({ environment, credentialKey: args.credentialKey, status: "active" }).lean();
  if (current) {
    await Model.updateOne(
      { _id: current._id, status: "active" },
      { $set: { status: "disabled", disabledAt: new Date(), updatedBy: args.actor } },
    );
  }

  try {
    const activated = await Model.updateOne(
      { _id: target._id, status: "pending" },
      { $set: { status: "active", activatedAt: new Date(), updatedBy: args.actor }, $unset: { disabledAt: 1 } },
    );
    if (!activated.modifiedCount) {
      throw credentialError("자격증명 활성화 충돌이 발생했습니다.", "CREDENTIAL_ACTIVATION_CONFLICT", 409);
    }
  } catch (error) {
    if (current) {
      await Model.updateOne(
        { _id: current._id, status: "disabled" },
        { $set: { status: "active", updatedBy: args.actor }, $unset: { disabledAt: 1 } },
      ).catch(() => undefined);
    }
    await appendAudit({
      ...args,
      action: "activate",
      previousVersion: current?.version,
      result: "failure",
      code: "ACTIVATION_FAILED",
    }).catch(() => undefined);
    throw error;
  }

  await appendAudit({
    ...args,
    action: "activate",
    previousVersion: current?.version,
    result: "success",
  });
  return { activeVersion: args.version, previousVersion: current?.version };
}

export async function disableActivePlatformCredential(args: AuditContext & { credentialKey: string }) {
  const Model = await getPlatformCredentialModel();
  const current = await Model.findOneAndUpdate(
    {
      environment: getPlatformCredentialEnvironment(),
      credentialKey: args.credentialKey,
      status: "active",
    },
    { $set: { status: "disabled", disabledAt: new Date(), updatedBy: args.actor } },
    { new: true },
  ).lean();
  if (!current) throw credentialError("활성 자격증명을 찾을 수 없습니다.", "CREDENTIAL_ACTIVE_NOT_FOUND", 404);
  await appendAudit({ ...args, action: "disable", version: current.version, result: "success" });
  return { disabledVersion: current.version };
}

export async function listPlatformCredentialStatuses(): Promise<PlatformCredentialStatusItem[]> {
  const environment = getPlatformCredentialEnvironment();
  const Model = await getPlatformCredentialModel();
  const documents = await Model.find({
    environment,
    credentialKey: { $in: PLATFORM_CREDENTIAL_DEFINITIONS.map((definition) => definition.key) },
  })
    .sort({ credentialKey: 1, version: -1 })
    .select({
      credentialKey: 1,
      version: 1,
      status: 1,
      configuredFields: 1,
      lastVerificationStatus: 1,
      lastVerificationCode: 1,
      lastVerifiedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .lean();
  const qwenLatest = await Model.findOne({ environment, credentialKey: "ai.qwen.default" })
    .sort({ version: -1 })
    .select("+encryptedPayload")
    .lean();
  const qwenMigrationEligibility = await resolveQwenMigrationEligibility(qwenLatest);

  return PLATFORM_CREDENTIAL_DEFINITIONS.map((definition) => {
    const versions = documents.filter((document) => document.credentialKey === definition.key);
    const isQwen = definition.key === "ai.qwen.default";
    const latest = isQwen ? qwenLatest || versions[0] : versions[0];
    const active = versions.find((document) => document.status === "active");
    return {
      credentialKey: definition.key,
      environment,
      activeVersion: active?.version,
      latestVersion: latest?.version,
      latestStatus: latest?.status,
      latestVerificationStatus: latest?.lastVerificationStatus,
      configuredFields: latest?.configuredFields || [],
      resetAt: latest?.createdAt?.toISOString(),
      updatedAt: latest?.updatedAt?.toISOString(),
      lastVerifiedAt: latest?.lastVerifiedAt?.toISOString(),
      lastVerificationCode: latest?.lastVerificationCode,
      ...(isQwen ? { qwenMigrationEligibility } : {}),
    };
  });
}
