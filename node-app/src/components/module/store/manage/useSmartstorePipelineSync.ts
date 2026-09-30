"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import {
  buildSmartstorePipelineStageSyncActions,
  deriveSmartstorePipelineProgress,
  type SmartstorePipelineRunLike,
  type SmartstorePipelineStep,
} from "libs/server-utils/commerce/commercePipelineProgressContract";

/** 파이프라인 단계 진입 라벨 — 헤더 "다음 할 일" 1줄에서 사용한다 (구 PipelineProgressPanel에서 이동). */
export const SMARTSTORE_PIPELINE_STEP_ENTER_LABELS: Record<SmartstorePipelineStep, { ko: string; en: string }> = {
  photos: { ko: "사진 추가", en: "Add photos" },
  basics: { ko: "기본 정보 채우기", en: "Fill in basics" },
  model: { ko: "전용 모델 고르기", en: "Pick a model" },
  images: { ko: "이미지 만들기", en: "Create images" },
  content: { ko: "콘텐츠 만들기", en: "Create content" },
  review: { ko: "등록 점검", en: "Pre-publish check" },
};

/**
 * @docHint
 * @purpose SSM-205 pipeline 진행 동기화 훅. 기존 ProductPipelineProgressPanel(패널 UI)에서
 *          데이터·reconciliation 책임만 분리했다(설계 제안 P3). UI는 StoreManagePanel의
 *          탭 상태·헤더 요약 1줄로 투영된다.
 * @process run 조회(패널 query와 캐시 공유) → run 없으면 생성 → 완료 단계 run 적립(reconciliation)
 *          → progress 유도 반환(재개 지점·건너뛰기 판정)
 * @domain commerce.naver
 * @scope client
 *
 * - run은 draft당 하나(`{draftId}:pipeline` 멱등)라 서버가 재사용을 보장한다.
 * - reconciliation: draft에서 완료·건너뜀인데 run에 기록 안 된 stage를 적립한다. 실패·충돌은 조용히 넘긴다 —
 *   다음 draft·run 갱신 때 같은 목록으로 재시도되고, 같은 멱등키라 서버가 중복 기록하지 않는다.
 */

type ApiEnvelope<T = unknown> = { data?: T };

type PipelineRunRecord = SmartstorePipelineRunLike & {
  runId?: unknown;
  lifecycle?: unknown;
};

export type WorkflowRunsResponse = {
  runs?: PipelineRunRecord[];
  activeRun?: PipelineRunRecord | null;
};

type UseSmartstorePipelineSyncArgs = {
  universeId: string;
  draftId: string;
  draft: unknown;
  /** 패널이 이미 구독 중인 workflow-runs query(같은 queryKey — 관찰자만 추가되고 fetch는 1회). */
  workflowRunsQuery: UseQueryResult<WorkflowRunsResponse, unknown>;
};

export function useSmartstorePipelineSync({ universeId, draftId, draft, workflowRunsQuery }: UseSmartstorePipelineSyncArgs) {
  const queryClient = useQueryClient();
  const workflowRunsQueryKey = useMemo(
    () => ["commerce-draft-workflow-runs", universeId, draftId] as const,
    [draftId, universeId],
  );
  const run = workflowRunsQuery.data?.activeRun || workflowRunsQuery.data?.runs?.[0] || null;
  const runCreationAttemptRef = useRef("");
  const syncInFlightRef = useRef(false);
  const syncedKeysRef = useRef<Set<string>>(new Set());

  // 새 draft/imported draft에 최초 run을 만든다. 이미 취소·완료된 기록이 있으면 자동으로 되살리지 않는다.
  useEffect(
    function ensurePipelineRun() {
      if (
        !universeId ||
        !draftId ||
        workflowRunsQuery.isLoading ||
        workflowRunsQuery.isError ||
        run ||
        (workflowRunsQuery.data?.runs?.length || 0) > 0
      ) {
        return;
      }
      const attemptKey = `${universeId}:${draftId}`;
      if (runCreationAttemptRef.current === attemptKey) return;
      runCreationAttemptRef.current = attemptKey;

      let cancelled = false;
      (async function createPipelineRun() {
        try {
          const response = await fetchClient.post<ApiEnvelope<{ run?: PipelineRunRecord }>>(
            `/universe/${universeId}/commerce/drafts/${draftId}/workflow-runs`,
            {},
          );
          if (!cancelled) {
            const nextRun = response?.data?.data?.run;
            if (nextRun) {
              queryClient.setQueryData(workflowRunsQueryKey, {
                runs: [nextRun],
                activeRun: nextRun,
                totalCount: 1,
              });
            } else {
              await queryClient.invalidateQueries({ queryKey: workflowRunsQueryKey });
            }
          }
        } catch {
          // run이 없어도 파이프라인 표시는 draft 기준으로 동작한다. 다음 query 재시도에서 다시 시도한다.
          runCreationAttemptRef.current = "";
          void queryClient.invalidateQueries({ queryKey: workflowRunsQueryKey });
        }
      })();
      return () => {
        cancelled = true;
      };
    },
    [
      draftId,
      queryClient,
      run,
      universeId,
      workflowRunsQuery.data?.runs?.length,
      workflowRunsQuery.isError,
      workflowRunsQuery.isLoading,
      workflowRunsQueryKey,
    ],
  );

  const progress = useMemo(() => deriveSmartstorePipelineProgress({ draft, run }), [draft, run]);

  // reconciliation: draft에서 완료·건너뜀인데 run에 기록 안 된 stage를 적립한다. 실패·충돌은 조용히 넘긴다 —
  // 다음 draft·run 갱신 때 같은 목록으로 재시도되고, 같은 멱등키라 서버가 중복 기록하지 않는다.
  useEffect(() => {
    if (!run || typeof (run as { runId?: unknown }).runId !== "string") return;
    const runId = String((run as { runId: unknown }).runId);
    if (syncInFlightRef.current) return;
    const actions = buildSmartstorePipelineStageSyncActions({ runId, draft, run });
    const pending = actions.filter((action) => !syncedKeysRef.current.has(`${draftId}:${action.idempotencyKey}`));
    if (!pending.length) return;

    syncInFlightRef.current = true;
    (async () => {
      try {
        for (const action of pending) {
          try {
            await fetchClient.post<ApiEnvelope>(
              `/universe/${universeId}/commerce/drafts/${draftId}/workflow-runs/${runId}`,
              { action: "start_stage", stage: action.stage, idempotencyKey: action.idempotencyKey },
            );
            await fetchClient.post<ApiEnvelope>(
              `/universe/${universeId}/commerce/drafts/${draftId}/workflow-runs/${runId}`,
              {
                action: "complete_stage",
                stage: action.stage,
                idempotencyKey: action.idempotencyKey,
                evidence: action.evidence,
              },
            );
            syncedKeysRef.current.add(`${draftId}:${action.idempotencyKey}`);
          } catch {
            // 실패한 키는 기록하지 않는다. 다음 run/draft 갱신에서 start/complete를 다시 시도한다.
          }
        }
        await queryClient.invalidateQueries({ queryKey: workflowRunsQueryKey });
      } finally {
        syncInFlightRef.current = false;
      }
    })();
  }, [draft, draftId, queryClient, run, universeId, workflowRunsQueryKey]);

  return {
    progress,
    activeRun: run,
    resumeStep: progress.resumeStep,
    resumeDef: progress.steps.find((step) => step.key === progress.resumeStep),
  };
}
