/**
 * @docHint
 * @purpose Show recent System Control audit entries in a read-only section
 * @process Fetch the latest audit rows when the section is opened and expose retry on failure
 * @domain admin-system
 * @scope component
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Preloader } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { fetchSystemControlHistory, type SystemControlAuditClientItem } from "libs/api/admin/systemControls";
import { logger } from "utils/log";

function formatAuditCreatedAt(value?: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("ko-KR") : "—";
}

export function ChangeHistorySection() {
  const [history, setHistory] = useState<SystemControlAuditClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadHistory = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      setHistory(await fetchSystemControlHistory(20));
      setFailed(false);
    } catch (error) {
      logger.error("[SystemControlBox] history load failed", error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function loadControlHistory() {
    // Load initial read-only data for this tab; later state updates follow the async request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory(false);
  }, [loadHistory]);

  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            <Lang text={{ ko: "변경 이력", en: "Change history" }} />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <Lang text={{ ko: "최근 System Control 변경 기록을 읽기 전용으로 확인합니다.", en: "Review recent System Control changes in read-only mode." }} />
          </p>
        </div>
        {failed ? (
          <Button variant="outline" onClick={() => void loadHistory()}>
            <Lang text={{ ko: "다시 시도", en: "Retry" }} />
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div role="status" aria-live="polite"><Preloader variant="spin" size="sm" container /></div>
      ) : failed ? (
        <p className="text-sm text-destructive" role="alert">
          <Lang text={{ ko: "변경 이력을 불러오지 못했습니다.", en: "Failed to load change history." }} />
        </p>
      ) : history.length ? (
        <ol className="divide-y divide-border">
          {history.map((audit) => (
            <li key={audit.auditId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="max-w-full break-words rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary">
                  {audit.actionType}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground">
                  {audit.targetType}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground">
                  {audit.status}
                </span>
              </div>
              <div className="mt-2 break-words text-sm font-medium">{audit.reason}</div>
              <div className="mt-1 break-all text-xs text-muted-foreground">
                {formatAuditCreatedAt(audit.createdAt)} · actor {audit.actorId || "—"} · request {audit.requestId || "—"}
              </div>
              {audit.summary?.length ? (
                <div className="mt-1 break-words text-xs text-muted-foreground">{audit.summary.join(" / ")}</div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Lang text={{ ko: "아직 기록된 운영 변경 이력이 없습니다.", en: "No recent control history found." }} />
        </p>
      )}
    </section>
  );
}
