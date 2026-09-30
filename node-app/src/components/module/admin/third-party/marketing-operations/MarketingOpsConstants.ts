import { DEFAULT_TEXT_MODEL_BY_PROVIDER } from "consts/ai";
import {
  MARKETING_DEFAULT_CONTENT_CHANNELS,
  MARKETING_JOB_STATUS,
  MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
  MARKETING_QUEUE_PAGE_SIZE_DEFAULT,
} from "consts/marketing/queue";
import type {
  MarketingGenerationConfirmState,
  QueueCategoryComposerState,
  QueueComposerState,
} from "./MarketingOpsTypes";

export const REVIEW_STATUS_FILTER = MARKETING_JOB_STATUS.join(",");
export const REVIEW_JOB_PAGE_SIZE = MARKETING_QUEUE_PAGE_SIZE_DEFAULT;
export const REVIEW_FILTER_ALL_VALUE = "__all__";
export const CANCELABLE_JOB_STATUS = [
  "queued",
  "ready",
  "running",
  "waiting_review",
  "approved",
  "failed",
  "rejected",
  "partial",
];
export const ARCHIVABLE_JOB_STATUS = ["success", "failed", "canceled", "rejected", "partial"];
export const MARKETING_CONTENT_QUEUE_API = "/marketing/content-queue";
export const MARKETING_SYSTEM_API = "/marketing/system";
export const MARKETING_QUEUE_CATEGORY_API = "/marketing/queue-categories";
export const MARKETING_TYPO_RULES_API = "/marketing/typo-rules";
export const TEMPLATE_KEY_NONE = "__none__";
export const QUEUE_CATEGORY_POLICY_NONE = "__manual__";
export const MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY = "amu-social-channel-content-v1";
export const MARKETING_PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const;
export const MARKETING_CONTENT_CHANNEL_OPTIONS = [
  { value: "threads", label: "Threads", description: { ko: "자동 발행", en: "Auto publish" } },
  { value: "instagram", label: "Instagram", description: { ko: "이미지 자동 발행", en: "Image auto publish" } },
  { value: "linkedin", label: "LinkedIn", description: { ko: "반자동 검수", en: "Review draft" } },
  { value: "naver_blog", label: "Naver Blog", description: { ko: "반자동 검수", en: "Review draft" } },
] as const;

export const INITIAL_QUEUE_COMPOSER: QueueComposerState = {
  targetUniverseId: "",
  sourceInputMode: "urls",
  bulkTargets: "",
  sourceUrl: "",
  sourceTitle: "",
  sourceExcerptText: "",
  sourceContentText: "",
  sourceImageUrl: "",
  sourceCategories: "",
  sourceTags: "",
  workerId: "admin-ui",
  scheduledAt: "",
  priority: "normal",
  queueCategory: "",
  batchSize: "5",
  generationMode: "server_worker",
  modelProvider: "google",
  modelName: DEFAULT_TEXT_MODEL_BY_PROVIDER.google,
  siteUrl: "",
  instructionText: "",
  reviewMode: "review_required",
  channels: [...MARKETING_DEFAULT_CONTENT_CHANNELS],
};

export const INITIAL_QUEUE_CATEGORY_COMPOSER: QueueCategoryComposerState = {
  queueCategory: "general",
  label: "",
  defaultBatchSize: "1",
  defaultPriority: "normal",
  defaultContentTemplateKey: MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY,
  defaultImageTemplateKey: "",
  defaultReviewMode: "review_required",
  enabled: true,
};

export const EMPTY_GENERATION_CONFIRM: MarketingGenerationConfirmState = {
  open: false,
  jobIds: [],
  channels: undefined,
  mode: "existing",
  warningCount: 0,
  imageCount: 0,
};

export const MARKETING_TAB_HEADER_CLASS = "flex flex-col gap-3 mb-4 sm:flex-row sm:justify-between sm:items-center";
export const REVIEW_PANEL_CARD_CLASS = "rounded-xl border border-border bg-surface p-4";
export const REVIEW_PANEL_EMPTY_CLASS =
  "rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted-text";
export const REVIEW_PANEL_LABEL_CLASS = "mb-1 block text-xs font-medium text-secondary-text";
export const REVIEW_PANEL_SUBTLE_CLASS =
  "rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-secondary-text";
export const REVIEW_PANEL_WARNING_CLASS =
  "rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-primary-text";

export type MarketingContentChannelValue = (typeof MARKETING_CONTENT_CHANNEL_OPTIONS)[number]["value"];

export { MARKETING_QUEUE_ENQUEUE_BATCH_MAX };
