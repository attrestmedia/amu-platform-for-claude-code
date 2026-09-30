import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { MARKETING_CRON_SECRET } from "consts/marketing/server";
import { cleanupExpiredMarketingContentImages } from "libs/marketing/images/contentImageRetentionService";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 만료된 Marketing Ops 임시 업로드 이미지의 R2 object와 asset registry를 안전하게 정리
 * @process Bearer secret 검증 → 후보 조회 → dry-run 또는 cleanup lease/참조 재검증/R2 삭제/registry tombstone
 * @domain marketing
 * @scope internal-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorized(request: NextRequest) {
  if (!MARKETING_CRON_SECRET) return false;
  const authorization = toSafeString(request.headers.get("authorization"));
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const actual = match ? match[1].trim() : "";
  const left = Buffer.from(actual);
  const right = Buffer.from(MARKETING_CRON_SECRET);
  return left.length === right.length && timingSafeEqual(left, right);
}

function boundedLimit(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(1, Math.min(100, Math.floor(next))) : 50;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: MARKETING_CRON_SECRET ? "UNAUTHORIZED_CRON" : "CRON_SECRET_NOT_CONFIGURED" },
      { status: MARKETING_CRON_SECRET ? 401 : 503 },
    );
  }

  return await withApiTimeout(async () => {
    const body = toUnknownRecord(await request.json().catch(() => ({})));
    const requestId = toSafeString(request.headers.get("x-request-id")) || crypto.randomUUID();
    const data = await cleanupExpiredMarketingContentImages({
      dryRun: body.dryRun === true || toSafeString(body.dryRun).toLowerCase() === "true",
      limit: boundedLimit(body.limit),
      trigger: toSafeString(body.trigger) || "cron",
      requestId,
    });
    return NextResponse.json({ ok: data.failedCount === 0, data }, { status: data.failedCount === 0 ? 200 : 500 });
  }, 90000);
}
