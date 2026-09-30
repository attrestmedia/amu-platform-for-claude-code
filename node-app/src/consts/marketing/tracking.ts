import type { MarketingChannel } from "./queue";

export const MARKETING_CANONICAL_POLICY = {
  mode: "canonical_plus_utm_only",
  requiredParams: ["utm_source", "utm_medium", "utm_campaign", "utm_content"],
  strippedParams: ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"],
} as const;

export const MARKETING_DEFAULT_UTM_MEDIUM_BY_CHANNEL: Partial<Record<MarketingChannel, string>> = {
  threads: "social",
  instagram: "social",
  linkedin: "social",
  naver_blog: "owned-media",
  naver_ads: "cpc",
  google_ads: "cpc",
  slack: "ops",
  email: "email",
};

export const MARKETING_ADS_UNLOCK_REQUIRED_PROVIDERS = ["naver_ads", "google_ads"] as const;

export const MARKETING_MEASUREMENT_REVIEW_CHECKLIST = [
  "최종 publish URL이 canonical URL + UTM 규칙을 따르는지 확인",
  "최근 14일 publish log가 임계치 이상 누적됐는지 확인",
  "ads credential slot 존재 여부와 운영 공유 여부를 확인",
  "광고용 landing canonical 정책이 운영 문서와 동일한지 확인",
] as const;
