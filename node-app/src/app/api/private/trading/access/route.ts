import { NextResponse } from "next/server";
import { PRIVATE_TRADING_STEP_UP_ACTIONS, withPrivateTradingOwner } from "libs/server-utils/trading/requirePrivateTradingOwner";

/**
 * @docHint
 * @purpose API 라우트(private trading access) 접근 자격 확인
 * @process 세션 인증  소유자 허용목록  자격 요약 반환
 * @domain trading
 * @scope private-trade-lab
 *
 * 접근 격리의 검증 지점. 화면은 이 응답이 200일 때만 워크스페이스를 그린다.
 * 거래소를 호출하지 않으며 Mongo·Redis도 읽지 않는다 — 게이트 자체를 확인하는 용도다.
 */

export const runtime = "nodejs";

// GET /api/private/trading/access
export const GET = withPrivateTradingOwner(
  async () =>
    NextResponse.json({
      allowed: true,
      stepUpActions: PRIVATE_TRADING_STEP_UP_ACTIONS,
    }),
  undefined,
  "private_trading_access",
  { bodyParser: "none" },
);
