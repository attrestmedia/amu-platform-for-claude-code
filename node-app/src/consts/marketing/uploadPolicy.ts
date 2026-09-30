export const MARKETING_UPLOAD_POLICY_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"] as const;

export type MarketingUploadPolicyChannel = (typeof MARKETING_UPLOAD_POLICY_CHANNELS)[number];

export type MarketingUploadPolicyChannelConfig = {
  weekdayDailyCap: number;
  weekendDailyCap: number;
  weeklyCap: number;
  minGapHours: number;
  preferredHours: number[];
};

export const DEFAULT_MARKETING_UPLOAD_POLICY: Record<
  MarketingUploadPolicyChannel,
  MarketingUploadPolicyChannelConfig
> = {
  // weeklyCap은 weekdayDailyCap*5 + weekendDailyCap*2로 맞춘다.
  // 주간 cap이 요일 합보다 작으면 주 후반 요일이 구조적으로 버려진다(2026-08-01 threads 실측: 목·금 슬롯 유실).
  threads: {
    weekdayDailyCap: 2,
    weekendDailyCap: 2,
    weeklyCap: 14,
    minGapHours: 2,
    // Threads는 평일 오전이 가장 강하고 저녁이 약하다(업계 벤치마크). 오전 3 + 오후 3 + 저녁 1 검증 슬롯.
    preferredHours: [7, 9, 11, 13, 15, 17, 19],
  },
  instagram: {
    weekdayDailyCap: 2,
    weekendDailyCap: 1,
    weeklyCap: 12,
    minGapHours: 3,
    // Instagram은 Threads와 반대로 저녁(18~23시)이 가장 강하다. 오전·점심 각 1 + 저녁 2.
    preferredHours: [9, 12, 18, 21],
  },
  linkedin: {
    weekdayDailyCap: 1,
    weekendDailyCap: 0,
    weeklyCap: 5,
    minGapHours: 24,
    // B2B 참여의 대부분이 업무시간에 발생한다. 오전 10~12시와 오후 15~17시 두 피크만 사용한다.
    preferredHours: [10, 12, 15, 17],
  },
  naver_blog: {
    weekdayDailyCap: 1,
    weekendDailyCap: 1,
    weeklyCap: 7,
    minGapHours: 24,
    preferredHours: [9, 13, 18, 21],
  },
};

export function isMarketingUploadPolicyChannel(value: string): value is MarketingUploadPolicyChannel {
  return (MARKETING_UPLOAD_POLICY_CHANNELS as readonly string[]).includes(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeBoundedInt(value: unknown, fallback: number, max: number) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate >= 0 ? Math.min(max, Math.floor(candidate)) : fallback;
}

export function normalizeMarketingUploadPolicyChannel(
  channel: MarketingUploadPolicyChannel,
  value: unknown,
): MarketingUploadPolicyChannelConfig {
  const defaults = DEFAULT_MARKETING_UPLOAD_POLICY[channel];
  const raw = toRecord(value);
  const preferredHours = Array.isArray(raw.preferredHours)
    ? Array.from(
        new Set(
          raw.preferredHours
            .map(Number)
            .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23),
        ),
      ).sort((left, right) => left - right)
    : [];

  return {
    weekdayDailyCap: normalizeBoundedInt(raw.weekdayDailyCap, defaults.weekdayDailyCap, 24),
    weekendDailyCap: normalizeBoundedInt(raw.weekendDailyCap, defaults.weekendDailyCap, 24),
    weeklyCap: normalizeBoundedInt(raw.weeklyCap, defaults.weeklyCap, 168),
    minGapHours: normalizeBoundedInt(raw.minGapHours, defaults.minGapHours, 168),
    preferredHours: preferredHours.length ? preferredHours : [...defaults.preferredHours],
  };
}

export function normalizeMarketingUploadPolicyChannels(
  value: unknown,
): Record<MarketingUploadPolicyChannel, MarketingUploadPolicyChannelConfig> {
  const channels = toRecord(value);
  return Object.fromEntries(
    MARKETING_UPLOAD_POLICY_CHANNELS.map((channel) => [
      channel,
      normalizeMarketingUploadPolicyChannel(channel, channels[channel]),
    ]),
  ) as Record<MarketingUploadPolicyChannel, MarketingUploadPolicyChannelConfig>;
}
