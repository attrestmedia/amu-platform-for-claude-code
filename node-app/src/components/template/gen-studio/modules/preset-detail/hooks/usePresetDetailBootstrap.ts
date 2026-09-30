"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  ASPECT_TO_OPENAI_COMPAT_SIZE,
  DEFAULT_IMAGE_ASPECT,
  DEFAULT_IMAGE_MODEL_BY_PROVIDER,
  DEFAULT_IMAGE_SIZE,
  type ImageModelNameType,
  type SupportedAspectRatio,
} from "consts/ai";
import type { ImageProviderType } from "types/ai";
import type { PromptItemType } from "types/app";
import {
  extractPromptVariables,
  normalizeImagePromptNegative,
  resolvePromptSelectOption,
} from "utils/lab";
import { clampAspectForProvider, normalizeGoogleImageSizeForModel, resolvePromptDefaultModelName, resolvePromptModelLock } from "utils/app";
import { toUnknownRecord, type UnknownRecord } from "utils/common";
import type { VarSpec } from "../types";

type Args = {
  entrySessionKey: number;
  initialMode?: "template" | "custom";
  detail: PromptItemType | null;
  defaultImageModelByProvider?: Partial<Record<ImageProviderType, string>>;
  initialTemplateVariables?: Readonly<Record<string, string>>;
  /**
   * 진입 surface가 권장하는 시작 비율. 템플릿 defaultParams보다 우선한다.
   * 사용자는 열린 뒤 자유롭게 바꿀 수 있다 — 잠그는 값이 아니라 시작값이다 (SSM-203).
   */
  initialAspectRatio?: string;
  allowedTemplateVariableKeys?: readonly string[];
  requiredTemplateVariableKeys?: readonly string[];
  lockedTemplateVariableKeys?: readonly string[];
  resetRecentState: () => void;
  scheduleRecentReload: (delayMs?: number) => void;
  resetReferenceState: () => void;
  setExtra: Dispatch<SetStateAction<string>>;
  setShowExtraError: Dispatch<SetStateAction<boolean>>;
  setImages: Dispatch<SetStateAction<string[]>>;
  setViewerImages: Dispatch<SetStateAction<string[]>>;
  setViewerSrc: Dispatch<SetStateAction<string | null>>;
  setViewerIndex: Dispatch<SetStateAction<number>>;
  setN: Dispatch<SetStateAction<number>>;
  setIsCustomMode: Dispatch<SetStateAction<boolean>>;
  setCustomPrompt: Dispatch<SetStateAction<string>>;
  setNegative: Dispatch<SetStateAction<string>>;
  setSelectedModelNames: Dispatch<SetStateAction<ImageModelNameType[]>>;
  setAspect: Dispatch<SetStateAction<SupportedAspectRatio>>;
  setSize: Dispatch<SetStateAction<string>>;
  setVarSpecs: Dispatch<SetStateAction<VarSpec[]>>;
  setVars: Dispatch<SetStateAction<Record<string, string>>>;
};

export function usePresetDetailBootstrap({
  entrySessionKey,
  initialMode,
  detail,
  defaultImageModelByProvider,
  initialTemplateVariables,
  initialAspectRatio,
  allowedTemplateVariableKeys,
  requiredTemplateVariableKeys,
  lockedTemplateVariableKeys,
  resetRecentState,
  scheduleRecentReload,
  resetReferenceState,
  setExtra,
  setShowExtraError,
  setImages,
  setViewerImages,
  setViewerSrc,
  setViewerIndex,
  setN,
  setIsCustomMode,
  setCustomPrompt,
  setNegative,
  setSelectedModelNames,
  setAspect,
  setSize,
  setVarSpecs,
  setVars,
}: Args) {
  useEffect(() => {
    const isCustomOnlyEntry = !detail && initialMode === "custom";
    if (!detail && !isCustomOnlyEntry) return;

    setExtra("");
    setShowExtraError(false);
    setImages([]);
    setViewerImages([]);
    setViewerSrc(null);
    setViewerIndex(0);
    setN(1);
    setIsCustomMode(isCustomOnlyEntry);
    setCustomPrompt("");

    resetRecentState();
    resetReferenceState();
    scheduleRecentReload(700);

    if (!detail) {
      setNegative("");
      setSelectedModelNames([
        String(defaultImageModelByProvider?.google || DEFAULT_IMAGE_MODEL_BY_PROVIDER.google) as ImageModelNameType,
      ]);
      setAspect((initialAspectRatio || DEFAULT_IMAGE_ASPECT) as SupportedAspectRatio);
      setSize(DEFAULT_IMAGE_SIZE);
      setVarSpecs([]);
      setVars({});
      return;
    }

    const dp: UnknownRecord = toUnknownRecord(detail.defaultParams);
    setNegative(normalizeImagePromptNegative(typeof dp?.negative === "string" ? dp.negative : ""));

    const modelLock = resolvePromptModelLock(dp);
    const dpProvider: ImageProviderType =
      modelLock?.provider ||
      (dp?.provider === "openai" || dp?.provider === "xai" || dp?.provider === "google"
        ? (dp.provider as ImageProviderType)
        : "google");

    const nextDefaultModel = String(
      modelLock?.modelName ||
        resolvePromptDefaultModelName(dp) ||
        defaultImageModelByProvider?.[dpProvider] ||
        DEFAULT_IMAGE_MODEL_BY_PROVIDER[dpProvider] ||
        defaultImageModelByProvider?.google ||
        DEFAULT_IMAGE_MODEL_BY_PROVIDER.google,
    );
    setSelectedModelNames([nextDefaultModel as ImageModelNameType]);

    // surface가 지정한 시작 비율이 템플릿 기본값을 이긴다. 지정이 없으면 종전대로 템플릿 값을 쓴다.
    const rawAspect = initialAspectRatio || (dp?.aspectRatio ? String(dp.aspectRatio) : DEFAULT_IMAGE_ASPECT);
    const nextAspect = clampAspectForProvider(dpProvider, rawAspect, String(nextDefaultModel));
    setAspect(nextAspect);

    if (dpProvider === "openai" || dpProvider === "xai") {
      const mapped =
        (ASPECT_TO_OPENAI_COMPAT_SIZE as Record<string, string>)[nextAspect] || DEFAULT_IMAGE_SIZE;
      setSize(String(mapped));
    } else {
      const rawSize = typeof dp?.size === "string" ? dp.size : undefined;
      setSize(normalizeGoogleImageSizeForModel(String(nextDefaultModel), rawSize));
    }

    const requiredVariableKeySet = new Set(requiredTemplateVariableKeys || []);
    const lockedVariableKeySet = new Set(lockedTemplateVariableKeys || []);
    const allowedVariableKeySet = allowedTemplateVariableKeys ? new Set(allowedTemplateVariableKeys) : null;
    const specs = extractPromptVariables(detail.templateText || "").filter((spec) => !allowedVariableKeySet || allowedVariableKeySet.has(spec.key)).map((spec) => ({
      ...spec,
      required: Boolean(spec.required || requiredVariableKeySet.has(spec.key)),
      disabled: lockedVariableKeySet.has(spec.key),
    }));
    setVarSpecs(specs);
    const init: Record<string, string> = {};
    specs.forEach((spec) => {
      const initialValue = String(initialTemplateVariables?.[spec.key] || "").trim();
      if (spec.kind === "select" && spec.options?.[0]) {
        const matchedInitialValue = resolvePromptSelectOption(spec.options, initialValue);
        // 기본값 = 각 항목의 첫번째 옵션 (3차 개선: '사용하지 않음' 기본 → 첫 옵션 기본)
        init[spec.key] = matchedInitialValue || spec.options[0];
        return;
      }
      init[spec.key] = initialValue;
    });
    setVars(init);
    // detail 자체는 동일 key에서 reference가 바뀌어도 bootstrap 재실행이 불필요하므로 detail.key만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entrySessionKey,
    initialMode,
    detail?.key,
    defaultImageModelByProvider,
    initialTemplateVariables,
    initialAspectRatio,
    allowedTemplateVariableKeys,
    requiredTemplateVariableKeys,
    lockedTemplateVariableKeys,
    resetRecentState,
    scheduleRecentReload,
    resetReferenceState,
    setExtra,
    setShowExtraError,
    setImages,
    setViewerImages,
    setViewerSrc,
    setViewerIndex,
    setN,
    setIsCustomMode,
    setCustomPrompt,
    setNegative,
    setSelectedModelNames,
    setAspect,
    setSize,
    setVarSpecs,
    setVars,
  ]);
}
