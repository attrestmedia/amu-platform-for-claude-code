"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createSpritePipeline,
  getSpritePipeline,
  listSpritePipelines,
  runSpritePipelineStep,
} from "libs/api/game";
import type { IGameAssetPipelineDoc } from "types/game";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 8방향 파이프라인 admin 훅 — 목록/활성 파이프라인/step 실행/폴링 (멱등 계약의 클라이언트 측)
 * @process 목록 조회  파이프라인 선택/생성  step 실행(202 dedupe 정상 처리)  running step 존재 시 5초 폴링
 * @domain game.asset-pipeline
 * @scope admin-client
 */

const PIPELINE_POLL_INTERVAL_MS = 5_000;

function hasRunningStep(pipeline: IGameAssetPipelineDoc | null) {
  if (!pipeline) return false;
  return Object.values(pipeline.steps || {}).some(
    (step) => String(toUnknownRecord(step).status || "") === "running",
  );
}

function toErrorMessage(error: unknown, fallback: string) {
  const rec = toUnknownRecord(error);
  const responseData = toUnknownRecord(toUnknownRecord(rec.response).data);
  return String(responseData.error || rec.message || fallback);
}

export function useSpritePipeline() {
  const [pipelines, setPipelines] = useState<IGameAssetPipelineDoc[]>([]);
  const [activePipeline, setActivePipeline] = useState<IGameAssetPipelineDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningStep, setRunningStep] = useState<string>("");
  const [error, setError] = useState<string>("");

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSpritePipelines({ pageSize: 20 });
      setPipelines(res.data || []);
    } catch (err) {
      logger.error("[useSpritePipeline] list failed:", err);
      setError(toErrorMessage(err, "파이프라인 목록 조회 실패"));
    } finally {
      setLoading(false);
    }
  }, []);

  const selectPipeline = useCallback(async (pipelineId: string) => {
    if (!pipelineId) {
      setActivePipeline(null);
      return;
    }
    try {
      const pipeline = await getSpritePipeline(pipelineId);
      setActivePipeline(pipeline);
      setError("");
    } catch (err) {
      logger.error("[useSpritePipeline] get failed:", err);
      setError(toErrorMessage(err, "파이프라인 조회 실패"));
    }
  }, []);

  const createPipeline = useCallback(
    async (input: {
      anchorImageAssetId?: string;
      anchorSourceUrl?: string;
      name?: string;
      variables?: Record<string, string>;
    }) => {
      setLoading(true);
      setError("");
      try {
        const { pipeline, created } = await createSpritePipeline(input);
        setActivePipeline(pipeline);
        await refreshList();
        return { pipeline, created };
      } catch (err) {
        logger.error("[useSpritePipeline] create failed:", err);
        setError(toErrorMessage(err, "파이프라인 생성 실패"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [refreshList],
  );

  const runStep = useCallback(
    async (stepKey: string, options?: { direction?: string; mirrorConfirmed?: boolean }) => {
      const pipelineId = activePipeline?.pipelineId;
      if (!pipelineId || runningStep) return null;
      setRunningStep(options?.direction ? `${stepKey}:${options.direction}` : stepKey);
      setError("");
      try {
        const result = await runSpritePipelineStep(pipelineId, stepKey, options);
        setActivePipeline(result.pipeline);
        return result;
      } catch (err) {
        logger.error("[useSpritePipeline] run step failed:", err);
        setError(toErrorMessage(err, "step 실행 실패"));
        // 실패해도 서버 상태가 갱신됐을 수 있으므로 재조회
        await selectPipeline(pipelineId).catch(() => {});
        return null;
      } finally {
        setRunningStep("");
      }
    },
    [activePipeline?.pipelineId, runningStep, selectPipeline],
  );

  useEffect(function pollRunningPipeline() {
    if (!hasRunningStep(activePipeline)) return;
    const pipelineId = activePipeline?.pipelineId;
    if (!pipelineId) return;

    const timer = window.setInterval(() => {
      getSpritePipeline(pipelineId)
        .then((pipeline) => setActivePipeline(pipeline))
        .catch((err) => logger.warn("[useSpritePipeline] poll failed:", err));
    }, PIPELINE_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [activePipeline]);

  useEffect(function loadInitialPipelines() {
    let cancelled = false;
    listSpritePipelines({ pageSize: 20 })
      .then((res) => {
        if (!cancelled) setPipelines(res.data || []);
      })
      .catch((err) => logger.warn("[useSpritePipeline] initial list failed:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    pipelines,
    activePipeline,
    loading,
    runningStep,
    error,
    refreshList,
    selectPipeline,
    createPipeline,
    runStep,
  };
}
