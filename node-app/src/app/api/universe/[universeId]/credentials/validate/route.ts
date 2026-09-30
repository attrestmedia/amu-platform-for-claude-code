import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateAdsCredentials, type AdsCredentialProvider } from "libs/marketing/ads/credentialsValidation";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 관리자 UI에서 Naver/Google Ads 자격 증명을 read-only 원격 호출로 검증
 * @process 관리자 확인 → provider 검증 → 검증 시각/상태를 credential extras에 기록
 * @domain marketing
 * @scope admin-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (data, user, _request, { params }: { params: Promise<{ universeId: string }> }) => {
    if (!user?.roles?.includes("administrator")) return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
    const { universeId } = await params;
    const provider = toSafeString(data?.provider) as AdsCredentialProvider;
    if (!(["naver_ads", "google_ads"] as string[]).includes(provider)) {
      return NextResponse.json({ success: false, error: "unsupported_provider" }, { status: 400 });
    }
    const result = await validateAdsCredentials({ universeId, provider, actor: user.userEmail || user.uid, persist: true });
    return NextResponse.json({ success: result.ok, data: result }, { status: result.ok ? 200 : 409 });
  },
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "universe_ads_credentials_validate",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
