import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess, listAccessibleMarketingUniverseIds } from "libs/marketing/operator/access";
import { recoverMarketingQueue, recoverMarketingQueueAcrossUniverses } from "libs/marketing/queue/ops";
import { toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(marketing / system / recover) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain marketing
 * @scope system-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function validatePayload(data: unknown) {
  const action = toSafeString(toUnknownRecord(data).action);
  if (action !== "requeue_orphans") return { valid: false, error: "지원하지 않는 action입니다." };
  return { valid: true };
}

export const POST = withAuth<UnknownRecord>(
  async (data, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const universeId = toSafeString(data?.universeId);
      const requestedBy = toSafeString(user?.userEmail || user?.userEmailLower);
      const reason = toSafeString(data?.reason) || "operator_recovery";
      const dryRun = Boolean(data?.dryRun);
      const limit = Number(data?.limit || 100);
      const result = universeId
        ? await (async () => {
            const access = await assertMarketingUniverseAccess({ user, universeId });
            if (!access.ok) {
              return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            }

            const next = await recoverMarketingQueue({
              universeId: access.universeId,
              requestedBy,
              reason,
              dryRun,
              limit,
            });

            return NextResponse.json({ success: true, data: next });
          })()
        : await (async () => {
            const universeIds = await listAccessibleMarketingUniverseIds(user);
            const next = await recoverMarketingQueueAcrossUniverses({
              universeIds,
              requestedBy,
              reason,
              dryRun,
              limit,
            });

            return NextResponse.json({ success: true, data: next });
          })();

      return result;
    }, 30000),
  validatePayload,
  "marketing_system_recover",
);
