/**
 * @docHint
 * @purpose Private Trade Lab — Upbit 공개 WebSocket 스트림 (ticker · orderbook · candle)
 * @process 연결 → 구독 → PING/PONG → 메시지 라우팅 → Redis 스냅샷 → 재연결
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_103627__private-trade-lab-multi-asset-integration-design.md §5
 * TL-301: Public Stream — ticker · orderbook · candle
 *
 * 업비트 공개 WebSocket(wss://api.upbit.com/websocket/v1)에 연결해
 * ticker(현재가)·orderbook(호가)·candle(캔들) 데이터를 실시간 수신하고
 * Redis 스냅샷을 갱신한다. 인증 불필요(public endpoint).
 *
 * 스트림은 보조 신호다. REST가 진실이며, 이 모듈은 데이터 신선도 가드와
 * 실시간 확인용으로만 사용한다(통합 보고서 §3.1·§5.2).
 *
 * 연결 관리:
 *   - PING 30초 주기 (업비트 서버는 120초 무통신 시 연결 종료)
 *   - 연결 종료 감지 시 지수 백오프 재연결 (1s→2s→4s→...→30s cap)
 *   - 재연결 후 전량 재구독
 */

import { randomUUID } from "node:crypto";
import type { Candle } from "types/trading/adapter";
import { computeCandleFinality } from "./tradingCandleFinality";

/* ------------------------------------------------------------------ */
/* 상수                                                                */
/* ------------------------------------------------------------------ */

const UPBIT_WS_PUBLIC_URL = "wss://api.upbit.com/websocket/v1";
const PING_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_MS = 500;

/* ------------------------------------------------------------------ */
/* 타입                                                                */
/* ------------------------------------------------------------------ */

export type UpbitPublicStreamConfig = {
  symbols: string[];
  candleIntervals?: string[];
  log?: (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => void;
  createSocket?: (url: string) => WebSocketLike;
};

export interface WebSocketLike {
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code: number; reason: string }) => void): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
  removeEventListener(type: string, listener: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
}

export type RedisWriter = {
  setex(key: string, ttl: number, value: string): Promise<unknown>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  lpush(key: string, value: string): Promise<unknown>;
};

export type UpbitPublicStreamController = {
  stop: () => void;
  readonly state: "connecting" | "connected" | "disconnected" | "stopped";
};

/* ------------------------------------------------------------------ */
/* Redis 키 규칙                                                        */
/* ------------------------------------------------------------------ */

export const STREAM_REDIS_KEYS = {
  quote: (symbol: string) => `trading:upbit:quote:${symbol}`,
  orderbook: (symbol: string) => `trading:upbit:orderbook:${symbol}`,
  candle: (symbol: string, interval: string) => `trading:upbit:candle:${symbol}:${interval}`,
  health: "trading:stream:health",
} as const;

export const STREAM_QUOTE_TTL = 10;
export const STREAM_ORDERBOOK_TTL = 30;
export const STREAM_CANDLE_TTL = 300;

/* ------------------------------------------------------------------ */
/* 메시지 파싱 타입                                                     */
/* ------------------------------------------------------------------ */

type UpbitWsTicker = {
  type: "ticker"; code: string; trade_price: number; trade_timestamp: number;
  signed_change_price: number; signed_change_rate: number; change: string;
  stream_type: "SNAPSHOT" | "REALTIME";
};

type UpbitWsOrderbook = {
  type: "orderbook"; code: string; timestamp: number;
  total_ask_size: number; total_bid_size: number;
  orderbook_units: { ask_price: number; bid_price: number; ask_size: number; bid_size: number }[];
  stream_type: "SNAPSHOT" | "REALTIME"; level: number;
};

type UpbitWsCandle = {
  type: string; code: string; candle_date_time_utc: string; candle_date_time_kst: string;
  opening_price: number; high_price: number; low_price: number; trade_price: number;
  candle_acc_trade_volume: number; candle_acc_trade_price: number;
  timestamp: number; stream_type: "SNAPSHOT" | "REALTIME";
};

type UpbitWsMessage = UpbitWsTicker | UpbitWsOrderbook | UpbitWsCandle;


/* ------------------------------------------------------------------ */
/* 구독 메시지 생성                                                     */
/* ------------------------------------------------------------------ */

function buildSubscriptionMessage(symbols: string[], candleIntervals: string[]): string {
  const ticket = randomUUID();
  const types: unknown[] = [];

  if (symbols.length > 0) {
    types.push({ type: "ticker", codes: symbols });
    types.push({ type: "orderbook", codes: symbols });
  }
  for (const interval of candleIntervals) {
    types.push({ type: `candle.${interval}`, codes: symbols });
  }

  return JSON.stringify([{ ticket }, ...types, { format: "DEFAULT" }]);
}

/* ------------------------------------------------------------------ */
/* 메시지 파싱                                                          */
/* ------------------------------------------------------------------ */

function parseWsMessage(data: unknown): UpbitWsMessage | null {
  if (typeof data !== "string") return null;
  try {
    const obj = JSON.parse(data);
    if (obj?.error) return null;
    const msg: unknown = Array.isArray(obj) ? obj[0] : obj;
    if (!msg || typeof msg !== "object" || !("type" in (msg as Record<string, unknown>))) return null;
    return msg as UpbitWsMessage;
  } catch {
    return null;
  }
}

function extractInterval(wsType: string): string | null {
  const match = /^candle\.(.+)$/.exec(wsType);
  return match ? match[1] : null;
}

/* ------------------------------------------------------------------ */
/* Redis 스냅샷 갱신                                                    */
/* ------------------------------------------------------------------ */

async function writeTickerSnapshot(redis: RedisWriter, msg: UpbitWsTicker): Promise<void> {
  const key = STREAM_REDIS_KEYS.quote(msg.code);
  const payload = JSON.stringify({
    symbol: msg.code,
    price: String(msg.trade_price),
    change: msg.change,
    changePrice: String(msg.signed_change_price),
    changeRate: String(msg.signed_change_rate),
    at: new Date(msg.trade_timestamp).toISOString(),
    streamType: msg.stream_type,
  });
  await redis.setex(key, STREAM_QUOTE_TTL, payload);
}

async function writeOrderbookSnapshot(redis: RedisWriter, msg: UpbitWsOrderbook): Promise<void> {
  const key = STREAM_REDIS_KEYS.orderbook(msg.code);
  const bids = msg.orderbook_units.map((u) => ({ price: String(u.bid_price), size: String(u.bid_size) }));
  const asks = msg.orderbook_units.map((u) => ({ price: String(u.ask_price), size: String(u.ask_size) }));
  const payload = JSON.stringify({
    symbol: msg.code, bids, asks,
    totalBidSize: String(msg.total_bid_size),
    totalAskSize: String(msg.total_ask_size),
    at: new Date(msg.timestamp).toISOString(),
    streamType: msg.stream_type,
    level: msg.level,
  });
  await redis.setex(key, STREAM_ORDERBOOK_TTL, payload);
}

async function writeCandleSnapshot(redis: RedisWriter, msg: UpbitWsCandle): Promise<void> {
  const interval = extractInterval(msg.type);
  if (!interval) return;
  const key = STREAM_REDIS_KEYS.candle(msg.code, interval);
  const openTime = new Date(msg.candle_date_time_utc + "Z");
  const candle: Candle = {
    symbol: msg.code, interval, openTime,
    open: String(msg.opening_price), high: String(msg.high_price),
    low: String(msg.low_price), close: String(msg.trade_price),
    volume: String(msg.candle_acc_trade_volume),
    isFinal: computeCandleFinality(openTime, interval),
  };
  await redis.setex(key, STREAM_CANDLE_TTL, JSON.stringify(candle));
}

async function updateStreamHealth(
  redis: RedisWriter, streamType: string, symbol: string,
): Promise<void> {
  const now = new Date().toISOString();
  const field = streamType === "ticker" ? "lastTickerAt"
    : streamType === "orderbook" ? "lastOrderbookAt"
    : "lastCandleAt";
  await redis.hset(STREAM_REDIS_KEYS.health, field, now);
  await redis.hset(STREAM_REDIS_KEYS.health, `${field}Symbol`, symbol);
}


/* ------------------------------------------------------------------ */
/* 연결 관리 — startUpbitPublicStream                                   */
/* ------------------------------------------------------------------ */

export function startUpbitPublicStream(
  config: UpbitPublicStreamConfig,
  redis: RedisWriter,
): UpbitPublicStreamController {
  const log = config.log ?? (() => {});
  const symbols = config.symbols;
  const candleIntervals = config.candleIntervals ?? [];
  const createSocket = config.createSocket ??
    ((url: string) => new WebSocket(url) as unknown as WebSocketLike);

  let state: UpbitPublicStreamController["state"] = "disconnected";
  let socket: WebSocketLike | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let stopping = false;

  function clearTimers() {
    if (pingTimer != null) { clearInterval(pingTimer); pingTimer = null; }
    if (reconnectTimer != null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function closeSocket() {
    clearTimers();
    if (socket) {
      try { socket.close(1000, "client shutdown"); } catch { /* ignore */ }
      socket = null;
    }
  }

  async function handleMessage(raw: { data: unknown }) {
    const msg = parseWsMessage(raw.data);
    if (!msg) return;
    const streamType = msg.type.startsWith("candle.") ? "candle" : msg.type;

    try {
      if (streamType === "ticker") {
        await writeTickerSnapshot(redis, msg as UpbitWsTicker);
        await updateStreamHealth(redis, "ticker", msg.code);
      } else if (streamType === "orderbook") {
        await writeOrderbookSnapshot(redis, msg as UpbitWsOrderbook);
        await updateStreamHealth(redis, "orderbook", msg.code);
      } else if (streamType === "candle") {
        await writeCandleSnapshot(redis, msg as UpbitWsCandle);
        await updateStreamHealth(redis, "candle", msg.code);
      }
    } catch (err) {
      log("warn", "upbitPublicStream redis write failed", {
        streamType, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function connect() {
    if (stopping) return;
    state = "connecting";
    try {
      socket = createSocket(UPBIT_WS_PUBLIC_URL);
    } catch (err) {
      log("error", "upbitPublicStream socket creation failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      state = "connected";
      reconnectAttempt = 0;
      log("info", "upbitPublicStream connected", { symbols, candleIntervals });
      try {
        socket!.send(buildSubscriptionMessage(symbols, candleIntervals));
      } catch (err) {
        log("error", "upbitPublicStream subscription failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      pingTimer = setInterval(() => {
        if (socket && socket.readyState === 1) {
          try { socket.send(""); } catch { /* ignore */ }
        }
      }, PING_INTERVAL_MS);
    });

    socket.addEventListener("message", (event) => {
      handleMessage(event).catch((err) => {
        log("warn", "upbitPublicStream message handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    socket.addEventListener("close", (event) => {
      log("warn", "upbitPublicStream disconnected", { code: event.code, reason: event.reason });
      clearTimers();
      socket = null;
      if (!stopping) {
        state = "disconnected";
        scheduleReconnect();
      }
    });

    socket.addEventListener("error", (event) => {
      log("warn", "upbitPublicStream error", { message: event.message ?? "unknown" });
    });
  }

  function scheduleReconnect() {
    if (stopping || state === "stopped") return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS,
    ) + Math.floor(Math.random() * RECONNECT_JITTER_MS);
    reconnectAttempt++;
    log("info", "upbitPublicStream reconnecting", { attempt: reconnectAttempt, delayMs: delay });
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();

  return {
    stop() {
      stopping = true;
      state = "stopped";
      closeSocket();
      log("info", "upbitPublicStream stopped");
    },
    get state() { return state; },
  };
}
