import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getDecryptedCredential, upsertCredential, getCredentialStatus } from "libs/database/secure/credentials";
import { InstagramGraphClient } from "libs/api/thirdparty/instagram/instagramClient";
import {
  getInstagramAccountIdentityFields,
  resolveInstagramAccountIdentity,
} from "libs/api/thirdparty/instagram/instagramIdentity";
import { resolveInstagramAuthMode } from "consts/thirdparty/instagram";
import { logger } from "utils/log";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { CredentialProviderEnums } from "types/thirdparty/providers";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import {
  getUniverseMarketingAnalyticsSettings,
  updateUniverseMarketingAnalyticsSettings,
} from "libs/database/universe";
import { pickLegacyGaMeasurementId } from "libs/marketing/analytics/gaMeasurementIdContract";

import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common";
/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / credentials) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain credentials
 * @scope universe
 */

// Node 전용 + 항상 동적 실행(정적 경로 생성 시도 방지)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CREDENTIAL_EXTRA_FIELD_MAP: Record<string, string[]> = {
  instagram: [
    "username",
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
  naver_ads: ["customerId"],
  google_ads: ["customerId", "loginCustomerId"],
  email: ["fromEmail", "replyTo"],
};

const ADMIN_ONLY_CREDENTIAL_PROVIDERS = new Set([
  "email",
  "instagram",
  "naver_ads",
  "google_ads",
  "google_analytics",
  "naver_datalab",
  "agent",
]);

const AGENT_ALLOWED_ROLES = new Set(["administrator", "editor", "author", "contributor", "subscriber"]);

function pickCredentialExtras(rawExtras: unknown, fields: string[]) {
  const payloadExtras: Record<string, string> = {};
  const record = toUnknownRecord(rawExtras);

  fields.forEach((field) => {
    const value = normalizeString(record[field]);
    if (value) payloadExtras[field] = value;
  });

  return Object.keys(payloadExtras).length > 0 ? payloadExtras : {};
}

function toBool(raw: unknown, fallback = false) {
  if (typeof raw === "boolean") return raw;
  const value = normalizeString(raw).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "y", "on", "enabled"].includes(value);
}

function toStringArray(raw: unknown, maxItems = 10) {
  return Array.from(
    new Set(
      (Array.isArray(raw) ? raw : String(raw || "").split(","))
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, maxItems);
}

function normalizeGaPropertyId(raw: unknown) {
  return normalizeString(raw).replace(/^properties\//, "").replace(/[^\d]/g, "");
}

function normalizeGaPropertyKey(raw: unknown, fallback: string) {
  const key = normalizeString(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || fallback;
}

function uniqueGaPropertyKey(value: string, used: Set<string>) {
  let key = value;
  let suffix = 2;
  while (used.has(key)) {
    key = `${value}_${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

function parseGaPropertiesInput(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeGaProperties(raw: unknown) {
  const usedPropertyKeys = new Set<string>();
  return parseGaPropertiesInput(raw)
    .map((entry, index) => {
      const record = toUnknownRecord(entry);
      const propertyId = normalizeGaPropertyId(record.propertyId || entry);
      if (!propertyId) return null;
      const role = normalizeGaPropertyKey(record.role, `property_${index + 1}`);
      const propertyKey = uniqueGaPropertyKey(normalizeGaPropertyKey(record.propertyKey, role || propertyId), usedPropertyKeys);
      return {
        propertyId,
        propertyKey,
        role,
        ...(normalizeString(record.label) ? { label: normalizeString(record.label) } : {}),
      };
    })
    .filter((entry): entry is { propertyId: string; propertyKey: string; role: string; label?: string } =>
      Boolean(entry),
    );
}

export const GET = withAuth(
  async (_data, user, request, { params }: { params: Promise<{ universeId: string }> }) => {
    const { universeId } = await params;
    try {
      const status = await getCredentialStatus(universeId);
      if (!user?.roles?.includes("administrator")) {
        ADMIN_ONLY_CREDENTIAL_PROVIDERS.forEach((provider) => {
          if (provider in status) {
            status[provider as keyof typeof status] = { exists: false };
          }
        });
      }
      return NextResponse.json({ success: true, data: status });
    } catch (e) {
      logger.error("[Credentials] status error", e);
      return NextResponse.json({ success: false, message: "상태 조회 실패" }, { status: 500 });
    }
  },
  undefined,
  "universe_credentials_status",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true }, bodyParser: "none" },
);

export const POST = withAuth(
  async (data, user, request, { params }: { params: Promise<{ universeId: string }> }) => {
    const { universeId } = await params;
    try {
      const { provider, clientId, clientSecret, extras } = data || {};
      if (!provider) {
        return NextResponse.json({ success: false, message: "provider가 필요합니다." }, { status: 400 });
      }
      if (!CredentialProviderEnums.includes(provider)) {
        return NextResponse.json({ success: false, message: "지원하지 않는 provider입니다." }, { status: 400 });
      }
      if (ADMIN_ONLY_CREDENTIAL_PROVIDERS.has(provider) && !user?.roles?.includes("administrator")) {
        return NextResponse.json({ success: false, message: "통합 어드민만 설정할 수 있는 provider입니다." }, { status: 403 });
      }

      let nextExtras: Record<string, unknown> | null | undefined = undefined;

      if (provider === "naver" && "extras" in (data ?? {})) {
        const raw = String(extras?.storeId ?? "").trim();
        nextExtras = raw ? { storeId: raw } : {};
      } else if (provider === "gitlab" && "extras" in (data ?? {})) {
        const rawExtras = toUnknownRecord(extras);

        const baseUrl = String(rawExtras.baseUrl ?? "").trim();
        const defaultBranch = String(rawExtras.defaultBranch ?? "").trim();
        const defaultProjectKey = String(rawExtras.defaultProjectKey ?? "").trim();

        const projects: UnknownRecord[] = [];

        if (Array.isArray(rawExtras.projects)) {
          rawExtras.projects.forEach((entry) => {
            const p = toUnknownRecord(entry);
            const key = String(p.key ?? "").trim();
            const projectId = String(p.projectId ?? "").trim();
            if (!key || !projectId) return;

            const pBaseUrl = String(p.baseUrl ?? "").trim();
            const pBranch = String(p.defaultBranch ?? "").trim();

            projects.push({
              key,
              projectId,
              ...(pBaseUrl ? { baseUrl: pBaseUrl } : {}),
              ...(pBranch ? { defaultBranch: pBranch } : {}),
            });
          });
        }

        const payloadExtras: Record<string, unknown> = {};
        if (baseUrl) payloadExtras.baseUrl = baseUrl;
        if (defaultBranch) payloadExtras.defaultBranch = defaultBranch;
        if (defaultProjectKey) payloadExtras.defaultProjectKey = defaultProjectKey;
        if (projects.length) payloadExtras.projects = projects;

        nextExtras = Object.keys(payloadExtras).length > 0 ? payloadExtras : {};
      } else if (provider === "threads" && "extras" in (data ?? {})) {
        const rawExtras = toUnknownRecord(extras);

        const username = String(rawExtras.username ?? "")
          .trim()
          .toLowerCase();
        const appId = String(rawExtras.appId ?? "").trim();
        const graphBaseUrl = String(rawExtras.graphBaseUrl ?? "")
          .trim()
          .replace(/\/+$/, "");
        const tokenIssuedAt = normalizeString(rawExtras.tokenIssuedAt);
        const tokenExpiresAt = normalizeString(rawExtras.tokenExpiresAt);
        const tokenRefreshDueAt = normalizeString(rawExtras.tokenRefreshDueAt);
        const lastRefreshStatus = normalizeString(rawExtras.lastRefreshStatus);

        const payloadExtras: Record<string, unknown> = {};
        if (username) payloadExtras.username = username;
        if (appId) payloadExtras.appId = appId;
        if (graphBaseUrl) payloadExtras.graphBaseUrl = graphBaseUrl;
        if (tokenIssuedAt) payloadExtras.tokenIssuedAt = tokenIssuedAt;
        if (tokenExpiresAt) payloadExtras.tokenExpiresAt = tokenExpiresAt;
        if (tokenRefreshDueAt) payloadExtras.tokenRefreshDueAt = tokenRefreshDueAt;
        if (lastRefreshStatus) payloadExtras.lastRefreshStatus = lastRefreshStatus;

        nextExtras = Object.keys(payloadExtras).length > 0 ? payloadExtras : {};
      } else if (provider === "instagram") {
        const rawExtras = toUnknownRecord(extras);
        const existingCredential = await getDecryptedCredential(universeId, "instagram");
        const existingExtras = toUnknownRecord(existingCredential?.extras);
        const instagramUserId = normalizeString(clientId) || normalizeString(existingCredential?.clientId);
        const accessToken = normalizeString(clientSecret) || normalizeString(existingCredential?.clientSecret);
        const authMode = resolveInstagramAuthMode(
          rawExtras.authMode || existingExtras.authMode,
          rawExtras.graphBaseUrl || existingExtras.graphBaseUrl,
        );

        if (!/^\d+$/.test(instagramUserId)) {
          return NextResponse.json(
            { success: false, errorCode: "INSTAGRAM_USER_ID_INVALID", message: "Instagram User ID는 숫자 ID여야 합니다." },
            { status: 400 },
          );
        }
        if (!accessToken || /\s/.test(accessToken) || /^Bearer\s+/i.test(accessToken) || /^[{\["']/.test(accessToken)) {
          return NextResponse.json(
            {
              success: false,
              errorCode: "INSTAGRAM_ACCESS_TOKEN_INVALID",
              message: "Access Token에는 token 원문만 입력해야 하며 공백, Bearer 접두사, JSON 또는 따옴표를 포함할 수 없습니다.",
            },
            { status: 400 },
          );
        }

        let account: Record<string, unknown>;
        try {
          const client = new InstagramGraphClient({ authMode });
          account = await client.getAccountFields({
            instagramUserId,
            accessToken,
            fields: getInstagramAccountIdentityFields(authMode),
          });
        } catch (error) {
          const message = normalizeString(error instanceof Error ? error.message : "");
          return NextResponse.json(
            {
              success: false,
              errorCode: "INSTAGRAM_CREDENTIAL_VALIDATION_FAILED",
              message: `Instagram 계정 검증에 실패했습니다.${message ? ` ${message}` : ""}`,
            },
            { status: 409 },
          );
        }

        const identity = resolveInstagramAccountIdentity(account, authMode);
        const validatedAccountId = identity.accountId;
        const validatedUsername = identity.username.toLowerCase();
        const expectedUsername = normalizeString(rawExtras.username || existingExtras.username).toLowerCase();
        if (validatedAccountId !== instagramUserId || (expectedUsername && expectedUsername !== validatedUsername)) {
          return NextResponse.json(
            {
              success: false,
              errorCode: "INSTAGRAM_CREDENTIAL_ACCOUNT_MISMATCH",
              message: "Access Token으로 확인한 Instagram 계정이 입력한 ID 또는 사용자명과 일치하지 않습니다.",
            },
            { status: 409 },
          );
        }

        const metaAppId = normalizeString(rawExtras.metaAppId || rawExtras.appId || existingExtras.metaAppId || existingExtras.appId);
        const instagramAppId = normalizeString(rawExtras.instagramAppId || existingExtras.instagramAppId);
        const tokenIssuedAt = normalizeString(rawExtras.tokenIssuedAt || existingExtras.tokenIssuedAt);
        const tokenExpiresAt = normalizeString(rawExtras.tokenExpiresAt || existingExtras.tokenExpiresAt);
        const tokenRefreshDueAt = normalizeString(rawExtras.tokenRefreshDueAt || existingExtras.tokenRefreshDueAt);
        const lastRefreshStatus = normalizeString(rawExtras.lastRefreshStatus || existingExtras.lastRefreshStatus);

        nextExtras = {
          authMode,
          username: validatedUsername,
          ...(metaAppId ? { metaAppId } : {}),
          ...(instagramAppId ? { instagramAppId } : {}),
          ...(tokenIssuedAt ? { tokenIssuedAt } : {}),
          ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
          ...(tokenRefreshDueAt ? { tokenRefreshDueAt } : {}),
          ...(lastRefreshStatus ? { lastRefreshStatus } : {}),
          lastValidatedAt: new Date().toISOString(),
          lastValidationStatus: "success",
          validatedAccountId,
          validatedUsername,
        };
      } else if (provider === "slack" && "extras" in (data ?? {})) {
        const rawExtras = toUnknownRecord(extras);
        const channel = String(rawExtras.channel ?? "").trim();
        nextExtras = channel ? { channel } : {};
      } else if (provider === "google_analytics" && "extras" in (data ?? {})) {
        const rawExtras = toUnknownRecord(extras);
        const propertyId = normalizeGaPropertyId(rawExtras.propertyId);
        const properties = normalizeGaProperties(rawExtras.properties);
        const legacyCredential = await getDecryptedCredential(universeId, "google_analytics");
        const legacyExtras = toUnknownRecord(legacyCredential?.extras);
        const legacyMeasurementId = pickLegacyGaMeasurementId(legacyExtras);
        const universeAnalytics = await getUniverseMarketingAnalyticsSettings(universeId);
        if (legacyMeasurementId && universeAnalytics && !universeAnalytics.measurementId) {
          await updateUniverseMarketingAnalyticsSettings({
            universeId,
            measurementId: legacyMeasurementId,
            trackingEnabled: toBool(rawExtras.enabled, toBool(legacyExtras.enabled, true)),
          });
        }
        nextExtras = {
          enabled: toBool(rawExtras.enabled, false),
          ...(propertyId ? { propertyId } : {}),
          ...(properties.length > 0 ? { properties } : {}),
        };
      } else if (provider === "naver_datalab" && "extras" in (data ?? {})) {
        const rawExtras = toUnknownRecord(extras);
        // 기본 앵커 키워드는 키워드 전략 설정(marketing keyword settings)에서 관리한다.
        // extras.anchorKeyword는 legacy fallback 값이 전달된 경우에만 보존하고, 기본값을 새로 주입하지 않는다.
        const anchorKeyword = normalizeString(rawExtras.anchorKeyword);
        nextExtras = {
          enabled: toBool(rawExtras.enabled, false),
          ...(anchorKeyword ? { anchorKeyword } : {}),
        };
      } else if (provider === "agent" && "extras" in (data ?? {})) {
        const rawExtras = toUnknownRecord(extras);
        const allowedRoles = toStringArray(rawExtras.allowedRoles).filter((role) => AGENT_ALLOWED_ROLES.has(role));
        nextExtras = {
          enabled: toBool(rawExtras.enabled, false),
          allowedRoles: allowedRoles.length > 0 ? allowedRoles : ["administrator"],
          allowIntelligenceRead: toBool(rawExtras.allowIntelligenceRead, true),
          allowIntelligenceWrite: toBool(rawExtras.allowIntelligenceWrite, false),
          allowEnqueueContent: toBool(rawExtras.allowEnqueueContent, true),
          allowPollWorker: toBool(rawExtras.allowPollWorker, true),
          allowChannelAction: toBool(rawExtras.allowChannelAction, true),
          allowStrategyWrite: toBool(rawExtras.allowStrategyWrite, true),
          allowAdsRead: toBool(rawExtras.allowAdsRead, false),
        };
      } else if (provider in CREDENTIAL_EXTRA_FIELD_MAP && "extras" in (data ?? {})) {
        nextExtras = pickCredentialExtras(extras, CREDENTIAL_EXTRA_FIELD_MAP[provider]);
      }

      const payload: Parameters<typeof upsertCredential>[0] = {
        universeId,
        provider,
        actor: user?.userEmail || user?.userEmailLower,
        actorIp: request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || undefined,
        requestId: request.headers.get("x-request-id") || undefined,
      };

      // 공란이면 기존 값 유지 → upsertCredential에서 알아서 처리
      if (typeof clientId === "string" && clientId.trim()) {
        payload.clientId = clientId.trim();
      }
      if (typeof clientSecret === "string" && clientSecret.trim()) {
        payload.clientSecret = clientSecret.trim();
      }

      if (provider === "agent") {
        payload.clientId ||= "agent-marketing-permission";
        payload.clientSecret ||= "agent-marketing-permission";
      }

      if (typeof nextExtras !== "undefined") {
        payload.extras = nextExtras; // 정의된 경우에만 붙임
      }

      await upsertCredential(payload);
      await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId));
      await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeId));
      return NextResponse.json({ success: true });
    } catch (e) {
      const errLike = toErrorLike(e);
      logger.error("[Credentials] upsert error", e);

      // 신규 저장 시 필드 누락 등 명시적 에러 처리
      if (errLike.errorCode === "CREDENTIAL_REQUIRED" || String(errLike.message || "").startsWith("CREDENTIAL_REQUIRED:")) {
        const msg =
          String(errLike.message || "").replace(/^CREDENTIAL_REQUIRED:\s*/, "") ||
          "신규 저장 시 clientId/clientSecret는(은) 필수입니다.";
        return NextResponse.json({ success: false, message: msg }, { status: 400 });
      }

      return NextResponse.json({ success: false, message: "저장 실패" }, { status: 500 });
    }
  },
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "universe_credentials_upsert",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
