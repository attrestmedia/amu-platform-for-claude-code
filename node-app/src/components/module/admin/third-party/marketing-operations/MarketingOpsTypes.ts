import type { UnknownRecord } from "utils/common/typeUtils";

export type MarketingSourceSnapshot = {
  postId?: number;
  slug?: string;
  url?: string;
  title?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageSource?: string;
  genStudioImageAssetId?: string;
  imageUrls?: string[];
  excerptText?: string;
  contentText?: string;
  categories?: string[];
  tags?: string[];
  modified?: string;
  [key: string]: unknown;
};

export type MarketingSourceRef = {
  slug?: string;
  url?: string;
  title?: string;
  sourceKind?: string;
  sourceId?: string;
  sourceSnapshot?: MarketingSourceSnapshot;
  [key: string]: unknown;
};

export type MarketingJobListItem = {
  jobId: string;
  universeId?: string;
  status?: string;
  priority?: string;
  queueCategory?: string;
  channels?: string[];
  channelStatuses?: Array<{
    channel: string;
    status: string;
    scheduledPublishAt?: string;
    scheduledPublishOverdue?: boolean;
    lastError?: UnknownRecord;
  }>;
  currentStepKey?: string;
  lastError?: UnknownRecord | null;
  archivedAt?: string;
  sourceRef?: MarketingSourceRef;
  createdAt?: string;
  scheduledAt?: string;
  recommendedUploadDates?: Array<{ channel: string; date: string }>;
  recommendedUploadSchedules?: Array<{
    channel: string;
    date: string;
    recommendedHour: number;
    allowedHours: number[];
    policyVersion: number;
    recommendationToken: string;
    /** 시간대 결정 근거 — 배정 시점에 고정된다. */
    hourSource?: "topic_performance" | "channel_performance" | "benchmark";
    topicClass?: string;
    pinnedAt?: string;
    overdue?: boolean;
  }>;
};

export type MarketingJobPagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type MarketingChannelAssetContent = {
  title?: string;
  headline?: string;
  summary?: string;
  description?: string;
  excerpt?: string;
  body?: string;
  caption?: string;
  text?: string;
  plainText?: string;
  html?: string;
  imageUrl?: string;
  image_url?: string;
  imageUrls?: string[];
  imageAssetId?: string;
  imageAssetIds?: string[];
  imageAlt?: string;
  imageSource?: string;
  cardNews?: Record<string, unknown>;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  hashtags?: unknown;
  tags?: unknown;
  commentLink?: string;
  linkUrl?: string;
  publishedUrl?: string;
  request?: { finalUrl?: string };
  issues?: unknown[];
  draft?: unknown;
  payload?: unknown;
  data?: unknown;
  result?: unknown;
  [key: string]: unknown;
};

export type MarketingChannelAsset = {
  content?: MarketingChannelAssetContent;
  [key: string]: unknown;
};

export type MarketingChannelPublishLog = {
  status?: string;
  response?: UnknownRecord;
  targetRef?: { finalUrl?: string; externalUrl?: string; [key: string]: unknown };
  [key: string]: unknown;
};

export type MarketingCredentialStatusItem = {
  exists?: boolean;
  updatedAt?: string;
  extras?: UnknownRecord;
};

export type MarketingCredentialStatusMap = Partial<Record<string, MarketingCredentialStatusItem>>;

export type MarketingChannelStep = {
  stepId?: string;
  status?: string;
  lastError?: UnknownRecord | null;
  meta?: UnknownRecord;
  [key: string]: unknown;
};

export type MarketingChannelSummary = {
  channel: string;
  draftAsset?: MarketingChannelAsset;
  validationAsset?: MarketingChannelAsset;
  receiptAsset?: MarketingChannelAsset;
  latestPublishLog?: MarketingChannelPublishLog;
  generateStep?: MarketingChannelStep;
  validateStep?: MarketingChannelStep;
  reviewStep?: MarketingChannelStep;
  publishStep?: MarketingChannelStep;
  imagePreviews?: MarketingImagePreview[];
};

export type MarketingImagePreview = {
  key?: string;
  url?: string;
  downloadUrl?: string;
  assetId?: string;
  marketingUploadAssetId?: string;
  alt?: string;
  source?: string;
  label?: string;
};

export type MarketingUploadedImageAsset = {
  assetId: string;
  jobId?: string;
  universeId?: string;
  state?: string;
  title?: string;
  mimeType?: string;
  url: string;
  bytes?: number;
  originalFilename?: string;
  retentionMode?: "temporary" | "retained" | string;
  expiresAt?: string | null;
  protectedUntil?: string | null;
  lastReferencedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MarketingImageStudioTarget = {
  channel?: string;
};

export type MarketingGenerationConfirmState = {
  open: boolean;
  jobIds: string[];
  channels?: string[];
  mode: "existing" | "current_list";
  warningCount: number;
  imageCount: number;
};

export type MarketingJobGenerationConfig = {
  generationMode?: string;
  modelProvider?: string;
  modelName?: string;
  instructionText?: string;
  contentTemplateKey?: string;
  imageTemplateKey?: string;
  reviewMode?: string;
};

export type MarketingJobDetail = {
  job: MarketingJobListItem & {
    request?: { generationConfig?: MarketingJobGenerationConfig; [key: string]: unknown };
    [key: string]: unknown;
  };
  steps: UnknownRecord[];
  assets: UnknownRecord[];
  publishLogs: Array<{
    publishLogId?: string;
    channel?: string;
    status?: string;
    [key: string]: unknown;
  }>;
  channels: MarketingChannelSummary[];
};

export type MarketingSystemStatus = {
  scope?: "universe" | "global";
  featureFlags?: {
    enabled?: boolean;
    dryRun?: boolean;
    slack?: boolean;
  };
  redis?: {
    isHealthy?: boolean;
    error?: string;
    queueDepth?: number;
    processingDepth?: number;
    deadLetterDepth?: number;
  };
  mongo?: {
    connections?: Record<string, number>;
  };
  workers?: Array<{
    workerId?: string;
    lastSeenAt?: string;
    ttlMs?: number;
  }>;
  orphanCandidates?: Array<{
    jobId?: string;
    universeId?: string;
    status?: string;
    sourceSlug?: string;
    leaseWorkerId?: string;
    leaseTtlMs?: number;
  }>;
  recentFailedJobs?: MarketingJobListItem[];
  activity?: {
    lookbackDays?: number;
    publishedLogCount?: number;
    failedPublishLogCount?: number;
    localAgentSubmittedJobCount?: number;
    waitingReviewJobCount?: number;
  };
  universeSummaries?: Array<{
    universeId?: string;
    queueDepth?: number;
    processingDepth?: number;
    orphanCount?: number;
    goNoGoReady?: boolean;
    publishedLogCount?: number;
    localAgentSubmittedJobCount?: number;
    waitingReviewJobCount?: number;
    recentPublishedChannelCount?: number;
    goNoGoReasons?: string[];
  }>;
  measurement?: {
    lookbackDays?: number;
    minPublishedLogs?: number;
    recentPublishedLogCount?: number;
    recentPublishedChannels?: string[];
    checklist?: string[];
    adsCredentialReadiness?: Array<{
      provider?: string;
      exists?: boolean;
      updatedAt?: string | null;
    }>;
    goNoGo?: {
      ready?: boolean;
      reasons?: string[];
    };
  };
};

export type ChannelEditorState = {
  title: string;
  headline: string;
  summary: string;
  body: string;
  imageUrl: string;
  imageUrls: string;
  hashtags: string;
  tags: string;
  cta: string;
  commentLink: string;
  publishedUrl: string;
  note: string;
};

export type QueueComposerState = {
  targetUniverseId: string;
  sourceInputMode: string;
  bulkTargets: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceExcerptText: string;
  sourceContentText: string;
  sourceImageUrl: string;
  sourceCategories: string;
  sourceTags: string;
  workerId: string;
  scheduledAt: string;
  priority: string;
  queueCategory: string;
  batchSize: string;
  generationMode: string;
  modelProvider: string;
  modelName: string;
  siteUrl: string;
  instructionText: string;
  reviewMode: string;
  channels: string[];
};

export type WorkerPollResult = {
  ok?: boolean;
  scope?: "universe" | "global";
  universeId?: string;
  status?: string;
  jobId?: string;
  reason?: string;
  scheduledAt?: string;
  scheduledOnly?: boolean;
};

export type MarketingUniverseOption = {
  id: string;
  name: string;
};

export type MarketingTemplateOption = {
  key?: string;
  title?: string;
  templateText?: string;
  sceneTemplate?: string;
  usageTip?: string;
  categories?: string[];
  tags?: string[];
  defaultParams?: UnknownRecord;
  enabled?: boolean;
};

export type MarketingQueueCategoryConfig = {
  configId?: string;
  universeId?: string;
  queueCategory: string;
  label?: string;
  enabled?: boolean;
  defaultBatchSize?: number;
  defaultPriority?: string;
  defaultContentTemplateKey?: string;
  defaultImageTemplateKey?: string;
  defaultGenerationMode?: string;
  defaultModelProvider?: string;
  defaultModelName?: string;
  defaultReviewMode?: string;
  instructionText?: string;
  siteUrl?: string;
  allowedChannels?: string[];
};

export type MarketingTypoRuleStatus = "candidate" | "active" | "ignored" | "disabled";
export type MarketingTypoRuleSeverity = "review" | "warning" | "blocking";
export type MarketingTypoRuleType = "literal" | "regex";

export type MarketingTypoRule = {
  ruleId: string;
  universeId?: string;
  status?: MarketingTypoRuleStatus;
  severity?: MarketingTypoRuleSeverity;
  type?: MarketingTypoRuleType;
  pattern?: string;
  expected?: string[];
  reason?: string;
  channels?: string[];
  occurrenceCount?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastSeen?: UnknownRecord;
  evidence?: UnknownRecord[];
  source?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type MarketingTypoRuleFormState = {
  pattern: string;
  type: MarketingTypoRuleType;
  status: MarketingTypoRuleStatus;
  severity: MarketingTypoRuleSeverity;
  expected: string;
  reason: string;
  channels: string[];
};

export type QueueCategoryComposerState = {
  queueCategory: string;
  label: string;
  defaultBatchSize: string;
  defaultPriority: string;
  defaultContentTemplateKey: string;
  defaultImageTemplateKey: string;
  defaultReviewMode: string;
  enabled: boolean;
};
