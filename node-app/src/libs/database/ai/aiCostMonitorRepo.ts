import "server-only";
import type { Model } from "mongoose";
import { MONGODB_AI_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { AiCostMonitorWindowTooLargeError, MAX_WINDOW_ROWS } from "libs/server-utils/ai/costMonitor/costMonitorWindow";
import { AiCostLedgerSchema, type IAiCostLedgerDocument } from "models/ai/AiCostLedgerSchema";
import { AiCostTraceSchema, type IAiCostTraceDocument } from "models/ai/AiCostTraceSchema";
import { AudioGenJobSchema, type IAudioGenJobDocument } from "models/lab/AudioGenJobSchema";
import { VideoGenJobSchema, type IVideoGenJobDocument } from "models/lab/VideoGenJobSchema";

/**
 * @docHint
 * @purpose AI DB의 trace·cost ledger·job 상태를 window 단위로 집계한다
 * @process 기존 모델에서 조회·aggregation 결과만 반환한다
 * @domain database
 * @scope server
 */

export type AiCostMonitorTraceCountRow = {
  provider: string;
  model: string;
  workflow: string;
  traceClass: string;
  resultStatus: string;
  count: number;
};

export type AiCostMonitorCallLatencyRow = {
  provider: string;
  model: string;
  workflow: string;
  traceClass: string;
  percentiles: number[];
};

export type AiCostMonitorClassLatencyRow = {
  traceClass: string;
  percentiles: number[];
};

export type AiCostMonitorJobCountRow = {
  workflow: string;
  resultStatus: string;
  count: number;
};

export type AiCostMonitorLedgerOperationRow = {
  provider: string;
  model: string;
  modality: string;
  source: string;
  operationId: string;
  coinChargeState: string;
  rows: number;
  knownCostRows: number;
  unknownCostRows: number;
  knownCostUsd: number;
  ledgerCoins: number;
};

export type AiCostMonitorTraceAndLedgerRead = {
  traceCounts: AiCostMonitorTraceCountRow[];
  callLatencies: AiCostMonitorCallLatencyRow[];
  classLatencies: AiCostMonitorClassLatencyRow[];
  jobCounts: AiCostMonitorJobCountRow[];
  ledgerOperations: AiCostMonitorLedgerOperationRow[];
  latestDocumentAt: { traces: Date | null; ledger: Date | null };
};

type PercentileRow = { _id: Record<string, string>; percentiles: number[] };
type TraceCallFacet = {
  counts: Array<{ _id: Record<string, string>; count: number }>;
  callLatencies: PercentileRow[];
  classLatencies: PercentileRow[];
};

type JobStatusBucket = { _id: { workflow: string; resultStatus: string }; count: number };
type LedgerBucket = {
  _id: {
    provider: string;
    model: string;
    modality: string;
    source: string;
    operationId: string;
    coinChargeState: string;
  };
  rows: number;
  knownCostRows: number;
  unknownCostRows: number;
  knownCostUsd: number;
  ledgerCoins: number;
};
type LatestDocument = { createdAt?: Date };
type JobReservationDocument = {
  status?: string;
  billing?: { reserveOperationId?: string; settlementState?: string };
};

const TRACE_COLLECTION = "ai_cost_traces";
const LEDGER_COLLECTION = "ai_cost_ledger";
const VIDEO_JOB_COLLECTION = "video_gen_jobs";
const AUDIO_JOB_COLLECTION = "audio_gen_jobs";

async function getTraceModel() {
  return getModel<IAiCostTraceDocument>(MONGODB_AI_URL, "AiCostTrace", AiCostTraceSchema, TRACE_COLLECTION);
}

async function getLedgerModel() {
  return getModel<IAiCostLedgerDocument>(MONGODB_AI_URL, "AiCostLedger", AiCostLedgerSchema, LEDGER_COLLECTION);
}

async function getVideoJobModel() {
  return getModel<IVideoGenJobDocument>(MONGODB_AI_URL, "VideoGenJob", VideoGenJobSchema, VIDEO_JOB_COLLECTION);
}

async function getAudioJobModel() {
  return getModel<IAudioGenJobDocument>(MONGODB_AI_URL, "AudioGenJob", AudioGenJobSchema, AUDIO_JOB_COLLECTION);
}

async function latestCreatedAt<T>(model: Model<T>) {
  const rows = await model.find({}, { createdAt: 1 }).sort({ _id: -1 }).limit(1).lean<LatestDocument[]>();
  const value = rows[0]?.createdAt;
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

export async function readAiCostMonitorTraceAndLedger(window: { from: Date; to: Date }): Promise<AiCostMonitorTraceAndLedgerRead> {
  const [traceModel, ledgerModel] = await Promise.all([getTraceModel(), getLedgerModel()]);
  const traceClass = { $ifNull: ["$metadata.traceClass", "billable"] };
  const completedStatusMatch = { resultStatus: { $in: ["success", "partial", "failed"] }, durationMs: { $type: "number" } };
  const timeRange = { $gte: window.from, $lt: window.to };

  const callPipeline = [
      { $match: { traceRole: "provider_call", workflow: { $ne: "ai-billing-v1" }, startedAt: timeRange } },
      {
        $facet: {
          counts: [
            {
              $group: {
                _id: {
                  provider: "$provider",
                  model: "$model",
                  workflow: "$workflow",
                  traceClass,
                  resultStatus: "$resultStatus",
                },
                count: { $sum: 1 },
              },
            },
          ],
          callLatencies: [
            { $match: completedStatusMatch },
            {
              $group: {
                _id: { provider: "$provider", model: "$model", workflow: "$workflow", traceClass },
                percentiles: { $percentile: { input: "$durationMs", p: [0.5, 0.95], method: "approximate" } },
              },
            },
          ],
          classLatencies: [
            { $match: completedStatusMatch },
            {
              $group: {
                _id: { traceClass },
                percentiles: { $percentile: { input: "$durationMs", p: [0.5, 0.95], method: "approximate" } },
              },
            },
          ],
        },
      },
    ] as never;

  const [callFacet, jobBuckets, ledgerBuckets, latestTrace, latestLedger] = await Promise.all([
    traceModel.aggregate<TraceCallFacet>(callPipeline).exec(),
    traceModel.aggregate<JobStatusBucket>([
      { $match: { traceRole: "workflow", workflow: { $ne: "ai-billing-v1" }, startedAt: timeRange } },
      { $group: { _id: { workflow: "$workflow", resultStatus: "$resultStatus" }, count: { $sum: 1 } } },
    ]).exec(),
    ledgerModel.aggregate<LedgerBucket>([
      { $match: { createdAt: timeRange } },
      {
        $group: {
          _id: {
            provider: "$provider",
            model: "$model",
            modality: "$modality",
            source: "$source",
            operationId: { $ifNull: ["$coinCharge.operationId", ""] },
            coinChargeState: "$coinCharge.state",
          },
          rows: { $sum: 1 },
          knownCostRows: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$providerCost.amount", null] }, { $ne: ["$providerCost.source", "unavailable"] }] },
                1,
                0,
              ],
            },
          },
          unknownCostRows: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$providerCost.amount", null] }, { $ne: ["$providerCost.source", "unavailable"] }] },
                0,
                1,
              ],
            },
          },
          knownCostUsd: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$providerCost.amount", null] }, { $ne: ["$providerCost.source", "unavailable"] }] },
                "$providerCost.amount",
                0,
              ],
            },
          },
          ledgerCoins: { $sum: { $ifNull: ["$coinCharge.coins", 0] } },
        },
      },
      { $limit: MAX_WINDOW_ROWS + 1 },
    ]).exec(),
    latestCreatedAt(traceModel),
    latestCreatedAt(ledgerModel),
  ]);

  if (ledgerBuckets.length > MAX_WINDOW_ROWS) throw new AiCostMonitorWindowTooLargeError();

  const facet = callFacet[0] || { counts: [], callLatencies: [], classLatencies: [] };
  return {
    traceCounts: facet.counts.map((row) => ({
      provider: String(row._id.provider || "unknown"),
      model: String(row._id.model || "unknown"),
      workflow: String(row._id.workflow || "unknown"),
      traceClass: String(row._id.traceClass || "billable"),
      resultStatus: String(row._id.resultStatus || "unknown"),
      count: Number(row.count || 0),
    })),
    callLatencies: facet.callLatencies.map((row) => ({
      provider: String(row._id.provider || "unknown"),
      model: String(row._id.model || "unknown"),
      workflow: String(row._id.workflow || "unknown"),
      traceClass: String(row._id.traceClass || "billable"),
      percentiles: Array.isArray(row.percentiles) ? row.percentiles.map(Number) : [],
    })),
    classLatencies: facet.classLatencies.map((row) => ({
      traceClass: String(row._id.traceClass || "billable"),
      percentiles: Array.isArray(row.percentiles) ? row.percentiles.map(Number) : [],
    })),
    jobCounts: jobBuckets.map((row) => ({
      workflow: String(row._id.workflow || "unknown"),
      resultStatus: String(row._id.resultStatus || "unknown"),
      count: Number(row.count || 0),
    })),
    ledgerOperations: ledgerBuckets.map((row) => ({
      provider: String(row._id.provider || "unknown"),
      model: String(row._id.model || "unknown"),
      modality: String(row._id.modality || "text"),
      source: String(row._id.source || "billable"),
      operationId: String(row._id.operationId || ""),
      coinChargeState: String(row._id.coinChargeState || "none"),
      rows: Number(row.rows || 0),
      knownCostRows: Number(row.knownCostRows || 0),
      unknownCostRows: Number(row.unknownCostRows || 0),
      knownCostUsd: Number(row.knownCostUsd || 0),
      ledgerCoins: Number(row.ledgerCoins || 0),
    })),
    latestDocumentAt: { traces: latestTrace, ledger: latestLedger },
  };
}

export async function readAiCostMonitorReservationOperationIds() {
  const [videoModel, audioModel] = await Promise.all([getVideoJobModel(), getAudioJobModel()]);
  const reservationFilter = {
    $or: [
      { status: { $in: ["queued", "running"] } },
      { "billing.settlementState": "reconciliation_required" },
    ],
  };
  const projection = { status: 1, "billing.reserveOperationId": 1, "billing.settlementState": 1 };
  const [videoJobs, audioJobs] = await Promise.all([
    videoModel.find(reservationFilter, projection).lean<JobReservationDocument[]>(),
    audioModel.find(reservationFilter, projection).lean<JobReservationDocument[]>(),
  ]);

  const held = new Set<string>();
  const reconciliation = new Set<string>();
  for (const job of [...videoJobs, ...audioJobs]) {
    const operationId = String(job.billing?.reserveOperationId || "").trim();
    if (!operationId) continue;
    if (job.billing?.settlementState === "reconciliation_required") reconciliation.add(operationId);
    else if (job.status === "queued" || job.status === "running") held.add(operationId);
  }

  return { held: [...held], reconciliation: [...reconciliation] };
}
