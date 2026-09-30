import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { listStudioImageMetas } from "libs/api/lab/imagePrompts";
import { toast } from "sonner";
import type { ImagePromptMetaType } from "types/app";
import { getMarketingOperatorErrorMessage, getTemplateLabel, toSafeString } from "./MarketingOpsUtils";
import type { MarketingTemplateOption, MarketingUploadedImageAsset } from "./MarketingOpsTypes";
import type { MarketingUploadResponse, MarketingUploadedImageListResponse } from "./MarketingReviewDomain";

const IMAGE_ATTACH_STUDIO_LIST_LIMIT = 24;

export type MarketingImageAttachTarget = {
  channel?: string;
};

function getImagePromptMetaKey(item: ImagePromptMetaType) {
  return toSafeString(item.assetId) || toSafeString(item.url);
}

function getImagePromptMetaCreatedAtMs(item: ImagePromptMetaType) {
  const time = new Date(item.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeImageAttachStudioRows(args: {
  ownedRows: ImagePromptMetaType[];
  publicRows: ImagePromptMetaType[];
  limit: number;
}) {
  const byKey = new Map<string, ImagePromptMetaType>();
  [...args.publicRows, ...args.ownedRows].forEach((item) => {
    const key = getImagePromptMetaKey(item);
    if (!key || !toSafeString(item.url)) return;

    const prev = byKey.get(key);
    byKey.set(key, {
      ...prev,
      ...item,
      canEdit: Boolean(prev?.canEdit || item.canEdit),
      isOwner: Boolean(prev?.isOwner || item.isOwner),
    });
  });
  return Array.from(byKey.values())
    .sort((a, b) => {
      const createdDiff = getImagePromptMetaCreatedAtMs(b) - getImagePromptMetaCreatedAtMs(a);
      if (createdDiff !== 0) return createdDiff;
      return Number(a.outputIndex || 0) - Number(b.outputIndex || 0);
    })
    .slice(0, args.limit);
}

export function useMarketingImageAttachment(imageTemplateOptions: MarketingTemplateOption[], universeId: string) {
  const [target, setTarget] = useState<MarketingImageAttachTarget | null>(null);
  const [urls, setUrls] = useState("");
  const [alt, setAlt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [studioTemplateKey, setStudioTemplateKey] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearchDraft, setTemplateSearchDraft] = useState("");
  const [templateSearchDirty, setTemplateSearchDirty] = useState(false);
  const [studioImages, setStudioImages] = useState<ImagePromptMetaType[]>([]);
  const [selectedStudioImageIds, setSelectedStudioImageIds] = useState<string[]>([]);
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioLoaded, setStudioLoaded] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<MarketingUploadedImageAsset[]>([]);
  const [selectedUploadedImageIds, setSelectedUploadedImageIds] = useState<string[]>([]);
  const [uploadedImagesLoading, setUploadedImagesLoading] = useState(false);
  const [uploadedImagesLoaded, setUploadedImagesLoaded] = useState(false);
  const [uploadedImagesNextCursor, setUploadedImagesNextCursor] = useState("");
  const [uploadedImageRetentionBusyId, setUploadedImageRetentionBusyId] = useState("");
  const [uploadedImageDeleteBusyId, setUploadedImageDeleteBusyId] = useState("");
  const templatePickerRef = useRef<HTMLDivElement | null>(null);
  const uploadedImagesRequestIdRef = useRef(0);

  const selectedTemplate = imageTemplateOptions.find(
    (item) => toSafeString(item.key) === toSafeString(studioTemplateKey),
  );
  const selectedTemplateLabel = studioTemplateKey
    ? getTemplateLabel(selectedTemplate || { key: studioTemplateKey })
    : lang({ ko: "전체 템플릿 최신 이미지", en: "Latest images from all templates" });
  const normalizedTemplateSearchDraft = toSafeString(templateSearchDraft).toLowerCase();
  const templateInputValue = templateSearchDirty ? templateSearchDraft : selectedTemplateLabel;
  const filteredTemplateOptions = useMemo(() => {
    if (!templateSearchDirty || !normalizedTemplateSearchDraft) return imageTemplateOptions;
    return imageTemplateOptions.filter((item) => {
      const key = toSafeString(item.key).toLowerCase();
      const title = toSafeString(item.title).toLowerCase();
      const label = getTemplateLabel(item).toLowerCase();
      return (
        key.includes(normalizedTemplateSearchDraft) ||
        title.includes(normalizedTemplateSearchDraft) ||
        label.includes(normalizedTemplateSearchDraft)
      );
    });
  }, [imageTemplateOptions, normalizedTemplateSearchDraft, templateSearchDirty]);

  const reset = () => {
    uploadedImagesRequestIdRef.current += 1;
    setUrls("");
    setAlt("");
    setFiles([]);
    setStudioTemplateKey("");
    setTemplatePickerOpen(false);
    setTemplateSearchDraft("");
    setTemplateSearchDirty(false);
    setStudioImages([]);
    setSelectedStudioImageIds([]);
    setStudioLoaded(false);
    setUploadedImages([]);
    setSelectedUploadedImageIds([]);
    setUploadedImagesLoading(false);
    setUploadedImagesLoaded(false);
    setUploadedImagesNextCursor("");
    setUploadedImageRetentionBusyId("");
    setUploadedImageDeleteBusyId("");
  };

  const open = (nextTarget: MarketingImageAttachTarget, initialTemplateKey = "") => {
    reset();
    setStudioTemplateKey(toSafeString(initialTemplateKey));
    setTarget(nextTarget);
    void loadUploadedImages();
  };

  const close = () => {
    setTarget(null);
    reset();
  };

  const selectStudioTemplate = (nextTemplateKey: string) => {
    setStudioTemplateKey(toSafeString(nextTemplateKey));
    setTemplatePickerOpen(false);
    setTemplateSearchDraft("");
    setTemplateSearchDirty(false);
  };

  const loadStudioImages = async () => {
    try {
      setStudioLoading(true);
      setStudioLoaded(false);
      const templateKey = toSafeString(studioTemplateKey);
      const [ownedRows, publicRows] = await Promise.all([
        listStudioImageMetas({ scope: "user", templateKey, limit: IMAGE_ATTACH_STUDIO_LIST_LIMIT }),
        listStudioImageMetas({
          scope: "all",
          visibility: "public",
          templateKey,
          limit: IMAGE_ATTACH_STUDIO_LIST_LIMIT,
        }),
      ]);
      setStudioImages(
        mergeImageAttachStudioRows({ ownedRows, publicRows, limit: IMAGE_ATTACH_STUDIO_LIST_LIMIT }),
      );
      setSelectedStudioImageIds([]);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "Gen Studio 이미지 목록을 불러오지 못했습니다.", en: "Failed to load Gen Studio images." }),
        ),
      );
    } finally {
      setStudioLoading(false);
      setStudioLoaded(true);
    }
  };

  const loadUploadedImages = useCallback(
    async ({ cursor = "", append = false }: { cursor?: string; append?: boolean } = {}) => {
      const targetUniverseId = toSafeString(universeId);
      if (!targetUniverseId) return;

      const requestId = ++uploadedImagesRequestIdRef.current;
      try {
        setUploadedImagesLoading(true);
        const response = await fetchClient.get<MarketingUploadedImageListResponse>("/marketing/content-images", {
          params: {
            universeId: targetUniverseId,
            limit: 24,
            ...(cursor ? { cursor } : {}),
          },
        });
        if (requestId !== uploadedImagesRequestIdRef.current) return;

        const rows = response.data?.data?.items || [];
        setUploadedImages((prev) => {
          const byId = new Map<string, MarketingUploadedImageAsset>();
          (append ? [...prev, ...rows] : rows).forEach((item) => {
            const assetId = toSafeString(item.assetId);
            const url = toSafeString(item.url);
            if (assetId && url) byId.set(assetId, item);
          });
          return Array.from(byId.values());
        });
        setUploadedImagesNextCursor(toSafeString(response.data?.data?.nextCursor));
      } catch (error) {
        if (requestId !== uploadedImagesRequestIdRef.current) return;
        toast.error(
          getMarketingOperatorErrorMessage(
            error,
            lang({ ko: "기존 업로드 이미지 목록을 불러오지 못했습니다.", en: "Failed to load uploaded images." }),
          ),
        );
      } finally {
        if (requestId === uploadedImagesRequestIdRef.current) {
          setUploadedImagesLoading(false);
          setUploadedImagesLoaded(true);
        }
      }
    },
    [universeId],
  );

  const updateUploadedImageRetention = async (assetId: string, retained: boolean) => {
    const targetUniverseId = toSafeString(universeId);
    const safeAssetId = toSafeString(assetId);
    if (!targetUniverseId || !safeAssetId) return;

    try {
      setUploadedImageRetentionBusyId(safeAssetId);
      const response = await fetchClient.patch<MarketingUploadResponse>(
        `/marketing/content-images/${encodeURIComponent(safeAssetId)}`,
        { universeId: targetUniverseId, retained },
      );
      const updated = response.data?.data?.asset;
      if (!updated?.assetId) throw new Error("marketing_image_retention_update_failed");
      setUploadedImages((prev) => prev.map((item) => (item.assetId === safeAssetId ? { ...item, ...updated } : item)));
      toast.success(
        retained
          ? lang({ ko: "이미지를 장기 보관으로 설정했습니다.", en: "Image set to long-term retention." })
          : lang({ ko: "장기 보관을 해제했습니다.", en: "Long-term retention disabled." }),
      );
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "이미지 보관 설정을 변경하지 못했습니다.", en: "Failed to update image retention." }),
        ),
      );
    } finally {
      setUploadedImageRetentionBusyId("");
    }
  };

  const deleteUploadedImage = async (assetId: string) => {
    const targetUniverseId = toSafeString(universeId);
    const safeAssetId = toSafeString(assetId);
    if (!targetUniverseId || !safeAssetId) return;

    try {
      setUploadedImageDeleteBusyId(safeAssetId);
      await fetchClient.delete(`/marketing/content-images/${encodeURIComponent(safeAssetId)}`, {
        params: { universeId: targetUniverseId },
      });
      uploadedImagesRequestIdRef.current += 1;
      setUploadedImagesLoading(false);
      setUploadedImages((prev) => prev.filter((item) => item.assetId !== safeAssetId));
      setSelectedUploadedImageIds((prev) => prev.filter((id) => id !== safeAssetId));
      toast.success(lang({ ko: "이미지를 영구 삭제했습니다.", en: "Image permanently deleted." }));
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "이미지를 삭제하지 못했습니다.", en: "Failed to delete the image." }),
        ),
      );
    } finally {
      setUploadedImageDeleteBusyId("");
    }
  };

  useEffect(
    function closeImageTemplatePickerOnOutsidePointer() {
      if (!templatePickerOpen) return;
      const handlePointerDown = (event: PointerEvent) => {
        const pointerTarget = event.target as Node | null;
        if (!pointerTarget || templatePickerRef.current?.contains(pointerTarget)) return;
        setTemplatePickerOpen(false);
      };
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    },
    [templatePickerOpen],
  );

  useEffect(
    function resetImageAttachTemplateSearchWhenClosed() {
      if (templatePickerOpen) return;
      // picker close 시 검색 draft sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTemplateSearchDraft("");
      setTemplateSearchDirty(false);
    },
    [templatePickerOpen],
  );

  return {
    target,
    urls,
    setUrls,
    alt,
    setAlt,
    files,
    setFiles,
    studioTemplateKey,
    templatePickerOpen,
    setTemplatePickerOpen,
    templateSearchDraft,
    setTemplateSearchDraft,
    templateSearchDirty,
    setTemplateSearchDirty,
    studioImages,
    selectedStudioImageIds,
    setSelectedStudioImageIds,
    studioLoading,
    studioLoaded,
    uploadedImages,
    selectedUploadedImageIds,
    setSelectedUploadedImageIds,
    uploadedImagesLoading,
    uploadedImagesLoaded,
    uploadedImagesNextCursor,
    uploadedImageRetentionBusyId,
    uploadedImageDeleteBusyId,
    templatePickerRef,
    templateInputValue,
    filteredTemplateOptions,
    open,
    close,
    selectStudioTemplate,
    loadStudioImages,
    loadUploadedImages,
    updateUploadedImageRetention,
    deleteUploadedImage,
  };
}

export type MarketingImageAttachmentController = ReturnType<typeof useMarketingImageAttachment>;
