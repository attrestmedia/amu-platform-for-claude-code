import "server-only";
import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingKeywordCandidateSchema,
  MarketingNaverTrendSnapshotSchema,
  type IMarketingKeywordCandidateDocument,
  type IMarketingNaverTrendSnapshotDocument,
  type MarketingNaverSnapshotKind,
} from "models/marketing";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 네이버 트렌드 스냅샷(marketing_naver_trend_snapshots) 데이터 접근과 키워드 후보 metrics 보강
 * @process snapshotId 멱등 upsert, 최근 스냅샷 캐시 조회, 후보 문서의 metrics.naver 병합 수행
 * @domain marketing
 * @scope server
 */

const NAVER_SNAPSHOT_COLLECTION = "marketing_naver_trend_snapshots";
const KEYWORD_COLLECTION = "marketing_keyword_candidates";

async function getMarketingNaverTrendSnapshotModel() {
  return await getModel<IMarketingNaverTrendSnapshotDocument>(
    MONGODB_MARKETING_URL,
    "MarketingNaverTrendSnapshot",
    MarketingNaverTrendSnapshotSchema,
    NAVER_SNAPSHOT_COLLECTION,
  );
}

async function getMarketingKeywordCandidateModel() {
  return await getModel<IMarketingKeywordCandidateDocument>(
    MONGODB_MARKETING_URL,
    "MarketingKeywordCandidate",
    MarketingKeywordCandidateSchema,
    KEYWORD_COLLECTION,
  );
}

export function buildNaverSnapshotId(args: {
  universeId: string;
  kind: MarketingNaverSnapshotKind;
  subjectKey: string;
  timeUnit: string;
  startDate: string;
  endDate: string;
  anchorKeyword?: string;
}) {
  const anchorHash = crypto
    .createHash("sha1")
    .update(String(args.anchorKeyword || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 10);
  return `${args.universeId}:${args.kind}:${args.subjectKey}:${args.timeUnit}:${args.startDate}:${args.endDate}:${anchorHash}`;
}

export async function upsertMarketingNaverTrendSnapshot(input: {
  universeId: string;
  kind: MarketingNaverSnapshotKind;
  subjectKey: string;
  timeUnit: string;
  startDate: string;
  endDate: string;
  anchorKeyword?: string;
  series: Array<{ period: string; ratio: number }>;
  summary?: UnknownRecord;
  meta?: UnknownRecord;
}) {
  const model = await getMarketingNaverTrendSnapshotModel();
  const snapshotId = buildNaverSnapshotId(input);

  return await model
    .findOneAndUpdate(
      { snapshotId },
      {
        $set: {
          universeId: input.universeId,
          kind: input.kind,
          subjectKey: input.subjectKey,
          timeUnit: input.timeUnit,
          startDate: input.startDate,
          endDate: input.endDate,
          anchorKeyword: input.anchorKeyword || "",
          series: input.series,
          summary: input.summary || {},
          meta: input.meta || {},
          collectedAt: new Date(),
        },
        $setOnInsert: { snapshotId },
      },
      { new: true, upsert: true },
    )
    .lean();
}

/** 최근 maxAgeDays 이내 수집된 스냅샷을 캐시로 반환한다 (앵커 키워드가 같을 때만 유효). */
export async function findRecentNaverTrendSnapshot(params: {
  universeId: string;
  kind: MarketingNaverSnapshotKind;
  subjectKey: string;
  timeUnit: string;
  anchorKeyword: string;
  maxAgeDays?: number;
}) {
  const model = await getMarketingNaverTrendSnapshotModel();
  const maxAge = new Date(Date.now() - (params.maxAgeDays ?? 7) * 24 * 3600 * 1000);

  return await model
    .findOne({
      universeId: params.universeId,
      kind: params.kind,
      subjectKey: params.subjectKey,
      timeUnit: params.timeUnit,
      anchorKeyword: params.anchorKeyword,
      collectedAt: { $gte: maxAge },
    })
    .sort({ collectedAt: -1 })
    .lean();
}

/** 후보 문서의 metrics.naver 네임스페이스만 병합한다 (다른 metrics 키 보존). */
export async function mergeKeywordCandidateNaverMetrics(params: {
  universeId: string;
  keyword: string;
  naverMetrics: UnknownRecord;
}) {
  const model = await getMarketingKeywordCandidateModel();
  return await model
    .updateMany(
      { universeId: params.universeId, keyword: params.keyword },
      { $set: { "metrics.naver": params.naverMetrics } },
    )
    .lean();
}
