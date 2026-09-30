"use client";

import React, { useEffect } from "react";
import { Button, Dialog, DialogHeader, DialogTitle, DialogContent, ActionIconPopover, SearchableSelectBox, dialog } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Trash2,
  Copy,
  Check,
  Maximize,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "utils/common";
import { downloadImageByUrl, type DownloadImageFormatType } from "utils/common/imageDownloadUtils";
import { writeTextToClipboard } from "utils/helper";
import { formatBytes } from "utils/normalize";
import type { PromptVisibilityType, ImagePromptMetaType } from "types/app";
import { listImagePrompts } from "libs/api/lab";
import { resolveGenStudioTemplateLabel, STUDIO_GENERATION_SOURCE_SERVICE_LABELS } from "consts/app";
import { useUserData } from "hooks/auth/useUserData";
import { useAuthStore } from "store/auth";
import { VisibilityIconButton } from "./VisibilityIconButton";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function mergeTemplateOptions(
  primary: Array<{ key: string; title: string }> = [],
  secondary: Array<{ key: string; title: string }> = [],
) {
  const map = new Map<string, { key: string; title: string }>();

  [...primary, ...secondary].forEach((row) => {
    const key = toSafeString(row?.key);
    if (!key || map.has(key)) return;
    map.set(key, { key, title: toSafeString(row?.title) || key });
  });

  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

function formatCreatedAt(value: unknown) {
  if (!value) return "-";
  const input: string | number | Date =
    value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? value : 0;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function getImageNameFromUrl(url: string) {
  const raw = String(url || "").split("?")[0];
  const seg = raw.split("/").pop() || "";
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

const MIN_VIEWER_SCALE = 1;
const MAX_VIEWER_SCALE = 4;
const VIEWER_SCALE_STEP = 0.25;
const VIEWER_WHEEL_ZOOM_SENSITIVITY = 0.0015;
const VIEWER_SWIPE_THRESHOLD = 72;
const VIEWER_DRAG_PREVIEW_RATIO = 0.35;
const VIEWER_SWIPE_MAX_FADE = 0.5;
const VIEWER_SWIPE_SCALE_REDUCTION = 0.06;
const VIEWER_SWIPE_OUT_RATIO = 0.8;
const VIEWER_SWIPE_EXIT_ANIMATION_MS = 280;
const VIEWER_ENTER_ANIMATION_MS = 320;
const VIEWER_ENTER_START_OPACITY = 0.18;
const VIEWER_ENTER_START_SCALE = 0.985;
const VIEWER_ENTER_OFFSET_X = 28;

type ViewerPointerType = {
  x: number;
  y: number;
};

type ViewerGestureState = {
  mode: "idle" | "swipe" | "pan" | "pinch";
  pointerId: number | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  initialDistance: number;
  initialScale: number;
};

type ViewerTransformState = {
  scale: number;
  x: number;
  y: number;
};

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPointerDistance(a: ViewerPointerType, b: ViewerPointerType) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function getPointerMidpoint(a: ViewerPointerType, b: ViewerPointerType) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function resolveViewerIndex(list: string[], src?: string | null, fallbackIndex = 0) {
  if (!list.length) return 0;

  const selectedSrc = toSafeString(src);
  const selectedIndex = selectedSrc ? list.findIndex((item) => item === selectedSrc) : -1;
  if (selectedIndex >= 0) return selectedIndex;

  const requestedIndex = Number(fallbackIndex);
  if (Number.isFinite(requestedIndex)) {
    return clampValue(Math.trunc(requestedIndex), 0, list.length - 1);
  }

  return 0;
}

type FixedImageViewerProps = {
  open: boolean;
  src?: string | null;
  images?: string[];
  initialIndex?: number;
  onOpenChange: (open: boolean) => void;
  alt?: string;
  metaBySrc?: Record<string, ImagePromptMetaType | undefined>;
  enableManageActions?: boolean;
  onVisibilityChange?: (src: string, visibility: PromptVisibilityType) => Promise<void> | void;
  templateOptions?: Array<{ key: string; title: string }>;
  onTemplateKeyChange?: (src: string, templateKey: string) => Promise<void> | void;
  onDelete?: (src: string) => Promise<void> | void;
};

export function FixedImageViewer({
  open,
  src,
  images,
  initialIndex = 0,
  onOpenChange,
  alt,
  metaBySrc,
  enableManageActions = false,
  onVisibilityChange,
  templateOptions,
  onTemplateKeyChange,
  onDelete,
}: FixedImageViewerProps) {
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { isAdministrator } = useUserData();
  const [index, setIndex] = React.useState(initialIndex);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadFormat, setDownloadFormat] = React.useState<DownloadImageFormatType>("webp");
  const [isDownloadPopupOpen, setIsDownloadPopupOpen] = React.useState(false);
  const [managing, setManaging] = React.useState(false);
  const [showMetaInfo, setShowMetaInfo] = React.useState(false);
  const [copiedFieldKey, setCopiedFieldKey] = React.useState("");
  const [templateDraft, setTemplateDraft] = React.useState("");
  const [loadedTemplateOptions, setLoadedTemplateOptions] = React.useState<Array<{ key: string; title: string }>>([]);
  const [templateOptionsLoading, setTemplateOptionsLoading] = React.useState(false);
  const [templateOptionsLoadFailed, setTemplateOptionsLoadFailed] = React.useState(false);
  const [viewerScale, setViewerScale] = React.useState(MIN_VIEWER_SCALE);
  const copiedResetTimerRef = React.useRef<number | null>(null);
  const templateOptionsRequestedRef = React.useRef(false);
  const viewerStageRef = React.useRef<HTMLDivElement | null>(null);
  const viewerFrameRef = React.useRef<HTMLDivElement | null>(null);
  const viewerTransformRef = React.useRef<HTMLDivElement | null>(null);
  const viewerSwipeTimerRef = React.useRef<number | null>(null);
  const viewerEnterTimerRef = React.useRef<number | null>(null);
  const viewerEnterDirectionRef = React.useRef<"prev" | "next" | null>(null);
  const viewerPointersRef = React.useRef(new Map<number, ViewerPointerType>());
  const viewerGestureRef = React.useRef<ViewerGestureState>({
    mode: "idle",
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    initialDistance: 0,
    initialScale: MIN_VIEWER_SCALE,
  });
  const viewerTransformStateRef = React.useRef<ViewerTransformState>({
    scale: MIN_VIEWER_SCALE,
    x: 0,
    y: 0,
  });

  const list = React.useMemo(() => (images && images.length > 0 ? images : src ? [src] : []), [images, src]);
  const currentSrc = list[index] || src || "";
  const currentMeta = metaBySrc?.[currentSrc];
  const canManageCurrent = enableManageActions && Boolean(currentMeta?.canEdit && currentMeta?.assetId);
  const canReclassifyCurrent = Boolean(isAdministrator && currentMeta?.assetId && onTemplateKeyChange);
  const floatingActionClass = "fixed top-3 flex-center bg-black/70 text-white hover:bg-black/80";
  const imageName = React.useMemo(() => getImageNameFromUrl(currentSrc), [currentSrc]);
  const currentTemplateKey = toSafeString(currentMeta?.templateKey);
  const normalizedTemplateDraft = toSafeString(templateDraft);
  const mergedTemplateOptions = React.useMemo(
    () => mergeTemplateOptions(templateOptions, loadedTemplateOptions),
    [templateOptions, loadedTemplateOptions],
  );
  const currentTemplateTitle =
    toSafeString(currentMeta?.templateTitle) ||
    toSafeString(mergedTemplateOptions.find((option) => option.key === currentTemplateKey)?.title);
  // 공통 SearchableSelectBox 아이템 — value=템플릿 키, keywords로 키/제목 동시 검색
  const templateDropdownItems = React.useMemo(() => {
    const items = [
      {
        value: "",
        title: lang({ ko: "미지정 / 커스텀", en: "Unassigned / Custom" }),
        description: lang({ ko: "템플릿 분류 없이 저장합니다.", en: "Save without a template category." }),
        keywords: "unassigned custom 미지정 커스텀",
      },
      ...mergedTemplateOptions.map((option) => ({
        value: option.key,
        title: resolveGenStudioTemplateLabel(option.key, option.title),
        description: option.key,
        keywords: `${option.key} ${option.title}`,
      })),
    ];

    // 목록에 없는 기존 분류 키(커스텀 프롬프트/레거시)도 트리거에 그대로 노출되도록 보강
    if (normalizedTemplateDraft && !items.some((item) => item.value === normalizedTemplateDraft)) {
      items.push({
        value: normalizedTemplateDraft,
        title: resolveGenStudioTemplateLabel(
          normalizedTemplateDraft,
          normalizedTemplateDraft === currentTemplateKey ? currentTemplateTitle : "",
        ),
        description: normalizedTemplateDraft,
        keywords: normalizedTemplateDraft,
      });
    }

    return items;
  }, [mergedTemplateOptions, normalizedTemplateDraft, currentTemplateKey, currentTemplateTitle]);
  const viewerZoomPercent = Math.round(viewerScale * 100);
  const canZoomInViewer = viewerScale < MAX_VIEWER_SCALE - 0.001;
  const canZoomOutViewer = viewerScale > MIN_VIEWER_SCALE + 0.001;

  const clampViewerOffset = React.useCallback((scale: number, x: number, y: number) => {
    const stageRect = viewerStageRef.current?.getBoundingClientRect();
    const frameRect = viewerFrameRef.current?.getBoundingClientRect();

    if (!stageRect || !frameRect) {
      return { x, y };
    }

    const maxOffsetX = Math.max(0, (frameRect.width * scale - stageRect.width) / 2);
    const maxOffsetY = Math.max(0, (frameRect.height * scale - stageRect.height) / 2);

    return {
      x: clampValue(x, -maxOffsetX, maxOffsetX),
      y: clampValue(y, -maxOffsetY, maxOffsetY),
    };
  }, []);

  const applyViewerTransform = React.useCallback(
    (
      scale: number,
      x: number,
      y: number,
      options?: { allowOverflow?: boolean; withTransition?: boolean; transitionPreset?: "default" | "enter" | "exit" },
    ) => {
      const nextScale = clampValue(scale, MIN_VIEWER_SCALE, MAX_VIEWER_SCALE);
      const stageRect = viewerStageRef.current?.getBoundingClientRect();
      const nextOffset =
        options?.allowOverflow || nextScale <= MIN_VIEWER_SCALE
          ? {
              x: options?.allowOverflow ? x : 0,
              y: options?.allowOverflow ? y : 0,
            }
          : clampViewerOffset(nextScale, x, y);

      viewerTransformStateRef.current = {
        scale: nextScale,
        x: nextOffset.x,
        y: nextOffset.y,
      };
      setViewerScale((current) => (Math.abs(current - nextScale) < 0.001 ? current : nextScale));

      if (viewerTransformRef.current) {
        const swipeProgress =
          options?.allowOverflow && nextScale <= MIN_VIEWER_SCALE
            ? clampValue(Math.abs(nextOffset.x) / Math.max((stageRect?.width || 1) * VIEWER_SWIPE_OUT_RATIO, 1), 0, 1)
            : 0;
        const visualScale = nextScale * (1 - swipeProgress * VIEWER_SWIPE_SCALE_REDUCTION);
        const visualOpacity = 1 - swipeProgress * VIEWER_SWIPE_MAX_FADE;
        const transitionPreset = options?.transitionPreset || "default";
        const transitionByPreset =
          transitionPreset === "enter"
            ? `transform ${VIEWER_ENTER_ANIMATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${VIEWER_ENTER_ANIMATION_MS}ms ease-out`
            : transitionPreset === "exit"
              ? `transform ${VIEWER_SWIPE_EXIT_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${VIEWER_SWIPE_EXIT_ANIMATION_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`
              : `transform ${VIEWER_SWIPE_EXIT_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${VIEWER_SWIPE_EXIT_ANIMATION_MS}ms ease-out`;

        viewerTransformRef.current.style.transition = options?.withTransition ? transitionByPreset : "none";
        viewerTransformRef.current.style.opacity = String(visualOpacity);
        viewerTransformRef.current.style.transform = `translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0) scale(${visualScale})`;
      }
    },
    [clampViewerOffset],
  );

  const setViewerScaleAt = React.useCallback(
    (nextScale: number, clientX?: number, clientY?: number, options?: { withTransition?: boolean }) => {
      const current = viewerTransformStateRef.current;
      const clampedScale = clampValue(nextScale, MIN_VIEWER_SCALE, MAX_VIEWER_SCALE);

      if (clampedScale <= MIN_VIEWER_SCALE) {
        applyViewerTransform(MIN_VIEWER_SCALE, 0, 0, options);
        return;
      }

      const stageRect = viewerStageRef.current?.getBoundingClientRect();
      const frameRect = viewerFrameRef.current?.getBoundingClientRect();

      if (!stageRect || !frameRect) {
        applyViewerTransform(clampedScale, current.x, current.y, options);
        return;
      }

      const currentScale = Math.max(current.scale, MIN_VIEWER_SCALE);
      const anchorClientX = clientX ?? stageRect.left + stageRect.width / 2;
      const anchorClientY = clientY ?? stageRect.top + stageRect.height / 2;
      const frameCenterX = frameRect.left + frameRect.width / 2;
      const frameCenterY = frameRect.top + frameRect.height / 2;
      const scaleRatio = clampedScale / currentScale;

      applyViewerTransform(
        clampedScale,
        current.x + (anchorClientX - frameCenterX) * (1 - scaleRatio),
        current.y + (anchorClientY - frameCenterY) * (1 - scaleRatio),
        options,
      );
    },
    [applyViewerTransform],
  );

  const clearViewerSwipeTimer = React.useCallback(() => {
    if (viewerSwipeTimerRef.current != null) {
      window.clearTimeout(viewerSwipeTimerRef.current);
      viewerSwipeTimerRef.current = null;
    }
  }, []);

  const clearViewerEnterTimer = React.useCallback(() => {
    if (viewerEnterTimerRef.current != null) {
      window.clearTimeout(viewerEnterTimerRef.current);
      viewerEnterTimerRef.current = null;
    }
  }, []);

  const resetViewerTransform = React.useCallback(
    (options?: { withTransition?: boolean }) => {
      applyViewerTransform(MIN_VIEWER_SCALE, 0, 0, options);
    },
    [applyViewerTransform],
  );

  const playViewerEnterAnimation = React.useCallback(() => {
    clearViewerEnterTimer();

    const viewerNode = viewerTransformRef.current;
    if (!viewerNode) {
      resetViewerTransform();
      return;
    }

    const enterDirection = viewerEnterDirectionRef.current;
    const startX =
      enterDirection === "next" ? VIEWER_ENTER_OFFSET_X : enterDirection === "prev" ? -VIEWER_ENTER_OFFSET_X : 0;

    viewerEnterDirectionRef.current = null;
    viewerTransformStateRef.current = {
      scale: MIN_VIEWER_SCALE,
      x: 0,
      y: 0,
    };
    viewerNode.style.transition = "none";
    viewerNode.style.opacity = String(VIEWER_ENTER_START_OPACITY);
    viewerNode.style.transform = `translate3d(${startX}px, 0, 0) scale(${VIEWER_ENTER_START_SCALE})`;

    viewerEnterTimerRef.current = window.setTimeout(() => {
      viewerEnterTimerRef.current = null;
      applyViewerTransform(MIN_VIEWER_SCALE, 0, 0, { withTransition: true, transitionPreset: "enter" });
    }, 16);
  }, [applyViewerTransform, clearViewerEnterTimer, resetViewerTransform]);

  const moveToPrevImage = React.useCallback(() => {
    clearViewerSwipeTimer();
    clearViewerEnterTimer();
    viewerEnterDirectionRef.current = "prev";
    resetViewerTransform();
    setIndex((v) => (v - 1 + list.length) % list.length);
  }, [clearViewerEnterTimer, clearViewerSwipeTimer, list.length, resetViewerTransform]);

  const moveToNextImage = React.useCallback(() => {
    clearViewerSwipeTimer();
    clearViewerEnterTimer();
    viewerEnterDirectionRef.current = "next";
    resetViewerTransform();
    setIndex((v) => (v + 1) % list.length);
  }, [clearViewerEnterTimer, clearViewerSwipeTimer, list.length, resetViewerTransform]);

  const animateSwipeToImage = React.useCallback(
    (direction: "prev" | "next") => {
      clearViewerSwipeTimer();
      clearViewerEnterTimer();
      viewerEnterDirectionRef.current = direction;

      const stageWidth = viewerStageRef.current?.getBoundingClientRect().width || window.innerWidth * 0.92;
      const directionSign = direction === "next" ? -1 : 1;

      applyViewerTransform(MIN_VIEWER_SCALE, directionSign * stageWidth * VIEWER_SWIPE_OUT_RATIO, 0, {
        allowOverflow: true,
        withTransition: true,
        transitionPreset: "exit",
      });

      viewerSwipeTimerRef.current = window.setTimeout(() => {
        viewerSwipeTimerRef.current = null;
        setIndex((currentIndex) =>
          direction === "next" ? (currentIndex + 1) % list.length : (currentIndex - 1 + list.length) % list.length,
        );
      }, VIEWER_SWIPE_EXIT_ANIMATION_MS);
    },
    [applyViewerTransform, clearViewerEnterTimer, clearViewerSwipeTimer, list.length],
  );

  const handleDownload = React.useCallback(async () => {
    if (!isLoggedIn || !currentSrc || downloading) return;

    setDownloading(true);
    try {
      const downloaded = await downloadImageByUrl(currentSrc, index, {
        format: downloadFormat,
        assetId: currentMeta?.assetId,
      });
      if (downloaded) {
        setIsDownloadPopupOpen(false);
      } else {
        await dialog.alert({
          variant: "danger",
          message: lang({ ko: "이미지를 다운로드하지 못했습니다.", en: "The image could not be downloaded." }),
        });
      }
    } finally {
      setDownloading(false);
    }
  }, [currentSrc, currentMeta?.assetId, index, downloading, downloadFormat, isLoggedIn]);

  const handleChangeVisibility = React.useCallback(
    async (next: PromptVisibilityType) => {
      if (!currentSrc || !onVisibilityChange || !currentMeta?.assetId || managing) return;
      setManaging(true);
      try {
        await onVisibilityChange(currentSrc, next);
      } finally {
        setManaging(false);
      }
    },
    [currentSrc, currentMeta, onVisibilityChange, managing],
  );

  const handleCopyMetaField = React.useCallback(async (fieldKey: string, value: string) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await writeTextToClipboard(text);
      setCopiedFieldKey(fieldKey);
      if (copiedResetTimerRef.current != null) window.clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = window.setTimeout(() => {
        setCopiedFieldKey("");
        copiedResetTimerRef.current = null;
      }, 1200);
    } catch {
      void dialog.alert({ variant: "danger", message: lang({ ko: "복사에 실패했습니다.", en: "Copy failed." }) });
    }
  }, []);

  const handleDelete = React.useCallback(async () => {
    if (!currentSrc || !onDelete || !currentMeta?.assetId || managing) return;
    const ok = await dialog.confirm({
      variant: "danger",
      message: lang({ ko: "이 이미지를 삭제할까요?", en: "Delete this image?" }),
    });
    if (!ok) return;
    setManaging(true);
    try {
      await onDelete(currentSrc);
      onOpenChange(false);
    } catch {
      void dialog.alert({
        variant: "danger",
        message: lang({
          ko: "이미지 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          en: "Failed to delete the image. Please try again.",
        }),
      });
    } finally {
      setManaging(false);
    }
  }, [currentSrc, currentMeta, onDelete, onOpenChange, managing]);

  const handleSaveTemplateKey = React.useCallback(async () => {
    if (!currentSrc || !currentMeta?.assetId || !onTemplateKeyChange || managing) return;
    setManaging(true);
    try {
      await onTemplateKeyChange(currentSrc, normalizedTemplateDraft);
    } finally {
      setManaging(false);
    }
  }, [currentSrc, currentMeta, onTemplateKeyChange, normalizedTemplateDraft, managing]);

  const handleSelectTemplateOption = React.useCallback((nextTemplateKey: string) => {
    setTemplateDraft(nextTemplateKey);
  }, []);

  React.useLayoutEffect(
    function resetViewerOnOpen() {
      if (!open) return;
      // 모달 open(외부 트리거) 시 뷰어 인덱스/제스처 상태를 sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex(resolveViewerIndex(list, src, initialIndex));
      setShowMetaInfo(false);
      setIsDownloadPopupOpen(false);
      setCopiedFieldKey("");
      viewerPointersRef.current.clear();
      clearViewerSwipeTimer();
      clearViewerEnterTimer();
      viewerGestureRef.current = {
        mode: "idle",
        pointerId: null,
        startX: 0,
        startY: 0,
        originX: 0,
        originY: 0,
        initialDistance: 0,
        initialScale: MIN_VIEWER_SCALE,
      };
      resetViewerTransform();
    },
    [clearViewerEnterTimer, clearViewerSwipeTimer, open, list, src, initialIndex, resetViewerTransform],
  );

  useEffect(
    function resetTemplateOptionsRequest() {
      if (open) return;
      templateOptionsRequestedRef.current = false;
      // 모달 close 시 외부 fetch 상태 리셋
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTemplateOptionsLoadFailed(false);
    },
    [open],
  );

  useEffect(
    function syncTemplateDraftWithCurrent() {
      // 현재 이미지 변경(외부 데이터) 시 편집 폼 sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTemplateDraft(currentTemplateKey);
    },
    [currentSrc, currentTemplateKey],
  );

  useEffect(() => {
    if (!open) return;
    playViewerEnterAnimation();
  }, [open, currentSrc, playViewerEnterAnimation]);

  useEffect(() => {
    return () => {
      clearViewerSwipeTimer();
      clearViewerEnterTimer();
      if (copiedResetTimerRef.current != null) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, [clearViewerEnterTimer, clearViewerSwipeTimer]);

  useEffect(() => {
    if (
      !showMetaInfo ||
      !canReclassifyCurrent ||
      mergedTemplateOptions.length > 0 ||
      templateOptionsRequestedRef.current
    )
      return;

    templateOptionsRequestedRef.current = true;
    setTemplateOptionsLoading(true);
    setTemplateOptionsLoadFailed(false);

    listImagePrompts({ enabled: true, view: isAdministrator ? "admin" : "public" })
      .then((rows) => {
        const nextOptions = Array.isArray(rows)
          ? rows.map((row) => ({
              key: toSafeString(row?.key),
              title: toSafeString(row?.title) || toSafeString(row?.key),
            }))
          : [];
        setLoadedTemplateOptions(nextOptions);
      })
      .catch(() => {
        setTemplateOptionsLoadFailed(true);
      })
      .finally(() => {
        setTemplateOptionsLoading(false);
      });
  }, [showMetaInfo, canReclassifyCurrent, mergedTemplateOptions.length, isAdministrator]);

  useEffect(() => {
    if (!open) return;

    const handleResize = () => {
      const { scale, x, y } = viewerTransformStateRef.current;
      applyViewerTransform(scale, x, y);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [open, applyViewerTransform]);

  const handleViewerPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const stage = viewerStageRef.current;
      if (!stage) return;

      clearViewerEnterTimer();
      if (viewerTransformRef.current) {
        viewerTransformRef.current.style.transition = "none";
      }
      stage.setPointerCapture(event.pointerId);
      viewerPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (viewerPointersRef.current.size === 2) {
        const [first, second] = Array.from(viewerPointersRef.current.values());
        viewerGestureRef.current = {
          mode: "pinch",
          pointerId: null,
          startX: 0,
          startY: 0,
          originX: viewerTransformStateRef.current.x,
          originY: viewerTransformStateRef.current.y,
          initialDistance: getPointerDistance(first, second),
          initialScale: viewerTransformStateRef.current.scale,
        };
        return;
      }

      const currentScale = viewerTransformStateRef.current.scale;

      viewerGestureRef.current = {
        mode: currentScale > MIN_VIEWER_SCALE ? "pan" : "swipe",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewerTransformStateRef.current.x,
        originY: viewerTransformStateRef.current.y,
        initialDistance: 0,
        initialScale: currentScale,
      };
    },
    [clearViewerEnterTimer],
  );

  const handleViewerPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!viewerPointersRef.current.has(event.pointerId)) return;

      viewerPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const gesture = viewerGestureRef.current;

      if (viewerPointersRef.current.size === 2) {
        event.preventDefault();

        const [first, second] = Array.from(viewerPointersRef.current.values());
        const nextDistance = getPointerDistance(first, second);
        const midpoint = getPointerMidpoint(first, second);

        if (!gesture.initialDistance) {
          viewerGestureRef.current = {
            ...gesture,
            mode: "pinch",
            initialDistance: nextDistance,
            initialScale: viewerTransformStateRef.current.scale,
          };
          return;
        }

        const nextScale = gesture.initialScale * (nextDistance / gesture.initialDistance);
        setViewerScaleAt(nextScale, midpoint.x, midpoint.y);
        return;
      }

      if (gesture.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;

      if (gesture.mode === "pan") {
        event.preventDefault();
        applyViewerTransform(viewerTransformStateRef.current.scale, gesture.originX + deltaX, gesture.originY + deltaY);
        return;
      }

      if (gesture.mode === "swipe" && list.length > 1) {
        event.preventDefault();
        applyViewerTransform(MIN_VIEWER_SCALE, deltaX * VIEWER_DRAG_PREVIEW_RATIO, 0, {
          allowOverflow: true,
        });
      }
    },
    [applyViewerTransform, list.length, setViewerScaleAt],
  );

  const handleViewerPointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const stage = viewerStageRef.current;
      if (stage?.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }

      const gesture = viewerGestureRef.current;
      const pointer = viewerPointersRef.current.get(event.pointerId);
      viewerPointersRef.current.delete(event.pointerId);

      if (viewerPointersRef.current.size >= 1 && gesture.mode === "pinch") {
        const [{ x, y }] = Array.from(viewerPointersRef.current.values());
        viewerGestureRef.current = {
          mode: viewerTransformStateRef.current.scale > MIN_VIEWER_SCALE ? "pan" : "swipe",
          pointerId: Array.from(viewerPointersRef.current.keys())[0] ?? null,
          startX: x,
          startY: y,
          originX: viewerTransformStateRef.current.x,
          originY: viewerTransformStateRef.current.y,
          initialDistance: 0,
          initialScale: viewerTransformStateRef.current.scale,
        };
        return;
      }

      if (gesture.mode === "swipe" && gesture.pointerId === event.pointerId && pointer) {
        const deltaX = pointer.x - gesture.startX;
        if (Math.abs(deltaX) >= VIEWER_SWIPE_THRESHOLD && list.length > 1) {
          if (deltaX < 0) {
            animateSwipeToImage("next");
          } else {
            animateSwipeToImage("prev");
          }
        } else {
          resetViewerTransform({ withTransition: true });
        }
      } else {
        const { scale, x, y } = viewerTransformStateRef.current;
        applyViewerTransform(scale, x, y, { withTransition: true });
      }

      viewerGestureRef.current = {
        mode: "idle",
        pointerId: null,
        startX: 0,
        startY: 0,
        originX: viewerTransformStateRef.current.x,
        originY: viewerTransformStateRef.current.y,
        initialDistance: 0,
        initialScale: viewerTransformStateRef.current.scale,
      };
    },
    [animateSwipeToImage, applyViewerTransform, list.length, resetViewerTransform],
  );

  const handleViewerWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      clearViewerEnterTimer();

      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * VIEWER_WHEEL_ZOOM_SENSITIVITY);
      setViewerScaleAt(viewerTransformStateRef.current.scale * factor, event.clientX, event.clientY);
    },
    [clearViewerEnterTimer, setViewerScaleAt],
  );

  const zoomViewerIn = React.useCallback(() => {
    clearViewerEnterTimer();
    setViewerScaleAt(viewerTransformStateRef.current.scale + VIEWER_SCALE_STEP, undefined, undefined, {
      withTransition: true,
    });
  }, [clearViewerEnterTimer, setViewerScaleAt]);

  const zoomViewerOut = React.useCallback(() => {
    clearViewerEnterTimer();
    setViewerScaleAt(viewerTransformStateRef.current.scale - VIEWER_SCALE_STEP, undefined, undefined, {
      withTransition: true,
    });
  }, [clearViewerEnterTimer, setViewerScaleAt]);

  const resetViewerScale = React.useCallback(() => {
    clearViewerEnterTimer();
    resetViewerTransform({ withTransition: true });
  }, [clearViewerEnterTimer, resetViewerTransform]);

  const currentVisibility: PromptVisibilityType = currentMeta?.visibility === "public" ? "public" : "private";
  if (!list.length || !src) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle className="sr-only">이미지 미리보기</DialogTitle>
      </DialogHeader>
      <DialogContent centered={false} className="z-[90]" innerWrapClassName="bg-black/90 p-4" hideClose hideOverlay>
        <div className="relative flex h-full w-full items-center justify-center" onClick={() => onOpenChange(false)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <div
              ref={viewerStageRef}
              className="relative flex max-w-[92vw] max-h-[84vh] items-center justify-center overflow-hidden rounded-lg touch-none select-none"
              onPointerDown={handleViewerPointerDown}
              onPointerMove={handleViewerPointerMove}
              onPointerUp={handleViewerPointerEnd}
              onPointerCancel={handleViewerPointerEnd}
              onWheel={handleViewerWheel}
              onDragStart={(event) => event.preventDefault()}
            >
              <div ref={viewerTransformRef} className="will-change-transform">
                <div ref={viewerFrameRef}>
                  <ImageBox
                    src={currentSrc}
                    alt={alt || "generated"}
                    width="92vw"
                    height="84vh"
                    objectFit="object-contain"
                    className="pointer-events-none rounded-lg bg-black/20"
                  />
                </div>
              </div>
            </div>

            {isLoggedIn && (
              <ActionIconPopover
                triggerIcon={<Download className="icon-xs" />}
                triggerAriaLabel={lang({ ko: "다운로드 옵션 열기", en: "Open download options" })}
                triggerClassName={cn(floatingActionClass, "left-3", "disabled:opacity-60")}
                contentClassName="w-[13rem] rounded-xl border-none bg-black/90 p-3 text-white"
                disabled={downloading || !currentSrc}
                open={isDownloadPopupOpen}
                onOpenChange={setIsDownloadPopupOpen}
              >
                <p className="text-xs text-white/80">
                  <Lang text={{ ko: "다운로드 형식", en: "Download format" }} />
                </p>
                <div className="mt-2 grid grid-cols-2">
                  <Button
                    variant={downloadFormat === "webp" ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => setDownloadFormat("webp")}
                    className="!rounded-r-none"
                  >
                    WEBP
                  </Button>
                  <Button
                    variant={downloadFormat === "jpg" ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => setDownloadFormat("jpg")}
                    className="!rounded-l-none"
                  >
                    JPG
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  className="mt-2 w-full"
                  size="xs"
                  onClick={handleDownload}
                  disabled={downloading || !currentSrc}
                >
                  <Lang text={{ ko: "다운로드", en: "Download" }} />
                </Button>
              </ActionIconPopover>
            )}

            <Button
              variant="blank"
              rounded="full"
              size="icon-sm"
              onClick={() => setShowMetaInfo((prev) => !prev)}
              aria-label={lang({ ko: "이미지 정보 토글", en: "Toggle image info" })}
              className={cn(floatingActionClass, isLoggedIn ? "left-14" : "left-3", showMetaInfo && "bg-primary/70")}
            >
              <Info className="icon-xs" />
              <span className="sr-only">
                <Lang text={{ ko: "이미지 정보", en: "Image info" }} />
              </span>
            </Button>

            {canManageCurrent && (
              <VisibilityIconButton
                size="icon-sm"
                visibility={currentVisibility}
                disabled={managing}
                onToggle={handleChangeVisibility}
                className={cn(floatingActionClass, "left-25", managing && "opacity-60")}
              />
            )}

            {canManageCurrent && (
              <Button
                variant="blank"
                rounded="full"
                size="icon-sm"
                onClick={handleDelete}
                aria-label={lang({ ko: "이미지 삭제", en: "Delete image" })}
                disabled={managing || !currentMeta?.assetId}
                className={cn(floatingActionClass, "right-14", "bg-danger/60 hover:bg-danger")}
              >
                <Trash2 className="icon-xs" />
              </Button>
            )}

            {list.length > 1 && (
              <>
                <Button
                  variant="blank"
                  size="icon-sm"
                  onClick={moveToPrevImage}
                  className={cn(floatingActionClass, "left-2 top-1/2 -translate-y-1/2 z-10")}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">
                    <Lang text={{ ko: "이전", en: "Previous" }} />
                  </span>
                </Button>
                <Button
                  variant="blank"
                  size="icon-sm"
                  onClick={moveToNextImage}
                  className={cn(floatingActionClass, "right-2 top-1/2 -translate-y-1/2 z-10")}
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">
                    <Lang text={{ ko: "다음", en: "Next" }} />
                  </span>
                </Button>
              </>
            )}

            <div className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/90 p-1 text-primary-text shadow-xl backdrop-blur-md">
              <Button
                variant="ghost"
                size="icon-md"
                rounded="full"
                disabled={!canZoomOutViewer}
                aria-label={lang({ ko: "이미지 축소", en: "Zoom out image" })}
                onClick={zoomViewerOut}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                rounded="full"
                className="min-w-16 gap-1 px-2 text-xs tabular-nums"
                aria-label={lang({ ko: "화면에 맞춤", en: "Fit to viewport" })}
                onClick={resetViewerScale}
              >
                <Maximize className="h-3.5 w-3.5" />
                {viewerZoomPercent}%
              </Button>
              <Button
                variant="ghost"
                size="icon-md"
                rounded="full"
                disabled={!canZoomInViewer}
                aria-label={lang({ ko: "이미지 확대", en: "Zoom in image" })}
                onClick={zoomViewerIn}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="blank"
              rounded="full"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              className={cn(floatingActionClass, "right-3")}
            >
              <X className="icon-xs" />
              <span className="sr-only">
                <Lang text={{ ko: "닫기", en: "Close" }} />
              </span>
            </Button>

            {showMetaInfo && (
              <div
                className={cn(
                  "fixed top-14 left-3 right-3 z-30 w-[min(92vw,38rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto",
                  "rounded-xl border border-white/15 bg-black/70 p-3 text-xxs text-white backdrop-blur-sm",
                )}
              >
                <div className="grid gap-1.5">
                  {[
                    { key: "name", label: <Lang text={{ ko: "이름", en: "Name" }} />, value: imageName || "-" },
                    { key: "asset", label: "assetId", value: currentMeta?.assetId || "-" },
                    {
                      key: "source",
                      label: <Lang text={{ ko: "생성 서비스", en: "Source" }} />,
                      value: lang(STUDIO_GENERATION_SOURCE_SERVICE_LABELS[currentMeta?.sourceService || "unknown"]),
                    },
                    {
                      key: "surface",
                      label: <Lang text={{ ko: "생성 화면", en: "Surface" }} />,
                      value: currentMeta?.sourceSurface || "-",
                    },
                    {
                      key: "model",
                      label: <Lang text={{ ko: "모델", en: "Model" }} />,
                      value:
                        currentMeta?.provider || currentMeta?.modelName
                          ? `${currentMeta?.provider || "-"} / ${currentMeta?.modelName || "-"}`
                          : "-",
                    },
                    {
                      key: "created",
                      label: <Lang text={{ ko: "생성일", en: "Created" }} />,
                      value: formatCreatedAt(currentMeta?.createdAt),
                    },
                    {
                      key: "size",
                      label: <Lang text={{ ko: "용량", en: "Size" }} />,
                      value: currentMeta?.storage?.bytes ? formatBytes(currentMeta.storage.bytes) : "-",
                    },
                    {
                      key: "visibility",
                      label: <Lang text={{ ko: "공유 범위", en: "Visibility" }} />,
                      value:
                        currentMeta?.visibility === "public"
                          ? lang({ ko: "공개", en: "Public" })
                          : lang({ ko: "비공개", en: "Private" }),
                    },
                    {
                      key: "public-url",
                      label: <Lang text={{ ko: "공개 URL", en: "Public URL" }} />,
                      value:
                        currentMeta?.visibility === "public" && currentMeta?.urlKind === "public"
                          ? currentSrc || "-"
                          : "-",
                    },
                    {
                      key: "template",
                      label: <Lang text={{ ko: "템플릿", en: "Template" }} />,
                      value: resolveGenStudioTemplateLabel(currentTemplateKey, currentTemplateTitle) || "-",
                    },
                  ].map((row) =>
                    row.value !== "-" ? (
                      <div key={row.key} className="grid grid-cols-[4.5rem_1fr_auto] gap-2 items-center">
                        <span className="text-white/70">{row.label}</span>
                        <span className="break-all">{row.value}</span>
                        <Button
                          variant="blank"
                          rounded="full"
                          size="icon-xs"
                          onClick={() => void handleCopyMetaField(row.key, row.value)}
                          aria-label={
                            copiedFieldKey === row.key
                              ? lang({ ko: "복사됨", en: "Copied" })
                              : lang({ ko: "메타데이터 복사", en: "Copy metadata" })
                          }
                          className="text-white/80 hover:text-white"
                        >
                          {copiedFieldKey === row.key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    ) : null,
                  )}
                </div>

                {canReclassifyCurrent && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between gap-1">
                      <p className="flex items-center gap-2 text-white/70">
                        <Lang text={{ ko: "템플릿 카테고리 변경", en: "Change template category" }} />
                        {templateOptionsLoading && <span className="text-xxs text-white/60">loading...</span>}
                      </p>
                      <Button
                        size="xs"
                        onClick={handleSaveTemplateKey}
                        disabled={managing || normalizedTemplateDraft === currentTemplateKey}
                      >
                        <Lang text={{ ko: "저장", en: "Save" }} />
                      </Button>
                    </div>

                    <div className="mt-2 space-y-2">
                      <SearchableSelectBox
                        items={templateDropdownItems}
                        value={normalizedTemplateDraft}
                        onChange={handleSelectTemplateOption}
                        disabled={managing || templateOptionsLoading}
                        allowCustomValue
                        placeholder={lang({
                          ko: "템플릿 카테고리를 선택해주세요",
                          en: "Select a template category",
                        })}
                        placeholderDescription={lang({
                          ko: "박스를 열고 제목 또는 템플릿 키로 검색하거나 직접 입력할 수 있습니다.",
                          en: "Open the box to search by title or key, or type a template key directly.",
                        })}
                        searchPlaceholder={lang({
                          ko: "템플릿 키 검색 또는 직접 입력",
                          en: "Search template key or type directly",
                        })}
                        customValueLabel={lang({
                          ko: "입력한 템플릿 키 그대로 사용",
                          en: "Use the typed template key as-is",
                        })}
                        customValueDescription={lang({
                          ko: "목록에 없는 직접 입력 템플릿 키입니다.",
                          en: "A manually entered template key that is not in the list.",
                        })}
                        emptyMessage={lang({
                          ko: "일치하는 템플릿이 없습니다.",
                          en: "There are no matching templates.",
                        })}
                      />

                      <p className="text-xxs text-white/60">
                        <Lang
                          text={{
                            ko: "드롭다운에서 고르거나 검색창에 직접 입력한 뒤 저장하면 현재 이미지의 템플릿 분류가 변경됩니다.",
                            en: "Choose from the dropdown or type in the search field, then save to update this image category.",
                          }}
                        />
                      </p>

                      {templateOptionsLoadFailed && (
                        <p className="text-xxs text-danger">
                          <Lang
                            text={{
                              ko: "템플릿 목록 로드에 실패했습니다. 직접 입력으로는 계속 수정할 수 있습니다.",
                              en: "Failed to load templates. Direct input is still available.",
                            }}
                          />
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {currentMeta?.extraPrompt ? (
                  <div className="mt-2 rounded-lg border border-white/10 bg-black/35 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/70">
                        <Lang text={{ ko: "이미지 설명", en: "Image Description" }} />
                      </p>
                      <Button
                        variant="blank"
                        rounded="full"
                        size="icon-xs"
                        onClick={() => void handleCopyMetaField("prompt", currentMeta.extraPrompt || "-")}
                        className="text-white/80 hover:text-white"
                      >
                        {copiedFieldKey === "prompt" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-white/90">{currentMeta.extraPrompt}</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
