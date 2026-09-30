"use client";

import { useEffect, useState } from "react";
import { Badge, Skeleton } from "@amu-labs/ui";

/**
 * Private Trade Lab — 조회 전용 대시보드 (TL-203).
 *
 * 연결 상태·키 만료·보유자산·종목 수를 한 화면에 표시한다.
 * 접근 격리는 /api/private/trading/access가 검증하며, 이 페이지는 200 응답 후에만 렌더된다.
 *
 * 반응형: 375/768/1024/1440px 대응 (Tailwind grid).
 * 손익 표시는 색상에만 의존하지 않고 +/− 기호와 숫자로 함께 표시한다.
 */

type Summary = {
  connections: Array<{
    provider: string;
    assetClass: string;
    status: string;
    invalidReason?: string;
    keyExpiresAt: string | null;
    keyDaysRemaining: number | null;
    lastCheckedAt: string | null;
  }>;
  instruments: {
    upbit: number;
    toss_securities: number;
  };
  holdings: Array<{
    asset: string;
    total: string;
    locked: string;
    avgBuyPrice: string | null;
    managedBy: string;
  }>;
  errors: string[];
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
  /** TL-304: 레이트 리미트 */
  rateLimits: Array<{
    provider: string;
    group: string;
    ratePerSecond: number;
    burst: number;
    remaining: number;
  }>;
};

type PageState =
  | { phase: "checking" }
  | { phase: "denied" }
  | { phase: "error"; message: string }
  | { phase: "loaded"; summary: Summary };

function providerLabel(provider: string) {
  return provider === "upbit" ? "업비트" : provider === "toss_securities" ? "토스증권" : provider;
}

function assetLabel(assetClass: string) {
  return assetClass === "crypto" ? "가상자산" : assetClass === "equity" ? "주식" : assetClass;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="primary" size="sm">연결됨</Badge>;
  if (status === "invalid") return <Badge variant="destructive" size="sm">연결 끊김</Badge>;
  return <Badge variant="muted" size="sm">{status}</Badge>;
}

function keyDaysBadge(days: number | null) {
  if (days === null) return <Badge variant="muted" size="sm">미확인</Badge>;
  if (days < 0) return <Badge variant="destructive" size="sm">만료됨</Badge>;
  if (days < 7) return <Badge variant="destructive" size="sm">D-{days}</Badge>;
  if (days < 30) return <Badge variant="outlineMuted" size="sm">D-{days}</Badge>;
  return <span className="text-xs text-muted-foreground">{days}일 남음</span>;
}

function formatNumber(value: string, scale: number): string {
  const n = parseFloat(value);
  if (isNaN(n)) return value;
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: Math.min(scale, 4),
    maximumFractionDigits: Math.min(scale, 8),
  });
}

function notifSeverityBadge(severity: string) {
  if (severity === "critical") return <Badge variant="destructive" size="sm">심각</Badge>;
  if (severity === "warn") return <Badge variant="outlineMuted" size="sm">경고</Badge>;
  return <Badge variant="muted" size="sm">정보</Badge>;
}

function notifTypeLabel(type: string) {
  const map: Record<string, string> = {
    sync_failed: "동기화 실패",
    auth_error: "인증 오류",
    key_expiry_warning: "키 만료 예정",
    key_expiry_critical: "키 만료 임박",
    key_expired: "키 만료",
    connection_invalid: "연결 무효",
    system: "시스템",
  };
  return map[type] || type;
}

/** TL-304: ISO 문자열 → \"N초 전\" / \"N분 전\" */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "방금";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  return `${hr}시간 전`;
}

export default function PrivateTradePage() {
  const [state, setState] = useState<PageState>({ phase: "checking" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/private/trading/access", { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ phase: "denied" });
          return;
        }
        return fetch("/api/private/trading/summary", { cache: "no-store" });
      })
      .then((res) => {
        if (!res || cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((summary: Summary | undefined) => {
        if (cancelled || !summary) return;
        setState({ phase: "loaded", summary });
      })
      .catch((err) => {
        if (!cancelled) setState({ phase: "error", message: String(err?.message || err) });
      });

    return () => { cancelled = true; };
  }, []);

  if (state.phase === "denied") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-2 px-5 py-16">
        <h1 className="text-lg font-semibold">접근 권한이 없습니다</h1>
        <p className="text-sm text-muted-foreground">이 페이지는 소유자 계정만 사용할 수 있습니다.</p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-2 px-5 py-16">
        <h1 className="text-lg font-semibold">데이터를 불러오지 못했습니다</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </main>
    );
  }

  if (state.phase === "checking") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-5 py-16">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-48" />
      </main>
    );
  }

  const { summary } = state as { phase: "loaded"; summary: Summary };

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Private Trade Lab</h1>
        {summary.errors.length > 0 && (
          <Badge variant="destructive" size="sm">
            경고 {summary.errors.length}건
          </Badge>
        )}
      </div>

      {summary.errors.length > 0 && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <ul className="list-inside list-disc text-xs text-destructive">
            {summary.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          연결 상태
        </h2>
        {summary.connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 거래소 연결이 없습니다.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.connections.map((conn, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {providerLabel(conn.provider)} · {assetLabel(conn.assetClass)}
                  </span>
                  {statusBadge(conn.status)}
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>키 만료</span>
                    <span>
                      {conn.keyExpiresAt
                        ? new Date(conn.keyExpiresAt).toLocaleDateString("ko-KR")
                        : "미확인"}
                      {" "}{keyDaysBadge(conn.keyDaysRemaining)}
                    </span>
                  </div>
                  {conn.invalidReason && (
                    <div className="flex justify-between">
                      <span>사유</span>
                      <span className="text-destructive">{conn.invalidReason}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>마지막 확인</span>
                    <span>
                      {conn.lastCheckedAt
                        ? new Date(conn.lastCheckedAt).toLocaleString("ko-KR")
                        : "없음"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            보유자산
          </h2>
          {summary.holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">보유자산 데이터가 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">자산</th>
                    <th className="px-3 py-2 text-right font-medium">보유량</th>
                    <th className="px-3 py-2 text-right font-medium">잠금</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.holdings.map((h, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{h.asset}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(h.total, h.asset === "KRW" ? 0 : 8)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(h.locked, h.asset === "KRW" ? 0 : 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            시스템 상태
          </h2>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">거래 가능 종목</span>
                <div className="flex gap-3 text-right text-xs">
                  <div>
                    <span className="text-muted-foreground">업비트 </span>
                    <span className="font-semibold tabular-nums">{summary.instruments.upbit}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">토스 </span>
                    <span className="font-semibold tabular-nums">{summary.instruments.toss_securities}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* TL-304: WebSocket 상태 */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">WebSocket</span>
                {summary.streamStatus.wsConnected
                  ? <Badge variant="primary" size="sm">연결됨</Badge>
                  : <Badge variant="destructive" size="sm">끊김</Badge>
                }
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Ticker</span>
                  <span className="tabular-nums">
                    {summary.streamStatus.lastTickerAt
                      ? `${timeAgo(summary.streamStatus.lastTickerAt)}${summary.streamStatus.lastTickerSymbol ? ` (${summary.streamStatus.lastTickerSymbol})` : ""}`
                      : "수신 없음"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Orderbook</span>
                  <span className="tabular-nums">
                    {summary.streamStatus.lastOrderbookAt
                      ? `${timeAgo(summary.streamStatus.lastOrderbookAt)}${summary.streamStatus.lastOrderbookSymbol ? ` (${summary.streamStatus.lastOrderbookSymbol})` : ""}`
                      : "수신 없음"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Candle</span>
                  <span className="tabular-nums">
                    {summary.streamStatus.lastCandleAt
                      ? `${timeAgo(summary.streamStatus.lastCandleAt)}${summary.streamStatus.lastCandleSymbol ? ` (${summary.streamStatus.lastCandleSymbol})` : ""}`
                      : "수신 없음"}
                  </span>
                </div>
              </div>
            </div>

            {/* TL-304: 레이트 리미트 요약 */}
            {summary.rateLimits.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 text-sm font-medium">Rate Limits</div>
                <div className="grid gap-1 text-xs">
                  {summary.rateLimits
                    .filter((r) => r.provider === "upbit")
                    .map((r, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{r.group}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.min(100, (r.remaining / r.burst) * 100)}%` }}
                            />
                          </div>
                          <span className="w-10 text-right tabular-nums">{r.remaining}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {summary.holdings.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between text-sm">
                  <span>관리 구분</span>
                  <span className="text-xs text-muted-foreground">
                    system {summary.holdings.filter((h) => h.managedBy === "system").length}
                    {" · "}
                    manual {summary.holdings.filter((h) => h.managedBy === "manual").length}
                    {" · "}
                    unknown {summary.holdings.filter((h) => h.managedBy === "unknown").length}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── notifications ── */}
      {summary.notifications.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            알림
            {summary.unreadCount > 0 && (
              <Badge variant="destructive" size="sm">{summary.unreadCount}</Badge>
            )}
          </h2>
          <div className="space-y-2">
            {summary.notifications.slice(0, 10).map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border p-3 text-xs ${
                  n.severity === "critical"
                    ? "border-destructive/40 bg-destructive/5"
                    : n.severity === "warn"
                      ? "border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20"
                      : "border-border bg-card"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  {notifSeverityBadge(n.severity)}
                  <span className="font-medium">{notifTypeLabel(n.type)}</span>
                  {n.provider && (
                    <span className="text-muted-foreground">
                      · {providerLabel(n.provider)}
                    </span>
                  )}
                  {n.createdAt && (
                    <span className="ml-auto text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString("ko-KR")}
                    </span>
                  )}
                </div>
                <p className="font-medium">{n.title}</p>
                <p className="text-muted-foreground">{n.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xxs text-muted-foreground">
        이 대시보드는 조회 전용입니다. 주문·전략 관리는 이후 단계에서 추가됩니다.
        데이터는 실시간이 아닐 수 있으며 수 분 간격으로 갱신됩니다.
      </p>
    </main>
  );
}
