/**
 * @docHint
 * @purpose Private Trade Lab — 접근 격리 판정 (순수 로직)
 * @process 식별자 추출  허용목록 판정  민감 동작 선언
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_094830__private-trade-lab-implementation-roadmap.md §2.1
 *
 * 이 모듈은 서버 의존성을 갖지 않는다. 판정 규칙이 인증 스택·env·Next 런타임과 얽히면
 * 규칙만 따로 검증할 수 없게 되고, 그러면 "관리자는 통과하는가" 같은 질문에 테스트로 답할 수 없다.
 * env 바인딩과 라우트 래퍼는 libs/server-utils/trading/requirePrivateTradingOwner.ts에 있다.
 */

export type PrivateTradingAccessDenyReason =
  | "NO_IDENTITY" // 세션에서 사용자 식별자를 얻지 못했다
  | "ALLOWLIST_EMPTY" // 허용목록 미설정 — fail-closed
  | "NOT_OWNER"; // 허용목록에 없다 (최고 관리자 포함)

export type PrivateTradingAccessResult = { allowed: true } | { allowed: false; reason: PrivateTradingAccessDenyReason };

/**
 * 게이트 3 — 별도 재인증(TOTP 또는 재로그인)을 요구하는 동작.
 *
 * 목록만 두고 구현은 P6에서 붙인다. 다만 목록을 미리 고정해두지 않으면
 * 각 기능이 구현될 때 "이건 민감한가"를 매번 새로 판단하게 되고, 그 판단은 느슨해진다.
 */
export const PRIVATE_TRADING_STEP_UP_ACTIONS = [
  "order.approve",
  "strategy.activate",
  "execution_mode.change",
  "risk_policy.update",
  "emergency_stop.release",
  "connection.credential.update",
] as const;
export type PrivateTradingStepUpAction = (typeof PRIVATE_TRADING_STEP_UP_ACTIONS)[number];

export function requiresStepUpVerification(action: string): action is PrivateTradingStepUpAction {
  return (PRIVATE_TRADING_STEP_UP_ACTIONS as readonly string[]).includes(action);
}

/** 사용자 객체에서 식별자를 뽑는다. auth가 권위이며 ID > uid 순으로 본다 */
export function resolveTradingUserId(user: unknown): string {
  if (!user || typeof user !== "object") return "";
  const record = user as Record<string, unknown>;
  const raw = record.ID ?? record.uid;
  return raw == null ? "" : String(raw).trim();
}

/**
 * 소유자 판정.
 *
 * **관리자 역할은 통과 조건이 아니다.** "관리자 AND 허용목록"이 아니라 "허용목록만" 검사한다 —
 * 관리자 역할 부여가 곧 투자 접근이 되면 안 되기 때문에 roles는 이 함수에 들어오지도 않는다.
 *
 * 허용목록이 비어 있으면 전원 차단한다. 미설정을 "제한 없음"으로 해석하면
 * env 누락 한 번이 곧 전면 개방이 된다.
 */
export function evaluatePrivateTradingAccess(userId: string, allowlist: readonly string[]): PrivateTradingAccessResult {
  const normalizedUser = userId.trim();
  if (!normalizedUser) return { allowed: false, reason: "NO_IDENTITY" };

  const normalizedAllowlist = allowlist.map((uid) => uid.trim()).filter(Boolean);
  if (normalizedAllowlist.length === 0) return { allowed: false, reason: "ALLOWLIST_EMPTY" };

  if (!normalizedAllowlist.includes(normalizedUser)) return { allowed: false, reason: "NOT_OWNER" };
  return { allowed: true };
}
