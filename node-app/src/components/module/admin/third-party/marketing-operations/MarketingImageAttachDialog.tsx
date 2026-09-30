import Image from "next/image";
import { Check, ChevronsUpDown, Link2, RefreshCw, Upload, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import { REVIEW_PANEL_LABEL_CLASS } from "./MarketingOpsConstants";
import { getChannelLabel, toImageUrlValues, toSafeString } from "./MarketingOpsUtils";
import type { MarketingImageAttachmentController } from "./useMarketingImageAttachment";
import { MarketingUploadedImagePicker } from "./MarketingUploadedImagePicker";

export function MarketingImageAttachDialog({
  attachment,
  attaching,
  onAttach,
}: {
  attachment: MarketingImageAttachmentController;
  attaching: boolean;
  onAttach: () => void;
}) {
  const { templatePickerRef } = attachment;

  return (
    <Dialog open={!!attachment.target} onOpenChange={(open) => !open && attachment.close()}>
      <DialogContent className="min-w-[20rem] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Lang text={{ ko: "활용 이미지 등록", en: "Attach available images" }} />
          </DialogTitle>
          <DialogDescription className="text-left text-sm leading-6 text-slate-600">
            {attachment.target?.channel
              ? lang({
                  ko: `${getChannelLabel(attachment.target.channel)} draft에 기존 이미지를 연결합니다.`,
                  en: "Attach an existing image to this channel draft.",
                })
              : lang({
                  ko: "현재 job의 전체 채널 draft에 기존 이미지를 연결합니다.",
                  en: "Attach an existing image to all channel drafts in this job.",
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <label className={REVIEW_PANEL_LABEL_CLASS}>{lang({ ko: "이미지 파일", en: "Image files" })}</label>
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 sm:flex-row sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary-text">
                  {attachment.files.length
                    ? attachment.files.map((file) => file.name).join(", ")
                    : lang({
                        ko: "PNG, JPG, WEBP, GIF 파일을 여러 장 업로드합니다.",
                        en: "Upload PNG, JPG, WEBP, or GIF files.",
                      })}
                </p>
                <p className="mt-1 text-xs text-muted-text">
                  {lang({
                    ko: "파일, URL, Gen Studio 선택 이미지를 합쳐 채널별 지원 개수만큼 저장합니다.",
                    en: "Files, URLs, and selected Gen Studio images are merged up to each channel limit.",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {attachment.files.length ? (
                  <Button variant="outline" size="xs" onClick={() => attachment.setFiles([])}>
                    <X className="icon-xxs" />
                    <span>{lang({ ko: "제거", en: "Remove" })}</span>
                  </Button>
                ) : null}
                <Button variant="outline" size="xs" asChild>
                  <label>
                    <Upload className="icon-xxs" />
                    <span>{lang({ ko: "파일 선택", en: "Select file" })}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        attachment.setFiles(Array.from(event.target.files || []));
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </Button>
              </div>
            </div>
          </div>

          <MarketingUploadedImagePicker attachment={attachment} />

          <div>
            <label className={REVIEW_PANEL_LABEL_CLASS}>{lang({ ko: "이미지 URL 목록", en: "Image URLs" })}</label>
            <div className="flex items-start gap-2">
              <Textarea
                value={attachment.urls}
                onChange={(event) => attachment.setUrls(event.target.value)}
                rows={4}
                placeholder={lang({
                  ko: "https://... 또는 /uploads/... 를 줄바꿈/쉼표로 입력",
                  en: "Enter https://... or /uploads/... separated by line breaks or commas",
                })}
              />
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  const url = toImageUrlValues(attachment.urls)[0] || "";
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
                disabled={!toImageUrlValues(attachment.urls).length}
              >
                <Link2 className="icon-xxs" />
                <span className="sr-only">{lang({ ko: "URL 열기", en: "Open URL" })}</span>
              </Button>
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <div className="min-w-0 flex-1">
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  {lang({ ko: "Gen Studio 생성 이미지", en: "Generated Gen Studio images" })}
                </label>
                <div ref={templatePickerRef} className="relative">
                  <div
                    className={cn(
                      "flex h-10 items-center rounded-lg border border-border bg-background pl-3 pr-1",
                      attachment.templatePickerOpen && "border-primary",
                    )}
                  >
                    <input
                      value={attachment.templateInputValue}
                      onChange={(event) => {
                        attachment.setTemplateSearchDraft(event.target.value);
                        attachment.setTemplateSearchDirty(true);
                        attachment.setTemplatePickerOpen(true);
                      }}
                      onFocus={() => {
                        attachment.setTemplatePickerOpen(true);
                        attachment.setTemplateSearchDraft("");
                        attachment.setTemplateSearchDirty(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") attachment.setTemplatePickerOpen(false);
                      }}
                      placeholder={lang({ ko: "템플릿 키 또는 이름으로 검색", en: "Search by template key or name" })}
                      aria-label={lang({ ko: "이미지 템플릿 검색", en: "Search image templates" })}
                      className="min-w-0 flex-1 bg-transparent text-sm text-primary-text outline-none placeholder:text-muted-text"
                    />
                    <Button
                      variant="blank"
                      rounded="full"
                      size="icon-xs"
                      onClick={() => {
                        attachment.setTemplatePickerOpen((prev) => {
                          const nextOpen = !prev;
                          if (nextOpen) {
                            attachment.setTemplateSearchDraft("");
                            attachment.setTemplateSearchDirty(false);
                          }
                          return nextOpen;
                        });
                      }}
                      className="text-muted-text hover:text-primary-text"
                    >
                      <ChevronsUpDown className="h-4 w-4" />
                    </Button>
                  </div>

                  {attachment.templatePickerOpen ? (
                    <div className="absolute top-[calc(100%+0.375rem)] left-0 right-0 z-50 overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
                      <div className="max-h-64 overflow-y-auto py-1">
                        <button
                          type="button"
                          onClick={() => attachment.selectStudioTemplate("")}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-primary-text transition hover:bg-muted/60",
                            !toSafeString(attachment.studioTemplateKey) && "bg-primary/10 text-primary",
                          )}
                        >
                          <span>{lang({ ko: "전체 템플릿 최신 이미지", en: "Latest images from all templates" })}</span>
                          {!toSafeString(attachment.studioTemplateKey) ? <Check className="icon-xxs" /> : null}
                        </button>

                        {attachment.filteredTemplateOptions.length > 0 ? (
                          attachment.filteredTemplateOptions.map((item) => {
                            const key = toSafeString(item.key);
                            const isSelected = toSafeString(attachment.studioTemplateKey) === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => attachment.selectStudioTemplate(key)}
                                className={cn(
                                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-muted/60",
                                  isSelected && "bg-primary/10",
                                )}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-primary-text">
                                    {toSafeString(item.title) || key}
                                  </span>
                                  <span className="block truncate text-xxs text-muted-text">{key}</span>
                                </span>
                                {isSelected ? <Check className="shrink-0 text-primary icon-xxs" /> : null}
                              </button>
                            );
                          })
                        ) : (
                          <p className="px-3 py-3 text-sm text-muted-text">
                            {lang({ ko: "일치하는 템플릿이 없습니다.", en: "No matching templates." })}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => void attachment.loadStudioImages()}
                disabled={attachment.studioLoading}
              >
                <RefreshCw className={cn(attachment.studioLoading ? "animate-spin" : "", "icon-xxs")} />
                <span>{lang({ ko: "목록 불러오기", en: "Load list" })}</span>
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-text">
              {lang({
                ko: "공개 이미지와 현재 로그인 사용자가 생성한 이미지만 표시합니다.",
                en: "Only public images and images generated by the current signed-in user are shown.",
              })}
            </p>
            {attachment.studioImages.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {attachment.studioImages.map((image) => {
                  const assetId = toSafeString(image.assetId);
                  const url = toSafeString(image.url);
                  const selected = attachment.selectedStudioImageIds.includes(assetId);
                  return (
                    <Button
                      key={assetId || url}
                      variant="blank"
                      className={cn(
                        "h-auto min-w-0 flex-col items-stretch rounded-lg border p-2 text-left",
                        selected ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:border-border-hover",
                      )}
                      onClick={() =>
                        attachment.setSelectedStudioImageIds((prev) =>
                          selected ? prev.filter((id) => id !== assetId) : [...prev, assetId],
                        )
                      }
                      noWrap={false}
                    >
                      <span className="relative block aspect-video overflow-hidden rounded-md bg-muted/40">
                        <Image
                          src={url}
                          alt={assetId || "gen studio image"}
                          fill
                          sizes="16rem"
                          className="object-cover"
                          unoptimized
                        />
                      </span>
                      <span className="mt-2 flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-primary-text">{assetId || "image"}</span>
                        {selected ? <Check className="shrink-0 text-primary icon-xxs" /> : null}
                      </span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-text">
                {attachment.studioLoading
                  ? lang({ ko: "Gen Studio 이미지 목록을 불러오는 중입니다.", en: "Loading Gen Studio images." })
                  : attachment.studioLoaded
                    ? lang({
                        ko: "조건에 맞는 Gen Studio 이미지가 없습니다. 공개 이미지 또는 내 생성 이미지가 있는지 확인해주세요.",
                        en: "No matching Gen Studio images. Check whether public images or your generated images exist.",
                      })
                    : lang({
                        ko: "템플릿을 선택하고 목록을 불러오면 최근 생성 이미지를 선택할 수 있습니다.",
                        en: "Choose a template and load the list to select recent generated images.",
                      })}
              </p>
            )}
          </div>

          <div>
            <label className={REVIEW_PANEL_LABEL_CLASS}>{lang({ ko: "대체 텍스트", en: "Alt text" })}</label>
            <Input
              value={attachment.alt}
              onChange={(event) => attachment.setAlt(event.target.value)}
              placeholder={lang({ ko: "비워두면 콘텐츠 제목을 사용", en: "Uses the content title when empty" })}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={attachment.close}>
            <Lang text={{ ko: "취소", en: "Cancel" }} />
          </Button>
          <Button onClick={onAttach} disabled={attaching || !!attachment.uploadedImageDeleteBusyId}>
            <Upload className="icon-xxs" />
            <span>
              {attaching
                ? lang({ ko: "등록 중", en: "Attaching" })
                : lang({ ko: "이미지 가져오기", en: "Import image" })}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
