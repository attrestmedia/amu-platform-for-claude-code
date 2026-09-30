import type { Dispatch, SetStateAction } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { Archive, RotateCcw, Save, Send, X } from "lucide-react";
import { cn } from "src/utils/common";

import {
  MARKETING_CONTENT_CHANNEL_OPTIONS,
  MARKETING_PRIORITY_OPTIONS,
  REVIEW_FILTER_ALL_VALUE,
  MARKETING_TAB_HEADER_CLASS,
} from "./MarketingOpsConstants";
import { ReviewJobCard } from "./MarketingOpsComponents";
import type { MarketingJobListItem, MarketingJobPagination, QueueComposerState } from "./MarketingOpsTypes";
import { toSafeString, toSingleSelectValue } from "./MarketingOpsUtils";
import type { ReviewJobFilters } from "./MarketingReviewDomain";

type ReviewJobStatusFilterOption = {
  value: string;
  label: { ko: string; en: string };
};

type MarketingReviewListProps = {
  reviewJobPagination: MarketingJobPagination;
  selectedQueueCategoryFilter: string;
  categoryOptions: string[];
  reviewJobFilters: ReviewJobFilters;
  statusFilterOptions: readonly ReviewJobStatusFilterOption[];
  hasReviewJobFilters: boolean;
  busyKey: string;
  allVisibleJobsSelected: boolean;
  jobs: MarketingJobListItem[];
  jobsLoading: boolean;
  selectedJobIds: string[];
  selectedArchivableJobIds: string[];
  bulkQueueCategory: string;
  queueComposer: QueueComposerState;
  selectedJobId: string;
  isGlobalScope: boolean;
  setReviewJobPage: Dispatch<SetStateAction<number>>;
  setSelectedQueueCategoryFilter: (value: string) => void;
  setSelectedJobIds: (value: string[]) => void;
  setReviewJobFilterField: (key: keyof ReviewJobFilters, value: string) => void;
  resetReviewJobFilters: () => void;
  fromReviewFilterSelectValue: (value: string | string[]) => string;
  toggleAllVisibleJobs: (checked: boolean) => void;
  setBulkQueueCategory: (value: string) => void;
  updateSelectedJobCategories: (jobIds: string[]) => Promise<void>;
  requestContentGeneration: (jobIds: string[], channels?: string[]) => Promise<void>;
  archiveSelectedJobs: () => Promise<void>;
  toggleJobSelection: (jobId: string, checked: boolean) => void;
  updateJobCategory: (jobId: string, queueCategory: string) => Promise<void>;
  setSelectedJobId: (jobId: string) => void;
};

export function MarketingReviewList({
  reviewJobPagination,
  selectedQueueCategoryFilter,
  categoryOptions,
  reviewJobFilters,
  statusFilterOptions,
  hasReviewJobFilters,
  busyKey,
  allVisibleJobsSelected,
  jobs,
  jobsLoading,
  selectedJobIds,
  selectedArchivableJobIds,
  bulkQueueCategory,
  queueComposer,
  selectedJobId,
  isGlobalScope,
  setReviewJobPage,
  setSelectedQueueCategoryFilter,
  setSelectedJobIds,
  setReviewJobFilterField,
  resetReviewJobFilters,
  fromReviewFilterSelectValue,
  toggleAllVisibleJobs,
  setBulkQueueCategory,
  updateSelectedJobCategories,
  requestContentGeneration,
  archiveSelectedJobs,
  toggleJobSelection,
  updateJobCategory,
  setSelectedJobId,
}: MarketingReviewListProps) {
  return (
    <>
      <div className={MARKETING_TAB_HEADER_CLASS}>
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-text">04 · review &amp; publish</span>
          <h4 className="flex items-center gap-2 text-base font-semibold tracking-tight text-primary-text">
            <Lang text={{ ko: "검토 대상 콘텐츠", en: "Review content" }} />
            <span className="rounded-full border border-border bg-surface-2 px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.04em] text-secondary-text">
              {reviewJobPagination.total}
            </span>
          </h4>
        </div>
      </div>

      <Accordion type="single" defaultValue="content-filters" collapsible className="flex flex-col gap-4">
        <AccordionItem value="content-filters" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <Lang text={{ ko: "콘텐츠 필터", en: "Content filters" }} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "카테고리별 job 보기", en: "View jobs by category" }} />
                  </label>
                  <Select
                    value={selectedQueueCategoryFilter || REVIEW_FILTER_ALL_VALUE}
                    onValueChange={(value) => {
                      setReviewJobPage(1);
                      setSelectedQueueCategoryFilter(fromReviewFilterSelectValue(value));
                      setSelectedJobIds([]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={REVIEW_FILTER_ALL_VALUE}>
                        {lang({ ko: "전체 카테고리", en: "All categories" })}
                      </SelectItem>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "상태", en: "Status" }} />
                  </label>
                  <Select
                    value={reviewJobFilters.statusGroup || REVIEW_FILTER_ALL_VALUE}
                    onValueChange={(value) =>
                      setReviewJobFilterField("statusGroup", fromReviewFilterSelectValue(value))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusFilterOptions.map((option) => (
                        <SelectItem
                          key={option.value || REVIEW_FILTER_ALL_VALUE}
                          value={option.value || REVIEW_FILTER_ALL_VALUE}
                        >
                          {lang(option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "시작 날짜", en: "From date" }} />
                  </label>
                  <Input
                    type="date"
                    value={reviewJobFilters.dateFrom}
                    onChange={(event) => setReviewJobFilterField("dateFrom", event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "종료 날짜", en: "To date" }} />
                  </label>
                  <Input
                    type="date"
                    value={reviewJobFilters.dateTo}
                    onChange={(event) => setReviewJobFilterField("dateTo", event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "우선순위", en: "Priority" }} />
                  </label>
                  <Select
                    value={reviewJobFilters.priority || REVIEW_FILTER_ALL_VALUE}
                    onValueChange={(value) => setReviewJobFilterField("priority", fromReviewFilterSelectValue(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={REVIEW_FILTER_ALL_VALUE}>
                        {lang({ ko: "전체 우선순위", en: "All priorities" })}
                      </SelectItem>
                      {MARKETING_PRIORITY_OPTIONS.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "채널", en: "Channel" }} />
                  </label>
                  <Select
                    value={reviewJobFilters.channel || REVIEW_FILTER_ALL_VALUE}
                    onValueChange={(value) => setReviewJobFilterField("channel", fromReviewFilterSelectValue(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={REVIEW_FILTER_ALL_VALUE}>
                        {lang({ ko: "전체 채널", en: "All channels" })}
                      </SelectItem>
                      {MARKETING_CONTENT_CHANNEL_OPTIONS.map((channel) => (
                        <SelectItem key={channel.value} value={channel.value}>
                          {channel.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {hasReviewJobFilters ? (
                <div className="flex justify-end">
                  <Button
                    variant="blank"
                    onClick={resetReviewJobFilters}
                    disabled={!!busyKey}
                    className="flex items-center gap-1"
                  >
                    <RotateCcw className="icon-xxs" />
                    <span>{lang({ ko: "필터 초기화", en: "Reset filters" })}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-secondary-text">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={allVisibleJobsSelected}
              onChange={(event) => toggleAllVisibleJobs(event.target.checked)}
              disabled={jobs.length === 0}
            />
            <Lang text={{ ko: "검토 대상 job", en: "Review Jobs" }} />
          </label>
          <Badge size="xs" className="font-mono">
            {reviewJobPagination.total}
          </Badge>
        </div>
        {selectedJobIds.length > 0 ? (
          <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xxs font-semibold text-primary">
                {lang({
                  ko: `선택한 job ${selectedJobIds.length}개`,
                  en: `${selectedJobIds.length} selected job(s)`,
                })}
              </p>
              <div className="flex flex-wrap sm:flex-nowrap gap-1">
                <Select
                  size="xs"
                  value={
                    bulkQueueCategory ||
                    selectedQueueCategoryFilter ||
                    toSafeString(queueComposer.queueCategory) ||
                    "general"
                  }
                  onValueChange={(value) => setBulkQueueCategory(toSingleSelectValue(value) || "general")}
                  disabled={categoryOptions.length === 0}
                >
                  <SelectTrigger className="min-w-[8rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => void updateSelectedJobCategories(selectedJobIds)}
                  disabled={!!busyKey}
                >
                  <Save className="icon-xxs" />
                  <span>{lang({ ko: "선택 카테고리 변경", en: "Change selected category" })}</span>
                </Button>
                <Button
                  variant="outlineDestructive"
                  size="xs"
                  onClick={() => setSelectedJobIds([])}
                  disabled={!!busyKey}
                >
                  <X className="icon-xxs" />
                  <span>{lang({ ko: "선택 해제", en: "Clear" })}</span>
                </Button>
                <Button size="xs" onClick={() => void requestContentGeneration(selectedJobIds)} disabled={!!busyKey}>
                  <Send className="icon-xxs" />
                  <span>{lang({ ko: "선택 목록 콘텐츠 생성", en: "Generate selected list" })}</span>
                </Button>
                {selectedArchivableJobIds.length > 0 && (
                  <Button
                    variant="accent"
                    size="xs"
                    onClick={() => void archiveSelectedJobs()}
                    disabled={!!busyKey || selectedArchivableJobIds.length === 0}
                  >
                    <Archive className="icon-xxs" />
                    <span>
                      {lang({
                        ko: `완료 job 숨김 ${selectedArchivableJobIds.length}개`,
                        en: `Hide terminal ${selectedArchivableJobIds.length}`,
                      })}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className={cn("grid gap-2", !jobsLoading && jobs.length !== 0 && "md:grid-cols-2 xl:grid-cols-3")}>
          {jobsLoading ? (
            <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center font-mono text-[12px] text-muted-text">
              <Lang text={{ ko: "job 목록을 불러오는 중입니다.", en: "Loading jobs." }} />
            </p>
          ) : jobs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center font-mono text-[12px] text-muted-text">
              <Lang text={{ ko: "현재 검토 대상 job이 없습니다.", en: "No review jobs available." }} />
            </p>
          ) : (
            jobs.map((job) => (
              <ReviewJobCard
                key={job.jobId}
                job={job}
                isActive={selectedJobId === job.jobId}
                isSelected={selectedJobIds.includes(job.jobId)}
                isGlobalScope={isGlobalScope}
                categoryOptions={categoryOptions}
                onToggleSelected={toggleJobSelection}
                onUpdateCategory={(jobId, queueCategory) => void updateJobCategory(jobId, queueCategory)}
                onOpenDetail={setSelectedJobId}
              />
            ))
          )}
        </div>
        {reviewJobPagination.totalPages > 1 ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-mono text-[11px] text-secondary-text">
              {lang({
                ko: `현재 ${(reviewJobPagination.page - 1) * reviewJobPagination.limit + 1}-${Math.min(
                  reviewJobPagination.page * reviewJobPagination.limit,
                  reviewJobPagination.total,
                )} / 총 ${reviewJobPagination.total}`,
                en: `${(reviewJobPagination.page - 1) * reviewJobPagination.limit + 1}-${Math.min(
                  reviewJobPagination.page * reviewJobPagination.limit,
                  reviewJobPagination.total,
                )} of ${reviewJobPagination.total}`,
              })}
            </span>
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={jobsLoading || reviewJobPagination.page <= 1}
                onClick={() => setReviewJobPage((page) => Math.max(1, page - 1))}
              >
                <Lang text={{ ko: "이전", en: "Previous" }} />
              </Button>
              <span className="min-w-16 text-center font-mono text-xs text-secondary-text">
                {reviewJobPagination.page} / {reviewJobPagination.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={jobsLoading || reviewJobPagination.page >= reviewJobPagination.totalPages}
                onClick={() => setReviewJobPage((page) => Math.min(reviewJobPagination.totalPages, page + 1))}
              >
                <Lang text={{ ko: "다음", en: "Next" }} />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
