"use client";

import { useCallback, useEffect, useState, type DragEvent } from "react";
import { lang } from "components/module/i18n";
import { dialog } from "@amu-labs/ui";
import { MAX_BASE_FILE_BYTES } from "consts/app";
import type { ImageProviderType } from "types/ai";
import {
  createImageFileDiagnostic,
  getImageFileMimeType,
  isImageFileError,
  isImageFileLike,
  prepareImageFilePayloadWithUploadFallback,
  type ImageFileDiagnostic,
  type ImageFileFailureReason,
} from "utils/app/imageFile";
import {
  getReferenceStrengthPrompt,
  type ReferenceHintVariantType,
  type ReferenceStrengthType,
} from "utils/lab";
import { logger } from "utils/log";
import type { AppliedRefItemType, SettingDialogType } from "../types";

const REFERENCE_IMAGE_PROMPT_MESSAGE = "첨부 이미지를 참고해서 생성";
const ECOMMERCE_REFERENCE_IMAGE_PROMPT_MESSAGE = "첨부 이미지를 제품 기준 이미지로 사용해서 생성";
const ECOMMERCE_REFERENCE_IMAGE_CONSTRAINT_MESSAGE =
  "배경, 조명, 그림자, 촬영 앵글, 사용 장면만 템플릿 요구에 맞게 조정하고 제품 자체의 디자인/재질/스타일은 변경하지 않음";

export type ImageAttachFailureType = {
  reason: ImageFileFailureReason;
  diagnostic: ImageFileDiagnostic;
};
type AppendAttachedImageOptionsType = {
  apply?: boolean;
};

type Args = {
  maxRefImages: number;
  imageProvider: ImageProviderType;
  activeSettingDialog: SettingDialogType;
  referenceHintVariant?: ReferenceHintVariantType;
};

function makeRefId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

function isManagedReferenceHintParagraph(paragraph: string) {
  const lines = String(paragraph || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const [heading] = lines;
  if (heading === "**참고 이미지:**") {
    return lines.some(
      (line) =>
        line === `- ${REFERENCE_IMAGE_PROMPT_MESSAGE}` ||
        line === `- ${ECOMMERCE_REFERENCE_IMAGE_PROMPT_MESSAGE}` ||
        line.startsWith("- 참고 이미지 #"),
    );
  }
  // 모델 이미지 기능은 첨부 이미지로 병합되어 제거됐지만, 과거 저장본의 관리형 힌트는 계속 정리 대상
  if (heading === "**모델 이미지:**") {
    return lines.some((line) => line.startsWith("- 모델 이미지 #") || line.startsWith("- "));
  }
  return false;
}

function stripManagedReferenceHints(rawExtra: string) {
  return String(rawExtra || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .filter((paragraph) => !isManagedReferenceHintParagraph(paragraph))
    .join("\n\n")
    .trim();
}

type PreparedAttachedImageType = {
  attachedId: string;
  mimeType: string;
  data: string;
  preview: string;
  name: string;
};

type InitialReferenceImageType = {
  mimeType: string;
  data: string;
  preview?: string;
  name?: string;
};

async function fetchImageAsBase64(url: string): Promise<{
  mimeType: string;
  data: string;
  preview: string;
  name: string;
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch_failed");
  const blob = await res.blob();
  const mimeType = blob.type || "image/png";

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const b64 = dataUrl.split(",")[1] || "";
      const segments = new URL(url, window.location.origin).pathname.split("/");
      const name = decodeURIComponent(segments[segments.length - 1] || "image");
      resolve({ mimeType, data: b64, preview: dataUrl, name });
    };
    reader.onerror = () => reject(new Error(`reference_image_read_failed:${reader.error?.name || "unknown"}`));
    reader.onabort = () => reject(new Error("reference_image_read_aborted"));
    reader.readAsDataURL(blob);
  });
}

export function useReferenceImageManager({
  maxRefImages,
  imageProvider,
  activeSettingDialog,
  referenceHintVariant = "default",
}: Args) {
  const [baseImageIds, setBaseImageIds] = useState<string[]>([]);
  const [baseImages, setBaseImages] = useState<Array<{ mimeType: string; data: string }>>([]);
  const [baseImagePreviews, setBaseImagePreviews] = useState<string[]>([]);
  const [baseImageNames, setBaseImageNames] = useState<string[]>([]);
  const [selectedRecentUrls, setSelectedRecentUrls] = useState<string[]>([]);
  const [appliedRefs, setAppliedRefs] = useState<AppliedRefItemType[]>([]);
  const [imageAttachFailure, setImageAttachFailure] = useState<ImageAttachFailureType | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // [정책] provider별 참고 이미지 상한은 서버 guard와 동일한 상수에서 계산
  const canAttachReference = maxRefImages > 0;

  const resetReferenceState = useCallback(() => {
    setBaseImages([]);
    setBaseImagePreviews([]);
    setBaseImageNames([]);
    setBaseImageIds([]);
    setSelectedRecentUrls([]);
    setAppliedRefs([]);
  }, []);

  const clearImageAttachFailure = useCallback(() => {
    setImageAttachFailure(null);
  }, []);

  const notifyImageAttachFailure = useCallback(
    (reason: ImageFileFailureReason, diagnostic: ImageFileDiagnostic, error?: unknown) => {
      const errorMessage = error instanceof Error ? error.message : error ? String(error) : undefined;
      const causeMessage =
        error && typeof error === "object" && "cause" in error && (error as { cause?: unknown }).cause instanceof Error
          ? (error as { cause: Error }).cause.message
          : undefined;
      logger.warn(`[useReferenceImageManager] reference image append failed`, {
        reason,
        diagnostic,
        errorMessage,
        causeMessage,
      });
      setImageAttachFailure({ reason, diagnostic });
    },
    [],
  );

  useEffect(function resetReferencesWhenDisabled() {
    if (maxRefImages <= 0) {
      // provider별 첨부 정책 변경에 따른 외부 sync 형태의 상태 초기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resetReferenceState();
      setIsDragging(false);
    }
  }, [imageProvider, maxRefImages, resetReferenceState]);

  useEffect(function clearDraggingWhenForbidden() {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!canAttachReference) setIsDragging(false);
  }, [canAttachReference]);

  const prepareAttachedImageFile = useCallback(
    async (file: File | null): Promise<PreparedAttachedImageType | null> => {
      if (!canAttachReference) {
        logger.warn("[useReferenceImageManager] attach blocked: canAttachReference=false", { imageProvider });
        return null;
      }
      if (!file) {
        logger.warn("[useReferenceImageManager] attach blocked: file is null");
        resetReferenceState();
        return null;
      }

      if (maxRefImages <= 0) {
        logger.warn("[useReferenceImageManager] attach blocked: maxRefImages<=0", { maxRefImages });
        return null;
      }

      const fallbackMimeType = getImageFileMimeType(file);
      const fallbackDiagnostic = createImageFileDiagnostic(file, fallbackMimeType);

      if (!isImageFileLike(file)) {
        notifyImageAttachFailure("unsupported_type", fallbackDiagnostic);
        return null;
      }

      if (file.size > MAX_BASE_FILE_BYTES) {
        notifyImageAttachFailure("file_too_large", fallbackDiagnostic);
        resetReferenceState();
        return null;
      }

      let payload: Awaited<ReturnType<typeof prepareImageFilePayloadWithUploadFallback>>;
      try {
        payload = await prepareImageFilePayloadWithUploadFallback(file, fallbackMimeType);
      } catch (error) {
        if (isImageFileError(error)) {
          notifyImageAttachFailure(error.reason, error.diagnostic, error);
        } else {
          notifyImageAttachFailure("read_failed", fallbackDiagnostic, error);
        }
        return null;
      }

      return {
        attachedId: makeRefId("attached"),
        mimeType: payload.mimeType,
        data: payload.data,
        preview: payload.preview,
        name: file.name,
      };
    },
    [canAttachReference, imageProvider, maxRefImages, notifyImageAttachFailure, resetReferenceState],
  );

  const appendAttachedImageFile = useCallback(
    async (file: File | null, options: AppendAttachedImageOptionsType = {}) => {
      try {
        const prepared = await prepareAttachedImageFile(file);
        if (!prepared) return false;

        const existingIndex = baseImages.findIndex((img) => img.data === prepared.data);
        const attachedId = existingIndex >= 0 ? baseImageIds[existingIndex] || prepared.attachedId : prepared.attachedId;
        const alreadyApplied = appliedRefs.some((item) => item.origin === "attached" && item.attachedId === attachedId);

        if (existingIndex < 0 && baseImages.length >= maxRefImages) {
          void dialog.alert(
            lang({
              ko: `참고 이미지는 최대 ${maxRefImages}장까지 가능합니다.`,
              en: `Up to ${maxRefImages} reference images allowed.`,
            }),
          );
          return false;
        }

        if (options.apply && !alreadyApplied && appliedRefs.length >= maxRefImages) {
          void dialog.alert(
            lang({
              ko: `참고 이미지는 최대 ${maxRefImages}장까지 적용할 수 있습니다.`,
              en: `Up to ${maxRefImages} reference images can be applied.`,
            }),
          );
          return false;
        }

        if (existingIndex < 0) {
          setBaseImages((prev) => [...prev, { mimeType: prepared.mimeType, data: prepared.data }]);
          setBaseImagePreviews((prev) => [...prev, prepared.preview]);
          setBaseImageNames((prev) => [...prev, prepared.name]);
          setBaseImageIds((prev) => [...prev, attachedId]);
        }

        if (!options.apply) return existingIndex < 0;
        if (alreadyApplied) return true;

        setAppliedRefs((prev) => {
          if (prev.some((item) => item.origin === "attached" && item.attachedId === attachedId)) return prev;
          return [
            ...prev,
            {
              id: makeRefId("applied_attached"),
              mimeType: prepared.mimeType,
              data: prepared.data,
              preview: prepared.preview,
              name: prepared.name,
              origin: "attached" as const,
              attachedId,
            },
          ];
        });

        return true;
      } catch (error) {
        notifyImageAttachFailure(
          "read_failed",
          file ? createImageFileDiagnostic(file, getImageFileMimeType(file)) : { mimeType: "image/png", size: 0 },
          error,
        );
        return false;
      }
    },
    [appliedRefs, baseImageIds, baseImages, maxRefImages, notifyImageAttachFailure, prepareAttachedImageFile],
  );

  const appendBaseImageFile = useCallback(
    (file: File | null) => appendAttachedImageFile(file),
    [appendAttachedImageFile],
  );

  const appendAndApplyBaseImageFile = useCallback(
    (file: File | null) => appendAttachedImageFile(file, { apply: true }),
    [appendAttachedImageFile],
  );

  const replaceBaseImageAt = useCallback(
    async (index: number, file: File | null, options?: { apply?: boolean }) => {
      const prepared = await prepareAttachedImageFile(file);
      if (!prepared) return false;
      if (index < 0 || index >= baseImages.length) return false;

      const attachedId = baseImageIds[index] || prepared.attachedId;

      setBaseImages((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index ? { mimeType: prepared.mimeType, data: prepared.data } : item,
        ),
      );
      setBaseImagePreviews((prev) => prev.map((item, itemIndex) => (itemIndex === index ? prepared.preview : item)));
      setBaseImageNames((prev) => prev.map((item, itemIndex) => (itemIndex === index ? prepared.name : item)));
      setBaseImageIds((prev) => prev.map((item, itemIndex) => (itemIndex === index ? attachedId : item)));

      if (options?.apply === false) return true;

      setAppliedRefs((prev) => {
        const hasExisting = prev.some((item) => item.origin === "attached" && item.attachedId === attachedId);
        const updated = prev.map((item) =>
          item.origin === "attached" && item.attachedId === attachedId
            ? {
                ...item,
                mimeType: prepared.mimeType,
                data: prepared.data,
                preview: prepared.preview,
                name: prepared.name,
              }
            : item,
        );

        if (hasExisting) return updated;
        if (updated.length >= maxRefImages) return updated;

        return [
          ...updated,
          {
            id: makeRefId("applied_attached"),
            mimeType: prepared.mimeType,
            data: prepared.data,
            preview: prepared.preview,
            name: prepared.name,
            origin: "attached" as const,
            attachedId,
          },
        ];
      });

      return true;
    },
    [baseImageIds, baseImages.length, maxRefImages, prepareAttachedImageFile],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeSettingDialog === "reference") return;
      if (canAttachReference) setIsDragging(true);
    },
    [activeSettingDialog, canAttachReference],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeSettingDialog === "reference") return;
      setIsDragging(false);
    },
    [activeSettingDialog],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (activeSettingDialog === "reference") return;
      if (!canAttachReference) return;

      const files = Array.from(e.dataTransfer.files || []);
      const remain = Math.max(0, maxRefImages - baseImages.length);
      void (async () => {
        for (const file of files.slice(0, remain)) {
          await appendBaseImageFile(file);
        }
      })();
    },
    [activeSettingDialog, canAttachReference, maxRefImages, baseImages.length, appendBaseImageFile],
  );

  const removeBaseImageAt = useCallback(
    (index: number) => {
      const removedId = baseImageIds[index];

      setBaseImages((prev) => prev.filter((_, i) => i !== index));
      setBaseImagePreviews((prev) => prev.filter((_, i) => i !== index));
      setBaseImageNames((prev) => prev.filter((_, i) => i !== index));
      setBaseImageIds((prev) => prev.filter((_, i) => i !== index));

      if (removedId) {
        setAppliedRefs((prev) => prev.filter((item) => !(item.origin === "attached" && item.attachedId === removedId)));
      }
    },
    [baseImageIds],
  );

  const moveBaseImage = useCallback((from: number, to: number) => {
    setBaseImages((prev) => moveItem(prev, from, to));
    setBaseImagePreviews((prev) => moveItem(prev, from, to));
    setBaseImageNames((prev) => moveItem(prev, from, to));
    setBaseImageIds((prev) => moveItem(prev, from, to));
  }, []);

  const toggleSelectedRecentUrl = useCallback((url: string) => {
    const normalized = String(url || "").trim();
    if (!normalized) return;
    setSelectedRecentUrls((prev) =>
      prev.includes(normalized) ? prev.filter((value) => value !== normalized) : [...prev, normalized],
    );
  }, []);

  const applyReferenceSelection = useCallback(
    async (args: { selectedAttachedIndexes: number[]; selectedRecentUrls: string[] }) => {
      if (maxRefImages <= 0) {
        setAppliedRefs([]);
        setSelectedRecentUrls([]);
        return;
      }

      const attachedIndexes = Array.from(
        new Set(
          (args.selectedAttachedIndexes && args.selectedAttachedIndexes.length > 0
            ? args.selectedAttachedIndexes
            : baseImages.map((_, index) => index)) || [],
        ),
      );

      const attachedRefs = attachedIndexes
        .map((index) => {
          if (index < 0 || index >= baseImages.length) return null;
          return {
            id: makeRefId("applied_attached"),
            mimeType: baseImages[index].mimeType,
            data: baseImages[index].data,
            preview: baseImagePreviews[index],
            name: baseImageNames[index] || `attached-${index + 1}`,
            origin: "attached" as const,
            attachedId: baseImageIds[index],
          };
        })
        .filter(Boolean) as AppliedRefItemType[];

      const uniqRecent = Array.from(
        new Set((args.selectedRecentUrls || []).map((value) => String(value || "").trim()).filter(Boolean)),
      );

      const recentRefs: AppliedRefItemType[] = [];
      for (const url of uniqRecent) {
        try {
          const fetched = await fetchImageAsBase64(url);
          recentRefs.push({
            id: makeRefId("applied_recent"),
            mimeType: fetched.mimeType,
            data: fetched.data,
            preview: fetched.preview,
            name: fetched.name,
            origin: "recent",
            recentUrl: url,
          });
        } catch {
          // 개별 recent fetch 실패는 무시하고 진행
        }
      }

      const limitedAttached = attachedRefs.slice(0, maxRefImages);
      const remaining = Math.max(0, maxRefImages - limitedAttached.length);
      const limitedRecent = recentRefs.slice(0, remaining);

      setAppliedRefs([...limitedAttached, ...limitedRecent]);
      setSelectedRecentUrls(limitedRecent.map((item) => String(item.recentUrl || "")).filter(Boolean));
    },
    [baseImages, baseImagePreviews, baseImageNames, baseImageIds, maxRefImages],
  );

  const removeAppliedRefAt = useCallback(
    (index: number) => {
      const target = appliedRefs[index];
      if (!target) return;

      setAppliedRefs((prev) => prev.filter((_, i) => i !== index));

      if (target.origin === "attached" && target.attachedId) {
        const srcIdx = baseImageIds.indexOf(target.attachedId);
        if (srcIdx >= 0) removeBaseImageAt(srcIdx);
      }

      if (target.origin === "recent" && target.recentUrl) {
        setSelectedRecentUrls((prev) => prev.filter((url) => url !== target.recentUrl));
      }
    },
    [appliedRefs, baseImageIds, removeBaseImageAt],
  );

  const removeRecentReferenceByUrl = useCallback((src: string) => {
    setSelectedRecentUrls((prev) => prev.filter((value) => value !== src));
    setAppliedRefs((prev) => prev.filter((value) => !(value.origin === "recent" && value.recentUrl === src)));
  }, []);

  const applyInitialBaseImages = useCallback(
    (items: InitialReferenceImageType[]) => {
      if (maxRefImages <= 0) return;

      const prepared = Array.from(
        new Map(
          (items || [])
            .map((item) => ({
              mimeType: String(item.mimeType || "image/png"),
              data: String(item.data || ""),
              preview: String(item.preview || ""),
              name: String(item.name || "reference.png"),
            }))
            .filter((item) => item.data)
            .map((item) => [item.data, item] as const),
        ).values(),
      ).slice(0, maxRefImages);

      if (!prepared.length) return;

      const ids = prepared.map(() => makeRefId("initial_ref"));
      const previews = prepared.map((item) => item.preview || `data:${item.mimeType};base64,${item.data}`);

      setBaseImages(prepared.map((item) => ({ mimeType: item.mimeType, data: item.data })));
      setBaseImagePreviews(previews);
      setBaseImageNames(prepared.map((item) => item.name));
      setBaseImageIds(ids);
      setAppliedRefs(
        prepared.map((item, index) => ({
          id: makeRefId("applied_initial_ref"),
          mimeType: item.mimeType,
          data: item.data,
          preview: previews[index],
          name: item.name,
          origin: "attached" as const,
          attachedId: ids[index],
        })),
      );
    },
    [maxRefImages],
  );

  const buildReferenceHint = useCallback(
    (items: AppliedRefItemType[], strength: ReferenceStrengthType) => {
      if (!items || items.length === 0) return "";
      const isEcommerce = referenceHintVariant === "ecommerce";
      const baseMessage = isEcommerce ? ECOMMERCE_REFERENCE_IMAGE_PROMPT_MESSAGE : REFERENCE_IMAGE_PROMPT_MESSAGE;
      const detailMessage = getReferenceStrengthPrompt(
        strength,
        "reference",
        isEcommerce ? "ecommerce" : "default",
      );
      return [
        "**참고 이미지:**",
        `- ${baseMessage}`,
        ...(isEcommerce ? [`- ${ECOMMERCE_REFERENCE_IMAGE_CONSTRAINT_MESSAGE}`] : []),
        ...items.map((item, index) => {
          const originLabel = item.origin === "attached" ? "첨부" : "최근";
          const name = item.name ? ` (${item.name})` : "";
          return `- 참고 이미지 #${index + 1} [${originLabel}]${name}: ${detailMessage}`;
        }),
      ].join("\n");
    },
    [referenceHintVariant],
  );

  const mergeExtraWithReferenceHint = useCallback(
    (rawExtra: string, items: AppliedRefItemType[], referenceStrength: ReferenceStrengthType) => {
      const base = stripManagedReferenceHints(rawExtra);
      const hint = items.length > 0 ? buildReferenceHint(items, referenceStrength) : "";
      if (!hint) return base;
      return base ? `${hint}\n\n${base}` : hint;
    },
    [buildReferenceHint],
  );

  return {
    baseImages,
    baseImagePreviews,
    baseImageNames,
    selectedRecentUrls,
    appliedRefs,
    imageAttachFailure,
    isDragging,
    clearImageAttachFailure,
    resetReferenceState,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    appendBaseImageFile,
    appendAndApplyBaseImageFile,
    replaceBaseImageAt,
    removeBaseImageAt,
    moveBaseImage,
    toggleSelectedRecentUrl,
    applyReferenceSelection,
    removeAppliedRefAt,
    mergeExtraWithReferenceHint,
    removeRecentReferenceByUrl,
    applyInitialBaseImages,
    canAttachReference,
  };
}
