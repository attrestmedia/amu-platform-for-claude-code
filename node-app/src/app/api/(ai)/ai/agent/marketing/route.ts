import { after, NextRequest, NextResponse } from "next/server";
import {
  countMarketingTypoRules,
  getMarketingJobByJobId,
  getMarketingAdsPolicy,
  getMarketingKeywordSettings,
  listMarketingKeywordClusters,
  listMarketingKeywordProfiles,
  listMarketingTypoRules,
  listMarketingAssets,
  listMarketingJobs,
  listMarketingJobSteps,
  listMarketingPublishLogs,
  listMarketingPromoCreatives,
  recordMarketingTypoCandidate,
  upsertMarketingKeywordCluster,
  upsertMarketingKeywordProfile,
  updateMarketingCriteriaByAgent,
  updateMarketingKeywordSettingsByAgent,
  updateMarketingUploadPolicy,
  updateMarketingAdvertisingCriteriaByAgent,
  updateMarketingTypoRuleStatus,
} from "libs/database/marketing";
import { getCredentialStatus } from "libs/database/secure/credentials";
import { getLinkedInMemberTokenStatus } from "libs/database/secure/linkedinMemberTokens";
import { listOAuthConnectionStatus } from "libs/database/secure/oauthConnections";
import { enqueueMarketingContent } from "libs/marketing/ingest/contentQueueService";
import { applyMarketingChannelAction } from "libs/marketing/operator/channelActionService";
import { buildStableUploadRecommendations } from "libs/marketing/operator/uploadScheduleRecommendation";
import { getMarketingGlobalSystemStatus, getMarketingSystemStatus } from "libs/marketing/queue/ops";
import {
  pollMarketingDryRunWorker,
  pollMarketingDryRunWorkerAcrossUniverses,
  prepareMarketingLocalAgentGeneration,
  prepareMarketingLocalAgentGenerationAcrossUniverses,
  submitMarketingLocalAgentGeneration,
} from "libs/marketing/queue/worker";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { isNewsletterCampaignEnabled } from "libs/server-utils/mail/newsletterSubscriberService";
import { createNewsletterCampaignDraft } from "libs/server-utils/mail/newsletterCampaignService";
import type {
  NewsletterClaimCheck,
  NewsletterCurationDraft,
  NewsletterCurationStory,
} from "libs/server-utils/mail/newsletterCampaignContract";
import { collectGaDailySnapshots, getGaPerformance, isGaPerformanceView } from "libs/marketing/analytics/gaCollectService";
import { auditGaConfiguration } from "libs/server-utils/marketing/ga/gaConfigurationAudit";
import { getSocialPerformance } from "libs/marketing/analytics/socialCollectService";
import { fetchSocialProfiles } from "libs/marketing/profiles/socialProfileService";
import {
  saveMarketingPromoCreative,
  transitionMarketingPromoCreative,
} from "libs/marketing/promo/promoCreativeService";
import { getSocialCollectStatus, startSocialCollectForUniverse } from "libs/marketing/analytics/socialCollectRunner";
import { collectAdsPerformanceSnapshots, getAdsPerformance } from "libs/marketing/analytics/adsCollectService";
import { validateAdsCredentials } from "libs/marketing/ads/credentialsValidation";
import { getNaverAdsAuth, naverSearchAdReadApi } from "libs/api/thirdparty/naverads/naverSearchAdClient";
import { getGoogleAdsAuth, googleAdsGenerateKeywordIdeas } from "libs/api/thirdparty/googleads/googleAdsClient";
import { searchConsoleListSites, searchConsoleQuery } from "libs/api/thirdparty/google/searchConsoleClient";
import {
  LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE,
  LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE,
} from "libs/api/thirdparty/linkedin/linkedinMemberAnalyticsClient";
import {
  analyzeNaverSerp,
  getNaverKeywordTrends,
  refreshKeywordCandidatesWithNaver,
} from "libs/marketing/analytics/naverTrendService";
import {
  listMarketingAgentUniverseIds,
  resolveMarketingAgentUniverseAccess,
  type MarketingAgentAction,
} from "libs/marketing/agent/access";
import { getPublicIntelligencePattern } from "libs/server-utils/magazine/magazineIntelligencePatternRepo";
import {
  buildIntelligenceExperimentPlan,
  buildIntelligenceExperimentResult,
  type IntelligenceExperimentPlan,
  type IntelligenceExperimentPlanBuildInput,
  type IntelligenceExperimentResult,
  type IntelligenceExperimentResultBuildInput,
  type IntelligenceExperimentStatus,
  type IntelligenceExperimentVerdict,
} from "libs/server-utils/magazine/intelligenceExperimentContract";
import {
  createIntelligenceExperiment,
  createIntelligenceExperimentResult,
  createIntelligenceProofCandidate,
  findIntelligenceExperimentResultByAttempt,
  findIntelligenceExperimentResultByIdempotencyKey,
  getIntelligenceExperiment,
  listIntelligenceExperimentResults,
  listIntelligenceExperiments,
  listIntelligenceProofCandidates,
  updateIntelligenceExperimentAfterResult,
} from "libs/server-utils/magazine/intelligenceExperimentRepo";
import {
  buildMarketingOopsNextAction,
  type MarketingOopsProblemClusterPlan,
} from "libs/server-utils/marketing/marketingOopsNextActionContract";
import { enqueueMarketingOopsPatternAction } from "libs/marketing/ingest/marketingOopsPatternQueueService";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { logger } from "utils/log";
import { extractCodedError, pickArray, toUnknownRecord, type UnknownRecord } from "utils/common";
import type {
  MarketingJobStatus,
  MarketingJobSource,
  MarketingJobPriority,
  MarketingChannel,
} from "consts/marketing/queue";
import type { MarketingTypoRuleSeverity, MarketingTypoRuleStatus } from "models/marketing";
import { MARKETING_UPLOAD_POLICY_CHANNELS } from "consts/marketing/uploadPolicy";
import { normalizeAdvertisingCriteriaList } from "consts/marketing/advertisingCriteria";
import { normalizeMarketingKeywordKey } from "consts/marketing/keywordCluster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const AGENT_MARKETING_ENDPOINT = "ai/agent/marketing";
const SEARCH_CONSOLE_DIMENSIONS = new Set(["query", "page", "country", "device", "date"]);
const SEARCH_CONSOLE_TYPES = new Set(["web", "image", "video", "news", "discover", "googleNews"]);
const GOOGLE_ADS_KEYWORD_NETWORKS = new Set(["GOOGLE_SEARCH", "GOOGLE_SEARCH_AND_PARTNERS"]);

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toBoundedInt(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number(raw || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function toCsvValues(raw?: string | null) {
  return Array.from(new Set(toSafeString(raw).split(",").map((value) => value.trim()).filter(Boolean)));
}

function errorResponse(error: string, status = 400, errorCode = status === 403 ? "FORBIDDEN" : "INVALID_INPUT") {
  return NextResponse.json({ ok: false, error, errorCode }, { status });
}

function validateUploadPolicyPatch(value: unknown) {
  const channels = toUnknownRecord(value);
  const supportedChannels = new Set<string>(MARKETING_UPLOAD_POLICY_CHANNELS);
  const channelEntries = Object.entries(channels);
  if (!channelEntries.length) return { ok: false as const, error: "upload_policy_channels_required" };

  for (const [channel, rawPolicy] of channelEntries) {
    if (!supportedChannels.has(channel)) return { ok: false as const, error: "upload_policy_channel_invalid" };
    const policy = toUnknownRecord(rawPolicy);
    if (!Object.keys(policy).length) return { ok: false as const, error: "upload_policy_channel_values_required" };
    for (const [field, max] of [
      ["weekdayDailyCap", 24],
      ["weekendDailyCap", 24],
      ["weeklyCap", 168],
      ["minGapHours", 168],
    ] as const) {
      if (typeof policy[field] === "undefined") continue;
      const number = Number(policy[field]);
      if (!Number.isInteger(number) || number < 0 || number > max) {
        return { ok: false as const, error: `upload_policy_${field}_invalid` };
      }
    }
    if (typeof policy.preferredHours !== "undefined") {
      if (
        !Array.isArray(policy.preferredHours) ||
        !policy.preferredHours.length ||
        policy.preferredHours.some((hour) => !Number.isInteger(Number(hour)) || Number(hour) < 0 || Number(hour) > 23)
      ) {
        return { ok: false as const, error: "upload_policy_preferred_hours_invalid" };
      }
    }
  }

  return { ok: true as const, channels };
}

const ADVERTISING_CRITERIA_FIELDS = new Set([
  "objective",
  "targetAudience",
  "offer",
  "landingPage",
  "requiredClaims",
  "prohibitedClaims",
  "requiredDisclosures",
  "measurementPlan",
]);
const ADVERTISING_OBJECTIVES = new Set(["awareness", "traffic", "leads", "sales"]);

function validateAdvertisingCriteriaPatch(value: unknown) {
  const input = toUnknownRecord(value);
  const entries = Object.entries(input);
  if (!entries.length) return { ok: false as const, error: "advertising_criteria_values_required" };
  if (entries.some(([field]) => !ADVERTISING_CRITERIA_FIELDS.has(field))) {
    return { ok: false as const, error: "advertising_criteria_field_invalid" };
  }

  const criteria: Record<string, unknown> = {};
  for (const [field, raw] of entries) {
    if (["requiredClaims", "prohibitedClaims", "requiredDisclosures"].includes(field)) {
      criteria[field] = normalizeAdvertisingCriteriaList(raw);
      continue;
    }
    const text = toSafeString(raw);
    if (field === "objective" && !ADVERTISING_OBJECTIVES.has(text)) {
      return { ok: false as const, error: "advertising_criteria_objective_invalid" };
    }
    const max = field === "measurementPlan" ? 2000 : 1000;
    if (text.length > max || (["targetAudience", "offer"].includes(field) && !text)) {
      return { ok: false as const, error: `advertising_criteria_${field}_invalid` };
    }
    criteria[field] = text;
  }
  return { ok: true as const, criteria };
}

const MARKETING_CRITERIA_TEXT_FIELDS: Record<string, number> = {
  goal: 1000,
  targetPersona: 1000,
  primaryConversion: 500,
  coreMessage: 2000,
};
const MARKETING_CRITERIA_LIST_FIELDS = new Set(["requiredTopics", "excludedTopics"]);
const MARKETING_CRITERIA_FUNNELS = new Set(["TOFU", "MOFU", "BOFU", "mixed"]);
const MARKETING_CRITERIA_GUIDANCE_CHANNELS = new Set(["threads", "instagram", "linkedin", "naver_blog"]);
/** 목록 항목 1건의 저장 상한 — repo의 toKeywordList와 동일해야 운영 UI 저장 시 값이 잘리지 않는다. */
const MARKETING_CRITERIA_LIST_ITEM_MAX = 80;
const MARKETING_CRITERIA_LIST_MAX = 30;

/**
 * 마케팅 적합도 기준 부분 패치 검증 — 허용 필드/길이/enum/목록 형식만 확인한다.
 * uploadPolicy는 여기서 받지 않는다(update_upload_policy 전용 경로).
 */
function validateMarketingCriteriaPatch(value: unknown) {
  const input = toUnknownRecord(value);
  const entries = Object.entries(input);
  if (!entries.length) return { ok: false as const, error: "marketing_criteria_values_required" };

  const criteria: Record<string, unknown> = {};
  for (const [field, raw] of entries) {
    if (field === "uploadPolicy") {
      return { ok: false as const, error: "marketing_criteria_upload_policy_not_allowed" };
    }
    if (MARKETING_CRITERIA_LIST_FIELDS.has(field)) {
      if (!Array.isArray(raw)) return { ok: false as const, error: `marketing_criteria_${field}_invalid` };
      const list = raw.map((item) => toSafeString(item)).filter(Boolean);
      if (list.length > MARKETING_CRITERIA_LIST_MAX) {
        return { ok: false as const, error: `marketing_criteria_${field}_too_many` };
      }
      if (list.some((item) => item.length > MARKETING_CRITERIA_LIST_ITEM_MAX)) {
        return { ok: false as const, error: `marketing_criteria_${field}_item_too_long` };
      }
      criteria[field] = list;
      continue;
    }
    if (field === "funnel") {
      const funnel = toSafeString(raw);
      if (!MARKETING_CRITERIA_FUNNELS.has(funnel)) {
        return { ok: false as const, error: "marketing_criteria_funnel_invalid" };
      }
      criteria.funnel = funnel;
      continue;
    }
    if (field === "channelGuidance") {
      const guidance = toUnknownRecord(raw);
      const guidanceEntries = Object.entries(guidance);
      if (!guidanceEntries.length) return { ok: false as const, error: "marketing_criteria_channel_guidance_required" };
      const patch: Record<string, string> = {};
      for (const [channel, text] of guidanceEntries) {
        if (!MARKETING_CRITERIA_GUIDANCE_CHANNELS.has(channel)) {
          return { ok: false as const, error: "marketing_criteria_channel_invalid" };
        }
        const body = toSafeString(text);
        if (body.length > 1000) return { ok: false as const, error: "marketing_criteria_channel_guidance_too_long" };
        patch[channel] = body;
      }
      criteria.channelGuidance = patch;
      continue;
    }
    const max = MARKETING_CRITERIA_TEXT_FIELDS[field];
    if (!max) return { ok: false as const, error: "marketing_criteria_field_invalid" };
    const text = toSafeString(raw);
    if (!text || text.length > max) return { ok: false as const, error: `marketing_criteria_${field}_invalid` };
    criteria[field] = text;
  }
  return { ok: true as const, criteria };
}

const KEYWORD_SETTINGS_TIME_UNITS = new Set(["date", "week", "month"]);
const KEYWORD_SETTINGS_DEVICES = new Set(["all", "pc", "mo"]);

/** 기본 앵커 설정 부분 패치 검증 */
function validateKeywordSettingsPatch(value: unknown) {
  const input = toUnknownRecord(value);
  const entries = Object.entries(input);
  if (!entries.length) return { ok: false as const, error: "keyword_settings_values_required" };

  const settings: Record<string, unknown> = {};
  for (const [field, raw] of entries) {
    if (field === "defaultAnchorKeyword") {
      const text = toSafeString(raw);
      if (!text || text.length > 80) return { ok: false as const, error: "keyword_settings_anchor_invalid" };
      settings.defaultAnchorKeyword = text;
      continue;
    }
    if (field === "defaultLookbackDays") {
      const days = Number(raw);
      if (!Number.isInteger(days) || days < 7 || days > 730) {
        return { ok: false as const, error: "keyword_settings_lookback_days_invalid" };
      }
      settings.defaultLookbackDays = days;
      continue;
    }
    if (field === "defaultTimeUnit") {
      const unit = toSafeString(raw);
      if (!KEYWORD_SETTINGS_TIME_UNITS.has(unit)) return { ok: false as const, error: "keyword_settings_time_unit_invalid" };
      settings.defaultTimeUnit = unit;
      continue;
    }
    if (field === "defaultDevice") {
      const device = toSafeString(raw);
      if (!KEYWORD_SETTINGS_DEVICES.has(device)) return { ok: false as const, error: "keyword_settings_device_invalid" };
      settings.defaultDevice = device;
      continue;
    }
    return { ok: false as const, error: "keyword_settings_field_invalid" };
  }
  return { ok: true as const, settings };
}

const KEYWORD_CLUSTER_TEXT_LIMITS: Record<string, number> = {
  labelKo: 80,
  labelEn: 80,
  descriptionKo: 300,
  descriptionEn: 300,
};
const KEYWORD_CLUSTER_SCOPES = new Set(["strategy", "topic"]);

/** 클러스터 부분 패치 검증 — clusterKey는 호출부에서 정규화한다. */
function validateKeywordClusterPatch(value: unknown) {
  const input = toUnknownRecord(value);
  const entries = Object.entries(input);
  if (!entries.length) return { ok: false as const, error: "keyword_cluster_values_required" };

  const patch: Record<string, unknown> = {};
  for (const [field, raw] of entries) {
    if (field === "clusterScope") {
      const scope = toSafeString(raw);
      if (!KEYWORD_CLUSTER_SCOPES.has(scope)) {
        return { ok: false as const, error: "keyword_cluster_scope_invalid" };
      }
      patch.clusterScope = scope;
      continue;
    }
    if (field === "enabled") {
      if (typeof raw !== "boolean") return { ok: false as const, error: "keyword_cluster_enabled_invalid" };
      patch.enabled = raw;
      continue;
    }
    if (field === "sortOrder") {
      const order = Number(raw);
      if (!Number.isInteger(order) || order < 0 || order > 999) {
        return { ok: false as const, error: "keyword_cluster_sort_order_invalid" };
      }
      patch.sortOrder = order;
      continue;
    }
    const max = KEYWORD_CLUSTER_TEXT_LIMITS[field];
    if (!max) return { ok: false as const, error: "keyword_cluster_field_invalid" };
    const text = toSafeString(raw);
    if (text.length > max) return { ok: false as const, error: `keyword_cluster_${field}_invalid` };
    patch[field] = text;
  }
  return { ok: true as const, patch };
}

const KEYWORD_PROFILE_TEXT_LIMITS: Record<string, number> = {
  name: 120,
  clusterKey: 60,
  clusterScope: 20,
  anchorKeyword: 80,
  selectedKeyword: 80,
  selectedReason: 500,
  targetPersona: 200,
  campaignId: 120,
  note: 1000,
};
const KEYWORD_PROFILE_LIST_FIELDS = new Set(["seedKeywords", "negativeKeywords"]);
const KEYWORD_PROFILE_CLUSTER_SCOPES = new Set(["strategy", "topic"]);

/**
 * 프로필 부분 패치 검증 — 허용 필드/길이/목록 형식만 확인한다.
 * 클러스터 실재 검증과 기존 값 병합은 호출부(핸들러)에서 수행한다.
 */
function validateKeywordProfilePatch(value: unknown) {
  const input = toUnknownRecord(value);
  const entries = Object.entries(input);
  if (!entries.length) return { ok: false as const, error: "keyword_profile_values_required" };

  const patch: Record<string, unknown> = {};
  for (const [field, raw] of entries) {
    if (field === "enabled") {
      if (typeof raw !== "boolean") return { ok: false as const, error: "keyword_profile_enabled_invalid" };
      patch.enabled = raw;
      continue;
    }
    if (KEYWORD_PROFILE_LIST_FIELDS.has(field)) {
      if (!Array.isArray(raw)) return { ok: false as const, error: `keyword_profile_${field}_invalid` };
      const list = Array.from(new Set(raw.map((item) => toSafeString(item)).filter(Boolean)));
      if (list.length > 20 || list.some((item) => item.length > 80)) {
        return { ok: false as const, error: `keyword_profile_${field}_invalid` };
      }
      patch[field] = list;
      continue;
    }
    const max = KEYWORD_PROFILE_TEXT_LIMITS[field];
    if (typeof max === "undefined") return { ok: false as const, error: "keyword_profile_field_invalid" };
    const text = toSafeString(raw);
    if (text.length > max) return { ok: false as const, error: `keyword_profile_${field}_invalid` };
    if (field === "clusterScope" && text && !KEYWORD_PROFILE_CLUSTER_SCOPES.has(text)) {
      return { ok: false as const, error: "keyword_profile_clusterScope_invalid" };
    }
    patch[field] = text;
  }

  return { ok: true as const, patch };
}

function assertMarketingReady(request: NextRequest) {
  const auth = validateAgentKey(request, { scope: "marketing:*" });
  if (!auth.valid) {
    return {
      ok: false as const,
      response: errorResponse(auth.error, 401, "UNAUTHORIZED"),
    };
  }

  if (!isMarketingFeatureEnabled()) {
    return {
      ok: false as const,
      response: errorResponse("marketing_feature_disabled", 404, "NOT_FOUND"),
    };
  }

  return { ok: true as const, auth };
}

async function enforceMarketingRateLimit(auth: { uid: string; keyHash: string }) {
  await enforceAgentRequestRateLimit({
    uid: auth.uid,
    endpoint: AGENT_MARKETING_ENDPOINT,
    limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
    keyHash: auth.keyHash,
  });
}

function buildAccessError(result: { status: number; error: string }) {
  return errorResponse(result.error, result.status, result.status === 404 ? "NOT_FOUND" : "FORBIDDEN");
}

function getTokenHealthFromExpiresAt(channel: string, exists: boolean, expiresAt?: unknown, updatedAt?: unknown) {
  const safeExpiresAt = toSafeString(expiresAt);
  const expiresTime = safeExpiresAt ? new Date(safeExpiresAt).getTime() : 0;
  const daysLeft = expiresTime && !Number.isNaN(expiresTime) ? Math.ceil((expiresTime - Date.now()) / 86_400_000) : null;
  const state = !exists
    ? "missing"
    : daysLeft === null
      ? "unknown"
      : daysLeft <= 0
        ? "expired"
        : daysLeft <= 7
          ? "critical"
          : daysLeft <= 15
            ? "warning"
            : "healthy";

  return {
    channel,
    exists,
    expiresAt: safeExpiresAt || null,
    updatedAt: toSafeString(updatedAt) || null,
    daysLeft,
    state,
    canCollectPerformance: state === "healthy" || state === "warning" || state === "critical",
    measurementRisk: state === "healthy" ? "low" : state === "warning" ? "medium" : "high",
  };
}

async function resolveAllowedUniverseIds(auth: { uid: string; keyHash: string }, action: MarketingAgentAction) {
  const result = await listMarketingAgentUniverseIds({ auth, action });
  if (!result.ok) return result;
  return result;
}

function buildChannelSummaries(jobRaw: unknown, stepsRaw: unknown, assetsRaw: unknown, publishLogsRaw: unknown) {
  const job: UnknownRecord = toUnknownRecord(jobRaw);
  const steps: UnknownRecord[] = pickArray<UnknownRecord>(stepsRaw);
  const assets: UnknownRecord[] = pickArray<UnknownRecord>(assetsRaw);
  const publishLogs: UnknownRecord[] = pickArray<UnknownRecord>(publishLogsRaw);
  const channels = Array.isArray(job?.channels) ? job.channels.map((channel) => toSafeString(channel)).filter(Boolean) : [];

  return channels.map((channel: string) => {
    const channelAssets = assets.filter((asset) => toSafeString(asset.channel) === channel);
    const draftAsset = channelAssets.find((asset) => toSafeString(asset.kind) === "channel_draft") || null;
    const validationAsset = channelAssets.find((asset) => toSafeString(asset.kind) === "validation_report") || null;
    const receiptAsset = channelAssets.find((asset) => toSafeString(asset.kind) === "publish_receipt") || null;
    const latestPublishLog = publishLogs.find((log) => toSafeString(log.channel) === channel) || null;

    return {
      channel,
      draftAsset,
      validationAsset,
      receiptAsset,
      latestPublishLog,
      generateStep:
        steps.find((step) => toSafeString(step.stepKey) === "generate_channel_copy" && toSafeString(step.channel) === channel) || null,
      validateStep:
        steps.find((step) => toSafeString(step.stepKey) === "validate_output" && toSafeString(step.channel) === channel) || null,
      reviewStep:
        channel === "linkedin"
          ? steps.find((step) => toSafeString(step.stepKey) === "prepare_linkedin_draft" && toSafeString(step.channel) === "linkedin") || null
          : channel === "naver_blog"
            ? steps.find((step) => toSafeString(step.stepKey) === "prepare_naver_draft" && toSafeString(step.channel) === "naver_blog") || null
            : channel === "threads"
              ? steps.find((step) => toSafeString(step.stepKey) === "publish_threads" && toSafeString(step.channel) === "threads") || null
              : channel === "instagram"
                ? steps.find((step) => toSafeString(step.stepKey) === "publish_instagram" && toSafeString(step.channel) === "instagram") ||
                  null
              : null,
      publishStep:
        channel === "threads"
          ? steps.find((step) => toSafeString(step.stepKey) === "publish_threads" && toSafeString(step.channel) === "threads") || null
          : channel === "instagram"
            ? steps.find((step) => toSafeString(step.stepKey) === "publish_instagram" && toSafeString(step.channel) === "instagram") || null
          : null,
    };
  });
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function buildExperimentPlanInput(
  body: UnknownRecord,
  pattern: IntelligenceExperimentPlanBuildInput["pattern"],
  createdBy: string,
  universeId: string,
): IntelligenceExperimentPlanBuildInput {
  const startsAtRaw = toSafeString(body.startsAt);
  return {
    universeId,
    pattern,
    problemCluster: toUnknownRecord(body.problemCluster) as IntelligenceExperimentPlanBuildInput["problemCluster"],
    nextAction: toSafeString(body.nextAction),
    doNotChange: toSafeString(body.doNotChange),
    priority: toSafeString(body.priority) as IntelligenceExperimentPlanBuildInput["priority"],
    channels: (Array.isArray(body.channels) ? body.channels : []) as IntelligenceExperimentPlanBuildInput["channels"],
    hypothesis: toSafeString(body.hypothesis),
    falsifier: toSafeString(body.falsifier),
    metricKey: toSafeString(body.metricKey),
    metricLabel: toSafeString(body.metricLabel),
    observationType: toSafeString(body.observationType) as IntelligenceExperimentPlanBuildInput["observationType"],
    successCriterion: toSafeString(body.successCriterion),
    reviewWindowDays: Number(body.reviewWindowDays) as IntelligenceExperimentPlanBuildInput["reviewWindowDays"],
    minimumSampleSize: Number(body.minimumSampleSize),
    stopCriteria: Array.isArray(body.stopCriteria) ? body.stopCriteria : [],
    audience: toSafeString(body.audience),
    before: toSafeString(body.before),
    proofType: toSafeString(body.proofType) as IntelligenceExperimentPlanBuildInput["proofType"],
    proofStage: toSafeString(body.proofStage) as IntelligenceExperimentPlanBuildInput["proofStage"],
    createdBy,
    ...(startsAtRaw ? { startsAt: new Date(startsAtRaw) } : {}),
  };
}

function patternReadErrorResponse(result: { error: "not_found" | "unavailable" }) {
  return errorResponse(
    result.error === "unavailable" ? "intelligence_pattern_unavailable" : "intelligence_pattern_not_found",
    result.error === "unavailable" ? 503 : 404,
    result.error === "unavailable" ? "SERVICE_UNAVAILABLE" : "NOT_FOUND",
  );
}

export async function GET(request: NextRequest) {
  try {
    const ready = assertMarketingReady(request);
    if (!ready.ok) return ready.response;
    await enforceMarketingRateLimit(ready.auth);

    const searchParams = new URL(request.url).searchParams;
    const action = toSafeString(searchParams.get("action")) || "list_jobs";

    if (action === "status") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (universeId) {
        const access = await resolveMarketingAgentUniverseAccess({
          auth: ready.auth,
          universeId,
          action: "read",
        });
        if (!access.ok) return buildAccessError(access);

        const data = await getMarketingSystemStatus({ universeId: access.universeId });
        return NextResponse.json({ ok: true, action, data });
      }

      const allowed = await resolveAllowedUniverseIds(ready.auth, "read");
      if (!allowed.ok) return buildAccessError(allowed);
      const data = await getMarketingGlobalSystemStatus({ universeIds: allowed.universeIds });
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "token_health") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);

      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);

      const [credentialStatus, linkedInMemberStatus, oauthConnectionStatus] = await Promise.all([
        getCredentialStatus(access.universeId),
        getLinkedInMemberTokenStatus(access.universeId).catch(() => ({ exists: false as const })),
        listOAuthConnectionStatus({ ownerType: "universe", ownerId: access.universeId }).catch(() => []),
      ]);
      const threadsExtras = credentialStatus.threads?.extras || {};
      const instagramExtras = credentialStatus.instagram?.extras || {};
      const activeOAuthConnection = (provider: "threads" | "instagram") =>
        oauthConnectionStatus.find(
          (connection) =>
            connection.provider === provider &&
            connection.isActive === true &&
            connection.connectionStatus !== "disconnected",
        );
      const channelTokenHealth = (provider: "threads" | "instagram", extras: Record<string, unknown>) => {
        const oauth = activeOAuthConnection(provider);
        return oauth
          ? {
              ...getTokenHealthFromExpiresAt(provider, true, oauth.expiresAt, oauth.updatedAt),
              source: "oauth",
              connectionStatus: oauth.connectionStatus,
            }
          : {
              ...getTokenHealthFromExpiresAt(
                provider,
                Boolean(credentialStatus[provider]?.exists),
                extras.tokenExpiresAt,
                credentialStatus[provider]?.updatedAt,
              ),
              source: "legacy_credential",
            };
      };
      const linkedinScopes = "scope" in linkedInMemberStatus && Array.isArray(linkedInMemberStatus.scope) ? linkedInMemberStatus.scope : [];
      const linkedinAppCredential = credentialStatus.linkedin;
      const linkedinTokenUpdatedAt = "updatedAt" in linkedInMemberStatus ? toSafeString(linkedInMemberStatus.updatedAt) : "";
      const linkedinAppUpdatedAt = toSafeString(linkedinAppCredential?.updatedAt);

      return NextResponse.json({
        ok: true,
        action,
        data: {
          universeId: access.universeId,
          channels: [
            channelTokenHealth("threads", threadsExtras),
            channelTokenHealth("instagram", instagramExtras),
            {
              ...getTokenHealthFromExpiresAt(
                "linkedin",
                Boolean(linkedInMemberStatus.exists),
                "expiresAt" in linkedInMemberStatus ? linkedInMemberStatus.expiresAt : null,
                "updatedAt" in linkedInMemberStatus ? linkedInMemberStatus.updatedAt : null,
              ),
              scopes: linkedinScopes,
              capabilities: {
                postAnalytics: linkedinScopes.includes(LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE),
                profileAnalytics: linkedinScopes.includes(LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE),
              },
              appCredential: {
                ready: linkedinAppCredential?.ready === true,
                updatedAt: linkedinAppUpdatedAt || null,
                changedAfterMemberToken: Boolean(
                  linkedinAppUpdatedAt &&
                  linkedinTokenUpdatedAt &&
                  new Date(linkedinAppUpdatedAt).getTime() > new Date(linkedinTokenUpdatedAt).getTime()
                ),
              },
            },
          ],
        },
      });
    }

    if (action === "ga_performance") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);
      const view = toSafeString(searchParams.get("view")) || "template_funnel";
      if (!isGaPerformanceView(view)) return errorResponse("unsupported_view", 400);

      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await getGaPerformance({
        universeId: access.universeId,
        view,
        days: toBoundedInt(searchParams.get("days"), 28, 1, 90),
        entityId: toSafeString(searchParams.get("entityId")) || undefined,
        propertyKey: toSafeString(searchParams.get("propertyKey")) || undefined,
        propertyId: toSafeString(searchParams.get("propertyId")) || undefined,
        limit: toBoundedInt(searchParams.get("limit"), 2000, 1, 2000),
        offset: toBoundedInt(searchParams.get("offset"), 0, 0, 50_000),
      });
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "ga_configuration") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await auditGaConfiguration({
        universeId: access.universeId,
        propertyIds: toCsvValues(searchParams.get("propertyId")).slice(0, 10),
        eventLookbackDays: toBoundedInt(searchParams.get("eventLookbackDays"), 28, 1, 90),
      });
      return NextResponse.json({ ok: data.ok, action, data }, { status: data.ok ? 200 : 409 });
    }

    if (action === "social_performance") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);

      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);

      const [data, autoCollect] = await Promise.all([
        getSocialPerformance({
          universeId: access.universeId,
          channels: toCsvValues(searchParams.get("channel")),
          days: toBoundedInt(searchParams.get("days"), 30, 1, 180),
          entityId: toSafeString(searchParams.get("entityId")) || undefined,
        }),
        getSocialCollectStatus(access.universeId),
      ]);
      return NextResponse.json({ ok: true, action, data: { ...data, autoCollect } });
    }

    if (action === "social_profiles") {
      const universeId = toSafeString(searchParams.get("universeId"));
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "read" });
      if (!access.ok) return buildAccessError(access);
      const data = await fetchSocialProfiles({
        universeId: access.universeId,
        channels: toCsvValues(searchParams.get("channel")),
      });
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "promo_creatives") {
      const universeId = toSafeString(searchParams.get("universeId"));
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "read" });
      if (!access.ok) return buildAccessError(access);
      const data = await listMarketingPromoCreatives({ universeId: access.universeId, limit: 300 });
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "ads_performance") {
      const universeId = toSafeString(searchParams.get("universeId"));
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "ads_read" });
      if (!access.ok) return buildAccessError(access);
      const data = await getAdsPerformance({
        universeId: access.universeId,
        channels: toCsvValues(searchParams.get("channel")),
        days: toBoundedInt(searchParams.get("days"), 30, 1, 180),
      });
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "ads_credentials_check") {
      const universeId = toSafeString(searchParams.get("universeId"));
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "ads_read" });
      if (!access.ok) return buildAccessError(access);
      const data = await Promise.all([
        validateAdsCredentials({ universeId: access.universeId, provider: "naver_ads" }),
        validateAdsCredentials({ universeId: access.universeId, provider: "google_ads" }),
      ]);
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "search_console_sites") {
      const universeId = toSafeString(searchParams.get("universeId"));
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "ads_read" });
      if (!access.ok) return buildAccessError(access);
      const googleAuth = await getGoogleAdsAuth(access.universeId);
      if (!googleAuth) return errorResponse("google_ads_credentials_incomplete", 409, "PRECONDITION_FAILED");
      const data = await searchConsoleListSites(googleAuth);
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "keyword_profiles") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);

      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);

      const [settings, profiles, clusters] = await Promise.all([
        getMarketingKeywordSettings(access.universeId),
        listMarketingKeywordProfiles({ universeId: access.universeId, enabledOnly: true }),
        listMarketingKeywordClusters({ universeId: access.universeId, enabledOnly: true }),
      ]);
      return NextResponse.json({
        ok: true,
        action,
        data: {
          settings: settings ?? null,
          profiles,
          clusters,
          note: "anchorIndex는 같은 anchorKeyword 내에서만 비교 가능합니다. 프로필 anchor가 다르면 지수를 병합 비교하지 마세요.",
        },
      });
    }

    if (action === "fit_strategies") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "read" });
      if (!access.ok) return buildAccessError(access);
      const [keywordSettings, adsPolicy] = await Promise.all([
        getMarketingKeywordSettings(access.universeId),
        getMarketingAdsPolicy(access.universeId),
      ]);
      const marketingCriteria = toUnknownRecord(keywordSettings?.marketingCriteria);
      const advertisingCriteria = toUnknownRecord(adsPolicy?.advertisingCriteria);
      return NextResponse.json({
        ok: true,
        action,
        data: {
          marketing: {
            criteria: marketingCriteria,
            version: Number(marketingCriteria.version || 0),
            ready: Boolean(toSafeString(marketingCriteria.goal) && toSafeString(marketingCriteria.targetPersona)),
            updatedAt: keywordSettings?.updatedAt || null,
          },
          advertising: {
            criteria: advertisingCriteria,
            version: Number(advertisingCriteria.version || 0),
            ready: Boolean(toSafeString(advertisingCriteria.targetAudience) && toSafeString(advertisingCriteria.offer)),
            updatedAt: adsPolicy?.updatedAt || null,
          },
          scoring: { fit: "85-100", needsWork: "70-84", notFit: "0-69" },
          naverBlogPolicy: "주제가 블로그 목표와 마케팅 전략에 부합하지 않으면 본문 생성 전에 excluded 처리합니다.",
        },
      });
    }

    if (action === "pattern_experiments") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "experiment_read" });
      if (!access.ok) return buildAccessError(access);
      const statusRaw = toSafeString(searchParams.get("status"));
      const verdictRaw = toSafeString(searchParams.get("verdict"));
      const statuses = new Set(["planned", "running", "completed", "canceled"]);
      const verdicts = new Set(["pending_verdict", "scale", "iterate", "stop"]);
      if (statusRaw && !statuses.has(statusRaw)) return errorResponse("experiment_status_invalid", 400);
      if (verdictRaw && !verdicts.has(verdictRaw)) return errorResponse("experiment_verdict_invalid", 400);
      const items = await listIntelligenceExperiments({
        universeId: access.universeId,
        patternId: toSafeString(searchParams.get("patternId")) || undefined,
        status: statusRaw as IntelligenceExperimentStatus || undefined,
        verdict: verdictRaw as IntelligenceExperimentVerdict || undefined,
        limit: toBoundedInt(searchParams.get("limit"), 20, 1, 100),
      });
      return NextResponse.json({ ok: true, action, data: { items, returned: items.length, universeId: access.universeId } });
    }

    if (action === "pattern_experiment_detail") {
      const universeId = toSafeString(searchParams.get("universeId"));
      const experimentId = toSafeString(searchParams.get("experimentId"));
      if (!universeId) return errorResponse("universe_id_required", 400);
      if (!experimentId) return errorResponse("experiment_id_required", 400);
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "experiment_read" });
      if (!access.ok) return buildAccessError(access);
      const experiment = await getIntelligenceExperiment(experimentId, access.universeId);
      if (!experiment) return errorResponse("experiment_not_found", 404, "NOT_FOUND");
      const [results, proofCandidates] = await Promise.all([
        listIntelligenceExperimentResults(experimentId, access.universeId, toBoundedInt(searchParams.get("limit"), 100, 1, 100)),
        listIntelligenceProofCandidates(experimentId, access.universeId, toBoundedInt(searchParams.get("limit"), 100, 1, 100)),
      ]);
      return NextResponse.json({ ok: true, action, data: { experiment, results, proofCandidates, universeId: access.universeId } });
    }

    if (action === "naver_keyword_trend") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);
      const keywords = [...toCsvValues(searchParams.get("keywords")), ...searchParams.getAll("keyword").map((k) => k.trim())].filter(
        Boolean,
      );
      if (keywords.length === 0) return errorResponse("keywords_required", 400);

      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);

      const timeUnitRaw = toSafeString(searchParams.get("timeUnit"));
      const data = await getNaverKeywordTrends({
        universeId: access.universeId,
        keywords,
        timeUnit: timeUnitRaw === "week" || timeUnitRaw === "date" ? timeUnitRaw : "month",
        force: toSafeString(searchParams.get("force")) === "true",
        profileKey: toSafeString(searchParams.get("profileKey")) || undefined,
        anchorKeyword: toSafeString(searchParams.get("anchorKeyword")) || undefined,
      });
      if (!data.ok) return errorResponse(data.error, 409, "PRECONDITION_FAILED");
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "naver_serp_analysis") {
      const universeId = toSafeString(searchParams.get("universeId"));
      if (!universeId) return errorResponse("universe_id_required", 400);
      const keyword = toSafeString(searchParams.get("keyword"));
      if (!keyword) return errorResponse("keyword_required", 400);

      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await analyzeNaverSerp({
        universeId: access.universeId,
        keyword,
        display: toBoundedInt(searchParams.get("display"), 30, 5, 100),
      });
      if (!data.ok) return errorResponse(data.error, 409, "PRECONDITION_FAILED");
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "detail") {
      const jobId = toSafeString(searchParams.get("jobId"));
      if (!jobId) return errorResponse("job_id_required", 400);

      const job = await getMarketingJobByJobId(jobId);
      if (!job) return errorResponse("job_not_found", 404, "NOT_FOUND");

      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId: toSafeString(job.universeId),
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);

      const [steps, assets, publishLogs] = await Promise.all([
        listMarketingJobSteps({ jobId, limit: 200 }),
        listMarketingAssets({ jobId, limit: 200 }),
        listMarketingPublishLogs({ universeId: access.universeId, jobId, limit: 100 }),
      ]);

      return NextResponse.json({
        ok: true,
        action,
        data: {
          job,
          steps,
          assets,
          publishLogs,
          channels: buildChannelSummaries(job, steps, assets, publishLogs),
        },
      });
    }

    if (action === "typo_rules") {
      const requestedUniverseId = toSafeString(searchParams.get("universeId"));
      let universeIds: string[] = [];
      if (requestedUniverseId) {
        const access = await resolveMarketingAgentUniverseAccess({
          auth: ready.auth,
          universeId: requestedUniverseId,
          action: "typo_dictionary",
        });
        if (!access.ok) return buildAccessError(access);
        universeIds = [access.universeId];
      } else {
        const allowed = await resolveAllowedUniverseIds(ready.auth, "typo_dictionary");
        if (!allowed.ok) return buildAccessError(allowed);
        universeIds = allowed.universeIds;
      }

      const limit = toBoundedInt(searchParams.get("limit"), 100, 1, 500);
      const page = toBoundedInt(searchParams.get("page"), 1, 1, 10000);
      if (universeIds.length === 0) {
        return NextResponse.json({
          ok: true,
          action,
          data: { items: [], total: 0, page, limit, returned: 0, truncated: false, scope: "global" },
        });
      }
      const query = {
        universeIds,
        status: toCsvValues(searchParams.get("status")) as MarketingTypoRuleStatus[],
        severity: toCsvValues(searchParams.get("severity")) as MarketingTypoRuleSeverity[],
        pattern: toSafeString(searchParams.get("pattern")),
        channel: toSafeString(searchParams.get("channel")),
        limit,
        page,
      };
      const [items, total] = await Promise.all([listMarketingTypoRules(query), countMarketingTypoRules(query)]);

      return NextResponse.json({
        ok: true,
        action,
        data: { items, total, page, limit, returned: items.length, truncated: page * limit < total, scope: "global" },
      });
    }

    const requestedUniverseId = toSafeString(searchParams.get("universeId"));
    let universeIds: string[] = [];
    if (requestedUniverseId) {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId: requestedUniverseId,
        action: "read",
      });
      if (!access.ok) return buildAccessError(access);
      universeIds = [access.universeId];
    } else {
      const allowed = await resolveAllowedUniverseIds(ready.auth, "read");
      if (!allowed.ok) return buildAccessError(allowed);
      universeIds = allowed.universeIds;
    }

    const result = await listMarketingJobs({
      universeIds,
      status: toCsvValues(searchParams.get("status")) as MarketingJobStatus[],
      source: toCsvValues(searchParams.get("source")) as MarketingJobSource[],
      priority: toCsvValues(searchParams.get("priority")) as MarketingJobPriority[],
      queueCategory: toSafeString(searchParams.get("queueCategory")),
      channel: toCsvValues(searchParams.get("channel")) as MarketingChannel[],
      page: toBoundedInt(searchParams.get("page"), 1, 1, 1000),
      limit: toBoundedInt(searchParams.get("limit"), 20, 1, 100),
    });

    const stableRecommendations = await buildStableUploadRecommendations(universeIds);
    const items = result.items.map((item) => {
      const channels = Array.isArray((item as UnknownRecord).channels)
        ? ((item as UnknownRecord).channels as unknown[]).map(toSafeString).filter(Boolean)
        : [];
      const recommendedUploadSchedules = channels
        .map((channel) => stableRecommendations.get(`${toSafeString(item.jobId)}:${channel}`))
        .filter(Boolean);
      return {
        ...item,
        recommendedUploadDates: recommendedUploadSchedules.map((schedule) => ({ channel: schedule!.channel, date: schedule!.date })),
        recommendedUploadSchedules,
      };
    });

    return NextResponse.json({ ok: true, action: "list_jobs", data: { ...result, items } });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, { message: "agent_marketing_get_failed" });
    logger.error("[agent-marketing] GET failed", { error: message });
    return errorResponse(message, status, errorCode);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ready = assertMarketingReady(request);
    if (!ready.ok) return ready.response;
    await enforceMarketingRateLimit(ready.auth);

    const body = await readJsonBody(request);
    const action = toSafeString(body?.action);
    if (!action) return errorResponse("action_required", 400);

    if (action === "poll_worker") {
      const workerId = toSafeString(body?.workerId) || `marketing-agent-${ready.auth.uid}`;
      const universeId = toSafeString(body?.universeId);
      const jobId = toSafeString(body?.jobId);
      const queueCategory = toSafeString(body?.queueCategory);
      const scheduledOnly = body?.scheduledOnly === true || toSafeString(body?.scheduledOnly) === "true";

      if (universeId) {
        const access = await resolveMarketingAgentUniverseAccess({
          auth: ready.auth,
          universeId,
          action: "poll_worker",
        });
        if (!access.ok) return buildAccessError(access);

        const data = await pollMarketingDryRunWorker({
          universeId: access.universeId,
          workerId,
          billingUid: toSafeString(ready.auth.uid),
          jobId,
          queueCategory,
          scheduledOnly,
          allowScheduledPublish: false,
          allowExternalPublish: false,
        });
        return NextResponse.json({ ok: data.ok, action, data });
      }

      const allowed = await resolveAllowedUniverseIds(ready.auth, "poll_worker");
      if (!allowed.ok) return buildAccessError(allowed);

      const data = await pollMarketingDryRunWorkerAcrossUniverses({
        universeIds: allowed.universeIds,
        workerId,
        billingUid: toSafeString(ready.auth.uid),
        queueCategory,
        scheduledOnly,
        allowScheduledPublish: false,
        allowExternalPublish: false,
      });
      return NextResponse.json({ ok: data.ok, action, data });
    }

    if (action === "prepare_local_generation") {
      const workerId = toSafeString(body?.workerId) || `marketing-local-agent-${ready.auth.uid}`;
      const universeId = toSafeString(body?.universeId);
      const jobId = toSafeString(body?.jobId);
      const queueCategory = toSafeString(body?.queueCategory);

      if (universeId) {
        const access = await resolveMarketingAgentUniverseAccess({
          auth: ready.auth,
          universeId,
          action: "poll_worker",
        });
        if (!access.ok) return buildAccessError(access);

        const data = await prepareMarketingLocalAgentGeneration({
          universeId: access.universeId,
          workerId,
          jobId,
          queueCategory,
          allowExternalPublish: false,
        });
        return NextResponse.json({ ok: data.ok, action, data });
      }

      const allowed = await resolveAllowedUniverseIds(ready.auth, "poll_worker");
      if (!allowed.ok) return buildAccessError(allowed);

      const data = await prepareMarketingLocalAgentGenerationAcrossUniverses({
        universeIds: allowed.universeIds,
        workerId,
        queueCategory,
        allowExternalPublish: false,
      });
      return NextResponse.json({ ok: data.ok, action, data });
    }

    const universeId = toSafeString(body?.universeId);

    if (action === "pattern_next_action" || action === "enqueue_pattern_next_action") {
      const isHandoff = action === "enqueue_pattern_next_action";
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: isHandoff ? "pattern_enqueue" : "pattern_read",
      });
      if (!access.ok) return buildAccessError(access);

      const patternId = toSafeString(body?.patternId);
      if (!patternId) return errorResponse("pattern_id_required", 400);
      const patternResult = await getPublicIntelligencePattern(patternId, toSafeString(body?.context) || undefined);
      if (!patternResult.ok) {
        return errorResponse(
          patternResult.error === "unavailable" ? "intelligence_pattern_unavailable" : "intelligence_pattern_not_found",
          patternResult.error === "unavailable" ? 503 : 404,
          patternResult.error === "unavailable" ? "SERVICE_UNAVAILABLE" : "NOT_FOUND",
        );
      }

      const cluster = toUnknownRecord(body?.problemCluster) as unknown as MarketingOopsProblemClusterPlan;
      const buildResult = buildMarketingOopsNextAction({
        pattern: patternResult.data,
        problemCluster: cluster,
        action: toSafeString(body?.nextAction),
        metric: toSafeString(body?.metric),
        reviewWindowDays: Number(body?.reviewWindowDays) as 7 | 28,
        doNotChange: toSafeString(body?.doNotChange),
        priority: toSafeString(body?.priority) as MarketingJobPriority,
        channels: (Array.isArray(body?.channels) ? body.channels : []) as MarketingChannel[],
      });
      if (!buildResult.ok) {
        return errorResponse(buildResult.message, 409, "PATTERN_RECOMMENDATION_BLOCKED");
      }

      if (!isHandoff) {
        return NextResponse.json({ ok: true, action, data: buildResult.data });
      }

      const handoff = await enqueueMarketingOopsPatternAction({
        universeId: access.universeId,
        action: buildResult.data,
        requestedBy: `agent:${ready.auth.uid}`,
        retry: body?.retry === true || toSafeString(body?.retry) === "true",
      });
      return NextResponse.json(
        { ok: handoff.ok, action, data: handoff },
        { status: handoff.ok ? 200 : handoff.status === "conflict" ? 409 : handoff.status === "retry_required" ? 409 : 503 },
      );
    }

    if (action === "pattern_experiment_plan" || action === "create_pattern_experiment" || action === "record_pattern_experiment_result") {
      const isResult = action === "record_pattern_experiment_result";
      const isWrite = action !== "pattern_experiment_plan";
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: isWrite ? "experiment_write" : "experiment_read",
      });
      if (!access.ok) return buildAccessError(access);

      if (isResult) {
        const experimentId = toSafeString(body?.experimentId);
        if (!experimentId) return errorResponse("experiment_id_required", 400);
        const experiment = await getIntelligenceExperiment(experimentId, access.universeId);
        if (!experiment) return errorResponse("experiment_not_found", 404, "NOT_FOUND");
        const storedPlan = toUnknownRecord(experiment.plan) as unknown as IntelligenceExperimentPlan;
        const currentPattern = await getPublicIntelligencePattern(storedPlan.pattern.patternId, toSafeString(body?.context) || undefined);
        if (!currentPattern.ok) return patternReadErrorResponse(currentPattern);
        if (
          currentPattern.data.articleRevision !== storedPlan.pattern.articleRevision ||
          currentPattern.data.updatedAt !== storedPlan.pattern.updatedAt
        ) {
          return errorResponse("experiment_pattern_stale", 409, "CONFLICT");
        }
        const resultBuild = buildIntelligenceExperimentResult({
          plan: storedPlan,
          attempt: Number(body?.attempt),
          outcome: toSafeString(body?.outcome) as IntelligenceExperimentResultBuildInput["outcome"],
          observedSummary: toSafeString(body?.observedSummary),
          observedValue: body?.observedValue === null || typeof body?.observedValue === "undefined" ? null : Number(body.observedValue),
          numerator: body?.numerator === null || typeof body?.numerator === "undefined" ? null : Number(body.numerator),
          denominator: body?.denominator === null || typeof body?.denominator === "undefined" ? null : Number(body.denominator),
          sampleSize: Number(body?.sampleSize),
          measurementPeriod: {
            startsAt: toSafeString(body?.measurementPeriod?.startsAt),
            endsAt: toSafeString(body?.measurementPeriod?.endsAt),
          },
          decision: toSafeString(body?.decision) as IntelligenceExperimentResultBuildInput["decision"],
          decisionBasis: toSafeString(body?.decisionBasis),
          limitations: Array.isArray(body?.limitations) ? body.limitations : [],
          resultText: toSafeString(body?.resultText),
          recordedBy: `agent:${ready.auth.uid}`,
        });
        if (!resultBuild.ok) return errorResponse(resultBuild.message, 409, "EXPERIMENT_RESULT_BLOCKED");

        const [existingByKey, existingByAttempt] = await Promise.all([
          findIntelligenceExperimentResultByIdempotencyKey(resultBuild.data.idempotencyKey, access.universeId),
          findIntelligenceExperimentResultByAttempt({ universeId: access.universeId, experimentId, attempt: resultBuild.data.attempt }),
        ]);
        const existing = existingByKey || existingByAttempt;
        if (existing && (toSafeString(existing.resultId) !== resultBuild.data.resultId || toSafeString(existing.idempotencyKey) !== resultBuild.data.idempotencyKey)) {
          return errorResponse("experiment_result_attempt_conflict", 409, "CONFLICT");
        }
        if (existing) {
          const proofCandidates = await listIntelligenceProofCandidates(experimentId, access.universeId, 100);
          const existingResult = toUnknownRecord(existing.result) as unknown as IntelligenceExperimentResult;
          const existingProofCandidate = existingResult.proofCandidate;
          if (!existingProofCandidate) return errorResponse("proof_candidate_unavailable", 503, "SERVICE_UNAVAILABLE");
          const existingProof = proofCandidates.find((item) => item.resultId === existing.resultId);
          const proof = existingProof
            ? { ok: true as const, data: existingProof }
            : await createIntelligenceProofCandidate({
                proof: existingProofCandidate,
                universeId: access.universeId,
                patternId: storedPlan.pattern.patternId,
                experimentId,
                resultId: existing.resultId,
              });
          if (!proof.ok) return errorResponse("proof_candidate_unavailable", 503, "SERVICE_UNAVAILABLE");
          const updated = await updateIntelligenceExperimentAfterResult({
            universeId: access.universeId,
            experimentId,
            resultId: existing.resultId,
            verdict: existing.verdict as IntelligenceExperimentVerdict,
          });
          if (!updated) return errorResponse("experiment_update_unavailable", 503, "SERVICE_UNAVAILABLE");
          return NextResponse.json({
            ok: true,
            action,
            data: {
              status: "deduplicated",
              experimentId,
              resultId: existing.resultId,
              experiment: updated,
              result: existing,
              verdict: existing.verdict,
              outcome: existing.outcome,
              proofCandidate: proof.data,
              autoPromotion: "forbidden",
              humanReviewRequired: true,
            },
          });
        }

        const storedResult = await createIntelligenceExperimentResult(resultBuild.data);
        if (!storedResult.ok) return errorResponse("experiment_result_unavailable", 503, "SERVICE_UNAVAILABLE");
        const resultDocument = storedResult.data;
        const proof = await createIntelligenceProofCandidate({
          proof: resultBuild.data.proofCandidate,
          universeId: access.universeId,
          patternId: storedPlan.pattern.patternId,
          experimentId,
          resultId: resultBuild.data.resultId,
        });
        if (!proof.ok) return errorResponse("proof_candidate_unavailable", 503, "SERVICE_UNAVAILABLE");
        const updated = await updateIntelligenceExperimentAfterResult({
          universeId: access.universeId,
          experimentId,
          resultId: resultBuild.data.resultId,
          verdict: resultBuild.data.verdict,
        });
        if (!updated) return errorResponse("experiment_update_unavailable", 503, "SERVICE_UNAVAILABLE");
        return NextResponse.json(
          {
            ok: true,
            action,
            data: {
              status: storedResult.created ? "recorded" : "deduplicated",
              experiment: updated,
              result: resultDocument,
              proofCandidate: proof.data,
              autoPromotion: "forbidden",
              humanReviewRequired: true,
            },
          },
          { status: storedResult.created ? 201 : 200 },
        );
      }

      const patternId = toSafeString(body?.patternId);
      if (!patternId) return errorResponse("pattern_id_required", 400);
      const patternResult = await getPublicIntelligencePattern(patternId, toSafeString(body?.context) || undefined);
      if (!patternResult.ok) return patternReadErrorResponse(patternResult);
      const planBuild = buildIntelligenceExperimentPlan(
        buildExperimentPlanInput(body as UnknownRecord, patternResult.data, `agent:${ready.auth.uid}`, access.universeId),
      );
      if (!planBuild.ok) return errorResponse(planBuild.message, 409, "EXPERIMENT_PLAN_BLOCKED");
      if (action === "pattern_experiment_plan") {
        return NextResponse.json({ ok: true, action, data: planBuild.data });
      }
      const saved = await createIntelligenceExperiment(planBuild.data);
      if (!saved.ok) return errorResponse("experiment_unavailable", 503, "SERVICE_UNAVAILABLE");
      return NextResponse.json(
        {
          ok: true,
          action,
          data: {
            status: saved.created ? "created" : "deduplicated",
            experiment: saved.data,
            autoProofPromotion: "forbidden",
            humanReviewRequiredForProof: true,
          },
        },
        { status: saved.created ? 201 : 200 },
      );
    }

    if (action === "create_newsletter_draft") {
      if (!isNewsletterCampaignEnabled()) return errorResponse("newsletter_campaign_disabled", 404);
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "newsletter_draft",
      });
      if (!access.ok) return buildAccessError(access);

      const result = await createNewsletterCampaignDraft({
        universeId: access.universeId,
        requestedBy: `agent:${ready.auth.uid}`,
        campaignId: toSafeString(body?.campaignId) || undefined,
        issueId: toSafeString(body?.issueId),
        issueTitle: toSafeString(body?.issueTitle),
        intro: toSafeString(body?.intro),
        topArticles: (Array.isArray(body?.topArticles) ? body.topArticles : []) as NewsletterCurationStory[],
        relatedBehaviorArticles: (Array.isArray(body?.relatedBehaviorArticles) ? body.relatedBehaviorArticles : []) as NewsletterCurationStory[],
        topic: toUnknownRecord(body?.topic) as NewsletterCurationDraft["topic"],
        claims: (Array.isArray(body?.claims) ? body.claims : []) as NewsletterClaimCheck[],
      });
      return NextResponse.json({ ok: true, action, data: result }, { status: 201 });
    }

    if (action === "update_upload_policy") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "strategy_write",
      });
      if (!access.ok) return buildAccessError(access);

      const expectedVersion = Number(body?.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
        return errorResponse("upload_policy_expected_version_required", 400);
      }
      const patch = validateUploadPolicyPatch(body?.channels);
      if (!patch.ok) return errorResponse(patch.error, 400);

      const data = await updateMarketingUploadPolicy({
        universeId: access.universeId,
        expectedVersion,
        channels: patch.channels,
        updatedBy: `agent:${ready.auth.uid}`,
      });
      if (!data.ok) {
        if (data.status === "not_found") return errorResponse("marketing_keyword_settings_not_found", 404, "NOT_FOUND");
        return NextResponse.json(
          {
            ok: false,
            action,
            error: "upload_policy_version_conflict",
            errorCode: "CONFLICT",
            currentVersion: data.currentVersion,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, action, data: { settings: data.settings } });
    }

    if (action === "update_marketing_criteria") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "strategy_write",
      });
      if (!access.ok) return buildAccessError(access);

      const expectedVersion = Number(body?.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
        return errorResponse("marketing_criteria_expected_version_required", 400);
      }
      const patch = validateMarketingCriteriaPatch(body?.marketingCriteria);
      if (!patch.ok) return errorResponse(patch.error, 400);

      const data = await updateMarketingCriteriaByAgent({
        universeId: access.universeId,
        expectedVersion,
        criteria: patch.criteria,
        updatedBy: `agent:${ready.auth.uid}`,
      });
      if (!data.ok) {
        if (data.status === "not_found") return errorResponse("marketing_keyword_settings_not_found", 404, "NOT_FOUND");
        if (data.status === "empty_patch") return errorResponse("marketing_criteria_values_required", 400);
        return NextResponse.json(
          {
            ok: false,
            action,
            error: "marketing_criteria_version_conflict",
            errorCode: "CONFLICT",
            currentVersion: data.currentVersion,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, action, data: { settings: data.settings } });
    }

    if (action === "update_keyword_settings") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "strategy_write",
      });
      if (!access.ok) return buildAccessError(access);

      const patch = validateKeywordSettingsPatch(body?.settings);
      if (!patch.ok) return errorResponse(patch.error, 400);

      const data = await updateMarketingKeywordSettingsByAgent({
        universeId: access.universeId,
        settings: patch.settings,
        updatedBy: `agent:${ready.auth.uid}`,
      });
      if (!data.ok) {
        if (data.status === "empty_patch") return errorResponse("keyword_settings_values_required", 400);
        return errorResponse("marketing_keyword_settings_not_found", 404, "NOT_FOUND");
      }
      return NextResponse.json({ ok: true, action, data: { settings: data.settings } });
    }

    if (action === "upsert_keyword_cluster") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "strategy_write",
      });
      if (!access.ok) return buildAccessError(access);

      const clusterKey = normalizeMarketingKeywordKey(body?.clusterKey);
      if (!clusterKey) return errorResponse("keyword_cluster_key_required", 400);

      const patched = validateKeywordClusterPatch(body?.cluster);
      if (!patched.ok) return errorResponse(patched.error, 400);
      const patch = patched.patch;

      // upsert는 전달값 기준이라 누락 필드가 초기화될 수 있다. 기존 값을 먼저 채워 부분 갱신으로 동작시킨다.
      const clusters = await listMarketingKeywordClusters({ universeId: access.universeId });
      const existing = clusters.find((cluster) => cluster.clusterKey === clusterKey) ?? null;
      if (!existing && !toSafeString(patch.labelKo)) {
        return errorResponse("keyword_cluster_label_ko_required", 400);
      }

      const cluster = await upsertMarketingKeywordCluster({
        universeId: access.universeId,
        clusterKey,
        clusterScope: (patch.clusterScope as string | undefined) ?? existing?.clusterScope,
        labelKo: (patch.labelKo as string | undefined) ?? existing?.label?.ko,
        labelEn: (patch.labelEn as string | undefined) ?? existing?.label?.en,
        descriptionKo: (patch.descriptionKo as string | undefined) ?? existing?.description?.ko,
        descriptionEn: (patch.descriptionEn as string | undefined) ?? existing?.description?.en,
        sortOrder: typeof patch.sortOrder === "number" ? patch.sortOrder : existing?.sortOrder,
        enabled: typeof patch.enabled === "boolean" ? patch.enabled : existing?.enabled,
        updatedBy: `agent:${ready.auth.uid}`,
      });
      return NextResponse.json({ ok: true, action, data: { cluster, created: !existing } });
    }

    if (action === "update_advertising_criteria") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "strategy_write",
      });
      if (!access.ok) return buildAccessError(access);

      const expectedVersion = Number(body?.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
        return errorResponse("advertising_criteria_expected_version_required", 400);
      }
      const patch = validateAdvertisingCriteriaPatch(body?.advertisingCriteria);
      if (!patch.ok) return errorResponse(patch.error, 400);

      const data = await updateMarketingAdvertisingCriteriaByAgent({
        universeId: access.universeId,
        expectedVersion,
        advertisingCriteria: patch.criteria,
        updatedBy: `agent:${ready.auth.uid}`,
      });
      if (!data.ok) {
        if (data.status === "not_found") return errorResponse("marketing_ads_policy_not_found", 404, "NOT_FOUND");
        return NextResponse.json(
          {
            ok: false,
            action,
            error: "advertising_criteria_version_conflict",
            errorCode: "CONFLICT",
            currentVersion: data.currentVersion,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, action, data: { policy: data.policy } });
    }

    if (action === "upsert_keyword_profile") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "strategy_write",
      });
      if (!access.ok) return buildAccessError(access);

      const profileKey = normalizeMarketingKeywordKey(body?.profileKey);
      if (!profileKey) return errorResponse("keyword_profile_key_required", 400);

      const patched = validateKeywordProfilePatch(body?.profile);
      if (!patched.ok) return errorResponse(patched.error, 400);
      const patch = patched.patch;

      // clusterKey는 원장 참조(동적 키)라 실재하는 활성 클러스터만 허용한다.
      const clusters = await listMarketingKeywordClusters({ universeId: access.universeId, enabledOnly: true });
      const clusterKey = normalizeMarketingKeywordKey(patch.clusterKey);
      if (clusterKey && !clusters.some((cluster) => cluster.clusterKey === clusterKey)) {
        return NextResponse.json(
          {
            ok: false,
            action,
            error: "keyword_profile_cluster_not_found",
            errorCode: "NOT_FOUND",
            availableClusterKeys: clusters.map((cluster) => cluster.clusterKey),
          },
          { status: 404 },
        );
      }

      // upsert는 전체 $set이라 누락 필드가 초기화된다. 기존 값을 먼저 채워 부분 갱신으로 동작시킨다.
      const profiles = await listMarketingKeywordProfiles({ universeId: access.universeId });
      const existing = profiles.find((profile) => profile.profileKey === profileKey) ?? null;
      const pick = <T,>(field: string, fallback: T) =>
        (typeof patch[field] !== "undefined" ? patch[field] : fallback) as T;

      // 앵커가 바뀌면 기존 anchorIndex와 비교 불가가 된다. 관리자 UI의 확인 다이얼로그에 대응하는 명시 확인을 요구한다.
      const nextAnchor = pick("anchorKeyword", toSafeString(existing?.anchorKeyword));
      if (existing && toSafeString(existing.anchorKeyword) !== nextAnchor && body?.confirmAnchorChange !== true) {
        return NextResponse.json(
          {
            ok: false,
            action,
            error: "keyword_profile_anchor_change_requires_confirm",
            errorCode: "CONFLICT",
            currentAnchorKeyword: toSafeString(existing.anchorKeyword),
            nextAnchorKeyword: nextAnchor,
            note: "앵커를 바꾸면 기존 anchorIndex와 비교가 단절됩니다. 의도한 변경이면 confirmAnchorChange=true로 다시 호출하세요.",
          },
          { status: 409 },
        );
      }

      const profile = await upsertMarketingKeywordProfile({
        universeId: access.universeId,
        profileKey,
        name: pick("name", toSafeString(existing?.name) || profileKey),
        clusterKey: clusterKey || toSafeString(existing?.clusterKey) || "ai-image",
        clusterScope: pick("clusterScope", toSafeString(existing?.clusterScope) || "strategy"),
        anchorKeyword: nextAnchor,
        seedKeywords: pick("seedKeywords", existing?.seedKeywords ?? []),
        negativeKeywords: pick("negativeKeywords", existing?.negativeKeywords ?? []),
        selectedKeyword: pick("selectedKeyword", toSafeString(existing?.selectedKeyword)),
        selectedReason: pick("selectedReason", toSafeString(existing?.selectedReason)),
        targetPersona: pick("targetPersona", toSafeString(existing?.targetPersona)),
        campaignId: pick("campaignId", toSafeString(existing?.campaignId)),
        note: pick("note", toSafeString(existing?.note)),
        enabled: pick("enabled", existing?.enabled ?? true),
        updatedBy: `agent:${ready.auth.uid}`,
      });

      return NextResponse.json({
        ok: true,
        action,
        data: {
          profile,
          created: !existing,
          anchorChanged: Boolean(existing) && toSafeString(existing?.anchorKeyword) !== nextAnchor,
        },
      });
    }

    if (action === "save_promo_creative") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "enqueue_content",
      });
      if (!access.ok) return buildAccessError(access);
      const data = await saveMarketingPromoCreative({
        universeId: access.universeId,
        creativeId: toSafeString(body?.creativeId) || undefined,
        input: body?.creative,
        actor: `agent:${ready.auth.uid}`,
      });
      return NextResponse.json(
        { ok: data.ok, action, data: data.ok ? data.data : null, error: data.ok ? undefined : data.error, issues: data.issues },
        { status: data.ok ? 200 : data.status },
      );
    }

    if (action === "submit_promo_creative_review") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "enqueue_content",
      });
      if (!access.ok) return buildAccessError(access);
      const data = await transitionMarketingPromoCreative({
        universeId: access.universeId,
        creativeId: toSafeString(body?.creativeId),
        nextStatus: "review",
        actor: `agent:${ready.auth.uid}`,
        allowActivation: false,
      });
      return NextResponse.json(
        { ok: data.ok, action, data: data.ok ? data.data : null, error: data.ok ? undefined : data.error, issues: data.issues },
        { status: data.ok ? 200 : data.status },
      );
    }

    if (action === "collect_ga_snapshots") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "poll_worker",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await collectGaDailySnapshots({
        universeId: access.universeId,
        startDate: toSafeString(body?.startDate) || undefined,
        endDate: toSafeString(body?.endDate) || undefined,
        dryRun: body?.dryRun === true || toSafeString(body?.dryRun) === "true",
        propertyKey: toSafeString(body?.propertyKey) || undefined,
        propertyId: toSafeString(body?.propertyId) || undefined,
        reportKey: toSafeString(body?.reportKey) || undefined,
      });
      return NextResponse.json(
        {
          ok: data.ok,
          action,
          ...(data.ok ? {} : { error: "error" in data ? data.error : "ga_collect_failed" }),
          data,
        },
        // 애플리케이션 레벨 실패(ga_collect_disabled 등)는 5xx가 아니라 4xx로 반환한다.
        // origin 5xx는 Cloudflare가 자체 HTML 오류 페이지로 본문을 덮어써 JSON error가 유실되므로,
        // 형제 액션(naver_refresh_candidates=409)과 동일하게 409로 맞춰 error 문자열이 그대로 전달되게 한다.
        { status: data.ok ? 200 : 409 },
      );
    }

    if (action === "collect_social_performance") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "poll_worker",
      });
      if (!access.ok) return buildAccessError(access);

      const channels = Array.isArray(body?.channels)
        ? body.channels.map(toSafeString).filter(Boolean)
        : toCsvValues(toSafeString(body?.channel));
      // provider 호출은 수 분 걸릴 수 있으므로 runId를 즉시 반환하고 응답 이후 수집을 완료한다.
      const start = await startSocialCollectForUniverse({
        universeId: access.universeId,
        trigger: "agent",
        channels,
        sinceDays: toBoundedInt(toSafeString(body?.sinceDays ?? body?.days) || null, 30, 1, 180),
        dryRun: body?.dryRun === true || toSafeString(body?.dryRun) === "true",
      });
      if (start.busy) {
        return NextResponse.json(
          { ok: false, action, error: "collect_already_running", data: { runId: start.runId, startedAt: start.startedAt } },
          { status: 409 },
        );
      }
      after(() => start.completion);
      return NextResponse.json({
        ok: true,
        action,
        data: {
          accepted: true,
          runId: start.runId,
          startedAt: start.startedAt,
          sinceDays: start.sinceDays,
          channels: start.channels,
          dryRun: start.dryRun,
        },
      });
    }

    if (action === "collect_ads_performance") {
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "ads_read" });
      if (!access.ok) return buildAccessError(access);
      const data = await collectAdsPerformanceSnapshots({
        universeId: access.universeId,
        channels: Array.isArray(body?.channels) ? body.channels.map(toSafeString) : undefined,
        dateFrom: toSafeString(body?.dateFrom) || undefined,
        dateTo: toSafeString(body?.dateTo) || undefined,
        dryRun: body?.dryRun === true,
      });
      return NextResponse.json({ ok: data.ok, action, data }, { status: data.ok ? 200 : 409 });
    }

    if (action === "google_ads_keyword_ideas") {
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "ads_read" });
      if (!access.ok) return buildAccessError(access);
      const googleAuth = await getGoogleAdsAuth(access.universeId);
      if (!googleAuth) return errorResponse("google_ads_credentials_incomplete", 409, "PRECONDITION_FAILED");
      const keywords = Array.isArray(body?.keywords) ? body.keywords.map(toSafeString).filter(Boolean).slice(0, 10) : [];
      const urlSeed = toSafeString(body?.urlSeed);
      if (!keywords.length && !urlSeed) return errorResponse("google_keyword_seed_required", 400);
      const rawNetwork = toSafeString(body?.keywordPlanNetwork);
      if (rawNetwork && !GOOGLE_ADS_KEYWORD_NETWORKS.has(rawNetwork)) {
        return errorResponse("google_keyword_network_invalid", 400);
      }
      const data = await googleAdsGenerateKeywordIdeas(googleAuth, {
        keywords,
        languageId: toSafeString(body?.languageId) || undefined,
        geoTargetIds: Array.isArray(body?.geoTargetIds) ? body.geoTargetIds.map(toSafeString) : undefined,
        urlSeed: urlSeed || undefined,
        pageSize: toBoundedInt(toSafeString(body?.pageSize) || null, 20, 1, 100),
        keywordPlanNetwork: (rawNetwork || "GOOGLE_SEARCH_AND_PARTNERS") as
          | "GOOGLE_SEARCH"
          | "GOOGLE_SEARCH_AND_PARTNERS",
        includeAdultKeywords: body?.includeAdultKeywords === true,
      });
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "search_console_query") {
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "ads_read" });
      if (!access.ok) return buildAccessError(access);
      const googleAuth = await getGoogleAdsAuth(access.universeId);
      if (!googleAuth) return errorResponse("google_ads_credentials_incomplete", 409, "PRECONDITION_FAILED");

      const siteUrl = toSafeString(body?.siteUrl);
      const startDate = toSafeString(body?.startDate);
      const endDate = toSafeString(body?.endDate);
      if (!siteUrl || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return errorResponse("search_console_query_required", 400);
      }
      const requestedDimensions = Array.isArray(body?.dimensions)
        ? body.dimensions.map(toSafeString).filter((value: string) => SEARCH_CONSOLE_DIMENSIONS.has(value))
        : [];
      const rawType = toSafeString(body?.type) || "web";
      if (!SEARCH_CONSOLE_TYPES.has(rawType)) return errorResponse("search_console_type_invalid", 400);

      const filters: Array<{
        dimension: string;
        operator: "contains" | "equals";
        expression: string;
      }> = [];
      const appendFilter = (
        dimension: string,
        operator: "contains" | "equals",
        expression: unknown,
      ) => {
        const value = toSafeString(expression).slice(0, 500);
        if (value) filters.push({ dimension, operator, expression: value });
      };
      appendFilter("query", "contains", body?.queryContains);
      appendFilter("page", "contains", body?.pageContains);
      appendFilter("country", "equals", body?.country);
      appendFilter("device", "equals", body?.device);

      const data = await searchConsoleQuery(googleAuth, siteUrl, {
        startDate,
        endDate,
        dimensions: requestedDimensions.length ? requestedDimensions : ["query"],
        rowLimit: toBoundedInt(toSafeString(body?.rowLimit) || null, 10, 1, 25_000),
        startRow: toBoundedInt(toSafeString(body?.startRow) || null, 0, 0, 100_000),
        type: rawType,
        ...(filters.length > 0 ? { dimensionFilterGroups: [{ groupType: "and", filters }] } : {}),
      });
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "naver_ads_keyword_ideas") {
      const access = await resolveMarketingAgentUniverseAccess({ auth: ready.auth, universeId, action: "ads_read" });
      if (!access.ok) return buildAccessError(access);
      const auth = await getNaverAdsAuth(access.universeId);
      if (!auth) return errorResponse("naver_ads_credentials_incomplete", 409, "PRECONDITION_FAILED");
      const keywords = Array.isArray(body?.keywords) ? body.keywords.map(toSafeString).filter(Boolean).slice(0, 5) : [];
      const data = await naverSearchAdReadApi.keywordIdeas(auth, keywords);
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "naver_refresh_candidates") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "poll_worker",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await refreshKeywordCandidatesWithNaver({
        universeId: access.universeId,
        limit: Number(body?.limit) || undefined,
        withSerp: body?.withSerp !== false,
        dryRun: body?.dryRun === true || toSafeString(body?.dryRun) === "true",
      });
      if (!data.ok) return errorResponse(data.error, 409, "PRECONDITION_FAILED");
      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "submit_local_generation") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "poll_worker",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await submitMarketingLocalAgentGeneration({
        universeId: access.universeId,
        jobId: toSafeString(body?.jobId),
        workerId: toSafeString(body?.workerId) || `marketing-local-agent-${ready.auth.uid}`,
        drafts: Array.isArray(body?.drafts) ? body.drafts : [],
        modelName: toSafeString(body?.modelName),
        proofreadUid: toSafeString(ready.auth.uid),
        proofreadRequestedBy: `agent:${toSafeString(ready.auth.uid)}`,
        allowExternalPublish: false,
      });

      return NextResponse.json(
        {
          ok: data.ok,
          action,
          data,
        },
        { status: data.ok ? 200 : data.status === "missing_job" ? 404 : data.status === "forbidden" ? 403 : 400 },
      );
    }

    if (action === "record_typo_candidate") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "typo_dictionary",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await recordMarketingTypoCandidate({
        universeId: access.universeId,
        type: toSafeString(body?.type) || "literal",
        pattern: toSafeString(body?.pattern),
        expected: Array.isArray(body?.expected) ? body.expected : undefined,
        reason: toSafeString(body?.reason),
        channels: Array.isArray(body?.channels) ? body.channels : body?.channel ? [toSafeString(body.channel)] : undefined,
        channel: toSafeString(body?.channel),
        field: toSafeString(body?.field),
        context: toSafeString(body?.context),
        jobId: toSafeString(body?.jobId),
        source: toSafeString(body?.source) || "ai",
        createdBy: `agent:${ready.auth.uid}`,
        modelName: toSafeString(body?.modelName),
        meta: toUnknownRecord(body?.meta),
      });

      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "update_typo_rule") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "typo_dictionary",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await updateMarketingTypoRuleStatus({
        universeId: access.universeId,
        ruleId: toSafeString(body?.ruleId),
        type: toSafeString(body?.type) || "literal",
        pattern: toSafeString(body?.pattern),
        status: toSafeString(body?.status),
        severity: toSafeString(body?.severity),
        expected: Array.isArray(body?.expected) ? body.expected : undefined,
        reason: typeof body?.reason === "undefined" ? undefined : toSafeString(body.reason),
        channels: Array.isArray(body?.channels) ? body.channels : undefined,
        updatedBy: `agent:${ready.auth.uid}`,
      });
      if (!data) return errorResponse("typo_rule_not_found", 404, "NOT_FOUND");

      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "enqueue_content") {
      const requestedReviewMode = toSafeString(body?.reviewMode);
      if (requestedReviewMode && requestedReviewMode !== "review_required") {
        return errorResponse("agent_review_mode_forbidden", 403, "AGENT_REVIEW_MODE_FORBIDDEN");
      }
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "enqueue_content",
      });
      if (!access.ok) return buildAccessError(access);

      const data = await enqueueMarketingContent({
        universeId: access.universeId,
        slug: toSafeString(body?.slug),
        url: toSafeString(body?.url),
        slugs: Array.isArray(body?.slugs) ? body.slugs : [],
        urls: Array.isArray(body?.urls) ? body.urls : [],
        priority: toSafeString(body?.priority) as MarketingJobPriority,
        queueCategory: toSafeString(body?.queueCategory),
        scheduledAt: body?.scheduledAt,
        force: Boolean(body?.force),
        requestedBy: `agent:${ready.auth.uid}`,
        source: "api_batch",
        trigger: toSafeString(body?.trigger) || "mcp_agent",
        site: toSafeString(body?.site),
        generationMode: toSafeString(body?.generationMode) as "server_worker" | "local_agent",
        modelProvider: toSafeString(body?.modelProvider),
        modelName: toSafeString(body?.modelName),
        instructionText: toSafeString(body?.instructionText),
        contentTemplateKey: toSafeString(body?.contentTemplateKey),
        imageTemplateKey: toSafeString(body?.imageTemplateKey),
        reviewMode: "review_required",
        channels: Array.isArray(body?.channels) ? body.channels : undefined,
        sourceSnapshots: Array.isArray(body?.sourceSnapshots) ? body.sourceSnapshots : undefined,
      });

      return NextResponse.json({ ok: true, action, data });
    }

    if (action === "channel_action") {
      const access = await resolveMarketingAgentUniverseAccess({
        auth: ready.auth,
        universeId,
        action: "channel_action",
      });
      if (!access.ok) return buildAccessError(access);

      const channel = toSafeString(body?.channel);
      if (channel !== "threads" && channel !== "instagram" && channel !== "linkedin" && channel !== "naver_blog") {
        return errorResponse("unsupported_channel", 400);
      }

      // 에이전트는 초안 보조만 수행한다. complete/skip/mark_published와
      // 예약·개인 프로필 발행은 관리자 확정 또는 전용 worker 경로에서만 허용한다.
      const agentChannelAction = toSafeString(body?.channelAction);
      if (!["save_draft", "attach_image", "remove_image"].includes(agentChannelAction)) {
        return errorResponse("agent_publish_action_forbidden", 403, "AGENT_PUBLISH_ACTION_FORBIDDEN");
      }

      const result = await applyMarketingChannelAction({
        universeId: access.universeId,
        jobId: toSafeString(body?.jobId),
        channel: channel as "threads" | "instagram" | "linkedin" | "naver_blog",
        action: agentChannelAction as "save_draft" | "attach_image" | "remove_image",
        requestedBy: `agent:${ready.auth.uid}`,
        proofreadRequired: true,
        draft: body?.draft && typeof body.draft === "object" ? body.draft : undefined,
        publishAt: body?.publishAt,
        publishHour: typeof body?.publishHour === "number" && Number.isInteger(body.publishHour) ? body.publishHour : null,
        recommendationToken: toSafeString(body?.recommendationToken),
        publishedUrl: toSafeString(body?.publishedUrl),
        note: toSafeString(body?.note),
      });

      return NextResponse.json(
        {
          ok: result.ok,
          action,
          data: "data" in result ? result.data : null,
          error: result.ok ? undefined : result.error,
        },
        { status: result.status },
      );
    }

    return errorResponse("unsupported_action", 400);
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, { message: "agent_marketing_post_failed" });
    logger.error("[agent-marketing] POST failed", { error: message });
    return errorResponse(message, status, errorCode);
  }
}
