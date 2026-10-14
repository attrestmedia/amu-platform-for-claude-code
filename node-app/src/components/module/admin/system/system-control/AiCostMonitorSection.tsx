/**
 * @docHint
 * @purpose Render the read-only AI cost report with separate billable and shadow metrics
 * @process Fetch the selected window and display aggregates, quality signals, and catalog provenance
 * @domain admin-system
 * @scope component
 */
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { fetchAiCostMonitor } from "libs/api/admin/systemControls";
import {
  AI_COST_MONITOR_WINDOWS,
  type AiCostMonitorReportV1,
  type AiCostMonitorWindowPreset,
} from "types/ai";
import { logger } from "utils/log";
import { AiCostMonitorFxCard } from "./AiCostMonitorFxCard";
import { useReducedMotion } from "./useReducedMotion";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : percentFormatter.format(value);
}

function formatUsd(value: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function formatRoute(route: "direct" | "unknown") {
  return route === "direct" ? "direct" : lang({ ko: "미확인", en: "Unknown" });
}

function EmptyTableRow({ columns, message }: { columns: number; message: { ko: string; en: string } }) {
  return (
    <tr>
      <td colSpan={columns} className="px-3 py-6 text-center text-sm text-muted-foreground">
        <Lang text={message} />
      </td>
    </tr>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: { ko: string; en: string };
  value: string;
  detail: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-surface p-3 sm:p-4">
      <h3 className="text-xs font-medium text-muted-foreground"><Lang text={label} /></h3>
      <div className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      <div className="mt-1 break-words text-xs text-muted-foreground">{detail}</div>
    </section>
  );
}

function CostMonitorSkeleton({ reducedMotion }: { reducedMotion: boolean }) {
  const pulse = reducedMotion ? "" : "animate-pulse";

  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <span className="sr-only"><Lang text={{ ko: "비용 집계 데이터를 불러오는 중입니다.", en: "Loading cost report." }} /></span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className={`h-24 ${pulse} rounded-lg border border-border bg-muted/40`} />
        ))}
      </div>
      <div className={`h-24 ${pulse} rounded-lg border border-border bg-muted/40`} aria-hidden="true" />
      <div className={`h-64 ${pulse} rounded-lg border border-border bg-muted/40`} aria-hidden="true" />
      <div className={`h-64 ${pulse} rounded-lg border border-border bg-muted/40`} aria-hidden="true" />
      <div className={`h-64 ${pulse} rounded-lg border border-border bg-muted/40`} aria-hidden="true" />
    </div>
  );
}

function ProviderCallsTable({ report }: { report: AiCostMonitorReportV1 }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-background p-4">
      <div className="mb-3">
        <h3 className="font-semibold"><Lang text={{ ko: "Provider 호출", en: "Provider calls" }} /></h3>
        <p className="mt-1 text-xs text-muted-foreground">
          <Lang text={{ ko: "청구 대상과 Shadow 호출을 별도 행으로 집계합니다.", en: "Billable and shadow calls are reported separately." }} />
        </p>
      </div>
      <div className="overflow-x-auto contain-paint">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <caption className="sr-only">{lang({ ko: "공급자 호출 통계", en: "Provider call statistics" })}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2"><Lang text={{ ko: "구분", en: "Class" }} /></th>
              <th scope="col" className="px-3 py-2">Provider / model</th>
              <th scope="col" className="px-3 py-2">Workflow</th>
              <th scope="col" className="px-3 py-2">Route</th>
              <th scope="col" className="px-3 py-2 text-right"><Lang text={{ ko: "시도", en: "Attempts" }} /></th>
              <th scope="col" className="px-3 py-2 text-right"><Lang text={{ ko: "성공률", en: "Success" }} /></th>
              <th scope="col" className="px-3 py-2 text-right">p50 / p95</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.providerCalls.groups.length ? report.providerCalls.groups.map((group, index) => (
              <tr key={[group.traceClass, group.provider, group.model, group.workflow, index].join(":")}>
                <td className="px-3 py-2">{group.traceClass}</td>
                <td className="max-w-56 break-all px-3 py-2">{group.provider} / {group.model}</td>
                <td className="max-w-48 break-all px-3 py-2">{group.workflow}</td>
                <td className="px-3 py-2">{formatRoute(group.executionRoute)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.attempts)}</td>
                <td className="px-3 py-2 text-right tabular-nums" title={group.successRate === null ? lang({ ko: "완료된 호출이 없습니다.", en: "No completed calls." }) : undefined}>
                  {formatPercent(group.successRate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {group.latencyMs.p50 === null ? "—" : formatNumber(group.latencyMs.p50)}
                  {" / "}
                  {group.latencyMs.p95 === null ? "—" : formatNumber(group.latencyMs.p95)}
                  {group.latencyMs.p50 === null && group.latencyMs.p95 === null ? (
                    <span className="sr-only">{lang({ ko: "완료 호출 지연 정보 없음", en: "No completed call latency data" })}</span>
                  ) : null}
                  {group.latencyMs.p50 !== null || group.latencyMs.p95 !== null ? <span className="ml-1 text-xs text-muted-foreground">ms</span> : null}
                </td>
              </tr>
            )) : <EmptyTableRow columns={7} message={{ ko: "기간 내 호출 데이터가 없습니다.", en: "No calls in this window." }} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CostTable({ report }: { report: AiCostMonitorReportV1 }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-background p-4">
      <div className="mb-3">
        <h3 className="font-semibold"><Lang text={{ ko: "원가 그룹", en: "Cost groups" }} /></h3>
        <p className="mt-1 text-xs text-muted-foreground">
          <Lang text={{ ko: "확인된 원가만 합산하며 Shadow 운영비는 실제 청구 원가와 분리합니다.", en: "Only known costs are summed; shadow operating cost stays separate from billable cost." }} />
        </p>
      </div>
      <div className="overflow-x-auto contain-paint">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <caption className="sr-only">{lang({ ko: "원가 그룹", en: "Cost groups" })}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2"><Lang text={{ ko: "구분", en: "Source" }} /></th>
              <th scope="col" className="px-3 py-2">Provider / model</th>
              <th scope="col" className="px-3 py-2"><Lang text={{ ko: "유형", en: "Modality" }} /></th>
              <th scope="col" className="px-3 py-2">Route</th>
              <th scope="col" className="px-3 py-2 text-right"><Lang text={{ ko: "행", en: "Rows" }} /></th>
              <th scope="col" className="px-3 py-2 text-right"><Lang text={{ ko: "원가 확인", en: "Known cost" }} /></th>
              <th scope="col" className="px-3 py-2 text-right">USD</th>
              <th scope="col" className="px-3 py-2 text-right"><Lang text={{ ko: "미확인", en: "Unknown" }} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.cost.groups.length ? report.cost.groups.map((group, index) => (
              <tr key={[group.source, group.provider, group.model, group.modality, index].join(":")}>
                <td className="px-3 py-2">{group.source}</td>
                <td className="max-w-56 break-all px-3 py-2">{group.provider} / {group.model}</td>
                <td className="px-3 py-2">{group.modality}</td>
                <td className="px-3 py-2">{formatRoute(group.executionRoute)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.rows)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.knownCostRows)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUsd(group.knownCostUsd)}</td>
                <td className="px-3 py-2 text-right tabular-nums" title={group.unknownCostRows ? lang({ ko: "원가가 확인되지 않은 행입니다.", en: "Rows with unverified cost." }) : undefined}>
                  {formatNumber(group.unknownCostRows)}
                </td>
              </tr>
            )) : <EmptyTableRow columns={8} message={{ ko: "기간 내 원가 정산 데이터가 없습니다.", en: "No cost ledger rows in this window." }} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProvenanceTable({ report }: { report: AiCostMonitorReportV1 }) {
  const provenance = report.catalogProvenance;
  return (
    <section className="min-w-0 rounded-lg border border-border bg-background p-4">
      <div className="mb-3">
        <h3 className="font-semibold"><Lang text={{ ko: "카탈로그 원가 근거", en: "Catalog cost provenance" }} /></h3>
        <p className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm" role="status">
          <Lang text={{ ko: "Tracker 관측 비교: 런타임 입력 경로 없음", en: "Tracker comparison: no runtime input path" }} />
        </p>
        <div className="mt-2 grid gap-1 break-all text-xs text-muted-foreground sm:grid-cols-3">
          <span>manifest: {provenance.manifestRevision}</span>
          <span>pricing: {provenance.pricingRevision}</span>
          <span>provider cost: {provenance.providerCostRevision}</span>
        </div>
      </div>
      <div className="overflow-x-auto contain-paint">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">{lang({ ko: "모델별 승인 원가 출처", en: "Approved model cost provenance" })}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2">Model</th>
              <th scope="col" className="px-3 py-2"><Lang text={{ ko: "유형", en: "Modality" }} /></th>
              <th scope="col" className="px-3 py-2"><Lang text={{ ko: "확실성", en: "Certainty" }} /></th>
              <th scope="col" className="px-3 py-2"><Lang text={{ ko: "검증일", en: "Verified" }} /></th>
              <th scope="col" className="px-3 py-2"><Lang text={{ ko: "출처", en: "Source" }} /></th>
              <th scope="col" className="px-3 py-2">Tracker evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {provenance.items.length ? provenance.items.map((item, index) => (
              <tr key={[item.modelId, item.modality, index].join(":")}>
                <td className="max-w-56 break-all px-3 py-2">{item.modelId}</td>
                <td className="px-3 py-2">{item.modality}</td>
                <td
                  className="px-3 py-2"
                  title={!item.providerCost?.certainty ? lang({ ko: "승인 manifest에 원가 확실성 값이 없습니다.", en: "No cost certainty is recorded in the approved manifest." }) : undefined}
                >
                  {item.providerCost?.certainty || "—"}
                  {!item.providerCost?.certainty ? <span className="sr-only">{lang({ ko: "원가 확실성 정보 없음", en: "No cost certainty recorded" })}</span> : null}
                </td>
                <td
                  className="px-3 py-2"
                  title={!item.providerCost?.verifiedAt ? lang({ ko: "승인 manifest에 원가 검증일이 없습니다.", en: "No cost verification date is recorded in the approved manifest." }) : undefined}
                >
                  {formatDate(item.providerCost?.verifiedAt || null)}
                  {!item.providerCost?.verifiedAt ? <span className="sr-only">{lang({ ko: "원가 검증일 정보 없음", en: "No cost verification date recorded" })}</span> : null}
                </td>
                <td className="max-w-56 break-all px-3 py-2" title={item.providerCost?.source || undefined}>
                  {item.providerCost?.source || "—"}
                  {!item.providerCost?.source ? <span className="sr-only">{lang({ ko: "원가 출처 정보 없음", en: "No cost source recorded" })}</span> : null}
                </td>
                <td className="max-w-64 break-all px-3 py-2 text-xs">
                  {item.providerCost?.trackerRunId || item.providerCost?.changeRecordPath || "—"}
                  {!item.providerCost?.trackerRunId && !item.providerCost?.changeRecordPath ? (
                    <span className="sr-only">{lang({ ko: "추적 근거 없음", en: "No tracker evidence recorded" })}</span>
                  ) : null}
                </td>
              </tr>
            )) : <EmptyTableRow columns={6} message={{ ko: "표시할 원가 provenance가 없습니다.", en: "No catalog cost provenance to display." }} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AiCostMonitorSection() {
  const reducedMotion = useReducedMotion();
  const [windowPreset, setWindowPreset] = useState<AiCostMonitorWindowPreset>("24h");
  const [report, setReport] = useState<AiCostMonitorReportV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(function loadCostMonitorReport() {
    let alive = true;
    async function loadReport() {
      try {
        const nextReport = await fetchAiCostMonitor(windowPreset);
        if (alive) setReport(nextReport);
      } catch (error) {
        logger.error("[SystemControlBox] AI cost monitor load failed", error);
        if (alive) {
          setReport(null);
          setFailed(true);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadReport();
    return () => {
      alive = false;
    };
  }, [windowPreset, refreshToken]);

  function refreshReport() {
    setLoading(true);
    setFailed(false);
    setReport(null);
    setRefreshToken((value) => value + 1);
  }

  const jobs = useMemo(() => report?.jobs.reduce(
    (totals, job) => ({
      completed: totals.completed + job.success + job.partial + job.failed,
      success: totals.success + job.success,
      inProgress: totals.inProgress + job.inProgress,
    }),
    { completed: 0, success: 0, inProgress: 0 },
  ), [report]);
  const jobSuccessRate = jobs && jobs.completed > 0 ? jobs.success / jobs.completed : null;
  const billableCalls = report?.providerCalls.billable;
  const shadowCalls = report?.providerCalls.shadow;
  const margin = report?.margin;
  const quality = report?.dataQuality;
  const coveredPercent = quality?.costCoverage === null || quality?.costCoverage === undefined
    ? null
    : quality.costCoverage;
  const totalCostRows = report?.cost.groups.reduce((total, group) => total + group.rows, 0) ?? 0;
  const shadowCostRows = report?.cost.groups
    .filter((group) => group.source === "shadow")
    .reduce((total, group) => total + group.rows, 0) ?? 0;
  const marginDetail = !margin
    ? null
    : [
        margin.status === "partial" && quality?.costCoverage !== null
          ? lang({ ko: "확인 정산분 기준 · 확인율 " + formatPercent(quality?.costCoverage ?? null), en: "Known settlements only · coverage " + formatPercent(quality?.costCoverage ?? null) })
          : margin.status === "unavailable"
            ? lang({ ko: "원가 확인 또는 가격 정책이 부족합니다.", en: "Known costs or a usable pricing policy are unavailable." })
            : lang({ ko: "확인된 정산 기준", en: "Based on covered settlements" }),
        margin.targetMargin === null ? "" : lang({ ko: "목표 기준 " + formatPercent(margin.targetMargin), en: "Target " + formatPercent(margin.targetMargin) }),
        margin.minMargin === null ? "" : lang({ ko: "최소 기준 " + formatPercent(margin.minMargin), en: "Minimum " + formatPercent(margin.minMargin) }),
        margin.fxProvisional ? lang({ ko: "환율 잠정값", en: "Provisional FX rate" }) : "",
      ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold"><Lang text={{ ko: "비용 모니터", en: "Cost monitor" }} /></h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <Lang text={{ ko: "호출, 확정 매출, 원가 확인 범위를 읽기 전용으로 집계합니다.", en: "Read-only view of provider calls, settled revenue, and cost coverage." }} />
            </p>
            {report ? (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {formatDate(report.window.from)} – {formatDate(report.window.to)} · <Lang text={{ ko: "생성", en: "Generated" }} /> {formatDate(report.generatedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-32 gap-1 text-xs">
              <span><Lang text={{ ko: "기간", en: "Window" }} /></span>
              <Select
                value={windowPreset}
                onValueChange={(value) => {
                  setLoading(true);
                  setFailed(false);
                  setReport(null);
                  setWindowPreset(value as AiCostMonitorWindowPreset);
                }}
              >
                <SelectTrigger aria-label={lang({ ko: "집계 기간", en: "Report window" })}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_COST_MONITOR_WINDOWS.map((window) => <SelectItem key={window} value={window}>{window}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <Button variant="outline" loading={loading} onClick={refreshReport}>
              <Lang text={{ ko: "새로고침", en: "Refresh" }} />
            </Button>
          </div>
        </div>
      </section>

      {loading ? (
        <CostMonitorSkeleton reducedMotion={reducedMotion} />
      ) : failed ? (
        <section className="rounded-lg border border-destructive/30 bg-background p-4">
          <p className="text-sm text-destructive" role="alert">
            <Lang text={{ ko: "집계 결과를 불러오지 못했습니다. 저장소 상태를 확인한 뒤 다시 시도해 주세요.", en: "Could not load the report. Check service availability and retry." }} />
          </p>
          <Button className="mt-3" variant="outline" loading={loading} onClick={refreshReport}>
            <Lang text={{ ko: "다시 시도", en: "Retry" }} />
          </Button>
        </section>
      ) : report ? (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={{ ko: "Provider 호출 성공률", en: "Provider call success" }}
              value={formatPercent(billableCalls?.successRate ?? null)}
              detail={
                billableCalls?.completed
                  ? lang({
                      ko: "청구 " + formatNumber(billableCalls.success) + "/" + formatNumber(billableCalls.completed) + " · 진행 중 " + formatNumber(billableCalls.inProgress) + " · Shadow 성공률 " + formatPercent(shadowCalls?.successRate ?? null),
                      en: "Billable " + formatNumber(billableCalls.success) + "/" + formatNumber(billableCalls.completed) + " · in progress " + formatNumber(billableCalls.inProgress) + " · shadow " + formatPercent(shadowCalls?.successRate ?? null),
                    })
                  : lang({ ko: "완료된 호출이 없습니다. Shadow 시도 " + formatNumber(shadowCalls?.attempts || 0) + "건", en: "No completed billable calls. Shadow attempts: " + formatNumber(shadowCalls?.attempts || 0) })
              }
            />
            <MetricCard
              label={{ ko: "p95 지연", en: "p95 latency" }}
              value={billableCalls?.latencyMs.p95 === null || billableCalls?.latencyMs.p95 === undefined ? "—" : formatNumber(billableCalls.latencyMs.p95) + " ms"}
              detail={
                billableCalls?.latencyMs.p95 === null || billableCalls?.latencyMs.p95 === undefined
                  ? <Lang text={{ ko: "완료된 청구 호출의 지연 정보 없음", en: "No completed billable-call latency" }} />
                  : lang({ ko: "청구 기준 · Shadow p95 " + (shadowCalls?.latencyMs.p95 == null ? "—" : formatNumber(shadowCalls.latencyMs.p95) + " ms"), en: "Billable · shadow p95 " + (shadowCalls?.latencyMs.p95 == null ? "—" : formatNumber(shadowCalls.latencyMs.p95) + " ms") })
              }
            />
            <MetricCard
              label={{ ko: "Job 성공률", en: "Job success" }}
              value={formatPercent(jobSuccessRate)}
              detail={jobs?.completed
                ? lang({ ko: formatNumber(jobs.success) + "/" + formatNumber(jobs.completed) + " 완료 · 진행 중 " + formatNumber(jobs.inProgress), en: formatNumber(jobs.success) + "/" + formatNumber(jobs.completed) + " completed · in progress " + formatNumber(jobs.inProgress) })
                : <Lang text={{ ko: "완료된 Job이 없습니다.", en: "No completed jobs." }} />}
            />
            <MetricCard
              label={{ ko: "확정 순매출", en: "Settled net revenue" }}
              value={formatNumber(report.revenue.netCoins) + " coins"}
              detail={lang({
                ko: "차감 " + formatNumber(report.revenue.deductionCoins) + " · 환불 " + formatNumber(report.revenue.refundCoins) + " · 보류 예약 " + formatNumber(report.revenue.heldReservationCoins) + " · 재조정 " + formatNumber(report.revenue.reconciliationCoins),
                en: "Deductions " + formatNumber(report.revenue.deductionCoins) + " · refunds " + formatNumber(report.revenue.refundCoins) + " · held " + formatNumber(report.revenue.heldReservationCoins) + " · reconciliation " + formatNumber(report.revenue.reconciliationCoins),
              })}
            />
            <MetricCard
              label={{ ko: "실제 청구 원가", en: "Actual billable cost" }}
              value={totalCostRows === 0 ? "—" : formatUsd(report.cost.actualCostUsd)}
              detail={lang({
                ko: [
                  report.cost.unknownCostCount > 0
                    ? "원가 확인분 기준 · 미확인 " + formatNumber(report.cost.unknownCostCount) + "건"
                    : "",
                  totalCostRows === 0 ? "원가 정산 행이 없습니다." : "",
                  "Shadow 운영비 " + (shadowCostRows === 0 ? "—" : formatUsd(report.cost.shadowOperatingCostUsd)),
                ].filter(Boolean).join(" · "),
                en: [
                  report.cost.unknownCostCount > 0
                    ? "Known costs only · " + formatNumber(report.cost.unknownCostCount) + " unknown"
                    : "",
                  totalCostRows === 0 ? "No cost ledger rows in this window." : "",
                  "Shadow operating cost " + (shadowCostRows === 0 ? "—" : formatUsd(report.cost.shadowOperatingCostUsd)),
                ].filter(Boolean).join(" · "),
              })}
            />
            <MetricCard
              label={{ ko: "마진", en: "Margin" }}
              value={formatPercent(margin?.marginRate ?? null)}
              detail={marginDetail || <Lang text={{ ko: "마진 정보를 사용할 수 없습니다.", en: "Margin is unavailable." }} />}
            />
            <MetricCard
              label={{ ko: "원가 확인율", en: "Cost coverage" }}
              value={formatPercent(coveredPercent)}
              detail={coveredPercent === null
                ? <Lang text={{ ko: "기간 내 원가 정산 행이 없습니다.", en: "No cost ledger rows in this window." }} />
                : lang({ ko: "미확인 원가 " + formatNumber(report.cost.unknownCostCount) + "건", en: formatNumber(report.cost.unknownCostCount) + " unknown-cost rows" })}
            />
          </div>

          <AiCostMonitorFxCard fx={report.fx} baselineMargin={report.margin} />

          <section className="rounded-lg border border-border bg-background px-4 py-3">
            <h3 className="text-sm font-semibold"><Lang text={{ ko: "데이터 품질", en: "Data quality" }} /></h3>
            <dl className="mt-2 grid min-w-0 gap-x-4 gap-y-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-muted-foreground"><Lang text={{ ko: "마지막 집계", en: "Last aggregated" }} /></dt><dd className="mt-0.5 break-words">{formatDate(quality?.lastAggregatedAt || null)}</dd></div>
              <div><dt className="text-muted-foreground"><Lang text={{ ko: "Ledger → 코인 연결 누락", en: "Ledger without coin usage" }} /></dt><dd className="mt-0.5 tabular-nums">{formatNumber(quality?.billingLinkMissing.ledgerWithoutCoinUsage || 0)}</dd></div>
              <div><dt className="text-muted-foreground"><Lang text={{ ko: "코인 → Ledger 연결 누락", en: "Coin usage without ledger" }} /></dt><dd className="mt-0.5 tabular-nums">{formatNumber(quality?.billingLinkMissing.coinUsageWithoutLedger || 0)}</dd></div>
              <div><dt className="text-muted-foreground"><Lang text={{ ko: "컬렉션 최신 문서", en: "Latest documents" }} /></dt>
                <dd className="mt-0.5 break-words">
                  trace <span title={!quality?.latestDocumentAt.traces ? lang({ ko: "최신 trace 문서 없음", en: "No trace document found." }) : undefined}>{formatDate(quality?.latestDocumentAt.traces || null)}</span>
                  {" · "}ledger <span title={!quality?.latestDocumentAt.ledger ? lang({ ko: "최신 ledger 문서 없음", en: "No ledger document found." }) : undefined}>{formatDate(quality?.latestDocumentAt.ledger || null)}</span>
                  {" · "}coin <span title={!quality?.latestDocumentAt.coinUsages ? lang({ ko: "최신 coin usage 문서 없음", en: "No coin usage document found." }) : undefined}>{formatDate(quality?.latestDocumentAt.coinUsages || null)}</span>
                </dd>
              </div>
              <div><dt className="text-muted-foreground"><Lang text={{ ko: "비최종 정산 건수", en: "Non-final billing rows" }} /></dt>
                <dd className="mt-0.5 tabular-nums">
                  prepared {formatNumber(report.revenue.nonFinalCounts.prepared)} · failed {formatNumber(report.revenue.nonFinalCounts.failed)}
                  <br />unknown {formatNumber(report.revenue.nonFinalCounts.unknownOutcome)} · reconcile {formatNumber(report.revenue.nonFinalCounts.reconciliationRequired)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              <Lang text={{ ko: "연결 누락은 조회 기간 경계에 걸친 정산 쌍에서 차이가 날 수 있습니다.", en: "Link counts can differ for settlement pairs crossing the selected window boundary." }} />
            </p>
          </section>

          <ProviderCallsTable report={report} />
          <CostTable report={report} />
          <ProvenanceTable report={report} />
        </>
      ) : null}
    </div>
  );
}
