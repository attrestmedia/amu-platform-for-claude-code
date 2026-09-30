import type { FilterQuery } from "mongoose";
import type { ICoinUsageDocument } from "models/payment/CoinUsageSchema";
import {
  isCoinUsageActivity,
  isCoinUsagePurpose,
} from "./coinUsageAttribution";
import type {
  CoinUsageActivity,
  CoinUsagePurpose,
  CoinUsagePublicContext,
  CoinUsageSource,
} from "types/payment";

/**
 * @docHint
 * @purpose 코인 사용 원장 조회 route((app)/payments/usage, universe/[universeId]/coin-usage)가
 *          공유하는 순수 헬퍼 — 필터 정규화, 날짜/커서 파싱, 원장 행 변환·정렬·요약.
 *          데이터 접근(aggregation)은 coinUsageLedgerQuery, 결제 행 변환(toPaymentLedgerItem)은
 *          사용자 route에 남겨둔다.
 * @domain payment
 * @scope server-global
 */

export type CoinLedgerItem = {
  id: string;
  activity: CoinUsageActivity;
  purpose: CoinUsagePurpose;
  source: CoinUsageSource;
  context?: CoinUsagePublicContext;
  kind: "deduction" | "refund" | "charge" | "subscription_grant";
  amount: number;
  createdAt: Date | string;
};

export type CoinUsageCursor = { time: number; id: string };

export function normalizeActivityFilter(raw: string | null): CoinUsageActivity | "all" {
  const value = String(raw || "all").trim();
  return isCoinUsageActivity(value) ? value : "all";
}

export function normalizePurposeFilter(raw: string | null): CoinUsagePurpose | "all" {
  const value = String(raw || "all").trim();
  return isCoinUsagePurpose(value) ? value : "all";
}

export function getCoinLedgerSortTime(item: Pick<CoinLedgerItem, "createdAt">) {
  return new Date(item.createdAt).getTime() || 0;
}

export function sortCoinLedgerItems(a: CoinLedgerItem, b: CoinLedgerItem) {
  const timeDiff = getCoinLedgerSortTime(b) - getCoinLedgerSortTime(a);
  if (timeDiff !== 0) return timeDiff;
  return b.id.localeCompare(a.id);
}

export function parseCursor(raw: string | null): CoinUsageCursor | null {
  const [timeRaw, id = ""] = String(raw || "").split("_");
  const time = Number(timeRaw);
  if (!Number.isFinite(time) || time <= 0 || !id) return null;
  return { time, id };
}

export function isBeforeCursor(item: CoinLedgerItem, cursor: CoinUsageCursor | null) {
  if (!cursor) return true;
  const time = getCoinLedgerSortTime(item);
  if (time < cursor.time) return true;
  if (time > cursor.time) return false;
  return item.id.localeCompare(cursor.id) < 0;
}

export type CoinUsageDateRange = {
  start?: Date;
  end?: Date;
} | null;

function parseDateValue(rawDate: string | null, offsetMinutes: number) {
  const date = String(rawDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  if (localDate.getFullYear() !== year || localDate.getMonth() !== month - 1 || localDate.getDate() !== day) {
    return null;
  }

  const localStartUtc = Date.UTC(year, month - 1, day) + offsetMinutes * 60_000;
  return new Date(localStartUtc);
}

export function parseDateRange(args: {
  rawDate?: string | null;
  rawDateFrom?: string | null;
  rawDateTo?: string | null;
  rawTimezoneOffsetMinutes: string | null;
}): CoinUsageDateRange {
  const offsetMinutesRaw = Number(args.rawTimezoneOffsetMinutes);
  const offsetMinutes = Number.isFinite(offsetMinutesRaw) ? offsetMinutesRaw : 0;
  const singleDateStart = parseDateValue(args.rawDate ?? null, offsetMinutes);
  if (singleDateStart) {
    return {
      start: singleDateStart,
      end: new Date(singleDateStart.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  const dateFromStart = parseDateValue(args.rawDateFrom ?? null, offsetMinutes);
  const dateToStart = parseDateValue(args.rawDateTo ?? null, offsetMinutes);
  if (!dateFromStart && !dateToStart) return null;

  const start = dateFromStart || undefined;
  const end = dateToStart ? new Date(dateToStart.getTime() + 24 * 60 * 60 * 1000) : undefined;
  if (start && end && start > end) {
    return {
      start: dateToStart || undefined,
      end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  return {
    start,
    end,
  };
}

export function buildCreatedAtQuery(
  dateRange: CoinUsageDateRange,
  cursor: CoinUsageCursor | null,
): FilterQuery<ICoinUsageDocument>["createdAt"] {
  const query: Record<string, Date> = {};
  if (dateRange) {
    if (dateRange.start) query.$gte = dateRange.start;
    if (dateRange.end) query.$lt = dateRange.end;
  }
  if (cursor) {
    const cursorDate = new Date(cursor.time);
    query.$lte = query.$lt && query.$lt < cursorDate ? query.$lt : cursorDate;
  }
  return Object.keys(query).length ? query : undefined;
}

export function toUsageLedgerItem(document: {
  _id: unknown;
  coins: number;
  resolvedActivity: CoinUsageActivity;
  resolvedPurpose: CoinUsagePurpose;
  resolvedSource: CoinUsageSource;
  meta?: {
    kind?: unknown;
    channel?: unknown;
  } & Record<string, unknown>;
  createdAt: Date | string;
}): CoinLedgerItem {
  const isRefund = document.coins < 0 || document.meta?.kind === "refund";
  const channel = String(document.meta?.channel || "").trim().slice(0, 40);
  return {
    id: `usage:${String(document._id)}`,
    activity: document.resolvedActivity,
    purpose: document.resolvedPurpose,
    source: document.resolvedSource,
    ...(channel ? { context: { channel } } : {}),
    kind: isRefund ? "refund" : "deduction",
    amount: document.coins === 0 ? 0 : -document.coins,
    createdAt: document.createdAt,
  };
}

export function getLedgerSummary(items: CoinLedgerItem[]) {
  return items.reduce(
    (summary, item) => {
      if (item.kind === "deduction") {
        summary.usage += Math.abs(item.amount);
      } else if (item.kind === "refund") {
        summary.usage -= Math.abs(item.amount);
      } else {
        summary.credit += item.amount;
      }
      summary.net += item.amount;
      return summary;
    },
    { usage: 0, credit: 0, net: 0 },
  );
}
