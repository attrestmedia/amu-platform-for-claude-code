import "server-only";
import type { PipelineStage } from "mongoose";
import { MONGODB_BILLING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { CoinUsageSchema, type ICoinUsageDocument } from "models/payment/CoinUsageSchema";
import type { CoinUsageActivity, CoinUsagePurpose, CoinUsageSource } from "types/payment";
import { buildCoinUsageAttributionAggregationStage } from "./coinUsageAttribution";

/**
 * @docHint
 * @purpose 신규·레거시 코인 사용 원장을 동일 목적 계약으로 조회하고 정확한 사용 합계 계산
 * @process uid/날짜 선필터 → 귀속 계산 → 활동/목적 필터 → 목록 또는 전체 합계 aggregation
 * @domain payment
 * @scope server-global
 */

export type CoinUsageQueryFilter = {
  activity: CoinUsageActivity | "all";
  purpose: CoinUsagePurpose | "all";
};

export type CoinUsageQueryDocument = {
  _id: unknown;
  app?: string;
  billingKey?: string;
  coins: number;
  resolvedActivity: CoinUsageActivity;
  resolvedPurpose: CoinUsagePurpose;
  resolvedSource: CoinUsageSource;
  meta?: {
    kind?: unknown;
    route?: unknown;
    operation?: unknown;
    channel?: unknown;
    source?: unknown;
  };
  createdAt: Date | string;
};

export type CoinUsageEvidenceDocument = {
  _id: unknown;
  operationId?: string;
  billingKey?: string;
  coins: number;
  entryType?: string;
  state?: string;
  createdAt: Date | string;
};

type CoinUsageCreatedAtQuery = Record<"$gte" | "$lt" | "$lte", Date> | Partial<Record<"$gte" | "$lt" | "$lte", Date>>;

async function getCoinUsageModel() {
  return getModel<ICoinUsageDocument>(MONGODB_BILLING_URL, "CoinUsage", CoinUsageSchema, "coin_usages");
}

function buildBasePipeline(args: {
  uid: string;
  createdAt?: CoinUsageCreatedAtQuery;
  filter: CoinUsageQueryFilter;
}): PipelineStage[] {
  const match: Record<string, unknown> = {
    uid: args.uid,
    coins: { $ne: 0 },
    $or: [{ state: "applied" }, { state: { $exists: false } }],
  };
  if (args.createdAt && Object.keys(args.createdAt).length) match.createdAt = args.createdAt;

  const pipeline: PipelineStage[] = [
    { $match: match },
    buildCoinUsageAttributionAggregationStage() as PipelineStage.Set,
  ];
  if (args.filter.activity !== "all") {
    pipeline.push({ $match: { resolvedActivity: args.filter.activity } });
  }
  if (args.filter.purpose !== "all") {
    pipeline.push({ $match: { resolvedPurpose: args.filter.purpose } });
  }
  return pipeline;
}

export async function fetchAttributedCoinUsageDocuments(args: {
  uid: string;
  createdAt?: CoinUsageCreatedAtQuery;
  filter: CoinUsageQueryFilter;
  limit: number;
}) {
  const CoinUsage = await getCoinUsageModel();
  return CoinUsage.aggregate<CoinUsageQueryDocument>([
    ...buildBasePipeline(args),
    { $sort: { createdAt: -1, _id: -1 } },
    { $limit: args.limit },
    {
      $project: {
        app: 1,
        billingKey: 1,
        coins: 1,
        resolvedActivity: 1,
        resolvedPurpose: 1,
        resolvedSource: 1,
        "meta.kind": 1,
        "meta.route": 1,
        "meta.operation": 1,
        "meta.channel": 1,
        "meta.source": 1,
        createdAt: 1,
      },
    },
  ]);
}

export async function summarizeAttributedCoinUsage(args: {
  uid: string;
  createdAt?: CoinUsageCreatedAtQuery;
  filter: CoinUsageQueryFilter;
}) {
  const CoinUsage = await getCoinUsageModel();
  const [summary] = await CoinUsage.aggregate<{ deduction: number; refund: number }>([
    ...buildBasePipeline(args),
    {
      $group: {
        _id: null,
        deduction: { $sum: { $cond: [{ $gt: ["$coins", 0] }, "$coins", 0] } },
        refund: { $sum: { $cond: [{ $lt: ["$coins", 0] }, { $abs: "$coins" }, 0] } },
      },
    },
  ]);
  const usage = Math.max(0, Number(summary?.deduction || 0) - Number(summary?.refund || 0));
  return { usage, credit: 0, net: -usage };
}

export async function fetchCoinUsageEvidenceByOperationIds(args: {
  uid: string;
  operationIds: string[];
}) {
  const operationIds = Array.from(
    new Set(
      (args.operationIds || [])
        .map((operationId) => String(operationId || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 10);
  if (!args.uid.trim() || operationIds.length === 0) return [] as CoinUsageEvidenceDocument[];

  const CoinUsage = await getCoinUsageModel();
  return CoinUsage.find({
    uid: args.uid.trim(),
    operationId: { $in: operationIds },
  })
    .select({
      _id: 1,
      operationId: 1,
      billingKey: 1,
      coins: 1,
      entryType: 1,
      state: 1,
      createdAt: 1,
    })
    .sort({ createdAt: 1, _id: 1 })
    .lean<CoinUsageEvidenceDocument[]>();
}
