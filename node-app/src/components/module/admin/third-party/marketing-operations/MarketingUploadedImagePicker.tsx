import Image from "next/image";
import { Check, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, Switch, dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { cn } from "utils/common";
import { formatDate, toSafeString } from "./MarketingOpsUtils";
import type { MarketingImageAttachmentController } from "./useMarketingImageAttachment";

export function MarketingUploadedImagePicker({ attachment }: { attachment: MarketingImageAttachmentController }) {
  const toggleRetention = async (assetId: string, retained: boolean) => {
    if (
      !retained &&
      !(await dialog.confirm({
        variant: "danger",
        message: lang({
          ko: "장기 보관을 해제하면 30일 후 자동 삭제 대상이 됩니다. 검수나 예약에 사용 중이면 보호기간까지 유지됩니다. 계속할까요?",
          en: "Disabling long-term retention makes this image eligible for deletion after 30 days. Active review or scheduling protection still applies. Continue?",
        }),
      }))
    ) {
      return;
    }
    await attachment.updateUploadedImageRetention(assetId, retained);
  };

  const deleteImage = async (assetId: string, label: string) => {
    const confirmed = await dialog.confirm({
      variant: "danger",
      title: lang({ ko: "업로드 이미지 삭제", en: "Delete uploaded image" }),
      message: lang({
        ko: `‘${label}’ 이미지를 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다. 검수나 발행 보호 중인 이미지는 삭제되지 않습니다.`,
        en: `Permanently delete “${label}”? This cannot be undone. Images protected by review or publishing cannot be deleted.`,
      }),
      confirmLabel: lang({ ko: "삭제", en: "Delete" }),
    });
    if (!confirmed) return;
    await attachment.deleteUploadedImage(assetId);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-secondary-text">
            {lang({ ko: "기존 업로드 이미지", en: "Previously uploaded images" })}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-text">
            {lang({
              ko: "기본 30일 보관 · 검수에 연결하면 최소 90일 보호 · 장기 보관은 자동 삭제되지 않습니다.",
              en: "Stored for 30 days by default, protected for at least 90 days when attached, and never auto-deleted while retained.",
            })}
          </p>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={() => void attachment.loadUploadedImages()}
          disabled={attachment.uploadedImagesLoading}
          className="shrink-0"
        >
          <RefreshCw className={cn("icon-xxs", attachment.uploadedImagesLoading && "animate-spin")} />
          <span className="sr-only">{lang({ ko: "기존 이미지 새로고침", en: "Refresh uploaded images" })}</span>
        </Button>
      </div>

      {attachment.uploadedImages.length ? (
        <div className="mt-3 max-h-96 overflow-y-auto overscroll-contain rounded-lg pr-1 [scrollbar-gutter:stable]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {attachment.uploadedImages.map((image) => {
              const assetId = toSafeString(image.assetId);
              const url = toSafeString(image.url);
              const label = toSafeString(image.originalFilename || image.title) || assetId;
              const selected = attachment.selectedUploadedImageIds.includes(assetId);
              const retained = image.retentionMode === "retained";
              const retentionBusy = attachment.uploadedImageRetentionBusyId === assetId;
              const deleteBusy = attachment.uploadedImageDeleteBusyId === assetId;
              const expiresAtDate = toSafeString(image.expiresAt).slice(0, 10);
              const protectedUntilDate = toSafeString(image.protectedUntil).slice(0, 10);

              return (
                <div
                  key={assetId}
                  className={cn(
                    "min-w-0 overflow-hidden rounded-lg border bg-muted/20 p-2",
                    selected ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      attachment.setSelectedUploadedImageIds((prev) =>
                        selected ? prev.filter((id) => id !== assetId) : [...prev, assetId],
                      )
                    }
                    className="block w-full text-left focus-visible-ring"
                    aria-pressed={selected}
                  >
                    <span className="relative block aspect-square overflow-hidden rounded-md bg-muted/40">
                      <Image
                        src={url}
                        alt={toSafeString(image.originalFilename || image.title) || assetId}
                        fill
                        sizes="(max-width: 640px) 45vw, 12rem"
                        className="object-cover"
                        unoptimized
                      />
                      {selected ? (
                        <span className="absolute right-1 top-1 rounded-full bg-primary p-1 text-button-text">
                          <Check className="icon-xxs" />
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block truncate text-xs font-medium text-primary-text">{label}</span>
                  </button>

                  <div className="mt-2 grid min-w-0 gap-1">
                    {retained ? (
                      <Badge
                        variant="outlinePrimary"
                        size="xs"
                        className="min-w-0 w-fit max-w-full justify-start overflow-hidden"
                      >
                        <span className="truncate whitespace-nowrap">
                          {lang({ ko: "장기 보관", en: "Retained" })}
                        </span>
                      </Badge>
                    ) : (
                      <Badge
                        variant="outlineMuted"
                        size="xs"
                        className="min-w-0 w-fit max-w-full justify-start overflow-hidden"
                        title={formatDate(image.expiresAt || "")}
                      >
                        <span className="truncate whitespace-nowrap">
                          {expiresAtDate
                            ? lang({ ko: `만료 · ${expiresAtDate}`, en: `Expires · ${expiresAtDate}` })
                            : lang({ ko: "임시", en: "Temporary" })}
                        </span>
                      </Badge>
                    )}
                    {protectedUntilDate ? (
                      <Badge
                        variant="outline"
                        size="xs"
                        className="min-w-0 w-fit max-w-full justify-start overflow-hidden"
                        title={formatDate(image.protectedUntil || "")}
                      >
                        <span className="truncate whitespace-nowrap">
                          {lang({
                            ko: `보호 기한 · ${protectedUntilDate}`,
                            en: `Protected until · ${protectedUntilDate}`,
                          })}
                        </span>
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-2 flex min-h-8 items-center justify-between gap-1 border-t border-border pt-2">
                    <label className="flex min-w-0 items-center gap-2 text-xs text-secondary-text">
                      <span className="truncate">{lang({ ko: "장기 보관", en: "Keep" })}</span>
                      <Switch
                        size="xs"
                        checked={retained}
                        disabled={retentionBusy || deleteBusy}
                        onCheckedChange={(checked) => void toggleRetention(assetId, checked)}
                        aria-label={lang({ ko: "이미지 장기 보관", en: "Keep image long term" })}
                      />
                    </label>
                    <Button
                      variant="blank"
                      rounded="full"
                      size="icon-xs"
                      className="shrink-0 text-danger hover:bg-danger/10"
                      onClick={() => void deleteImage(assetId, label)}
                      disabled={deleteBusy || retentionBusy}
                      title={lang({ ko: "이미지 영구 삭제", en: "Permanently delete image" })}
                    >
                      {deleteBusy ? <Loader2 className="animate-spin icon-xxs" /> : <Trash2 className="icon-xxs" />}
                      <span className="sr-only">{lang({ ko: "이미지 삭제", en: "Delete image" })}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-text">
          {attachment.uploadedImagesLoading
            ? lang({ ko: "기존 업로드 이미지를 불러오는 중입니다.", en: "Loading uploaded images." })
            : attachment.uploadedImagesLoaded
              ? lang({ ko: "재사용할 수 있는 업로드 이미지가 없습니다.", en: "No uploaded images are available." })
              : lang({ ko: "이미지 목록을 준비하고 있습니다.", en: "Preparing the image list." })}
        </p>
      )}

      {attachment.uploadedImagesNextCursor ? (
        <Button
          variant="outline"
          size="xs"
          className="mt-3 w-full"
          onClick={() =>
            void attachment.loadUploadedImages({ cursor: attachment.uploadedImagesNextCursor, append: true })
          }
          disabled={attachment.uploadedImagesLoading}
        >
          <span>{lang({ ko: "더 불러오기", en: "Load more" })}</span>
        </Button>
      ) : null}
    </div>
  );
}
