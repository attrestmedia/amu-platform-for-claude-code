import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { MARKETING_CRON_SECRET } from "consts/marketing/server";
import { collectAdsPerformanceSnapshots } from "libs/marketing/analytics/adsCollectService";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 단일 universe의 Naver/Google Ads 일별 성과를 정기 수집
 * @process cron secret fail-closed 검증 → read-only provider 조회 → 성과 일별 upsert
 * @domain marketing
 * @scope internal-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  if (!MARKETING_CRON_SECRET) return false;
  const actual = toSafeString(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  const left = Buffer.from(actual);
  const right = Buffer.from(MARKETING_CRON_SECRET);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED_CRON" }, { status: MARKETING_CRON_SECRET ? 401 : 503 });
  const body = toUnknownRecord(await request.json().catch(() => ({})));
  const universeId = toSafeString(body.universeId);
  if (!universeId) return NextResponse.json({ ok: false, error: "UNIVERSE_ID_REQUIRED" }, { status: 400 });
  const data = await collectAdsPerformanceSnapshots({
    universeId,
    dateFrom: toSafeString(body.dateFrom) || undefined,
    dateTo: toSafeString(body.dateTo) || undefined,
    channels: Array.isArray(body.channels) ? body.channels.map(toSafeString) : undefined,
    dryRun: body.dryRun === true,
  });
  return NextResponse.json({ ok: data.ok, data }, { status: data.ok ? 200 : 409 });
}
