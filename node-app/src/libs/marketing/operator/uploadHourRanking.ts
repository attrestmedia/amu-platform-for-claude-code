import { createHash } from "node:crypto";
import { getBenchmarkHourWeight, type MarketingContentTopicClass } from "consts/marketing/uploadHourBenchmark";

/**
 * @docHint
 * @purpose 추천 업로드 시간대 순위 계산(순수 로직 — DB/IO 없음)
 * @process 주제 실측 → 채널 실측 → 벤치마크 사전확률 순으로 후보 시간대 점수화
 * @domain marketing
 * @scope shared
 */

export type UploadHourSource = "topic_performance" | "channel_performance" | "benchmark";

export type UploadHourBucket = { postCount: number; engagements: number; impressions: number };

export type UploadHourEvidence = {
  /** key: `${channel}:${hour}` */
  byChannelHour: Map<string, UploadHourBucket>;
  /** key: `${topicClass}:${channel}:${hour}` */
  byTopicHour: Map<string, UploadHourBucket>;
};

export type UploadHourPick = {
  hour: number;
  score: number;
  source: UploadHourSource;
  topicClass: MarketingContentTopicClass;
};

/** 시간대 우열을 판정하려면 분모가 필요하다. 이 미만이면 실측을 쓰지 않는다. */
export const MIN_TOPIC_SAMPLE = 3;
export const MIN_CHANNEL_SAMPLE = 5;
/** 실측 점수와 벤치마크 점수의 혼합 비율 — 실측이 있어도 벤치마크를 완전히 버리지 않는다. */
const OBSERVED_WEIGHT = 0.65;

export function createUploadHourEvidence(): UploadHourEvidence {
  return { byChannelHour: new Map(), byTopicHour: new Map() };
}

function bucketScore(bucket: UploadHourBucket | undefined) {
  if (!bucket || bucket.postCount <= 0) return null;
  // 노출 대비 참여를 우선하고, 노출 데이터가 없는 채널(naver_blog 등)은 건당 평균 참여로 대체한다.
  const perPost = bucket.engagements / bucket.postCount;
  const rate = bucket.impressions > 0 ? bucket.engagements / bucket.impressions : 0;
  return { perPost, rate, postCount: bucket.postCount };
}

/**
 * 실측값을 "측정된 시간대들의 평균 대비"로 환산한다(평균=0.5, 평균의 2배 이상=1.0).
 *
 * 최댓값 정규화를 쓰면 안 된다. 측정된 시간이 하나뿐일 때 그 하나가 무조건 1.0이 되어,
 * 표본 1개짜리 시간대가 검증된 시간대를 이기는 결과가 나온다.
 * 평균 기준이면 측정 시간이 하나일 때 자동으로 0.5(중립)가 되어 벤치마크가 순서를 결정한다.
 */
const NEUTRAL_OBSERVED_SCORE = 0.5;

function toRelativeObservedScores(values: Array<number | null>): Array<number | null> {
  const measured = values.filter((value): value is number => value !== null);
  const mean = measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : 0;
  if (mean <= 0) return values.map((value) => (value === null ? null : NEUTRAL_OBSERVED_SCORE));
  return values.map((value) => (value === null ? null : Math.min(1, value / mean / 2)));
}

/**
 * 후보 시간대를 점수 내림차순으로 정렬한다.
 * 랜덤/라운드로빈이 아니라 (주제 실측 → 채널 실측 → 벤치마크) 순의 근거 있는 점수로 고른다.
 */
export function rankCandidateHours(args: {
  channel: string;
  candidateHours: number[];
  topicClass: MarketingContentTopicClass;
  weekend: boolean;
  evidence: UploadHourEvidence;
  /** 동점 시 결정적 tie-break에 사용 — 같은 입력이면 항상 같은 순서가 나와야 한다. */
  tieBreakSeed: string;
}): UploadHourPick[] {
  const hours = Array.from(new Set(args.candidateHours)).filter(
    (hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23,
  );
  if (hours.length === 0) return [];

  const topicBuckets = hours.map((hour) =>
    bucketScore(args.evidence.byTopicHour.get(`${args.topicClass}:${args.channel}:${hour}`)),
  );
  const channelBuckets = hours.map((hour) => bucketScore(args.evidence.byChannelHour.get(`${args.channel}:${hour}`)));
  const topicSamples = topicBuckets.reduce((sum, item) => sum + (item?.postCount || 0), 0);
  const channelSamples = channelBuckets.reduce((sum, item) => sum + (item?.postCount || 0), 0);

  const useTopic = topicSamples >= MIN_TOPIC_SAMPLE;
  const useChannel = !useTopic && channelSamples >= MIN_CHANNEL_SAMPLE;
  const observedBuckets = useTopic ? topicBuckets : useChannel ? channelBuckets : null;
  const source: UploadHourSource = useTopic ? "topic_performance" : useChannel ? "channel_performance" : "benchmark";

  const benchmarkScores = hours.map((hour) =>
    getBenchmarkHourWeight({ channel: args.channel, topicClass: args.topicClass, hour, weekend: args.weekend }),
  );
  const observedScores = observedBuckets
    ? toRelativeObservedScores(observedBuckets.map((item) => (item ? item.rate * 100 + item.perPost : null)))
    : null;

  return hours
    .map((hour, index) => {
      const benchmark = benchmarkScores[index];
      const observed = observedScores ? observedScores[index] : null;
      // 측정된 적 없는 시간은 0점이 아니라 중립(평균)으로 둔다.
      // 0점 처리하면 아직 시도해보지 않은 시간대가 영구히 배제되어 정책 시간대가 죽는다.
      const score = observedScores
        ? OBSERVED_WEIGHT * (observed ?? NEUTRAL_OBSERVED_SCORE) + (1 - OBSERVED_WEIGHT) * benchmark
        : benchmark;
      return {
        hour,
        score: Number(score.toFixed(6)),
        source: observed !== null ? source : ("benchmark" as UploadHourSource),
        topicClass: args.topicClass,
        tieBreak: createHash("sha1").update(`${args.tieBreakSeed}|${args.channel}|${hour}`).digest("hex"),
      };
    })
    .sort((left, right) => right.score - left.score || left.tieBreak.localeCompare(right.tieBreak))
    .map(({ hour, score, source: hourSource, topicClass }) => ({ hour, score, source: hourSource, topicClass }));
}
