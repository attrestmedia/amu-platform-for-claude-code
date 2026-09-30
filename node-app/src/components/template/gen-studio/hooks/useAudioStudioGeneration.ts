"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelStudioAudioJob,
  enqueueStudioAudioJob,
  getStudioAudioJob,
  type StudioAudioEnqueueRequest,
  type StudioAudioFormatType,
  type StudioAudioJobTransport,
  type StudioAudioPlaylistTransport,
} from "libs/api/lab";
import { toErrorLike } from "utils/common";
import { isTerminalAudioStatus } from "../modules/audio-studio/audioStudioStatus";

const POLL_INTERVAL_MS = 2500;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVE_JOB_STORAGE_KEY = "amu:gen-studio-audio:active-job";

export type AudioStudioGenerationRequest = {
  text: string;
  sourceRevision: string;
  templateKey: string;
  voiceId: string;
  locale: string;
  format: StudioAudioFormatType;
  speed: number;
  modelName: string;
  clientRequestId: string;
  silenceMs?: number;
};

export type AudioStudioGenerationResult = {
  requestId: string;
  job: StudioAudioJobTransport;
  playlist: StudioAudioPlaylistTransport | null;
  assetIds: string[];
  coins: number;
};

type AudioStudioGenerationError = {
  requestId: string;
  error: unknown;
  errorCode: string;
};

type UseAudioStudioGenerationArgs = {
  onDone?: (job: StudioAudioJobTransport) => void;
  onSuccess?: (result: AudioStudioGenerationResult) => void;
  onError?: (failure: AudioStudioGenerationError) => void;
};

function readActiveJobId() {
  try {
    return String(window.sessionStorage?.getItem(ACTIVE_JOB_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writeActiveJobId(jobId: string) {
  try {
    if (jobId) window.sessionStorage?.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
    else window.sessionStorage?.removeItem(ACTIVE_JOB_STORAGE_KEY);
  } catch {
    // sessionStorage 접근 불가(사생활 모드)는 폴링만 건너뛴다. 생성 자체는 계속한다.
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * audio 생성 도메인 경계. UI는 입력·표현만 소유하고 이 hook이 enqueue → job polling → 결과 전달의
 * 생명주기를 소유한다. 페이지 이탈/복귀는 sessionStorage의 활성 jobId로 resume한다.
 * 중복 클릭은 동기 ref로 잠그고, 재시도는 같은 clientRequestId로 서버 멱등성을 사용한다.
 */
export function useAudioStudioGeneration({ onDone, onSuccess, onError }: UseAudioStudioGenerationArgs = {}) {
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [job, setJob] = useState<StudioAudioJobTransport | null>(null);
  const [lastError, setLastError] = useState<AudioStudioGenerationError | null>(null);
  const generatingRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<AudioStudioGenerationRequest | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const poll = useCallback(async (jobId: string, signal: AbortSignal) => {
    const startedAt = Date.now();
    while (!signal.aborted && Date.now() - startedAt < JOB_TIMEOUT_MS) {
      const next = await getStudioAudioJob(jobId).catch(() => null);
      if (signal.aborted) return null;
      if (next) {
        if (mountedRef.current) setJob(next);
        if (isTerminalAudioStatus(next.status)) return next;
      }
      await sleep(POLL_INTERVAL_MS, signal);
    }
    return null;
  }, []);

  const run = useCallback(
    async (request: AudioStudioGenerationRequest) => {
      if (generatingRef.current) return;
      generatingRef.current = true;
      lastRequestRef.current = request;
      setLastError(null);
      setLoading(true);

      const requestId = request.clientRequestId;
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const payload: StudioAudioEnqueueRequest = {
          provider: "elevenlabs",
          modelName: request.modelName,
          voiceId: request.voiceId,
          locale: request.locale,
          format: request.format,
          speed: request.speed,
          text: request.text,
          sourceRevision: request.sourceRevision,
          templateKey: request.templateKey,
          clientRequestId: request.clientRequestId,
          scope: "user",
          visibility: "private",
          ...(request.silenceMs ? { silenceMs: request.silenceMs } : {}),
        };
        const queued = await enqueueStudioAudioJob(payload);
        const jobId = String(queued?.jobId || "").trim();
        if (!jobId) throw new Error("audio_enqueue_failed");
        writeActiveJobId(jobId);
        if (mountedRef.current) setJob(queued);

        const settled = await poll(jobId, controller.signal);
        writeActiveJobId("");
        if (!settled) {
          if (!controller.signal.aborted) throw new Error("audio_job_timeout");
          return;
        }

        const result: AudioStudioGenerationResult = {
          requestId,
          job: settled,
          playlist: settled.playlist,
          assetIds: (settled.assets || []).map((asset) => asset.assetId).filter(Boolean),
          coins: Number(settled.billing?.actualCoins ?? settled.billing?.estimatedCoins ?? 0),
        };
        if (!mountedRef.current) return;
        onDone?.(settled);
        onSuccess?.(result);
      } catch (error: unknown) {
        if (!mountedRef.current) return;
        const errorLike = toErrorLike(error);
        const rawErrorCode = String(errorLike.errorCode || "").trim();
        const errorCode = /^[A-Z0-9][A-Z0-9_.:-]{0,79}$/.test(rawErrorCode) ? rawErrorCode : "AUDIO_GENERATION_FAILED";
        const failure: AudioStudioGenerationError = { requestId, error, errorCode };
        setLastError(failure);
        onError?.(failure);
      } finally {
        generatingRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
    },
    [onDone, onError, onSuccess, poll],
  );

  useEffect(() => {
    const storedJobId = readActiveJobId();
    if (!storedJobId) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      if (active) setResuming(true);
      const current = await getStudioAudioJob(storedJobId).catch(() => null);
      if (!active) return;
      if (!current) {
        writeActiveJobId("");
        setResuming(false);
        return;
      }
      setJob(current);
      if (isTerminalAudioStatus(current.status)) {
        writeActiveJobId("");
        setResuming(false);
        return;
      }
      setLoading(true);
      const settled = await poll(storedJobId, controller.signal);
      if (!active) return;
      if (settled) {
        writeActiveJobId("");
        setJob(settled);
        onDone?.(settled);
      }
      setLoading(false);
      setResuming(false);
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [onDone, poll]);

  const retry = useCallback(() => {
    const request = lastRequestRef.current;
    if (!request || generatingRef.current) return;
    void run(request);
  }, [run]);

  const cancel = useCallback(async () => {
    const jobId = String(job?.jobId || "").trim();
    if (!jobId) return;
    const cancelled = await cancelStudioAudioJob(jobId).catch(() => null);
    abortRef.current?.abort();
    writeActiveJobId("");
    if (cancelled && mountedRef.current) setJob(cancelled);
  }, [job?.jobId]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    writeActiveJobId("");
    setJob(null);
    setLastError(null);
  }, []);

  /** signed URL 만료 시 provider 재생성 없이 job/asset transport만 다시 읽는다. */
  const refresh = useCallback(async () => {
    const jobId = String(job?.jobId || "").trim();
    if (!jobId) return null;
    const next = await getStudioAudioJob(jobId).catch(() => null);
    if (next && mountedRef.current) setJob(next);
    return next;
  }, [job?.jobId]);

  return {
    loading,
    resuming,
    job,
    playlist: job?.playlist ?? null,
    lastError,
    canRetry: Boolean(lastError) || job?.status === "failed" || job?.status === "cancelled",
    canCancel: job?.status === "queued",
    generate: run,
    retry,
    cancel,
    reset,
    refresh,
  };
}
