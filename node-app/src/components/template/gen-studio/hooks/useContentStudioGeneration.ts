"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGlobalNotifications } from "components/module/notifications/GlobalNotificationProvider";
import { enqueueStudioContentJob, getStudioContentMeta } from "libs/api/lab";
import type { UserScopeType, TextProviderType } from "types/ai";
import type {
  BaseImageType,
  ContentStudioDoneMetaType,
  PromptVisibilityType,
} from "types/app";
import { persistCoinUpdated } from "utils/payment";
import { toErrorLike } from "utils/common";

const GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY = "__gen_studio_custom_prompt__";

export type ContentStudioGenerationRequest = {
  isCustomMode: boolean;
  templateKey?: string;
  templateScope?: "user" | "system";
  customPrompt: string;
  extraPrompt: string;
  platform: string;
  language: string;
  length: string;
  outputFormat: string;
  n: number;
  modelName: string;
  provider: TextProviderType;
  baseImages: BaseImageType[];
  variables: Record<string, string>;
  visibility: PromptVisibilityType;
};

export type ContentStudioGenerationResult = {
  requestId: string;
  contents: string[];
  assetIds: string[];
  coins: number;
  templateKey: string;
  generationMode: ContentStudioDoneMetaType["generationMode"];
  visibility: PromptVisibilityType;
};

type ContentStudioGenerationError = {
  requestId: string;
  error: unknown;
  errorCode: string;
};

type UseContentStudioGenerationArgs = {
  mode: UserScopeType;
  universeId?: string;
  isEmbedded: boolean;
  embedSessionId?: string;
  onDone?: (contents: string[], coins: number, meta: ContentStudioDoneMetaType) => void;
  onSuccess?: (result: ContentStudioGenerationResult) => void;
  onError?: (failure: ContentStudioGenerationError) => void;
  onGenerationStarted?: (payload: { requestId: string; jobCount: number }) => void;
  onGenerationFailed?: (payload: { requestId: string; errorCode: string }) => void;
};

/**
 * 콘텐츠 생성 도메인 경계.
 *
 * UI는 입력 검증과 표현만 소유하고, 이 hook은 enqueue → 전역 job 감시 → asset 본문 조회 →
 * 결과 전달 → 코인 브로드캐스트의 생명주기를 소유한다. retry는 마지막 요청을 같은 payload로 다시
 * enqueue하므로 표현 컴포넌트가 queue 세부사항을 알 필요가 없다.
 */
export function useContentStudioGeneration({
  mode,
  universeId,
  isEmbedded,
  embedSessionId,
  onDone,
  onSuccess,
  onError,
  onGenerationStarted,
  onGenerationFailed,
}: UseContentStudioGenerationArgs) {
  const { watchContentJobs } = useGlobalNotifications();
  const [loading, setLoading] = useState(false);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [lastError, setLastError] = useState<ContentStudioGenerationError | null>(null);
  const lastRequestRef = useRef<ContentStudioGenerationRequest | null>(null);
  const generatingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(function trackContentGenerationMount() {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const generate = useCallback(
    async (request: ContentStudioGenerationRequest) => {
      if (generatingRef.current) return;
      generatingRef.current = true;
      lastRequestRef.current = request;
      setLastError(null);
      setLoading(true);

      const requestId = `studio-content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        const effectiveVisibility: PromptVisibilityType = isEmbedded ? "private" : request.visibility;
        const sharedPayload = {
          extraPrompt: request.extraPrompt,
          platform: request.platform,
          language: request.language,
          length: request.length,
          outputFormat: request.outputFormat,
          n: isEmbedded ? 1 : request.n,
          modelName: request.modelName,
          provider: request.provider,
          baseImages: request.baseImages,
          visibility: effectiveVisibility,
          embedSessionId: embedSessionId || undefined,
          universeId: mode === "universe" ? universeId : undefined,
        };

        const queued = await enqueueStudioContentJob({
          kind: request.isCustomMode ? "basic-content" : "template-content",
          clientRequestId: requestId,
          payload: request.isCustomMode
            ? { ...sharedPayload, prompt: request.customPrompt, generationMode: "custom" }
            : {
                ...sharedPayload,
                templateKey: request.templateKey || "",
                templateScope: isEmbedded ? "system" : request.templateScope,
                variables: request.variables,
                generationMode: "template",
              },
        });

        const jobId = String(queued?.jobId || "").trim();
        if (!jobId) throw new Error("Content generation job enqueue failed.");

        onGenerationStarted?.({ requestId, jobCount: isEmbedded ? 1 : request.n });
        window.dispatchEvent(new CustomEvent("amu:studio-content-job-queued", { detail: { clientRequestId: requestId, jobId } }));

        const [job] = await watchContentJobs([jobId]);
        const jobAssets = (job?.assets || [])
          .slice()
          .sort((a, b) => Number(a.outputIndex || 0) - Number(b.outputIndex || 0));
        const coins = Number(job?.coins || 0);

        if (!jobAssets.length) {
          throw new Error(job?.errorMessage || "Content generation failed");
        }

        // 알림의 textPreview는 카드용 축약본이므로 결과 전달 전 자산 본문을 다시 조회한다.
        const assetMetas = await Promise.all(
          jobAssets.map((asset) =>
            getStudioContentMeta(asset.assetId, asset.visibility === "public" ? "public" : "private", true).catch(
              () => null,
            ),
          ),
        );
        const contents = jobAssets.map((asset, index) => String(assetMetas[index]?.text || asset.textPreview || ""));
        const generationMode = request.isCustomMode ? "custom" : "template";
        const templateKey = request.isCustomMode
          ? GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY
          : String(request.templateKey || "").trim();
        const meta: ContentStudioDoneMetaType = {
          requestId,
          templateKey,
          generationMode,
          visibility: effectiveVisibility,
          assetIds: jobAssets.map((asset) => String(asset.assetId || "")).filter(Boolean),
        };
        const result: ContentStudioGenerationResult = {
          requestId,
          contents,
          assetIds: meta.assetIds || [],
          coins,
          templateKey,
          generationMode,
          visibility: effectiveVisibility,
        };

        if (!mountedRef.current) return;
        setOutputs(contents);
        onDone?.(contents, coins, meta);
        onSuccess?.(result);

        if (mode === "universe" && universeId) {
          persistCoinUpdated({ scope: "universe", universeId, amount: -coins });
        } else {
          persistCoinUpdated({ scope: "user", amount: -coins });
        }
      } catch (error: unknown) {
        if (!mountedRef.current) return;
        const errorLike = toErrorLike(error);
        const rawErrorCode = String(errorLike.errorCode || "").trim();
        const errorCode = /^[A-Z0-9][A-Z0-9_.:-]{0,79}$/.test(rawErrorCode) ? rawErrorCode : "GENERATION_FAILED";
        const failure = { requestId, error, errorCode };
        setLastError(failure);
        onGenerationFailed?.({ requestId, errorCode });
        onError?.(failure);
      } finally {
        generatingRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
    },
    [embedSessionId, isEmbedded, mode, onDone, onError, onGenerationFailed, onGenerationStarted, onSuccess, universeId, watchContentJobs],
  );

  const retry = useCallback(() => {
    const request = lastRequestRef.current;
    if (!request || generatingRef.current) return;
    void generate(request);
  }, [generate]);

  return {
    loading,
    outputs,
    lastError,
    canRetry: Boolean(lastError),
    generate,
    retry,
  };
}
