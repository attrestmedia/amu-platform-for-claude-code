import type { MarketingChannel } from "consts/marketing/queue";
import type { AiProviderType } from "types/ai";
import type { MarketingGenerationConfig } from "libs/marketing/generationConfig";
import type { CardNewsSemanticCard } from "types/card-news";
import type { UnknownRecord } from "utils/common/typeUtils";
import type {
  CommerceProductSourceImageLineage,
  CommerceProductSourcePromotion,
} from "libs/marketing/source/commerceProductSourceContract";

export type MarketingBridgeProvider = "codex" | "claude";
export type MarketingBridgeTaskKind = "channel_draft" | "validation" | "proofread" | "proofread_check" | "strategy_fit";
export type MarketingBridgeExecutionKind = "api" | "cli";

export type MarketingBridgeBillingContext = {
  uid: string;
  app: string;
  operationId: string;
  meta?: Record<string, unknown>;
};

export type MarketingSourceSnapshot = {
  sourceKind?: string;
  sourceId?: string;
  sourceVersion?: number;
  snapshotHash?: string;
  sourceFingerprint?: string;
  universeId?: string;
  draftId?: string;
  draftRevision?: number;
  channelProductNo?: number;
  summary?: string;
  imageAssetIds?: string[];
  contentAssetIds?: string[];
  productFacts?: UnknownRecord;
  campaignId?: string;
  storeManagerUrl?: string;
  publishedAt?: string;
  imageLineage?: CommerceProductSourceImageLineage[];
  promotion?: CommerceProductSourcePromotion;
  postId?: number;
  slug: string;
  url: string;
  title: string;
  canonicalUrl?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageSource?: string;
  genStudioImageAssetId?: string;
  imageUrls?: string[];
  excerptText?: string;
  contentText?: string;
  outline?: Array<{
    heading: string;
    paragraphs: string[];
  }>;
  sourceQuotes?: string[];
  keyTerms?: string[];
  allowedClaims?: string[];
  categories?: string[];
  tags?: string[];
  modified?: string;
};

export type MarketingChannelDraft = {
  channel: MarketingChannel;
  text?: string;
  title?: string;
  headline?: string;
  summary?: string;
  body?: string;
  html?: string;
  plainText?: string;
  linkUrl?: string;
  commentLink?: string;
  imageUrl?: string;
  imageAssetId?: string;
  imageAlt?: string;
  hashtags?: string[];
  tags?: string[];
  cta?: string;
  suggestedMode?: string;
  /** Instagram generate_channel_copy가 추가 호출 없이 전달하는 CardNews semantic 입력. */
  semanticCards?: CardNewsSemanticCard[];
};

export type MarketingValidationReport = {
  channel: MarketingChannel;
  valid: boolean;
  summary: string;
  issues: string[];
  warnings?: string[];
  hashtagSeparation?: {
    valid: boolean;
    fields: string[];
    tokens: string[];
  };
  score?: number;
  channelFit?: {
    score: number;
    verdict: "positive" | "conditional" | "negative";
    signal: "green" | "yellow" | "red";
    axes: {
      tone: number;
      format: number;
      discoverability: number;
      conversion: number;
      grounding: number;
      riskFree: number;
    };
    expectedExposure: "high" | "medium" | "low";
    notes?: Record<string, string>;
  };
  impactScore?: {
    score: number;
    signal: "green" | "yellow" | "red";
    direction: "positive" | "positive_with_fixes" | "negative";
    confidence: "low" | "medium" | "high";
    recommendations: Array<{
      action: string;
      expectedDelta: number;
      reason: string;
    }>;
  };
  marketingFit?: {
    kind: "marketing";
    channel: MarketingChannel;
    score: number;
    verdict: "fit" | "needs_work" | "not_fit";
    signal: "green" | "yellow" | "red";
    summary: string;
    reasons: string[];
    recommendations: Array<{ action: string; reason: string }>;
    strategyVersion: number;
  };
  adFit?: {
    kind: "advertising";
    channel: MarketingChannel;
    score: number;
    verdict: "fit" | "needs_work" | "not_fit";
    signal: "green" | "yellow" | "red";
    summary: string;
    reasons: string[];
    recommendations: Array<{ action: string; reason: string }>;
    strategyVersion: number;
  };
  sourceCoverage?: {
    usedSections: string[];
    usedTerms: string[];
    usedQuotes?: string[];
    unsupportedClaims: string[];
  };
};

export type MarketingBridgeRequest = (
  | {
      task: "channel_draft";
      channel: MarketingChannel;
      source: MarketingSourceSnapshot;
      generationConfig?: MarketingGenerationConfig;
      billing?: MarketingBridgeBillingContext;
    }
  | {
      task: "validation";
      channel: MarketingChannel;
      source: MarketingSourceSnapshot;
      draft: MarketingChannelDraft;
      generationConfig?: MarketingGenerationConfig;
      billing?: MarketingBridgeBillingContext;
    }
  | {
      task: "proofread";
      channel: MarketingChannel;
      draft: MarketingChannelDraft;
      findings: Array<Record<string, unknown>>;
      manualInstruction?: string;
      generationConfig: MarketingGenerationConfig;
      billing?: MarketingBridgeBillingContext;
    }
  | {
      task: "proofread_check";
      channel: MarketingChannel;
      draft: MarketingChannelDraft;
      generationConfig: MarketingGenerationConfig;
      billing?: MarketingBridgeBillingContext;
    }
  | {
      task: "strategy_fit";
      fitKind: "marketing" | "advertising";
      strategy: Record<string, unknown>;
      drafts: Array<{ channel: MarketingChannel; draft: MarketingChannelDraft }>;
      generationConfig: MarketingGenerationConfig;
      billing?: MarketingBridgeBillingContext;
    }
  ) & {
    /** Authenticated server user for role-aware model resolution; absent for workers. */
    actorUser?: unknown;
  };

export type MarketingBridgeUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  billingKey: string;
  estimatedCoins: number;
};

export type MarketingBridgeRunResult = {
  provider: MarketingBridgeProvider;
  executionProvider: AiProviderType;
  executionKind: MarketingBridgeExecutionKind;
  modelName: string;
  commandPreview: string;
  rawText: string;
  payload: Record<string, unknown>;
  usage: MarketingBridgeUsage;
};
