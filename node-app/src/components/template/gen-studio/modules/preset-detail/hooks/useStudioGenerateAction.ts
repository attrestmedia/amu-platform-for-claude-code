"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_IMAGE_MODEL_BY_PROVIDER } from "consts/ai";
import { enqueueStudioImageJob } from "libs/api/lab";
import { useGlobalNotifications } from "components/module/notifications/GlobalNotificationProvider";
import type { UiScopeType, UserScopeType } from "types/ai";
import type { ImagePromptMetaType, PromptVisibilityType } from "types/app";
import { createSha256Hex } from "utils/common";
import { inferProviderFromModelName, normalizeSelectedModelNames } from "utils/app";
import type { ReferenceStrengthType } from "utils/lab";

type BaseImagePayload = { mimeType: string; data: string };

type Args = {
  mode: UserScopeType;
  universeId?: string;
  fallbackModelName?: string;
  /**
   * 진입 surface가 지정하는 멱등 seed (SSM-203).
   *
   * 주면 `clientRequestId`가 무작위값 대신 **seed + 실제 생성 조건**으로 결정된다. 같은 조건의 재요청은
   * 서버가 기존 job을 재사용하므로 코인을 다시 쓰지 않는다. 실패한 job은 재사용 대상이 아니라
   * 재시도가 막히지 않는다. 주지 않으면 종전처럼 매 요청이 새 job이다.
   */
  idempotencySeed?: string;
};

type RequestArgs = {
  isCustomMode: boolean;
  templateKey?: string;
  templateScope?: UiScopeType;
  customPrompt: string;
  effectiveExtra: string;
  vars: Record<string, string>;
  aspect: string;
  size: string;
  negative: string;
  n: number;
  modelNames: string[];
  confirmedPromptHash?: string;
  baseImages?: BaseImagePayload[];
  modelImages?: BaseImagePayload[];
  referenceStrength: ReferenceStrengthType;
  modelReferenceStrength: ReferenceStrengthType;
  visibility: PromptVisibilityType;
};

type GenerateResult = {
  requestId: string;
  images: string[];
  assets?: ImagePromptMetaType[];
  coins: number;
  failedModelNames?: string[];
};

type PendingJobType = {
  requestId: string;
  startedAt: number;
};

type RequestCallbacks = {
  onSuccess?: (result: GenerateResult) => void;
  onQueued?: (result: { requestId: string; jobIds: string[] }) => void;
  onError?: (error: unknown) => void;
};

/** base64 전체를 해시하지 않고 크기와 앞뒤 조각만 쓴다. 내용 교체를 잡기에 충분하고 비용이 작다. */
function fingerprintReferenceImages(images?: BaseImagePayload[]) {
  return (images || [])
    .map((image) => {
      const data = String(image?.data || "");
      return `${image?.mimeType || ""}:${data.length}:${data.slice(0, 48)}:${data.slice(-48)}`;
    })
    .join("|");
}

/**
 * 같은 생성으로 볼 조건을 하나의 문자열로 모은다.
 *
 * 프롬프트 해시만으로는 부족하다 — 비율·크기·장수·네거티브가 달라지면 결과가 다른 생성이고,
 * 그때 이전 job을 재사용하면 **사용자가 바꾼 설정과 다른 이미지가 돌아온다.**
 */
async function buildStableClientRequestId(seed: string, args: RequestArgs, modelName: string) {
  const material = JSON.stringify([
    args.confirmedPromptHash,
    modelName,
    args.aspect,
    args.size,
    args.negative,
    args.n,
    args.visibility,
    args.referenceStrength,
    args.modelReferenceStrength,
    // 참고 이미지는 장수·파일명만으로 구분되지 않는다. 같은 이름·같은 장수로 내용만 바뀐 경우
    // (상품 사진 재업로드 등) 지문이 없으면 바뀐 참조가 반영되지 않은 이전 결과가 돌아온다.
    fingerprintReferenceImages(args.baseImages),
    fingerprintReferenceImages(args.modelImages),
  ]);
  return `${seed}|${(await createSha256Hex(material)).slice(0, 32)}`;
}

export function useStudioGenerateAction({ mode, universeId, fallbackModelName, idempotencySeed }: Args) {
  // Job 완료 감시는 전역 알림 Provider 단일 폴링을 사용한다(화면별 폴링 추가 금지).
  const { watchImageJobs } = useGlobalNotifications();
  const [pendingJobs, setPendingJobs] = useState<PendingJobType[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pendingCount = pendingJobs.length;

  const enqueueGenerate = useCallback(
    (args: RequestArgs & RequestCallbacks): string => {
      const requestId = `studio-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setPendingJobs((prev) => [...prev, { requestId, startedAt: Date.now() }]);

      void (async () => {
        try {
          const selectedModels = normalizeSelectedModelNames(
            args.modelNames || [],
            String(fallbackModelName || DEFAULT_IMAGE_MODEL_BY_PROVIDER.google),
          ).map((m) => String(m));

          const jobIds: string[] = [];
          // 서버가 기존 job을 재사용한 경우 이번 요청으로 새로 빠진 코인은 없다. 표시·집계에서 제외한다.
          const reusedJobIds = new Set<string>();
          let firstError: unknown = null;

          const seed = String(idempotencySeed || "").trim();
          for (const modelName of selectedModels) {
            const provider = inferProviderFromModelName(modelName);
            try {
              // 프롬프트 해시가 없으면 조건을 다 담지 못하므로 멱등을 걸지 않는다.
              // 과소 재사용은 코인을 더 쓰는 문제지만, 과대 재사용은 다른 설정의 결과를 돌려주는 문제다.
              const clientRequestId =
                seed && args.confirmedPromptHash
                  ? await buildStableClientRequestId(seed, args, modelName)
                  : `${requestId}-${modelName}`;
              const queued = await enqueueStudioImageJob({
                kind: args.isCustomMode ? "basic-image" : "template-image",
                clientRequestId,
                payload: args.isCustomMode
                  ? {
                      prompt: args.customPrompt,
                      templateKey: args.templateKey,
                      templateScope: args.templateScope,
                      generationMode: "custom",
                      aspectRatio: args.aspect,
                      size: args.size,
                      n: args.n,
                      modelName,
                      provider,
                      confirmedPromptHash: args.confirmedPromptHash,
                      universeId: mode === "universe" ? universeId : undefined,
                      baseImages: args.baseImages?.length ? args.baseImages : undefined,
                      modelImages: args.modelImages?.length ? args.modelImages : undefined,
                      referenceStrength: args.referenceStrength,
                      modelReferenceStrength: args.modelReferenceStrength,
                      visibility: args.visibility,
                    }
                  : {
                      templateKey: args.templateKey || "",
                      templateScope: args.templateScope,
                      variables: args.vars,
                      extraPrompt: args.effectiveExtra,
                      aspectRatio: args.aspect,
                      size: args.size,
                      negative: args.negative,
                      n: args.n,
                      modelName,
                      provider,
                      confirmedPromptHash: args.confirmedPromptHash,
                      universeId: mode === "universe" ? universeId : undefined,
                      baseImages: args.baseImages?.length ? args.baseImages : undefined,
                      modelImages: args.modelImages?.length ? args.modelImages : undefined,
                      referenceStrength: args.referenceStrength,
                      modelReferenceStrength: args.modelReferenceStrength,
                      visibility: args.visibility,
                    },
              });

              if (queued?.jobId) {
                jobIds.push(String(queued.jobId));
                if (queued.reused) reusedJobIds.add(String(queued.jobId));
              }
            } catch (error: unknown) {
              if (!firstError) firstError = error;
            }
          }

          if (jobIds.length === 0) {
            throw firstError || new Error("Image generation job enqueue failed for all selected models.");
          }

          window.dispatchEvent(new CustomEvent("amu:studio-image-job-queued", { detail: { requestId, jobIds } }));
          args.onQueued?.({ requestId, jobIds });

          const completedJobs = await watchImageJobs(jobIds);
          if (!mountedRef.current || completedJobs.length === 0) return;

          const assets = completedJobs.flatMap((job) => job.assets || []);
          const failedJobs = completedJobs.filter((job) => job.status !== "success");
          if (assets.length === 0) {
            throw new Error(
              failedJobs.map((job) => job.errorMessage).find(Boolean) || "Image generation failed for all jobs.",
            );
          }

          args.onSuccess?.({
            requestId,
            images: assets
              .map((asset) => String(asset.url || "").trim())
              .filter(Boolean),
            assets,
            coins: completedJobs.reduce(
              (sum, job) => (reusedJobIds.has(String(job.jobId)) ? sum : sum + Number(job.coins || 0)),
              0,
            ),
            failedModelNames: failedJobs.map((job) => String(job.modelName || "").trim()).filter(Boolean),
          });
        } catch (error: unknown) {
          if (mountedRef.current) args.onError?.(error);
        } finally {
          if (mountedRef.current) {
            setPendingJobs((prev) => prev.filter((job) => job.requestId !== requestId));
          }
        }
      })();

      return requestId;
    },
    [fallbackModelName, idempotencySeed, mode, universeId, watchImageJobs],
  );

  return {
    pendingJobs,
    pendingCount,
    enqueueGenerate,
  };
}
