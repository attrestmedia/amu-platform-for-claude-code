import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { listAccessibleMarketingUniverseIds, assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { getMarketingGlobalSystemStatus, getMarketingSystemStatus } from "libs/marketing/queue/ops";
import { toSafeString } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(marketing / system / status) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain marketing
 * @scope system-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(
  async (_data, user, request?: NextRequest) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const searchParams = request ? new URL(request.url).searchParams : undefined;
      const universeId = toSafeString(searchParams?.get("universeId"));
      if (universeId) {
        const access = await assertMarketingUniverseAccess({ user, universeId });
        if (!access.ok) {
          return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const result = await getMarketingSystemStatus({ universeId: access.universeId });
        return NextResponse.json({ success: true, data: result });
      }

      const universeIds = await listAccessibleMarketingUniverseIds(user);
      const result = await getMarketingGlobalSystemStatus({ universeIds });
      return NextResponse.json({ success: true, data: result });
    }, 20000),
  undefined,
  "marketing_system_status",
);
