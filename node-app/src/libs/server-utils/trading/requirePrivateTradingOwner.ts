import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { PRIVATE_TRADING_OWNER_UIDS } from "consts/env/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { ApiHandler, NextRouteContext, RequestValidator } from "libs/server-utils/api/_helpers";
import { evaluatePrivateTradingAccess, resolveTradingUserId } from "libs/trading/privateTradingAccess";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Private Trade Lab — 소유자 허용목록 라우트 게이트
 * @process 세션 인증(게이트1)  소유자 허용목록(게이트2)  핸들러 실행
 * @domain trading
 * @scope private-trade-lab
 *
 * 판정 규칙 자체는 libs/trading/privateTradingAccess.ts에 있다. 이 파일은 env 바인딩과 응답 처리만 한다.
 */

export {
  PRIVATE_TRADING_STEP_UP_ACTIONS,
  evaluatePrivateTradingAccess,
  requiresStepUpVerification,
  resolveTradingUserId,
  type PrivateTradingAccessDenyReason,
  type PrivateTradingAccessResult,
  type PrivateTradingStepUpAction,
} from "libs/trading/privateTradingAccess";

export function isPrivateTradingOwner(user: unknown): boolean {
  return evaluatePrivateTradingAccess(resolveTradingUserId(user), PRIVATE_TRADING_OWNER_UIDS).allowed;
}

const DENY_MESSAGE = "접근 권한이 없습니다.";

/**
 * 게이트 1(세션 인증) + 게이트 2(소유자 허용목록)를 합친 라우트 래퍼.
 *
 * withAuth의 requireAdmin은 **쓰지 않는다.** 관리자 승격이 투자 접근으로 이어지면 안 되기 때문이다.
 * 거부 사유는 로그에만 남기고 응답에는 노출하지 않는다 — 허용목록의 존재 여부를 외부에서 구분할 수 없게 한다.
 */
export function withPrivateTradingOwner<T = unknown, R = unknown>(
  handler: ApiHandler<T, R>,
  validator?: RequestValidator<T>,
  endpoint: string = "private-trading",
  options?: { bodyParser?: "auto" | "json" | "none" },
) {
  const guarded: ApiHandler<T, R | NextResponse> = async (
    data: T,
    user: unknown,
    request: NextRequest,
    context: NextRouteContext,
  ) => {
    const userId = resolveTradingUserId(user);
    const access = evaluatePrivateTradingAccess(userId, PRIVATE_TRADING_OWNER_UIDS);

    if (!access.allowed) {
      logger.warn("private trading 접근 거부", {
        endpoint,
        reason: access.reason,
        userId: userId ? `${userId.slice(0, 4)}***` : "(none)",
        ip: request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
      });
      return NextResponse.json({ error: DENY_MESSAGE, errorCode: "PRIVATE_TRADING_FORBIDDEN" }, { status: 403 });
    }

    return handler(data, user, request, context);
  };

  return withAuth<T, R | NextResponse>(guarded, validator, endpoint, { bodyParser: options?.bodyParser });
}
