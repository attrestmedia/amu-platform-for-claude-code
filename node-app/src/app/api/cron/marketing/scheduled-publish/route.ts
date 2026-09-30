import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getUniverses } from "libs/database/universe";
import { MARKETING_CRON_SECRET } from "consts/marketing/server";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { pollMarketingDryRunWorker } from "libs/marketing/queue/worker";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 예약된 마케팅 채널 발행 전용 크론 진입점 — Agent API의 draft-only 권한과 분리
 * @process Bearer secret 검증(미설정 503 fail-closed) → enabled universe 순회 → 예약 step만 선점·발행 → 상태 집계 반환
 * @domain marketing
 * @scope internal-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_WORKER_ID = "aws-cron-scheduled-publish";
const AGENT_WORKER_ID_PATTERN = /^(?:agent:|marketing-(?:local-)?agent-)/i;

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

function resolveWorkerId(value: unknown) {
  const workerId = toSafeString(value) || DEFAULT_WORKER_ID;
  if (workerId.length > 120 || AGENT_WORKER_ID_PATTERN.test(workerId)) return null;
  return workerId;
}

export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (!isMarketingFeatureEnabled()) {
    return NextResponse.json({ ok: false, error: "MARKETING_FEATURE_DISABLED" }, { status: 404 });
  }

  return await withApiTimeout(async () => {
    const body = toUnknownRecord(await request.json().catch(() => ({})));
    const workerId = resolveWorkerId(body.workerId);
    if (!workerId) {
      return NextResponse.json({ ok: false, error: "CRON_WORKER_ID_INVALID" }, { status: 400 });
    }

    const requestedUniverseId = toSafeString(body.universeId);
    const universes = await getUniverses({ enabledOnly: true, sortByOrder: true });
    const enabledUniverseIds = universes.map((universe) => toSafeString(universe.id)).filter(Boolean);
    if (requestedUniverseId && !enabledUniverseIds.includes(requestedUniverseId)) {
      return NextResponse.json({ ok: false, error: "UNIVERSE_NOT_ENABLED" }, { status: 404 });
    }

    const universeIds = requestedUniverseId ? [requestedUniverseId] : enabledUniverseIds;
    const requestId = toSafeString(request.headers.get("x-request-id")) || crypto.randomUUID();
    const results: Array<Record<string, unknown>> = [];

    for (const universeId of universeIds) {
      try {
        const result = await pollMarketingDryRunWorker({
          universeId,
          workerId,
          scheduledOnly: true,
          allowScheduledPublish: true,
          // scheduledOnly=true이므로 일반 queue job은 claim하지 않는다.
          allowExternalPublish: false,
        });
        results.push({ universeId, ...result });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "scheduled_publish_worker_failed";
        logger.error("[cron/scheduled-publish] universe failed", { requestId, universeId, workerId, error: message });
        results.push({
          universeId,
          ok: false,
          status: "scheduled_publish_failed",
          error: message,
        });
      }
    }

    const failedCount = results.filter((result) => result.ok === false).length;
    const processedCount = results.filter((result) => result.status === "scheduled_publish_processed").length;
    const status = failedCount > 0 ? "scheduled_publish_failed" : processedCount > 0 ? "scheduled_publish_processed" : "idle";

    logger.info("[cron/scheduled-publish] done", {
      requestId,
      workerId,
      universeCount: universeIds.length,
      processedCount,
      failedCount,
      status,
    });

    return NextResponse.json(
      {
        ok: failedCount === 0,
        action: "scheduled_publish",
        data: {
          status,
          workerId,
          universeCount: universeIds.length,
          processedCount,
          failedCount,
          results,
        },
      },
      { status: failedCount === 0 ? 200 : 500 },
    );
  }, 60000);
}
