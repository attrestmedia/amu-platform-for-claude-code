import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lang } from "components/module/i18n";
import { TEXT_MODEL_MAP } from "consts/ai";
import fetchClient from "libs/api/fetchClient";
import { listContentPrompts } from "libs/api/lab/contentPrompts";
import { listImagePrompts } from "libs/api/lab/imagePrompts";
import { toast } from "sonner";
import type { UnknownRecord } from "utils/common/typeUtils";
import {
  INITIAL_QUEUE_CATEGORY_COMPOSER,
  INITIAL_QUEUE_COMPOSER,
  MARKETING_CONTENT_QUEUE_API,
  MARKETING_QUEUE_CATEGORY_API,
  QUEUE_CATEGORY_POLICY_NONE,
} from "./MarketingOpsConstants";
import type { MarketingTemplatePreviewState } from "./MarketingTemplateSheets";
import type {
  MarketingQueueCategoryConfig,
  MarketingTemplateOption,
  QueueCategoryComposerState,
  QueueComposerState,
} from "./MarketingOpsTypes";
import {
  chunkValues,
  getMarketingOperatorErrorMessage,
  getQueueCategoryComposerFromConfig,
  getSelectedContentChannels,
  isHttpUrl,
  toBatchSize,
  toLineValues,
  toSafeString,
  toScheduledAtPayload,
  toSingleSelectValue,
  toTextArray,
  toUrlValues,
} from "./MarketingOpsUtils";

type SaveCategoryConfigOptions = {
  defaultReviewMode?: string;
  generationSettings?: boolean;
};

type UseMarketingQueueControllerArgs = {
  scopedUniverseId: string;
  defaultAvailableUniverseId: string;
  availableUniverseKey: string;
  isZeroUniverseGlobalMode: boolean;
  setBusyKey: (key: string) => void;
  setErrorMessage: (message: string) => void;
  onRefresh: (jobId?: string) => Promise<void>;
  onEnqueued: () => void;
};

export function useMarketingQueueController({
  scopedUniverseId,
  defaultAvailableUniverseId,
  availableUniverseKey,
  isZeroUniverseGlobalMode,
  setBusyKey,
  setErrorMessage,
  onRefresh,
  onEnqueued,
}: UseMarketingQueueControllerArgs) {
  const [queueComposer, setQueueComposer] = useState<QueueComposerState>(INITIAL_QUEUE_COMPOSER);
  const [contentTemplateOptions, setContentTemplateOptions] = useState<MarketingTemplateOption[]>([]);
  const [imageTemplateOptions, setImageTemplateOptions] = useState<MarketingTemplateOption[]>([]);
  const [categoryConfigs, setCategoryConfigs] = useState<MarketingQueueCategoryConfig[]>([]);
  const [categoryComposer, setCategoryComposer] = useState<QueueCategoryComposerState>(INITIAL_QUEUE_CATEGORY_COMPOSER);
  const [templatePreview, setTemplatePreview] = useState<MarketingTemplatePreviewState>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  const onEnqueuedRef = useRef(onEnqueued);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
    onEnqueuedRef.current = onEnqueued;
  }, [onEnqueued, onRefresh]);

  const categoryScopeUniverseId = scopedUniverseId || queueComposer.targetUniverseId;
  const selectedContentChannels = useMemo(
    () => getSelectedContentChannels(queueComposer.channels),
    [queueComposer.channels],
  );
  const modelOptions = useMemo(
    () =>
      ((TEXT_MODEL_MAP as Record<string, readonly string[]>)[queueComposer.modelProvider] || []) as readonly string[],
    [queueComposer.modelProvider],
  );
  const isLocalAgentMode = queueComposer.generationMode === "local_agent";
  const selectedCategoryPolicyValue = categoryConfigs.some(
    (item) => toSafeString(item.queueCategory) === queueComposer.queueCategory,
  )
    ? queueComposer.queueCategory
    : QUEUE_CATEGORY_POLICY_NONE;
  const selectedContentTemplate = contentTemplateOptions.find(
    (item) => toSafeString(item.key) === categoryComposer.defaultContentTemplateKey,
  );
  const selectedImageTemplate = imageTemplateOptions.find(
    (item) => toSafeString(item.key) === categoryComposer.defaultImageTemplateKey,
  );

  const loadTemplateOptions = useCallback(async () => {
    try {
      const [contentRows, imageRows] = await Promise.all([
        listContentPrompts({ enabled: true, view: "admin" }),
        listImagePrompts({ enabled: true, view: "admin" }),
      ]);
      setContentTemplateOptions((contentRows || []).filter((item) => toSafeString(item?.key)));
      setImageTemplateOptions((imageRows || []).filter((item) => toSafeString(item?.key)));
    } catch {
      setContentTemplateOptions([]);
      setImageTemplateOptions([]);
    }
  }, []);

  const applyCategoryConfig = useCallback((config: MarketingQueueCategoryConfig) => {
    const queueCategory = toSafeString(config.queueCategory) || "general";
    const defaultBatchSize = String(toBatchSize(String(config.defaultBatchSize || 1), 1));
    const defaultPriority = toSafeString(config.defaultPriority) || "normal";
    const defaultReviewMode = toSafeString(config.defaultReviewMode) || "review_required";

    setQueueComposer((prev) => ({
      ...prev,
      queueCategory,
      batchSize: defaultBatchSize,
      priority: defaultPriority,
      generationMode: toSafeString(config.defaultGenerationMode) || prev.generationMode,
      modelProvider: toSafeString(config.defaultModelProvider) || prev.modelProvider,
      modelName: toSafeString(config.defaultModelName) || prev.modelName,
      reviewMode: defaultReviewMode,
      siteUrl: toSafeString(config.siteUrl),
      instructionText: toSafeString(config.instructionText) || prev.instructionText,
      channels: getSelectedContentChannels(config.allowedChannels?.length ? config.allowedChannels : prev.channels),
    }));
    setCategoryComposer(getQueueCategoryComposerFromConfig(config));
  }, []);

  const loadCategoryConfigs = useCallback(
    async (selectedQueueCategory = "") => {
      const targetUniverseId = toSafeString(categoryScopeUniverseId);
      if (!targetUniverseId) {
        setCategoryConfigs([]);
        return;
      }

      try {
        setCategoryLoading(true);
        const response = await fetchClient.get<{ data?: { items?: MarketingQueueCategoryConfig[] } }>(
          MARKETING_QUEUE_CATEGORY_API,
          { params: { universeId: targetUniverseId } },
        );
        const items = response.data?.data?.items || [];
        setCategoryConfigs(items);

        const selectedConfig = items.find(
          (item) => toSafeString(item.queueCategory) === (toSafeString(selectedQueueCategory) || "general"),
        );
        if (selectedConfig) applyCategoryConfig(selectedConfig);
      } catch (error) {
        setErrorMessage(
          getMarketingOperatorErrorMessage(
            error,
            lang({ ko: "queue category 정책 조회에 실패했습니다.", en: "Failed to load queue category policies." }),
          ),
        );
      } finally {
        setCategoryLoading(false);
      }
    },
    [applyCategoryConfig, categoryScopeUniverseId, setErrorMessage],
  );

  const setQueueComposerField = useCallback(
    (key: Exclude<keyof QueueComposerState, "channels">, value: string) => {
      setQueueComposer((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const toggleQueueChannel = useCallback((channel: string, checked: boolean) => {
    setQueueComposer((prev) => ({
      ...prev,
      channels: getSelectedContentChannels(
        checked ? [...prev.channels, channel] : prev.channels.filter((item) => item !== channel),
      ),
    }));
  }, []);

  const setCategoryComposerField = useCallback((key: keyof QueueCategoryComposerState, value: string | boolean) => {
    setCategoryComposer((prev) => ({ ...prev, [key]: value }));
  }, []);

  const selectCategoryPolicy = useCallback(
    (value: string | string[]) => {
      const selectedCategory = toSingleSelectValue(value);
      if (!selectedCategory || selectedCategory === QUEUE_CATEGORY_POLICY_NONE) return;
      const config = categoryConfigs.find((item) => toSafeString(item.queueCategory) === selectedCategory);
      if (config) applyCategoryConfig(config);
    },
    [applyCategoryConfig, categoryConfigs],
  );

  const enqueueTargets = useCallback(async () => {
    const inputMode = toSafeString(queueComposer.sourceInputMode) === "direct" ? "direct" : "urls";
    const urls = inputMode === "urls" ? toUrlValues(queueComposer.bulkTargets) : [];
    const invalidBulkItems =
      inputMode === "urls" ? toLineValues(queueComposer.bulkTargets).filter((item) => !isHttpUrl(item)) : [];
    const batchSize = toBatchSize(queueComposer.batchSize);
    const targetUniverseId = scopedUniverseId || toSafeString(queueComposer.targetUniverseId);
    const scheduledAt = toScheduledAtPayload(queueComposer.scheduledAt);
    const sourceUrl = toSafeString(queueComposer.sourceUrl);
    const sourceTitle = toSafeString(queueComposer.sourceTitle);
    const sourceContentText = toSafeString(queueComposer.sourceContentText);
    const sourceExcerptText = toSafeString(queueComposer.sourceExcerptText);
    const sourceImageUrl = toSafeString(queueComposer.sourceImageUrl);

    if (inputMode === "urls" && urls.length === 0) {
      toast.error(lang({ ko: "URL을 하나 이상 입력해주세요.", en: "Enter at least one URL." }));
      return;
    }
    if (invalidBulkItems.length > 0) {
      toast.error(lang({ ko: "추가 대상에는 URL만 입력할 수 있습니다.", en: "Bulk targets accept URLs only." }));
      return;
    }
    if (!targetUniverseId) {
      toast.error(
        isZeroUniverseGlobalMode
          ? lang({
              ko: "현재는 queue 등록 대상 유니버스가 없습니다. 먼저 유니버스를 생성한 뒤 다시 시도해주세요.",
              en: "There is no target universe available for enqueue yet. Create a universe first.",
            })
          : lang({ ko: "queue 등록 대상 유니버스를 선택해주세요.", en: "Select a target universe for enqueue." }),
      );
      return;
    }
    if (inputMode === "direct") {
      if (!isHttpUrl(sourceUrl)) {
        toast.error(
          lang({
            ko: "원문 URL을 http 또는 https URL로 입력해주세요.",
            en: "Enter the source URL as an http or https URL.",
          }),
        );
        return;
      }
      if (!sourceContentText) {
        toast.error(lang({ ko: "직접 원문 본문을 입력해주세요.", en: "Enter the source content body." }));
        return;
      }
    }

    try {
      setBusyKey("queue:enqueue");
      const directSourceSnapshot =
        inputMode === "direct"
          ? {
              url: sourceUrl,
              title: sourceTitle || sourceUrl,
              imageUrl: isHttpUrl(sourceImageUrl) ? sourceImageUrl : undefined,
              imageUrls: isHttpUrl(sourceImageUrl) ? [sourceImageUrl] : [],
              excerptText: sourceExcerptText || sourceContentText.slice(0, 1200),
              contentText: sourceContentText,
              categories: toTextArray(queueComposer.sourceCategories),
              tags: toTextArray(queueComposer.sourceTags),
              sourceKind: "manual_web",
              sourceId: sourceUrl,
            }
          : null;
      const chunks = inputMode === "direct" ? [[directSourceSnapshot]] : chunkValues(urls, batchSize);
      if (chunks.length > 1) {
        toast.warning(
          lang({
            ko: `${urls.length}건을 ${batchSize}건 이하 ${chunks.length}개 묶음으로 나누어 등록합니다.`,
            en: `Submitting ${urls.length} URLs in ${chunks.length} chunks of up to ${batchSize}.`,
          }),
        );
      }

      type EnqueueResult = {
        enqueued?: Array<{ jobId?: string }>;
        skipped?: Array<{ jobId?: string }>;
        failed?: UnknownRecord[];
      };
      const results: EnqueueResult[] = [];
      for (const chunk of chunks) {
        const response = await fetchClient.post<{ data?: EnqueueResult }>(MARKETING_CONTENT_QUEUE_API, {
          universeId: targetUniverseId,
          ...(inputMode === "direct" ? { sourceSnapshots: chunk } : { urls: chunk }),
          ...(scheduledAt ? { scheduledAt } : {}),
          priority: queueComposer.priority,
          queueCategory: queueComposer.queueCategory,
          generationMode: queueComposer.generationMode,
          modelProvider: queueComposer.modelProvider,
          modelName: queueComposer.modelName,
          instructionText: queueComposer.instructionText,
          contentTemplateKey: categoryComposer.defaultContentTemplateKey,
          imageTemplateKey: categoryComposer.defaultImageTemplateKey,
          reviewMode: queueComposer.reviewMode,
          channels: selectedContentChannels,
        });
        results.push(response.data?.data || {});
      }
      const result = {
        enqueued: results.flatMap((item) => item.enqueued || []),
        skipped: results.flatMap((item) => item.skipped || []),
        failed: results.flatMap((item) => item.failed || []),
      };
      const enqueuedCount = Number(result.enqueued.length);
      const skippedCount = Number(result.skipped.length);
      const failedCount = Number(result.failed.length);
      const targetJobId = toSafeString(result.enqueued[0]?.jobId) || toSafeString(result.skipped[0]?.jobId);

      if (enqueuedCount > 0) {
        toast.success(
          lang({
            ko: `queue 등록 ${enqueuedCount}건, 중복 ${skippedCount}건, 실패 ${failedCount}건`,
            en: `Enqueued ${enqueuedCount} item(s).`,
          }),
        );
      } else {
        toast.error(
          lang({
            ko: `신규 queue 등록이 없습니다. 중복 ${skippedCount}건, 실패 ${failedCount}건`,
            en: "No new queue item was created.",
          }),
        );
      }

      onEnqueuedRef.current();
      await onRefreshRef.current(targetJobId);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(error, lang({ ko: "queue 등록에 실패했습니다.", en: "Failed to enqueue." })),
      );
    } finally {
      setBusyKey("");
    }
  }, [
    categoryComposer.defaultContentTemplateKey,
    categoryComposer.defaultImageTemplateKey,
    isZeroUniverseGlobalMode,
    queueComposer,
    scopedUniverseId,
    selectedContentChannels,
    setBusyKey,
  ]);

  const saveCategoryConfig = useCallback(
    async (options: SaveCategoryConfigOptions = {}) => {
      const targetUniverseId = toSafeString(categoryScopeUniverseId);
      const queueCategory = toSafeString(categoryComposer.queueCategory || queueComposer.queueCategory);
      if (!targetUniverseId) {
        toast.error(
          lang({
            ko: "카테고리 정책 대상 유니버스를 선택해주세요.",
            en: "Select a target universe for category policy.",
          }),
        );
        return;
      }
      if (!queueCategory) {
        toast.error(lang({ ko: "카테고리 키를 입력해주세요.", en: "Enter a category key." }));
        return;
      }

      try {
        setBusyKey("category:save");
        const response = await fetchClient.post<{ data?: { item?: MarketingQueueCategoryConfig } }>(
          MARKETING_QUEUE_CATEGORY_API,
          {
            universeId: targetUniverseId,
            queueCategory,
            label: categoryComposer.label,
            enabled: categoryComposer.enabled,
            defaultBatchSize: toBatchSize(categoryComposer.defaultBatchSize, 1),
            defaultPriority: categoryComposer.defaultPriority,
            defaultContentTemplateKey: categoryComposer.defaultContentTemplateKey,
            defaultImageTemplateKey: categoryComposer.defaultImageTemplateKey,
            defaultGenerationMode: queueComposer.generationMode,
            defaultModelProvider: queueComposer.modelProvider,
            defaultModelName: queueComposer.modelName,
            defaultReviewMode: options.defaultReviewMode || categoryComposer.defaultReviewMode,
            instructionText: queueComposer.instructionText,
            siteUrl: queueComposer.siteUrl,
            allowedChannels: selectedContentChannels,
          },
        );
        const item = response.data?.data?.item || null;
        if (item) applyCategoryConfig(item);
        toast.success(
          options.generationSettings
            ? lang({ ko: "콘텐츠 생성 설정을 저장했습니다.", en: "Content generation settings saved." })
            : lang({ ko: "카테고리 실행 정책을 저장했습니다.", en: "Queue category policy saved." }),
        );
        await loadCategoryConfigs(queueCategory);
      } catch (error) {
        toast.error(
          getMarketingOperatorErrorMessage(
            error,
            options.generationSettings
              ? lang({ ko: "콘텐츠 생성 설정 저장에 실패했습니다.", en: "Failed to save generation settings." })
              : lang({ ko: "카테고리 정책 저장에 실패했습니다.", en: "Failed to save category policy." }),
          ),
        );
      } finally {
        setBusyKey("");
      }
    },
    [
      applyCategoryConfig,
      categoryComposer,
      categoryScopeUniverseId,
      loadCategoryConfigs,
      queueComposer,
      selectedContentChannels,
      setBusyKey,
    ],
  );

  useEffect(
    function fetchTemplateOptionsOnMount() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadTemplateOptions();
    },
    [loadTemplateOptions],
  );

  useEffect(
    function fetchCategoryConfigsOnScopeChange() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadCategoryConfigs("general");
    },
    [loadCategoryConfigs],
  );

  useEffect(
    function resetComposerOnScopeChange() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQueueComposer((prev) => ({
        ...INITIAL_QUEUE_COMPOSER,
        targetUniverseId: scopedUniverseId || prev.targetUniverseId || defaultAvailableUniverseId,
      }));
    },
    [availableUniverseKey, defaultAvailableUniverseId, scopedUniverseId],
  );

  return {
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
  };
}
