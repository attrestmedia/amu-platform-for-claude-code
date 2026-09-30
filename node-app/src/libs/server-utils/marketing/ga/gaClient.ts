import "server-only";
import crypto from "crypto";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { hasOAuthConnectionHistory } from "libs/database/secure/oauthConnections";
import { resolveMarketingOAuthAccess } from "libs/marketing/auth/marketingOAuthResolver";
import { getUniverseMarketingAnalyticsSettings } from "libs/database/universe";
import { resolveGaReportingTargets } from "libs/marketing/analytics/gaReportingTargetsContract";

/**
 * @docHint
 * @purpose GA4 Data API 인증 클라이언트 — 자격증명 패널(google_analytics slot) 기반 연결 해석
 * @process credential 복호화 → 서비스 계정 client_email/private_key 추출 → BetaAnalyticsDataClient 캐시 반환
 * @domain marketing
 * @scope server
 */

export type GaConnection = {
  universeId: string;
  enabled: boolean;
  propertyId: string; // primary property, "properties/123456789"
  properties: GaPropertyConfig[];
  clientEmail: string;
  privateKey: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthRefreshToken?: string;
};

export type GaPropertyConfig = {
  propertyId: string; // "properties/123456789"
  rawPropertyId: string; // "123456789"
  propertyKey: string; // stable rollup key, e.g. "app" | "magazine"
  role: string;
  label?: string;
};

const clientCache = new Map<string, BetaAnalyticsDataClient>();

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enabled"].includes(text);
}

function normalizePropertyId(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^properties\//, "")
    .replace(/[^\d]/g, "");
}

function normalizePropertyKey(value: unknown, fallback: string) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || fallback;
}

function uniquePropertyKey(value: string, used: Set<string>) {
  let key = value;
  let suffix = 2;
  while (used.has(key)) {
    key = `${value}_${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

function parsePropertiesInput(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveGaPropertyConfigs(extras: Record<string, unknown> = {}): GaPropertyConfig[] {
  const properties: GaPropertyConfig[] = [];
  const usedPropertyKeys = new Set<string>();

  parsePropertiesInput(extras.properties).forEach((entry, index) => {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : { propertyId: entry };
    const rawPropertyId = normalizePropertyId(record.propertyId);
    if (!rawPropertyId) return;
    const role = normalizePropertyKey(record.role, `property_${index + 1}`);
    const propertyKey = uniquePropertyKey(normalizePropertyKey(record.propertyKey, role || rawPropertyId), usedPropertyKeys);
    properties.push({
      propertyId: `properties/${rawPropertyId}`,
      rawPropertyId,
      propertyKey,
      role,
      label: String(record.label ?? "").trim() || undefined,
    });
  });

  const legacyPropertyId = normalizePropertyId(extras.propertyId);
  const alreadyIncluded = properties.some((property) => property.rawPropertyId === legacyPropertyId);
  if (legacyPropertyId && !alreadyIncluded) {
    const role = normalizePropertyKey(extras.role, "default");
    properties.unshift({
      propertyId: `properties/${legacyPropertyId}`,
      rawPropertyId: legacyPropertyId,
      propertyKey: uniquePropertyKey(normalizePropertyKey(extras.propertyKey || extras.role, role), usedPropertyKeys),
      role,
      label: String(extras.label ?? "").trim() || undefined,
    });
  }

  return properties;
}

/**
 * clientSecret에는 서비스 계정 키 JSON 전체를 권장하지만,
 * private_key 단독 문자열(clientId=서비스 계정 이메일)도 허용한다.
 */
function parseServiceAccountSecret(clientId: string, clientSecret: string) {
  const secret = clientSecret.trim();
  if (secret.startsWith("{")) {
    try {
      const parsed = JSON.parse(secret) as { client_email?: string; private_key?: string };
      const clientEmail = String(parsed.client_email || clientId || "").trim();
      const privateKey = String(parsed.private_key || "").trim();
      if (clientEmail && privateKey) return { clientEmail, privateKey };
    } catch {
      // JSON 파싱 실패 시 아래 raw private key 경로로 진행
    }
  }
  const clientEmail = String(clientId || "").trim();
  // 붙여넣기 과정에서 이스케이프된 개행("\n")을 실제 개행으로 복원
  const privateKey = secret.replace(/\\n/g, "\n");
  if (clientEmail && privateKey.includes("PRIVATE KEY")) return { clientEmail, privateKey };
  return null;
}

/** google_analytics 자격증명 슬롯에서 GA 연결을 해석한다. 미설정/파싱 실패는 null. */
export async function resolveGaConnection(universeId: string): Promise<GaConnection | null> {
  const oauth = await resolveMarketingOAuthAccess({ universeId, provider: "google_analytics" });
  if (oauth?.selectedResourceId) {
    if (!oauth.refreshToken) return null;
    const settings = await getUniverseMarketingAnalyticsSettings(universeId);
    const targets = resolveGaReportingTargets({
      universeId,
      configuredTargets: settings?.reportingTargets,
      selectedResourceId: oauth.selectedResourceId,
      selectedResourceName: oauth.selectedResourceName,
    });
    const properties: GaPropertyConfig[] = targets.map((target) => ({
      propertyId: `properties/${target.propertyId}`,
      rawPropertyId: target.propertyId,
      propertyKey: target.propertyKey,
      role: target.role,
      label: target.label || undefined,
    }));
    const primary = targets.find((target) => target.primary) || targets[0];
    if (!properties.length || !primary) return null;
    return {
      universeId,
      enabled: true,
      propertyId: `properties/${primary.propertyId}`,
      properties,
      clientEmail: "",
      privateKey: "",
      oauthClientId: oauth.appCredential.clientId,
      oauthClientSecret: oauth.appCredential.clientSecret,
      oauthRefreshToken: oauth.refreshToken,
    };
  }
  if (await hasOAuthConnectionHistory({ ownerType: "universe", ownerId: universeId, provider: "google_analytics" })) {
    return null;
  }

  const credential = await getDecryptedCredential(universeId, "google_analytics");
  if (!credential) return null;

  const extras = credential.extras || {};
  const properties = resolveGaPropertyConfigs(extras);
  const parsed = parseServiceAccountSecret(credential.clientId, credential.clientSecret);
  if (properties.length === 0 || !parsed) return null;

  return {
    universeId,
    enabled: toBool(extras.enabled),
    propertyId: properties[0].propertyId,
    properties,
    clientEmail: parsed.clientEmail,
    privateKey: parsed.privateKey,
  };
}

export function getGaDataClient(
  connection: Pick<
    GaConnection,
    "clientEmail" | "privateKey" | "oauthClientId" | "oauthClientSecret" | "oauthRefreshToken"
  >,
) {
  const credentialFingerprint = connection.oauthRefreshToken
    ? `${connection.oauthClientId}:${connection.oauthRefreshToken}`
    : `${connection.clientEmail}:${connection.privateKey}`;
  const credentialHash = crypto.createHash("sha1").update(credentialFingerprint).digest("hex").slice(0, 12);
  const cacheKey = `${connection.oauthRefreshToken ? "oauth" : "service"}:${credentialHash}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const client = new BetaAnalyticsDataClient({
    credentials: connection.oauthRefreshToken
      ? {
          type: "authorized_user",
          client_id: connection.oauthClientId,
          client_secret: connection.oauthClientSecret,
          refresh_token: connection.oauthRefreshToken,
        }
      : {
          client_email: connection.clientEmail,
          private_key: connection.privateKey,
        },
    // gRPC(HTTP/2) 채널 대신 REST(JSON over HTTP/1.1) 전송을 사용한다.
    // grpc-js proto 디스크립터 로딩의 메모리 스파이크와 Node http2 경로를 회피
    // (운영 collect_ga_snapshots 502 — 프로세스/전송 계층 이슈 대응)
    fallback: "rest",
  });
  clientCache.set(cacheKey, client);
  return client;
}
