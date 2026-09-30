import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import {
  fetchAttributedCoinUsageDocuments,
  summarizeAttributedCoinUsage,
} from "libs/server-utils/payment/coinUsageLedgerQuery";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import { resolveUniverseWalletPolicyState } from "utils/payment";
import {
  buildCreatedAtQuery,
  getCoinLedgerSortTime,
  isBeforeCursor,
  normalizeActivityFilter,
  normalizePurposeFilter,
  parseCursor,
  parseDateRange,
  toUsageLedgerItem,
  type CoinLedgerItem,
} from "libs/server-utils/payment/coinUsageRouteHelpers";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 유니버스(커머스 지갑) 코인 사용 원장과 잔액 조회 — 스마트스토어 운영 화면의
 *          "코인 사용 내역" 팝업 전용이다. 사용자 개인 원장(/payments/usage)과 분리된다.
 * @process requireEdit 권한 검증 → 유니버스 원장(uid=universe:{id}) 조회/요약 → 지갑 잔액(membership+charged) 병합 응답
 * @domain payment
 * @scope universe
 *
 * 유니버스 AI 과금은 chargeAIUsageForUniverse가 coin_usages에 uid=`universe:{id}`로 기록하므로
 * 사용자 원장과 동일한 attributed aggregation을 재사용한다. 충전·지급은 어드민 grant로 지갑을
 * 직접 증감하기 때문에 결제 원장 병합 대상이 아니다.
 */

function resolveUniverseLedgerUid(universeId: string) {
  return `universe:${universeId}`;
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest, context: NextRouteContext) {
  const universeId = String(context?.params?.universeId || "").trim();
  if (!universeId) return NextResponse.json({ error: "universeId가 필요합니다." }, { status: 400 });

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 20);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.floor(requestedLimit))) : 20;
  const filter = {
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

  const uid = resolveUniverseLedgerUid(universeId);
  const createdAtQuery = buildCreatedAtQuery(dateRange, cursor);
  const [usageDocuments, filterSummary, todaySummary, universeDocument] = await Promise.all([
    fetchAttributedCoinUsageDocuments({
      uid,
      createdAt: createdAtQuery,
      filter,
      limit: limit + 1,
    }),
    summarizeAttributedCoinUsage({ uid, createdAt: buildCreatedAtQuery(dateRange, null), filter }),
    summarizeAttributedCoinUsage({ uid, createdAt: buildCreatedAtQuery(summaryDateRange, null), filter }),
    ensureUniverseWalletLifecycle(universeId),
  ]);

  if (!universeDocument) {
    return NextResponse.json({ error: "유니버스를 찾을 수 없습니다." }, { status: 404 });
  }

  const uni = universeDocument.toObject();
  const policy = resolveUniverseWalletPolicyState(uni.wallet);
  const membershipCoins = Math.max(0, Number(policy.membershipCoins || 0));
  const chargedCoins = Math.max(0, Number(uni.wallet?.charged?.coins || 0));

  const items: CoinLedgerItem[] = usageDocuments
    .map(toUsageLedgerItem)
    .filter((item) => filter.activity === "all" || item.activity === filter.activity)
    .filter((item) => filter.purpose === "all" || item.purpose === filter.purpose)
    .filter((item) => isBeforeCursor(item, cursor))
    .sort((a, b) => {
      const timeDiff = getCoinLedgerSortTime(b) - getCoinLedgerSortTime(a);
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

  const pageItems = items.slice(0, limit);
  const tail = pageItems[pageItems.length - 1] || null;
  const nextCursor = items.length > limit && tail ? `${getCoinLedgerSortTime(tail)}_${tail.id}` : null;

  const response = NextResponse.json({
    list: pageItems,
    nextCursor,
    summary: {
      filter: filterSummary,
      today: todaySummary,
    },
    balance: {
      membership: {
        coins: membershipCoins,
        expiresAt: uni.wallet?.membership?.expiresAt || null,
      },
      charged: { coins: chargedCoins },
      total: membershipCoins + chargedCoins,
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const GET = withAuth(handleGET, undefined, "universe_coin_usage_list", {
  checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
  bodyParser: "none",
});
