import { getModel } from "libs/database/modelCache";
import { CredentialSchema } from "models/secure/CredentialSchema";
import type { ICredentialDocument } from "models/secure/CredentialSchema";
import type { CredentialProviderType } from "types/thirdparty/providers";
import { encryptSecret, decryptSecret } from "libs/server-utils/secure/SecureVault";
import { logger } from "utils/log";
import type { CredentialFormStateType } from "types/ui";
import { MONGODB_SECRETS_URL } from "consts/env/server";
import {
  pickLegacyGaMeasurementId,
  stripGaMeasurementIds,
} from "libs/marketing/analytics/gaMeasurementIdContract";

type CredentialStatusItem = {
  exists: boolean;
  ready?: boolean;
  missing?: string[];
  updatedAt?: string;
  extras?: Record<string, unknown>;
};

function toCredentialBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  return ["1", "true", "yes", "y", "on", "enabled"].includes(text);
}

function parseCredentialExtras(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

const CREDENTIAL_STATUS_EXTRA_FIELDS: Partial<Record<CredentialProviderType, string[]>> = {
  naver: ["storeId"],
  threads: ["username", "appId", "graphBaseUrl", "tokenIssuedAt", "tokenExpiresAt", "tokenRefreshDueAt", "lastRefreshStatus"],
  instagram: [
    "username",
    "appId",
    "graphBaseUrl",
    "authMode",
    "metaAppId",
    "instagramAppId",
    "tokenIssuedAt",
    "tokenExpiresAt",
    "tokenRefreshDueAt",
    "lastRefreshStatus",
    "lastValidatedAt",
    "lastValidationStatus",
    "validatedAccountId",
    "validatedUsername",
  ],
  linkedin: ["organizationId", "authorUrn", "profileSlug", "companySlug"],
  naver_blog: ["blogId", "categoryId"],
  naver_ads: ["customerId", "lastValidatedAt", "lastValidationStatus", "lastValidationCode", "lastValidationRequestId"],
  google_ads: ["customerId", "loginCustomerId", "lastValidatedAt", "lastValidationStatus", "lastValidationCode", "lastValidationRequestId"],
  google_analytics: ["enabled", "propertyId", "properties"],
  naver_datalab: ["enabled", "anchorKeyword"],
  slack: ["channel"],
  email: ["fromEmail", "replyTo"],
  agent: [
    "enabled",
    "allowedRoles",
    "allowIntelligenceRead",
    "allowIntelligenceWrite",
    "allowEnqueueContent",
    "allowPollWorker",
    "allowChannelAction",
    "allowStrategyWrite",
    "allowAdsRead",
  ],
};

function createDefaultCredentialStatus(): Record<CredentialProviderType, CredentialStatusItem> {
  return {
    naver: { exists: false },
    gitlab: { exists: false },
    threads: { exists: false },
    instagram: { exists: false },
    linkedin: { exists: false },
    naver_blog: { exists: false },
    naver_ads: { exists: false },
    google_ads: { exists: false },
    google_analytics: { exists: false },
    naver_datalab: { exists: false },
    slack: { exists: false },
    email: { exists: false },
    agent: { exists: false },
  };
}

function buildVisibleCredentialExtras(
  provider: CredentialProviderType,
  rawExtras: unknown,
): Record<string, unknown> | undefined {
  if (!rawExtras || typeof rawExtras !== "object") return undefined;
  const extras = rawExtras as Record<string, unknown>;

  if (provider === "gitlab") {
    const normalized: Record<string, unknown> = {};

    if (extras.baseUrl) normalized.baseUrl = String(extras.baseUrl);
    if (extras.defaultBranch) normalized.defaultBranch = String(extras.defaultBranch);
    if (extras.defaultProjectKey) normalized.defaultProjectKey = String(extras.defaultProjectKey);
    if (extras.projectId) normalized.projectId = String(extras.projectId);

    type GitlabProjectInput = { key?: unknown; projectId?: unknown; baseUrl?: unknown; defaultBranch?: unknown };
    const rawProjects: GitlabProjectInput[] = Array.isArray(extras.projects)
      ? (extras.projects as GitlabProjectInput[])
      : [];
    const projects = rawProjects
      .map((p) => ({
        key: p?.key ? String(p.key) : "",
        projectId: p?.projectId ? String(p.projectId) : "",
        baseUrl: p?.baseUrl ? String(p.baseUrl) : undefined,
        defaultBranch: p?.defaultBranch ? String(p.defaultBranch) : undefined,
      }))
      .filter((p) => p.key && p.projectId);

    if (projects.length > 0) {
      normalized.projects = projects;
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  if (provider === "agent") {
    const toBool = (value: unknown, fallback = false) => {
      if (typeof value === "boolean") return value;
      const text = String(value ?? "").trim().toLowerCase();
      if (!text) return fallback;
      return ["1", "true", "yes", "y", "on", "enabled"].includes(text);
    };
    const toStringArray = (value: unknown) =>
      Array.from(
        new Set(
          (Array.isArray(value) ? value : String(value || "").split(","))
            .map((item: unknown) => String(item || "").trim())
            .filter(Boolean),
        ),
      );

    const normalized: Record<string, unknown> = {
      enabled: toBool(extras.enabled, false),
      allowedRoles: toStringArray(extras.allowedRoles),
      allowIntelligenceRead: toBool(extras.allowIntelligenceRead, true),
      allowIntelligenceWrite: toBool(extras.allowIntelligenceWrite, false),
      allowEnqueueContent: toBool(extras.allowEnqueueContent, true),
      allowPollWorker: toBool(extras.allowPollWorker, true),
      allowChannelAction: toBool(extras.allowChannelAction, true),
      allowStrategyWrite: toBool(extras.allowStrategyWrite, true),
      allowAdsRead: toBool(extras.allowAdsRead, false),
    };

    return normalized;
  }

  if (provider === "google_analytics" || provider === "naver_datalab") {
    const toBool = (value: unknown, fallback = false) => {
      if (typeof value === "boolean") return value;
      const text = String(value ?? "").trim().toLowerCase();
      if (!text) return fallback;
      return ["1", "true", "yes", "y", "on", "enabled"].includes(text);
    };

    const normalized: Record<string, unknown> = {
      enabled: toBool(extras.enabled, false),
    };

    if (provider === "google_analytics") {
      const propertyId = String(extras.propertyId ?? "").trim();
      if (propertyId) normalized.propertyId = propertyId;
      // Measurement ID는 유니버스 마케팅 설정에서 관리하므로 자격증명 상태에는 노출하지 않는다.
      const properties = Array.isArray(extras.properties)
        ? extras.properties
            .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
            .filter(Boolean)
            .map((entry) => ({
              propertyId: String(entry?.propertyId ?? "").trim(),
              propertyKey: String(entry?.propertyKey ?? "").trim(),
              role: String(entry?.role ?? "").trim(),
              label: String(entry?.label ?? "").trim(),
            }))
            .filter((entry) => entry.propertyId)
        : [];
      if (properties.length > 0) normalized.properties = properties;
    } else {
      const anchorKeyword = String(extras.anchorKeyword ?? "").trim();
      if (anchorKeyword) normalized.anchorKeyword = anchorKeyword;
    }

    return normalized;
  }

  const allowedKeys = CREDENTIAL_STATUS_EXTRA_FIELDS[provider] ?? [];
  const normalized: Record<string, unknown> = {};

  allowedKeys.forEach((key) => {
    const value = extras[key];
    if (value === undefined || value === null) return;

    const nextValue = String(value).trim();
    if (!nextValue) return;

    normalized[key] = nextValue;
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get, upsert 작업  DB 조회/저장 수행
 * @domain secure
 * @scope server
 */

async function getCredentialModel() {
  return await getModel<ICredentialDocument>(MONGODB_SECRETS_URL, "Credential", CredentialSchema, "credentials");
}

/** 저장(업서트) - 평문을 받아 암호문으로 저장 */
export async function upsertCredential(args: {
  universeId: string;
  provider: CredentialProviderType;
  clientId?: string;
  clientSecret?: string;
  actor?: string; // 이메일
  actorIp?: string;
  requestId?: string;
  extras?: Record<string, unknown> | null;
}) {
  const M = await getCredentialModel();

  // 기존 문서 존재 여부 확인
  const existing = await M.findOne({ universeId: args.universeId, provider: args.provider }).lean();

  type CredentialUpdateSet = {
    updatedBy?: string;
    clientIdEnc?: string;
    clientSecretEnc?: string;
    extras?: Record<string, unknown>;
  };
  const set: CredentialUpdateSet = {
    updatedBy: args.actor,
  };

  const hasClientIdInput = typeof args.clientId === "string" && args.clientId.trim().length > 0;
  const hasClientSecretInput = typeof args.clientSecret === "string" && args.clientSecret.trim().length > 0;

  // 신규 생성인데 clientId / clientSecret 누락된 경우는 명시적 에러 처리
  if (!existing) {
    if (!hasClientIdInput || !hasClientSecretInput) {
      const missing: string[] = [];
      if (!hasClientIdInput) missing.push("clientId");
      if (!hasClientSecretInput) missing.push("clientSecret");

      const err = new Error(`CREDENTIAL_REQUIRED: 신규 저장 시 ${missing.join(", ")}는(은) 필수입니다.`);
      (err as Error & { errorCode?: string }).errorCode = "CREDENTIAL_REQUIRED";
      throw err;
    }
  }

  // 넘어온 값이 있을 때만 암호화해서 세팅 → 공란이면 기존 값 유지
  if (hasClientIdInput) {
    set.clientIdEnc = encryptSecret(args.clientId!.trim());
  }

  if (hasClientSecretInput) {
    set.clientSecretEnc = encryptSecret(args.clientSecret!.trim());
  }

  // 신규인데 둘 다 최종적으로 비어 있다면 한 번 더 방어
  if (!existing && (!set.clientIdEnc || !set.clientSecretEnc)) {
    const err = new Error("CREDENTIAL_REQUIRED: 신규 저장 시 clientId/clientSecret는(은) 필수입니다.");
    (err as Error & { errorCode?: string }).errorCode = "CREDENTIAL_REQUIRED";
    throw err;
  }

  // extras가 "명시적으로" 들어온 경우에만 교체 (초기화 포함)
  if (typeof args.extras !== "undefined") {
    set.extras = args.extras && Object.keys(args.extras).length > 0 ? args.extras : {};
  }

  const changedFields = [
    ...(hasClientIdInput ? ["clientId"] : []),
    ...(hasClientSecretInput ? ["clientSecret"] : []),
    ...(typeof args.extras !== "undefined" ? ["extras"] : []),
  ];

  const doc = await M.findOneAndUpdate(
    { universeId: args.universeId, provider: args.provider },
    {
      $set: set,
      $setOnInsert: { createdBy: args.actor },
      $push: {
        auditEvents: {
          $each: [
            {
              action: existing ? "update" : "create",
              actor: args.actor,
              actorIp: args.actorIp,
              requestId: args.requestId,
              changedFields,
              at: new Date(),
            },
          ],
          $slice: -30,
        },
      },
    },
    { upsert: true, new: true, lean: true },
  );

  logger.info("[Credential] upsert ok", {
    universeId: args.universeId,
    provider: args.provider,
    actor: args.actor,
    changedFields,
  });
  return doc;
}

/** 서버 내부 사용 - 복호화된 평문 반환 (절대 클라이언트 반환 금지!) */
export async function getDecryptedCredential(
  universeId: string,
  provider: CredentialProviderType,
): Promise<CredentialFormStateType | null> {
  const M = await getCredentialModel();
  const doc = await M.findOne({ universeId, provider }).lean();
  if (!doc) return null;
  let extras: Record<string, unknown> = {};
  try {
    const docExtras = (doc as { extras?: unknown }).extras;
    if (typeof docExtras === "string") {
      extras = JSON.parse(docExtras) as Record<string, unknown>;
    } else if (docExtras && typeof docExtras === "object") {
      extras = docExtras as Record<string, unknown>;
    }
  } catch {}
  return {
    clientId: decryptSecret(doc.clientIdEnc),
    clientSecret: decryptSecret(doc.clientSecretEnc),
    extras,
  };
}

export async function listLegacyGaMeasurementSettings() {
  const M = await getCredentialModel();
  const rows = await M.find({ provider: "google_analytics" })
    .select({ universeId: 1, extras: 1, _id: 0 })
    .lean();

  return rows.flatMap((row) => {
    const extras = parseCredentialExtras(row.extras);
    const measurementId = pickLegacyGaMeasurementId(extras);
    if (!measurementId) return [];
    return [{
      universeId: String(row.universeId || "").trim(),
      measurementId,
      trackingEnabled: toCredentialBool(extras.enabled, true),
    }];
  }).filter((entry) => entry.universeId);
}

export async function removeLegacyGaMeasurementIds(universeId: string, actor = "ga-measurement-migration") {
  const M = await getCredentialModel();
  const row = await M.findOne({ universeId, provider: "google_analytics" })
    .select({ extras: 1 })
    .lean();
  if (!row) return { updated: false };

  const extras = parseCredentialExtras(row.extras);
  const sanitized = stripGaMeasurementIds(extras);
  if (JSON.stringify(sanitized) === JSON.stringify(extras)) return { updated: false };
  await M.updateOne(
    { universeId, provider: "google_analytics" },
    {
      $set: { extras: sanitized, updatedBy: actor },
      $push: {
        auditEvents: {
          $each: [
            {
              action: "update",
              actor,
              changedFields: ["extras.measurementId", "extras.properties.measurementId"],
              at: new Date(),
            },
          ],
          $slice: -30,
        },
      },
    },
  );
  return { updated: true };
}

/** 상태 조회(클라이언트 노출용) - 값은 숨기고 존재 여부, 수정시각만 반환 */
export async function getCredentialStatus(universeId: string) {
  const status = createDefaultCredentialStatus();

  const M = await getCredentialModel();
  const list = await M.find({ universeId }).select({ provider: 1, clientIdEnc: 1, clientSecretEnc: 1, updatedAt: 1, extras: 1, _id: 0 }).lean();

  list.forEach((d) => {
    const provider = d.provider as CredentialProviderType;
    const visibleExtras = buildVisibleCredentialExtras(provider, (d as { extras?: unknown }).extras);
    const missing: string[] = [];
    const hasEncryptedClientId = Boolean((d as { clientIdEnc?: unknown }).clientIdEnc);
    const hasEncryptedClientSecret = Boolean((d as { clientSecretEnc?: unknown }).clientSecretEnc);

    if (!hasEncryptedClientId) missing.push("clientId");
    if (!hasEncryptedClientSecret) missing.push("clientSecret");

    if (provider === "google_analytics") {
      const properties = Array.isArray(visibleExtras?.properties) ? visibleExtras.properties : [];
      if (!toCredentialBool(visibleExtras?.enabled, false)) missing.push("enabled");
      if (!String(visibleExtras?.propertyId || "").trim() && properties.length === 0) missing.push("propertyId");
    } else if (provider === "naver_datalab") {
      if (!toCredentialBool(visibleExtras?.enabled, false)) missing.push("enabled");
    } else if (provider === "naver_ads") {
      if (!String(visibleExtras?.customerId || "").trim()) missing.push("customerId");
    } else if (provider === "google_ads") {
      if (!String(visibleExtras?.customerId || "").trim()) missing.push("customerId");
      // anchorKeyword는 키워드 전략 설정(marketing keyword settings)으로 이관 — readiness 요건에서 제외 (extras 값은 legacy fallback으로만 유지)
    }

    const ready = missing.length === 0;
    const base: CredentialStatusItem = {
      exists: true,
      ready,
      updatedAt: d.updatedAt?.toISOString(),
    };

    if (visibleExtras) {
      base.extras = visibleExtras;
    }
    if (missing.length > 0) {
      base.missing = missing;
    }

    status[provider] = base;
  });

  return status;
}
