/**
 * @docHint
 * @purpose Private Trade Lab — 스트림 재조정 (Stream Reconciliation)
 * @process REST vs Stream 비교 → 불일치 시 REST 채택 → 감사 로그 → auto 강등
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §5.2
 * TL-303: 스트림 신선도 가드 + REST 재조정
 *
 * 스트림은 보조 신호이고 REST가 진실이다. 이 모듈은:
 * 1. 재연결 후 REST 전량 재동기화 — 스트림 공백 구간을 메운다
 * 2. REST vs MyAsset 스냅샷 비교 — 불일치 시 REST 채택, 감사 로그, auto 강등 신호
 */

import type { TradingProviderAdapter } from "types/trading/adapter";

/* ------------------------------------------------------------------ */
/* Redis 읽기 인터페이스                                                */
/* ------------------------------------------------------------------ */

export type RedisReader = {
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  get(key: string): Promise<string | null>;
};

/* ------------------------------------------------------------------ */
/* 타입                                                                */
/* ------------------------------------------------------------------ */

export type StreamReconcileResult = {
  /** 재조정이 수행되었는지 */
  reconciled: boolean;
  /** REST 값으로 대체된 자산 목록 */
  replacedAssets: string[];
  /** 감사 로그 메시지 */
  auditMessage: string;
  /** auto 전략을 paused로 강등해야 하는지 */
  shouldPause: boolean;
};

export type ResyncResult = {
  /** 동기화된 계좌 수 */
  accountsSynced: number;
  /** REST에서 가져온 보유자산 수 */
  holdingsFetched: number;
  /** 수행 시각 */
  syncedAt: Date;
};

/* ------------------------------------------------------------------ */
/* 상수                                                                */
/* ------------------------------------------------------------------ */

const MY_ASSET_HASH_KEY = "trading:upbit:myasset";

/* ------------------------------------------------------------------ */
/* REST 전량 재동기화 (재연결 후)                                         */
/* ------------------------------------------------------------------ */

/**
 * 재연결 후 REST로 계좌·보유자산을 전량 재동기화한다.
 * 스트림이 끊긴 동안 발생한 자산 변동을 REST로 메운다.
 */
export async function resyncAfterReconnect(
  adapter: TradingProviderAdapter,
): Promise<ResyncResult> {
  const accounts = await adapter.getAccounts();
  let holdingsFetched = 0;

  for (const account of accounts) {
    const holdings = await adapter.getHoldings(account.accountId);
    holdingsFetched += holdings.length;
    // holdings는 REST에서 조회한 값이다.
    // 이후 단계(TL-303 이후)에서 이 값을 DB나 Redis에 반영할 수 있다.
  }

  return {
    accountsSynced: accounts.length,
    holdingsFetched,
    syncedAt: new Date(),
  };
}

/* ------------------------------------------------------------------ */
/* MyAsset 불일치 검사 — REST 채택                                       */
/* ------------------------------------------------------------------ */

/**
 * Redis에 캐시된 MyAsset 스트림 스냅샷과 REST getHoldings()를 비교한다.
 *
 * 불일치가 발견되면:
 *   1. REST 값을 진실로 채택한다
 *   2. 감사 로그를 생성한다
 *   3. auto 전략 강등 신호(shouldPause)를 반환한다
 *
 * MyAsset 스냅샷이 아예 없으면(최초 구독 직후 등) 빈 비교 결과를 반환한다.
 */
export async function reconcileMyAsset(
  adapter: TradingProviderAdapter,
  redis: RedisReader,
): Promise<StreamReconcileResult> {
  // 1. Redis에서 MyAsset 스냅샷 읽기
  const streamAssets = await redis.hgetall(MY_ASSET_HASH_KEY);
  const hasStreamData = Object.keys(streamAssets).length > 0;

  // 2. REST에서 실제 보유자산 조회
  const accounts = await adapter.getAccounts();
  const restHoldingsMap = new Map<string, { total: string; locked: string }>();

  for (const account of accounts) {
    const holdings = await adapter.getHoldings(account.accountId);
    for (const h of holdings) {
      restHoldingsMap.set(h.asset, {
        total: h.quantity.amount,
        locked: h.locked.amount,
      });
    }
  }

  // 3. 비교
  const replacedAssets: string[] = [];
  const auditLines: string[] = [];

  for (const [currency, restValue] of restHoldingsMap) {
    const streamRaw = streamAssets[currency];
    if (!streamRaw) {
      // REST에는 있는데 스트림에는 없는 자산 — 스트림이 아직 초기 데이터를 보내지 않음
      if (hasStreamData) {
        // 스트림 데이터가 있는데 이 통화가 없으면 불일치
        replacedAssets.push(currency);
        auditLines.push(`${currency}: stream missing, REST total=${restValue.total}`);
      }
      continue;
    }

    try {
      const streamParsed = JSON.parse(streamRaw);
      const streamBalance = streamParsed.balance;
      const streamLocked = streamParsed.locked;

      // total(balance) 또는 locked 중 하나라도 불일치하면 REST 채택
      if (streamBalance !== restValue.total || streamLocked !== restValue.locked) {
        replacedAssets.push(currency);
        auditLines.push(
          `${currency}: stream(total=${streamBalance},locked=${streamLocked}) vs REST(total=${restValue.total},locked=${restValue.locked})`,
        );
      }
    } catch {
      // 파싱 실패 — 스트림 데이터 손상, REST 채택
      replacedAssets.push(currency);
      auditLines.push(`${currency}: stream parse error, REST total=${restValue.total}`);
    }
  }

  // 4. REST에는 없는데 스트림에는 있는 자산도 불일치로 처리
  for (const currency of Object.keys(streamAssets)) {
    if (!restHoldingsMap.has(currency)) {
      replacedAssets.push(currency);
      auditLines.push(`${currency}: stream only (already sold/withdrawn), REST has none`);
    }
  }

  const reconciled = replacedAssets.length > 0;
  const auditMessage = reconciled
    ? `[trading-reconcile] MyAsset 불일치 감지 (${replacedAssets.length}건): ${auditLines.join("; ")}`
    : "";

  return {
    reconciled,
    replacedAssets,
    auditMessage,
    shouldPause: reconciled, // 불일치 발생 시 auto 전략 paused 강등
  };
}
