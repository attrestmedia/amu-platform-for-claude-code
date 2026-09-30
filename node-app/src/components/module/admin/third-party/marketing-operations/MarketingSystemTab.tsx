import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button, TooltipBasic } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { RefreshCw, RotateCcw } from "lucide-react";
import { cn } from "utils/common";
import type { MarketingSystemStatus } from "./MarketingOpsTypes";
import {
  formatDate,
  getChannelLabel,
  getMarketingJobSourceLabel,
  getStatusLabel,
  toSafeString,
} from "./MarketingOpsUtils";
import { MARKETING_TAB_HEADER_CLASS } from "./MarketingOpsConstants";

type MarketingSystemTabProps = {
  busyKey: string;
  statusLoading: boolean;
  systemStatus: MarketingSystemStatus | null;
  isGlobalScope: boolean;
  runWorkerPoll: (options?: { scheduledOnly?: boolean }) => Promise<void>;
  runRecovery: (dryRun: boolean) => Promise<void>;
  setSelectedJobId: (jobId: string) => void;
};

export function MarketingSystemTab({
  busyKey,
  statusLoading,
  systemStatus,
  isGlobalScope,
  runWorkerPoll,
  runRecovery,
  setSelectedJobId,
}: MarketingSystemTabProps) {
  return (
    <>
      <div className={MARKETING_TAB_HEADER_CLASS}>
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-text">02 · system status</span>
          <div className="flex items-center gap-1">
            <h4 className="text-base font-semibold tracking-tight text-primary-text">
              <Lang text={{ ko: "시스템 상태", en: "System Status" }} />
            </h4>
            <TooltipBasic autoClose triggerAs="span">
              <Lang
                text={{
                  ko: "queue 깊이, orphan processing, worker heartbeat, Redis/Mongo 연결 상태를 한 번에 확인합니다.",
                  en: "View queue depth, orphan processing jobs, worker heartbeats, and Redis/Mongo health together.",
                }}
              />
            </TooltipBasic>
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-1 sm:w-auto sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runWorkerPoll({ scheduledOnly: true })}
            disabled={!!busyKey || statusLoading}
            className="min-w-[120px] flex-1 sm:flex-none"
            title={lang({
              ko: "예약 시간이 지난 발행 항목만 확인하고 실행합니다.",
              en: "Checks and runs only due scheduled publish items.",
            })}
          >
            <RefreshCw className={cn(busyKey === "system:worker:scheduled-poll" && "animate-spin", "icon-xxs")} />
            <span>{lang({ ko: "예약 발행 확인", en: "Check scheduled" })}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runRecovery(true)}
            disabled={!!busyKey || statusLoading}
            className="min-w-[120px] flex-1 sm:flex-none"
          >
            <RefreshCw className={cn(busyKey === "system:recovery:dry-run" && "animate-spin", "icon-xxs")} />
            <span>{lang({ ko: "복구 시뮬레이션", en: "Recovery dry-run" })}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runRecovery(false)}
            disabled={!!busyKey || statusLoading}
            className="min-w-[120px] flex-1 sm:flex-none"
          >
            <RotateCcw className={cn(busyKey === "system:recovery" && "animate-spin", "icon-xxs")} />
            <span>{lang({ ko: "orphan 복구", en: "Recover orphans" })}</span>
          </Button>
        </div>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["system-status", "universe-summary", "ads-unlock-gate"]}
        className="flex flex-col gap-4"
      >
        <AccordionItem value="system-status" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <Lang text={{ ko: "상태 지표와 복구 후보", en: "Status metrics and recovery candidates" }} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: { ko: "Queue", en: "Queue" },
                  value: Number(systemStatus?.redis?.queueDepth || 0),
                },
                {
                  label: { ko: "Processing", en: "Processing" },
                  value: Number(systemStatus?.redis?.processingDepth || 0),
                },
                {
                  label: { ko: "Orphan 후보", en: "Orphan candidates" },
                  value: systemStatus?.orphanCandidates?.length || 0,
                },
                {
                  label: { ko: "Workers", en: "Workers" },
                  value: systemStatus?.workers?.length || 0,
                },
              ].map((metric) => (
                <div key={metric.label.ko} className="rounded-xl border border-border bg-surface px-4 py-4">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-text">
                    <Lang text={metric.label} />
                  </p>
                  <p className="mt-1 font-mono text-[26px] font-semibold leading-none tracking-tight text-primary-text">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface px-4 py-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-primary-text">
                    {lang({ ko: "연결 상태", en: "Connection health" })}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.04em]",
                      systemStatus?.redis?.isHealthy
                        ? "bg-accent-sub text-primary-text"
                        : "bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] text-danger",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        systemStatus?.redis?.isHealthy ? "bg-accent" : "bg-danger",
                      )}
                    />
                    {systemStatus?.redis?.isHealthy
                      ? lang({ ko: "Redis 정상", en: "Redis OK" })
                      : lang({ ko: "Redis 문제", en: "Redis issue" })}
                  </span>
                </div>
                <p className="font-mono text-[11px] leading-relaxed text-secondary-text">
                  Scope: {toSafeString(systemStatus?.scope) || (isGlobalScope ? "global" : "universe")} / Dry-run:{" "}
                  {systemStatus?.featureFlags?.dryRun ? "on" : "off"} / Slack:{" "}
                  {systemStatus?.featureFlags?.slack ? "on" : "off"}
                </p>
                {systemStatus?.redis?.error ? (
                  <p className="mt-2 font-mono text-[11px] text-danger">{systemStatus.redis.error}</p>
                ) : null}
                <p className="mt-2 font-mono text-[11px] text-muted-text">
                  Mongo:{" "}
                  {Object.entries(systemStatus?.mongo?.connections || {})
                    .map(([name, state]) => `${name}:${state}`)
                    .join(", ") || "-"}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface px-4 py-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-primary-text">
                    {lang({ ko: "최근 worker heartbeat", en: "Recent worker heartbeat" })}
                  </span>
                  {statusLoading ? (
                    <span className="font-mono text-[11px] text-muted-text">
                      {lang({ ko: "갱신 중", en: "Refreshing" })}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {(systemStatus?.workers || []).slice(0, 4).map((worker) => (
                    <div
                      key={worker.workerId}
                      className="rounded-md bg-surface-2 px-2 py-2 font-mono text-[11px] text-secondary-text"
                    >
                      <p className="font-semibold text-primary-text">{worker.workerId || "-"}</p>
                      <p>{formatDate(worker.lastSeenAt)}</p>
                    </div>
                  ))}
                  {!systemStatus?.workers?.length ? (
                    <p className="font-mono text-[11px] text-muted-text">
                      {lang({ ko: "활성 worker heartbeat가 없습니다.", en: "No active worker heartbeat." })}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-primary-text">
                  {lang({ ko: "최근 운영 활동", en: "Recent operations activity" })}
                </span>
                <span className="font-mono text-[11px] text-muted-text">
                  {Number(systemStatus?.activity?.lookbackDays || 14)}d
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: { ko: "발행 성공 로그", en: "Published logs" },
                    value: Number(systemStatus?.activity?.publishedLogCount || 0),
                  },
                  {
                    label: { ko: "발행 실패 로그", en: "Failed logs" },
                    value: Number(systemStatus?.activity?.failedPublishLogCount || 0),
                  },
                  {
                    label: { ko: "로컬 에이전트 제출", en: "Local agent submits" },
                    value: Number(systemStatus?.activity?.localAgentSubmittedJobCount || 0),
                  },
                  {
                    label: { ko: "검수 대기 job", en: "Waiting review jobs" },
                    value: Number(systemStatus?.activity?.waitingReviewJobCount || 0),
                  },
                ].map((metric) => (
                  <div key={metric.label.ko} className="rounded-lg bg-surface-2 px-3 py-3">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-text">
                      <Lang text={metric.label} />
                    </p>
                    <p className="mt-1 font-mono text-[20px] font-semibold leading-none text-primary-text">
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface px-4 py-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-primary-text">
                    {lang({ ko: "Orphan 후보", en: "Orphan candidates" })}
                  </span>
                  <span className="font-mono text-[11px] text-muted-text">
                    {systemStatus?.orphanCandidates?.length || 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {(systemStatus?.orphanCandidates || []).slice(0, 5).map((item) => (
                    <div
                      key={item.jobId}
                      className="rounded-md border border-[color-mix(in_srgb,var(--secondary)_25%,transparent)] bg-[color-mix(in_srgb,var(--secondary)_8%,var(--surface))] px-2 py-2 font-mono text-[11px] leading-relaxed text-secondary"
                    >
                      <p className="font-semibold">{item.sourceSlug || item.jobId || "-"}</p>
                      {isGlobalScope ? <p>universeId: {toSafeString(item.universeId) || "-"}</p> : null}
                      <p>
                        {getStatusLabel(toSafeString(item.status))} / lease TTL: {Number(item.leaseTtlMs || 0)}
                      </p>
                    </div>
                  ))}
                  {!systemStatus?.orphanCandidates?.length ? (
                    <p className="font-mono text-[11px] text-muted-text">
                      {lang({ ko: "현재 orphan 후보가 없습니다.", en: "No orphan candidates." })}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface px-4 py-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-primary-text">
                    {lang({ ko: "최근 실패 job", en: "Recent failed jobs" })}
                  </span>
                  <span className="font-mono text-[11px] text-muted-text">
                    {systemStatus?.recentFailedJobs?.length || 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {(systemStatus?.recentFailedJobs || []).slice(0, 5).map((job) => (
                    <button
                      key={job.jobId}
                      type="button"
                      onClick={() => setSelectedJobId(job.jobId)}
                      className="block w-full rounded-md border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-2 py-2 text-left font-mono text-[11px] leading-relaxed text-danger transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_14%,var(--surface))]"
                    >
                      <p className="font-semibold">{getMarketingJobSourceLabel(job)}</p>
                      {isGlobalScope ? <p>universeId: {toSafeString(job.universeId) || "-"}</p> : null}
                      <p>{getStatusLabel(toSafeString(job.status))}</p>
                    </button>
                  ))}
                  {!systemStatus?.recentFailedJobs?.length ? (
                    <p className="font-mono text-[11px] text-muted-text">
                      {lang({ ko: "최근 실패 job이 없습니다.", en: "No recent failed jobs." })}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="universe-summary" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <span className="flex items-center gap-2">
              <Lang text={{ ko: "유니버스별 운영 요약", en: "Per-universe summary" }} />
              {systemStatus?.universeSummaries && (
                <span className="relative top-0.5 font-mono text-xs text-muted-text">
                  {systemStatus.universeSummaries.length}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {isGlobalScope && systemStatus?.universeSummaries?.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {systemStatus.universeSummaries.map((summary) => (
                  <div
                    key={summary.universeId}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-3 font-mono text-[11px] leading-relaxed text-secondary-text"
                  >
                    <p className="font-sans text-[13px] font-semibold tracking-tight text-primary-text">
                      {toSafeString(summary.universeId) || "-"}
                    </p>
                    <p>queue: {Number(summary.queueDepth || 0)}</p>
                    <p>processing: {Number(summary.processingDepth || 0)}</p>
                    <p>orphan: {Number(summary.orphanCount || 0)}</p>
                    <p>
                      {lang({ ko: "최근 발행", en: "Published" })}: {Number(summary.publishedLogCount || 0)}
                      {" / "}
                      {lang({ ko: "채널", en: "channels" })} {Number(summary.recentPublishedChannelCount || 0)}
                    </p>
                    <p>
                      {lang({ ko: "로컬 에이전트", en: "Local agent" })}:{" "}
                      {Number(summary.localAgentSubmittedJobCount || 0)}
                      {" / "}
                      {lang({ ko: "검수 대기", en: "review" })} {Number(summary.waitingReviewJobCount || 0)}
                    </p>
                    <p>
                      ads gate:{" "}
                      <span className={cn("font-semibold", summary.goNoGoReady ? "text-primary" : "text-danger")}>
                        {summary.goNoGoReady ? "GO" : "NO-GO"}
                      </span>
                    </p>
                    {!summary.goNoGoReady && (summary.goNoGoReasons?.length ?? 0) > 0 ? (
                      <p className="mt-1 text-[10px] text-muted-text">{summary.goNoGoReasons?.[0]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="ads-unlock-gate" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span>Ads unlock gate</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xxs font-semibold uppercase",
                    systemStatus?.measurement?.goNoGo?.ready
                      ? "bg-accent-sub text-primary-text"
                      : "bg-[color-mix(in_srgb,var(--secondary)_15%,var(--surface))] text-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      systemStatus?.measurement?.goNoGo?.ready ? "bg-accent" : "bg-secondary",
                    )}
                  />
                  {systemStatus?.measurement?.goNoGo?.ready
                    ? lang({ ko: "GO", en: "GO" })
                    : lang({ ko: "NO-GO", en: "NO-GO" })}
                </span>
              </div>
              <Lang
                text={{
                  ko: (
                    <>
                      최근 {Number(systemStatus?.measurement?.lookbackDays || 14)}일 publish log와 credential 준비도를
                      기준으로 광고 착수 가능 여부를 계산합니다.
                    </>
                  ),
                  en: (
                    <>
                      Calculates whether advertising can be launched based on the recent{" "}
                      {Number(systemStatus?.measurement?.lookbackDays || 14)}-day publish log and credential readiness.
                    </>
                  ),
                }}
                className="text-xs text-muted-text font-light"
              />
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="mt-6">
              <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center">
                  <p className="text-[13px] font-semibold text-primary-text">
                    {lang({ ko: "", en: "Ads unlock gate" })}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-text">
                    {lang({ ko: "최근 publish log", en: "Recent publish logs" })}
                  </p>
                  <p className="mt-1 font-mono text-[20px] font-semibold leading-none text-primary-text">
                    {Number(systemStatus?.measurement?.recentPublishedLogCount || 0)} /{" "}
                    {Number(systemStatus?.measurement?.minPublishedLogs || 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-text">
                    {lang({ ko: "최근 publish 채널", en: "Recent publish channels" })}
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-primary-text">
                    {(systemStatus?.measurement?.recentPublishedChannels || [])
                      .map((channel) => getChannelLabel(channel))
                      .join(" / ") || "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-text">
                    {lang({ ko: "Naver Ads slot", en: "Naver Ads slot" })}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[13px] font-medium",
                      systemStatus?.measurement?.adsCredentialReadiness?.find((item) => item.provider === "naver_ads")
                        ?.exists
                        ? "text-primary"
                        : "text-secondary-text",
                    )}
                  >
                    {systemStatus?.measurement?.adsCredentialReadiness?.find((item) => item.provider === "naver_ads")
                      ?.exists
                      ? lang({ ko: "준비됨", en: "Ready" })
                      : lang({ ko: "미설정", en: "Missing" })}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-text">
                    {lang({ ko: "Google Ads slot", en: "Google Ads slot" })}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[13px] font-medium",
                      systemStatus?.measurement?.adsCredentialReadiness?.find((item) => item.provider === "google_ads")
                        ?.exists
                        ? "text-primary"
                        : "text-secondary-text",
                    )}
                  >
                    {systemStatus?.measurement?.adsCredentialReadiness?.find((item) => item.provider === "google_ads")
                      ?.exists
                      ? lang({ ko: "준비됨", en: "Ready" })
                      : lang({ ko: "미설정", en: "Missing" })}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-[color-mix(in_srgb,var(--secondary)_25%,transparent)] bg-[color-mix(in_srgb,var(--secondary)_8%,var(--surface))] px-3 py-3">
                  <p className="mb-2 text-[12.5px] font-semibold text-secondary">
                    {lang({ ko: "Go / No-Go 사유", en: "Go / No-Go reasons" })}
                  </p>
                  <div className="space-y-2">
                    {(systemStatus?.measurement?.goNoGo?.reasons || []).map((reason) => (
                      <p key={reason} className="font-mono text-[11px] text-secondary">
                        {reason}
                      </p>
                    ))}
                    {!systemStatus?.measurement?.goNoGo?.reasons?.length ? (
                      <p className="text-[11.5px] font-medium text-primary">
                        {lang({ ko: "광고 착수 gate를 통과했습니다.", en: "Ads unlock gate passed." })}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
                  <p className="mb-2 text-[12.5px] font-semibold text-primary-text">
                    {lang({ ko: "측정 체크리스트", en: "Measurement checklist" })}
                  </p>
                  <div className="space-y-2">
                    {(systemStatus?.measurement?.checklist || []).map((item) => (
                      <p key={item} className="font-mono text-[11px] text-secondary-text">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
}
