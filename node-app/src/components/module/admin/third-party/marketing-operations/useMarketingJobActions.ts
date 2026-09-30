import type { Dispatch, SetStateAction } from "react";
import { dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toast } from "sonner";
import { MARKETING_CONTENT_QUEUE_API } from "./MarketingOpsConstants";
import type { MarketingChannelSummary } from "./MarketingOpsTypes";
import {
  buildScopeParams,
  getMarketingOperatorErrorMessage,
  toSafeString,
} from "./MarketingOpsUtils";

type UseMarketingJobActionsArgs = {
  scopedUniverseId: string;
  selectedJobId: string;
  selectedJobIds: string[];
  selectedActionJobIds: string[];
  selectedArchivableJobIds: string[];
  bulkQueueCategory: string;
  defaultQueueCategory: string;
  setBusyKey: (key: string) => void;
  setSelectedJobId: Dispatch<SetStateAction<string>>;
  setSelectedJobIds: (jobIds: string[]) => void;
  clearDetail: () => void;
  loadSystemStatus: () => Promise<void>;
  loadJobs: (preferredJobId?: string) => Promise<void>;
  onRefresh: (jobId?: string) => Promise<void>;
};

export function useMarketingJobActions({
  scopedUniverseId,
  selectedJobId,
  selectedJobIds,
  selectedActionJobIds,
  selectedArchivableJobIds,
  bulkQueueCategory,
  defaultQueueCategory,
  setBusyKey,
  setSelectedJobId,
  setSelectedJobIds,
  clearDetail,
  loadSystemStatus,
  loadJobs,
  onRefresh,
}: UseMarketingJobActionsArgs) {
  const updateJobCategory = async (jobId: string, queueCategory: string) => {
    const safeJobId = toSafeString(jobId);
    const safeQueueCategory = toSafeString(queueCategory);
    if (!safeJobId || !safeQueueCategory) return;

    try {
      setBusyKey(`job:${safeJobId}:category`);
      await fetchClient.patch(`${MARKETING_CONTENT_QUEUE_API}/${safeJobId}`, {
        ...buildScopeParams(scopedUniverseId),
        action: "update_category",
        queueCategory: safeQueueCategory,
        reason: "operator_category_update",
      });
      toast.success(lang({ ko: "job 카테고리를 변경했습니다.", en: "Job category updated." }));
      await onRefresh(safeJobId);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "job 카테고리 변경에 실패했습니다.", en: "Failed to update job category." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const updateSelectedJobCategories = async (jobIds = selectedActionJobIds) => {
    const targetJobIds = jobIds;
    const queueCategory = toSafeString(bulkQueueCategory || defaultQueueCategory);
    if (targetJobIds.length === 0) {
      toast.error(lang({ ko: "카테고리를 변경할 job을 선택해주세요.", en: "Select jobs to update." }));
      return;
    }
    if (!queueCategory) {
      toast.error(lang({ ko: "변경할 카테고리를 입력해주세요.", en: "Enter a target category." }));
      return;
    }

    try {
      setBusyKey("jobs:category");
      for (const jobId of targetJobIds) {
        await fetchClient.patch(`${MARKETING_CONTENT_QUEUE_API}/${jobId}`, {
          ...buildScopeParams(scopedUniverseId),
          action: "update_category",
          queueCategory,
          reason: "operator_bulk_category_update",
        });
      }
      toast.success(
        lang({
          ko: `${targetJobIds.length}개 job의 카테고리를 변경했습니다.`,
          en: "Selected job categories updated.",
        }),
      );
      await onRefresh(targetJobIds[0]);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "선택 job 카테고리 변경에 실패했습니다.", en: "Failed to update selected job categories." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };
  const runRetry = async (channel: MarketingChannelSummary) => {
    if (!selectedJobId) return;

    const stepId =
      toSafeString(channel.publishStep?.stepId) ||
      toSafeString(channel.reviewStep?.stepId) ||
      toSafeString(channel.validateStep?.stepId);

    try {
      setBusyKey(`${channel.channel}:retry`);
      await fetchClient.post(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/retry`, {
        ...buildScopeParams(scopedUniverseId),
        stepId,
        reason: `${channel.channel}_operator_retry`,
      });
      toast.success(lang({ ko: "재처리를 큐에 등록했습니다.", en: "Retry queued." }));
      await onRefresh(selectedJobId);
    } catch (error) {
      toast.error(getMarketingOperatorErrorMessage(error, lang({ ko: "재처리에 실패했습니다.", en: "Retry failed." })));
    } finally {
      setBusyKey("");
    }
  };

  const runJobLifecycleAction = async (action: "cancel" | "archive" | "cancel_and_archive") => {
    if (!selectedJobId) return;

    const confirmMessage =
      action === "cancel"
        ? lang({
            ko: "선택한 job을 취소하고 queue/processing에서 제거합니다. 계속할까요?",
            en: "Cancel this job and remove it from queue/processing. Continue?",
          })
        : action === "cancel_and_archive"
          ? lang({
              ko: "선택한 job을 취소한 뒤 목록에서 숨깁니다. 계속할까요?",
              en: "Cancel this job and hide it from the list. Continue?",
            })
          : lang({
              ko: "선택한 job을 목록에서 숨깁니다. 이력과 발행 로그는 유지됩니다. 계속할까요?",
              en: "Hide this job from the list. History and publish logs remain. Continue?",
            });

    if (!(await dialog.confirm(confirmMessage))) return;

    try {
      setBusyKey(`job:${action}`);

      await fetchClient.patch(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}`, {
        ...buildScopeParams(scopedUniverseId),
        action,
        reason: `operator_${action}`,
      });

      toast.success(
        action === "cancel"
          ? lang({ ko: "job을 취소했습니다.", en: "Job canceled." })
          : action === "cancel_and_archive"
            ? lang({ ko: "job을 취소하고 숨김 처리했습니다.", en: "Job canceled and archived." })
            : lang({ ko: "job을 숨김 처리했습니다.", en: "Job archived." }),
      );

      if (action === "archive" || action === "cancel_and_archive") {
        setSelectedJobId("");
        clearDetail();
        await Promise.all([loadSystemStatus(), loadJobs("")]);
      } else {
        await onRefresh(selectedJobId);
      }
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(error, lang({ ko: "job 작업에 실패했습니다.", en: "Job action failed." })),
      );
    } finally {
      setBusyKey("");
    }
  };

  const archiveSelectedJobs = async () => {
    const targetJobIds = selectedArchivableJobIds;
    if (selectedJobIds.length === 0) {
      toast.error(lang({ ko: "숨김 처리할 job을 선택해주세요.", en: "Select jobs to hide." }));
      return;
    }
    if (targetJobIds.length === 0) {
      toast.error(
        lang({ ko: "완료/실패/취소된 job만 숨김 처리할 수 있습니다.", en: "Only terminal jobs can be archived." }),
      );
      return;
    }

    const skippedCount = selectedJobIds.length - targetJobIds.length;
    const confirmMessage =
      skippedCount > 0
        ? lang({
            ko: `완료/실패/취소된 job ${targetJobIds.length}개만 숨김 처리합니다. ${skippedCount}개는 현재 상태상 제외됩니다. 계속할까요?`,
            en: `Hide ${targetJobIds.length} terminal job(s). ${skippedCount} selected job(s) will be skipped. Continue?`,
          })
        : lang({
            ko: `선택한 job ${targetJobIds.length}개를 목록에서 숨깁니다. 계속할까요?`,
            en: `Hide ${targetJobIds.length} selected job(s). Continue?`,
          });

    if (!(await dialog.confirm(confirmMessage))) return;

    try {
      setBusyKey("jobs:archive");
      for (const jobId of targetJobIds) {
        await fetchClient.patch(`${MARKETING_CONTENT_QUEUE_API}/${jobId}`, {
          ...buildScopeParams(scopedUniverseId),
          action: "archive",
          reason: "operator_bulk_archive",
        });
      }

      toast.success(
        lang({
          ko: `${targetJobIds.length}개 job을 숨김 처리했습니다.`,
          en: "Selected jobs archived.",
        }),
      );
      setSelectedJobIds([]);
      setSelectedJobId((prev) => (targetJobIds.includes(prev) ? "" : prev));
      await Promise.all([loadSystemStatus(), loadJobs(targetJobIds.includes(selectedJobId) ? "" : selectedJobId)]);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "선택 job 숨김 처리에 실패했습니다.", en: "Failed to archive selected jobs." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };
  return {
    updateJobCategory,
    updateSelectedJobCategories,
    runRetry,
    runJobLifecycleAction,
    archiveSelectedJobs,
  };
}

