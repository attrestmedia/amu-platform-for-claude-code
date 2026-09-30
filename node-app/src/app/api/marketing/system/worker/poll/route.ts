import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { assertMarketingUniverseAccess, listAccessibleMarketingUniverseIds } from "libs/marketing/operator/access";
import { pollMarketingDryRunWorker, pollMarketingDryRunWorkerAcrossUniverses } from "libs/marketing/queue/worker";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { toSafeString } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(marketing / system / worker / poll) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain marketing
 * @scope system-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toWorkerId(value: unknown) {
  const next = toSafeString(value);
  return next || `marketing-worker-${Date.now()}`;
}

export const POST = withAuth(
  async (data, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const universeId = toSafeString(data?.universeId);
      const workerId = toWorkerId(data?.workerId);
      const jobId = toSafeString(data?.jobId);
      const queueCategory = toSafeString(data?.queueCategory);
      const scheduledOnly = data?.scheduledOnly === true || toSafeString(data?.scheduledOnly) === "true";
      const result = universeId
        ? await (async () => {
            const access = await assertMarketingUniverseAccess({ user, universeId });
            if (!access.ok) {
              return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            }

            const next = await pollMarketingDryRunWorker({
              universeId: access.universeId,
              workerId,
              billingUid: toSafeString(user?.uid),
              jobId,
              queueCategory,
              scheduledOnly,
            });

            return NextResponse.json({ success: next.ok, data: next });
          })()
        : await (async () => {
            const universeIds = await listAccessibleMarketingUniverseIds(user);
            const next = await pollMarketingDryRunWorkerAcrossUniverses({
              universeIds,
              workerId,
              billingUid: toSafeString(user?.uid),
              queueCategory,
              scheduledOnly,
            });

            return NextResponse.json({ success: next.ok, data: next });
          })();

      return result;
    }, 20000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_system_worker_poll",
);
