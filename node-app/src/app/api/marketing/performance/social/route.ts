import { after, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { getSocialPerformance, SOCIAL_PERFORMANCE_CHANNELS } from "libs/marketing/analytics/socialCollectService";
import { getSocialCollectStatus, startSocialCollectForUniverse } from "libs/marketing/analytics/socialCollectRunner";
import { upsertMarketingSocialCollectSettings } from "libs/database/marketing";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 관리자 마케팅 성과 탭용 소셜 성과 API — 저장된 스냅샷 조회(GET) / 수동 수집·자동 수집 설정(POST)
 * @process GET: universe 접근 검증 → 스냅샷 집계 + 자동 수집 상태 반환 / POST: action=collect는 수집을 백그라운드로 시작하고 runId만 즉시 반환(수집은 수 분 단위 — 완료는 GET의 autoCollect.lastRun 폴링으로 확인), action=update_settings는 설정 upsert
 * @domain marketing
 * @scope admin-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_AUTO_COLLECT_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"];
const SOCIAL_PERFORMANCE_CHANNEL_SET = new Set<string>(SOCIAL_PERFORMANCE_CHANNELS);

function toBoundedInt(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value || fallback);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(next)));
}

function toCsvValues(value: unknown) {
  return Array.from(new Set(toSafeString(value).split(",").map((item) => item.trim()).filter(Boolean)));
}

export const GET = withAuth(
  async (_data, user, request) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const searchParams = request ? new URL(request.url).searchParams : undefined;
      const universeId = toSafeString(searchParams?.get("universeId"));
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }

      const [data, autoCollect] = await Promise.all([
        getSocialPerformance({
          universeId: access.universeId,
          channels: toCsvValues(searchParams?.get("channel")),
          days: toBoundedInt(searchParams?.get("days"), 30, 1, 180),
          entityId: toSafeString(searchParams?.get("entityId")),
          campaignId: toSafeString(searchParams?.get("campaignId")),
          sourceFingerprint: toSafeString(searchParams?.get("sourceFingerprint")),
          draftId: toSafeString(searchParams?.get("draftId")),
        }),
        getSocialCollectStatus(access.universeId),
      ]);

      return NextResponse.json({ success: true, data: { ...data, autoCollect } });
    }, 20000),
  undefined,
  "marketing_social_performance_get",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (data, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const universeId = toSafeString(data?.universeId);
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }

      const action = toSafeString(data?.action) || "collect";

      if (action === "update_settings") {
        const requestedChannels: string[] | undefined = Array.isArray(data?.channels)
          ? Array.from(
              new Set<string>(
                data.channels
                  .map((channel: unknown) => toSafeString(channel))
                  .filter((channel: string) => SOCIAL_PERFORMANCE_CHANNEL_SET.has(channel)),
              ),
            )
          : undefined;
        const settings = await upsertMarketingSocialCollectSettings({
          universeId: access.universeId,
          enabled: typeof data?.enabled === "boolean" ? data.enabled : undefined,
          channels: requestedChannels && requestedChannels.length > 0 ? requestedChannels : data?.enabled === true ? DEFAULT_AUTO_COLLECT_CHANNELS : requestedChannels,
          rollingDays: typeof data?.rollingDays !== "undefined" ? Number(data.rollingDays) : undefined,
          weeklyDeepDays: typeof data?.weeklyDeepDays !== "undefined" ? Number(data.weeklyDeepDays) : undefined,
          linkedinVersion: typeof data?.linkedinVersion !== "undefined" ? toSafeString(data.linkedinVersion) : undefined,
          linkedinMemberAnalyticsEnabled:
            typeof data?.linkedinMemberAnalyticsEnabled === "boolean" ? data.linkedinMemberAnalyticsEnabled : undefined,
          updatedBy: toSafeString(user?.userEmail || user?.uid),
        });
        return NextResponse.json({ success: true, data: { settings } });
      }

      const requestedChannels = Array.isArray(data?.channels) ? data.channels.map(toSafeString).filter(Boolean) : toCsvValues(data?.channel);
      const channels = requestedChannels.length > 0 ? requestedChannels : [...SOCIAL_PERFORMANCE_CHANNELS];
      // 수집은 게시물 수에 비례해 수 분까지 걸리므로 요청-응답 안에서 기다리지 않는다.
      // run(running) 기록 생성 후 runId만 반환하고, 실제 수집은 응답 전송 이후(after)에 완료한다.
      const start = await startSocialCollectForUniverse({
        universeId: access.universeId,
        trigger: "manual",
        channels,
        sinceDays: toBoundedInt(data?.sinceDays ?? data?.days, 30, 1, 180),
        dryRun: data?.dryRun === true || toSafeString(data?.dryRun) === "true",
      });

      if (start.busy) {
        return NextResponse.json(
          {
            success: false,
            errorCode: "COLLECT_ALREADY_RUNNING",
            message: "이미 수집이 진행 중입니다. 완료 후 다시 시도해주세요.",
            data: { runId: start.runId, startedAt: start.startedAt },
          },
          { status: 409 },
        );
      }

      after(() => start.completion);
      return NextResponse.json({
        success: true,
        data: {
          started: true,
          runId: start.runId,
          startedAt: start.startedAt,
          universeId: start.universeId,
          sinceDays: start.sinceDays,
          channels: start.channels,
          dryRun: start.dryRun,
        },
      });
    }, 20000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_social_performance_collect",
);
