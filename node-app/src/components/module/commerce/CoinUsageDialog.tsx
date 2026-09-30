"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CreditCard, History, RotateCcw } from "lucide-react";
import { enUS, ko as koLocale } from "react-day-picker/locale";
import fetchClient from "libs/api/fetchClient";
import { BottomSheetDialog, Button, DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@amu-labs/ui";
import { Lang, useLocalize } from "components/module/i18n";
import { onCoinUpdated } from "utils/payment";
import {
  COIN_USAGE_ACTIVITY_FILTER_OPTIONS as ACTIVITY_FILTER_OPTIONS,
  COIN_USAGE_PURPOSE_FILTER_OPTIONS as PURPOSE_FILTER_OPTIONS,
  CoinUsageSummaryPill as SummaryPill,
  formatDateInputValue,
  getTodayInputValue,
  parseDateInputValue,
  type CoinActivityFilter,
  type CoinPurposeFilter,
} from "./coinUsageShared";
import type { CoinUsageLedgerItem } from "types/payment";
import { CoinUsageItemRow } from "./CoinUsageItemRow";

type CoinUsageSummary = {
  usage: number;
  credit: number;
  net: number;
};
type CoinUsageResponse = {
  list: CoinUsageLedgerItem[];
  nextCursor: string | null;
  summary: {
    filter: CoinUsageSummary;
    today: CoinUsageSummary;
  };
};
type CoinUsageDateRangeFilter = {
  from: string;
  to: string;
};

async function fetchCoinUsage(args: {
  activity: CoinActivityFilter;
  purpose: CoinPurposeFilter;
  dateFrom: string;
  dateTo: string;
  cursor?: string | null;
}) {
  const response = await fetchClient.get<CoinUsageResponse>("/payments/usage", {
    params: {
      limit: 20,
      activity: args.activity,
      purpose: args.purpose,
      dateFrom: args.dateFrom || undefined,
      dateTo: args.dateTo || undefined,
      cursor: args.cursor || undefined,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    },
  });
  return response.data;
}

export function CoinUsageDialog({
  open,
  onClose,
  onChargeClick,
}: {
  open: boolean;
  onClose: () => void;
  onChargeClick?: () => void;
}) {
  const { language, localize } = useLocalize();
  const [activityFilter, setActivityFilter] = useState<CoinActivityFilter>("all");
  const [purposeFilter, setPurposeFilter] = useState<CoinPurposeFilter>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<CoinUsageDateRangeFilter>({ from: "", to: "" });
  // 시작일만 지정하면 단일 날짜(from == to)로 간주한다. 종료일이 비어 있으면
  // 시작일을 종료일로 사용해 하루 범위로 필터링한다.
  const effectiveDateFrom = dateRangeFilter.from;
  const effectiveDateTo = dateRangeFilter.to || dateRangeFilter.from;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["user-coin-usage", activityFilter, purposeFilter, effectiveDateFrom, effectiveDateTo],
    queryFn: ({ pageParam }) =>
      fetchCoinUsage({
        activity: activityFilter,
        purpose: purposeFilter,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: open,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const { refetch } = query;
  const list = useMemo(() => query.data?.pages.flatMap((page) => page.list) ?? [], [query.data]);
  const summary = query.data?.pages[0]?.summary;
  const selectedFromDate = useMemo(() => parseDateInputValue(dateRangeFilter.from), [dateRangeFilter.from]);
  const selectedToDate = useMemo(() => parseDateInputValue(dateRangeFilter.to), [dateRangeFilter.to]);
  const maxSelectableDate = parseDateInputValue(getTodayInputValue());
  const isDateRangeFilterActive = Boolean(effectiveDateFrom || effectiveDateTo);
  const primaryUsageSummaryLabel = isDateRangeFilterActive
    ? localize({ ko: "선택 기간 사용량", en: "Used in period" })
    : localize({ ko: "오늘 사용량", en: "Used today" });
  const dateFilterFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
        dateStyle: "medium",
      }),
    [language],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [language],
  );

  useEffect(() => {
    if (!open || !query.hasNextPage || query.isFetchingNextPage) return;
    const target = loadMoreRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void query.fetchNextPage();
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    return onCoinUpdated((event) => {
      if (event.detail.scope === "user") void refetch();
    });
  }, [open, refetch]);

  return (
    <BottomSheetDialog
      open={open}
      onClose={onClose}
      title={localize({ ko: "코인 사용 내역", en: "Coin activity" })}
      panelClassName="md:max-w-md"
      bodyClassName="px-4"
    >
      <div className="py-4">
        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select value={activityFilter} onValueChange={(value) => setActivityFilter(value as CoinActivityFilter)}>
              <SelectTrigger size="sm">
                <SelectValue placeholder={localize({ ko: "작업 유형", en: "Activity type" })} />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <Lang text={{ ko: option.ko, en: option.en }} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={purposeFilter} onValueChange={(value) => setPurposeFilter(value as CoinPurposeFilter)}>
              <SelectTrigger size="sm">
                <SelectValue placeholder={localize({ ko: "사용 목적", en: "Usage purpose" })} />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <Lang text={{ ko: option.ko, en: option.en }} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DatePicker
              mode="single"
              value={selectedFromDate}
              displayValue={selectedFromDate ? dateFilterFormatter.format(selectedFromDate) : undefined}
              placeholder={localize({ ko: "시작일", en: "Start date" })}
              ariaLabel={localize({ ko: "시작일 필터", en: "Start date filter" })}
              locale={language === "ko" ? koLocale : enUS}
              disabledDates={maxSelectableDate ? { after: maxSelectableDate } : undefined}
              onChange={(date) =>
                setDateRangeFilter((prev) => ({
                  ...prev,
                  from: date ? formatDateInputValue(date) : "",
                }))
              }
            />
            <DatePicker
              mode="single"
              value={selectedToDate}
              displayValue={selectedToDate ? dateFilterFormatter.format(selectedToDate) : undefined}
              placeholder={localize({ ko: "종료일", en: "End date" })}
              ariaLabel={localize({ ko: "종료일 필터", en: "End date filter" })}
              locale={language === "ko" ? koLocale : enUS}
              disabledDates={
                maxSelectableDate || selectedFromDate
                  ? [
                      ...(maxSelectableDate ? [{ after: maxSelectableDate }] : []),
                      ...(selectedFromDate ? [{ before: selectedFromDate }] : []),
                    ]
                  : undefined
              }
              onChange={(date) =>
                setDateRangeFilter((prev) => ({
                  ...prev,
                  to: date ? formatDateInputValue(date) : "",
                }))
              }
            />
          </div>
          {(activityFilter !== "all" || purposeFilter !== "all" || dateRangeFilter.from || dateRangeFilter.to) && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                setActivityFilter("all");
                setPurposeFilter("all");
                setDateRangeFilter({ from: "", to: "" });
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              <Lang text={{ ko: "필터 초기화", en: "Reset filters" }} />
            </Button>
          )}
          {summary && (
            <div className="grid grid-cols-3 gap-2">
              <SummaryPill label={primaryUsageSummaryLabel} value={Math.max(0, summary.today.usage)} tone="usage" />
              <SummaryPill
                label={localize({ ko: "조회 범위 사용량", en: "Used in view" })}
                value={Math.max(0, summary.filter.usage)}
                tone="usage"
              />
              <SummaryPill
                label={localize({ ko: "충전·지급", en: "Added in view" })}
                value={summary.filter.credit}
                tone="credit"
              />
            </div>
          )}
        </div>

        {query.isLoading ? (
          <div
            className="space-y-3"
            aria-label={localize({ ko: "코인 내역 불러오는 중", en: "Loading coin activity" })}
          >
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              <Lang text={{ ko: "사용 내역을 불러오지 못했습니다.", en: "Could not load coin activity." }} />
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              <Lang text={{ ko: "다시 시도", en: "Try again" }} />
            </Button>
          </div>
        ) : !list.length ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <History className="h-8 w-8" />
            <p className="text-sm">
              <Lang text={{ ko: "아직 코인 사용 내역이 없습니다.", en: "No coin activity yet." }} />
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="divide-y" role="list">
              {list.map((item) => (
                <CoinUsageItemRow key={item.id} item={item} dateFormatter={dateFormatter} />
              ))}
            </div>
            <div ref={loadMoreRef} className="flex min-h-9 items-center justify-center">
              {query.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={query.isFetchingNextPage}
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  <Lang text={{ ko: "더 보기", en: "Load more" }} />
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "모든 원장을 확인했습니다.", en: "End of ledger." }} />
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {onChargeClick && (
        <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 shadow-[0_-12px_24px_rgba(0,0,0,0.08)] backdrop-blur">
          <Button className="w-full gap-2" size="lg" rounded="full" onClick={onChargeClick}>
            <CreditCard className="h-4 w-4" />
            <Lang text={{ ko: "코인 충전", en: "Charge Coins" }} />
          </Button>
        </div>
      )}
    </BottomSheetDialog>
  );
}
