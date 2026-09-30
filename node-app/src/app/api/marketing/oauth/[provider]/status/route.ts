import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { isSupportedOAuthProvider } from "libs/marketing/auth/oauthProviderRegistry";
import { getMarketingOAuthConnectionStatus } from "libs/marketing/auth/marketingOAuthStatusService";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자 OAuth 연결 상태 조회(토큰 값 제외, 연결 목록/만료만)
 * @process provider 검증 → 유니버스 권한 → 연결 상태 목록 반환
 * @domain marketing
 * @scope universe-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(
  async (_data, _user, request, ctx: { params: Promise<{ provider: string }> }) => {
    if (!request) {
      return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
    }

    const { provider } = await ctx.params;
    if (!isSupportedOAuthProvider(provider)) {
      return NextResponse.json({ success: false, error: "unsupported_provider" }, { status: 400 });
    }

    const universeId = toSafeString(new URL(request.url).searchParams.get("universeId"));
    if (!universeId) {
      return NextResponse.json({ success: false, error: "universe_id_required" }, { status: 400 });
    }

    const data = await getMarketingOAuthConnectionStatus({ universeId, provider });

    return NextResponse.json({
      success: true,
      data,
    });
  },
  undefined,
  "marketing_oauth_status",
  {
    bodyParser: "none",
    checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
  },
);
