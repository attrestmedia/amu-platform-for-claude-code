"use client";

import React, { useState, type ReactNode } from "react";
import Image from "next/image";
import { Badge, Button, Checkbox, RichTextRenderer, ScrollArea, SegmentedControl, Sheet, SheetContent, SheetHeader, SheetTitle, Switch, Textarea, TooltipBasic, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { AlertTriangle, Calendar, Check, Copy, Download, ExternalLink, Image as ImageLucide, Trash2, Clock } from "lucide-react";
import { cn } from "utils/common";
import { dedupeImagePreviewsByUrl } from "utils/common/imagePreviewUtils";
import { REVIEW_PANEL_EMPTY_CLASS } from "./MarketingOpsConstants";
import type { MarketingImagePreview, MarketingJobDetail, MarketingJobListItem } from "./MarketingOpsTypes";
import {
  copyHtml,
  copyImageToClipboard,
  copyText,
  formatDate,
  getChannelLabel,
  getMarketingFailureDetails,
  getMarketingJobDisplayStatus,
  getMarketingJobSourceUrl,
  getMarketingJobSourceLabel,
  getMarketingJobStoreManagerUrl,
  getStatusClass,
  getStatusDotClass,
  getStatusLabel,
  getUploadHourSourceLabel,
  isHttpUrl,
  isMarketingFailureStatus,
  marketingMarkdownToHtml,
  marketingMarkdownToNaverHtml,
  toSafeString,
} from "./MarketingOpsUtils";

type MarketingBodyViewMode = "text" | "preview";
type MarketingBodyCopyMode = "text" | "html";

const MARKETING_BODY_VIEW_OPTIONS = [
  { value: "text", label: { ko: "텍스트 보기", en: "Text" } },
  { value: "preview", label: { ko: "미리보기", en: "Preview" } },
] satisfies { value: MarketingBodyViewMode; label: { ko: string; en: string } }[];

export function showMarketingFailureDialog(channel: string, ...sources: unknown[]) {
  const failure = getMarketingFailureDetails(...sources);
  const subject = channel === "job" ? "JOB" : getChannelLabel(channel);
  void dialog.alert({
    variant: "danger",
    title: lang({ ko: `${subject} 실패 상세`, en: `${subject} failure details` }),
    message: [failure.message, failure.detailLines.join("\n")].filter(Boolean).join("\n\n"),
    confirmLabel: lang({ ko: "확인", en: "Close" }),
  });
}

export function MarketingExternalUrlLine({ url }: { url: string }) {
  const safeUrl = toSafeString(url);

  if (!safeUrl) {
    return <p className="mt-1 text-sm text-secondary-text">-</p>;
  }

  if (!isHttpUrl(safeUrl)) {
    return <p className="mt-1 break-all text-sm text-secondary-text">{safeUrl}</p>;
  }

  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-sm text-secondary-text underline-offset-2 hover:text-primary-text hover:underline"
    >
      <span className="min-w-0 break-all">{safeUrl}</span>
      <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
      <span className="sr-only">{lang({ ko: "새창 열기", en: "Open in new window" })}</span>
    </a>
  );
}

export function MarketingBodyComposer({
  value,
  onChange,
  rows,
  placeholder,
  htmlVariant = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder: string;
  htmlVariant?: "default" | "naver";
}) {
  const [viewMode, setViewMode] = useState<MarketingBodyViewMode>("text");
  const [copyMode, setCopyMode] = useState<MarketingBodyCopyMode>("text");
  const safeContent = toSafeString(value);
  const viewOptions = MARKETING_BODY_VIEW_OPTIONS.map((option) => ({
    value: option.value,
    label: lang(option.label),
  }));
  const handleCopyBody = () => {
    if (copyMode === "html") {
      void copyHtml(
        htmlVariant === "naver" ? marketingMarkdownToNaverHtml(safeContent) : marketingMarkdownToHtml(safeContent),
        lang({ ko: "본문 HTML을 복사했습니다.", en: "Body HTML copied." }),
      );
      return;
    }

    void copyText(safeContent, lang({ ko: "본문 텍스트를 복사했습니다.", en: "Body text copied." }));
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <SegmentedControl
          size="xs"
          appearance="soft"
          value={viewMode}
          options={viewOptions}
          onValueChange={setViewMode}
          ariaLabel={lang({ ko: "본문 보기 방식", en: "Body view mode" })}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Switch
            size="sm"
            checked={copyMode === "html"}
            onCheckedChange={(checked) => setCopyMode(checked ? "html" : "text")}
            aria-label={lang({ ko: "HTML 복사", en: "Copy to HTML" })}
          />
          <Button variant="outline" size="xs" onClick={handleCopyBody}>
            <Copy className="icon-xxs" />
            <span>{copyMode === "text" ? "Copy" : "HTML"}</span>
          </Button>
        </div>
      </div>
      {viewMode === "text" ? (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
        />
      ) : safeContent ? (
        <div className="min-h-[12rem] px-3 py-3">
          <RichTextRenderer content={safeContent} compact className="text-sm text-primary-text" />
        </div>
      ) : (
        <div className="min-h-[12rem] px-3 py-3">
          <p className="text-sm text-muted-text">
            {lang({ ko: "미리볼 본문이 없습니다.", en: "No body content to preview." })}
          </p>
        </div>
      )}
    </div>
  );
}

export function MarketingImagePreviewStrip({
  images,
  onApply,
  onRemove,
  onApplyMany,
  onRemoveMany,
}: {
  images?: MarketingImagePreview[];
  onApply?: (image: MarketingImagePreview) => void;
  onRemove?: (image: MarketingImagePreview) => void;
  onApplyMany?: (images: MarketingImagePreview[]) => void;
  onRemoveMany?: (images: MarketingImagePreview[]) => void;
}) {
  const visibleImages = dedupeImagePreviewsByUrl(images || []).slice(0, 12);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  if (!visibleImages.length) return null;

  const getImageKey = (image: MarketingImagePreview) => toSafeString(image.key || image.url);
  const visibleKeys = visibleImages.map(getImageKey).filter(Boolean);
  const selectedImages = visibleImages.filter((image) => selectedKeys.includes(getImageKey(image)));
  const removableSelectedImages = selectedImages.filter(
    (image) => image.source === "channel_draft" || image.source === "channel_image",
  );
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.includes(key));
  const toggleSelected = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };
  const clearSelected = () => setSelectedKeys([]);

  return (
    <div className="mb-4 w-full max-w-full overflow-hidden">
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-primary-text">
              {lang({ ko: "활용 이미지", en: "Available images" })}
            </span>
            <span className="text-sm text-muted-text">{visibleImages.length}</span>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-secondary-text">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={(checked) => setSelectedKeys(checked ? visibleKeys : [])}
              aria-label={lang({ ko: "활용 이미지 전체 선택", en: "Select all available images" })}
            />
            <span>{lang({ ko: "전체 선택", en: "Select all" })}</span>
          </label>
        </div>
        {selectedImages.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-text">
              {lang({ ko: `${selectedImages.length}개 선택됨`, en: `${selectedImages.length} selected` })}
            </span>
            {onApplyMany ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  onApplyMany(selectedImages);
                  clearSelected();
                }}
              >
                <ImageLucide className="icon-xs" />
                <span>{lang({ ko: "선택 적용", en: "Apply selected" })}</span>
              </Button>
            ) : null}
            {onRemoveMany && removableSelectedImages.length ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  onRemoveMany(removableSelectedImages);
                  clearSelected();
                }}
              >
                <Trash2 className="icon-xs" />
                <span>{lang({ ko: "선택 제거", en: "Remove selected" })}</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0">
        <ScrollArea dragOnScrollX={true} dragIgnoreInteractive={true}>
          <div className="flex items-stretch gap-3">
            {visibleImages.map((image) => {
              const url = toSafeString(image.url);
              const label = toSafeString(image.label || image.source || image.assetId) || "image";
              const key = getImageKey(image);
              const selected = selectedKeys.includes(key);

              return (
                <div
                  key={key}
                  className={cn(
                    "flex flex-col min-w-0 max-w-[10rem] overflow-hidden rounded-lg border bg-muted/20 p-3",
                    selected ? "border-primary" : "border-border",
                  )}
                >
                  <div className="relative aspect-video overflow-hidden bg-muted/40 -mt-3 -mx-3">
                    <label className="absolute left-1 top-1 z-10 icon-xs rounded-md bg-background/90 shadow-sm">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelected(key)}
                        aria-label={lang({ ko: `${label} 선택`, en: `Select ${label}` })}
                      />
                    </label>
                    <Image
                      src={url}
                      alt={toSafeString(image.alt) || label}
                      fill
                      sizes="(min-width: 1280px) 18rem, (min-width: 640px) 50vw, 100vw"
                      className="h-full w-full object-cover"
                      loading="lazy"
                      unoptimized
                    />
                  </div>
                  <div className="mt-3 flex flex-col flex-1">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-primary-text">{label}</p>
                      {image.assetId ? <p className="truncate text-xxs text-muted-text">{image.assetId}</p> : null}
                    </div>
                    <div className="flex items-center justify-end mt-2">
                      {onApply ? (
                        <Button
                          variant="text"
                          size="sm"
                          className="inline-flex items-center gap-1.5 shrink-0"
                          onClick={() => onApply(image)}
                        >
                          <Check className="icon-xs" />
                          <Lang text={{ ko: "적용", en: "Apply" }} className="text-xs hidden xs:block" />
                        </Button>
                      ) : null}
                      <Button
                        variant="blank"
                        size="icon-sm"
                        className="shrink-0 p-0"
                        onClick={() => void copyImageToClipboard(url, label)}
                      >
                        <Copy className="icon-xs" />
                        <Lang text={{ ko: "이미지 복사", en: "Copy image" }} className="sr-only" />
                      </Button>
                      <Button
                        variant="blank"
                        size="icon-sm"
                        className="shrink-0 p-0"
                        onClick={() =>
                          window.open(toSafeString(image.downloadUrl || url), "_blank", "noopener,noreferrer")
                        }
                      >
                        <Download className="icon-xs" />
                        <Lang text={{ ko: "다운로드", en: "Download" }} className="sr-only" />
                      </Button>
                      {onRemove && (image.source === "channel_draft" || image.source === "channel_image") ? (
                        <Button
                          variant="blank"
                          size="icon-sm"
                          className="shrink-0 p-0 -mr-1"
                          onClick={() => onRemove(image)}
                        >
                          <Trash2 className="icon-xs text-danger" />
                          <span className="sr-only">{lang({ ko: "제거", en: "Remove" })}</span>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export function ReviewJobCard({
  job,
  isActive,
  isSelected,
  isGlobalScope,
  onToggleSelected,
  onOpenDetail,
}: {
  job: MarketingJobListItem;
  isActive: boolean;
  isSelected: boolean;
  isGlobalScope: boolean;
  categoryOptions: string[];
  onToggleSelected: (jobId: string, checked: boolean) => void;
  onUpdateCategory: (jobId: string, queueCategory: string) => void;
  onOpenDetail: (jobId: string) => void;
}) {
  const displayStatus = getMarketingJobDisplayStatus(job);
  const scheduledChannelStatuses = (job.channelStatuses || []).filter((channelStatus) =>
    Boolean(channelStatus.scheduledPublishAt),
  );
  const hasOverdueScheduledPublish = scheduledChannelStatuses.some(
    (channelStatus) => channelStatus.scheduledPublishOverdue,
  );
  const scheduledBoxClassName = "mt-2 rounded-md bg-muted/40 px-2 py-2";

  return (
    <div
      className={cn(
        "w-full rounded-xl border px-3 py-3 text-left transition-all",
        isActive
          ? "border-primary bg-primary/10 shadow-[0_0_0_1px_var(--primary),0_4px_12px_-4px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
          : "border-border bg-surface hover:border-border-hover",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={isSelected}
            onChange={(event) => onToggleSelected(job.jobId, event.target.checked)}
          />
          <Button
            variant="blank"
            className="w-full min-w-0 text-left font-mono text-xs font-medium leading-snug text-primary-text"
            onClick={() => onOpenDetail(job.jobId)}
            noWrap={false}
          >
            {getMarketingJobSourceLabel(job)}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-6">
        <Badge
          size="xs"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[2px] font-mono text-xxs font-medium uppercase",
            getStatusClass(displayStatus),
          )}
          onClick={
            isMarketingFailureStatus(displayStatus)
              ? () =>
                  showMarketingFailureDialog(
                    "job",
                    ...(job.channelStatuses || []).filter((item) => isMarketingFailureStatus(item.status)),
                    job,
                  )
              : undefined
          }
          aria-label={
            isMarketingFailureStatus(displayStatus)
              ? lang({ ko: "JOB 실패 원인 보기", en: "View job failure reason" })
              : undefined
          }
          title={
            isMarketingFailureStatus(displayStatus)
              ? lang({ ko: "실패 원인 보기", en: "View failure reason" })
              : undefined
          }
        >
          <span className="h-1 w-1 rounded-full bg-current" />
          {getStatusLabel(displayStatus)}
        </Badge>
        <span className="font-mono text-xxs text-muted-text">{formatDate(job.createdAt)}</span>
      </div>
      <div className="border-t mt-3 pt-2 space-y-1">
        {job.scheduledAt ? (
          <p className="font-mono text-xxs text-muted-text">scheduled: {formatDate(job.scheduledAt)}</p>
        ) : null}
        {isGlobalScope ? (
          <p className="font-mono text-xxs text-muted-text">universeId: {toSafeString(job.universeId) || "-"}</p>
        ) : null}
        <p className="font-mono text-xxs text-muted-text">
          {lang({ ko: "카테고리", en: "Category" })}: {toSafeString(job.queueCategory) || "general"} /{" "}
          {lang({ ko: "우선순위", en: "Priority" })}: {toSafeString(job.priority) || "normal"}
        </p>
        {job.recommendedUploadSchedules?.length ? (
          <div className={scheduledBoxClassName}>
            <p className="mb-1.5 inline-flex items-center gap-1 text-xxs font-medium text-secondary-text">
              <Calendar className="icon-xxs" />
              <Lang text={{ ko: "추천 시간대", en: "Recommended times" }} />
            </p>
            <div className="flex flex-wrap">
              {job.recommendedUploadSchedules.map((schedule) => (
                <p
                  key={schedule.channel}
                  className="flex flex-wrap gap-x-1.5 font-mono text-xxs text-muted-text mr-2"
                  title={getUploadHourSourceLabel(schedule.hourSource, schedule.topicClass)}
                >
                  <span className="font-medium text-primary-text">{getChannelLabel(schedule.channel)}</span>
                  <span>{schedule.date}</span>
                  <span>
                    {lang({
                      ko: `권장 ${schedule.recommendedHour}시`,
                      en: `Preferred ${String(schedule.recommendedHour).padStart(2, "0")}:00`,
                    })}
                  </span>
                  {/* 추천은 배정 시점에 고정된다. 지난 추천일은 예약 시 같은 시각의 다음 발생일로 넘어간다. */}
                  {schedule.overdue ? (
                    <span className="text-danger">{lang({ ko: "· 지남", en: "· overdue" })}</span>
                  ) : null}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {/* 예약 상태 */}
        {scheduledChannelStatuses.length > 0 ? (
          <div
            className={cn(
              scheduledBoxClassName,
              hasOverdueScheduledPublish &&
                "border border-danger/30 bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))]",
            )}
            {...(hasOverdueScheduledPublish ? { role: "alert" } : {})}
          >
            <p
              className={cn(
                "mt-1.5 mb-1.5 inline-flex items-center gap-1 text-xxs font-medium text-secondary-text",
                hasOverdueScheduledPublish && "text-danger",
              )}
            >
              {hasOverdueScheduledPublish ? (
                <AlertTriangle className="icon-xxs" aria-hidden="true" />
              ) : (
                <Clock className="icon-xxs" aria-hidden="true" />
              )}
              <Lang
                text={
                  hasOverdueScheduledPublish
                    ? { ko: "예약 발행 지연", en: "Scheduled publish overdue" }
                    : { ko: "예약 등록", en: "Scheduled" }
                }
              />
            </p>
            <div className="flex flex-wrap gap-0.5">
              {scheduledChannelStatuses.map((channelStatus) => {
                const failed = isMarketingFailureStatus(channelStatus.status);
                return (
                  <p
                    key={channelStatus.channel}
                    className="flex flex-wrap gap-x-1.5 font-mono text-xxs text-muted-text mr-2"
                  >
                    <span className="font-medium text-primary-text">{getChannelLabel(channelStatus.channel)}</span>
                    <span>{formatDate(channelStatus.scheduledPublishAt)}</span>
                    {channelStatus.scheduledPublishOverdue ? (
                      <span className="font-medium text-danger">
                        <Lang text={{ ko: "· 발행 기한 지남", en: "· overdue" }} />
                      </span>
                    ) : null}
                    {failed ? (
                      <Button
                        variant="blank"
                        className="font-mono text-xxs text-danger underline-offset-2 hover:underline"
                        onClick={() => showMarketingFailureDialog(channelStatus.channel, channelStatus, job)}
                      >
                        <Lang text={{ ko: "실패 원인", en: "Failure reason" }} />
                      </Button>
                    ) : null}
                  </p>
                );
              })}
            </div>
          </div>
        ) : null}

        {job.channelStatuses && job.channelStatuses.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {job.channelStatuses.map((channelStatus) => {
              const scheduled = Boolean(channelStatus.scheduledPublishAt);
              const overdue = Boolean(channelStatus.scheduledPublishOverdue);
              const failed = isMarketingFailureStatus(channelStatus.status);
              const title = failed
                ? lang({ ko: "실패 원인 보기", en: "View failure reason" })
                : overdue
                  ? `${getChannelLabel(channelStatus.channel)} · ${lang({ ko: "예약 발행 지연", en: "Scheduled publish overdue" })} · ${formatDate(channelStatus.scheduledPublishAt)}`
                : scheduled
                  ? `${getChannelLabel(channelStatus.channel)} · ${formatDate(channelStatus.scheduledPublishAt)}`
                  : getChannelLabel(channelStatus.channel);
              const content = (
                <>
                  <span
                    className={cn(
                      "relative -top-[1px] w-1.5 h-1.5 rounded-full",
                      overdue ? "bg-danger" : getStatusDotClass(channelStatus.status),
                    )}
                    title={title}
                  />
                  <TooltipBasic triggerAs="span" icon={<span>{getChannelLabel(channelStatus.channel)}</span>}>
                    <span>
                      {failed
                        ? getStatusLabel(channelStatus.status)
                        : overdue
                          ? `${lang({ ko: "발행 지연", en: "Overdue" })} · ${formatDate(channelStatus.scheduledPublishAt)}`
                        : scheduled
                          ? `${lang({ ko: "예약됨", en: "Scheduled" })} · ${formatDate(channelStatus.scheduledPublishAt)}`
                          : getStatusLabel(channelStatus.status)}
                    </span>
                  </TooltipBasic>
                </>
              );

              return failed ? (
                <button
                  key={channelStatus.channel}
                  type="button"
                  className="inline-flex items-center gap-1 rounded font-mono text-xxs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={title}
                  aria-label={lang({
                    ko: `${getChannelLabel(channelStatus.channel)} 실패 원인 보기`,
                    en: `View ${getChannelLabel(channelStatus.channel)} failure reason`,
                  })}
                  onClick={() => showMarketingFailureDialog(channelStatus.channel, channelStatus, job)}
                >
                  {content}
                </button>
              ) : (
                <span
                  key={channelStatus.channel}
                  className="inline-flex items-center gap-1 font-mono text-xxs"
                  title={title}
                >
                  {content}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xxs text-secondary-text">
            {(job.channels || []).map((channel) => getChannelLabel(channel)).join(" / ") || "-"}
          </p>
        )}
      </div>
    </div>
  );
}

export function JobReviewDetailSheet({
  open,
  onOpenChange,
  selectedJobId,
  detail,
  detailLoading,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedJobId: string;
  detail: MarketingJobDetail | null;
  detailLoading: boolean;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-full bg-background p-0 text-primary-text">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border bg-background/95 px-4 py-4 text-left">
            <SheetTitle>
              <span className="flex items-center gap-2 pr-8">
                <Lang text={{ ko: "JOB 상세 검수", en: "Job review detail" }} />
                {detail && (
                  <>
                    <a
                      href={getMarketingJobSourceUrl(detail.job)}
                      target="_blank"
                      className="text-xs text-secondary-text font-normal line-clamp-1 flex-1"
                    >
                      {detail?.job
                        ? getMarketingJobSourceLabel(detail.job)
                        : selectedJobId || lang({ ko: "상세 정보를 불러오는 중입니다.", en: "Loading detail." })}
                    </a>
                    {getMarketingJobStoreManagerUrl(detail.job) ? (
                      <a
                        href={getMarketingJobStoreManagerUrl(detail.job)}
                        className="inline-flex min-h-11 items-center text-xs text-primary underline-offset-2 hover:underline"
                      >
                        <Lang text={{ ko: "Store 상품", en: "Store product" }} />
                      </a>
                    ) : null}
                  </>
                )}
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="mx-auto w-full max-w-6xl">
              {!selectedJobId ? (
                <div className={REVIEW_PANEL_EMPTY_CLASS}>
                  <Lang
                    text={{
                      ko: "JOB을 선택하면 상세 운영 패널이 열립니다.",
                      en: "Select a job to open the operator panel.",
                    }}
                  />
                </div>
              ) : detailLoading ? (
                <div className={REVIEW_PANEL_EMPTY_CLASS}>
                  <Lang text={{ ko: "job 상세를 불러오는 중입니다.", en: "Loading job detail." }} />
                </div>
              ) : !detail ? (
                <div className={REVIEW_PANEL_EMPTY_CLASS}>
                  <Lang text={{ ko: "상세 데이터를 불러오지 못했습니다.", en: "Failed to load detail." }} />
                </div>
              ) : (
                children
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
