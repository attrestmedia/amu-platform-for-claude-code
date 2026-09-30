import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import {
  MARKETING_CONTENT_QUEUE_API,
  REVIEW_JOB_PAGE_SIZE,
} from "./MarketingOpsConstants";
import {
  getDefaultOpenReviewChannels,
  getReviewJobStatusFilter,
  INITIAL_REVIEW_JOB_FILTERS,
  toReviewDateBoundary,
  type ReviewJobFilters,
} from "./MarketingReviewDomain";
import type {
  ChannelEditorState,
  MarketingCredentialStatusMap,
  MarketingJobDetail,
  MarketingJobListItem,
  MarketingJobPagination,
  MarketingQueueCategoryConfig,
} from "./MarketingOpsTypes";
import {
  buildEditorMap,
  buildScopeParams,
  getInitialEditor,
  getMarketingOperatorErrorMessage,
  isArchivableJobStatus,
  toSafeString,
} from "./MarketingOpsUtils";

type UseMarketingReviewQueryControllerArgs = {
  scopedUniverseId: string;
  categoryConfigs: MarketingQueueCategoryConfig[];
  queueCategory: string;
  initialJobId?: string;
  setErrorMessage: (message: string) => void;
};

export function useMarketingReviewQueryController({
  scopedUniverseId,
  categoryConfigs,
  queueCategory,
  initialJobId = "",
  setErrorMessage,
}: UseMarketingReviewQueryControllerArgs) {
  const [jobs, setJobs] = useState<MarketingJobListItem[]>([]);
  const [reviewJobPage, setReviewJobPage] = useState(1);
  const [reviewJobPagination, setReviewJobPagination] = useState<MarketingJobPagination>({
    total: 0,
    page: 1,
    limit: REVIEW_JOB_PAGE_SIZE,
    totalPages: 1,
  });
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [selectedQueueCategoryFilter, setSelectedQueueCategoryFilter] = useState("");
  const [reviewJobFilters, setReviewJobFilters] = useState<ReviewJobFilters>(INITIAL_REVIEW_JOB_FILTERS);
  const [bulkQueueCategory, setBulkQueueCategory] = useState("");
  const [detail, setDetail] = useState<MarketingJobDetail | null>(null);
  const [credentialStatusByUniverseId, setCredentialStatusByUniverseId] = useState<
    Record<string, MarketingCredentialStatusMap>
  >({});
  const [editors, setEditors] = useState<Record<string, ChannelEditorState>>({});
  const [openReviewChannels, setOpenReviewChannels] = useState<string[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const requestedCredentialStatusUniverseIdsRef = useRef<Set<string>>(new Set());

  const detailUniverseId = toSafeString(detail?.job?.universeId);
  const detailCredentialStatus = detailUniverseId ? credentialStatusByUniverseId[detailUniverseId] : undefined;
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            "general",
            ...categoryConfigs.map((item) => toSafeString(item.queueCategory)),
            ...jobs.map((job) => toSafeString(job.queueCategory)),
            toSafeString(queueCategory),
            toSafeString(bulkQueueCategory),
          ].filter(Boolean),
        ),
      ),
    [bulkQueueCategory, categoryConfigs, jobs, queueCategory],
  );
  const allVisibleJobsSelected = jobs.length > 0 && jobs.every((job) => selectedJobIds.includes(job.jobId));
  const selectedActionJobIds = selectedJobIds.length > 0 ? selectedJobIds : selectedJobId ? [selectedJobId] : [];
  const selectedArchivableJobIds = selectedJobIds.filter((jobId) => {
    const job = jobs.find((item) => item.jobId === jobId);
    return job ? isArchivableJobStatus(toSafeString(job.status)) : false;
  });
  const hasReviewJobFilters = Boolean(
    selectedQueueCategoryFilter ||
      reviewJobFilters.statusGroup ||
      reviewJobFilters.dateFrom ||
      reviewJobFilters.dateTo ||
      reviewJobFilters.priority ||
      reviewJobFilters.channel,
  );

  const loadJobs = useCallback(
    async (preferredJobId?: string) => {
      try {
        setJobsLoading(true);
        setErrorMessage("");
        const statusFilter = getReviewJobStatusFilter(reviewJobFilters.statusGroup);
        const response = await fetchClient.get<{
          data?: { items?: MarketingJobListItem[]; pagination?: MarketingJobPagination };
        }>(MARKETING_CONTENT_QUEUE_API, {
          params: {
            ...buildScopeParams(scopedUniverseId),
            page: reviewJobPage,
            limit: REVIEW_JOB_PAGE_SIZE,
            status: statusFilter.status,
            includeArchived: statusFilter.includeArchived ? "true" : "",
            queueCategory: selectedQueueCategoryFilter,
            dateFrom: toReviewDateBoundary(reviewJobFilters.dateFrom, "start"),
            dateTo: toReviewDateBoundary(reviewJobFilters.dateTo, "end"),
            priority: reviewJobFilters.priority,
            channel: reviewJobFilters.channel,
          },
        });

        const items = response.data?.data?.items || [];
        const pagination = response.data?.data?.pagination || {
          total: items.length,
          page: reviewJobPage,
          limit: REVIEW_JOB_PAGE_SIZE,
          totalPages: 1,
        };
        if (reviewJobPage > pagination.totalPages) {
          setReviewJobPage(pagination.totalPages);
          return;
        }

        setJobs(items);
        setReviewJobPagination(pagination);
        setSelectedJobIds((prev) => prev.filter((jobId) => items.some((item) => item.jobId === jobId)));
        setSelectedJobId((prev) => {
          const preferred = typeof preferredJobId === "string" ? preferredJobId : prev;
          return preferred && items.some((item) => item.jobId === preferred) ? preferred : "";
        });
      } catch (error) {
        setErrorMessage(
          getMarketingOperatorErrorMessage(
            error,
            lang({ ko: "job 목록 조회에 실패했습니다.", en: "Failed to load jobs." }),
          ),
        );
      } finally {
        setJobsLoading(false);
      }
    },
    [reviewJobFilters, reviewJobPage, scopedUniverseId, selectedQueueCategoryFilter, setErrorMessage],
  );

  const loadJobDetail = useCallback(
    async (jobId: string) => {
      if (!jobId) {
        setDetail(null);
        setEditors({});
        setOpenReviewChannels([]);
        return;
      }
      try {
        setDetailLoading(true);
        setErrorMessage("");
        const response = await fetchClient.get<{ data?: MarketingJobDetail }>(
          `${MARKETING_CONTENT_QUEUE_API}/${jobId}`,
          { params: buildScopeParams(scopedUniverseId) },
        );
        const nextDetail = response.data?.data || null;
        setDetail(nextDetail);
        setEditors(buildEditorMap(nextDetail));
        setOpenReviewChannels(getDefaultOpenReviewChannels(nextDetail?.channels));
      } catch (error) {
        setErrorMessage(
          getMarketingOperatorErrorMessage(
            error,
            lang({ ko: "job 상세 조회에 실패했습니다.", en: "Failed to load job detail." }),
          ),
        );
        setDetail(null);
        setEditors({});
        setOpenReviewChannels([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [scopedUniverseId, setErrorMessage],
  );

  const setEditorField = useCallback((channel: string, key: keyof ChannelEditorState, value: string) => {
    setEditors((prev) => ({
      ...prev,
      [channel]: {
        ...(prev[channel] || getInitialEditor({ channel })),
        [key]: value,
      },
    }));
  }, []);

  const toggleJobSelection = useCallback((jobId: string, checked: boolean) => {
    const safeJobId = toSafeString(jobId);
    if (!safeJobId) return;
    setSelectedJobIds((prev) =>
      checked ? Array.from(new Set([...prev, safeJobId])) : prev.filter((item) => item !== safeJobId),
    );
  }, []);

  const toggleAllVisibleJobs = useCallback(
    (checked: boolean) => setSelectedJobIds(checked ? jobs.map((job) => job.jobId).filter(Boolean) : []),
    [jobs],
  );

  const setReviewJobFilterField = useCallback((key: keyof ReviewJobFilters, value: string) => {
    setReviewJobPage(1);
    setReviewJobFilters((prev) => ({ ...prev, [key]: value }));
    setSelectedJobIds([]);
  }, []);

  const resetReviewJobFilters = useCallback(() => {
    setReviewJobPage(1);
    setSelectedQueueCategoryFilter("");
    setReviewJobFilters(INITIAL_REVIEW_JOB_FILTERS);
    setSelectedJobIds([]);
  }, []);

  const clearDetail = useCallback(() => {
    setDetail(null);
    setEditors({});
    setOpenReviewChannels([]);
  }, []);

  useEffect(
    function loadDetailCredentialStatus() {
      if (!detailUniverseId || credentialStatusByUniverseId[detailUniverseId]) return;
      if (requestedCredentialStatusUniverseIdsRef.current.has(detailUniverseId)) return;
      requestedCredentialStatusUniverseIdsRef.current.add(detailUniverseId);
      let canceled = false;
      fetchClient
        .get<{ data?: MarketingCredentialStatusMap }>(`/universe/${detailUniverseId}/credentials`)
        .then((response) => {
          if (canceled) return;
          setCredentialStatusByUniverseId((prev) => ({ ...prev, [detailUniverseId]: response.data?.data || {} }));
        })
        .catch(() => {
          if (canceled) return;
          setCredentialStatusByUniverseId((prev) => ({ ...prev, [detailUniverseId]: {} }));
        });
      return () => {
        canceled = true;
      };
    },
    [credentialStatusByUniverseId, detailUniverseId],
  );

  useEffect(
    function fetchJobsOnScopeOrFilterChange() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadJobs(initialJobId);
    },
    [initialJobId, loadJobs],
  );

  useEffect(
    function fetchSelectedJobDetail() {
      if (!selectedJobId) {
        // 선택 해제 시 이전 상세와 editor snapshot을 함께 폐기한다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDetail(null);
        setEditors({});
        setOpenReviewChannels([]);
        return;
      }
      setOpenReviewChannels([]);
      void loadJobDetail(selectedJobId);
    },
    [loadJobDetail, selectedJobId],
  );

  return {
    jobs,
    reviewJobPage,
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
  };
}
