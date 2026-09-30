import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { updateUniverseMarketingAnalyticsSettings } from "libs/database/universe";
import { removeLegacyGaMeasurementIds } from "libs/database/secure/credentials";
import { getGaTrackingSettings } from "libs/server-utils/marketing/ga/gaTrackingConfig";
import { normalizeGaMeasurementId } from "libs/marketing/analytics/gaMeasurementIdContract";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 유니버스별 브라우저 GA 추적 설정 조회·저장
 * @process 유니버스 편집 권한 확인 → Measurement ID 검증 → 일반 유니버스 DB 저장 → 레거시 secrets 필드 제거
 * @domain marketing-analytics
 * @scope universe-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(
  async (_data, _user, _request, { params }: { params: Promise<{ universeId: string }> }) => {
    const { universeId } = await params;
    const settings = await getGaTrackingSettings(universeId);
    return NextResponse.json({ success: true, data: settings });
  },
  undefined,
  "universe_marketing_tracking_get",
  {
    bodyParser: "none",
    checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
  },
);

export const POST = withAuth(
  async (data, user, _request, { params }: { params: Promise<{ universeId: string }> }) => {
    return withApiTimeout(async () => {
      const { universeId } = await params;
      const measurementId = normalizeGaMeasurementId(data?.measurementId);
      const trackingEnabled = data?.trackingEnabled !== false;
      if (!measurementId) {
        return NextResponse.json(
          { success: false, message: "Measurement ID 형식이 올바르지 않습니다. (예: G-XXXXXXXXXX)" },
          { status: 400 },
        );
      }

      const updated = await updateUniverseMarketingAnalyticsSettings({
        universeId,
        measurementId,
        trackingEnabled,
      });
      if (!updated) {
        return NextResponse.json({ success: false, message: "유니버스를 찾을 수 없습니다." }, { status: 404 });
      }

      try {
        await removeLegacyGaMeasurementIds(universeId, String(user?.userEmail || user?.ID || "unknown"));
      } catch (error) {
        logger.warn("[gaTracking] 레거시 measurement ID 정리 실패", {
          universeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        await Promise.all([
          redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId)),
          redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeId)),
          redisCache.invalidateByTag(CacheKeyManager.universe.tagList()),
        ]);
      } catch (error) {
        logger.warn("[gaTracking] 유니버스 캐시 무효화 실패", {
          universeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logger.info("[gaTracking] 유니버스 마케팅 추적 설정 저장", {
        universeId,
        trackingEnabled,
        actor: user?.ID || user?.userEmail,
      });
      return NextResponse.json({
        success: true,
        data: { measurementId, trackingEnabled, source: "universe" },
      });
    }, 15_000);
  },
  (data) => ({
    valid: Boolean(normalizeGaMeasurementId(data?.measurementId)) && typeof data?.trackingEnabled === "boolean",
    error: "유효한 measurementId와 trackingEnabled가 필요합니다.",
  }),
  "universe_marketing_tracking_update",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
