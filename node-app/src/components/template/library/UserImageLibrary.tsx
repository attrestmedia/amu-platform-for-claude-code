"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { enUS, ko as koLocale } from "react-day-picker/locale";
import { Lang, lang, useLocalize } from "components/module/i18n";
import { Badge, Button, DatePicker, dialog, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger } from "@amu-labs/ui";
import { FixedImageViewer } from "components/template/gen-studio/modules/FixedImageViewer";
import { StudioImageGallery } from "components/template/gen-studio/modules/StudioImageGallery";
import { UserImageUploadDialog } from "./UserImageUploadDialog";
import { UserUploadedImageActions } from "./UserUploadedImageActions";
import { UserUploadedImageEditor } from "./UserUploadedImageEditor";
import {
  deleteStudioImage,
  fetchEditableLibraryImageFile,
  listStudioImageMetasPage,
  setStudioImageVisibility,
  type LibraryImageEditResult,
} from "libs/api/lab";
import { STUDIO_GENERATION_SOURCE_SERVICE_LABELS, STUDIO_GENERATION_SOURCE_SERVICE_VALUES } from "consts/app";
import type {
  ImagePromptMetaType,
  LibraryImageKindType,
  PromptGenType,
  PromptVisibilityExtendedType,
  PromptVisibilityType,
  StudioGenerationSourceServiceType,
} from "types/app";
import { logger } from "utils/log";
import { getResponseStatus, toErrorMessage } from "utils/common";
import { fileToDataUrl } from "utils/app/imageFile";

const PAGE_SIZE = 24;
type SourceFilterType = StudioGenerationSourceServiceType | "all";
type GenerationModeFilterType = PromptGenType | "all";
type EditingImageState = {
  item: ImagePromptMetaType;
  src: string;
  name: string;
};

function toLocalDateBoundaryIso(date: Date, dayOffset = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset).toISOString();
}

function getImageEditorLoadError(error: unknown) {
  const status = getResponseStatus(error);
  if (status === 401) {
    return lang({
      ko: "로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.",
      en: "Your session expired. Sign in and try again.",
    });
  }
  if (status === 403) {
    return lang({
      ko: "이 이미지를 편집할 권한을 확인하지 못했습니다. 멤버십과 소유권을 확인해 주세요.",
      en: "You do not have permission to edit this image. Check your membership and ownership.",
    });
  }
  if (status === 404) {
    return lang({
      ko: "원본 이미지를 찾지 못했습니다. 라이브러리를 새로고침해 주세요.",
      en: "The source image was not found. Refresh the library.",
    });
  }
  if (status === 409) {
    return lang({
      ko: "원본 이미지의 저장 상태가 변경되었습니다. 라이브러리를 새로고침해 주세요.",
      en: "The source image storage changed. Refresh the library.",
    });
  }
  return lang({
    ko: "이미지를 편집기로 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    en: "The image could not be loaded into the editor. Try again shortly.",
  });
}

export function UserImageLibrary({ canUpload = false }: { canUpload?: boolean }) {
  const { language, localize } = useLocalize();
  const [items, setItems] = useState<ImagePromptMetaType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [libraryKind, setLibraryKind] = useState<LibraryImageKindType>("generated");
  const [sourceService, setSourceService] = useState<SourceFilterType>("all");
  const [visibility, setVisibility] = useState<PromptVisibilityExtendedType>("all");
  const [generationMode, setGenerationMode] = useState<GenerationModeFilterType>("all");
  const [createdRange, setCreatedRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [editingImage, setEditingImage] = useState<EditingImageState | null>(null);
  const [preparingEditAssetId, setPreparingEditAssetId] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const createdFrom = createdRange?.from ? toLocalDateBoundaryIso(createdRange.from) : undefined;
  const createdBefore = createdRange?.from
    ? toLocalDateBoundaryIso(createdRange.to || createdRange.from, 1)
    : undefined;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
        dateStyle: "medium",
      }),
    [language],
  );
  const createdRangeLabel = createdRange?.from
    ? createdRange.to
      ? `${dateFormatter.format(createdRange.from)} - ${dateFormatter.format(createdRange.to)}`
      : dateFormatter.format(createdRange.from)
    : undefined;

  useEffect(() => {
    let cancelled = false;

    listStudioImageMetasPage({
      scope: "mine",
      limit: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      q: deferredQuery || undefined,
      libraryKind,
      sourceService: libraryKind === "generated" && sourceService !== "all" ? sourceService : undefined,
      visibility: visibility === "all" ? undefined : visibility,
      generationMode: libraryKind === "generated" && generationMode !== "all" ? generationMode : undefined,
      createdFrom,
      createdBefore,
    })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total ?? result.items.length);
      })
      .catch((loadError) => {
        logger.warn("[UserImageLibrary] 내 이미지 조회 실패", loadError);
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    createdBefore,
    createdFrom,
    deferredQuery,
    generationMode,
    libraryKind,
    page,
    refreshVersion,
    sourceService,
    visibility,
  ]);

  const images = useMemo(() => items.map((item) => item.url).filter(Boolean), [items]);
  const metaBySrc = useMemo(() => Object.fromEntries(items.map((item) => [item.url, item] as const)), [items]);

  const handleSelect = useCallback((item: ImagePromptMetaType, index: number) => {
    setViewerSrc(item.url);
    setViewerIndex(index);
  }, []);

  const prepareReload = useCallback(() => {
    setLoading(true);
    setError(false);
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      prepareReload();
      setQuery(value.slice(0, 120));
      setPage(1);
    },
    [prepareReload],
  );

  const handleLibraryKindChange = useCallback(
    (value: string) => {
      if (value !== "generated" && value !== "uploaded") return;
      prepareReload();
      setLibraryKind(value);
      setSourceService("all");
      setGenerationMode("all");
      setPage(1);
      setViewerSrc(null);
    },
    [prepareReload],
  );

  const handleSourceServiceChange = useCallback(
    (value: string) => {
      prepareReload();
      setSourceService(value as SourceFilterType);
      setPage(1);
    },
    [prepareReload],
  );

  const handleVisibilityFilterChange = useCallback(
    (value: string) => {
      prepareReload();
      setVisibility(value as PromptVisibilityExtendedType);
      setPage(1);
    },
    [prepareReload],
  );

  const handleGenerationModeChange = useCallback(
    (value: string) => {
      prepareReload();
      setGenerationMode(value as GenerationModeFilterType);
      setPage(1);
    },
    [prepareReload],
  );

  const handleCreatedRangeChange = useCallback(
    (range: DateRange | undefined) => {
      prepareReload();
      setCreatedRange(range);
      setPage(1);
    },
    [prepareReload],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      prepareReload();
      setPage(nextPage);
    },
    [prepareReload],
  );

  const handleItemVisibilityChange = useCallback(async (item: ImagePromptMetaType, next: PromptVisibilityType) => {
    if (!item.assetId || item.visibility === next) return;
    if (next === "public") {
      const confirmed = await dialog.confirm({
        title: lang({ ko: "이미지를 공개할까요?", en: "Make this image public?" }),
        message: lang({
          ko: "공개로 전환하면 공개 URL을 통해 외부 사이트와 누구나 이 이미지를 볼 수 있습니다.",
          en: "Once public, anyone can view this image through its public URL, including on external sites.",
        }),
        confirmLabel: lang({ ko: "공개로 전환", en: "Make public" }),
        cancelLabel: lang({ ko: "취소", en: "Cancel" }),
      });
      if (!confirmed) return;
    }

    try {
      const updated = await setStudioImageVisibility(item.assetId, next);
      const nextUrl = String(updated?.url || item.url).trim() || item.url;
      setItems((current) =>
        current.map((row) =>
          row.assetId === item.assetId ? { ...row, ...updated, visibility: next, url: nextUrl } : row,
        ),
      );
      setViewerSrc((current) => (current === item.url ? nextUrl : current));
      toast.success(
        lang(
          next === "public"
            ? {
                ko: "이미지를 공개했습니다. 공개 URL을 복사할 수 있습니다.",
                en: "Image is public. You can now copy its public URL.",
              }
            : { ko: "이미지를 비공개로 전환했습니다.", en: "Image is now private." },
        ),
      );
    } catch (visibilityError) {
      logger.warn("[UserImageLibrary] 이미지 공개 범위 변경 실패", visibilityError);
      toast.error(
        lang({
          ko: "공개 범위를 변경하지 못했습니다. 다시 시도해 주세요.",
          en: "Could not change visibility. Try again.",
        }),
      );
    }
  }, []);

  const handleVisibilityChange = useCallback(
    async (src: string, next: PromptVisibilityType) => {
      const item = metaBySrc[src];
      if (!item?.assetId) return;
      await handleItemVisibilityChange(item, next);
    },
    [handleItemVisibilityChange, metaBySrc],
  );

  const handleDelete = useCallback(
    async (src: string) => {
      const item = metaBySrc[src];
      if (!item?.assetId) return;
      await deleteStudioImage(item.assetId, { policy: "soft", reason: "user_library_delete" });
      setItems((current) => current.filter((row) => row.assetId !== item.assetId));
      setTotal((current) => Math.max(0, current - 1));
      setViewerSrc(null);
    },
    [metaBySrc],
  );

  const handleOpenImageEditor = useCallback(
    async function openImageEditor(item: ImagePromptMetaType) {
      if (!canUpload || !item.assetId || preparingEditAssetId) return;
      setPreparingEditAssetId(item.assetId);
      try {
        const editable = await fetchEditableLibraryImageFile(item.assetId, `library-${item.assetId}`);
        setEditingImage({ item, src: await fileToDataUrl(editable.file), name: editable.name });
      } catch (editPrepareError) {
        logger.warn("[UserImageLibrary] 업로드 이미지 편집 준비 실패", {
          assetId: item.assetId,
          urlKind: item.urlKind,
          status: getResponseStatus(editPrepareError),
          message: toErrorMessage(editPrepareError, "image_edit_source_failed"),
        });
        toast.error(getImageEditorLoadError(editPrepareError), {
          action: {
            label: lang({ ko: "다시 시도", en: "Retry" }),
            onClick: () => void openImageEditor(item),
          },
        });
      } finally {
        setPreparingEditAssetId("");
      }
    },
    [canUpload, preparingEditAssetId],
  );

  const handleEditedImageSaved = useCallback(
    (result: LibraryImageEditResult) => {
      if (result.saveMode === "new") {
        prepareReload();
        setLibraryKind("uploaded");
        setQuery("");
        setSourceService("all");
        setVisibility("all");
        setGenerationMode("all");
        setCreatedRange(undefined);
        setPage(1);
        setViewerSrc(null);
        setRefreshVersion((current) => current + 1);
        return;
      }

      const previous = editingImage?.item;
      const nextUrl = String(result.url || previous?.url || "").trim();
      setItems((current) =>
        current.map((row) =>
          row.assetId === result.assetId
            ? {
                ...row,
                ...result,
                url: nextUrl || row.url,
                visibility: result.visibility || row.visibility,
              }
            : row,
        ),
      );
      if (previous && nextUrl) {
        setViewerSrc((current) => (current === previous.url ? nextUrl : current));
      }
    },
    [editingImage?.item, prepareReload],
  );

  const handleCloseImageEditor = useCallback(() => setEditingImage(null), []);

  return (
    <section className="space-y-5">
      <Tabs value={libraryKind} onValueChange={handleLibraryKindChange}>
        <TabsList
          className="w-full bg-transparent p-0 shadow-none"
          aria-label={lang({ ko: "내 이미지 유형", en: "My image type" })}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items">
              <TabsTrigger value="generated">
                <Lang text={{ ko: "생성된 이미지", en: "Generated Images" }} />
              </TabsTrigger>
              <TabsTrigger value="uploaded">
                <Lang text={{ ko: "업로드한 이미지", en: "Uploaded Images" }} />
              </TabsTrigger>
            </div>
            {canUpload ? (
              <div className="flex justify-end">
                <UserImageUploadDialog
                  onUploaded={() => {
                    prepareReload();
                    setLibraryKind("uploaded");
                    setQuery("");
                    setSourceService("all");
                    setVisibility("all");
                    setGenerationMode("all");
                    setCreatedRange(undefined);
                    setPage(1);
                    setViewerSrc(null);
                    setRefreshVersion((current) => current + 1);
                  }}
                />
              </div>
            ) : null}
          </div>
        </TabsList>

        <TabsContent value={libraryKind} className="space-y-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder={lang({
                    ko: libraryKind === "uploaded" ? "asset ID 검색" : "asset ID, 템플릿 키, 프롬프트 검색",
                    en: libraryKind === "uploaded" ? "Search asset ID" : "Search asset ID, template key, or prompt",
                  })}
                  className="pl-9"
                />
              </div>

              <div
                className={
                  libraryKind === "generated"
                    ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[48rem] xl:grid-cols-4"
                    : "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[24rem] xl:grid-cols-2"
                }
              >
                {libraryKind === "generated" ? (
                  <Select value={sourceService} onValueChange={(value) => handleSourceServiceChange(String(value))}>
                    <SelectTrigger aria-label={lang({ ko: "서비스 필터", en: "Service filter" })}>
                      <SelectValue placeholder={lang({ ko: "전체 서비스", en: "All services" })} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <Lang text={{ ko: "전체 서비스", en: "All services" }} />
                      </SelectItem>
                      {STUDIO_GENERATION_SOURCE_SERVICE_VALUES.filter((service) => service !== "upload").map(
                        (service) => (
                          <SelectItem key={service} value={service}>
                            <Lang text={STUDIO_GENERATION_SOURCE_SERVICE_LABELS[service]} />
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                ) : null}

                <Select value={visibility} onValueChange={(value) => handleVisibilityFilterChange(String(value))}>
                  <SelectTrigger aria-label={lang({ ko: "공개 범위 필터", en: "Visibility filter" })}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <Lang text={{ ko: "전체 공개 범위", en: "All visibility" }} />
                    </SelectItem>
                    <SelectItem value="private">
                      <Lang text={{ ko: "비공개", en: "Private" }} />
                    </SelectItem>
                    <SelectItem value="public">
                      <Lang text={{ ko: "공개", en: "Public" }} />
                    </SelectItem>
                  </SelectContent>
                </Select>

                {libraryKind === "generated" ? (
                  <Select value={generationMode} onValueChange={(value) => handleGenerationModeChange(String(value))}>
                    <SelectTrigger aria-label={lang({ ko: "생성 방식 필터", en: "Generation mode filter" })}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <Lang text={{ ko: "전체 생성 방식", en: "All modes" }} />
                      </SelectItem>
                      <SelectItem value="template">
                        <Lang text={{ ko: "템플릿", en: "Template" }} />
                      </SelectItem>
                      <SelectItem value="custom">
                        <Lang text={{ ko: "커스텀", en: "Custom" }} />
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}

                <div className="flex min-w-0 gap-1">
                  <DatePicker
                    mode="range"
                    value={createdRange}
                    displayValue={createdRangeLabel}
                    placeholder={localize(
                      libraryKind === "uploaded"
                        ? { ko: "업로드일 또는 기간", en: "Upload date or period" }
                        : { ko: "생성일 또는 기간", en: "Generation date or period" },
                    )}
                    ariaLabel={localize(
                      libraryKind === "uploaded"
                        ? { ko: "이미지 업로드일 필터", en: "Image upload date filter" }
                        : { ko: "이미지 생성일 필터", en: "Image generation date filter" },
                    )}
                    locale={language === "ko" ? koLocale : enUS}
                    disabledDates={{ after: new Date() }}
                    onChange={handleCreatedRangeChange}
                    className="min-w-0"
                  />
                  {createdRange?.from ? (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => handleCreatedRangeChange(undefined)}
                      aria-label={localize(
                        libraryKind === "uploaded"
                          ? { ko: "업로드일 필터 초기화", en: "Clear upload date filter" }
                          : { ko: "생성일 필터 초기화", en: "Clear generation date filter" },
                      )}
                      className="shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-secondary-text">
              <span>
                <Lang
                  text={
                    libraryKind === "uploaded"
                      ? { ko: "최신 업로드순", en: "Newest uploads first" }
                      : { ko: "최신 생성순", en: "Newest generations first" }
                  }
                />
              </span>
              <Badge variant="outline" size="xs" className="font-mono">
                {total}
              </Badge>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-dashed border-danger/30 px-4 py-10 text-center text-sm text-danger">
              <Lang
                text={{
                  ko: "이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
                  en: "Images could not be loaded. Please try again.",
                }}
              />
            </div>
          ) : (
            <StudioImageGallery
              items={items}
              loading={loading}
              emptyText={
                libraryKind === "uploaded"
                  ? { ko: "조건에 맞는 업로드 이미지가 없습니다.", en: "No uploaded images match these filters." }
                  : { ko: "조건에 맞는 생성 이미지가 없습니다.", en: "No generated images match these filters." }
              }
              page={page}
              pageSize={PAGE_SIZE}
              totalItems={total}
              onPageChange={handlePageChange}
              onSelect={handleSelect}
              renderActions={(item) =>
                item.sourceService === "upload" && item.canEdit ? (
                  <UserUploadedImageActions
                    item={item}
                    canEditImage={canUpload}
                    preparingEdit={preparingEditAssetId === item.assetId}
                    onEdit={handleOpenImageEditor}
                    onVisibilityChange={handleItemVisibilityChange}
                  />
                ) : null
              }
              showSource
            />
          )}
        </TabsContent>
      </Tabs>

      <FixedImageViewer
        open={Boolean(viewerSrc)}
        src={viewerSrc}
        images={images}
        initialIndex={viewerIndex}
        metaBySrc={metaBySrc}
        enableManageActions
        onOpenChange={(open) => !open && setViewerSrc(null)}
        onVisibilityChange={handleVisibilityChange}
        onDelete={handleDelete}
      />

      {editingImage ? (
        <UserUploadedImageEditor
          item={editingImage.item}
          imageSrc={editingImage.src}
          imageName={editingImage.name}
          onClose={handleCloseImageEditor}
          onSaved={handleEditedImageSaved}
        />
      ) : null}
    </section>
  );
}
