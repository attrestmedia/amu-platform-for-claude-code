"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Coins, History, RotateCcw } from "lucide-react";
import { enUS, ko as koLocale } from "react-day-picker/locale";
import fetchClient from "libs/api/fetchClient";
import { BottomSheetDialog, Button, DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@amu-labs/ui";
import { useLocalize } from "components/module/i18n";
import { onCoinUpdated } from "utils/payment";
import type { CoinUsageLedgerItem } from "types/payment";
import {
  COIN_USAGE_ACTIVITY_FILTER_OPTIONS as ACTIVITY_FILTER_OPTIONS,
  COIN_USAGE_PURPOSE_FILTER_OPTIONS as PURPOSE_FILTER_OPTIONS,
  CoinUsageSummaryPill,
  formatDateInputValue,
  getTodayInputValue,
  parseDateInputValue,
  type CoinActivityFilter,
  type CoinPurposeFilter,
} from "./coinUsageShared";
import { CoinUsageItemRow } from "./CoinUsageItemRow";

/**
 * @docHint
 * @purpose 유니버스(커머스 지갑) 전용 코인 사용 내역 팝업 — 스마트스토어 운영 화면에서 연다.
 *          잔액은 타이틀이 아니라 본문 상단 잔액 카드에 표시한다(잔액이 1차 정보, 내역이 2차 정보).
 *          데이터는 /universe/[universeId]/coin-usage 단일 소스(원장 uid=universe:{id} + 지갑 잔액).
 * @domain payment
 * @scope client
 */

type UniverseCoinUsageSummary = {
  usage: number;
  credit: number;
  net: number;
};
type UniverseCoinUsageResponse = {
  list: CoinUsageLedgerItem[];
  nextCursor: string | null;
  summary: {
    filter: UniverseCoinUsageSummary;
    today: UniverseCoinUsageSummary;
  };
  balance: {
    membership: { coins: number; expiresAt: string | null };
    charged: { coins: number };
    total: number;
  };
};
type CoinUsageDateRangeFilter = {
  from: string;
  to: string;
};

type UniverseCoinUsageDialogProps = {
  open: boolean;
  onClose: () => void;
  universeId: string;
  universeName?: string;
};

export function UniverseCoinUsageDialog({ open, onClose, universeId, universeName }: UniverseCoinUsageDialogProps) {
  const { language, localize } = useLocalize();
  const [activityFilter, setActivityFilter] = useState<CoinActivityFilter>("all");
  const [purposeFilter, setPurposeFilter] = useState<CoinPurposeFilter>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<CoinUsageDateRangeFilter>({ from: "", to: "" });
  const effectiveDateFrom = dateRangeFilter.from;
  const effectiveDateTo = dateRangeFilter.to || dateRangeFilter.from;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["universe-coin-usage", universeId, activityFilter, purposeFilter, effectiveDateFrom, effectiveDateTo],
    queryFn: ({ pageParam }) =>
      fetchUniverseCoinUsage({
        universeId,
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
  // 잔액은 페이지 응답에 함께 실려 온다 — coin-updated(universe) 시 refetch로 동기 갱신
  const balance = query.data?.pages[0]?.balance;
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
  const expiryFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
        dateStyle: "medium",
      }),
    [language],
  );

  useEffect(() => {
    if (!open) return;
    return onCoinUpdated((event) => {
      if (event.detail.scope !== "universe") return;
      void refetch();
    });
  }, [open, refetch]);

  useEffect(() => {
    if (!open) return;
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting) return;
        if (!query.hasNextPage || query.isFetchingNextPage) return;
        void query.fetchNextPage();
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, query]);

  return (
    <BottomSheetDialog
      open={open}
      onClose={onClose}
      title={localize({ ko: "코인 사용 내역", en: "Coin activity" })}
      description={
        universeName
          ? localize({
              ko: `${universeName} 유니버스 지갑의 잔액과 사용 내역입니다.`,
              en: `Balance and activity of the ${universeName} universe wallet.`,
            })
          : localize({
              ko: "이 유니버스 지갑의 잔액과 사용 내역입니다.",
              en: "Balance and activity of this universe wallet.",
            })
      }
      panelClassName="md:max-w-md"
      bodyClassName="px-4"
    >
      <div className="py-4">
        {/* 잔액 카드 — 1차 정보. 타이틀 옆이 아니라 본문 상단 카드로 배치 */}
        <div className="rounded-xl border border-border bg-amber-50/60 px-4 py-3 dark:bg-amber-950/20">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {localize({ ko: "유니버스 보유 코인", en: "Universe balance" })}
            </span>
            <span className="inline-flex items-center gap-1 text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
              <Coins className="h-4 w-4" aria-hidden="true" />
              {balance ? balance.total.toLocaleString() : "--"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xxs text-muted-foreground">
            <div className="rounded-lg border bg-surface/70 px-2.5 py-1.5">
              <p>{localize({ ko: "Membership 코인", en: "Membership coins" })}</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-primary-text">
                {balance ? balance.membership.coins.toLocaleString() : "--"}
              </p>
            </div>
            <div className="rounded-lg border bg-surface/70 px-2.5 py-1.5">
              <p>{localize({ ko: "충전 코인", en: "Charged coins" })}</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-primary-text">
                {balance ? balance.charged.coins.toLocaleString() : "--"}
              </p>
            </div>
          </div>
          {balance?.membership?.expiresAt ? (
            <p className="mt-2 text-xxs leading-4 text-muted-foreground">
              {localize({ ko: "Membership 만료", en: "Membership expires" })}:{" "}
              {expiryFormatter.format(new Date(balance.membership.expiresAt))}
            </p>
          ) : null}
          <p className="mt-2 text-xxs leading-4 text-muted-foreground">
            {localize({
              ko: "충전·지급은 운영자 지급으로 관리되며 이 목록에는 사용·환불 기록만 표시됩니다.",
              en: "Charges are managed via operator grants; this list shows usage and refunds only.",
            })}
          </p>
        </div>

        <div className="mb-4 mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select value={activityFilter} onValueChange={(value) => setActivityFilter(value as CoinActivityFilter)}>
              <SelectTrigger size="sm">
                <SelectValue placeholder={localize({ ko: "작업 유형", en: "Activity type" })} />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {localize({ ko: option.ko, en: option.en })}
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
                    {localize({ ko: option.ko, en: option.en })}
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
              {localize({ ko: "필터 초기화", en: "Reset filters" })}
            </Button>
          )}
          {summary && (
            <div className="grid grid-cols-2 gap-2">
              <CoinUsageSummaryPill
                label={primaryUsageSummaryLabel}
                value={Math.max(0, summary.today.usage)}
                tone="usage"
              />
              <CoinUsageSummaryPill
                label={localize({ ko: "조회 범위 사용량", en: "Used in view" })}
                value={Math.max(0, summary.filter.usage)}
                tone="usage"
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
              {localize({ ko: "사용 내역을 불러오지 못했습니다.", en: "Could not load coin activity." })}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {localize({ ko: "다시 시도", en: "Try again" })}
            </Button>
          </div>
        ) : !list.length ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <History className="h-8 w-8" />
            <p className="text-sm">
              {localize({ ko: "아직 코인 사용 내역이 없습니다.", en: "No coin activity yet." })}
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
                  {localize({ ko: "더 보기", en: "Load more" })}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {localize({ ko: "모든 원장을 확인했습니다.", en: "End of ledger." })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </BottomSheetDialog>
  );
}

async function fetchUniverseCoinUsage(args: {
  universeId: string;
  activity: CoinActivityFilter;
  purpose: CoinPurposeFilter;
  dateFrom: string;
  dateTo: string;
  cursor?: string | null;
}) {
  const response = await fetchClient.get<UniverseCoinUsageResponse>(`/universe/${args.universeId}/coin-usage`, {
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
