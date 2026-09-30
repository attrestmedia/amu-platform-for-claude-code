import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import {
  collectGaDailySnapshots,
  getGaPerformance,
  isGaPerformanceView,
} from "libs/marketing/analytics/gaCollectService";
import { auditGaConfiguration } from "libs/server-utils/marketing/ga/gaConfigurationAudit";
import { getUniverseMarketingAnalyticsSettings, updateUniverseGaReportingTargets } from "libs/database/universe";
import { listMarketingOAuthResources } from "libs/marketing/auth/oauthProviderLifecycle";
import { resolveMarketingOAuthAccess } from "libs/marketing/auth/marketingOAuthResolver";
import {
  normalizeGaReportingTargets,
  resolveGaReportingTargets,
} from "libs/marketing/analytics/gaReportingTargetsContract";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Marketing Oops 성과 탭에서 OAuth 기반 GA4 설정·저장 성과 조회와 읽기 전용 스냅샷 수집 제공
 * @process universe 권한 확인 → configuration/performance 조회 또는 collect 실행 → 비밀값 제외 응답
 * @domain marketing
 * @scope admin-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function csv(value: unknown) {
  return Array.from(new Set(toSafeString(value).split(",").map((item) => item.trim()).filter(Boolean)));
}

function propertyId(value: unknown) {
  const normalized = toSafeString(value).replace(/^properties\//, "");
  return /^\d+$/.test(normalized) ? normalized : "";
}

async function getGaTargetInventory(universeId: string) {
  const oauth = await resolveMarketingOAuthAccess({
    universeId,
    provider: "google_analytics",
    allowSelectionRequired: true,
  });
  if (!oauth) return { ok: false as const, error: "ga_oauth_reconnect_required" };

  const resources = await listMarketingOAuthResources({
    provider: "google_analytics",
    accessToken: oauth.accessToken,
    appCredential: oauth.appCredential,
    providerAccountId: oauth.providerAccountId,
    displayName: oauth.displayName,
  });
  const availableProperties = resources
    .map((resource) => ({
      propertyId: propertyId(resource.id),
      name: resource.name,
      type: resource.type,
    }))
    .filter((resource) => resource.propertyId);
  const settings = await getUniverseMarketingAnalyticsSettings(universeId);
  const reportingTargets = resolveGaReportingTargets({
    universeId,
    configuredTargets: settings?.reportingTargets,
    selectedResourceId: oauth.selectedResourceId,
    selectedResourceName: oauth.selectedResourceName,
  });
  const accessible = new Set(availableProperties.map((resource) => resource.propertyId));
  return {
    ok: true as const,
    availableProperties,
    reportingTargets,
    deniedPropertyIds: reportingTargets
      .map((target) => target.propertyId)
      .filter((targetPropertyId) => !accessible.has(targetPropertyId)),
    primaryPropertyId: reportingTargets.find((target) => target.primary)?.propertyId || "",
  };
}

export const GET = withAuth(
  async (_data, user, request) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, error: "marketing_disabled" }, { status: 404 });
      }
      const search = new URL(request.url).searchParams;
      const universeId = toSafeString(search.get("universeId"));
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      const action = toSafeString(search.get("action")) || "configuration";
      if (action === "targets") {
        try {
          const data = await getGaTargetInventory(access.universeId);
          return NextResponse.json(
            { success: data.ok, action, data, ...(data.ok ? {} : { error: data.error }) },
            { status: data.ok ? 200 : 409 },
          );
        } catch {
          return NextResponse.json({ success: false, action, error: "ga_property_lookup_failed" }, { status: 502 });
        }
      }

      if (action === "configuration") {
        const data = await auditGaConfiguration({
          universeId: access.universeId,
          propertyIds: csv(search.get("propertyIds")).slice(0, 10),
          eventLookbackDays: bounded(search.get("eventLookbackDays"), 28, 1, 90),
        });
        return NextResponse.json(
          { success: data.ok, action, data, ...(data.ok ? {} : { error: data.error }) },
          { status: data.ok ? 200 : 409 },
        );
      }

      if (action === "performance") {
        const view = toSafeString(search.get("view")) || "channel_contribution";
        if (!isGaPerformanceView(view)) {
          return NextResponse.json({ success: false, error: "unsupported_view" }, { status: 400 });
        }
        const data = await getGaPerformance({
          universeId: access.universeId,
          view,
          days: bounded(search.get("days"), 28, 1, 90),
          entityId: toSafeString(search.get("entityId")) || undefined,
          propertyKey: toSafeString(search.get("propertyKey")) || undefined,
          propertyId: toSafeString(search.get("propertyId")) || undefined,
        });
        return NextResponse.json({ success: true, action, data });
      }

      return NextResponse.json({ success: false, error: "unsupported_action" }, { status: 400 });
    }, 60_000),
  undefined,
  "marketing_ga_analytics_get",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (body, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, error: "marketing_disabled" }, { status: 404 });
      }
      const universeId = toSafeString(body?.universeId);
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      const action = toSafeString(body?.action);
      if (action === "update_targets") {
        const reportingTargets = normalizeGaReportingTargets(body?.reportingTargets);
        if (!reportingTargets.length) {
          return NextResponse.json({ success: false, error: "ga_reporting_targets_required" }, { status: 400 });
        }
        try {
          const inventory = await getGaTargetInventory(access.universeId);
          if (!inventory.ok) {
            return NextResponse.json({ success: false, error: inventory.error }, { status: 409 });
          }
          const accessible = new Set(inventory.availableProperties.map((resource) => resource.propertyId));
          const deniedPropertyIds = reportingTargets
            .map((target) => target.propertyId)
            .filter((targetPropertyId) => !accessible.has(targetPropertyId));
          if (deniedPropertyIds.length) {
            return NextResponse.json(
              { success: false, error: "ga_property_not_accessible", data: { deniedPropertyIds } },
              { status: 403 },
            );
          }
          const availableById = new Map(
            inventory.availableProperties.map((resource) => [resource.propertyId, resource]),
          );
          const normalizedTargets = reportingTargets.map((target) => {
            const source = toUnknownRecord(availableById.get(target.propertyId));
            return { ...target, label: target.label || toSafeString(source.name) };
          });
          const updated = await updateUniverseGaReportingTargets({
            universeId: access.universeId,
            reportingTargets: normalizedTargets,
          });
          if (!updated) {
            return NextResponse.json({ success: false, error: "universe_not_found" }, { status: 404 });
          }
          return NextResponse.json({
            success: true,
            action,
            data: { reportingTargets: normalizedTargets },
          });
        } catch {
          return NextResponse.json({ success: false, error: "ga_reporting_targets_update_failed" }, { status: 502 });
        }
      }

      if (action !== "collect") {
        return NextResponse.json({ success: false, error: "unsupported_action" }, { status: 400 });
      }

      const data = await collectGaDailySnapshots({
        universeId: access.universeId,
        startDate: toSafeString(body?.startDate) || undefined,
        endDate: toSafeString(body?.endDate) || undefined,
        dryRun: body?.dryRun === true,
        propertyKey: toSafeString(body?.propertyKey) || undefined,
        propertyId: toSafeString(body?.propertyId) || undefined,
        reportKey: toSafeString(body?.reportKey) || undefined,
      });
      const error = "error" in data ? data.error : "ga_collect_failed";
      return NextResponse.json(
        { success: data.ok, action: "collect", data, ...(data.ok ? {} : { error }) },
        { status: data.ok ? 200 : 409 },
      );
    }, 60_000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_ga_analytics_collect",
);
