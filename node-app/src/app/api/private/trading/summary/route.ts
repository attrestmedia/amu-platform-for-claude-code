import { NextResponse } from "next/server";
import { withPrivateTradingOwner } from "libs/server-utils/trading/requirePrivateTradingOwner";

/**
 * @docHint
 * @purpose Private Trade Lab — 대시보드 통합 요약 API (TL-203 + TL-204)
 * @process DB 조회(connections·instruments·notifications)  어댑터 조회(잔고)  키 만료 체크  응답 조립
 * @domain trading
 * @scope private-trade-lab
 */

export const runtime = "nodejs";

type SummaryResponse = {
  connections: Array<{
    provider: string;
    assetClass: string;
    status: string;
    invalidReason?: string;
    keyExpiresAt: string | null;
    keyDaysRemaining: number | null;
    lastCheckedAt: string | null;
  }>;
  instruments: { upbit: number; toss_securities: number };
  holdings: Array<{
    asset: string;
    total: string;
    locked: string;
    avgBuyPrice: string | null;
    managedBy: string;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    severity: string;
    provider?: string;
    title: string;
    detail: string;
    read: boolean;
    createdAt: string | null;
  }>;
  unreadCount: number;
  /** TL-304: 스트림 상태 */
  streamStatus: {
    lastTickerAt: string | null;
    lastOrderbookAt: string | null;
    lastCandleAt: string | null;
    lastTickerSymbol: string | null;
    lastOrderbookSymbol: string | null;
    lastCandleSymbol: string | null;
    wsConnected: boolean;
  };
  /** TL-304: 레이트 리미트 스냅샷 */
  rateLimits: Array<{
    provider: string;
    group: string;
    ratePerSecond: number;
    burst: number;
    remaining: number;
  }>;
  errors: string[];
};

function safeDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function safeString(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

async function fetchConnections() {
  try {
    const { TradingConnectionSchema } = await import("models/trading");
    const mongoose = await import("mongoose");
    const Model = mongoose.models.TradingConnection ?? mongoose.model("TradingConnection", TradingConnectionSchema);
    const docs = await Model.find({}).lean();
    return docs.map((doc: Record<string, unknown>) => {
      const keyExpiresAt = safeDate(doc.keyExpiresAt);
      const daysRemaining = keyExpiresAt
        ? Math.ceil((keyExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        provider: safeString(doc.provider),
        assetClass: safeString(doc.assetClass),
        status: safeString(doc.status) || "unknown",
        invalidReason: doc.invalidReason ? safeString(doc.invalidReason) : undefined,
        keyExpiresAt: keyExpiresAt?.toISOString() ?? null,
        keyDaysRemaining: daysRemaining,
        lastCheckedAt: doc.lastKeyStatusCheckedAt
          ? safeDate(doc.lastKeyStatusCheckedAt)?.toISOString() ?? null
          : null,
      };
    });
  } catch { return []; }
}

async function fetchInstrumentCounts() {
  try {
    const { TradingInstrumentSchema } = await import("models/trading");
    const mongoose = await import("mongoose");
    const Model = mongoose.models.TradingInstrument ?? mongoose.model("TradingInstrument", TradingInstrumentSchema);
    return {
      upbit: await Model.countDocuments({ provider: "upbit", tradable: true }),
      toss_securities: await Model.countDocuments({ provider: "toss_securities", tradable: true }),
    };
  } catch { return { upbit: 0, toss_securities: 0 }; }
}

async function fetchHoldings(): Promise<SummaryResponse["holdings"]> {
  try {
    const { resolvePlatformCredential } = await import("libs/server-utils/secure/platformCredentialResolver");
    const { createUpbitAdapter } = await import("libs/trading/upbitAdapter");
    const { payload } = await resolvePlatformCredential("trading.upbit.exchange");
    if (!payload.accessKey || !payload.secretKey) return [];
    const adapter = createUpbitAdapter({ accessKey: safeString(payload.accessKey), secretKey: safeString(payload.secretKey) });
    const holdings = await adapter.getHoldings("upbit:main");
    return holdings
      .filter((h) => { const t = parseFloat(h.quantity.amount); return !isNaN(t) && t > 0; })
      .map((h) => ({ asset: h.asset, total: h.quantity.amount, locked: h.locked.amount, avgBuyPrice: h.avgBuyPrice, managedBy: h.managedBy }));
  } catch { return []; }
}

async function fetchNotifications() {
  try {
    const { getRecentNotifications, getUnreadNotificationCount } = await import("libs/server-utils/trading/notifyTradingEvent");
    const [notifications, unreadCount] = await Promise.all([
      getRecentNotifications(10),
      getUnreadNotificationCount(),
    ]);
    return { notifications, unreadCount };
  } catch {
    return { notifications: [], unreadCount: 0 };
  }
}

async function checkKeyExpiryAndNotify(connections: SummaryResponse["connections"]) {
  const { notifyTradingEvent } = await import("libs/server-utils/trading/notifyTradingEvent");
  for (const conn of connections) {
    if (conn.keyDaysRemaining === null) continue;
    if (conn.keyDaysRemaining <= 0 && conn.status === "active") {
      await notifyTradingEvent({
        type: "key_expired", severity: "critical", provider: conn.provider,
        title: `${conn.provider} API 키 만료`,
        detail: `${conn.provider} 키가 만료되었습니다. 새 키를 발급하고 자격증명을 갱신하세요.`,
      });
    } else if (conn.keyDaysRemaining <= 7 && conn.status === "active") {
      await notifyTradingEvent({
        type: "key_expiry_critical", severity: "critical", provider: conn.provider,
        title: `${conn.provider} API 키 만료 임박 (D-${conn.keyDaysRemaining})`,
        detail: `${conn.keyDaysRemaining}일 후 키가 만료됩니다. 지금 갱신하지 않으면 자동매매가 중단됩니다.`,
      });
    } else if (conn.keyDaysRemaining <= 30 && conn.status === "active") {
      await notifyTradingEvent({
        type: "key_expiry_warning", severity: "warn", provider: conn.provider,
        title: `${conn.provider} API 키 ${conn.keyDaysRemaining}일 후 만료`,
        detail: `키 만료까지 ${conn.keyDaysRemaining}일 남았습니다. 미리 갱신을 준비하세요.`,
      });
    }
  }
}

// GET /api/private/trading/summary
export const GET = withPrivateTradingOwner(
  async () => {
    const errors: string[] = [];

    const connections = await fetchConnections();
    if (connections.length === 0) errors.push("trading_connections 조회 실패 또는 데이터 없음");

    const instruments = await fetchInstrumentCounts();
    if (instruments.upbit === 0 && instruments.toss_securities === 0) {
      errors.push("trading_instruments 조회 실패 또는 데이터 없음");
    }

    const holdings = await fetchHoldings();
    const { notifications, unreadCount } = await fetchNotifications();

    // TL-304: 스트림 상태 + 레이트 리미트
    const streamStatus = await fetchStreamStatus().catch(() => defaultStreamStatus());
    const rateLimits = await fetchRateLimits().catch(() => [] as SummaryResponse["rateLimits"]);

    // 키 만료 알림 체크
    checkKeyExpiryAndNotify(connections).catch(() => null);

    const body: SummaryResponse = {
      connections, instruments, holdings, notifications, unreadCount,
      streamStatus, rateLimits, errors,
    };
    return NextResponse.json(body);
  },
  undefined,
  "private_trading_summary",
  { bodyParser: "none" },
);

/* ------------------------------------------------------------------ */
/* TL-304: 스트림 상태 + 레이트 리미트                                    */
/* ------------------------------------------------------------------ */

function defaultStreamStatus(): SummaryResponse["streamStatus"] {
  return {
    lastTickerAt: null, lastOrderbookAt: null, lastCandleAt: null,
    lastTickerSymbol: null, lastOrderbookSymbol: null, lastCandleSymbol: null,
    wsConnected: false,
  };
}

async function fetchStreamStatus(): Promise<SummaryResponse["streamStatus"]> {
  const { getRedisClient } = await import("libs/cache/redisClient");
  const redis = await getRedisClient();
  const health = await redis.hgetall("trading:stream:health");

  const lastTickerAt = health.lastTickerAt ?? null;
  const lastOrderbookAt = health.lastOrderbookAt ?? null;
  const lastCandleAt = health.lastCandleAt ?? null;

  // 30초 이내 수신이면 WS 연결로 간주
  const now = Date.now();
  const wsConnected = [
    lastTickerAt, lastOrderbookAt, lastCandleAt,
  ].some((at) => {
    if (!at) return false;
    const age = now - new Date(at).getTime();
    return age < 60_000; // 1분 이내 수신 → 연결됨
  });

  return {
    lastTickerAt,
    lastOrderbookAt,
    lastCandleAt,
    lastTickerSymbol: health.lastTickerAtSymbol ?? null,
    lastOrderbookSymbol: health.lastOrderbookAtSymbol ?? null,
    lastCandleSymbol: health.lastCandleAtSymbol ?? null,
    wsConnected,
  };
}

async function fetchRateLimits(): Promise<SummaryResponse["rateLimits"]> {
  const { TRADING_RATE_GROUPS, getRateGroupSpec, parseRateBucket } = await import("libs/trading/tradingRateLimiter");
  const { getRedisClient } = await import("libs/cache/redisClient");
  const redis = await getRedisClient();

  const results: SummaryResponse["rateLimits"] = [];

  for (const provider of ["upbit", "toss_securities"] as const) {
    const groups = TRADING_RATE_GROUPS[provider];
    for (const group of groups) {
      try {
        const spec = getRateGroupSpec(provider, group as Parameters<typeof getRateGroupSpec>[1]);
        const key = `trading:ratelimit:${provider}:${group}`;
        const raw = await redis.get(key);
        const bucket = parseRateBucket(raw, spec.burst);
        results.push({
          provider,
          group,
          ratePerSecond: spec.ratePerSecond,
          burst: spec.burst,
          remaining: Math.max(0, Math.floor(bucket.tokens)),
        });
      } catch {
        // skip unknown groups
      }
    }
  }

  return results;
}
