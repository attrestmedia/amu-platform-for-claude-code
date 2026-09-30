import "server-only";

import { createHash, randomInt } from "node:crypto";
import type { MarketingContentTopicClass } from "consts/marketing/uploadHourBenchmark";
import {
  DEFAULT_MARKETING_UPLOAD_POLICY,
  isMarketingUploadPolicyChannel,
  type MarketingUploadPolicyChannelConfig,
} from "consts/marketing/uploadPolicy";
import {
  appendMarketingJobUploadRecommendations,
  getMarketingKeywordSettings,
  listMarketingJobs,
  listMarketingJobSteps,
  listMarketingPublishLogs,
} from "libs/database/marketing";
import {
  rankCandidateHours,
  type UploadHourEvidence,
  type UploadHourSource,
} from "libs/marketing/operator/uploadHourRanking";
import { getJobTopicClass, loadUploadHourEvidence } from "libs/marketing/operator/uploadHourScoring";
import { toErrorMessage, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

type ChannelPolicy = MarketingUploadPolicyChannelConfig;

export type RecommendedUploadSchedule = {
  channel: string;
  date: string;
  recommendedHour: number;
  allowedHours: number[];
  policyVersion: number;
  recommendationToken: string;
  /** 시간대 결정 근거 — UI에서 "왜 이 시간인가"를 설명하는 데 쓴다. */
  hourSource: UploadHourSource;
  topicClass: string;
  /** 추천이 처음 확정된 시각. 값이 있으면 재계산되지 않은 고정 추천이다. */
  pinnedAt?: string;
  /** 확정된 추천일이 이미 지났는지 여부(표시는 그대로 두고 예약 시각만 다음 발생일로 넘긴다). */
  overdue: boolean;
};

export function getSeoulCalendarDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getSeoulHour(date: Date) {
  const value = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(date);
  const hour = Number(value);
  // 일부 ICU 구현은 자정을 24로 포맷하므로 24를 0으로 되돌린다.
  return Number.isInteger(hour) ? hour % 24 : 0;
}

// String(Date)는 밀리초를 버려 같은 초에 생성된 job의 FIFO 정렬이 무너진다. epoch로 직접 비교한다.
function toEpochMs(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  const parsed = new Date(typeof value === "string" || typeof value === "number" ? value : "");
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function hourUsageKey(universeId: string, channel: string, date: string) {
  return `${universeId}:${channel}:${date}`;
}

function markHourUsed(hourUsage: Map<string, Set<number>>, universeId: string, channel: string, date: string, hour: number) {
  const key = hourUsageKey(universeId, channel, date);
  const used = hourUsage.get(key) || new Set<number>();
  used.add(hour);
  hourUsage.set(key, used);
}

/**
 * 추천 시간대를 콘텐츠 주제·키워드 기준 성과 점수로 배정한다.
 *
 * 기존 구현은 정책 시간대를 순환 커서로 돌려썼다. 정책 시간대를 균등 소비한다는 목적은 달성했지만
 * "이 콘텐츠가 몇 시에 가장 잘 퍼지는가"와는 무관한 배정이라 추천으로서의 의미가 없었다.
 * 이제 (같은 주제의 실측 성과 → 채널 실측 성과 → 채널×주제 벤치마크) 순으로 점수를 매기고,
 * 같은 날 이미 쓴 시간과 minGapHours 제약을 만족하는 최고 점수 시간을 고른다.
 */
function pickScoredHour(args: {
  universeId: string;
  jobId: string;
  channel: string;
  date: string;
  policy: ChannelPolicy;
  topicClass: MarketingContentTopicClass;
  evidence: UploadHourEvidence;
  hourUsage: Map<string, Set<number>>;
}): { hour: number; score: number; source: UploadHourSource } {
  const hours = args.policy.preferredHours;
  if (!hours.length) return { hour: 0, score: 0, source: "benchmark" };

  const usageKey = hourUsageKey(args.universeId, args.channel, args.date);
  const used = args.hourUsage.get(usageKey) || new Set<number>();
  const usedHours = Array.from(used);
  const keepsGap = (hour: number) => usedHours.every((other) => Math.abs(hour - other) >= args.policy.minGapHours);
  const weekend = isWeekendDate(args.date);

  const ranked = rankCandidateHours({
    channel: args.channel,
    candidateHours: hours,
    topicClass: args.topicClass,
    weekend,
    evidence: args.evidence,
    // 날짜를 seed에 넣지 않는다 — 같은 job/채널이면 언제 계산해도 같은 순위가 나와야 한다.
    tieBreakSeed: `${args.universeId}:${args.jobId}`,
  });

  // 1순위: minGapHours까지 지키는 최고 점수. 2순위: 중복만 피한 최고 점수. 3순위: 전체 최고 점수.
  const picked =
    ranked.find((item) => !used.has(item.hour) && keepsGap(item.hour)) ||
    ranked.find((item) => !used.has(item.hour)) ||
    ranked[0];

  used.add(picked.hour);
  args.hourUsage.set(usageKey, used);
  return { hour: picked.hour, score: picked.score, source: picked.source };
}

function isWeekendDate(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function weekKey(date: Date) {
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function normalizePolicy(raw: unknown, channel: string): ChannelPolicy {
  const defaults = isMarketingUploadPolicyChannel(channel)
    ? DEFAULT_MARKETING_UPLOAD_POLICY[channel]
    : DEFAULT_MARKETING_UPLOAD_POLICY.instagram;
  const value = raw && typeof raw === "object" ? raw as UnknownRecord : {};
  const number = (key: keyof ChannelPolicy, fallback: number) => {
    const candidate = Number(value[key]);
    return Number.isFinite(candidate) && candidate >= 0 ? Math.floor(candidate) : fallback;
  };
  const preferredHours = Array.isArray(value.preferredHours)
    ? value.preferredHours.map(Number).filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
    : [];
  const minGapHours = number("minGapHours", defaults.minGapHours);
  const candidateHours = (preferredHours.length ? Array.from(new Set(preferredHours)) : defaults.preferredHours)
    .slice()
    .sort((left, right) => left - right);
  const maxDailyCap = Math.max(number("weekdayDailyCap", defaults.weekdayDailyCap), number("weekendDailyCap", defaults.weekendDailyCap));
  const spacedHours = candidateHours.reduce<number[]>((hours, hour) => {
    if (maxDailyCap <= 1) return [...hours, hour];
    if (!hours.length || hour - hours[hours.length - 1] >= minGapHours) hours.push(hour);
    return hours;
  }, []);
  return {
    weekdayDailyCap: number("weekdayDailyCap", defaults.weekdayDailyCap),
    weekendDailyCap: number("weekendDailyCap", defaults.weekendDailyCap),
    weeklyCap: number("weeklyCap", defaults.weeklyCap),
    minGapHours,
    preferredHours: spacedHours.length ? spacedHours : candidateHours.slice(0, 1),
  };
}

function allocateDate(args: {
  universeId: string;
  channel: string;
  policy: ChannelPolicy;
  baseDate: string;
  dailyUsage: Map<string, number>;
  weeklyUsage: Map<string, number>;
}) {
  const cursor = new Date(`${args.baseDate}T00:00:00.000Z`);
  for (let offset = 0; offset < 366; offset += 1) {
    const date = cursor.toISOString().slice(0, 10);
    const dailyKey = `${args.universeId}:${args.channel}:${date}`;
    const weeklyKey = `${args.universeId}:${args.channel}:${weekKey(cursor)}`;
    const weekend = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
    const policyDailyCap = weekend ? args.policy.weekendDailyCap : args.policy.weekdayDailyCap;
    const dailyCap = Math.min(policyDailyCap, Math.max(1, args.policy.preferredHours.length));
    const dailyUsed = args.dailyUsage.get(dailyKey) || 0;
    const weeklyUsed = args.weeklyUsage.get(weeklyKey) || 0;
    if (dailyUsed < dailyCap && (!args.policy.weeklyCap || weeklyUsed < args.policy.weeklyCap)) {
      args.dailyUsage.set(dailyKey, dailyUsed + 1);
      args.weeklyUsage.set(weeklyKey, weeklyUsed + 1);
      return { date };
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { date: cursor.toISOString().slice(0, 10) };
}

async function listCanonicalJobs(universeIds: string[]) {
  const items: UnknownRecord[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await listMarketingJobs({ universeIds, status: "waiting_review", page, limit: 100 });
    items.push(...(result.items as unknown as UnknownRecord[]));
    if (page >= result.totalPages) break;
  }
  return items.sort(
    (left, right) =>
      toEpochMs(left.createdAt) - toEpochMs(right.createdAt) ||
      toSafeString(left.jobId).localeCompare(toSafeString(right.jobId)),
  );
}

export async function buildStableUploadRecommendations(universeIds: string[]) {
  const baseDate = getSeoulCalendarDate();
  const weekStartCursor = new Date(`${baseDate}T00:00:00.000Z`);
  weekStartCursor.setUTCDate(weekStartCursor.getUTCDate() - ((weekStartCursor.getUTCDay() + 6) % 7));
  const weekStartDate = weekStartCursor.toISOString().slice(0, 10);
  const jobs = await listCanonicalJobs(universeIds);
  const jobIds = jobs.map((job) => toSafeString(job.jobId)).filter(Boolean);
  const steps = jobIds.length ? await listMarketingJobSteps({ jobIds, limit: 2000 }) : [];
  const settings = await Promise.all(universeIds.map(async (universeId) => [universeId, await getMarketingKeywordSettings(universeId)] as const));
  const publishedLogs = (
    await Promise.all(universeIds.map((universeId) => listMarketingPublishLogs({
      universeId,
      status: "published",
      dateFrom: new Date(`${weekStartDate}T00:00:00+09:00`).toISOString(),
      limit: 200,
    })))
  ).flat();
  const settingsByUniverse = new Map(settings);
  // 성과 롤업은 "새로 배정할 슬롯이 있을 때"만 필요하다. 이미 전부 고정된 목록 조회에서는 한 번도 읽지 않는다.
  const evidenceByUniverse = new Map<string, UploadHourEvidence>();
  const loadEvidenceOnce = async (universeId: string) => {
    const cached = evidenceByUniverse.get(universeId);
    if (cached) return cached;
    const evidence = await loadUploadHourEvidence(universeId);
    evidenceByUniverse.set(universeId, evidence);
    return evidence;
  };
  const scheduledByJobChannel = new Map<string, { date: string; hour: number }>();
  const dailyUsage = new Map<string, number>();
  const weeklyUsage = new Map<string, number>();
  const hourUsage = new Map<string, Set<number>>();
  const occupiedKeys = new Set<string>();

  for (const rawStep of steps as unknown as UnknownRecord[]) {
    const meta = rawStep.meta && typeof rawStep.meta === "object" ? rawStep.meta as UnknownRecord : {};
    const scheduled = new Date(String(meta.scheduledPublishAt || ""));
    const channel = toSafeString(rawStep.channel);
    const jobId = toSafeString(rawStep.jobId);
    if (!channel || !jobId || Number.isNaN(scheduled.getTime())) continue;
    const date = getSeoulCalendarDate(scheduled);
    const occupiedKey = `${jobId}:${channel}:${date}`;
    if (occupiedKeys.has(occupiedKey)) continue;
    occupiedKeys.add(occupiedKey);
    const scheduledHour = getSeoulHour(scheduled);
    // 확정된 예약은 실제 예약 시각을 그대로 추천값으로 쓴다. 정책 첫 슬롯으로 덮어쓰면 화면 추천과 실제 예약이 어긋난다.
    scheduledByJobChannel.set(`${jobId}:${channel}`, { date, hour: scheduledHour });
    const universeId = toSafeString(rawStep.universeId);
    markHourUsed(hourUsage, universeId, channel, date, scheduledHour);
    dailyUsage.set(`${universeId}:${channel}:${date}`, (dailyUsage.get(`${universeId}:${channel}:${date}`) || 0) + 1);
    const cursor = new Date(`${date}T00:00:00.000Z`);
    weeklyUsage.set(`${universeId}:${channel}:${weekKey(cursor)}`, (weeklyUsage.get(`${universeId}:${channel}:${weekKey(cursor)}`) || 0) + 1);
  }

  for (const rawLog of publishedLogs as unknown as UnknownRecord[]) {
    const channel = toSafeString(rawLog.channel);
    const universeId = toSafeString(rawLog.universeId);
    const publishedAt = new Date(String(rawLog.publishedAt || rawLog.completedAt || ""));
    if (!channel || !universeId || Number.isNaN(publishedAt.getTime())) continue;
    const date = getSeoulCalendarDate(publishedAt);
    const occupiedKey = `${toSafeString(rawLog.jobId)}:${channel}:${date}`;
    if (occupiedKeys.has(occupiedKey)) continue;
    occupiedKeys.add(occupiedKey);
    const cursor = new Date(`${date}T00:00:00.000Z`);
    const dailyKey = `${universeId}:${channel}:${date}`;
    const weeklyKey = `${universeId}:${channel}:${weekKey(cursor)}`;
    markHourUsed(hourUsage, universeId, channel, date, getSeoulHour(publishedAt));
    dailyUsage.set(dailyKey, (dailyUsage.get(dailyKey) || 0) + 1);
    weeklyUsage.set(weeklyKey, (weeklyUsage.get(weeklyKey) || 0) + 1);
  }

  // 1) 이미 고정된 추천을 먼저 사용량에 반영한다.
  //    미배정 job이 날짜를 고를 때 다른 job의 확정 슬롯을 못 보면 같은 날에 몰린다(순서 의존 배정 방지).
  const pinnedByJobChannel = new Map<string, PinnedRecommendation>();
  for (const job of jobs) {
    const universeId = toSafeString(job.universeId);
    const jobId = toSafeString(job.jobId);
    for (const raw of toPinnedRecommendations(job.uploadRecommendations)) {
      const key = `${jobId}:${raw.channel}`;
      if (pinnedByJobChannel.has(key)) continue;
      pinnedByJobChannel.set(key, raw);
      // 실제 예약이 잡힌 채널은 예약 시각이 이미 사용량에 반영돼 있다. 중복 계상하지 않는다.
      if (scheduledByJobChannel.has(key)) continue;
      markHourUsed(hourUsage, universeId, raw.channel, raw.date, raw.recommendedHour);
      const cursor = new Date(`${raw.date}T00:00:00.000Z`);
      const dailyKey = `${universeId}:${raw.channel}:${raw.date}`;
      const weeklyKey = `${universeId}:${raw.channel}:${weekKey(cursor)}`;
      dailyUsage.set(dailyKey, (dailyUsage.get(dailyKey) || 0) + 1);
      weeklyUsage.set(weeklyKey, (weeklyUsage.get(weeklyKey) || 0) + 1);
    }
  }

  // 2) 미배정 채널만 새로 계산하고, 계산한 값은 즉시 job에 고정 저장한다.
  const result = new Map<string, RecommendedUploadSchedule>();
  const pendingPersist = new Map<string, PinnedRecommendation[]>();
  const todayEpoch = new Date(`${baseDate}T00:00:00.000Z`).getTime();

  for (const job of jobs) {
    const universeId = toSafeString(job.universeId);
    const jobId = toSafeString(job.jobId);
    const settingsDoc = settingsByUniverse.get(universeId) as UnknownRecord | null | undefined;
    const criteria = settingsDoc?.marketingCriteria as UnknownRecord | undefined;
    const uploadPolicy = criteria?.uploadPolicy as UnknownRecord | undefined;
    const channelPolicies = uploadPolicy?.channels as UnknownRecord | undefined;
    const policyVersion = Math.max(1, Number(uploadPolicy?.version || criteria?.version || 1));
    const channels = Array.isArray(job.channels) ? job.channels.map(toSafeString).filter(Boolean) : [];
    const topicClass = getJobTopicClass(job);

    for (const channel of channels) {
      const policy = normalizePolicy(channelPolicies?.[channel], channel);
      const key = `${jobId}:${channel}`;
      const scheduled = scheduledByJobChannel.get(key);
      let pinned = pinnedByJobChannel.get(key);

      if (!pinned) {
        const date = allocateDate({ universeId, channel, policy, baseDate, dailyUsage, weeklyUsage }).date;
        const evidence = await loadEvidenceOnce(universeId);
        const picked = pickScoredHour({ universeId, jobId, channel, date, policy, topicClass, evidence, hourUsage });
        pinned = {
          channel,
          date,
          recommendedHour: picked.hour,
          hourSource: picked.source,
          hourScore: picked.score,
          topicClass,
        };
        pinnedByJobChannel.set(key, pinned);
        pendingPersist.set(jobId, [...(pendingPersist.get(jobId) || []), pinned]);
      }

      // 실제로 예약이 확정된 채널은 예약 시각을 보여준다. 그 외에는 고정된 추천을 그대로 쓴다.
      const date = scheduled ? scheduled.date : pinned.date;
      const recommendedHour = scheduled ? scheduled.hour : pinned.recommendedHour;
      // 이미 예약된 시각이 정책 시간대에서 빠졌더라도 재예약이 publish_hour_not_allowed로 막히지 않게 허용 목록에 합친다.
      const allowedHours = policy.preferredHours.includes(recommendedHour)
        ? policy.preferredHours
        : [...policy.preferredHours, recommendedHour].sort((left, right) => left - right);
      const recommendationToken = createHash("sha256")
        .update([universeId, jobId, channel, date, recommendedHour, policyVersion].join("|"))
        .digest("hex");
      result.set(key, {
        channel,
        date,
        recommendedHour,
        allowedHours,
        policyVersion,
        recommendationToken,
        hourSource: pinned.hourSource,
        topicClass: pinned.topicClass,
        pinnedAt: pinned.assignedAt,
        overdue: !scheduled && new Date(`${date}T00:00:00.000Z`).getTime() < todayEpoch,
      });
    }
  }

  // 고정 저장 실패가 조회를 막지 않게 한다. 저장에 실패하면 다음 조회에서 다시 배정된다.
  await Promise.all(
    Array.from(pendingPersist.entries()).map(async ([jobId, recommendations]) => {
      const policyVersion = result.get(`${jobId}:${recommendations[0].channel}`)?.policyVersion || 1;
      try {
        await appendMarketingJobUploadRecommendations({
          jobId,
          recommendations: recommendations.map((item) => ({
            channel: item.channel,
            date: item.date,
            recommendedHour: item.recommendedHour,
            hourSource: item.hourSource,
            hourScore: item.hourScore,
            topicClass: item.topicClass,
            policyVersion,
          })),
        });
      } catch (error) {
        logger.warn("[marketing] failed to pin upload recommendation", { jobId, error: toErrorMessage(error) });
      }
    }),
  );

  return result;
}

type PinnedRecommendation = {
  channel: string;
  date: string;
  recommendedHour: number;
  hourSource: UploadHourSource;
  hourScore: number;
  topicClass: MarketingContentTopicClass | string;
  assignedAt?: string;
};

const UPLOAD_HOUR_SOURCES: UploadHourSource[] = ["topic_performance", "channel_performance", "benchmark"];

function toPinnedRecommendations(value: unknown): PinnedRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): PinnedRecommendation | null => {
      const item = toUnknownRecord(raw);
      const channel = toSafeString(item.channel);
      const date = toSafeString(item.date);
      const recommendedHour = Number(item.recommendedHour);
      if (!channel || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(recommendedHour)) return null;
      const hourSource = toSafeString(item.hourSource) as UploadHourSource;
      const assignedAt = item.assignedAt instanceof Date ? item.assignedAt.toISOString() : toSafeString(item.assignedAt);
      return {
        channel,
        date,
        recommendedHour: Math.min(23, Math.max(0, recommendedHour)),
        hourSource: UPLOAD_HOUR_SOURCES.includes(hourSource) ? hourSource : "benchmark",
        hourScore: Number(item.hourScore) || 0,
        topicClass: toSafeString(item.topicClass) || "general",
        assignedAt: assignedAt || undefined,
      };
    })
    .filter((item): item is PinnedRecommendation => item !== null);
}

export async function resolveRecommendedPublishAt(args: {
  universeId: string;
  jobId: string;
  channel: string;
  publishHour: number;
  publishMinute?: number | null;
  recommendationToken: string;
}) {
  const schedules = await buildStableUploadRecommendations([args.universeId]);
  const schedule = schedules.get(`${args.jobId}:${args.channel}`);
  if (!schedule || schedule.recommendationToken !== args.recommendationToken) throw new Error("recommendation_stale");
  if (!schedule.allowedHours.includes(args.publishHour)) throw new Error("publish_hour_not_allowed");
  if (Number.isInteger(args.publishMinute) && (Number(args.publishMinute) < 10 || Number(args.publishMinute) > 30)) {
    throw new Error("publish_minute_not_allowed");
  }
  const publishMinute = Number.isInteger(args.publishMinute) ? Number(args.publishMinute) : randomInt(10, 31);
  let publishAt = new Date(`${schedule.date}T${String(args.publishHour).padStart(2, "0")}:${String(publishMinute).padStart(2, "0")}:00+09:00`);
  // 추천일은 배정 시점에 고정되므로 검수가 늦어지면 과거일 수 있다.
  // 표시값은 그대로 두고 실제 예약만 같은 시각의 다음 발생일로 넘긴다(+24h 1회로는 며칠 지난 추천을 못 넘긴다).
  for (let day = 0; day < 400 && publishAt.getTime() <= Date.now(); day += 1) {
    publishAt = new Date(publishAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { publishAt, schedule };
}
