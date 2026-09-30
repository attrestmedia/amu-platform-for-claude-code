import "server-only";

import { listMarketingOAuthResources } from "libs/marketing/auth/oauthProviderLifecycle";
import { resolveMarketingOAuthAccess } from "libs/marketing/auth/marketingOAuthResolver";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import {
  gaAdminUrl,
  gaSectionArray,
  getGaAdminSection,
  getGaObservedEvents,
  listGaAdminSection,
  type GaAuditSection,
  type GaObservedEvents,
} from "./gaConfigurationAuditClient";
import { buildGaMarketingReadiness } from "./gaConfigurationReadiness";
import { getUniverseMarketingAnalyticsSettings } from "libs/database/universe";
import { resolveGaReportingTargets } from "libs/marketing/analytics/gaReportingTargetsContract";

/**
 * @docHint
 * @purpose GA4 Admin/Data API의 조회 전용 설정 인벤토리를 로컬 마케팅 에이전트에 제공
 * @process OAuth 갱신 → 접근 가능 속성 검증 → 맞춤 정의/주요 이벤트/스트림 설정 병렬 조회 → AMU 필수 계측 준비도 계산
 * @domain marketing
 * @scope server
 */

const GA_MAX_PROPERTY_AUDITS = 10;

type GaPropertyAudit = {
  propertyId: string;
  propertyKey: string;
  propertyRole: string;
  resourceName: string;
  displayName: string;
  property: GaAuditSection<Record<string, unknown>>;
  customDimensions: GaAuditSection<Record<string, unknown>[]>;
  customMetrics: GaAuditSection<Record<string, unknown>[]>;
  keyEvents: GaAuditSection<Record<string, unknown>[]>;
  dataStreams: GaAuditSection<Record<string, unknown>[]>;
  dataRetentionSettings: GaAuditSection<Record<string, unknown>>;
  googleSignalsSettings: GaAuditSection<Record<string, unknown>>;
  attributionSettings: GaAuditSection<Record<string, unknown>>;
  reportingIdentitySettings: GaAuditSection<Record<string, unknown>>;
  streamSettings: Array<{
    streamName: string;
    displayName: string;
    type: string;
    measurementId: string | null;
    defaultUri: string | null;
    enhancedMeasurementSettings: GaAuditSection<Record<string, unknown>>;
    dataRedactionSettings: GaAuditSection<Record<string, unknown>>;
    eventCreateRules: GaAuditSection<Record<string, unknown>[]>;
    eventEditRules: GaAuditSection<Record<string, unknown>[]>;
  }>;
  observedEvents: GaObservedEvents;
  readiness: ReturnType<typeof buildGaMarketingReadiness>;
};

function normalizePropertyId(value: unknown) {
  const normalized = toSafeString(value).replace(/^properties\//, "");
  return /^\d+$/.test(normalized) ? normalized : "";
}

function boundedLookbackDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 28;
  return Math.min(Math.max(Math.floor(parsed), 1), 90);
}

async function auditStreamSettings(accessToken: string, rawStream: Record<string, unknown>) {
  const streamName = toSafeString(rawStream.name);
  const webStreamData = toUnknownRecord(rawStream.webStreamData);
  const emptyError: GaAuditSection<Record<string, unknown>> = {
    status: "error",
    data: null,
    error: { errorCode: "GA_STREAM_NAME_MISSING", httpStatus: null, message: "Data stream name is missing" },
  };
  const emptyListError: GaAuditSection<Record<string, unknown>[]> = {
    status: "error",
    data: null,
    error: { errorCode: "GA_STREAM_NAME_MISSING", httpStatus: null, message: "Data stream name is missing" },
  };
  if (!streamName) {
    return {
      streamName: "",
      displayName: toSafeString(rawStream.displayName),
      type: toSafeString(rawStream.type),
      measurementId: toSafeString(webStreamData.measurementId) || null,
      defaultUri: toSafeString(webStreamData.defaultUri) || null,
      enhancedMeasurementSettings: emptyError,
      dataRedactionSettings: emptyError,
      eventCreateRules: emptyListError,
      eventEditRules: emptyListError,
    };
  }

  const [enhancedMeasurementSettings, dataRedactionSettings, eventCreateRules, eventEditRules] = await Promise.all([
    getGaAdminSection(accessToken, gaAdminUrl("v1alpha", `${streamName}/enhancedMeasurementSettings`)),
    getGaAdminSection(accessToken, gaAdminUrl("v1alpha", `${streamName}/dataRedactionSettings`)),
    listGaAdminSection(accessToken, gaAdminUrl("v1alpha", `${streamName}/eventCreateRules`), "eventCreateRules"),
    listGaAdminSection(accessToken, gaAdminUrl("v1alpha", `${streamName}/eventEditRules`), "eventEditRules"),
  ]);

  return {
    streamName,
    displayName: toSafeString(rawStream.displayName),
    type: toSafeString(rawStream.type),
    measurementId: toSafeString(webStreamData.measurementId) || null,
    defaultUri: toSafeString(webStreamData.defaultUri) || null,
    enhancedMeasurementSettings,
    dataRedactionSettings,
    eventCreateRules,
    eventEditRules,
  };
}

async function auditProperty(args: {
  accessToken: string;
  propertyId: string;
  propertyKey: string;
  propertyRole: string;
  displayName: string;
  lookbackDays: number;
}): Promise<GaPropertyAudit> {
  const resourceName = `properties/${args.propertyId}`;
  const [
    property,
    customDimensions,
    customMetrics,
    keyEvents,
    dataStreams,
    dataRetentionSettings,
    googleSignalsSettings,
    attributionSettings,
    reportingIdentitySettings,
    observedEvents,
  ] = await Promise.all([
    getGaAdminSection(args.accessToken, gaAdminUrl("v1beta", resourceName)),
    listGaAdminSection(args.accessToken, gaAdminUrl("v1beta", `${resourceName}/customDimensions`), "customDimensions"),
    listGaAdminSection(args.accessToken, gaAdminUrl("v1beta", `${resourceName}/customMetrics`), "customMetrics"),
    listGaAdminSection(args.accessToken, gaAdminUrl("v1beta", `${resourceName}/keyEvents`), "keyEvents"),
    listGaAdminSection(args.accessToken, gaAdminUrl("v1beta", `${resourceName}/dataStreams`), "dataStreams"),
    getGaAdminSection(args.accessToken, gaAdminUrl("v1beta", `${resourceName}/dataRetentionSettings`)),
    getGaAdminSection(args.accessToken, gaAdminUrl("v1alpha", `${resourceName}/googleSignalsSettings`)),
    getGaAdminSection(args.accessToken, gaAdminUrl("v1alpha", `${resourceName}/attributionSettings`)),
    getGaAdminSection(args.accessToken, gaAdminUrl("v1alpha", `${resourceName}/reportingIdentitySettings`)),
    getGaObservedEvents(args.accessToken, args.propertyId, args.lookbackDays),
  ]);
  const streamSettings = await Promise.all((gaSectionArray(dataStreams) || []).map((stream) => auditStreamSettings(args.accessToken, stream)));
  const readiness = buildGaMarketingReadiness({
    customDimensions,
    keyEvents,
    observedEvents,
    propertyRole: args.propertyRole,
  });

  return {
    propertyId: args.propertyId,
    propertyKey: args.propertyKey,
    propertyRole: args.propertyRole,
    resourceName,
    displayName: args.displayName,
    property,
    customDimensions,
    customMetrics,
    keyEvents,
    dataStreams,
    dataRetentionSettings,
    googleSignalsSettings,
    attributionSettings,
    reportingIdentitySettings,
    streamSettings,
    observedEvents,
    readiness,
  };
}

function buildCrossPropertySummary(properties: GaPropertyAudit[]) {
  const webStreams = properties.flatMap((property) =>
    property.streamSettings
      .filter((stream) => stream.type === "WEB_DATA_STREAM" || stream.measurementId || stream.defaultUri)
      .map((stream) => ({
        propertyId: property.propertyId,
        propertyName: property.displayName,
        streamName: stream.streamName,
        measurementId: stream.measurementId,
        defaultUri: stream.defaultUri,
      })),
  );
  const measurementIds = Array.from(new Set(webStreams.map((stream) => stream.measurementId).filter(Boolean)));
  return {
    webStreams,
    measurementIds,
    usesSingleMeasurementId: measurementIds.length === 1,
    continuityStatus:
      measurementIds.length === 0
        ? "unknown"
        : measurementIds.length === 1
          ? "single_measurement_id"
          : "multiple_measurement_ids",
  };
}

export async function auditGaConfiguration(args: {
  universeId: string;
  propertyIds?: string[];
  eventLookbackDays?: number;
}) {
  const oauth = await resolveMarketingOAuthAccess({
    universeId: args.universeId,
    provider: "google_analytics",
    allowSelectionRequired: true,
  });
  if (!oauth) {
    return { ok: false as const, error: "ga_oauth_reconnect_required" };
  }

  let resources;
  try {
    resources = await listMarketingOAuthResources({
      provider: "google_analytics",
      accessToken: oauth.accessToken,
      appCredential: oauth.appCredential,
      providerAccountId: oauth.providerAccountId,
      displayName: oauth.displayName,
    });
  } catch {
    return { ok: false as const, error: "ga_property_lookup_failed" };
  }

  const accessibleProperties = resources
    .map((resource) => ({
      propertyId: normalizePropertyId(resource.id),
      resourceName: resource.id,
      displayName: resource.name,
    }))
    .filter((resource) => resource.propertyId);
  const accessibleById = new Map(accessibleProperties.map((resource) => [resource.propertyId, resource]));
  const settings = await getUniverseMarketingAnalyticsSettings(args.universeId).catch(() => null);
  const reportingTargets = resolveGaReportingTargets({
    universeId: args.universeId,
    configuredTargets: settings?.reportingTargets,
    selectedResourceId: oauth.selectedResourceId,
    selectedResourceName: oauth.selectedResourceName,
  });
  const reportingTargetById = new Map(reportingTargets.map((target) => [target.propertyId, target]));
  const requestedIds = Array.from(
    new Set((args.propertyIds || []).map(normalizePropertyId).filter(Boolean)),
  ).slice(0, GA_MAX_PROPERTY_AUDITS);
  const selectedPropertyId = normalizePropertyId(oauth.selectedResourceId);
  const configuredTargetIds = reportingTargets
    .map((target) => target.propertyId)
    .filter((propertyId) => accessibleById.has(propertyId));
  const targetIds = requestedIds.length
    ? requestedIds
    : configuredTargetIds.length
      ? configuredTargetIds.slice(0, GA_MAX_PROPERTY_AUDITS)
      : selectedPropertyId && accessibleById.has(selectedPropertyId)
        ? [selectedPropertyId]
        : accessibleProperties.slice(0, GA_MAX_PROPERTY_AUDITS).map((resource) => resource.propertyId);
  const deniedPropertyIds = targetIds.filter((propertyId) => !accessibleById.has(propertyId));
  const allowedTargets = targetIds
    .map((propertyId) => accessibleById.get(propertyId))
    .filter((resource): resource is NonNullable<typeof resource> => Boolean(resource));

  if (!allowedTargets.length) {
    return {
      ok: false as const,
      error: deniedPropertyIds.length ? "ga_property_not_accessible" : "ga_property_not_selected",
      accessibleProperties,
      deniedPropertyIds,
    };
  }

  const lookbackDays = boundedLookbackDays(args.eventLookbackDays);
  const properties: GaPropertyAudit[] = [];
  for (const target of allowedTargets) {
    const reportingTarget = reportingTargetById.get(target.propertyId);
    properties.push(
      await auditProperty({
        accessToken: oauth.accessToken,
        propertyId: target.propertyId,
        propertyKey: reportingTarget?.propertyKey || "oauth",
        propertyRole: reportingTarget?.role || "default",
        displayName: target.displayName,
        lookbackDays,
      }),
    );
  }

  return {
    ok: true as const,
    source: "google_analytics_admin_and_data_api",
    readOnly: true,
    universeId: args.universeId,
    selectedPropertyId: selectedPropertyId || null,
    requestedPropertyIds: targetIds,
    deniedPropertyIds,
    accessibleProperties,
    eventLookbackDays: lookbackDays,
    properties,
    crossProperty: buildCrossPropertySummary(properties),
    excludedSensitiveResources: ["measurementProtocolSecrets", "accessBindings"],
  };
}
