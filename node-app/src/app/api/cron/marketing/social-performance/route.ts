import { timingSafeEqual } from "crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { MARKETING_CRON_SECRET } from "consts/marketing/server";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import {
  getSocialCollectStatus,
  runSocialCollectForEnabledUniverses,
  runSocialCollectForUniverse,
  startSocialCollectForEnabledUniverses,
  startSocialCollectForUniverse,
} from "libs/marketing/analytics/socialCollectRunner";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 소셜 성과 정기 수집 크론 진입점 — 외부 스케줄러(Cloudflare Worker cron/서버 crontab)가 하루 1회 이상 호출
 * @process Bearer secret 검증(미설정 503 fail-closed) → 대상 universe 결정(단일 지정 또는 enabled 전체) → 백그라운드 수집 시작 후 즉시 수락 응답(수집은 수 분 단위 — 프록시/클라이언트 타임아웃 회피). sync:true는 소규모 dry-run 진단용 동기 실행, action:"status"는 최근 실행 기록 조회
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

function toBoundedInt(value: unknown, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return undefined;
  return Math.max(min, Math.min(max, Math.floor(next)));
}

export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (!isMarketingFeatureEnabled()) {
    return NextResponse.json({ ok: false, error: "MARKETING_FEATURE_DISABLED" }, { status: 404 });
  }

  return await withApiTimeout(async () => {
    const body = toUnknownRecord(await request.json().catch(() => ({})));
    const action = toSafeString(body.action);
    const universeId = toSafeString(body.universeId);
    const sinceDays = toBoundedInt(body.sinceDays, 1, 180);
    const dryRun = body.dryRun === true || toSafeString(body.dryRun) === "true";
    const sync = body.sync === true || toSafeString(body.sync) === "true";
    const requestId = toSafeString(request.headers.get("x-request-id")) || crypto.randomUUID();

    // 운영 점검용 — 수집을 실행하지 않고 최근 실행 상태만 반환한다.
    if (action === "status") {
      if (!universeId) return NextResponse.json({ ok: false, error: "UNIVERSE_ID_REQUIRED" }, { status: 400 });
      const status = await getSocialCollectStatus(universeId);
      return NextResponse.json({ ok: true, data: status });
    }

    logger.info("[cron/social-performance] start", { requestId, universeId: universeId || "(enabled-all)", sinceDays, dryRun, sync });

    // sync 모드 — 소규모(sinceDays 1~3) dry-run 진단 전용. 수집 완료까지 대기하므로 대상이 많으면 프록시/게이트웨이 타임아웃에 걸릴 수 있다.
    if (sync) {
      const data = universeId
        ? await runSocialCollectForUniverse({ universeId, trigger: "cron", sinceDays, dryRun })
        : await runSocialCollectForEnabledUniverses({ trigger: "cron", sinceDays, dryRun });
      logger.info("[cron/social-performance] done(sync)", { requestId, ok: data.ok });
      return NextResponse.json({ ok: data.ok, data });
    }

    // 기본 모드 — run(running) 기록만 만들고 즉시 수락 응답. 수집은 응답 이후(after)에 완료되며,
    // 결과는 marketing_collect_runs / action:"status"로 확인한다.
    if (universeId) {
      const start = await startSocialCollectForUniverse({ universeId, trigger: "cron", sinceDays, dryRun });
      if (start.busy) {
        logger.info("[cron/social-performance] busy", { requestId, universeId, runId: start.runId });
        return NextResponse.json(
          { ok: false, error: "COLLECT_ALREADY_RUNNING", data: { runId: start.runId, startedAt: start.startedAt } },
          { status: 409 },
        );
      }
      after(async () => {
        const result = await start.completion;
        logger.info("[cron/social-performance] done(background)", { requestId, runId: start.runId, ok: result.ok });
      });
      return NextResponse.json({
        ok: true,
        data: { accepted: true, runId: start.runId, universeId: start.universeId, sinceDays: start.sinceDays, channels: start.channels, dryRun: start.dryRun },
      });
    }

    const start = await startSocialCollectForEnabledUniverses({ trigger: "cron", sinceDays, dryRun });
    after(async () => {
      const result = await start.completion;
      logger.info("[cron/social-performance] done(background)", { requestId, ok: result.ok, universeCount: result.universeCount });
    });
    return NextResponse.json({
      ok: true,
      data: { accepted: true, universeCount: start.universeCount, universeIds: start.universeIds, sinceDays, dryRun },
    });
  }, 30000);
}
