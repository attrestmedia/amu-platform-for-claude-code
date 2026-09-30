/**
 * @docHint
 * @purpose Private Trade Lab — 키 만료 감시 + 출금 권한 거부 (순수 판정 로직)
 * @process api_keys 파싱  만료 분류  출금 권한 프로브 분류  연결 상태·auto 승격 판정
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §4.2(출금 권한) · §7.2(trading_connections.keyExpiresAt) · HR2
 *
 * 업비트 `/v1/api_keys` 응답은 만료일(expire_at)만 반환하고 권한을 주지 않는다(공식 문서).
 * 따라서 출금 권한은 "읽기 전용 출금 조회 프로브"(GET /v1/withdraws)가 200이면 출금 계열
 * 권한이 있는 키로 판정한다. 이 모듈은 서버·네트워크 의존이 없어 규칙만 결정적으로 검증할 수 있다.
 * 실제 호출은 upbitKeyStatus.ts에 있다.
 *
 * fail-closed 원칙: 만료·권한을 확인할 수 없으면 연결을 active로 두지 않는다.
 * "권한 없는 키를 쓰는 것이 아니라, 권한 있는 키를 거부하는 것"이 핵심이다(HR2).
 */

/* ------------------------------------------------------------------ */
/* 만료 상태 분류                                                       */
/* ------------------------------------------------------------------ */

export const KEY_EXPIRY_WARN_DAYS = 30;
export const KEY_EXPIRY_BLOCK_DAYS = 7;

export type TradingKeyExpiryState = "healthy" | "warning" | "blocking" | "expired";

export type TradingKeyExpiry = {
  state: TradingKeyExpiryState;
  /** 만료까지 남은 일수(소수). expiresAt 미확인이면 null */
  daysRemaining: number | null;
};

/** 업비트 expire_at(KST `yyyy-MM-dd'T'HH:mm:ss+09:00`) → epoch ms */
export function parseUpbitExpireAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * 만료 상태 분류.
 * - healthy   : 30일 이상 남음
 * - warning   : 30일 미만(경고·알림 대상)
 * - blocking  : 7일 미만(auto 활성화 차단)
 * - expired   : 만료(연결 invalid)
 * expiresAt을 모르면 **blocking**으로 본다(fail-closed — 확인 못 한 키는 auto에 못 올린다).
 */
export function classifyKeyExpiry(expiresAt: number | null, nowMs: number): TradingKeyExpiry {
  if (expiresAt == null) return { state: "blocking", daysRemaining: null };

  const daysRemaining = (expiresAt - nowMs) / (24 * 60 * 60 * 1000);
  if (daysRemaining < 0) return { state: "expired", daysRemaining };
  if (daysRemaining < KEY_EXPIRY_BLOCK_DAYS) return { state: "blocking", daysRemaining };
  if (daysRemaining < KEY_EXPIRY_WARN_DAYS) return { state: "warning", daysRemaining };
  return { state: "healthy", daysRemaining };
}

/* ------------------------------------------------------------------ */
/* /v1/api_keys 응답 파싱                                              */
/* ------------------------------------------------------------------ */

export type UpbitApiKeyInfo = {
  accessKey: string;
  expiresAt: number | null;
};

export function parseUpbitApiKeysResponse(body: unknown): UpbitApiKeyInfo[] {
  if (!Array.isArray(body)) return [];
  const infos: UpbitApiKeyInfo[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const accessKey = typeof record.access_key === "string" ? record.access_key : "";
    const expiresAt = parseUpbitExpireAt(typeof record.expire_at === "string" ? record.expire_at : null);
    if (accessKey) infos.push({ accessKey, expiresAt });
  }
  return infos;
}

/** 키 목록에서 가장 늦은 만료 시각(가장 긴 여유를 기준으로 감시) */
export function latestKeyExpiry(infos: readonly UpbitApiKeyInfo[]): number | null {
  let latest: number | null = null;
  for (const info of infos) {
    if (info.expiresAt != null && (latest == null || info.expiresAt > latest)) latest = info.expiresAt;
  }
  return latest;
}

/* ------------------------------------------------------------------ */
/* 출금 권한 프로브 분류 — GET /v1/withdraws                            */
/* ------------------------------------------------------------------ */

export type WithdrawalPermissionProbe = "has_withdrawal" | "no_withdrawal" | "unknown";

/**
 * 프로브 응답 상태 코드 → 출금 권한 판정.
 * 200        → 출금 계열 API에 접근 가능 = 출금 권한 있는 키 (HR2 위반 → invalid)
 * 401/403    → out_of_scope/권한 부족 = 출금 권한 없는 키
 * 그 외      → 확인 불가(unknown, fail-closed)
 */
export function classifyWithdrawalProbe(status: number): WithdrawalPermissionProbe {
  if (status === 200) return "has_withdrawal";
  if (status === 401 || status === 403) return "no_withdrawal";
  return "unknown";
}

/* ------------------------------------------------------------------ */
/* 연결 상태·auto 승격 판정                                             */
/* ------------------------------------------------------------------ */

export type TradingConnectionStatus = "active" | "invalid";
export type TradingConnectionInvalidReason =
  | "WITHDRAWAL_PERMISSION"
  | "KEY_EXPIRED"
  | "KEY_EXPIRING_SOON"
  | "KEY_STATUS_UNVERIFIED";

export type TradingConnectionDecision = {
  status: TradingConnectionStatus;
  invalidReason: TradingConnectionInvalidReason | null;
};

export type ConnectionDecisionInput = {
  expiryState: TradingKeyExpiryState;
  withdrawalProbe: WithdrawalPermissionProbe;
  /** true면 출금 권한을 확인 못 한 키도 invalid(fail-closed). HR2 강제 */
  requireWithdrawalVerified?: boolean;
};

/**
 * 연결 상태 판정.
 * 우선순위: 출금 권한 보유 > 만료 > 미확인(fail-closed) > 만료 임박 > active.
 * - 출금 계열 권한이 하나라도 있으면 → invalid (HR2, §4.2)
 * - 만료 → invalid
 * - requireWithdrawalVerified=true인데 권한을 확인 못 했으면 → invalid(KEY_STATUS_UNVERIFIED)
 * - 만료 7일 미만 → invalid(KEY_EXPIRING_SOON) — auto 활성화 차단
 */
export function decideConnectionStatus(input: ConnectionDecisionInput): TradingConnectionDecision {
  if (input.withdrawalProbe === "has_withdrawal") {
    return { status: "invalid", invalidReason: "WITHDRAWAL_PERMISSION" };
  }
  if (input.expiryState === "expired") {
    return { status: "invalid", invalidReason: "KEY_EXPIRED" };
  }
  if (input.requireWithdrawalVerified && input.withdrawalProbe !== "no_withdrawal") {
    return { status: "invalid", invalidReason: "KEY_STATUS_UNVERIFIED" };
  }
  if (input.expiryState === "blocking") {
    return { status: "invalid", invalidReason: "KEY_EXPIRING_SOON" };
  }
  return { status: "active", invalidReason: null };
}

export type AutoPromotionDecision = {
  allowed: boolean;
  reason: TradingConnectionInvalidReason | null;
};

/**
 * auto(무인) 활성화 승격 차단 판정.
 * warning(30일 미만)은 차단하지 않되 알림 대상이고(외부 워크플로), blocking(7일 미만)·만료·
 * 출금 권한·미확인은 차단한다. decideConnectionStatus를 그대로 사용해 연결 상태와 정합을 유지한다.
 */
export function canPromoteToAuto(input: ConnectionDecisionInput): AutoPromotionDecision {
  const decision = decideConnectionStatus(input);
  if (decision.status === "invalid") {
    return { allowed: false, reason: decision.invalidReason };
  }
  return { allowed: true, reason: null };
}
