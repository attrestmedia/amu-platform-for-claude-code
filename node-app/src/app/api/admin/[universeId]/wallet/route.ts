import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { toErrorMessage } from "utils/common";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import { resolveUniverseWalletPolicyState } from "utils/payment";
import { canManageUniverseBilling } from "libs/server-utils/auth/userRoleUtils";
import type { IUniverse } from "types/game";
/**
 * @docHint
 * @purpose API 라우트(admin / [universeId] / wallet) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain payment
 * @scope admin-api
 */

// 어드민 패널에서만 쓰는 지갑 단독 조회 API
async function handleGET(_data: unknown, user: AuthenticatedUserType, _request: Request, context: NextRouteContext) {
  try {
    const universeId = String(context?.params?.universeId || "").trim();

    const universeDocument = await ensureUniverseWalletLifecycle(universeId);
    const uni = universeDocument?.toObject();

    if (!uni) {
      return NextResponse.json({ error: "유니버스를 찾을 수 없습니다." }, { status: 404 });
    }

    const wallet = {
      membership: {
        coins: Math.max(0, uni?.wallet?.membership?.coins || 0),
        expiresAt: uni?.wallet?.membership?.expiresAt || null,
        lastChargedAt: uni?.wallet?.membership?.lastChargedAt || null,
        billingMode: uni?.wallet?.membership?.billingMode || "anniversary",
        renewableAt: uni?.wallet?.membership?.renewableAt || null,
        pendingRenewal: uni?.wallet?.membership?.pendingRenewal || null,
      },
      charged: { coins: Math.max(0, uni?.wallet?.charged?.coins || 0) },
    };

    const policy = resolveUniverseWalletPolicyState(uni.wallet);
    wallet.membership.coins = policy.membershipCoins;
    return NextResponse.json({
      universeId,
      wallet,
      policy,
      permissions: { canManageBilling: canManageUniverseBilling(user, uni as unknown as IUniverse) },
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e, "wallet 조회 실패") }, { status: 500 });
  }
}

export const GET = withAuth(handleGET, undefined, "admin/universe-wallet:get", {
  checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
  bodyParser: "none",
});
