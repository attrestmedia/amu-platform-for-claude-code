import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import { ensureWalletFor } from "libs/server-utils/payment/paymentUtils";
import { logger } from "utils/log";

async function handlePOST(body: UnknownRecord, user: AuthenticatedUserType, _request: Request, context: NextRouteContext) {
  const reason = String(body.reason || "").trim();
  if (reason.length < 10) return NextResponse.json({ error: "복구 심사 사유를 10자 이상 입력하세요." }, { status: 400 });
  const universeId = String(context.params.universeId || "").trim();
  const universe = await ensureUniverseWalletLifecycle(universeId);
  if (!universe || universe.type !== "commerce") return NextResponse.json({ error: "유니버스를 찾을 수 없습니다." }, { status: 404 });
  const wallet = ensureWalletFor(universe);
  wallet.closedAt = undefined;
  wallet.closureNoticeSentAt = undefined;
  wallet.accessState = "suspended";
  wallet.lastQualifyingActivityAt = new Date();
  universe.markModified?.("wallet");
  await universe.save();
  logger.info("[universe-wallet] customer-support recovery approved", {
    universeId,
    recoveredBy: String(user.uid || user.ID),
    reason,
  });
  return NextResponse.json({ ok: true, universeId, recoveredBy: String(user.uid || user.ID), reason });
}

export const POST = withAuth(handlePOST, undefined, "admin/universe-wallet:recover", { requireAdmin: true, bodyParser: "json" });
