"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Shield } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Preloader,
} from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import type { PolicyReleaseEventKind, PolicyReleaseEventView } from "libs/database/legal/policyReleaseEventRepo";

type PolicyReleaseState = {
  ok: true;
  mode: "legacy" | "manifest";
  manifestRevision: string | null;
  serverTime: string;
  policies: Record<string, unknown>;
  holds: string[];
  verificationOverdue: Array<{ releaseId: string; kind: "notice_observed" | "activation_observed"; expectedAt: string }> | null;
};

type PolicyReleaseEvent = Pick<
  PolicyReleaseEventView,
  "releaseId" | "kind" | "outcome" | "observedAt" | "lagMs" | "actor" | "detail"
>;

type EventResponse = { ok: true; events: PolicyReleaseEvent[] };
type StateResponse = PolicyReleaseState;
type ReleaseTarget = { releaseId: string; reason: string };

const EVENT_LABELS: Record<PolicyReleaseEventKind, { ko: string; en: string }> = {
  deployed_observed: { ko: "배포 확인", en: "Deployment observed" },
  notice_observed: { ko: "공고 확인", en: "Notice observed" },
  activation_observed: { ko: "시행 확인", en: "Activation observed" },
  mismatch: { ko: "불일치", en: "Mismatch" },
  hold_set: { ko: "보류 설정", en: "Hold set" },
  hold_released: { ko: "보류 해제", en: "Hold released" },
  run_failed: { ko: "검증 실행 실패", en: "Verification run failed" },
};

function getHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("response" in error)) return null;
  const response = error.response;
  if (typeof response !== "object" || response === null || !("status" in response)) return null;
  return typeof response.status === "number" ? response.status : null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatLag(value: number | null | undefined): string {
  return value == null ? "—" : lang({
    ko: `${new Intl.NumberFormat().format(value)} ms`,
    en: `${new Intl.NumberFormat().format(value)} ms`,
  });
}

function getEventKindLabel(kind: PolicyReleaseEventKind) {
  return EVENT_LABELS[kind] || { ko: kind, en: kind };
}

function getRecentFailureCount(events: readonly PolicyReleaseEvent[], nowMs: number): number {
  const dayAgo = nowMs - 24 * 60 * 60 * 1000;
  return events.filter((event) => {
    if (event.kind !== "mismatch" && event.kind !== "run_failed") return false;
    const observedAtMs = Date.parse(event.observedAt);
    return Number.isFinite(observedAtMs) && observedAtMs >= dayAgo && observedAtMs <= nowMs;
  }).length;
}

export function PolicyReleaseOpsPanel() {
  const [state, setState] = useState<PolicyReleaseState | null>(null);
  const [events, setEvents] = useState<PolicyReleaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateError, setStateError] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [holdReasons, setHoldReasons] = useState<Record<string, string>>({});
  const [releaseTarget, setReleaseTarget] = useState<ReleaseTarget | null>(null);
  const [isReleasing, setIsReleasing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async function loadPolicyReleaseData(showLoader = true) {
    if (showLoader) setLoading(true);
    const [stateResult, eventsResult] = await Promise.allSettled([
      fetchClient.get<StateResponse>("/legal/policy-releases/state", {
        responseType: "json",
        cache: "no-store",
        loading: "none",
      }),
      fetchClient.get<EventResponse>("/admin/legal/policy-releases/events", {
        params: { limit: 200 },
        responseType: "json",
        cache: "no-store",
        loading: "none",
      }),
    ]);

    if (stateResult.status === "fulfilled" && stateResult.value.data?.ok === true) {
      setState(stateResult.value.data);
      setStateError(false);
    } else {
      setState(null);
      setStateError(true);
    }

    if (eventsResult.status === "fulfilled" && eventsResult.value.data?.ok === true) {
      setEvents(Array.isArray(eventsResult.value.data.events) ? eventsResult.value.data.events : []);
      setEventsError(false);
    } else {
      setEvents([]);
      setEventsError(true);
    }

    setActionError("");
    if (showLoader) setLoading(false);
  }, []);

  useEffect(function loadPolicyReleaseDataOnMount() {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const nowMs = state ? Date.parse(state.serverTime) : 0;
  const recentFailureCount = useMemo(() => getRecentFailureCount(events, nowMs), [events, nowMs]);
  const holdCount = state?.holds.length ?? 0;
  const overdueCount = state?.verificationOverdue?.length ?? 0;
  const overdueUnknown = state?.verificationOverdue === null;
  const warningCount = holdCount + overdueCount + recentFailureCount;
  const statusText = state?.mode === "legacy"
    ? { ko: "manifest 미적용", en: "Manifest not applied" }
    : overdueUnknown || stateError || eventsError
      ? { ko: "확인 불가", en: "Unable to verify" }
      : warningCount > 0
        ? { ko: `주의 ${warningCount}건`, en: `${warningCount} warning(s)` }
        : { ko: "정상", en: "Normal" };

  const submitHoldRelease = async () => {
    if (!releaseTarget || isReleasing) return;
    setIsReleasing(true);
    setActionError("");
    setNotice("");
    try {
      const response = await fetchClient.post<{ ok: true; changed: boolean }>(
        `/admin/legal/policy-releases/${encodeURIComponent(releaseTarget.releaseId)}/hold`,
        { active: false, reason: releaseTarget.reason },
        { responseType: "json", loading: "none" },
      );
      setNotice(lang(response.data.changed
        ? { ko: "보류를 해제했습니다.", en: "The hold was released." }
        : { ko: "활성 보류가 없습니다. 상태를 새로 확인했습니다.", en: "No active hold was found. The current state was refreshed." }));
      setHoldReasons((current) => ({ ...current, [releaseTarget.releaseId]: "" }));
      setReleaseTarget(null);
      await loadData(false);
    } catch (error) {
      const status = getHttpStatus(error);
      setActionError(status === 409
        ? lang({ ko: "상태가 변경됐습니다. 새로고침 후 다시 확인해 주세요.", en: "The state changed. Refresh and review it again." })
        : status === 400
          ? lang({ ko: "해제 요청을 확인하지 못했습니다. 사유를 다시 확인해 주세요.", en: "The release request was rejected. Check the reason and try again." })
          : lang({ ko: "보류를 해제하지 못했습니다. 잠시 후 다시 확인해 주세요.", en: "The hold could not be released. Please try again shortly." }));
    } finally {
      setIsReleasing(false);
    }
  };

  const openReleaseConfirmation = (releaseId: string) => {
    const reason = (holdReasons[releaseId] || "").trim();
    setActionError("");
    setNotice("");
    if (!reason) {
      setActionError(lang({ ko: "보류 해제 사유를 입력해 주세요.", en: "Enter a reason before releasing the hold." }));
      return;
    }
    setReleaseTarget({ releaseId, reason });
  };

  if (loading && !state && !stateError) {
    return (
      <div className="flex min-h-32 items-center justify-center" role="status" aria-live="polite">
        <Preloader
          variant="spin"
          size="md"
          container
          iconClassName="motion-reduce:animate-none"
          text={lang({ ko: "정책 릴리스 상태를 불러오는 중", en: "Loading policy release status" })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary-text">
            <Lang text={{ ko: "검증 현황", en: "Verification status" }} />
          </h2>
          <p className="mt-1 text-sm text-secondary-text">
            <Lang text={{ ko: "공고·시행 확인, 보류와 최근 실행 기록을 확인합니다.", en: "Review notice and activation checks, holds, and recent runs." }} />
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => void loadData()}
          disabled={loading}
          aria-label={lang({ ko: "상태 새로고침", en: "Refresh status" })}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          <Lang text={{ ko: "새로고침", en: "Refresh" }} />
        </Button>
      </div>

      {stateError ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
          <Lang text={{ ko: "정책 릴리스 상태를 불러오지 못했습니다. 재시도해 주세요.", en: "Could not load policy release status. Try again." }} />
        </div>
      ) : null}

      {state ? (
        <>
          <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="policy-release-summary-title">
            <h3 id="policy-release-summary-title" className="sr-only">
              <Lang text={{ ko: "정책 릴리스 요약", en: "Policy release summary" }} />
            </h3>
            <dl className={`grid grid-cols-1 gap-3 ${state.mode === "manifest" ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-3"}`}>
              <div className="min-w-0">
                <dt className="text-xs text-secondary-text"><Lang text={{ ko: "모드", en: "Mode" }} /></dt>
                <dd className="mt-1 font-medium text-primary-text">{state.mode}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-secondary-text"><Lang text={{ ko: "Manifest revision", en: "Manifest revision" }} /></dt>
                <dd className="mt-1 break-all font-mono text-sm text-primary-text">
                  {state.manifestRevision ? state.manifestRevision.slice(0, 12) : "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-secondary-text"><Lang text={{ ko: "상태", en: "Status" }} /></dt>
                <dd className="mt-1 flex items-center gap-2 font-medium text-primary-text">
                  {state.mode === "manifest" && warningCount > 0 ? <AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" /> : null}
                  {state.mode === "manifest" && warningCount === 0 && !overdueUnknown && !stateError && !eventsError
                    ? <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
                    : null}
                  <Lang text={statusText} />
                </dd>
              </div>
              {state.mode === "manifest" ? (
                <>
                  <div className="min-w-0">
                    <dt className="text-xs text-secondary-text"><Lang text={{ ko: "활성 보류", en: "Active holds" }} /></dt>
                    <dd className="mt-1 font-semibold text-primary-text">{state.holds.length}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-secondary-text"><Lang text={{ ko: "검증 지연", en: "Verification overdue" }} /></dt>
                    <dd className="mt-1 font-semibold text-primary-text">
                      {overdueUnknown ? <Lang text={{ ko: "확인 불가", en: "Unable to verify" }} /> : overdueCount}
                    </dd>
                  </div>
                  <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                    <dt className="text-xs text-secondary-text"><Lang text={{ ko: "최근 24시간 불일치·실패", en: "Mismatch or failure in the last 24 hours" }} /></dt>
                    <dd className="mt-1 font-semibold text-primary-text">
                      {eventsError ? <Lang text={{ ko: "확인 불가", en: "Unable to verify" }} /> : recentFailureCount}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </section>

          {state.mode === "legacy" ? (
            <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary-text" role="status" aria-live="polite">
              <Shield className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p><Lang text={{ ko: "manifest 미적용(과도기) — 검증 대상 없음", en: "Manifest not applied (transition period) — no verification targets." }} /></p>
            </div>
          ) : (
            <>
              <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="policy-release-holds-title">
                <div>
                  <h3 id="policy-release-holds-title" className="font-semibold text-primary-text">
                    <Lang text={{ ko: "활성 보류", en: "Active holds" }} />
                  </h3>
                  <p className="mt-1 text-sm text-secondary-text">
                    <Lang text={{ ko: "보류 해제는 사유를 입력하고 확인해야 합니다.", en: "Enter a reason and confirm before releasing a hold." }} />
                  </p>
                </div>
                {state.holds.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-3 text-sm text-secondary-text" role="status" aria-live="polite">
                    <Lang text={{ ko: "활성 보류가 없습니다.", en: "There are no active holds." }} />
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {state.holds.map((releaseId, index) => {
                      const inputId = `policy-release-hold-reason-${index}`;
                      return (
                        <li key={releaseId} className="grid min-w-0 gap-3 py-3 md:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.2fr)_auto] md:items-end">
                          <div className="min-w-0">
                            <p className="text-xs text-secondary-text"><Lang text={{ ko: "릴리스", en: "Release" }} /></p>
                            <p className="mt-1 break-all font-mono text-sm text-primary-text">{releaseId}</p>
                          </div>
                          <div className="min-w-0">
                            <label htmlFor={inputId} className="mb-1 block text-xs text-secondary-text">
                              <Lang text={{ ko: "해제 사유", en: "Release reason" }} />
                            </label>
                            <Input
                              id={inputId}
                              value={holdReasons[releaseId] || ""}
                              maxLength={500}
                              onChange={(event) => setHoldReasons((current) => ({ ...current, [releaseId]: event.target.value }))}
                              className="min-h-11"
                              aria-describedby={`${inputId}-hint`}
                              disabled={isReleasing}
                            />
                            <p id={`${inputId}-hint`} className="mt-1 text-xs text-secondary-text">
                              <Lang text={{ ko: "1~500자로 입력해 주세요.", en: "Enter 1–500 characters." }} />
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            className="min-h-11 md:min-w-28"
                            onClick={() => openReleaseConfirmation(releaseId)}
                            disabled={isReleasing}
                          >
                            <Lang text={{ ko: "보류 해제", en: "Release hold" }} />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="policy-release-overdue-title">
                <div>
                  <h3 id="policy-release-overdue-title" className="font-semibold text-primary-text">
                    <Lang text={{ ko: "검증 지연", en: "Verification overdue" }} />
                  </h3>
                  <p className="mt-1 text-sm text-secondary-text">
                    <Lang text={{ ko: "공고·시행 확인 시각을 넘긴 릴리스입니다.", en: "Releases past their notice or activation verification time." }} />
                  </p>
                </div>
                {state.verificationOverdue === null ? (
                  <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">
                    <Lang text={{ ko: "검증 지연 상태를 확인할 수 없습니다.", en: "Verification overdue status is unavailable." }} />
                  </p>
                ) : state.verificationOverdue.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-3 text-sm text-secondary-text" role="status" aria-live="polite">
                    <Lang text={{ ko: "지연된 검증이 없습니다.", en: "There are no overdue verifications." }} />
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {state.verificationOverdue.map((item) => (
                      <li key={`${item.releaseId}:${item.kind}`} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-primary-text">{item.releaseId}</p>
                          <p className="mt-1 text-secondary-text"><Lang text={getEventKindLabel(item.kind)} /></p>
                        </div>
                        <time className="text-secondary-text" dateTime={item.expectedAt}>{formatDate(item.expectedAt)}</time>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="policy-release-events-title">
                <div>
                  <h3 id="policy-release-events-title" className="font-semibold text-primary-text">
                    <Lang text={{ ko: "최근 이벤트", en: "Recent events" }} />
                  </h3>
                  <p className="mt-1 text-sm text-secondary-text">
                    <Lang text={{ ko: "최근 기록부터 최대 200건을 표시합니다.", en: "Showing up to 200 events, newest first." }} />
                  </p>
                </div>
                {eventsError ? (
                  <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">
                    <Lang text={{ ko: "이벤트 기록을 불러오지 못했습니다.", en: "Could not load event records." }} />
                  </p>
                ) : events.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-3 text-sm text-secondary-text" role="status" aria-live="polite">
                    <Lang text={{ ko: "표시할 이벤트가 없습니다.", en: "There are no events to display." }} />
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <caption className="sr-only"><Lang text={{ ko: "정책 릴리스 검증 이벤트", en: "Policy release verification events" }} /></caption>
                      <thead className="bg-primary/5 text-xs text-secondary-text">
                        <tr>
                          <th className="px-3 py-2 font-medium" scope="col"><Lang text={{ ko: "종류", en: "Kind" }} /></th>
                          <th className="px-3 py-2 font-medium" scope="col"><Lang text={{ ko: "릴리스", en: "Release" }} /></th>
                          <th className="px-3 py-2 font-medium" scope="col"><Lang text={{ ko: "결과", en: "Outcome" }} /></th>
                          <th className="px-3 py-2 font-medium" scope="col"><Lang text={{ ko: "확인 시각", en: "Observed at" }} /></th>
                          <th className="px-3 py-2 font-medium" scope="col"><Lang text={{ ko: "지연", en: "Lag" }} /></th>
                          <th className="px-3 py-2 font-medium" scope="col"><Lang text={{ ko: "실행자", en: "Actor" }} /></th>
                          <th className="px-3 py-2 font-medium" scope="col"><Lang text={{ ko: "세부 정보", en: "Detail" }} /></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {events.map((event, index) => (
                          <tr key={`${event.releaseId}:${event.kind}:${event.observedAt}:${index}`}>
                            <td className="px-3 py-2 text-primary-text"><Lang text={getEventKindLabel(event.kind)} /></td>
                            <td className="max-w-56 break-all px-3 py-2 font-mono text-xs text-primary-text">{event.releaseId}</td>
                            <td className="px-3 py-2 text-primary-text">{event.outcome}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-secondary-text">
                              <time dateTime={event.observedAt}>{formatDate(event.observedAt)}</time>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-secondary-text">{formatLag(event.lagMs)}</td>
                            <td className="max-w-48 break-all px-3 py-2 text-secondary-text">{event.actor}</td>
                            <td className="max-w-72 break-words px-3 py-2 text-secondary-text">{event.detail || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      ) : null}

      {actionError ? <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">{actionError}</p> : null}
      {notice ? <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary-text" role="status" aria-live="polite">{notice}</p> : null}

      <Dialog open={Boolean(releaseTarget)} onOpenChange={(open) => { if (!open && !isReleasing) setReleaseTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle><Lang text={{ ko: "보류를 해제할까요?", en: "Release this hold?" }} /></DialogTitle>
            <DialogDescription className="text-left text-sm leading-6 text-secondary-text">
              <Lang text={{ ko: "해제 후에는 정책 릴리스 검증이 다시 진행될 수 있습니다. 릴리스와 사유를 확인해 주세요.", en: "Verification may resume after release. Confirm the release and reason below." }} />
            </DialogDescription>
          </DialogHeader>
          {releaseTarget ? (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="break-all font-mono text-primary-text">{releaseTarget.releaseId}</p>
              <p className="whitespace-pre-wrap break-words text-secondary-text">{releaseTarget.reason}</p>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setReleaseTarget(null)} disabled={isReleasing}>
              <Lang text={{ ko: "취소", en: "Cancel" }} />
            </Button>
            <Button className="min-h-11" onClick={() => void submitHoldRelease()} disabled={isReleasing || !releaseTarget}>
              {isReleasing ? <Lang text={{ ko: "해제 중…", en: "Releasing…" }} /> : <Lang text={{ ko: "해제 확인", en: "Confirm release" }} />}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
