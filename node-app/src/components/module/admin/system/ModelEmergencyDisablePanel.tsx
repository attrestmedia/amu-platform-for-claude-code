"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, Input, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  createModelEmergencyDisable,
  fetchModelEmergencyDisables,
  releaseModelEmergencyDisable,
  type ModelEmergencyDisableItem,
  type ModelEmergencyDisableSnapshot,
  type ModelEmergencyDisableTarget,
} from "libs/api/admin/modelEmergencyDisables";

type TargetKind = ModelEmergencyDisableTarget["kind"];

function toLocalDateTimeInput(date: Date): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function targetSelectionValue(target: { modelRef: string; route: string }): string {
  return JSON.stringify([target.modelRef, target.route]);
}

function targetLabel(target: ModelEmergencyDisableTarget): string {
  return target.kind === "modelProfile" ? target.modelRef : `${target.modelRef} · ${target.route}`;
}

function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null || !("response" in error)) return fallback;
  const response = error.response;
  if (typeof response !== "object" || response === null || !("data" in response)) return fallback;
  const data = response.data;
  if (typeof data !== "object" || data === null || !("error" in data)) return fallback;
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

function formatRemainingTime(disabledUntil: string, now: number): string {
  const remainingMs = Date.parse(disabledUntil) - now;
  if (remainingMs <= 0) return lang({ ko: "만료 시각 경과", en: "Past expiry time" });

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  if (totalMinutes < 1) return lang({ ko: "1분 미만 남음", en: "Less than 1 minute left" });
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    days > 0 ? lang({ ko: `${days}일`, en: `${days}d` }) : "",
    hours > 0 ? lang({ ko: `${hours}시간`, en: `${hours}h` }) : "",
    minutes > 0 ? lang({ ko: `${minutes}분`, en: `${minutes}m` }) : "",
  ].filter(Boolean);
  return lang({ ko: `${parts.join(" ")} 남음`, en: `${parts.join(" ")} left` });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function RecordDetails({ item, now }: { item: ModelEmergencyDisableItem; now: number }) {
  const { record } = item;
  const statusLabel = {
    active: { ko: "활성", en: "Active" },
    expired: { ko: "만료", en: "Expired" },
    released: { ko: "해제됨", en: "Released" },
  }[item.state];

  return (
    <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="min-w-0">
        <dt className="text-xs text-secondary-text"><Lang text={{ ko: "대상", en: "Target" }} /></dt>
        <dd className="break-words font-medium text-primary-text">{targetLabel(record.target)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-secondary-text"><Lang text={{ ko: "상태", en: "Status" }} /></dt>
        <dd className="font-medium text-primary-text">
          <Lang text={statusLabel} />
          {item.state === "active" ? ` · ${formatRemainingTime(record.disabledUntil, now)}` : ""}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-secondary-text"><Lang text={{ ko: "차단 종료", en: "Disabled until" }} /></dt>
        <dd className="break-words text-primary-text">{formatDate(record.disabledUntil)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-secondary-text"><Lang text={{ ko: "실행자", en: "Actor" }} /></dt>
        <dd className="break-all text-primary-text">{record.actor}</dd>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <dt className="text-xs text-secondary-text"><Lang text={{ ko: "차단 사유", en: "Reason" }} /></dt>
        <dd className="whitespace-pre-wrap break-words text-primary-text">{record.reason}</dd>
      </div>
      {record.releasedAt && record.releaseReason ? (
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-xs text-secondary-text"><Lang text={{ ko: "조기 해제 기록", en: "Early release" }} /></dt>
          <dd className="whitespace-pre-wrap break-words text-primary-text">
            {formatDate(record.releasedAt)} · {record.releasedBy} · {record.releaseReason}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function ModelEmergencyDisablePanel() {
  const [snapshot, setSnapshot] = useState<ModelEmergencyDisableSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [targetKind, setTargetKind] = useState<TargetKind>("modelProfile");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [disabledUntilLocal, setDisabledUntilLocal] = useState(() =>
    toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [createReason, setCreateReason] = useState("");
  const [releaseReasons, setReleaseReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const currentNow = nowMs || (snapshot ? Date.parse(snapshot.now) : 0);

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const next = await fetchModelEmergencyDisables();
      setSnapshot(next);
      setNowMs(Date.now());
      setReadFailed(false);
      setError("");
      setSelectedTarget((current) => current || next.targets.modelProfiles[0] || "");
    } catch {
      setSnapshot(null);
      setReadFailed(true);
      setError("");
      setNotice("");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(function loadOnMount() {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const activeRecords = useMemo(
    () => snapshot?.records.filter((item) => (
      item.record.releasedAt === null && Date.parse(item.record.disabledUntil) > currentNow
    )).map((item) => ({ ...item, state: "active" as const })) || [],
    [currentNow, snapshot],
  );
  const historyRecords = useMemo(
    () => snapshot?.records.filter((item) => (
      item.record.releasedAt !== null || Date.parse(item.record.disabledUntil) <= currentNow
    )).map((item) => ({
      ...item,
      state: item.record.releasedAt === null ? "expired" as const : "released" as const,
    })) || [],
    [currentNow, snapshot],
  );
  const target = useMemo<ModelEmergencyDisableTarget | null>(() => {
    if (targetKind === "modelProfile") {
      return selectedTarget ? { kind: "modelProfile", modelRef: selectedTarget } : null;
    }
    const route = snapshot?.targets.executionRoutes.find(
      (candidate) => targetSelectionValue(candidate) === selectedTarget,
    );
    return route ? { kind: "executionRoute", modelRef: route.modelRef, route: route.route } : null;
  }, [selectedTarget, snapshot, targetKind]);

  const targetOptions = targetKind === "modelProfile"
    ? (snapshot?.targets.modelProfiles || []).map((modelRef) => ({ value: modelRef, label: modelRef }))
    : (snapshot?.targets.executionRoutes || []).map((route) => ({
      value: targetSelectionValue(route),
      label: `${route.modelRef} · ${route.route}`,
    }));
  const disabled = loading || submitting;

  const handleTargetKindChange = (nextKind: TargetKind) => {
    setTargetKind(nextKind);
    setSelectedTarget(nextKind === "modelProfile"
      ? snapshot?.targets.modelProfiles[0] || ""
      : snapshot?.targets.executionRoutes[0]
        ? targetSelectionValue(snapshot.targets.executionRoutes[0])
        : "");
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = createReason.trim();
    const disabledUntilDate = new Date(disabledUntilLocal);
    if (!target || !disabledUntilLocal || Number.isNaN(disabledUntilDate.getTime()) || disabledUntilDate.getTime() <= Date.now()) {
      setError(lang({ ko: "대상과 현재 이후의 종료 시각을 선택해 주세요.", en: "Choose a target and an expiry time in the future." }));
      return;
    }
    if (!reason || reason.length > 500) {
      setError(lang({ ko: "차단 사유를 1~500자로 입력해 주세요.", en: "Enter a reason between 1 and 500 characters." }));
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await createModelEmergencyDisable({ target, disabledUntil: disabledUntilDate.toISOString(), reason });
      setCreateReason("");
      setNotice(lang({ ko: "비상 차단을 등록했습니다.", en: "Emergency disable has been recorded." }));
      await load(false);
    } catch (requestError) {
      setError(getRequestErrorMessage(
        requestError,
        lang({ ko: "차단을 등록하지 못했습니다. 상태를 다시 확인해 주세요.", en: "Could not record the disable. Reload the current state and try again." }),
      ));
    } finally {
      setSubmitting(false);
    }
  };

  const submitRelease = async (event: FormEvent<HTMLFormElement>, item: ModelEmergencyDisableItem) => {
    event.preventDefault();
    const reason = (releaseReasons[item.key] || "").trim();
    if (!reason || reason.length > 500) {
      setError(lang({ ko: "조기 해제 사유를 1~500자로 입력해 주세요.", en: "Enter an early release reason between 1 and 500 characters." }));
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await releaseModelEmergencyDisable({ key: item.key, reason });
      setReleaseReasons((current) => ({ ...current, [item.key]: "" }));
      setNotice(lang({ ko: "차단을 조기 해제했습니다.", en: "Emergency disable has been released." }));
      await load(false);
    } catch (requestError) {
      setError(getRequestErrorMessage(
        requestError,
        lang({ ko: "조기 해제하지 못했습니다. 상태를 다시 확인해 주세요.", en: "Could not release the disable. Reload the current state and try again." }),
      ));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="mx-auto flex min-h-32 w-full max-w-3xl items-center justify-center" role="status" aria-live="polite">
        <Preloader
          variant="spin"
          size="lg"
          container
          iconClassName="motion-reduce:animate-none"
          text={lang({ ko: "차단 상태를 불러오는 중", en: "Loading emergency disable status" })}
        />
      </div>
    );
  }

  if (readFailed || !snapshot) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <p role="alert" className="flex gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span><Lang text={{
            ko: "차단 상태를 읽을 수 없습니다. 모든 신규 AI 호출이 503으로 막힌 상태일 수 있습니다.",
            en: "Emergency disable status is unreadable. All new AI calls may be blocked with 503 responses.",
          }} /></span>
        </p>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button type="button" size="sm" variant="outline" className="min-h-11 self-start" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          <Lang text={{ ko: "다시 시도", en: "Retry" }} />
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4" aria-busy={loading || submitting}>
      <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm leading-5 text-secondary-text">
        <Lang text={{
          ko: "이 도구는 지정한 모델 프로필이나 실행 경로를 만료 시각까지 차단합니다. 차단은 새 호출에 적용되며 가격·기본 모델·허용 상태를 바꾸지 않습니다.",
          en: "This tool blocks a selected model profile or execution route until its expiry time. It affects new calls and does not change price, defaults, or model availability.",
        }} />
      </p>

      {snapshot.invalidKeys.length > 0 ? (
        <section role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-3 text-sm text-primary-text">
          <h3 className="font-semibold"><Lang text={{ ko: "읽을 수 없는 차단 기록", en: "Unreadable disable records" }} /></h3>
          <p className="mt-1 text-secondary-text"><Lang text={{
            ko: "저장된 기록 일부를 해석할 수 없습니다. 해당 대상의 신규 호출은 안전을 위해 차단됩니다.",
            en: "Some stored records could not be read. New calls for those targets are blocked for safety.",
          }} /></p>
          <ul className="mt-2 list-inside list-disc space-y-1 break-all text-xs">
            {snapshot.invalidKeys.map((entry) => <li key={entry.key}>{entry.key} · {entry.reason}</li>)}
          </ul>
        </section>
      ) : null}

      {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {notice ? <p role="status" aria-live="polite" className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary-text">{notice}</p> : null}
      {submitting ? (
        <p role="status" aria-live="polite" className="text-sm text-secondary-text">
          <Lang text={{ ko: "저장 중입니다…", en: "Saving…" }} />
        </p>
      ) : null}

      <section className="min-w-0 rounded-xl border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "활성 차단", en: "Active disables" }} /> ({activeRecords.length})</h3>
            <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "차단은 만료 시각에 자동으로 해제됩니다.", en: "Disables expire automatically at the recorded time." }} /></p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {loading ? <span role="status" className="text-xs text-secondary-text"><Lang text={{ ko: "새로고침 중…", en: "Refreshing…" }} /></span> : null}
            <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={disabled} onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              <Lang text={{ ko: "새로고침", en: "Refresh" }} />
            </Button>
          </div>
        </header>
        <div className="divide-y divide-border/70">
          {activeRecords.length === 0 ? (
            <p className="px-4 py-4 text-sm text-secondary-text"><Lang text={{ ko: "활성 차단이 없습니다.", en: "There are no active disables." }} /></p>
          ) : activeRecords.map((item) => (
            <article key={item.key} className="min-w-0 space-y-3 px-4 py-4">
              <RecordDetails item={item} now={currentNow} />
              <form className="grid min-w-0 grid-cols-1 items-end gap-3 border-t border-border/70 pt-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => void submitRelease(event, item)}>
                <label htmlFor={`release-reason-${item.key}`} className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "조기 해제 사유 (필수)", en: "Early release reason (required)" }} /></span>
                  <Input
                    id={`release-reason-${item.key}`}
                    size="sm"
                    className="min-h-11"
                    maxLength={500}
                    required
                    value={releaseReasons[item.key] || ""}
                    disabled={disabled}
                    onChange={(event) => setReleaseReasons((current) => ({ ...current, [item.key]: event.currentTarget.value }))}
                    placeholder={lang({ ko: "예: 장애 복구 확인", en: "e.g. Incident recovery confirmed" })}
                  />
                </label>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={disabled || !(releaseReasons[item.key] || "").trim()}
                >
                  <Lang text={{ ko: "조기 해제", en: "Release early" }} />
                </Button>
              </form>
            </article>
          ))}
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-border bg-surface px-4 py-4">
        <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "새 비상 차단", en: "New emergency disable" }} /></h3>
        <form className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => void submitCreate(event)}>
          <label htmlFor="emergency-disable-target-kind" className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "차단 대상 종류", en: "Target type" }} /></span>
            <select
              id="emergency-disable-target-kind"
              className="min-h-11 min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={targetKind}
              disabled={disabled}
              onChange={(event) => handleTargetKindChange(event.currentTarget.value as TargetKind)}
            >
              <option value="modelProfile">{lang({ ko: "모델 프로필", en: "Model profile" })}</option>
              <option value="executionRoute">{lang({ ko: "실행 경로", en: "Execution route" })}</option>
            </select>
          </label>
          <label htmlFor="emergency-disable-target" className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "대상", en: "Target" }} /></span>
            <select
              id="emergency-disable-target"
              className="min-h-11 min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={selectedTarget}
              disabled={disabled || targetOptions.length === 0}
              onChange={(event) => setSelectedTarget(event.currentTarget.value)}
            >
              {targetOptions.length === 0 ? (
                <option value="">{lang({ ko: "대상이 없습니다", en: "No targets available" })}</option>
              ) : targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label htmlFor="emergency-disable-until" className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "차단 종료 시각", en: "Disable expiry" }} /></span>
            <Input
              id="emergency-disable-until"
              type="datetime-local"
              size="sm"
              className="min-h-11 min-w-0"
              required
              value={disabledUntilLocal}
              disabled={disabled}
              onChange={(event) => setDisabledUntilLocal(event.currentTarget.value)}
            />
            <span className="text-xs leading-5 text-secondary-text"><Lang text={{
              ko: "브라우저의 현지 시각으로 입력하고 UTC로 저장합니다.",
              en: "Enter local browser time; the value is saved in UTC.",
            }} /></span>
          </label>
          <label htmlFor="emergency-disable-reason" className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "차단 사유 (필수)", en: "Disable reason (required)" }} /></span>
            <Input
              id="emergency-disable-reason"
              size="sm"
              className="min-h-11"
              maxLength={500}
              required
              value={createReason}
              disabled={disabled}
              onChange={(event) => setCreateReason(event.currentTarget.value)}
              placeholder={lang({ ko: "예: 공급자 장애 대응", en: "e.g. Provider incident response" })}
            />
          </label>
          <div className="flex justify-end sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              className="min-h-11 w-full sm:w-auto"
              disabled={disabled || !target || !createReason.trim() || !disabledUntilLocal}
            >
              <Lang text={{ ko: "이 기간 동안 차단", en: "Disable until expiry" }} />
            </Button>
          </div>
        </form>
      </section>

      <details className="min-w-0 rounded-xl border border-border bg-surface px-4 py-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Lang text={{ ko: "만료·해제 이력", en: "Expired and released history" }} /> ({historyRecords.length})
        </summary>
        {historyRecords.length === 0 ? (
          <p className="py-3 text-sm text-secondary-text"><Lang text={{ ko: "기록이 없습니다.", en: "No history." }} /></p>
        ) : (
          <ul className="divide-y divide-border/70">
            {historyRecords.map((item) => (
              <li key={item.key} className="py-3">
                <RecordDetails item={item} now={currentNow} />
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
