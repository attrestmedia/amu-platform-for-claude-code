import "server-only";
import { MONGODB_BILLING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { CoinUsageSchema, type ICoinUsageDocument } from "models/payment/CoinUsageSchema";
import { AiCostMonitorWindowTooLargeError, MAX_WINDOW_ROWS } from "./costMonitorWindow";

/**
 * @docHint
 * @purpose billing DB에서 집계용 coin usage 행만 읽는다
 * @process 상태·window 요약과 제한된 operation 연결 자료를 반환한다
 * @domain database
 * @scope server
 */

const COLLECTION = "coin_usages";
const INCLUDED_STATES = ["applied", "prepared", "failed", "unknown_outcome", "reconciliation_required"];
const APPLIED_ENTRY_TYPES = ["deduction", "refund", "compensation"];

export type AiCostMonitorCoinUsageSummary = {
  state: string;
  entryType: string;
  count: number;
  coins: number;
  absoluteCoins: number;
};

export type AiCostMonitorAppliedCoinUsage = {
  operationId: string;
  entryType: string;
  coins: number;
};

export type AiCostMonitorCoinUsageRead = {
  summaries: AiCostMonitorCoinUsageSummary[];
  appliedEntries: AiCostMonitorAppliedCoinUsage[];
  latestDocumentAt: Date | null;
};

type CoinUsageFacet = {
  summaries: Array<{
    _id: { state: string; entryType?: string; app?: string };
    count: number;
    coins: number;
    absoluteCoins: number;
  }>;
  appliedEntries: Array<{ operationId?: string; entryType: string; coins: number }>;
};
type LatestDocument = { createdAt?: Date };

async function getCoinUsageModel() {
  return getModel<ICoinUsageDocument>(MONGODB_BILLING_URL, "CoinUsage", CoinUsageSchema, COLLECTION);
}

export async function readAiCostMonitorCoinUsage(window: { from: Date; to: Date }): Promise<AiCostMonitorCoinUsageRead> {
  const model = await getCoinUsageModel();
  const [facets, latestRows] = await Promise.all([
    model.aggregate<CoinUsageFacet>([
      { $match: { state: { $in: INCLUDED_STATES }, createdAt: { $gte: window.from, $lt: window.to } } },
      {
        $facet: {
          summaries: [
            {
              $group: {
                _id: { state: "$state", entryType: "$entryType", app: "$app" },
                count: { $sum: 1 },
                coins: { $sum: "$coins" },
                absoluteCoins: { $sum: { $abs: "$coins" } },
              },
            },
          ],
          appliedEntries: [
            { $match: { state: "applied", entryType: { $in: APPLIED_ENTRY_TYPES } } },
            { $project: { _id: 0, operationId: { $ifNull: ["$operationId", ""] }, entryType: 1, coins: 1 } },
            { $limit: MAX_WINDOW_ROWS + 1 },
          ],
        },
      },
    ]).exec(),
    model.find({}, { createdAt: 1 }).sort({ _id: -1 }).limit(1).lean<LatestDocument[]>(),
  ]);

  const facet = facets[0] || { summaries: [], appliedEntries: [] };
  if (facet.appliedEntries.length > MAX_WINDOW_ROWS) throw new AiCostMonitorWindowTooLargeError();

  const latest = latestRows[0]?.createdAt;
  return {
    summaries: facet.summaries.map((row) => ({
      state: String(row._id.state || "unknown"),
      entryType: String(row._id.entryType || ""),
      count: Number(row.count || 0),
      coins: Number(row.coins || 0),
      absoluteCoins: Number(row.absoluteCoins || 0),
    })),
    appliedEntries: facet.appliedEntries.map((row) => ({
      operationId: String(row.operationId || ""),
      entryType: String(row.entryType || ""),
      coins: Number(row.coins || 0),
    })),
    latestDocumentAt: latest instanceof Date && Number.isFinite(latest.getTime()) ? latest : null,
  };
}
