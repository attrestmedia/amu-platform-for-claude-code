import "server-only";
import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingGaSnapshotSchema,
  type IMarketingGaSnapshotDocument,
  type MarketingGaReportKey,
} from "models/marketing";

/**
 * @docHint
 * @purpose GA4 원시 스냅샷(marketing_ga_snapshots) 데이터 접근 로직
 * @process snapshotId 멱등 키 기반 bulk upsert와 기간/리포트 조회 수행
 * @domain marketing
 * @scope server
 */

const GA_SNAPSHOT_COLLECTION = "marketing_ga_snapshots";

async function getMarketingGaSnapshotModel() {
  return await getModel<IMarketingGaSnapshotDocument>(
    MONGODB_MARKETING_URL,
    "MarketingGaSnapshot",
    MarketingGaSnapshotSchema,
    GA_SNAPSHOT_COLLECTION,
  );
}

export function buildGaSnapshotId(args: {
  universeId: string;
  propertyId: string;
  reportKey: MarketingGaReportKey;
  date: string;
  dimensions: Record<string, string>;
}) {
  const propertyKey = String(args.propertyId || "").replace(/^properties\//, "");
  const dimensionHash = crypto
    .createHash("sha1")
    .update(JSON.stringify(args.dimensions))
    .digest("hex")
    .slice(0, 16);
  return `${args.universeId}:${propertyKey}:${args.reportKey}:${args.date}:${dimensionHash}`;
}

export async function upsertMarketingGaSnapshots(
  rows: Array<{
    universeId: string;
    propertyId: string;
    reportKey: MarketingGaReportKey;
    date: string;
    dimensions: Record<string, string>;
    metrics: Record<string, number>;
  }>,
) {
  if (rows.length === 0) return { upserted: 0 };
  const model = await getMarketingGaSnapshotModel();
  const collectedAt = new Date();

  const operations = rows.map((row) => ({
    updateOne: {
      filter: { snapshotId: buildGaSnapshotId(row) },
      update: {
        $set: {
          universeId: row.universeId,
          propertyId: row.propertyId,
          reportKey: row.reportKey,
          date: row.date,
          dimensions: row.dimensions,
          metrics: row.metrics,
          collectedAt,
        },
        $setOnInsert: { snapshotId: buildGaSnapshotId(row) },
      },
      upsert: true,
    },
  }));

  const result = await model.bulkWrite(operations, { ordered: false });
  return { upserted: result.upsertedCount + result.modifiedCount };
}

export async function listMarketingGaSnapshots(params: {
  universeId: string;
  reportKey?: MarketingGaReportKey | MarketingGaReportKey[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  const model = await getMarketingGaSnapshotModel();
  const query: Record<string, unknown> = { universeId: params.universeId };

  if (params.reportKey) {
    query.reportKey = Array.isArray(params.reportKey) ? { $in: params.reportKey } : params.reportKey;
  }
  if (params.dateFrom || params.dateTo) {
    query.date = {
      ...(params.dateFrom ? { $gte: params.dateFrom } : {}),
      ...(params.dateTo ? { $lte: params.dateTo } : {}),
    };
  }

  return await model
    .find(query)
    .sort({ date: -1 })
    .limit(Math.min(params.limit ?? 1000, 5000))
    .lean();
}
