import { NextResponse } from "next/server";
import { syncTradingInstruments } from "libs/server-utils/trading/syncInstruments";
import { createUpbitAdapter } from "libs/trading/upbitAdapter";
import type { UpbitCredentials } from "libs/trading/upbitKeyStatus";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import type { PlatformCredentialKey } from "consts/secure/platformCredentials";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_instruments 주기 갱신 크론 (TL-201)
 * @process 자격증명 resolve  어댑터 생성  syncTradingInstruments 실행  결과 반환
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §7.2.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { payload } = await resolvePlatformCredential("trading.upbit.exchange" as PlatformCredentialKey);

    const credentials: UpbitCredentials = {
      accessKey: String(payload.accessKey ?? ""),
      secretKey: String(payload.secretKey ?? ""),
    };

    if (!credentials.accessKey || !credentials.secretKey) {
      return NextResponse.json({ ok: false, error: "CREDENTIALS_NOT_CONFIGURED" }, { status: 503 });
    }

    const adapter = createUpbitAdapter(credentials);
    const result = await syncTradingInstruments(adapter);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
