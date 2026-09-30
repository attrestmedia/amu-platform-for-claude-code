import { useCallback, useEffect, useRef, useState } from "react";
import { dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toast } from "sonner";
import { MARKETING_SYSTEM_API } from "./MarketingOpsConstants";
import type { MarketingSystemStatus, WorkerPollResult } from "./MarketingOpsTypes";
import {
  buildScopeParams,
  getMarketingOperatorErrorMessage,
  toSafeString,
} from "./MarketingOpsUtils";

type WorkerPollOptions = {
  scheduledOnly?: boolean;
  quiet?: boolean;
};

type UseMarketingSystemControllerArgs = {
  scopedUniverseId: string;
  workerId: string;
  queueCategory: string;
  selectedJobId: string;
  setBusyKey: (key: string) => void;
  setErrorMessage: (message: string) => void;
  onRefresh: (jobId?: string) => Promise<void>;
};

export function useMarketingSystemController({
  scopedUniverseId,
  workerId,
  queueCategory,
  selectedJobId,
  setBusyKey,
  setErrorMessage,
  onRefresh,
}: UseMarketingSystemControllerArgs) {
  const [systemStatus, setSystemStatus] = useState<MarketingSystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [workerResult, setWorkerResult] = useState<WorkerPollResult | null>(null);
  const scheduledWorkerTimerRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const loadSystemStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      setErrorMessage("");

      const response = await fetchClient.get<{ data?: MarketingSystemStatus }>(`${MARKETING_SYSTEM_API}/status`, {
        params: buildScopeParams(scopedUniverseId),
      });

      setSystemStatus(response.data?.data || null);
    } catch (error) {
      setErrorMessage(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "system status 조회에 실패했습니다.", en: "Failed to load system status." }),
        ),
      );
    } finally {
      setStatusLoading(false);
    }
  }, [scopedUniverseId, setErrorMessage]);

  const runWorkerPoll = useCallback(
    async (options: WorkerPollOptions = {}) => {
      const busyKeyValue = options.scheduledOnly ? "system:worker:scheduled-poll" : "system:worker:poll";
      try {
        setBusyKey(busyKeyValue);

        const response = await fetchClient.post<{ data?: WorkerPollResult }>(`${MARKETING_SYSTEM_API}/worker/poll`, {
          ...buildScopeParams(scopedUniverseId),
          // 호출 시점마다 고유한 admin-ui worker 식별자를 사용한다.
          workerId: toSafeString(workerId) || `admin-ui-${Date.now()}`,
          queueCategory,
          ...(options.scheduledOnly ? { scheduledOnly: true } : {}),
        });

        const result = response.data?.data || null;
        setWorkerResult(result);
        if (!options.quiet) {
          toast.success(
            lang({
              ko: `worker 실행 결과: ${toSafeString(result?.status) || "unknown"}`,
              en: "Worker poll completed.",
            }),
          );
        }

        await onRefreshRef.current(toSafeString(result?.jobId) || selectedJobId);
      } catch (error) {
        toast.error(
          getMarketingOperatorErrorMessage(
            error,
            lang({ ko: "worker 실행에 실패했습니다.", en: "Worker poll failed." }),
          ),
        );
      } finally {
        setBusyKey("");
      }
    },
    [queueCategory, scopedUniverseId, selectedJobId, setBusyKey, workerId],
  );

  const scheduleScheduledOnlyWorkerPoll = useCallback(
    (publishAt: string) => {
      const publishTime = new Date(publishAt).getTime();
      if (!Number.isFinite(publishTime)) return;

      if (scheduledWorkerTimerRef.current) {
        window.clearTimeout(scheduledWorkerTimerRef.current);
        scheduledWorkerTimerRef.current = null;
      }

      // 예약 등록 이벤트에서만 호출되는 타이머 계산이다.
      const delayMs = Math.max(0, publishTime - Date.now() + 1500);
      scheduledWorkerTimerRef.current = window.setTimeout(
        () => {
          scheduledWorkerTimerRef.current = null;
          void runWorkerPoll({ scheduledOnly: true, quiet: true });
        },
        Math.min(delayMs, 2_147_000_000),
      );
    },
    [runWorkerPoll],
  );

  const runRecovery = useCallback(
    async (dryRun: boolean) => {
      if (!dryRun) {
        const confirmed = await dialog.confirm({
          variant: "danger",
          message: lang({
            ko: "orphan processing job을 실제로 queue로 되돌립니다. 계속할까요?",
            en: "This will requeue orphan processing jobs. Continue?",
          }),
        });
        if (!confirmed) return;
      }

      try {
        setBusyKey(dryRun ? "system:recovery:dry-run" : "system:recovery");

        const response = await fetchClient.post<{ data?: { recoveredCount?: number } }>(
          `${MARKETING_SYSTEM_API}/recover`,
          {
            ...buildScopeParams(scopedUniverseId),
            action: "requeue_orphans",
            dryRun,
            reason: dryRun ? "operator_recovery_dry_run" : "operator_recovery_apply",
          },
        );

        const result = response.data?.data;
        toast.success(
          dryRun
            ? lang({
                ko: `복구 시뮬레이션 완료: ${Number(result?.recoveredCount || 0)}건 후보`,
                en: "Recovery dry-run completed.",
              })
            : lang({
                ko: `orphan 복구 완료: ${Number(result?.recoveredCount || 0)}건`,
                en: "Orphan recovery completed.",
              }),
        );

        await onRefreshRef.current(selectedJobId);
      } catch (error) {
        toast.error(
          getMarketingOperatorErrorMessage(
            error,
            lang({ ko: "queue recovery에 실패했습니다.", en: "Queue recovery failed." }),
          ),
        );
      } finally {
        setBusyKey("");
      }
    },
    [scopedUniverseId, selectedJobId, setBusyKey],
  );

  const clearWorkerResult = useCallback(() => {
    setWorkerResult(null);
  }, []);

  useEffect(
    function fetchSystemStatusOnScopeChange() {
      // scope 변경 시 외부 API에서 시스템 상태 fetch
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadSystemStatus();
    },
    [loadSystemStatus],
  );

  useEffect(function clearScheduledWorkerTimerOnUnmount() {
    return () => {
      if (scheduledWorkerTimerRef.current) {
        window.clearTimeout(scheduledWorkerTimerRef.current);
      }
    };
  }, []);

  return {
    systemStatus,
    statusLoading,
    workerResult,
    loadSystemStatus,
    runWorkerPoll,
    runRecovery,
    scheduleScheduledOnlyWorkerPoll,
    clearWorkerResult,
  };
}
