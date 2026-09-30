export const MARKETING_JOB_STATUS = [
  "queued",
  "ready",
  "running",
  "waiting_review",
  "approved",
  "rejected",
  "partial",
  "success",
  "failed",
  "canceled",
] as const;

export const MARKETING_STEP_STATUS = [
  "queued",
  "running",
  "waiting_input",
  "waiting_review",
  "approved",
  "skipped",
  "success",
  "failed",
] as const;

export const MARKETING_JOB_PRIORITY = ["low", "normal", "high", "urgent"] as const;
export const MARKETING_JOB_SOURCE = ["manual", "wp_hook", "api_batch", "retry"] as const;
export const MARKETING_CHANNELS = [
  "threads",
  "instagram",
  "linkedin",
  "naver_blog",
  "naver_ads",
  "google_ads",
  "slack",
  "email",
  // 사이트 자체(GA4) 지표처럼 특정 발행 채널에 귀속되지 않는 성과 기록용
  "web",
] as const;

export const MARKETING_STEP_TYPES = [
  "ingest_source",
  "normalize_target",
  "load_wp_content",
  "generate_channel_copy",
  "validate_output",
  "publish_threads",
  "publish_instagram",
  "prepare_linkedin_draft",
  "prepare_naver_draft",
  "generate_keywords",
  "score_keywords",
  "build_ad_draft",
  "publish_ads",
  "collect_performance",
] as const;

export const MARKETING_PUBLISH_STATUS = ["draft", "published", "failed", "skipped"] as const;
export const MARKETING_KEYWORD_STATUS = ["candidate", "approved", "rejected"] as const;
export const MARKETING_ASSET_STATE = ["active", "archived", "deleted"] as const;
export const MARKETING_PERFORMANCE_ENTITY_TYPES = [
  "job",
  "publish",
  "campaign",
  "keyword",
  "ad_campaign",
  "ad_group",
  "ad_keyword",
  "ad_creative",
  "social_post",
  "social_account",
  // GA4 일별 스냅샷 롤업: entityId는 각각 template_key / 정규화 sourceMedium / pagePath / promo 소재 조합 / 국가:언어:기기:브라우저 조합
  "ga_template",
  "ga_channel",
  "ga_page",
  "ga_promo",
  "ga_audience",
] as const;
export const MARKETING_DEFAULT_CONTENT_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"] as const;
export const MARKETING_ACTIVE_JOB_STATUS = ["queued", "ready", "running", "waiting_review", "approved"] as const;
export const MARKETING_RETRYABLE_JOB_STATUS = ["failed", "rejected", "canceled", "partial"] as const;

export type MarketingJobStatus = (typeof MARKETING_JOB_STATUS)[number];
export type MarketingStepStatus = (typeof MARKETING_STEP_STATUS)[number];
export type MarketingJobPriority = (typeof MARKETING_JOB_PRIORITY)[number];
export type MarketingJobSource = (typeof MARKETING_JOB_SOURCE)[number];
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];
export type MarketingStepType = (typeof MARKETING_STEP_TYPES)[number];
export type MarketingPublishStatus = (typeof MARKETING_PUBLISH_STATUS)[number];
export type MarketingKeywordStatus = (typeof MARKETING_KEYWORD_STATUS)[number];
export type MarketingAssetState = (typeof MARKETING_ASSET_STATE)[number];
export type MarketingPerformanceEntityType = (typeof MARKETING_PERFORMANCE_ENTITY_TYPES)[number];
export type MarketingDefaultContentChannel = (typeof MARKETING_DEFAULT_CONTENT_CHANNELS)[number];
export type MarketingActiveJobStatus = (typeof MARKETING_ACTIVE_JOB_STATUS)[number];
export type MarketingRetryableJobStatus = (typeof MARKETING_RETRYABLE_JOB_STATUS)[number];

export const MARKETING_QUEUE_PAGE_SIZE_DEFAULT = 20;
export const MARKETING_QUEUE_PAGE_SIZE_MAX = 100;
export const MARKETING_QUEUE_ENQUEUE_BATCH_MAX = 50;
export const MARKETING_QUEUE_LEASE_TTL_MS = 300000;
