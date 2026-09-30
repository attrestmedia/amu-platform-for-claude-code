import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { MARKETING_CRON_SECRET } from "consts/marketing/server";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { collectGaDailySnapshots } from "libs/marketing/analytics/gaCollectService";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose GA4 일별 스냅샷 정기 수집 크론 진입점 — 외부 스케줄러(Cloudflare Worker cron)가 매일 1회 호출
 * @process Bearer secret 검증(미설정 503 fail-closed) → dryRun 지원 → collectGaDailySnapshots 호출
 *   (기본 2일 롤링 윈도 — 매일 호출이면 항상 1일 겹침이 있어 결측 내성 확보)
 * @domain marketing
 * @scope internal-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function verifyCronSecret(request: NextRequest) {
  if (!MARKETING_CRON_SECRET) {
    return { ok: false as const, status: 503, error: "CRON_SECRET_NOT_CONFIGURED" };
  }
  const authorization = toSafeString(request.headers.get("authorization"));
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const actual = match ? match[1].trim() : "";
  if (!actual || !safeEqual(actual, MARKETING_CRON_SECRET)) {
    return { ok: false as const, status: 401, error: "UNAUTHORIZED_CRON" };
  }
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (!isMarketingFeatureEnabled()) {
    return NextResponse.json({ ok: false, error: "MARKETING_FEATURE_DISABLED" }, { status: 404 });
  }

  return await withApiTimeout(async () => {
    const body = toUnknownRecord(await request.json().catch(() => ({})));
    const universeId = toSafeString(body.universeId) || "amu";
    const dryRun = body.dryRun === true || toSafeString(body.dryRun) === "true";
    const requestId = toSafeString(request.headers.get("x-request-id")) || crypto.randomUUID();

    logger.info("[cron/ga-snapshots] start", { requestId, universeId, dryRun });

    const data = await collectGaDailySnapshots({
      universeId,
      dryRun,
      startDate: toSafeString(body.startDate) || undefined,
      endDate: toSafeString(body.endDate) || undefined,
      propertyKey: toSafeString(body.propertyKey) || undefined,
      propertyId: toSafeString(body.propertyId) || undefined,
      reportKey: toSafeString(body.reportKey) || undefined,
    });

    logger.info("[cron/ga-snapshots] done", {
      requestId,
      ok: data.ok,
      startDate: (data as Record<string, unknown>).startDate,
      endDate: (data as Record<string, unknown>).endDate,
      rollupCount: (data as Record<string, unknown>).rollupCount,
    });

    return NextResponse.json(
      {
        ok: data.ok,
        data: { ...data, requestId },
      },
      { status: data.ok ? 200 : 500 },
    );
  }, 60000);
}
