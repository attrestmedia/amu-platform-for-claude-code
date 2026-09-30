"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import type { ICommerceWorkflowRun } from "types/commerce";
import {
  type SmartstorePipelineStep,
} from "libs/server-utils/commerce/commercePipelineProgressContract";
import { useSmartstorePipelineSync } from "./useSmartstorePipelineSync";

/**
 * @docHint
 * @purpose P6 책임 단위 분할 — workflow run 원장 조회·생성·재시도·취소·재개와
 *          파이프라인 reconciliation(useSmartstorePipelineSync)을 소유한다.
 *          제작 진행 기록 시트와 헤더 "다음 할 일"이 이 훅의 결과를 소비한다.
 *          workflow-runs query는 패널에서 유일한 구독 지점이며, reconciliation이 같은 캐시를 공유한다.
 * @domain commerce.naver
 * @scope client
 */

type WorkflowRunListResponse = {
  runs: ICommerceWorkflowRun[];
  activeRun: ICommerceWorkflowRun | null;
  totalCount: number;
};

type WorkflowRunAction = "" | "start" | "retry" | "cancel" | "resume";

type UseCommerceWorkflowArgs = {
  universeId: string;
  draftId: string;
  draft: unknown;
  saveDraftSnapshot: () => Promise<unknown>;
  handleDraftMutationError: (error: unknown) => void;
};

export function useCommerceWorkflow({ universeId, draftId, draft, saveDraftSnapshot, handleDraftMutationError }: UseCommerceWorkflowArgs) {
  const queryClient = useQueryClient();
  const [workflowPendingAction, setWorkflowPendingAction] = useState<WorkflowRunAction>("");

  const workflowRunsQuery = useQuery<WorkflowRunListResponse>({
    queryKey: ["commerce-draft-workflow-runs", universeId, draftId],
    queryFn: async () => {
      const response = await fetchClient.get<{ data?: WorkflowRunListResponse }>(
        `/universe/${universeId}/commerce/drafts/${draftId}/workflow-runs`,
        { cache: "no-store" },
      );
      return (response?.data?.data || { runs: [], activeRun: null, totalCount: 0 }) as WorkflowRunListResponse;
    },
    enabled: !!universeId && !!draftId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const activeWorkflowRun = useMemo<ICommerceWorkflowRun | null>(
    function buildActiveWorkflowRun() {
      const data = workflowRunsQuery.data;
      return data?.activeRun || data?.runs?.[0] || null;
    },
    [workflowRunsQuery.data],
  );

  const invalidateWorkflowRuns = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["commerce-draft-workflow-runs", universeId, draftId],
    });
  }, [queryClient, draftId, universeId]);

  const startWorkflowRunMutation = useMutation({
    mutationFn: async () => {
      const saved = (await saveDraftSnapshot()) as { draftId?: string } | null;
      const id = String(saved?.draftId || draftId);
      if (!id) return null;
      // 취소된 run이 남아 있으면 새 파이프라인 키로 별도 run을 만든다. 취소 후 재실행은 재개가 아니라 새 run이다.
      const cancelled = activeWorkflowRun?.lifecycle === "cancelled";
      const cancelledRunId = String(activeWorkflowRun?.runId ?? "");
      if (cancelled && !cancelledRunId) {
        throw new Error("취소된 workflow run 식별자가 없습니다.");
      }
      const response = await fetchClient.post<{ data?: { run?: ICommerceWorkflowRun } }>(
        `/universe/${universeId}/commerce/drafts/${id}/workflow-runs`,
        cancelled ? { idempotencyKey: `${id}:pipeline:rerun:${cancelledRunId}` } : {},
      );
      return (response?.data?.data?.run || null) as ICommerceWorkflowRun | null;
    },
    onError: handleDraftMutationError,
    onSettled: async () => {
      setWorkflowPendingAction("");
      await invalidateWorkflowRuns();
    },
  });

  const workflowRunActionMutation = useMutation({
    mutationFn: async (params: { action: "retry_stage" | "cancel" | "resume"; stage?: string }) => {
      const runId = String(activeWorkflowRun?.runId ?? "");
      if (!runId || !draftId) return null;
      const response = await fetchClient.post<{ data?: { run?: ICommerceWorkflowRun } }>(
        `/universe/${universeId}/commerce/drafts/${draftId}/workflow-runs/${runId}`,
        { action: params.action, ...(params.stage ? { stage: params.stage } : {}) },
      );
      return (response?.data?.data?.run || null) as ICommerceWorkflowRun | null;
    },
    onError: handleDraftMutationError,
    onSettled: async () => {
      setWorkflowPendingAction("");
      await invalidateWorkflowRuns();
    },
  });

  const handleWorkflowStart = useCallback(() => {
    setWorkflowPendingAction("start");
    startWorkflowRunMutation.mutate();
  }, [startWorkflowRunMutation]);

  const handleWorkflowRetryStage = useCallback(
    (stage: string) => {
      setWorkflowPendingAction("retry");
      workflowRunActionMutation.mutate({ action: "retry_stage", stage });
    },
    [workflowRunActionMutation],
  );

  const handleWorkflowCancel = useCallback(async () => {
    setWorkflowPendingAction("cancel");
    workflowRunActionMutation.mutate({ action: "cancel" });
  }, [workflowRunActionMutation]);

  const handleWorkflowResume = useCallback(() => {
    setWorkflowPendingAction("resume");
    workflowRunActionMutation.mutate({ action: "resume" });
  }, [workflowRunActionMutation]);

  // P3: 파이프라인 reconciliation — run lineage와 draft 완료도를 정합시킨다(멱등키 유지).
  const pipelineSync = useSmartstorePipelineSync({
    universeId,
    draftId,
    draft,
    workflowRunsQuery,
  });

  return {
    workflowRunsQuery,
    activeWorkflowRun,
    workflowPendingAction,
    handleWorkflowStart,
    handleWorkflowRetryStage,
    handleWorkflowCancel,
    handleWorkflowResume,
    pipelineSync,
  };
}

export type { SmartstorePipelineStep };
