import "server-only";

import {
  classifyContentTopic,
  toTopicSignalText,
  type MarketingContentTopicClass,
} from "consts/marketing/uploadHourBenchmark";
import { listMarketingJobsByJobIds, listMarketingPerformanceDaily } from "libs/database/marketing";
import { createUploadHourEvidence, type UploadHourEvidence } from "libs/marketing/operator/uploadHourRanking";
import { toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 추천 업로드 시간대 판정용 실측 성과 근거(evidence) 적재
 * @process social_post 성과 스냅샷 → entity별 최신 1건 → meta.jobId로 원본 주제 역참조 → (주제 클래스 × 채널 × 시간) 버킷 롤업
 * @domain marketing
 * @scope server
 */

/** 성과 롤업 기간(일). 소셜 알고리즘 변화가 빨라 1년치를 섞으면 오히려 노이즈가 된다. */
const PERFORMANCE_LOOKBACK_DAYS = 120;
const REPORT_TIME_ZONE = "Asia/Seoul";

function toMetricNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function addBucket(map: Map<string, { postCount: number; engagements: number; impressions: number }>, key: string, metrics: UnknownRecord) {
  const bucket = map.get(key) || { postCount: 0, engagements: 0, impressions: 0 };
  bucket.postCount += 1;
  bucket.engagements += toMetricNumber(metrics.engagements);
  bucket.impressions += toMetricNumber(metrics.impressions) || toMetricNumber(metrics.views);
  map.set(key, bucket);
}

function toSeoulHour(value: unknown): number | null {
  const date = new Date(toSafeString(value));
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const hour = Number(formatted);
  return Number.isInteger(hour) ? hour % 24 : null;
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** job 문서에서 주제 신호(제목·태그·카테고리·큐 카테고리)를 뽑아 주제 클래스로 분류한다. */
export function getJobTopicClass(job: UnknownRecord): MarketingContentTopicClass {
  const sourceRef = toUnknownRecord(job.sourceRef);
  const snapshot = toUnknownRecord(sourceRef.sourceSnapshot);
  const request = toUnknownRecord(job.request);
  return classifyContentTopic(
    toTopicSignalText([
      sourceRef.title,
      snapshot.title,
      snapshot.excerptText,
      snapshot.tags,
      snapshot.categories,
      request.topic,
      request.keyword,
      request.keywords,
      job.queueCategory,
    ]),
  );
}

/**
 * social_post 성과 스냅샷을 주제 클래스 × 채널 × 시간 버킷으로 롤업한다.
 * 성과 row의 meta.jobId로 원본 job의 주제를 역참조해 "이 주제는 몇 시에 잘 됐나"를 만든다.
 */
export async function loadUploadHourEvidence(universeId: string): Promise<UploadHourEvidence> {
  const evidence = createUploadHourEvidence();
  const id = toSafeString(universeId);
  if (!id) return evidence;

  const dateFrom = toDateString(new Date(Date.now() - PERFORMANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  const rows = (await listMarketingPerformanceDaily({
    universeId: id,
    entityType: "social_post",
    dateFrom,
    limit: 5000,
  })) as unknown as UnknownRecord[];

  // 같은 게시물이 날짜별로 누적 스냅샷되므로 entity당 최신 1건만 남긴다(중복 가중 방지).
  const latestByEntity = new Map<string, UnknownRecord>();
  for (const row of rows) {
    const key = `${toSafeString(row.channel)}:${toSafeString(row.entityId)}`;
    const current = latestByEntity.get(key);
    if (!current || toSafeString(row.date) > toSafeString(current.date)) latestByEntity.set(key, row);
  }

  const items = Array.from(latestByEntity.values());
  const jobs = await listMarketingJobsByJobIds(
    items.map((item) => toSafeString(toUnknownRecord(item.meta).jobId)).filter(Boolean),
  );
  const topicClassByJobId = new Map(
    (jobs as unknown as UnknownRecord[]).map((job) => [toSafeString(job.jobId), getJobTopicClass(job)] as const),
  );

  for (const item of items) {
    const meta = toUnknownRecord(item.meta);
    const hour = toSeoulHour(meta.publishedAt);
    const channel = toSafeString(item.channel);
    if (hour === null || !channel) continue;
    const metrics = toUnknownRecord(item.metrics);
    addBucket(evidence.byChannelHour, `${channel}:${hour}`, metrics);
    const topicClass = topicClassByJobId.get(toSafeString(meta.jobId));
    if (topicClass) addBucket(evidence.byTopicHour, `${topicClass}:${channel}:${hour}`, metrics);
  }

  return evidence;
}
