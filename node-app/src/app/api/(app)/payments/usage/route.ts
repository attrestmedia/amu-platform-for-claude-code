import { NextRequest, NextResponse } from "next/server";
import type { FilterQuery, Model } from "mongoose";
import { MONGODB_BILLING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { PaymentBaseModel, type IPaymentBaseDocument } from "models/payment";
import { ensureUserPaymentModel, resolveRecordedUserPaymentCoins } from "libs/server-utils/payment/paymentUtils";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  fetchAttributedCoinUsageDocuments,
  summarizeAttributedCoinUsage,
} from "libs/server-utils/payment/coinUsageLedgerQuery";
import {
  buildCreatedAtQuery,
  getCoinLedgerSortTime,
  getLedgerSummary,
  isBeforeCursor,
  normalizeActivityFilter,
  normalizePurposeFilter,
  parseCursor,
  parseDateRange,
  sortCoinLedgerItems,
  toUsageLedgerItem,
  type CoinLedgerItem,
  type CoinUsageDateRange,
} from "libs/server-utils/payment/coinUsageRouteHelpers";
import type { CoinUsageActivity, CoinUsagePurpose } from "types/payment";

export const runtime = "nodejs";


type CoinUsageFilter = {
  activity: CoinUsageActivity | "all";
  purpose: CoinUsagePurpose | "all";
};

function toPaymentLedgerItem(document: {
  _id: unknown;
  purpose?: string;
  amount?: number;
  stageCount?: number;
  packAmount?: number;
  customAmount?: number;
  paidCoins?: number;
  bonusCoins?: number;
  appliedAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
}): CoinLedgerItem {
  const isSubscription = document.purpose === "subscription";
  return {
    id: `payment:${String(document._id)}`,
    activity: isSubscription ? "subscription_grant" : "coin_charge",
    purpose: isSubscription ? "coin.subscription_grant" : "coin.charge",
    source: "system",
    kind: isSubscription ? "subscription_grant" : "charge",
    amount: resolveRecordedUserPaymentCoins(document),
    createdAt: document.appliedAt || document.updatedAt || document.createdAt || new Date(0),
  };
}

async function fetchLedgerItems(args: {
  uid: string;
  limit: number;
  filter: CoinUsageFilter;
  dateRange: CoinUsageDateRange;
  cursor: ReturnType<typeof parseCursor>;
}) {
  const { uid, limit, filter, dateRange, cursor } = args;
  const createdAtQuery = buildCreatedAtQuery(dateRange, cursor);

  const PaymentBase = await getModel<IPaymentBaseDocument>(
    MONGODB_BILLING_URL,
    "PaymentBase",
    PaymentBaseModel.schema,
    "payments",
  );
  const Payment = ensureUserPaymentModel(PaymentBase as unknown as Model<IPaymentBaseDocument>);

  const paymentQuery: FilterQuery<IPaymentBaseDocument & { uid?: string; purpose?: string }> = {
    uid,
    scope: "user",
    status: "confirmed",
    applied: true,
  };
  const paymentCreatedAtQuery = buildCreatedAtQuery(dateRange, cursor);
  if (paymentCreatedAtQuery) {
    paymentQuery.appliedAt = {
      ...(paymentCreatedAtQuery.$gte ? { $gte: paymentCreatedAtQuery.$gte } : {}),
      ...(paymentCreatedAtQuery.$lt ? { $lt: paymentCreatedAtQuery.$lt } : {}),
      ...(paymentCreatedAtQuery.$lte ? { $lte: paymentCreatedAtQuery.$lte } : {}),
    };
  }

  const shouldFetchUsage =
    (filter.activity === "all" || !["coin_charge", "subscription_grant"].includes(filter.activity)) &&
    !["coin.charge", "coin.subscription_grant"].includes(filter.purpose);
  const shouldFetchPayments =
    (filter.activity === "all" || ["coin_charge", "subscription_grant"].includes(filter.activity)) &&
    (filter.purpose === "all" || ["coin.charge", "coin.subscription_grant"].includes(filter.purpose));

  const [usageDocuments, paymentDocuments] = await Promise.all([
    shouldFetchUsage
      ? fetchAttributedCoinUsageDocuments({
          uid,
          createdAt: createdAtQuery,
          filter,
          limit: limit + 1,
        })
      : [],
    shouldFetchPayments
      ? Payment.find(paymentQuery)
          .select({
            purpose: 1,
            amount: 1,
            stageCount: 1,
            packAmount: 1,
            customAmount: 1,
            paidCoins: 1,
            bonusCoins: 1,
            appliedAt: 1,
            updatedAt: 1,
            createdAt: 1,
          })
          .sort({ appliedAt: -1, createdAt: -1 })
          .limit(limit + 1)
          .lean()
      : [],
  ]);

  return [
    ...usageDocuments.map(toUsageLedgerItem),
    ...paymentDocuments.map(toPaymentLedgerItem),
  ]
    .filter((item) => filter.activity === "all" || item.activity === filter.activity)
    .filter((item) => filter.purpose === "all" || item.purpose === filter.purpose)
    .filter((item) => isBeforeCursor(item, cursor))
    .sort(sortCoinLedgerItems);
}

async function fetchLedgerSummary(args: {
  uid: string;
  filter: CoinUsageFilter;
  dateRange: CoinUsageDateRange;
}) {
  const { uid, filter, dateRange } = args;
  const createdAtQuery = buildCreatedAtQuery(dateRange, null);
  const shouldFetchUsage =
    (filter.activity === "all" || !["coin_charge", "subscription_grant"].includes(filter.activity)) &&
    !["coin.charge", "coin.subscription_grant"].includes(filter.purpose);
  const shouldFetchPayments =
    (filter.activity === "all" || ["coin_charge", "subscription_grant"].includes(filter.activity)) &&
    (filter.purpose === "all" || ["coin.charge", "coin.subscription_grant"].includes(filter.purpose));

  const PaymentBase = await getModel<IPaymentBaseDocument>(
    MONGODB_BILLING_URL,
    "PaymentBase",
    PaymentBaseModel.schema,
    "payments",
  );
  const Payment = ensureUserPaymentModel(PaymentBase as unknown as Model<IPaymentBaseDocument>);
  const paymentQuery: FilterQuery<IPaymentBaseDocument & { uid?: string; purpose?: string }> = {
    uid,
    scope: "user",
    status: "confirmed",
    applied: true,
  };
  if (createdAtQuery) {
    paymentQuery.appliedAt = {
      ...(createdAtQuery.$gte ? { $gte: createdAtQuery.$gte } : {}),
      ...(createdAtQuery.$lt ? { $lt: createdAtQuery.$lt } : {}),
    };
  }

  const [usageSummary, paymentDocuments] = await Promise.all([
    shouldFetchUsage
      ? summarizeAttributedCoinUsage({ uid, createdAt: createdAtQuery, filter })
      : Promise.resolve({ usage: 0, credit: 0, net: 0 }),
    shouldFetchPayments
      ? Payment.find(paymentQuery)
          .select({
            purpose: 1,
            amount: 1,
            stageCount: 1,
            packAmount: 1,
            customAmount: 1,
            paidCoins: 1,
            bonusCoins: 1,
            appliedAt: 1,
            updatedAt: 1,
            createdAt: 1,
          })
          .lean()
      : [],
  ]);
  const paymentSummary = getLedgerSummary(
    paymentDocuments
      .map(toPaymentLedgerItem)
      .filter((item) => filter.activity === "all" || item.activity === filter.activity)
      .filter((item) => filter.purpose === "all" || item.purpose === filter.purpose),
  );

  return {
    usage: usageSummary.usage,
    credit: paymentSummary.credit,
    net: paymentSummary.credit - usageSummary.usage,
  };
}

/**
 * @docHint
 * @purpose 로그인 사용자의 개인 코인 지갑 거래 원장 조회
 * @process 인증 사용자 uid 확정 → 작업/날짜 범위 조회 조건 정규화 → 사용/환불/충전/구독 지급 내역 병합 → 커서 및 합계 응답
 * @domain payment
 * @scope user-api
 */
async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = String(user?.uid || user?.ID || "").trim();
  if (!uid) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 20);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.floor(requestedLimit))) : 20;
  const filter: CoinUsageFilter = {
    activity: normalizeActivityFilter(request.nextUrl.searchParams.get("activity")),
    purpose: normalizePurposeFilter(request.nextUrl.searchParams.get("purpose")),
  };
  const timezoneOffsetMinutes = request.nextUrl.searchParams.get("timezoneOffsetMinutes");
  const dateRange = parseDateRange({
    rawDate: request.nextUrl.searchParams.get("date"),
    rawDateFrom: request.nextUrl.searchParams.get("dateFrom"),
    rawDateTo: request.nextUrl.searchParams.get("dateTo"),
    rawTimezoneOffsetMinutes: timezoneOffsetMinutes,
  });
  const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));
  const todayForClient = new Date(Date.now() - Number(timezoneOffsetMinutes || 0) * 60_000).toISOString().slice(0, 10);
  const summaryDateRange =
    dateRange ??
    parseDateRange({
      rawDate: todayForClient,
      rawTimezoneOffsetMinutes: timezoneOffsetMinutes,
    });

  const [itemsForPage, itemsForFilterSummary, itemsForTodaySummary] = await Promise.all([
    fetchLedgerItems({ uid, limit, filter, dateRange, cursor }),
    fetchLedgerSummary({ uid, filter, dateRange }),
    fetchLedgerSummary({ uid, filter, dateRange: summaryDateRange }),
  ]);

  const pageItems = itemsForPage.slice(0, limit);
  const tail = pageItems[pageItems.length - 1] || null;
  const nextCursor = itemsForPage.length > limit && tail ? `${getCoinLedgerSortTime(tail)}_${tail.id}` : null;

  const response = NextResponse.json({
    list: pageItems,
    nextCursor,
    summary: {
      filter: itemsForFilterSummary,
      today: itemsForTodaySummary,
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const GET = withAuth(handleGET, undefined, "payments/usage:get", { bodyParser: "none" });
