"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@amu-labs/ui";
import { RefreshCw } from "lucide-react";
import { lang } from "components/module/i18n";

type MetricKey = "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "unsubscribed";
type PerformanceData = {
  days?: number;
  dateFrom?: string;
  dateTo?: string;
  totals?: Partial<Record<MetricKey, number>>;
  items?: Array<{ date?: string; campaignId?: string; issueId?: string; metrics?: Partial<Record<MetricKey, number>> }>;
  metricBasis?: string[];
  asOf?: string;
};

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: "sent", label: "발송" },
  { key: "delivered", label: "전달" },
  { key: "opened", label: "오픈" },
  { key: "clicked", label: "클릭" },
  { key: "unsubscribed", label: "해지" },
];

function number(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next.toLocaleString("ko-KR") : "0";
}

export function NewsletterPerformancePanel({ universeId }: { universeId?: string }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!universeId) {
      setMessage(lang({ ko: "성과를 보려면 유니버스를 선택하세요.", en: "Select a universe to view newsletter performance." }));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/newsletter/performance?universeId=${encodeURIComponent(universeId)}&days=30`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: PerformanceData; error?: string };
      if (response.status === 404 && payload.error === "newsletter_campaign_disabled") {
        setData(null);
        setMessage(lang({ ko: "뉴스레터 성과 수집은 feature flag가 꺼져 있습니다.", en: "Newsletter performance collection is disabled by feature flag." }));
        return;
      }
      if (!response.ok) throw new Error(payload.error || "newsletter_performance_load_failed");
      setData(payload.data || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "newsletter_performance_load_failed");
    } finally {
      setBusy(false);
    }
  }, [universeId]);

  useEffect(() => {
    // 초기 API 결과만 화면 상태에 반영한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className="space-y-4" aria-labelledby="newsletter-performance-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-text">amu · newsletter-measurement</p>
          <h4 id="newsletter-performance-title" className="mt-1 text-lg font-semibold text-primary-text">뉴스레터 성과</h4>
          <p className="mt-1 text-sm leading-6 text-secondary-text">SES 이벤트와 수신거부 원장을 이슈·일자별로 합산합니다. 이메일 주소와 emailHash는 표시하지 않습니다.</p>
        </div>
        <Button variant="ghost" size="xs" onClick={() => void load()} disabled={busy} aria-label="뉴스레터 성과 새로고침">
          <RefreshCw className={busy ? "animate-spin icon-xxs" : "icon-xxs"} />
          <span className="sr-only">새로고침</span>
        </Button>
      </header>
      {message ? <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm" role="status">{message}</p> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {METRICS.map((metric) => (
              <div key={metric.key} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-secondary-text">{metric.label}</p>
                <p className="mt-2 text-xl font-semibold text-primary-text">{number(data.totals?.[metric.key])}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">뉴스레터 일별 성과 원장</caption>
              <thead className="border-b border-border bg-muted/20 text-xs text-secondary-text">
                <tr>
                  <th className="px-3 py-2 font-medium">일자</th>
                  <th className="px-3 py-2 font-medium">캠페인</th>
                  <th className="px-3 py-2 font-medium">이슈</th>
                  {METRICS.map((metric) => <th key={metric.key} className="px-3 py-2 text-right font-medium">{metric.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((item) => (
                  <tr key={`${item.date}-${item.campaignId}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-secondary-text">{item.date || "-"}</td>
                    <td className="px-3 py-2 text-primary-text">{item.campaignId || "-"}</td>
                    <td className="px-3 py-2 text-secondary-text">{item.issueId || "-"}</td>
                    {METRICS.map((metric) => <td key={metric.key} className="px-3 py-2 text-right tabular-nums text-primary-text">{number(item.metrics?.[metric.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items?.length ? <p className="px-4 py-6 text-sm text-secondary-text">수집된 뉴스레터 성과가 없습니다. 실제 이벤트 수집 전에는 0으로 추정하지 않습니다.</p> : null}
          </div>
          <p className="text-xs text-muted-text">기간 {data.dateFrom || "-"} ~ {data.dateTo || "-"} · 근거 {(data.metricBasis || []).join(", ") || "-"} · 기준시각 {data.asOf || "-"}</p>
        </>
      ) : null}
    </section>
  );
}

