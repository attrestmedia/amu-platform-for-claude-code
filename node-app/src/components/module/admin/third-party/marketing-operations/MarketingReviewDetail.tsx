import type { Dispatch, SetStateAction } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  Archive,
  BarChart3,
  Check,
  ExternalLink,
  Eye,
  RefreshCw,
  RotateCcw,
  Send,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "utils/common";
import { REVIEW_PANEL_CARD_CLASS, REVIEW_PANEL_SUBTLE_CLASS } from "./MarketingOpsConstants";
import { JobReviewDetailSheet, MarketingExternalUrlLine, showMarketingFailureDialog } from "./MarketingOpsComponents";
import { MarketingReviewChannelEditor } from "./MarketingReviewChannelEditor";
import { MarketingTemplateReference } from "./MarketingTemplateReference";
import type { MarketingTemplatePreviewState } from "./MarketingTemplateSheets";
import { getStrategyFitSignal, type StrategyFitGuideState } from "./MarketingStrategyFitDialogs";
import type {
  ChannelEditorState,
  MarketingChannelSummary,
  MarketingCredentialStatusMap,
  MarketingImagePreview,
  MarketingImageStudioTarget,
  MarketingJobDetail,
  MarketingJobListItem,
  MarketingTemplateOption,
  QueueCategoryComposerState,
} from "./MarketingOpsTypes";
import type { CardNewsDeck } from "types/card-news";
import {
  formatDate,
  getChannelLabel,
  getChannelPlatformUrl,
  getChannelStepStatus,
  getInitialEditor,
  getMarketingJobSourceLabel,
  getMarketingJobSourceKind,
  getMarketingJobSourceRevision,
  getMarketingJobStoreManagerUrl,
  getMarketingJobSourceTitle,
  getMarketingJobSourceUrl,
  getMarketingJobPerformanceUrl,
  getMarketingStepLabel,
  getMarketingValidationIssueLabel,
  getStatusClass,
  getStatusLabel,
  isArchivableJobStatus,
  isCancelableJobStatus,
  isMarketingFailureStatus,
  toSafeString,
  type NaverBlogCtaMode,
} from "./MarketingOpsUtils";
import { getChannelScheduledPublishAt, type PublishScheduleState } from "./MarketingReviewDomain";

type ChannelAction =
  | "save_draft"
  | "complete"
  | "skip"
  | "publish_member"
  | "mark_published"
  | "cancel_scheduled_publish";

type MarketingReviewDetailProps = {
  selectedJobId: string;
  detail: MarketingJobDetail | null;
  detailLoading: boolean;
  busyKey: string;
  isGlobalScope: boolean;
  categoryComposer: QueueCategoryComposerState;
  detailImageTemplateKey: string;
  detailContentTemplateKey: string;
  detailContentTemplate?: MarketingTemplateOption;
  detailImageTemplate?: MarketingTemplateOption;
  selectedContentTemplate?: MarketingTemplateOption;
  openReviewChannels: string[];
  editors: Record<string, ChannelEditorState>;
  detailCredentialStatus?: MarketingCredentialStatusMap;
  proofreadLoading: boolean;
  setSelectedJobId: (jobId: string) => void;
  setImageStudioTarget: (target: MarketingImageStudioTarget) => void;
  openImageAttachment: (target: MarketingImageStudioTarget, templateKey?: string) => void;
  refreshSourceImages: () => Promise<void>;
  openStrategyFitDialog: (kind: "marketing" | "advertising") => Promise<void>;
  runJobLifecycleAction: (action: "cancel" | "archive" | "cancel_and_archive") => Promise<void>;
  requestContentGeneration: (jobIds: string[], channels?: string[]) => Promise<void>;
  setTemplatePreview: (preview: MarketingTemplatePreviewState) => void;
  setOpenReviewChannels: (channels: string[]) => void;
  setStrategyFitGuide: (guide: StrategyFitGuideState) => void;
  openChannelProofread: (channel: MarketingChannelSummary) => Promise<void>;
  runRetry: (channel: MarketingChannelSummary) => Promise<void>;
  siteUrl: string;
  naverCopyCtaMode: NaverBlogCtaMode;
  setNaverCopyCtaMode: (mode: NaverBlogCtaMode) => void;
  connectLinkedInMemberProfile: () => void;
  jobs: MarketingJobListItem[];
  publishSchedules: Record<string, PublishScheduleState>;
  setPublishSchedules: Dispatch<SetStateAction<Record<string, PublishScheduleState>>>;
  applyRandomizedPublishTime: (channel: string, hour: string, preferredDate?: string) => void;
  applyChannelImages: (channel: MarketingChannelSummary, images: Array<{ url?: string }>) => void;
  removeChannelImages: (channel: MarketingChannelSummary, images: MarketingImagePreview[]) => Promise<void>;
  cardNewsDecks: CardNewsDeck[];
  cardNewsDecksLoaded: boolean;
  cardNewsDecksLoading: boolean;
  loadCardNewsDecks: () => Promise<void>;
  attachCardNewsDeck: (deckId: string) => Promise<void>;
  setEditorField: (channel: string, key: keyof ChannelEditorState, value: string) => void;
  runChannelAction: (
    channel: MarketingChannelSummary,
    action: ChannelAction,
    publishAtInput?: string,
    publishHourInput?: string,
    publishMinuteInput?: string,
  ) => Promise<void>;
};

export function MarketingReviewDetail({
  selectedJobId,
  detail,
  detailLoading,
  busyKey,
  isGlobalScope,
  categoryComposer,
  detailImageTemplateKey,
  detailContentTemplateKey,
  detailContentTemplate,
  detailImageTemplate,
  selectedContentTemplate,
  openReviewChannels,
  editors,
  detailCredentialStatus,
  proofreadLoading,
  setSelectedJobId,
  setImageStudioTarget,
  openImageAttachment,
  refreshSourceImages,
  openStrategyFitDialog,
  runJobLifecycleAction,
  requestContentGeneration,
  setTemplatePreview,
  setOpenReviewChannels,
  setStrategyFitGuide,
  openChannelProofread,
  runRetry,
  siteUrl,
  naverCopyCtaMode,
  setNaverCopyCtaMode,
  connectLinkedInMemberProfile,
  jobs,
  publishSchedules,
  setPublishSchedules,
  applyRandomizedPublishTime,
  applyChannelImages,
  removeChannelImages,
  cardNewsDecks,
  cardNewsDecksLoaded,
  cardNewsDecksLoading,
  loadCardNewsDecks,
  attachCardNewsDeck,
  setEditorField,
  runChannelAction,
}: MarketingReviewDetailProps) {
  return (
    <div className="space-y-4">
      <JobReviewDetailSheet
        open={!!selectedJobId}
        onOpenChange={(open) => {
          if (!open) setSelectedJobId("");
        }}
        selectedJobId={selectedJobId}
        detail={detail}
        detailLoading={detailLoading}
      >
        {detail ? (
          <div className="space-y-4">
            <Accordion type="single" collapsible className="flex flex-col gap-4">
              <AccordionItem value="detail-summary-header" className={REVIEW_PANEL_CARD_CLASS}>
                <AccordionTrigger className="items-start hover:no-underline">
                  <div className="flex flex-col items-start gap-2">
                    <div className="flex flex-wrap gap-1 text-xs text-muted-text">
                      <Badge variant="accent" size="xs" className="inline-flex gap-1">
                        {getMarketingStepLabel(toSafeString(detail.job.currentStepKey))}
                      </Badge>
                      <Badge
                        variant="outline"
                        size="xs"
                        className={cn(
                          "inline-flex gap-1",
                          getStatusClass(toSafeString(detail.job.status)),
                          "border-none",
                        )}
                      >
                        {getStatusLabel(toSafeString(detail.job.status))}
                      </Badge>
                      {isGlobalScope ? (
                        <Badge variant="outline" size="xs">
                          universeId: {toSafeString(detail.job.universeId) || "-"}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" size="xs">
                        Category: {toSafeString(detail.job.queueCategory) || "general"}
                      </Badge>
                      <Badge variant="outline" size="xs">
                        Priority: {toSafeString(detail.job.priority) || "normal"}
                      </Badge>
                    </div>

                    <div className="flex flex-col items-start text-left">
                      <h4 className="text-base font-semibold text-primary-text">
                        {getMarketingJobSourceLabel(detail.job)}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <MarketingExternalUrlLine url={getMarketingJobSourceUrl(detail.job)} />
                        {getMarketingJobStoreManagerUrl(detail.job) ? (
                          <a
                            href={getMarketingJobStoreManagerUrl(detail.job)}
                            className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                          >
                            <Lang text={{ ko: "Store 상품 열기", en: "Open Store product" }} />
                            <ExternalLink className="icon-xxs" aria-hidden="true" />
                          </a>
                        ) : null}
                        {getMarketingJobPerformanceUrl(detail.job) ? (
                          <a
                            href={getMarketingJobPerformanceUrl(detail.job)}
                            className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                          >
                            <Lang text={{ ko: "상품 성과 보기", en: "View product performance" }} />
                            <BarChart3 className="icon-xxs" aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                      {getMarketingJobSourceKind(detail.job) === "commerce_product" ? (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge variant="accent" size="xs">Store 상품 source</Badge>
                          {getMarketingJobSourceRevision(detail.job) ? (
                            <Badge variant="outline" size="xs">revision {getMarketingJobSourceRevision(detail.job)}</Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </AccordionTrigger>

                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setImageStudioTarget({})}
                    disabled={!!busyKey || !toSafeString(detail.job.universeId)}
                  >
                    <Wand2 className="icon-xxs" />
                    <span>{lang({ ko: "이미지 생성하기", en: "Generate image" })}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      openImageAttachment(
                        {},
                        detailImageTemplateKey || toSafeString(categoryComposer.defaultImageTemplateKey),
                      )
                    }
                    disabled={!!busyKey || !toSafeString(detail.job.universeId)}
                  >
                    <Upload className="icon-xxs" />
                    <span>{lang({ ko: "이미지 가져오기", en: "Import image" })}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void refreshSourceImages()}
                    disabled={busyKey === "job:refresh_source_images"}
                  >
                    <RefreshCw
                      className={cn(busyKey === "job:refresh_source_images" ? "animate-spin" : "", "icon-xxs")}
                    />
                    <span>{lang({ ko: "새로고침", en: "Refresh" })}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void openStrategyFitDialog("marketing")}
                    disabled={!!busyKey}
                  >
                    <Check className="icon-xxs" />
                    <Lang text={{ ko: "마케팅 적합도 체크", en: "Check marketing fit" }} />
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void openStrategyFitDialog("advertising")}
                    disabled={!!busyKey}
                  >
                    <BarChart3 className="icon-xxs" />
                    <Lang text={{ ko: "광고 적합도 체크", en: "Check ad fit" }} />
                  </Button>

                  {isArchivableJobStatus(toSafeString(detail.job.status)) && !detail.job.archivedAt ? (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => void runJobLifecycleAction("archive")}
                      disabled={busyKey === "job:archive"}
                    >
                      <Archive className="icon-xxs" />
                      <span>{lang({ ko: "목록에서 숨김", en: "Hide from list" })}</span>
                    </Button>
                  ) : null}
                  {isCancelableJobStatus(toSafeString(detail.job.status)) && !detail.job.archivedAt ? (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => void runJobLifecycleAction("cancel_and_archive")}
                      disabled={busyKey === "job:cancel_and_archive"}
                    >
                      <Archive className="icon-xxs" />
                      <span>{lang({ ko: "취소 후 숨김", en: "Cancel and hide" })}</span>
                    </Button>
                  ) : null}
                  <Button size="xs" onClick={() => void requestContentGeneration([selectedJobId])} disabled={!!busyKey}>
                    <Send className="icon-xxs" />
                    <span>{lang({ ko: "콘텐츠 일괄 생성", en: "Generate all content" })}</span>
                  </Button>
                  {isCancelableJobStatus(toSafeString(detail.job.status)) && !detail.job.archivedAt ? (
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => void runJobLifecycleAction("cancel")}
                      disabled={busyKey === "job:cancel"}
                    >
                      <X className="icon-xxs" />
                      <span>{lang({ ko: "job 취소", en: "Cancel job" })}</span>
                    </Button>
                  ) : null}
                </div>

                <AccordionContent className="pb-0">
                  <div className="mt-4">
                    <p className="text-xs text-muted-text">
                      {lang({ ko: "생성일", en: "Created" })}: {formatDate(detail.job.createdAt)}
                    </p>
                    {detail.job.scheduledAt ? (
                      <p className="mt-1 text-xs text-muted-text">
                        {lang({ ko: "예약 시작", en: "Scheduled start" })}: {formatDate(detail.job.scheduledAt)}
                      </p>
                    ) : null}
                    {detail.job.request?.generationConfig ? (
                      <div className={cn(REVIEW_PANEL_SUBTLE_CLASS, "mt-2")}>
                        <p className="font-medium text-primary-text">
                          <Lang text={{ ko: "생성 설정", en: "Generation settings" }} />
                        </p>
                        <p>
                          model: {toSafeString(detail.job.request.generationConfig.modelProvider) || "-"} /{" "}
                          {toSafeString(detail.job.request.generationConfig.modelName) || "-"}
                        </p>
                        <p>
                          contentTemplateKey:{" "}
                          {toSafeString(detail.job.request.generationConfig.contentTemplateKey) || "-"}
                        </p>
                        <p>
                          imageTemplateKey: {toSafeString(detail.job.request.generationConfig.imageTemplateKey) || "-"}
                        </p>
                        <p>
                          reviewMode:{" "}
                          {toSafeString(detail.job.request.generationConfig.reviewMode) || "review_required"}
                        </p>
                        {toSafeString(detail.job.request.generationConfig.instructionText) ? (
                          <p className="mt-1 line-clamp-2">
                            {lang({ ko: "지침", en: "Instruction" })}:{" "}
                            {toSafeString(detail.job.request.generationConfig.instructionText)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-2">
                      <MarketingTemplateReference
                        type="content"
                        label={lang({
                          ko: "이 채널 생성 템플릿",
                          en: "Channel generation template",
                        })}
                        templateKey={categoryComposer.defaultContentTemplateKey}
                        template={selectedContentTemplate}
                        setTemplatePreview={setTemplatePreview}
                      />
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <MarketingTemplateReference
                        type="content"
                        label={lang({
                          ko: "마지막 요청 콘텐츠 템플릿",
                          en: "Last requested content template",
                        })}
                        templateKey={detailContentTemplateKey}
                        template={detailContentTemplate}
                        setTemplatePreview={setTemplatePreview}
                      />
                      <MarketingTemplateReference
                        type="image"
                        label={lang({
                          ko: "마지막 요청 이미지 템플릿",
                          en: "Last requested image template",
                        })}
                        templateKey={detailImageTemplateKey}
                        template={detailImageTemplate}
                        setTemplatePreview={setTemplatePreview}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Accordion
              type="multiple"
              value={openReviewChannels}
              onValueChange={setOpenReviewChannels}
              className="space-y-4"
            >
              {(detail.channels || []).map((channel) => {
                const editor = editors[channel.channel] || getInitialEditor(channel);
                const stepStatus = getChannelStepStatus(channel);
                const channelPlatformUrl = getChannelPlatformUrl(channel.channel, detail.job, detailCredentialStatus);
                const validationSummary = toSafeString(channel.validationAsset?.content?.summary);
                const validationIssues = Array.isArray(channel.validationAsset?.content?.issues)
                  ? channel.validationAsset.content.issues
                  : [];
                const validationIssueMessages = Array.from(
                  new Set(validationIssues.map(getMarketingValidationIssueLabel)),
                );
                const marketingFitSignal = getStrategyFitSignal(channel.validationAsset?.content, "marketing");
                const adFitSignal = getStrategyFitSignal(channel.validationAsset?.content, "advertising");

                return (
                  <AccordionItem
                    key={channel.channel}
                    value={toSafeString(channel.channel)}
                    className={cn(REVIEW_PANEL_CARD_CLASS, "overflow-hidden p-0")}
                  >
                    <div className="flex flex-col items-start border-b border-border px-4 py-4 [&>h3]:w-full">
                      <AccordionTrigger className="min-w-0 flex-1 py-0 text-left mb-2 hover:no-underline [&>svg]:ml-3">
                        <div className="flex items center gap-2 min-w-0 ">
                          <h5 className="font-semibold text-primary-text">{getChannelLabel(channel.channel)}</h5>
                          <p className="flex-1 text-sm text-secondary-text truncate">
                            {validationSummary ||
                              lang({
                                ko: "검증 요약이 아직 없습니다.",
                                en: "No validation summary yet.",
                              })}
                          </p>
                        </div>
                      </AccordionTrigger>

                      <div className="flex items-center flex-wrap gap-1.5 md:justify-end">
                        <Badge
                          size="xs"
                          className={cn("rounded-full px-2 py-1 text-xs font-medium", getStatusClass(stepStatus))}
                          onClick={
                            isMarketingFailureStatus(stepStatus)
                              ? () =>
                                  showMarketingFailureDialog(
                                    channel.channel,
                                    channel.publishStep,
                                    channel.reviewStep,
                                    channel.latestPublishLog,
                                  )
                              : undefined
                          }
                          aria-label={
                            isMarketingFailureStatus(stepStatus)
                              ? lang({
                                  ko: `${getChannelLabel(channel.channel)} 실패 원인 보기`,
                                  en: `View ${getChannelLabel(channel.channel)} failure reason`,
                                })
                              : undefined
                          }
                          title={
                            isMarketingFailureStatus(stepStatus)
                              ? lang({ ko: "실패 원인 보기", en: "View failure reason" })
                              : undefined
                          }
                        >
                          {getStatusLabel(stepStatus, channel.channel)}
                        </Badge>
                        {marketingFitSignal ? (
                          <Badge
                            size="xs"
                            className={cn(
                              "rounded-full px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              marketingFitSignal.className,
                            )}
                            onClick={() =>
                              setStrategyFitGuide({ channel: channel.channel, result: marketingFitSignal })
                            }
                            aria-label={lang({
                              ko: `${getChannelLabel(channel.channel)} 마케팅 적합도 ${marketingFitSignal.score}점 상세 가이드 보기`,
                              en: `View ${getChannelLabel(channel.channel)} marketing fit score ${marketingFitSignal.score} details`,
                            })}
                            title={lang({
                              ko: "점수 근거와 보완 가이드 보기",
                              en: "View score details and guidance",
                            })}
                          >
                            {marketingFitSignal.label} {marketingFitSignal.score}
                          </Badge>
                        ) : null}
                        {adFitSignal ? (
                          <Badge
                            size="xs"
                            className={cn(
                              "rounded-full px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              adFitSignal.className,
                            )}
                            onClick={() => setStrategyFitGuide({ channel: channel.channel, result: adFitSignal })}
                            aria-label={lang({
                              ko: `${getChannelLabel(channel.channel)} 광고 적합도 ${adFitSignal.score}점 상세 가이드 보기`,
                              en: `View ${getChannelLabel(channel.channel)} advertising fit score ${adFitSignal.score} details`,
                            })}
                            title={lang({
                              ko: "점수 근거와 보완 가이드 보기",
                              en: "View score details and guidance",
                            })}
                          >
                            {adFitSignal.label} {adFitSignal.score}
                          </Badge>
                        ) : null}
                        {!marketingFitSignal && !adFitSignal ? (
                          <Badge variant="outline" size="xs">
                            <Lang text={{ ko: "적합도 미검사", en: "Fit not checked" }} />
                          </Badge>
                        ) : null}
                        {channelPlatformUrl ? (
                          <Button
                            asChild
                            variant="outline"
                            size="xs"
                            aria-label={lang({
                              ko: `${getChannelLabel(channel.channel)} 운영 플랫폼 새창 열기`,
                              en: `Open ${getChannelLabel(channel.channel)} platform in new window`,
                            })}
                          >
                            <a
                              href={channelPlatformUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1"
                            >
                              <ExternalLink className="icon-xxs" aria-hidden="true" />
                              <span>{lang({ ko: "채널 바로가기", en: "Go to channel" })}</span>
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => void openChannelProofread(channel)}
                          disabled={!!busyKey || proofreadLoading}
                        >
                          <Eye className="icon-xxs" />
                          <span>{lang({ ko: "오탈자 검수", en: "Proofread" })}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => void requestContentGeneration([selectedJobId], [channel.channel])}
                          disabled={!!busyKey}
                        >
                          <Send className="icon-xxs" />
                          <span>{lang({ ko: "콘텐츠 생성하기", en: "Generate content" })}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setImageStudioTarget({ channel: channel.channel })}
                          disabled={!!busyKey || !toSafeString(detail.job.universeId)}
                        >
                          <Wand2 className="icon-xxs" />
                          <span>{lang({ ko: "이미지 생성하기", en: "Generate image" })}</span>
                        </Button>
                        {(toSafeString(detail.job.status) === "partial" ||
                          toSafeString(detail.job.status) === "failed") && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => void runRetry(channel)}
                            disabled={busyKey === `${channel.channel}:retry`}
                          >
                            <RotateCcw className="icon-xxs" />
                            <span>{lang({ ko: "다시 처리하기", en: "Retry" })}</span>
                          </Button>
                        )}
                        {getChannelScheduledPublishAt(channel) && (
                          <span className="text-xs text-secondary-text">
                            {formatDate(getChannelScheduledPublishAt(channel))}
                          </span>
                        )}
                      </div>
                    </div>

                    <AccordionContent className="flex flex-col gap-2 px-4 pb-4 pt-4">
                      <MarketingReviewChannelEditor
                        channel={channel}
                        editor={editor}
                        validationIssueMessages={validationIssueMessages}
                        busyKey={busyKey}
                        siteUrl={siteUrl}
                        sourceTitle={getMarketingJobSourceTitle(detail.job)}
                        naverCopyCtaMode={naverCopyCtaMode}
                        setNaverCopyCtaMode={setNaverCopyCtaMode}
                        connectLinkedInMemberProfile={connectLinkedInMemberProfile}
                        jobs={jobs}
                        selectedJobId={selectedJobId}
                        publishSchedules={publishSchedules}
                        setPublishSchedules={setPublishSchedules}
                        applyRandomizedPublishTime={applyRandomizedPublishTime}
                        applyChannelImages={applyChannelImages}
                        removeChannelImages={removeChannelImages}
                        cardNewsDecks={cardNewsDecks}
                        cardNewsDecksLoaded={cardNewsDecksLoaded}
                        cardNewsDecksLoading={cardNewsDecksLoading}
                        loadCardNewsDecks={loadCardNewsDecks}
                        attachCardNewsDeck={attachCardNewsDeck}
                        setEditorField={setEditorField}
                        runChannelAction={runChannelAction}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            <div className={REVIEW_PANEL_CARD_CLASS}>
              <div className="mb-3 flex items-center justify-between">
                <h5 className="font-semibold text-primary-text">
                  <Lang text={{ ko: "최근 발행 로그", en: "Recent publish logs" }} />
                </h5>
                <span className="text-xs text-muted-text">{Math.min(detail.publishLogs?.length || 0, 8)}</span>
              </div>
              <div className="space-y-2">
                {(detail.publishLogs || []).slice(0, 8).map((log) => (
                  <div
                    key={toSafeString(log.publishLogId)}
                    className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm text-secondary-text"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-primary-text">
                        {getChannelLabel(toSafeString(log.channel))}
                      </span>
                      <Badge
                        size="xs"
                        className={cn(
                          "rounded-full px-2 py-1 text-xxs font-medium",
                          getStatusClass(toSafeString(log.status)),
                        )}
                        onClick={
                          isMarketingFailureStatus(toSafeString(log.status))
                            ? () => showMarketingFailureDialog(toSafeString(log.channel), log)
                            : undefined
                        }
                        aria-label={
                          isMarketingFailureStatus(toSafeString(log.status))
                            ? lang({ ko: "발행 실패 원인 보기", en: "View publish failure reason" })
                            : undefined
                        }
                        title={
                          isMarketingFailureStatus(toSafeString(log.status))
                            ? lang({ ko: "실패 원인 보기", en: "View failure reason" })
                            : undefined
                        }
                      >
                        {getStatusLabel(toSafeString(log.status))}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-text">
                      {formatDate(toSafeString(log.completedAt || log.createdAt))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </JobReviewDetailSheet>
    </div>
  );
}
