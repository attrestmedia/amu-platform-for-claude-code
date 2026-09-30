/**
 * @docHint
 * @purpose Private Trade Lab — Upbit Private WebSocket 스트림 (myOrder · myAsset)
 * @process JWT 인증 → 연결 → 구독 → 메시지 라우팅 → Redis 큐·스냅샷 → 재연결
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_103627__private-trade-lab-multi-asset-integration-design.md §5
 * TL-302: Private Stream — myOrder · myAsset
 *
 * 업비트 Private WS(wss://api.upbit.com/websocket/v1/private)에 JWT Bearer 인증 후
 * myOrder(주문·체결)·myAsset(자산 변동) 실시간 수신. 스트림은 보조 신호, REST가 진실(§5.2).
 *
 * myAsset 주의: 최초 구독 시 수 분간 데이터가 오지 않을 수 있다(업비트 공식).
 */

import { randomUUID } from "node:crypto";
import type { RedisWriter, WebSocketLike, UpbitPublicStreamController } from "./upbitPublicStream";

const UPBIT_WS_PRIVATE_URL = "wss://api.upbit.com/websocket/v1/private";
const PING_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_MS = 500;

/* ------------------------------------------------------------------ */
/* 타입                                                                */
/* ------------------------------------------------------------------ */

export type UpbitPrivateStreamConfig = {
  jwtFactory: () => string;
  orderSymbols?: string[];
  log?: (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => void;
  createSocket?: (url: string, headers: Record<string, string>) => WebSocketLike;
};

export type UpbitPrivateStreamController = UpbitPublicStreamController;

export const PRIVATE_STREAM_REDIS_KEYS = {
  eventQueue: "trading:events:queue",
  myAssetHash: "trading:upbit:myasset",
} as const;

/* ------------------------------------------------------------------ */
/* 메시지 타입                                                          */
/* ------------------------------------------------------------------ */

type UpbitWsMyOrder = {
  type: "myOrder"; code: string; uuid: string;
  ask_bid: "ASK" | "BID"; order_type: "limit" | "price" | "market" | "best";
  state: "wait" | "watch" | "trade" | "done" | "cancel" | "prevented";
  trade_uuid: string | null; price: number | null; avg_price: number | null;
  volume: number; remaining_volume: number; executed_volume: number;
  trades_count: number; reserved_fee: number; remaining_fee: number;
  paid_fee: number; locked: number; executed_funds: number;
  time_in_force: "ioc" | "fok" | "post_only" | null;
  trade_fee: number | null; is_maker: boolean | null;
  identifier: string | null;
  smp_type: "reduce" | "cancel_maker" | "cancel_taker" | null;
  prevented_volume: number | null; prevented_locked: number | null;
  trade_timestamp: number | null; order_timestamp: number;
  timestamp: number; stream_type: "REALTIME";
};

type UpbitWsMyAsset = {
  type: "myAsset"; asset_uuid: string;
  assets: { currency: string; balance: number; locked: number }[];
  asset_timestamp: number; timestamp: number; stream_type: "REALTIME";
};

type UpbitPrivateMessage = UpbitWsMyOrder | UpbitWsMyAsset;

/* ------------------------------------------------------------------ */
/* 구독·Redis                                                          */
/* ------------------------------------------------------------------ */

function buildPrivateSubscription(orderSymbols: string[]): string {
  const ticket = randomUUID();
  const types: unknown[] = [{ type: "myAsset" }];
  if (orderSymbols.length > 0) {
    types.push({ type: "myOrder", codes: orderSymbols });
  } else {
    types.push({ type: "myOrder" });
  }
  return JSON.stringify([{ ticket }, ...types, { format: "DEFAULT" }]);
}

async function writeOrderEvent(redis: RedisWriter, msg: UpbitWsMyOrder): Promise<void> {
  const event = JSON.stringify({
    type: "myOrder", code: msg.code, uuid: msg.uuid,
    askBid: msg.ask_bid, orderType: msg.order_type, state: msg.state,
    tradeUuid: msg.trade_uuid,
    price: msg.price != null ? String(msg.price) : null,
    volume: String(msg.volume),
    executedVolume: String(msg.executed_volume),
    remainingVolume: String(msg.remaining_volume),
    paidFee: String(msg.paid_fee),
    isMaker: msg.is_maker, identifier: msg.identifier,
    tradeTimestamp: msg.trade_timestamp,
    orderTimestamp: msg.order_timestamp,
    streamTimestamp: msg.timestamp,
  });
  await redis.lpush(PRIVATE_STREAM_REDIS_KEYS.eventQueue, event);
}

async function writeMyAssetSnapshot(redis: RedisWriter, msg: UpbitWsMyAsset): Promise<void> {
  for (const asset of msg.assets) {
    const payload = JSON.stringify({
      currency: asset.currency,
      balance: String(asset.balance),
      locked: String(asset.locked),
      assetTimestamp: msg.asset_timestamp,
      streamTimestamp: msg.timestamp,
    });
    await redis.hset(PRIVATE_STREAM_REDIS_KEYS.myAssetHash, asset.currency, payload);
  }
}


/* ------------------------------------------------------------------ */
/* 연결 관리 — startUpbitPrivateStream                                  */
/* ------------------------------------------------------------------ */

export function startUpbitPrivateStream(
  config: UpbitPrivateStreamConfig,
  redis: RedisWriter,
): UpbitPrivateStreamController {
  const log = config.log ?? (() => {});
  const orderSymbols = config.orderSymbols ?? [];
  const createSocket = config.createSocket ??
    ((url: string, headers: Record<string, string>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ws 라이브러리는 DOM WebSocket과 달리 headers 옵션을 받는다. DOM 타입과의 불일치를 우회
      new (WebSocket as any)(url, { headers }) as unknown as WebSocketLike);

  let state: UpbitPrivateStreamController["state"] = "disconnected";
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
    if (typeof raw.data !== "string") return;
    let msg: UpbitPrivateMessage;
    try {
      const obj = JSON.parse(raw.data);
      if (obj?.error) return;
      const parsed: unknown = Array.isArray(obj) ? obj[0] : obj;
      if (!parsed || typeof parsed !== "object") return;
      if (!("type" in (parsed as Record<string, unknown>))) return;
      msg = parsed as UpbitPrivateMessage;
    } catch { return; }

    try {
      if (msg.type === "myOrder") await writeOrderEvent(redis, msg);
      else if (msg.type === "myAsset") await writeMyAssetSnapshot(redis, msg);
    } catch (err) {
      log("warn", "privateStream redis write failed", {
        type: msg.type, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function connect() {
    if (stopping) return;
    state = "connecting";
    try {
      const jwt = config.jwtFactory();
      socket = createSocket(UPBIT_WS_PRIVATE_URL, { Authorization: `Bearer ${jwt}` });
    } catch (err) {
      log("error", "privateStream socket creation failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      state = "connected";
      reconnectAttempt = 0;
      log("info", "privateStream connected");
      try { socket!.send(buildPrivateSubscription(orderSymbols)); } catch {
        log("error", "privateStream subscription send failed");
      }
      pingTimer = setInterval(() => {
        if (socket && socket.readyState === 1) {
          try { socket.send(""); } catch { /* ignore */ }
        }
      }, PING_INTERVAL_MS);
    });

    socket.addEventListener("message", (event) => {
      handleMessage(event).catch((err) => {
        log("warn", "privateStream handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    socket.addEventListener("close", (event) => {
      log("warn", "privateStream disconnected", { code: event.code, reason: event.reason });
      clearTimers();
      socket = null;
      if (!stopping) { state = "disconnected"; scheduleReconnect(); }
    });

    socket.addEventListener("error", (event) => {
      log("warn", "privateStream error", { message: event.message ?? "unknown" });
    });
  }

  function scheduleReconnect() {
    if (stopping || state === "stopped") return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS,
    ) + Math.floor(Math.random() * RECONNECT_JITTER_MS);
    reconnectAttempt++;
    log("info", "privateStream reconnecting", { attempt: reconnectAttempt, delayMs: delay });
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();

  return {
    stop() {
      stopping = true; state = "stopped"; closeSocket();
      log("info", "privateStream stopped");
    },
    get state() { return state; },
  };
}
