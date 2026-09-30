"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, BarChart3, CheckCircle2, Clock3, RefreshCw, Target } from "lucide-react";
import { Badge, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import type { MarketingGrowthAnalysis } from "libs/marketing/analytics/marketingGrowthAnalysisContract";
import { cn } from "utils/common";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { REVIEW_PANEL_CARD_CLASS, REVIEW_PANEL_EMPTY_CLASS, REVIEW_PANEL_LABEL_CLASS } from "./MarketingOpsConstants";

/**
 * @docHint
 * @purpose S6 Growth Mission Control — 목표·전략 준비도, 퍼널 계측 상태, 다음 행동 초안
 * @process 저장된 S6 분석 API 조회 → 데이터 준비도·퍼널·출처·실행 초안 표시 → 키워드 전략 탭으로 연결
 * @domain marketing
 * @scope admin-ui
 */

const GROWTH_ANALYSIS_API = "/marketing/analytics/growth";
const STAGE_ORDER = ["reach", "consumption", "relationship", "expansion", "revenue"] as const;
const STAGE_LABELS: Record<(typeof STAGE_ORDER)[number], { ko: string; en: string }> = {
  reach: { ko: "발견", en: "Reach" },
  consumption: { ko: "소비", en: "Consumption" },
  relationship: { ko: "관계", en: "Relationship" },
  expansion: { ko: "확장", en: "Expansion" },
  revenue: { ko: "사업 기여", en: "Business" },
};
const SOURCE_LABELS: Record<string, { ko: string; en: string }> = {
  social: { ko: "소셜", en: "Social" },
  web: { ko: "웹/GA4", en: "Web/GA4" },
  ads: { ko: "광고", en: "Ads" },
  commerce: { ko: "주문", en: "Commerce" },
};

function statusLabel(status: string) {
  switch (status) {
    case "observed":
      return lang({ ko: "관측됨", en: "Observed" });
    case "ready":
      return lang({ ko: "분석 가능", en: "Ready" });
    case "partial":
      return lang({ ko: "부분 수집", en: "Partial" });
    case "blocked_external":
      return lang({ ko: "외부 조건", en: "External gate" });
    case "setup_required":
      return lang({ ko: "설정 필요", en: "Setup required" });
    case "not_available":
      return lang({ ko: "사용 불가", en: "Unavailable" });
    case "not_observed":
    case "not_collected":
      return lang({ ko: "미수집", en: "Not collected" });
    case "insufficient_sample":
      return lang({ ko: "표본 부족", en: "Insufficient sample" });
    default:
      return status || "-";
  }
}

function statusClass(status: string) {
  if (status === "observed" || status === "ready") return "border-accent/30 bg-accent/10 text-primary-text";
  if (status === "blocked_external" || status === "setup_required") return "border-amber-400/40 bg-amber-400/10 text-primary-text";
  return "border-border bg-muted/30 text-secondary-text";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

function stageMetricSummary(stage: MarketingGrowthAnalysis["funnel"][keyof MarketingGrowthAnalysis["funnel"]]) {
  const entries = Object.entries(stage.metrics || {});
  if (entries.length === 0) return lang({ ko: "수치 없음", en: "No observed metric" });
  return entries
    .slice(0, 2)
    .map(([key, value]) => `${key.replace(/^eventCount:/, "")}: ${formatNumber(value)}`)
    .join(" · ");
}

function sourceNote(status: string) {
  if (status === "blocked_external") return lang({ ko: "SSM-603 자격증명·법무 게이트", en: "SSM-603 credential/legal gate" });
  if (status === "observed") return lang({ ko: "저장 스냅샷 기준", en: "Stored snapshots" });
  return lang({ ko: "미수집은 0이 아님", en: "Missing is not zero" });
}

export function MarketingGrowthMissionPanel({ universeId, initialCampaignId = "" }: { universeId?: string; initialCampaignId?: string }) {
  const scopedUniverseId = toSafeString(universeId);
  const scopedCampaignId = toSafeString(initialCampaignId);
  const [days, setDays] = useState("28");
  const [analysis, setAnalysis] = useState<MarketingGrowthAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    if (!scopedUniverseId) {
      setAnalysis(null);
      return;
    }
    try {
      setLoading(true);
      setErrorMessage("");
      const campaignQuery = scopedCampaignId ? `&campaignId=${encodeURIComponent(scopedCampaignId)}` : "";
      const response = await fetchClient.get(
        `${GROWTH_ANALYSIS_API}?universeId=${encodeURIComponent(scopedUniverseId)}&days=${encodeURIComponent(days)}${campaignQuery}`,
      );
      const data = toUnknownRecord(response.data?.data) as MarketingGrowthAnalysis;
      setAnalysis(data);
    } catch (error) {
      setErrorMessage(String(error instanceof Error ? error.message : "성과 분석을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [days, scopedCampaignId, scopedUniverseId]);

  useEffect(
    function loadGrowthAnalysisOnMount() {
      void Promise.resolve().then(load);
    },
    [load],
  );

  if (!scopedUniverseId) {
    return (
      <section className={REVIEW_PANEL_EMPTY_CLASS} aria-live="polite">
        <BarChart3 className="mx-auto mb-2 size-5 text-muted-text" aria-hidden="true" />
        <p>
          <Lang text={{ ko: "S6 성과 분석은 특정 유니버스를 선택하면 열립니다.", en: "Select a universe to open S6 growth analysis." }} />
        </p>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className={REVIEW_PANEL_EMPTY_CLASS} role="alert">
        <AlertCircle className="mx-auto mb-2 size-5 text-secondary-text" aria-hidden="true" />
        <p>{errorMessage}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("icon-xxs", loading && "animate-spin")} aria-hidden="true" />
          <Lang text={{ ko: "다시 시도", en: "Retry" }} />
        </Button>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className={REVIEW_PANEL_EMPTY_CLASS} aria-live="polite">
        <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-muted-text" aria-hidden="true" />
        <Lang text={{ ko: "성과 분석 준비 중…", en: "Preparing growth analysis…" }} />
      </section>
    );
  }

  const strategy = analysis.strategy;
  const diagnosis = analysis.diagnosis;
  const strategyHref = `/marketing-oops/workspace?universeId=${encodeURIComponent(scopedUniverseId)}&tab=keyword`;

  return (
    <section className="flex flex-col gap-4 text-primary-text" aria-labelledby="growth-mission-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-text">06 · Growth Mission Control</span>
          <h4 id="growth-mission-title" className="mt-1 flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
            <Target className="size-4" aria-hidden="true" />
            <Lang text={{ ko: "성과 분석과 다음 행동", en: "Performance and next action" }} />
            <Badge variant="outline" size="xs">{analysis.window.days}d</Badge>
          </h4>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "목표 → 병목 가설 → 캠페인 → 계측 → 패턴 → 다음 행동의 운영 루프입니다. 현재 수집되지 않은 지표를 0으로 계산하거나 성과를 예측하지 않습니다.",
                en: "This is the goal → hypothesis → campaign → measurement → pattern → next action loop. Missing metrics are not treated as zero and no performance is forecast.",
              }}
            />
          </p>
          {scopedCampaignId ? (
            <p className="mt-2 font-mono text-xxs text-secondary-text">campaignId={scopedCampaignId}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="growth-analysis-window" className="sr-only">
            <Lang text={{ ko: "분석 기간", en: "Analysis window" }} />
          </label>
          <select
            id="growth-analysis-window"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="h-9 rounded-md border border-border bg-surface px-2 text-xs text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="7">7d</option>
            <option value="28">28d</option>
            <option value="90">90d</option>
          </select>
          <Button variant="outline" size="icon-sm" onClick={() => void load()} disabled={loading} aria-label={lang({ ko: "성과 분석 새로고침", en: "Refresh growth analysis" })}>
            <RefreshCw className={cn("icon-xxs", loading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {analysis.dataReadiness.status === "awaiting_data" ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4" role="status">
          <p className="flex items-start gap-2 text-sm font-medium">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-secondary-text" aria-hidden="true" />
            <Lang text={{ ko: "아직 발행 콘텐츠나 성과 스냅샷이 없습니다.", en: "No published content or performance snapshots are available yet." }} />
          </p>
          <p className="mt-1 pl-6 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "현재 화면은 목표·전략·UTM·캠페인 연결을 준비하는 단계이며, 수치 판정 대신 7일 스냅샷 확보를 다음 행동으로 제안합니다.",
                en: "This is the goal, strategy, UTM, and campaign-linking stage. The next action is to secure a 7-day snapshot, not to judge performance from empty data.",
              }}
            />
          </p>
        </div>
      ) : null}

      <div className={cn(REVIEW_PANEL_CARD_CLASS, "grid gap-4 lg:grid-cols-[1.3fr_1fr]")}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className={REVIEW_PANEL_LABEL_CLASS}>
              <Lang text={{ ko: "현재 목표·전략", en: "Current goal and strategy" }} />
            </p>
            <Badge variant="outline" size="xs" className={statusClass(strategy.status)}>
              {statusLabel(strategy.status)}
            </Badge>
            <span className="font-mono text-xxs text-muted-text">v{strategy.version}</span>
          </div>
          <p className="mt-1 text-sm font-medium">{strategy.goal || lang({ ko: "목표가 아직 설정되지 않았습니다.", en: "Goal is not configured yet." })}</p>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-secondary-text"><Lang text={{ ko: "타깃", en: "Persona" }} /></dt>
              <dd className="mt-1 break-words text-primary-text">{strategy.targetPersona || "-"}</dd>
            </div>
            <div>
              <dt className="text-secondary-text"><Lang text={{ ko: "주요 전환", en: "Primary conversion" }} /></dt>
              <dd className="mt-1 break-words text-primary-text">{strategy.primaryConversion || "-"}</dd>
            </div>
            <div>
              <dt className="text-secondary-text"><Lang text={{ ko: "퍼널", en: "Funnel" }} /></dt>
              <dd className="mt-1 text-primary-text">{strategy.funnel || "mixed"}</dd>
            </div>
          </dl>
          {strategy.missing.length > 0 ? (
            <p className="mt-3 text-xs text-secondary-text">
              <Lang text={{ ko: `필수 설정: ${strategy.missing.join(", ")}`, en: `Required: ${strategy.missing.join(", ")}` }} />
            </p>
          ) : null}
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <div>
            <p className={REVIEW_PANEL_LABEL_CLASS}><Lang text={{ ko: "분석 범위", en: "Analysis scope" }} /></p>
            <p className="font-mono text-xs">{analysis.window.dateFrom} → {analysis.window.dateTo}</p>
            <p className="mt-1 text-xs text-secondary-text">{analysis.window.timezone} · {analysis.dataReadiness.rows} rows</p>
          </div>
          <a
            href={strategyHref}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-primary-text transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Lang text={{ ko: "목표·전략 설정 열기", en: "Open goal and strategy" }} />
          </a>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className={REVIEW_PANEL_LABEL_CLASS}><Lang text={{ ko: "성장 사다리", en: "Growth ladder" }} /></p>
          <span className="text-xxs text-secondary-text"><Lang text={{ ko: "미수집 ≠ 0", en: "Missing ≠ zero" }} /></span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {STAGE_ORDER.map((stageKey) => {
            const stage = analysis.funnel[stageKey];
            return (
              <article key={stageKey} className="min-w-0 rounded-xl border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">{STAGE_LABELS[stageKey].ko}</p>
                    <p className="mt-0.5 text-xxs text-secondary-text">{STAGE_LABELS[stageKey].en}</p>
                  </div>
                  <Badge variant="outline" size="xs" className={statusClass(stage.status)}>{statusLabel(stage.status)}</Badge>
                </div>
                <p className="mt-4 min-h-10 break-words font-mono text-xs leading-5 text-primary-text">{stageMetricSummary(stage)}</p>
                <p className="mt-2 break-words text-xxs text-secondary-text">
                  {stage.status === "observed"
                    ? `${stage.rowsUsed} ${lang({ ko: "행", en: "rows" })} · ${stage.metricBasis.join(", ") || "stored snapshot"}`
                    : stage.note || lang({ ko: "관측 전", en: "Awaiting observation" })}
                </p>
              </article>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <div className={REVIEW_PANEL_CARD_CLASS}>
          <p className={REVIEW_PANEL_LABEL_CLASS}><Lang text={{ ko: "데이터 준비도", en: "Data readiness" }} /></p>
          <div className="mt-2 space-y-2">
            {analysis.dataReadiness.sources.map((source) => (
              <div key={source.key} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{SOURCE_LABELS[source.key]?.ko || source.key}</p>
                  <p className="mt-0.5 break-words text-xxs text-secondary-text">{sourceNote(source.status)} · {source.metricBasis}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xxs text-secondary-text">{source.rows} rows</span>
                  <Badge variant="outline" size="xs" className={statusClass(source.status)}>{statusLabel(source.status)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={REVIEW_PANEL_CARD_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={REVIEW_PANEL_LABEL_CLASS}><Lang text={{ ko: "다음 행동 초안", en: "Next action draft" }} /></p>
            <Badge variant="outline" size="xs">{diagnosis.executionMode}</Badge>
          </div>
          <div className="mt-2 rounded-lg border border-accent/30 bg-accent/10 p-3">
            <p className="flex items-start gap-2 text-sm font-medium">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{diagnosis.primaryNextAction}</span>
            </p>
          </div>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-secondary-text"><Lang text={{ ko: "변경하지 않을 것", en: "Do not change" }} /></dt>
              <dd className="mt-1 leading-5 text-primary-text">{diagnosis.doNotChange}</dd>
            </div>
            <div>
              <dt className="text-secondary-text"><Lang text={{ ko: "판정 창", en: "Decision windows" }} /></dt>
              <dd className="mt-1 font-mono text-primary-text">{diagnosis.reviewWindowDays.join("d / ")}d</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className={REVIEW_PANEL_CARD_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={REVIEW_PANEL_LABEL_CLASS}><Lang text={{ ko: "Topic × Hook × Format × Channel", en: "Topic × Hook × Format × Channel" }} /></p>
          <Badge variant="outline" size="xs" className={statusClass(analysis.comparison.status)}>{statusLabel(analysis.comparison.status)}</Badge>
        </div>
        <p className="mt-2 text-xs leading-5 text-secondary-text">
          {analysis.comparison.status === "insufficient_sample"
            ? lang({ ko: "소재·채널 조합을 비교할 수 있는 계측 표본이 아직 없습니다. 표본이 쌓이기 전에는 승자·패자 판정을 만들지 않습니다.", en: "There is not enough instrumented sample to compare creative and channel combinations. No winner/loser decision is made before the sample exists." })
            : lang({ ko: `${analysis.comparison.results.length}개 조합을 관측했습니다.`, en: `${analysis.comparison.results.length} combinations observed.` })}
        </p>
      </div>

      <p className="text-xxs leading-5 text-secondary-text" aria-live="polite">
        <Lang text={{ ko: `분석 기준시각: ${analysis.asOf} · 직접/추정/상관 귀속: ${analysis.attribution.level} · 외부 프로바이더 조회 없음`, en: `As of ${analysis.asOf} · attribution: ${analysis.attribution.level} · no external provider fetch` }} />
      </p>
    </section>
  );
}
