import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import { ensureWalletFor } from "libs/server-utils/payment/paymentUtils";
import { computeUniverseAnniversaryPeriod, resolveUniverseWalletPolicyState } from "utils/payment";

async function handlePOST(body: UnknownRecord, _user: AuthenticatedUserType, _request: Request, context: NextRouteContext) {
  const universeId = String(context.params.universeId || "").trim();
  const bucket = body.bucket === "charged" ? "charged" : "membership";
  const coins = Number(body.coins);
  if (!Number.isSafeInteger(coins) || coins <= 0) {
    return NextResponse.json({ error: "coins는 1 이상의 정수여야 합니다." }, { status: 400 });
  }
  const universe = await ensureUniverseWalletLifecycle(universeId);
  if (!universe || universe.type !== "commerce") return NextResponse.json({ error: "유니버스를 찾을 수 없습니다." }, { status: 404 });
  const wallet = ensureWalletFor(universe);
  const state = resolveUniverseWalletPolicyState(wallet);
  if (state.accessState === "closed") {
    return NextResponse.json({ error: "폐쇄 유니버스는 먼저 고객센터 복구 처리가 필요합니다." }, { status: 409 });
  }
  const now = new Date();
  if (bucket === "membership") {
    const period = computeUniverseAnniversaryPeriod(now);
    wallet.membership = {
      coins: Math.max(0, wallet.membership.coins || 0) + coins,
      expiresAt: period.end,
      renewableAt: period.renewableAt,
      lastChargedAt: now,
      billingMode: "anniversary",
    };
    wallet.lastQualifyingActivityAt = now;
    wallet.accessState = "active";
  } else {
    if (!state.chargeAllowed) {
      return NextResponse.json({ error: "활성 Membership 코인이 있어야 Charged 코인을 생성할 수 있습니다." }, { status: 409 });
    }
    wallet.charged.coins = Math.max(0, wallet.charged.coins || 0) + coins;
  }
  wallet.lastQualifyingActivityAt = now;
  universe.markModified?.("wallet");
  await universe.save();
  return NextResponse.json({ ok: true, universeId, bucket, coins, wallet });
}

export const POST = withAuth(handlePOST, undefined, "admin/universe-wallet:grant", { requireAdmin: true, bodyParser: "json" });
