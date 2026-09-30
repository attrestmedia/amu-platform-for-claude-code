"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger, TooltipBasic } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { NaverKeywordStrategyPanel } from "./NaverKeywordStrategyPanel";
import fetchClient from "libs/api/fetchClient";
import { TEXT_MODEL_MAP } from "consts/ai";
import { cn } from "utils/common";
import { BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { toUnknownRecord } from "utils/common/typeUtils";
import { EMPTY_GENERATION_CONFIRM, MARKETING_CONTENT_QUEUE_API } from "./marketing-operations/MarketingOpsConstants";
import { SocialPerformancePanel } from "./marketing-operations/SocialPerformancePanel";
import { AdsOperationsPanel } from "./marketing-operations/AdsOperationsPanel";
import { MarketingKeywordStrategyPanel } from "./marketing-operations/MarketingKeywordStrategyPanel";
import { GaConfigurationPanel } from "./marketing-operations/GaConfigurationPanel";
import { GaPerformancePanel } from "./marketing-operations/GaPerformancePanel";
import { PromoCreativePanel } from "./marketing-operations/PromoCreativePanel";
import { MarketingImageAttachDialog } from "./marketing-operations/MarketingImageAttachDialog";
import { MarketingGenerationConfirmDialog } from "./marketing-operations/MarketingGenerationConfirmDialog";
import { MarketingGenerationSettingsPanel } from "./marketing-operations/MarketingGenerationSettingsPanel";
import { MarketingQueueTab } from "./marketing-operations/MarketingQueueTab";
import { MarketingSystemTab } from "./marketing-operations/MarketingSystemTab";
import { NewsletterCampaignPanel } from "./marketing-operations/NewsletterCampaignPanel";
import { NewsletterPerformancePanel } from "./marketing-operations/NewsletterPerformancePanel";
import { MarketingGrowthMissionPanel } from "./marketing-operations/MarketingGrowthMissionPanel";
import { MarketingReviewList } from "./marketing-operations/MarketingReviewList";
import { MarketingReviewDetail } from "./marketing-operations/MarketingReviewDetail";
import {
  INITIAL_PROOFREAD_DIALOG,
  MarketingProofreadDialog,
  type ProofreadDialogState,
} from "./marketing-operations/MarketingProofreadDialog";
import {
  INITIAL_STRATEGY_FIT_DIALOG,
  MarketingStrategyFitDialog,
  MarketingStrategyFitGuideDialog,
  type StrategyFitDialogState,
  type StrategyFitGuideState,
} from "./marketing-operations/MarketingStrategyFitDialogs";
import {
  MarketingImageStudioSheet,
  MarketingTemplatePreviewSheet,
} from "./marketing-operations/MarketingTemplateSheets";
import { useMarketingImageAttachment } from "./marketing-operations/useMarketingImageAttachment";
import type {
  MarketingGenerationConfirmState,
  MarketingJobDetail,
  MarketingUniverseOption,
} from "./marketing-operations/MarketingOpsTypes";
import {
  buildScopeParams,
  getMarketingJobSourceSearchQuery,
  getMarketingOperatorErrorMessage,
  type NaverBlogCtaMode,
  toSafeString,
} from "./marketing-operations/MarketingOpsUtils";
import {
  DEFAULT_PUBLISH_SCHEDULE_STATE,
  REVIEW_JOB_STATUS_FILTER_OPTIONS,
  fromReviewFilterSelectValue,
  toLocalDateInputValue,
  type PublishScheduleState,
} from "./marketing-operations/MarketingReviewDomain";
import { useMarketingSystemController } from "./marketing-operations/useMarketingSystemController";
import { useMarketingQueueController } from "./marketing-operations/useMarketingQueueController";
import { useMarketingReviewQueryController } from "./marketing-operations/useMarketingReviewQueryController";
import { useMarketingReviewImageActions } from "./marketing-operations/useMarketingReviewImageActions";
import { useMarketingJobActions } from "./marketing-operations/useMarketingJobActions";
import { useMarketingChannelActions } from "./marketing-operations/useMarketingChannelActions";

export default function MarketingOperationsPanel({
  universeId,
  availableUniverses = [],
  isGlobalAdmin = false,
  studioPresentation = "sheet",
  activeTab: controlledActiveTab,
  initialJobId = "",
  initialCampaignId = "",
  onActiveTabChange,
}: {
  universeId?: string;
  availableUniverses?: MarketingUniverseOption[];
  isGlobalAdmin?: boolean;
  studioPresentation?: "sheet" | "embedded";
  activeTab?: string;
  initialJobId?: string;
  initialCampaignId?: string;
  onActiveTabChange?: (tab: string) => void;
}) {
  const scopedUniverseId = toSafeString(universeId);
  const isGlobalScope = !scopedUniverseId;
  const isZeroUniverseGlobalMode = isGlobalScope && availableUniverses.length === 0;
  const defaultAvailableUniverseId = availableUniverses[0]?.id || "";
  const availableUniverseKey = availableUniverses.map((universe) => universe.id).join("|");
  const [publishSchedules, setPublishSchedules] = useState<Record<string, PublishScheduleState>>({});
  const [naverCopyCtaMode, setNaverCopyCtaMode] = useState<NaverBlogCtaMode>("text");
  const [busyKey, setBusyKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [generationConfirm, setGenerationConfirm] = useState<MarketingGenerationConfirmState>(EMPTY_GENERATION_CONFIRM);
  const [proofreadDialog, setProofreadDialog] = useState<ProofreadDialogState>(INITIAL_PROOFREAD_DIALOG);
  const [strategyFitDialog, setStrategyFitDialog] = useState<StrategyFitDialogState>(INITIAL_STRATEGY_FIT_DIALOG);
  const [strategyFitGuide, setStrategyFitGuide] = useState<StrategyFitGuideState | null>(null);
  const [internalActiveTab, setInternalActiveTab] = useState("queue");
  const activeTab = controlledActiveTab || internalActiveTab;
  const changeActiveTab = (tab: string) => {
    setInternalActiveTab(tab);
    onActiveTabChange?.(tab);
  };
  const {
    queueComposer,
    categoryComposer,
    contentTemplateOptions,
    imageTemplateOptions,
    categoryConfigs,
    categoryLoading,
    categoryScopeUniverseId,
    selectedCategoryPolicyValue,
    selectedContentTemplate,
    selectedImageTemplate,
    selectedContentChannels,
    modelOptions,
    isLocalAgentMode,
    templatePreview,
    setTemplatePreview,
    setQueueComposerField,
    toggleQueueChannel,
    setCategoryComposerField,
    selectCategoryPolicy,
    loadCategoryConfigs,
    enqueueTargets,
    saveCategoryConfig,
  } = useMarketingQueueController({
    scopedUniverseId,
    defaultAvailableUniverseId,
    availableUniverseKey,
    isZeroUniverseGlobalMode,
    setBusyKey,
    setErrorMessage,
    onRefresh: refreshAll,
    onEnqueued: () => clearWorkerResult(),
  });
  const {
    jobs,
    reviewJobPagination,
    selectedJobId,
    selectedJobIds,
    selectedQueueCategoryFilter,
    reviewJobFilters,
    bulkQueueCategory,
    detail,
    editors,
    openReviewChannels,
    jobsLoading,
    detailLoading,
    detailCredentialStatus,
    categoryOptions,
    allVisibleJobsSelected,
    selectedActionJobIds,
    selectedArchivableJobIds,
    hasReviewJobFilters,
    setReviewJobPage,
    setSelectedJobId,
    setSelectedJobIds,
    setSelectedQueueCategoryFilter,
    setBulkQueueCategory,
    setEditors,
    setOpenReviewChannels,
    setEditorField,
    toggleJobSelection,
    toggleAllVisibleJobs,
    setReviewJobFilterField,
    resetReviewJobFilters,
    clearDetail,
    loadJobs,
    loadJobDetail,
  } = useMarketingReviewQueryController({
    scopedUniverseId,
    categoryConfigs,
    queueCategory: queueComposer.queueCategory,
    initialJobId,
    setErrorMessage,
  });
  const imageAttachment = useMarketingImageAttachment(
    imageTemplateOptions,
    scopedUniverseId || toSafeString(detail?.job?.universeId),
  );
  const {
    imageStudioTarget,
    setImageStudioTarget,
    refreshSourceImages,
    attachGeneratedImages,
    attachManualImage,
    applyChannelImages,
    removeChannelImages,
    cardNewsDecks,
    cardNewsDecksLoaded,
    cardNewsDecksLoading,
    loadCardNewsDecks,
    attachCardNewsDeck,
  } = useMarketingReviewImageActions({
    scopedUniverseId,
    selectedJobId,
    detail,
    jobs,
    editors,
    setEditors,
    setEditorField,
    imageAttachment,
    setBusyKey,
    onRefresh: refreshAll,
  });
  const {
    systemStatus,
    statusLoading,
    workerResult,
    loadSystemStatus,
    runWorkerPoll,
    runRecovery,
    scheduleScheduledOnlyWorkerPoll,
    clearWorkerResult,
  } = useMarketingSystemController({
    scopedUniverseId,
    workerId: queueComposer.workerId,
    queueCategory: selectedQueueCategoryFilter,
    selectedJobId,
    setBusyKey,
    setErrorMessage,
    onRefresh: refreshAll,
  });
  const { updateJobCategory, updateSelectedJobCategories, runRetry, runJobLifecycleAction, archiveSelectedJobs } =
    useMarketingJobActions({
      scopedUniverseId,
      selectedJobId,
      selectedJobIds,
      selectedActionJobIds,
      selectedArchivableJobIds,
      bulkQueueCategory,
      defaultQueueCategory: queueComposer.queueCategory,
      setBusyKey,
      setSelectedJobId,
      setSelectedJobIds,
      clearDetail,
      loadSystemStatus,
      loadJobs,
      onRefresh: refreshAll,
    });
  const { connectLinkedInMemberProfile, runChannelAction, openChannelProofread, requestChannelProofreadCorrection } =
    useMarketingChannelActions({
      scopedUniverseId,
      selectedJobId,
      detail,
      editors,
      jobs,
      siteUrl: queueComposer.siteUrl,
      proofreadDialog,
      setProofreadDialog,
      setBusyKey,
      scheduleScheduledOnlyWorkerPoll,
      onRefresh: refreshAll,
    });
  const proofreadModelOptions = ((TEXT_MODEL_MAP as Record<string, readonly string[]>)[proofreadDialog.modelProvider] ||
    []) as readonly string[];
  const strategyFitModelOptions = ((TEXT_MODEL_MAP as Record<string, readonly string[]>)[
    strategyFitDialog.modelProvider
  ] || []) as readonly string[];
  const blockMarketingEditorImagePaste = useCallback((event: ReactClipboardEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const editableTarget = target.closest(
      'input:not([type="file"]), textarea, [contenteditable="true"], [role="textbox"]',
    );
    if (!editableTarget) return;

    const hasImageFile =
      Array.from(event.clipboardData.items).some((item) => item.kind === "file" && item.type.startsWith("image/")) ||
      Array.from(event.clipboardData.files).some((file) => file.type.startsWith("image/"));
    const clipboardHtml = event.clipboardData.types.includes("text/html")
      ? event.clipboardData.getData("text/html")
      : "";
    if (!hasImageFile && !/<img(?:\s|>)/i.test(clipboardHtml)) return;

    event.preventDefault();
    event.stopPropagation();
    toast.info(
      lang({
        ko: "이미지는 소셜 채널에 직접 붙여넣으세요.",
        en: "Paste images directly into the social channel editor.",
      }),
    );
  }, []);

  const detailContentTemplateKey = toSafeString(detail?.job?.request?.generationConfig?.contentTemplateKey);
  const detailUniverseId = toSafeString(detail?.job?.universeId);
  const detailImageTemplateKey = toSafeString(detail?.job?.request?.generationConfig?.imageTemplateKey);
  const detailContentTemplate = contentTemplateOptions.find(
    (item) => toSafeString(item.key) === detailContentTemplateKey,
  );
  const detailImageTemplate = imageTemplateOptions.find((item) => toSafeString(item.key) === detailImageTemplateKey);

  const fetchJobDetailForWarning = async (jobId: string) => {
    if (detail?.job?.jobId === jobId) return detail;
    const response = await fetchClient.get<{ data?: MarketingJobDetail }>(`${MARKETING_CONTENT_QUEUE_API}/${jobId}`, {
      params: buildScopeParams(scopedUniverseId),
    });
    return response.data?.data || null;
  };

  const getGeneratedChannelWarnings = (jobDetail: MarketingJobDetail | null, channels?: string[]) => {
    const channelSet = channels?.length ? new Set(channels.map((channel) => toSafeString(channel))) : null;
    return (jobDetail?.channels || []).filter((channel) => {
      if (channelSet && !channelSet.has(toSafeString(channel.channel))) return false;
      const generatedImages = (channel.imagePreviews || []).filter((image) => {
        const source = toSafeString(image.source);
        return source === "channel_draft" || source === "channel_image";
      });
      return Boolean(channel.draftAsset || channel.validationAsset || channel.receiptAsset || generatedImages.length);
    });
  };

  const getGenerationOverwriteSummary = async (jobIds: string[], channels?: string[]) => {
    const details = await Promise.all(jobIds.map((jobId) => fetchJobDetailForWarning(jobId).catch(() => null)));
    const warnings = details.flatMap((item) => getGeneratedChannelWarnings(item, channels));
    const imageCount = warnings.reduce(
      (sum, channel) =>
        sum +
        (channel.imagePreviews || []).filter((image) => {
          const source = toSafeString(image.source);
          return source === "channel_draft" || source === "channel_image";
        }).length,
      0,
    );
    return { warningCount: warnings.length, imageCount };
  };

  useEffect(
    function clearWorkerResultOnScopeChange() {
      clearWorkerResult();
    },
    [scopedUniverseId, availableUniverseKey, clearWorkerResult],
  );

  useEffect(
    function resetPublishSchedulesOnSelectedJobChange() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPublishSchedules({});
    },
    [selectedJobId],
  );

  const applyRandomizedPublishTime = (channel: string, hour: string, preferredDate = "") => {
    const schedule = publishSchedules[channel] || DEFAULT_PUBLISH_SCHEDULE_STATE;
    const normalizedHour = hour.padStart(2, "0");
    const recommendedDate = jobs
      .find((job) => job.jobId === selectedJobId)
      ?.recommendedUploadSchedules?.find((item) => item.channel === channel)?.date;
    const now = new Date();
    let date = preferredDate || schedule.publishAt.slice(0, 10) || recommendedDate || toLocalDateInputValue(now);
    const randomValues = new Uint32Array(1);
    window.crypto.getRandomValues(randomValues);
    const minute = String(10 + (randomValues[0] % 21)).padStart(2, "0");
    let publishAt = `${date}T${normalizedHour}:${minute}`;

    if (new Date(publishAt).getTime() <= now.getTime()) {
      const nextDate = new Date(now.getTime());
      nextDate.setDate(nextDate.getDate() + 1);
      date = toLocalDateInputValue(nextDate);
      publishAt = `${date}T${normalizedHour}:${minute}`;
    }

    setPublishSchedules((prev) => ({
      ...prev,
      [channel]: {
        ...(prev[channel] || DEFAULT_PUBLISH_SCHEDULE_STATE),
        mode: "scheduled",
        publishAt,
        publishHour: preferredDate ? hour : "",
      },
    }));
  };

  const requestContentGeneration = async (
    jobIds: string[],
    channels?: string[],
    opts?: { confirmed?: boolean; confirmCurrentList?: boolean },
  ) => {
    const targetJobIds = Array.from(new Set(jobIds.map((jobId) => toSafeString(jobId)).filter(Boolean)));
    if (targetJobIds.length === 0) {
      toast.error(lang({ ko: "콘텐츠를 생성할 job을 선택해주세요.", en: "Select jobs to generate content." }));
      return;
    }

    if (!opts?.confirmed) {
      if (opts?.confirmCurrentList) {
        setGenerationConfirm({
          open: true,
          jobIds: targetJobIds,
          channels,
          mode: "current_list",
          warningCount: 0,
          imageCount: 0,
        });
        return;
      }

      try {
        setBusyKey(`jobs:generation-check:${channels?.join(",") || "all"}`);
        const summary = await getGenerationOverwriteSummary(targetJobIds, channels);
        if (summary.warningCount > 0) {
          setGenerationConfirm({
            open: true,
            jobIds: targetJobIds,
            channels,
            mode: "existing",
            warningCount: summary.warningCount,
            imageCount: summary.imageCount,
          });
          return;
        }
      } catch (error) {
        toast.error(
          getMarketingOperatorErrorMessage(
            error,
            lang({
              ko: "기존 생성 콘텐츠 확인에 실패했습니다.",
              en: "Failed to check existing generated content.",
            }),
          ),
        );
        return;
      } finally {
        setBusyKey("");
      }
    }

    try {
      setBusyKey(`jobs:generation:${channels?.join(",") || "all"}`);
      for (const jobId of targetJobIds) {
        await fetchClient.patch(`${MARKETING_CONTENT_QUEUE_API}/${jobId}`, {
          ...buildScopeParams(scopedUniverseId),
          action: "request_generation",
          channels: channels?.length ? channels : selectedContentChannels,
          queueCategory: bulkQueueCategory || undefined,
          priority: queueComposer.priority,
          // 비어 있을 경우 호출 시점의 admin-ui 식별자를 사용 (impure 호출 의도)
          // eslint-disable-next-line react-hooks/purity
          workerId: toSafeString(queueComposer.workerId) || `admin-ui-${Date.now()}`,
          runNow: queueComposer.generationMode !== "local_agent",
          reason: channels?.length ? "operator_channel_generation" : "operator_bulk_generation",
          generationConfig: {
            generationMode: queueComposer.generationMode,
            modelProvider: queueComposer.modelProvider,
            modelName: queueComposer.modelName,
            instructionText: queueComposer.instructionText,
            contentTemplateKey: categoryComposer.defaultContentTemplateKey,
            imageTemplateKey: categoryComposer.defaultImageTemplateKey,
            reviewMode: queueComposer.reviewMode,
          },
        });
      }
      toast.success(
        queueComposer.generationMode === "local_agent"
          ? lang({
              ko: `${targetJobIds.length}개 job을 로컬 에이전트 생성 대기열로 보냈습니다.`,
              en: "Selected jobs queued for local agent generation.",
            })
          : lang({
              ko: `${targetJobIds.length}개 job의 콘텐츠 생성을 요청했습니다.`,
              en: "Content generation requested for selected jobs.",
            }),
      );
      await refreshAll(targetJobIds[0]);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "콘텐츠 생성 요청에 실패했습니다.", en: "Failed to request content generation." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const confirmContentGeneration = () => {
    const next = generationConfirm;
    setGenerationConfirm(EMPTY_GENERATION_CONFIRM);
    void requestContentGeneration(next.jobIds, next.channels, { confirmed: true });
  };

  async function refreshAll(jobId?: string) {
    const nextJobId = jobId || selectedJobId;
    await Promise.all([loadSystemStatus(), loadJobs(nextJobId)]);
    if (nextJobId) {
      await loadJobDetail(nextJobId);
    }
  }

  const openStrategyFitDialog = async (kind: "marketing" | "advertising") => {
    if (!selectedJobId) return;
    setStrategyFitDialog({ ...INITIAL_STRATEGY_FIT_DIALOG, open: true, kind, loading: true });
    try {
      const response = await fetchClient.get(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/fit`);
      const data = toUnknownRecord(response.data?.data);
      const context = toUnknownRecord(data[kind]);
      setStrategyFitDialog((prev) => ({
        ...prev,
        loading: false,
        ready: context.ready === true,
        version: Number(context.version || 0),
        updatedAt: toSafeString(context.updatedAt),
      }));
    } catch (error) {
      setStrategyFitDialog(INITIAL_STRATEGY_FIT_DIALOG);
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "적합도 전략 정보를 불러오지 못했습니다.", en: "Failed to load fit strategy." }),
        ),
      );
    }
  };

  const runStrategyFit = async () => {
    if (!selectedJobId || !strategyFitDialog.ready || !strategyFitDialog.agreed) return;
    setStrategyFitDialog((prev) => ({ ...prev, loading: true }));
    setBusyKey(`job:strategy-fit:${strategyFitDialog.kind}`);
    try {
      const response = await fetchClient.post(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/fit`, {
        universeId: detailUniverseId,
        kind: strategyFitDialog.kind,
        modelProvider: strategyFitDialog.modelProvider,
        modelName: strategyFitDialog.modelName,
      });
      const data = toUnknownRecord(response.data?.data);
      const resultCount = Array.isArray(data.results) ? data.results.length : 0;
      const coins = Number(data.coins || 0);
      toast.success(
        lang({
          ko: `${resultCount}개 콘텐츠 적합도를 검사했습니다.${coins > 0 ? ` ${coins}코인이 차감되었습니다.` : ""}`,
          en: `Checked ${resultCount} content item(s).${coins > 0 ? ` ${coins} coins charged.` : ""}`,
        }),
      );
      setStrategyFitDialog(INITIAL_STRATEGY_FIT_DIALOG);
      await refreshAll(selectedJobId);
    } catch (error) {
      setStrategyFitDialog((prev) => ({ ...prev, loading: false }));
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "AI 적합도 검사에 실패했습니다.", en: "AI fit check failed." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const goToStrategyRegistration = () => {
    setStrategyFitDialog(INITIAL_STRATEGY_FIT_DIALOG);
    setSelectedJobId("");
    changeActiveTab(strategyFitDialog.kind === "marketing" ? "keyword" : "ads");
  };

  return (
    <section
      className="rounded-2xl border border-border bg-surface p-4 text-primary-text"
      onPasteCapture={blockMarketingEditorImagePaste}
    >
      <header className="mb-5 flex items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-text">
            amu · marketing-ops
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[18px] font-semibold tracking-tight text-primary-text">
              <Lang text={{ ko: "마케팅 운영 패널", en: "Marketing Operations Panel" }} />
            </h3>
            <Badge variant="outlineMuted" size="xs">
              {isGlobalScope ? "Global · Admin" : "Universe · Sdmin"}
            </Badge>
            <TooltipBasic triggerClassName="w-auto" autoClose>
              <Lang
                text={{
                  ko: isGlobalScope
                    ? "전체 유니버스의 queue, worker, 반자동 draft 검수 현황을 통합 운영하고, 신규 queue 등록 시에만 대상 유니버스를 지정합니다."
                    : "선택한 유니버스의 LinkedIn, Naver Blog 반자동 draft를 검토하고 수정, 복사, 완료 처리까지 한 곳에서 진행합니다.",
                  en: isGlobalScope
                    ? "Operate queue, workers, and review drafts across all universes, while choosing a target universe only when enqueuing new items."
                    : "Review, edit, copy, and complete semi-automatic LinkedIn and Naver Blog drafts for the selected universe in one place.",
                }}
              />
            </TooltipBasic>
          </div>
        </div>

        <Button
          variant="ghost"
          size="xs"
          onClick={() => void refreshAll()}
          disabled={jobsLoading || detailLoading || !!busyKey}
          className="-mt-1 -mr-1"
        >
          <RefreshCw className={cn(jobsLoading || detailLoading ? "animate-spin" : "", "icon-xxs")} />
          <span className="sr-only">{lang({ ko: "새로고침", en: "Refresh" })}</span>
        </Button>
      </header>

      {errorMessage ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 break-words whitespace-pre-line">
          {errorMessage}
        </p>
      ) : null}

      <MarketingGenerationConfirmDialog
        state={generationConfirm}
        onClose={() => setGenerationConfirm(EMPTY_GENERATION_CONFIRM)}
        onConfirm={confirmContentGeneration}
      />
      <MarketingImageAttachDialog
        attachment={imageAttachment}
        attaching={busyKey === "image:attach_manual"}
        onAttach={() => void attachManualImage()}
      />
      <MarketingTemplatePreviewSheet preview={templatePreview} onClose={() => setTemplatePreview(null)} />
      <MarketingImageStudioSheet
        target={imageStudioTarget}
        universeId={toSafeString(detail?.job?.universeId)}
        initialQuery={detail?.job ? getMarketingJobSourceSearchQuery(detail.job) : ""}
        setTarget={setImageStudioTarget}
        presentation={studioPresentation}
        onDone={(images, meta) => void attachGeneratedImages(images, meta)}
      />
      <Tabs value={activeTab} onValueChange={changeActiveTab} className="mt-2 w-full">
        <div className="-mx-4">
          <TabsList variant="chip" scrollable className="mb-5 shadow-none">
            <div className="w-full flex gap-2 px-4">
              <TabsTrigger value="queue" className="flex-1">
                <Lang text={{ ko: "Queue 등록", en: "Queue" }} />
              </TabsTrigger>
              <TabsTrigger value="system" className="flex-1">
                <Lang text={{ ko: "운영 상태", en: "System" }} />
              </TabsTrigger>
              <TabsTrigger value="generation" className="flex-1">
                <Lang text={{ ko: "생성 설정", en: "Policy" }} />
              </TabsTrigger>
              <TabsTrigger value="review" className="flex-1">
                <span className="flex items-center gap-1">
                  <Lang text={{ ko: "검수/발행", en: "Review" }} />
                  {reviewJobPagination.total > 0 ? (
                    <Badge
                      variant="outline"
                      size="xs"
                      className={cn(activeTab === "review" && "border-white text-white")}
                    >
                      {reviewJobPagination.total}
                    </Badge>
                  ) : null}
                </span>
              </TabsTrigger>
              {isGlobalAdmin ? (
                <TabsTrigger value="keyword" className="flex-1">
                  <Lang text={{ ko: "키워드/업로드 정책", en: "Keywords / Upload policy" }} />
                </TabsTrigger>
              ) : null}
              {isGlobalAdmin ? (
                <TabsTrigger value="ads" className="flex-1">
                  <Lang text={{ ko: "광고", en: "Ads" }} />
                </TabsTrigger>
              ) : null}
              {isGlobalAdmin ? (
                <TabsTrigger value="promo" className="flex-1">
                  <Lang text={{ ko: "매거진 슬롯", en: "Magazine slots" }} />
                </TabsTrigger>
              ) : null}
              {isGlobalAdmin ? (
                <TabsTrigger value="newsletter" className="flex-1">
                  <Lang text={{ ko: "뉴스레터 승인", en: "Newsletter approval" }} />
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="performance" className="flex-1">
                <span className="flex items-center gap-1">
                  <BarChart3 className="icon-xxs" />
                  <Lang text={{ ko: "성과", en: "Performance" }} />
                </span>
              </TabsTrigger>
            </div>
          </TabsList>
        </div>

        <TabsContent value="queue" className="mt-0">
          <MarketingQueueTab
            busyKey={busyKey}
            isZeroUniverseGlobalMode={isZeroUniverseGlobalMode}
            isGlobalScope={isGlobalScope}
            availableUniverses={availableUniverses}
            queueComposer={queueComposer}
            categoryComposer={categoryComposer}
            categoryLoading={categoryLoading}
            categoryScopeUniverseId={categoryScopeUniverseId}
            selectedCategoryPolicyValue={selectedCategoryPolicyValue}
            categoryConfigs={categoryConfigs}
            selectedContentTemplate={selectedContentTemplate}
            selectedImageTemplate={selectedImageTemplate}
            contentTemplateOptions={contentTemplateOptions}
            imageTemplateOptions={imageTemplateOptions}
            workerResult={workerResult}
            enqueueTargets={enqueueTargets}
            loadCategoryConfigs={loadCategoryConfigs}
            saveCategoryConfig={saveCategoryConfig}
            setQueueComposerField={setQueueComposerField}
            setCategoryComposerField={setCategoryComposerField}
            selectCategoryPolicy={selectCategoryPolicy}
            setTemplatePreview={setTemplatePreview}
          />
        </TabsContent>
        <TabsContent value="system" className="mt-0">
          <MarketingSystemTab
            busyKey={busyKey}
            statusLoading={statusLoading}
            systemStatus={systemStatus}
            isGlobalScope={isGlobalScope}
            runWorkerPoll={runWorkerPoll}
            runRecovery={runRecovery}
            setSelectedJobId={setSelectedJobId}
          />
        </TabsContent>
        <TabsContent value="generation" className="mt-0">
          <MarketingGenerationSettingsPanel
            busyKey={busyKey}
            categoryScopeUniverseId={categoryScopeUniverseId}
            queueComposer={queueComposer}
            categoryComposer={categoryComposer}
            selectedContentTemplate={selectedContentTemplate}
            selectedImageTemplate={selectedImageTemplate}
            isLocalAgentMode={isLocalAgentMode}
            selectedContentChannels={selectedContentChannels}
            isZeroUniverseGlobalMode={isZeroUniverseGlobalMode}
            modelOptions={modelOptions}
            isGlobalScope={isGlobalScope}
            saveCategoryConfig={saveCategoryConfig}
            setQueueComposerField={setQueueComposerField}
            toggleQueueChannel={toggleQueueChannel}
            setTemplatePreview={setTemplatePreview}
          />
        </TabsContent>
        <TabsContent value="performance" className="mt-0">
          <div className="space-y-8">
            <MarketingGrowthMissionPanel key={`growth-mission-${scopedUniverseId}-${initialCampaignId}`} universeId={scopedUniverseId} initialCampaignId={initialCampaignId} />
            <GaConfigurationPanel key={`ga-config-${scopedUniverseId}`} universeId={scopedUniverseId} />
            <GaPerformancePanel key={`ga-performance-${scopedUniverseId}`} universeId={scopedUniverseId} />
            <SocialPerformancePanel key={`social-performance-${scopedUniverseId}-${initialCampaignId}`} universeId={scopedUniverseId} initialCampaignId={initialCampaignId} />
            {isGlobalAdmin ? <NewsletterPerformancePanel universeId={scopedUniverseId} /> : null}
          </div>
        </TabsContent>
        {isGlobalAdmin ? (
          <TabsContent value="ads" className="mt-0">
            <MarketingKeywordStrategyPanel universeId={scopedUniverseId} />
            <AdsOperationsPanel universeId={scopedUniverseId} />
          </TabsContent>
        ) : null}
        {isGlobalAdmin ? (
          <TabsContent value="promo" className="mt-0">
            <PromoCreativePanel universeId={scopedUniverseId} studioPresentation={studioPresentation} />
          </TabsContent>
        ) : null}
        {isGlobalAdmin ? (
          <TabsContent value="newsletter" className="mt-0">
            <NewsletterCampaignPanel universeId={scopedUniverseId} />
          </TabsContent>
        ) : null}
        <TabsContent value="review" className="mt-0">
          <MarketingReviewList
            reviewJobPagination={reviewJobPagination}
            selectedQueueCategoryFilter={selectedQueueCategoryFilter}
            categoryOptions={categoryOptions}
            reviewJobFilters={reviewJobFilters}
            statusFilterOptions={REVIEW_JOB_STATUS_FILTER_OPTIONS}
            hasReviewJobFilters={hasReviewJobFilters}
            busyKey={busyKey}
            allVisibleJobsSelected={allVisibleJobsSelected}
            jobs={jobs}
            jobsLoading={jobsLoading}
            selectedJobIds={selectedJobIds}
            selectedArchivableJobIds={selectedArchivableJobIds}
            bulkQueueCategory={bulkQueueCategory}
            queueComposer={queueComposer}
            selectedJobId={selectedJobId}
            isGlobalScope={isGlobalScope}
            setReviewJobPage={setReviewJobPage}
            setSelectedQueueCategoryFilter={setSelectedQueueCategoryFilter}
            setSelectedJobIds={setSelectedJobIds}
            setReviewJobFilterField={setReviewJobFilterField}
            resetReviewJobFilters={resetReviewJobFilters}
            fromReviewFilterSelectValue={fromReviewFilterSelectValue}
            toggleAllVisibleJobs={toggleAllVisibleJobs}
            setBulkQueueCategory={setBulkQueueCategory}
            updateSelectedJobCategories={updateSelectedJobCategories}
            requestContentGeneration={requestContentGeneration}
            archiveSelectedJobs={archiveSelectedJobs}
            toggleJobSelection={toggleJobSelection}
            updateJobCategory={updateJobCategory}
            setSelectedJobId={setSelectedJobId}
          />
          <MarketingReviewDetail
            selectedJobId={selectedJobId}
            detail={detail}
            detailLoading={detailLoading}
            busyKey={busyKey}
            isGlobalScope={isGlobalScope}
            categoryComposer={categoryComposer}
            detailImageTemplateKey={detailImageTemplateKey}
            detailContentTemplateKey={detailContentTemplateKey}
            detailContentTemplate={detailContentTemplate}
            detailImageTemplate={detailImageTemplate}
            selectedContentTemplate={selectedContentTemplate}
            openReviewChannels={openReviewChannels}
            editors={editors}
            detailCredentialStatus={detailCredentialStatus}
            proofreadLoading={proofreadDialog.loading}
            setSelectedJobId={setSelectedJobId}
            setImageStudioTarget={setImageStudioTarget}
            openImageAttachment={imageAttachment.open}
            refreshSourceImages={refreshSourceImages}
            openStrategyFitDialog={openStrategyFitDialog}
            runJobLifecycleAction={runJobLifecycleAction}
            requestContentGeneration={requestContentGeneration}
            setTemplatePreview={setTemplatePreview}
            setOpenReviewChannels={setOpenReviewChannels}
            setStrategyFitGuide={setStrategyFitGuide}
            openChannelProofread={openChannelProofread}
            runRetry={runRetry}
            siteUrl={queueComposer.siteUrl}
            naverCopyCtaMode={naverCopyCtaMode}
            setNaverCopyCtaMode={setNaverCopyCtaMode}
            connectLinkedInMemberProfile={connectLinkedInMemberProfile}
            jobs={jobs}
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

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 font-mono text-[12px] text-secondary-text">
            <span>
              <Lang text={{ ko: "최근 발행 로그", en: "Recent publish logs" }} />
            </span>
            <span className="font-semibold text-primary-text">{detail?.publishLogs?.length || 0}</span>
          </div>
        </TabsContent>

        {isGlobalAdmin ? (
          <TabsContent value="keyword" className="mt-0">
            <NaverKeywordStrategyPanel
              universeId={scopedUniverseId || undefined}
              universeOptions={availableUniverses}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      <MarketingStrategyFitGuideDialog guide={strategyFitGuide} onClose={() => setStrategyFitGuide(null)} />
      <MarketingStrategyFitDialog
        state={strategyFitDialog}
        modelOptions={strategyFitModelOptions}
        contentCount={detail?.channels?.filter((channel) => channel.draftAsset?.content).length || 0}
        setState={setStrategyFitDialog}
        onClose={() => setStrategyFitDialog(INITIAL_STRATEGY_FIT_DIALOG)}
        onOpenStrategy={goToStrategyRegistration}
        onRun={() => void runStrategyFit()}
      />
      <MarketingProofreadDialog
        state={proofreadDialog}
        modelOptions={proofreadModelOptions}
        setState={setProofreadDialog}
        onClose={() => setProofreadDialog(INITIAL_PROOFREAD_DIALOG)}
        onSubmit={() => void requestChannelProofreadCorrection()}
      />
    </section>
  );
}
