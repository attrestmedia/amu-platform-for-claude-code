import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { UNIVERSE_WALLET_CRON_SECRET } from "consts/env/server";
import { runUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!UNIVERSE_WALLET_CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET_NOT_CONFIGURED" }, { status: 503 });
  }
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !safeEqual(token, UNIVERSE_WALLET_CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED_CRON" }, { status: 401 });
  }
  const data = await runUniverseWalletLifecycle();
  return NextResponse.json({ ok: data.errors === 0, data });
}
