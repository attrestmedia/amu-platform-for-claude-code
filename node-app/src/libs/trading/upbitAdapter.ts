/**
 * @docHint
 * @purpose Private Trade Lab — UpbitAdapter (TradingProviderAdapter 구현체)
 * @process 자격증명 주입  JWT 서명  REST 호출  공통 계약 매핑
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_103627__private-trade-lab-multi-asset-integration-design.md
 * TL-200: verifyConnection · getAccounts · getHoldings
 * TL-201: listInstruments (마켓 마스터)
 * TL-202: getSessionState · getCandles · getQuotes · getOrderbook
 *
 * 업비트 Open API와 TradingProviderAdapter 계약 사이를 매핑하는 어댑터다.
 * 토스와 달리 토큰 캐시·분산 락이 필요 없다 — 요청마다 JWT로 독립 서명한다.
 *
 * fetchImpl을 주입받아 테스트에서 네트워크 없이 결정론적 검증이 가능하다.
 * 후속 phase(TL-201~TL-204)에서 나머지 메서드가 구현되며, 현재는 명시적 에러를 throw한다.
 */

import { UPBIT_CAPABILITIES } from "consts/trading/capabilities";
import type {
  Candle,
  CandleRequest,
  ConnectionVerifyResult,
  Holding,
  Orderbook,
  OrderbookLevel,
  ProviderAccount,
  ProviderKeyStatus,
  Quote,
  SessionState,
  TradingInstrument,
  TradingProviderAdapter,
} from "types/trading/adapter";
import { computeCandleFinality } from "./tradingCandleFinality";
import { createUpbitAuthorizationHeader } from "./upbitJwtSigner";
import { getUpbitKeyStatus, type UpbitCredentials } from "./upbitKeyStatus";
import { classifyKeyExpiry } from "./tradingKeyStatus";

/* ------------------------------------------------------------------ */
/* 상수                                                                */
/* ------------------------------------------------------------------ */

const UPBIT_API_BASE = "https://api.upbit.com";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/* ------------------------------------------------------------------ */
/* HTTP 헬퍼                                                           */
/* ------------------------------------------------------------------ */

async function authedGet(path: string, credentials: UpbitCredentials, fetchImpl: FetchLike): Promise<Response> {
  return fetchImpl(`${UPBIT_API_BASE}${path}`, {
    headers: {
      Authorization: createUpbitAuthorizationHeader({ accessKey: credentials.accessKey, secretKey: credentials.secretKey }),
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

async function authedGetJson<T = unknown>(
  path: string, credentials: UpbitCredentials, fetchImpl: FetchLike,
): Promise<{ ok: true; body: T } | { ok: false; status: number; body: unknown }> {
  const response = await authedGet(path, credentials, fetchImpl);
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, body: body as T };
  return { ok: false, status: response.status, body };
}

/**
 * 쿼리 파라미터가 필요한 GET 요청.
 * 업비트 JWT 서명은 쿼리스트링을 query_hash에 포함해야 하므로,
 * 쿼리를 URL과 JWT 양쪽에 동일하게 전달한다.
 */
async function authedGetWithQuery<T = unknown>(
  path: string, query: Record<string, string>, credentials: UpbitCredentials, fetchImpl: FetchLike,
): Promise<{ ok: true; body: T } | { ok: false; status: number; body: unknown }> {
  const qs = new URLSearchParams(query).toString();
  const response = await fetchImpl(`${UPBIT_API_BASE}${path}?${qs}`, {
    headers: {
      Authorization: createUpbitAuthorizationHeader({
        accessKey: credentials.accessKey,
        secretKey: credentials.secretKey,
        query: query as Record<string, string | number | boolean | readonly string[] | readonly number[] | null | undefined>,
      }),
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, body: body as T };
  return { ok: false, status: response.status, body };
}


/* ------------------------------------------------------------------ */
/* interval → Upbit API 경로 매핑                                      */
/* ------------------------------------------------------------------ */

const CANDLE_PATH_MAP: Record<string, string> = {
  "1m": "minutes/1",
  "3m": "minutes/3",
  "5m": "minutes/5",
  "10m": "minutes/10",
  "15m": "minutes/15",
  "30m": "minutes/30",
  "60m": "minutes/60",
  "240m": "minutes/240",
  "1d": "days",
  "1w": "weeks",
  "1M": "months",
};

/* ------------------------------------------------------------------ */
/* 응답 파싱                                                            */
/* ------------------------------------------------------------------ */

type UpbitAccount = {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
  avg_buy_price_modified: boolean;
  unit_currency: string;
};

function guessScale(currency: string): number {
  return currency === "KRW" ? 0 : UPBIT_CAPABILITIES.defaultQuantityScale;
}

type UpbitCandle = {
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_volume: number;
  candle_acc_trade_price: number;
  timestamp: number;
  unit: number;
};

type UpbitTicker = {
  market: string;
  trade_price: number;
  trade_timestamp: number;
};

type UpbitOrderbookUnit = {
  ask_price: number;
  bid_price: number;
  ask_size: number;
  bid_size: number;
};

type UpbitOrderbookResponse = {
  market: string;
  timestamp: number;
  orderbook_units: UpbitOrderbookUnit[];
};

/**
 * REST 캔들은 확정된 봉만 반환하지만, 최종 봉이 닫힌 시점을 초과했는지 검증해 isFinal을 확정한다.
 * WebSocket과 동일한 computeCandleFinality 로직을 사용해 계약을 통일한다.
 */
function parseUpbitCandle(raw: UpbitCandle, interval: string): Candle {
  const openTime = new Date(raw.candle_date_time_utc + "Z");
  const isFinal = computeCandleFinality(openTime, interval);
  return {
    symbol: raw.market,
    interval,
    openTime,
    open: String(raw.opening_price),
    high: String(raw.high_price),
    low: String(raw.low_price),
    close: String(raw.trade_price),
    volume: String(raw.candle_acc_trade_volume),
    isFinal,
  };
}

function parseUpbitQuotes(body: unknown): Quote[] {
  if (!Array.isArray(body)) return [];
  return body
    .filter((item): item is UpbitTicker => item != null && typeof item === "object" && "market" in item && "trade_price" in item)
    .map((raw) => ({
      symbol: raw.market,
      price: String(raw.trade_price),
      at: raw.trade_timestamp ? new Date(raw.trade_timestamp) : new Date(),
    }));
}

function parseUpbitOrderbook(body: unknown): Orderbook | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0] as UpbitOrderbookResponse;
  if (!first?.orderbook_units) return null;

  const bids: OrderbookLevel[] = [];
  const asks: OrderbookLevel[] = [];
  for (const unit of first.orderbook_units) {
    bids.push({ price: String(unit.bid_price), size: String(unit.bid_size) });
    asks.push({ price: String(unit.ask_price), size: String(unit.ask_size) });
  }
  return {
    symbol: first.market,
    bids,
    asks,
    at: new Date(first.timestamp),
  };
}

/* ------------------------------------------------------------------ */
/* instruments — TL-201                                                */
/* ------------------------------------------------------------------ */

type UpbitMarket = {
  market: string;
  korean_name: string;
  english_name: string;
  market_warning: string;
};

function parseUpbitMarkets(body: unknown): UpbitMarket[] {
  if (!Array.isArray(body)) return [];
  return body.filter(
    (item): item is UpbitMarket =>
      item != null && typeof item === "object" &&
      typeof (item as Record<string, unknown>).market === "string",
  ) as UpbitMarket[];
}

/** 업비트 "KRW-BTC" → base="BTC", quote="KRW" */
function splitMarketPair(market: string): { base: string; quote: string } | null {
  const idx = market.indexOf("-");
  if (idx <= 0 || idx >= market.length - 1) return null;
  return { base: market.slice(idx + 1), quote: market.slice(0, idx) };
}

/**
 * 호가 단위 기본값. 업비트 표준 가격 단계표 기반 (TL-106).
 * 실제 값은 /v1/orderbook/instruments로 개별 확인해야 하며,
 * 주기 갱신 크론이 trading_instruments를 덮어쓴다.
 */
function defaultTickSize(quoteAsset: string): string {
  switch (quoteAsset) {
    case "KRW": return "1";
    case "BTC": return "0.00000001";
    case "USDT": return "0.0001";
    default: return "0.00000001";
  }
}

/** 최소 주문금액 기본값 (quoteAsset 기준) */
function defaultMinOrderAmount(quoteAsset: string): string {
  switch (quoteAsset) {
    case "KRW": return "5000";
    case "BTC": return "0.0005";
    case "USDT": return "5";
    default: return "5";
  }
}

/** 가격 scale — quoteAsset 기준 */
function priceScale(quoteAsset: string): number {
  switch (quoteAsset) {
    case "KRW": return 0;
    case "BTC": return 8;
    case "USDT": return 2;
    default: return 8;
  }
}

/* ------------------------------------------------------------------ */
/* 미구현 스텁                                                         */
/* ------------------------------------------------------------------ */

function notImplemented(method: string): () => never {
  return () => {
    throw new Error(`[upbitAdapter] ${method}()는 TL-200 범위 밖입니다. 후속 phase에서 구현됩니다.`);
  };
}

/* ------------------------------------------------------------------ */
/* 어댑터 팩토리                                                        */
/* ------------------------------------------------------------------ */

/**
 * TL-200 — UpbitAdapter 생성.
 * fetchImpl을 주입하지 않으면 전역 fetch를 사용한다.
 * 테스트에서는 가짜 fetch를 주입해 네트워크 없이 결정론적 검증을 한다.
 */
export function createUpbitAdapter(
  credentials: UpbitCredentials,
  fetchImpl: FetchLike = fetch,
): TradingProviderAdapter {
  const provider = "upbit" as const;
  const assetClass = "crypto" as const;

  async function verifyConnection(): Promise<ConnectionVerifyResult> {
    const checkedAt = new Date();
    try {
      const result = await authedGetJson("/v1/api_keys", credentials, fetchImpl);
      if (!result.ok) {
        const bodyStr =
          result.body && typeof result.body === "object"
            ? String(((result.body as Record<string, unknown>).error as Record<string, unknown> | undefined)?.name ?? result.status)
            : String(result.status);
        return { valid: false, code: `UPBIT_HTTP_${result.status}`, message: bodyStr, checkedAt };
      }
      return { valid: true, checkedAt };
    } catch (error) {
      const name = error instanceof Error ? error.name : "UNKNOWN";
      if (name === "TimeoutError" || name === "AbortError") {
        return { valid: false, code: "UPBIT_TIMEOUT", message: "요청 시간 초과", checkedAt };
      }
      return { valid: false, code: "UPBIT_NETWORK", message: error instanceof Error ? error.message : "네트워크 오류", checkedAt };
    }
  }

  async function getKeyStatus(): Promise<ProviderKeyStatus> {
    const status = await getUpbitKeyStatus(credentials, fetchImpl);
    const nowMs = Date.now();
    classifyKeyExpiry(status.expiresAt, nowMs); // 만료 상태 확인 (사이드이펙트 없음, 판정만)

    const permissions: string[] = [];
    if (status.withdrawalProbe === "has_withdrawal") permissions.push("withdraw");
    if (status.withdrawalProbe === "no_withdrawal") permissions.push("trade", "query");

    return {
      expiresAt: status.expiresAt != null ? new Date(status.expiresAt) : undefined,
      permissions,
      permissionsIntrospectable: true,
    };
  }

  async function getAccounts(): Promise<ProviderAccount[]> {
    const result = await authedGetJson<UpbitAccount[]>("/v1/accounts", credentials, fetchImpl);
    if (!result.ok) return [];
    const krwAccount = result.body.find((a) => a.currency === "KRW");
    const currency = krwAccount ? "KRW" : "BTC";
    return [{ provider: "upbit", accountId: "upbit:main", assetClass: "crypto", currency }];
  }

  async function getHoldings(accountId: string): Promise<Holding[]> {
    if (accountId !== "upbit:main") return [];
    const result = await authedGetJson<UpbitAccount[]>("/v1/accounts", credentials, fetchImpl);
    if (!result.ok) return [];
    return result.body.map((raw) => {
      const scale = guessScale(raw.currency);
      return {
        accountId: "upbit:main",
        asset: raw.currency,
        quantity: { asset: raw.currency, amount: raw.balance, scale },
        locked: { asset: raw.currency, amount: raw.locked, scale },
        avgBuyPrice: raw.avg_buy_price,
        managedBy: "unknown" as const,
      };
    });
  }

  // TL-201 — market master sync
  async function listInstruments(): Promise<TradingInstrument[]> {
    const result = await authedGetJson("/v1/market/all", credentials, fetchImpl);
    if (!result.ok) return [];
    const markets = parseUpbitMarkets(result.body);

    return markets
      .map((m) => {
        const pair = splitMarketPair(m.market);
        if (!pair) return null;
        const qtyScale = guessScale(pair.base);
        const pScale = priceScale(pair.quote);
        return {
          provider: "upbit" as const,
          assetClass: "crypto" as const,
          symbol: m.market,
          baseAsset: pair.base,
          quoteAsset: pair.quote,
          quantityScale: qtyScale,
          priceScale: pScale,
          tickSize: defaultTickSize(pair.quote),
          minOrderAmount: defaultMinOrderAmount(pair.quote),
          warning: m.market_warning === "CAUTION",
          tradable: m.market_warning !== "CAUTION",
        } satisfies TradingInstrument;
      })
      .filter((item): item is NonNullable<typeof item> => item != null) as TradingInstrument[];
  }

  // TL-202 — 시세·호가·캔들 REST 조회
  async function getSessionState(_at: Date): Promise<SessionState> {
    return { open: true, sessionType: "kst_day", nextOpenAt: null, nextCloseAt: null };
  }

  async function getCandles(req: CandleRequest): Promise<Candle[]> {
    const unit = CANDLE_PATH_MAP[req.interval];
    if (!unit) return [];
    const query: Record<string, string> = { market: req.symbol, count: String(req.count) };
    if (req.to) query.to = req.to.toISOString();
    const result = await authedGetWithQuery<UpbitCandle[]>(`/v1/candles/${unit}`, query, credentials, fetchImpl);
    if (!result.ok) return [];
    return result.body.map((raw) => parseUpbitCandle(raw, req.interval));
  }

  async function getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    const result = await authedGetWithQuery<UpbitTicker[]>("/v1/ticker", { markets: symbols.join(",") }, credentials, fetchImpl);
    if (!result.ok) return [];
    return parseUpbitQuotes(result.body);
  }

  async function getOrderbook(symbol: string): Promise<Orderbook> {
    const result = await authedGetWithQuery<UpbitOrderbookResponse[]>("/v1/orderbook", { markets: symbol }, credentials, fetchImpl);
    if (!result.ok) return { symbol, bids: [], asks: [], at: new Date() };
    return parseUpbitOrderbook(result.body) ?? { symbol, bids: [], asks: [], at: new Date() };
  }

  return {
    provider,
    assetClass,
    capabilities: UPBIT_CAPABILITIES,

    // TL-200 — 구현 완료
    verifyConnection,
    getKeyStatus,
    getAccounts,
    getHoldings,

    // TL-201 — 구현 완료
    listInstruments,

    // TL-202 — 구현 완료
    getCandles,
    getQuotes,
    getOrderbook,
    getSessionState,

    // P6 (후속)
    getOrderableInfo: notImplemented("getOrderableInfo"),

    testOrder: notImplemented("testOrder"),
    submitOrder: notImplemented("submitOrder"),
    cancelOrder: notImplemented("cancelOrder"),
    replaceOrder: notImplemented("replaceOrder"),
    findOrderByClientId: notImplemented("findOrderByClientId"),
    listOpenOrders: notImplemented("listOpenOrders"),

    newClientOrderId: notImplemented("newClientOrderId"),
  };
}

