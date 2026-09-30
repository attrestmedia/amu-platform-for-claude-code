import "server-only";

import {
  createMarketingAsset,
  createMarketingJobStep,
  createMarketingPublishLog,
  getMarketingJobByJobId,
  listMarketingAssets,
  listMarketingJobSteps,
  listMarketingPublishLogs,
  updateMarketingAsset,
  updateMarketingJobStatus,
  updateMarketingJobStepStatus,
  updateMarketingSourceInventoryItem,
} from "libs/database/marketing";
import { getCardNewsDeck as getStoredCardNewsDeck } from "libs/database/lab/cardNewsDeckRepo";
import type { MarketingJobStatus, MarketingStepStatus } from "consts/marketing/queue";
import { sendMarketingSlackNotification } from "libs/marketing/notify/slackNotifier";
import { normalizePlainTextSocialDraft } from "libs/marketing/format/socialPlainText";
import { publishLinkedInMemberShare } from "libs/marketing/publish/linkedinMemberPublisher";
import { publishMarketingInstagramDraft } from "libs/marketing/publish/instagramPublisher";
import { publishMarketingThreadsDraft } from "libs/marketing/publish/threadsPublisher";
import { resolvePublishCanonicalUrl } from "libs/marketing/publish/resolvePublishCanonicalUrl";
import { toMarketingImageUrlValues } from "libs/marketing/images/resolvePublishImage";
import { listImageAssets } from "libs/database/lab";
import {
  getCardNewsPublishGateError,
  mapCardNewsDeckToInstagramDraft,
} from "libs/card-news/draftMapping";
import {
  MARKETING_CONTENT_IMAGE_DRAFT_PROTECTION_MS,
  MARKETING_CONTENT_IMAGE_PUBLISHED_PROTECTION_MS,
  MarketingContentImageError,
  protectMarketingContentImages,
  resolveMarketingContentImagesByIds,
} from "libs/marketing/images/contentImageService";
import { validateMarketingChannelDraft } from "libs/marketing/bridge/schemaValidator";
import { validateDraftAgainstActiveTypoRules } from "libs/marketing/quality/koreanTypoRules";
import { createMarketingDraftDigest } from "libs/marketing/quality/marketingDraftDigest";
import { resolveRecommendedPublishAt } from "libs/marketing/operator/uploadScheduleRecommendation";
import { isUnknownRecord, toSafeString, type UnknownRecord } from "utils/common/typeUtils";

type SupportedManualChannel = "threads" | "instagram" | "linkedin" | "naver_blog";
type ChannelActionType =
  | "save_draft"
  | "complete"
  | "skip"
  | "publish_member"
  | "attach_image"
  | "remove_image"
  | "mark_published"
  | "cancel_scheduled_publish";
type MarketingRecord = UnknownRecord;
const LINKEDIN_FEED_URL = "https://www.linkedin.com/feed/";
const NAVER_BLOG_HOME_URL = "https://blog.naver.com/MyBlog.naver";

type MarketingStepView = {
  stepId?: string;
  stepKey?: unknown;
  channel?: unknown;
  status?: unknown;
  outputRef?: MarketingRecord;
  meta?: MarketingRecord;
  workerId?: unknown;
};
type MarketingJobView = {
  channels?: unknown;
};

function isLinkedInUrl(value: string) {
  try {
    const url = new URL(toSafeString(value));
    return url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

function toStringArray(values: unknown, limit = 20) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : String(values || "").split(","))
        .map((value) => toSafeString(value))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function toImageUrlArray(values: unknown, limit = 12) {
  return toMarketingImageUrlValues(
    (Array.isArray(values) ? values : [values]).flatMap((value) =>
      isUnknownRecord(value) && Array.isArray(value.images) ? value.images : value,
    ),
    limit,
  ).filter((url) => /^https?:\/\//i.test(url));
}

function removeImageUrls(values: unknown, removeUrls: Set<string>, limit = 12) {
  return toImageUrlArray(values, limit).filter((url) => !removeUrls.has(url));
}

function removeImageAssetIds(values: unknown, removeAssetIds: Set<string>, limit = 12) {
  return toStringArray(values, limit).filter((assetId) => !removeAssetIds.has(assetId));
}

async function resolvePublicGenStudioImageUrls(assetIds: string[]) {
  const normalizedIds = toStringArray(assetIds, 12);
  if (!normalizedIds.length) return new Map<string, string>();
  const assets = await listImageAssets({
    scope: "all",
    visibility: "public",
    state: "active",
    assetIds: normalizedIds,
    limit: normalizedIds.length,
  });
  return new Map(
    assets
      .map((asset) => [
        toSafeString(asset.assetId),
        toSafeString((asset.storage || {}).url),
      ] as const)
      .filter(([assetId, url]) => assetId && /^https?:\/\//i.test(url)),
  );
}

function getPinnedUploadPolicyVersion(job: unknown, channel: string) {
  if (!isUnknownRecord(job) || !Array.isArray(job.uploadRecommendations)) return 0;
  const recommendation = job.uploadRecommendations.find(
    (item) => isUnknownRecord(item) && toSafeString(item.channel) === channel,
  );
  const version = Number(isUnknownRecord(recommendation) ? recommendation.policyVersion : 0);
  return Number.isInteger(version) && version >= 1 ? version : 0;
}

function getReviewStepKey(channel: SupportedManualChannel) {
  if (channel === "threads") return "publish_threads";
  if (channel === "instagram") return "publish_instagram";
  return channel === "linkedin" ? "prepare_linkedin_draft" : "prepare_naver_draft";
}

function getExternalUrl(channel: SupportedManualChannel, draft: MarketingRecord, publishedUrl?: string) {
  if (channel === "linkedin") {
    const linkedInUrl = [publishedUrl, draft.commentLink].map((value) => toSafeString(value)).find(isLinkedInUrl);
    return linkedInUrl || LINKEDIN_FEED_URL;
  }

  if (publishedUrl) return publishedUrl;
  if (channel === "threads") return toSafeString(draft.linkUrl) || "https://www.threads.net/";
  if (channel === "instagram") return toSafeString(draft.linkUrl) || "https://www.instagram.com/";
  return NAVER_BLOG_HOME_URL;
}

function getPublishNotCompletedError(channel: SupportedManualChannel, result: { mode?: unknown; status?: unknown }) {
  const mode = toSafeString(result.mode) || "unknown";
  const status = toSafeString(result.status) || "unknown";

  if (mode === "dry_run") return `${channel}_publish_dry_run`;
  if (mode === "disabled") return `${channel}_publish_disabled`;
  if (mode === "missing_credential") return `${channel}_publish_credential_missing`;
  if (mode === "missing_token") return `${channel}_publish_token_missing`;
  if (mode === "expired_token") return `${channel}_publish_token_expired`;

  return `${channel}_publish_not_completed:${status}:${mode}`;
}

function isFinalStepStatus(status: string) {
  return ["success", "skipped", "failed"].includes(toSafeString(status));
}

function toDateOrNull(value?: string | Date | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function getFuturePublishAt(value?: string | Date | null) {
  const next = toDateOrNull(value);
  if (!next || next.getTime() <= Date.now()) return null;
  return next;
}

function getScheduledPublishAt(step: MarketingStepView) {
  return toDateOrNull((step.meta || {}).scheduledPublishAt as string | Date | null);
}

function findReviewStep(steps: MarketingStepView[], channel: SupportedManualChannel) {
  const stepKey = getReviewStepKey(channel);
  return steps.find((step) => toSafeString(step.stepKey) === stepKey && toSafeString(step.channel) === channel);
}

const SCHEDULED_PUBLISH_META_KEYS = [
  "scheduledBy",
  "scheduledAt",
  "scheduledPublishAt",
  "publishAction",
  "publishMode",
  "scheduledPublishPickedAt",
  "scheduledPublishWorkerId",
] as const;

function clearScheduledPublishMeta(meta?: MarketingRecord | null) {
  const next: MarketingRecord = { ...(meta || {}) };
  for (const key of SCHEDULED_PUBLISH_META_KEYS) {
    delete next[key];
  }
  return next;
}

function isDueScheduledPublishStep(step: MarketingStepView) {
  const channel = toSafeString(step.channel);
  const publishAt = getScheduledPublishAt(step);
  return (
    toSafeString(step.status) === "approved" &&
    (channel === "threads" || channel === "instagram" || channel === "linkedin" || channel === "naver_blog") &&
    Boolean(publishAt && publishAt.getTime() <= Date.now())
  );
}

function hasOwnRecordKey(record: MarketingRecord | undefined, key: string) {
  return Object.prototype.hasOwnProperty.call(record || {}, key);
}

function hasExplicitDraftImageSelection(draft?: MarketingRecord) {
  return [
    "imageUrl",
    "image_url",
    "thumbnailUrl",
    "thumbnail_url",
    "imageUrls",
    "images",
    "imageAssetId",
    "imageAssetIds",
  ].some((key) =>
    hasOwnRecordKey(draft, key),
  );
}

function shouldValidateOperatorDraft(action: ChannelActionType) {
  return action === "save_draft" || action === "complete" || action === "publish_member";
}

function requiresIndependentProofread(action: ChannelActionType) {
  return action === "complete" || action === "publish_member" || action === "mark_published";
}

async function validateOperatorDraft(args: {
  universeId: string;
  channel: SupportedManualChannel;
  draft: MarketingRecord;
}) {
  const staticReport = validateMarketingChannelDraft(args.channel, args.draft);
  const typoRuleReport = await validateDraftAgainstActiveTypoRules({
    universeId: args.universeId,
    channel: args.channel,
    draft: args.draft,
  });
  const issues = Array.from(new Set([...staticReport.issues, ...typoRuleReport.issues]));
  const warnings = Array.from(new Set([...(staticReport.warnings || []), ...typoRuleReport.warnings]));
  const valid = staticReport.valid && typoRuleReport.valid;

  return {
    channel: args.channel,
    valid,
    summary: valid
      ? "운영자 수정본이 기본 스키마와 활성 오탈자 규칙 검수를 통과했습니다."
      : "운영자 수정본에서 발행 전에 수정해야 할 항목이 발견되었습니다.",
    issues,
    warnings,
    score: Math.min(Number(staticReport.score || 100), Number(typoRuleReport.score || 100)),
    checks: {
      static: staticReport,
      koreanTypoRules: typoRuleReport,
      independentProofread: {} as UnknownRecord,
    },
  };
}

function toScheduledPublishError(error: unknown) {
  return {
    code: "SCHEDULED_PUBLISH_FAILED",
    message: toSafeString(error instanceof Error ? error.message : error) || "scheduled_publish_failed",
  };
}

async function createScheduledPublishFailureLog(args: {
  universeId: string;
  jobId: string;
  stepId: string;
  channel: "threads" | "instagram" | "linkedin" | "naver_blog";
  workerId: string;
  scheduledPublishAt: string;
  error: unknown;
}) {
  const publishError = toScheduledPublishError(args.error);
  const publishLog = await createMarketingPublishLog({
    universeId: args.universeId,
    jobId: args.jobId,
    stepId: args.stepId,
    channel: args.channel,
    status: "failed",
    targetRef: {
      externalUrl:
        args.channel === "linkedin"
          ? LINKEDIN_FEED_URL
          : args.channel === "instagram"
            ? "https://www.instagram.com/"
            : args.channel === "naver_blog"
              ? NAVER_BLOG_HOME_URL
              : "https://www.threads.net/",
    },
    request: {
      action: "scheduled_publish",
      scheduledPublishAt: args.scheduledPublishAt,
      workerId: args.workerId,
    },
    response: {
      mode: "scheduled_worker",
      error: publishError,
    },
    completedBy: args.workerId,
    completedAt: new Date(),
  });

  return { publishError, publishLog };
}

async function ensureReviewStep(args: {
  universeId: string;
  jobId: string;
  channel: SupportedManualChannel;
  existingSteps: MarketingStepView[];
  assetIds?: string[];
}): Promise<MarketingStepView & { stepId: string }> {
  const stepKey = getReviewStepKey(args.channel);
  const existing = args.existingSteps.find(
    (step) => toSafeString(step.stepKey) === stepKey && toSafeString(step.channel) === args.channel,
  );

  if (existing?.stepId) {
    const existingStatus = toSafeString(existing.status) as MarketingStepStatus;
    await updateMarketingJobStepStatus({
      stepId: existing.stepId,
      status: isFinalStepStatus(existingStatus) ? existingStatus : "waiting_review",
      outputRef: args.assetIds ? { assetIds: args.assetIds } : existing.outputRef || {},
    });
    return existing as MarketingStepView & { stepId: string };
  }

  return await createMarketingJobStep({
    jobId: args.jobId,
    universeId: args.universeId,
    stepKey,
    status: "waiting_review",
    channel: args.channel,
    outputRef: args.assetIds ? { assetIds: args.assetIds } : {},
  });
}

function summarizeJobStatus(
  job: MarketingJobView,
  steps: MarketingStepView[],
): { status: MarketingJobStatus; currentStepKey: string; lastError: MarketingRecord | null } {
  const channels: string[] = Array.isArray(job.channels)
    ? job.channels.map((channel) => toSafeString(channel)).filter(Boolean)
    : [];
  const statusByChannel: Record<string, string> = {};

  for (const channel of channels) {
    if (channel === "threads" || channel === "instagram" || channel === "linkedin" || channel === "naver_blog") {
      const reviewStep = findReviewStep(steps, channel as SupportedManualChannel);
      statusByChannel[channel] = toSafeString(reviewStep?.status) || "waiting_review";
    }
  }

  const values = Object.values(statusByChannel);
  if (values.some((status) => status === "waiting_review" || status === "approved" || status === "waiting_input")) {
    const currentChannel = Object.entries(statusByChannel).find(([, status]) =>
      ["waiting_review", "approved", "waiting_input"].includes(status),
    )?.[0] as SupportedManualChannel | undefined;
    return {
      status: "waiting_review",
      currentStepKey: currentChannel ? getReviewStepKey(currentChannel) : "prepare_linkedin_draft",
      lastError: null,
    };
  }

  if (values.some((status) => status === "failed")) {
    const hasSuccessLike = values.some((status) => status === "success" || status === "skipped");
    return {
      status: hasSuccessLike ? "partial" : "failed",
      currentStepKey: values.includes("failed") ? "validate_output" : "publish_threads",
      lastError: {
        code: hasSuccessLike ? "SEMI_AUTO_PARTIAL" : "SEMI_AUTO_FAILED",
        message: hasSuccessLike ? "일부 반자동 채널 처리에 실패했습니다." : "반자동 채널 처리에 실패했습니다.",
      },
    };
  }

  return {
    status: "success",
    currentStepKey: "prepare_naver_draft",
    lastError: null,
  };
}

export async function applyMarketingChannelAction(args: {
  universeId: string;
  jobId: string;
  channel: SupportedManualChannel;
  action: ChannelActionType;
  requestedBy: string;
  requestedByUid?: string;
  draft?: MarketingRecord;
  publishAt?: string | Date | null;
  publishHour?: number | null;
  publishMinute?: number | null;
  recommendationToken?: string;
  publishedUrl?: string;
  note?: string;
  executeScheduledPublish?: boolean;
  proofreadRequired?: boolean;
}) {
  const isAgentActor = /^agent:|^marketing-(?:local-)?agent-/i.test(toSafeString(args.requestedBy));
  if (
    isAgentActor &&
    ["complete", "skip", "publish_member", "mark_published", "cancel_scheduled_publish"].includes(args.action)
  ) {
    return { ok: false as const, status: 403, error: "agent_publish_action_forbidden" };
  }
  if (isAgentActor && (args.publishAt || Number.isInteger(args.publishHour) || Number.isInteger(args.publishMinute))) {
    return { ok: false as const, status: 403, error: "agent_publish_schedule_forbidden" };
  }

  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) return { ok: false as const, status: 404, error: "job_not_found" };
  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }
  if (args.publishAt && Number.isInteger(args.publishHour)) {
    return { ok: false as const, status: 400, error: "publish_at_and_hour_are_mutually_exclusive" };
  }
  if (Number.isInteger(args.publishMinute) && !Number.isInteger(args.publishHour)) {
    return { ok: false as const, status: 400, error: "publish_minute_requires_hour" };
  }
  let resolvedPublishAt = args.publishAt;
  if (Number.isInteger(args.publishHour)) {
    try {
      const resolved = await resolveRecommendedPublishAt({
        universeId: args.universeId,
        jobId: args.jobId,
        channel: args.channel,
        publishHour: Number(args.publishHour),
        publishMinute: args.publishMinute,
        recommendationToken: toSafeString(args.recommendationToken),
      });
      resolvedPublishAt = resolved.publishAt;
    } catch (error: unknown) {
      return { ok: false as const, status: 409, error: error instanceof Error ? error.message : "recommendation_stale" };
    }
  }

  const [steps, assets, sourceAssets] = await Promise.all([
    listMarketingJobSteps({ jobId: args.jobId, limit: 200 }),
    listMarketingAssets({ jobId: args.jobId, channel: args.channel, limit: 200 }),
    listMarketingAssets({ jobId: args.jobId, kind: "source_snapshot", limit: 20 }),
  ]);

  let draftAsset = assets.find((asset) => toSafeString(asset.kind) === "channel_draft");
  const validationAsset = assets.find((asset) => toSafeString(asset.kind) === "validation_report");
  let validationAssetId = toSafeString(validationAsset?.assetId);
  if (!draftAsset?.assetId && args.action !== "attach_image") {
    return { ok: false as const, status: 404, error: "draft_asset_not_found" };
  }
  const currentReviewStep = findReviewStep(steps, args.channel);
  const currentScheduledPublishAt = getScheduledPublishAt(currentReviewStep || {});
  if (
    args.action === "cancel_scheduled_publish" &&
    (!currentScheduledPublishAt || toSafeString(currentReviewStep?.status) !== "approved")
  ) {
    return { ok: false as const, status: 400, error: "scheduled_publish_not_cancelable" };
  }

  const existingDraft = (draftAsset?.content || {}) as MarketingRecord;
  const sourceSnapshot = (sourceAssets.find((asset) => toSafeString(asset.kind) === "source_snapshot")?.content ||
    job.sourceRef?.sourceSnapshot ||
    {}) as MarketingRecord;
  let actionError: { status: number; error: string } | null = null;
  const requestedMarketingUploadAssetIds = toStringArray(args.draft?.marketingUploadAssetIds, 12);
  const requestedImageAssetIds = toStringArray(
    [args.draft?.imageAssetIds, args.draft?.imageAssetId],
    12,
  );
  const publicImageUrlByAssetId = requestedImageAssetIds.length
    ? await resolvePublicGenStudioImageUrls(requestedImageAssetIds)
    : new Map<string, string>();
  if (args.action === "attach_image" && requestedImageAssetIds.length) {
    const missingPublicAsset = requestedImageAssetIds.find((assetId) => !publicImageUrlByAssetId.has(assetId));
    if (missingPublicAsset) {
      return { ok: false as const, status: 409, error: "gen_studio_assets_must_be_public" };
    }
  }
  const requestedCardNews = isUnknownRecord(args.draft?.cardNews) && toSafeString(args.draft?.cardNews.kind) === "card_news"
    ? args.draft.cardNews
    : null;
  let verifiedCardNews: UnknownRecord | null = null;
  if (args.action === "attach_image" && requestedCardNews) {
    const deckId = toSafeString(requestedCardNews.deckId);
    if (!deckId || !toSafeString(args.requestedByUid)) {
      return { ok: false as const, status: 403, error: "card_news_owner_required" };
    }
    const storedDeck = await getStoredCardNewsDeck({ ownerUid: toSafeString(args.requestedByUid), deckId });
    if (!storedDeck || storedDeck === "forbidden") {
      return { ok: false as const, status: 404, error: "card_news_deck_not_found" };
    }
    const orderedCards = [...storedDeck.cards].sort((left, right) => left.order - right.order);
    const storedAssetIds = orderedCards.map((card) => toSafeString(card.exportedAssetId));
    if (
      storedAssetIds.some((assetId) => !assetId) ||
      storedAssetIds.length !== requestedImageAssetIds.length ||
      storedAssetIds.some((assetId, index) => assetId !== requestedImageAssetIds[index])
    ) {
      return { ok: false as const, status: 409, error: "card_news_deck_assets_mismatch" };
    }
    const authoritativeMapping = mapCardNewsDeckToInstagramDraft({
      deck: { ...storedDeck, cards: orderedCards },
      renderedCards: storedAssetIds.map((imageAssetId, index) => ({
        cardId: orderedCards[index].cardId,
        imageAssetId,
      })),
    });
    const pinnedPolicyVersion = getPinnedUploadPolicyVersion(job, args.channel);
    const requestedPolicyVersion = Number(requestedCardNews.uploadPolicyVersion);
    if (!pinnedPolicyVersion || requestedPolicyVersion !== pinnedPolicyVersion) {
      return { ok: false as const, status: 409, error: "marketing_upload_policy_version_stale" };
    }
    verifiedCardNews = {
      ...authoritativeMapping.cardNews,
      uploadPolicyVersion: pinnedPolicyVersion,
    };
  }
  let requestedMarketingUploadImages: Awaited<ReturnType<typeof resolveMarketingContentImagesByIds>> = [];
  if (requestedMarketingUploadAssetIds.length) {
    try {
      requestedMarketingUploadImages = await resolveMarketingContentImagesByIds({
        universeId: args.universeId,
        assetIds: requestedMarketingUploadAssetIds,
      });
    } catch (error) {
      if (error instanceof MarketingContentImageError) {
        return { ok: false as const, status: error.status, error: error.message };
      }
      throw error;
    }
  }
  let referencedMarketingUploadAssetIds = toStringArray(
    [
      ...(Array.isArray(existingDraft.marketingUploadAssetIds) ? existingDraft.marketingUploadAssetIds : []),
      ...requestedMarketingUploadAssetIds,
    ],
    12,
  );
  const mergedDraft: MarketingRecord = {
    ...existingDraft,
    ...(args.draft || {}),
    ...(verifiedCardNews ? { cardNews: verifiedCardNews } : {}),
    channel: args.channel,
    ...(args.channel === "threads" || args.channel === "instagram"
      ? { hashtags: toStringArray(args.draft?.hashtags ?? existingDraft.hashtags, 10) }
      : args.channel === "linkedin"
        ? { hashtags: toStringArray(args.draft?.hashtags ?? existingDraft.hashtags, 10) }
        : { tags: toStringArray(args.draft?.tags ?? existingDraft.tags, 10) }),
  };
  const nextDraft: MarketingRecord = normalizePlainTextSocialDraft(args.channel, mergedDraft);
  const existingDraftImageUrls = toImageUrlArray([
    existingDraft.imageUrls,
    existingDraft.images,
    existingDraft.imageUrl,
  ]);
  const requestedDraftImageUrls = toImageUrlArray([
    args.draft?.imageUrls,
    args.draft?.images,
    args.draft?.imageUrl,
    requestedImageAssetIds.map((assetId) => publicImageUrlByAssetId.get(assetId) || ""),
  ]);
  const existingCardNews = isUnknownRecord(existingDraft.cardNews) ? existingDraft.cardNews : null;
  if (
    existingCardNews &&
    requestedDraftImageUrls.length > 0 &&
    existingDraftImageUrls.join("\n") !== requestedDraftImageUrls.join("\n")
  ) {
    // 운영자가 카드뉴스 이미지 목록을 직접 바꾸면 기존 순서·증거 판정을 폐기한다.
    delete nextDraft.cardNews;
  }
  if (
    args.channel === "instagram" &&
    (args.action === "complete" || args.action === "publish_member")
  ) {
    const cardNewsPublishGateError = getCardNewsPublishGateError(nextDraft);
    if (cardNewsPublishGateError) {
      return { ok: false as const, status: 409, error: cardNewsPublishGateError };
    }
  }
  const existingValidationContent = isUnknownRecord(validationAsset?.content) ? validationAsset.content : {};
  const existingChecks = isUnknownRecord(existingValidationContent.checks) ? existingValidationContent.checks : {};
  const independentProofread = isUnknownRecord(existingChecks.independentProofread)
    ? existingChecks.independentProofread
    : {};
  const currentDraftDigest = createMarketingDraftDigest(nextDraft);
  const independentProofreadPassed =
    toSafeString(independentProofread.status) === "passed" &&
    independentProofread.valid === true &&
    toSafeString(independentProofread.draftDigest) === currentDraftDigest;
  if (args.proofreadRequired && requiresIndependentProofread(args.action) && !independentProofreadPassed) {
    return {
      ok: false as const,
      status: 409,
      error:
        toSafeString(independentProofread.draftDigest) &&
        toSafeString(independentProofread.draftDigest) !== currentDraftDigest
          ? "independent_proofread_stale"
          : "independent_proofread_required",
    };
  }
  const draftHasExplicitImageSelection =
    hasExplicitDraftImageSelection(args.draft) || hasExplicitDraftImageSelection(existingDraft);
  const sourceImageUrl =
    toSafeString(nextDraft.imageUrl || nextDraft.image_url || nextDraft.thumbnailUrl || nextDraft.thumbnail_url) ||
    (draftHasExplicitImageSelection
      ? ""
      : toSafeString(sourceSnapshot.imageUrl || toImageUrlArray(sourceSnapshot.imageUrls, 1)[0]));

  const ensuredStep = await ensureReviewStep({
    universeId: args.universeId,
    jobId: args.jobId,
    channel: args.channel,
    existingSteps: steps,
    assetIds: [
      ...(draftAsset?.assetId ? [draftAsset.assetId] : []),
      ...(validationAssetId ? [validationAssetId] : []),
    ],
  });
  if (!draftAsset?.assetId && args.action === "attach_image") {
    draftAsset = (await createMarketingAsset({
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      universeId: args.universeId,
      kind: "channel_draft",
      channel: args.channel,
      title: `${args.channel} draft`,
      mimeType: "application/json",
      content: nextDraft,
      meta: {
        provider: "operator",
        createdBy: toSafeString(args.requestedBy),
        createdAt: new Date().toISOString(),
        reason: "attach_image_without_existing_draft",
      },
    })) as unknown as NonNullable<typeof draftAsset>;
  }
  if (!draftAsset?.assetId) {
    return { ok: false as const, status: 404, error: "draft_asset_not_found" };
  }
  const operatorValidationReport = shouldValidateOperatorDraft(args.action)
    ? await validateOperatorDraft({
        universeId: args.universeId,
        channel: args.channel,
        draft: nextDraft,
      })
    : null;
  if (args.proofreadRequired && operatorValidationReport) {
    operatorValidationReport.checks = {
      ...operatorValidationReport.checks,
      independentProofread: independentProofreadPassed
        ? independentProofread
        : { ...independentProofread, status: "stale", valid: false, draftDigest: currentDraftDigest },
    };
    operatorValidationReport.valid = operatorValidationReport.valid && independentProofreadPassed;
    if (!independentProofreadPassed) {
      operatorValidationReport.issues = Array.from(
        new Set([...operatorValidationReport.issues, "independent_proofread_required"]),
      );
    }
  }
  if (
    args.proofreadRequired &&
    args.action !== "save_draft" &&
    operatorValidationReport &&
    !operatorValidationReport.checks.koreanTypoRules.valid
  ) {
    const blockedPatterns = operatorValidationReport.checks.koreanTypoRules.findings
      .map((finding) => toSafeString(finding.pattern))
      .filter(Boolean);
    return {
      ok: false as const,
      status: 409,
      error: `active_typo_rule_blocked:${Array.from(new Set(blockedPatterns)).join(",")}`,
    };
  }
  if (operatorValidationReport) {
    if (validationAssetId) {
      await updateMarketingAsset({
        assetId: validationAssetId,
        set: {
          content: operatorValidationReport,
          meta: {
            ...(validationAsset?.meta || {}),
            provider: "operator",
            draftAssetId: draftAsset.assetId,
            validatedBy: toSafeString(args.requestedBy),
            validatedAt: new Date().toISOString(),
          },
        },
      });
    } else {
      const createdValidationAsset = await createMarketingAsset({
        jobId: args.jobId,
        stepId: ensuredStep.stepId,
        universeId: args.universeId,
        kind: "validation_report",
        channel: args.channel,
        title: `${args.channel} validation report`,
        mimeType: "application/json",
        content: operatorValidationReport,
        meta: {
          provider: "operator",
          draftAssetId: draftAsset.assetId,
          validatedBy: toSafeString(args.requestedBy),
          validatedAt: new Date().toISOString(),
        },
      });
      validationAssetId = toSafeString(createdValidationAsset.assetId);
    }
  }
  const requestedPublishAt = toDateOrNull(resolvedPublishAt);
  const isScheduleCapablePublishAction =
    (args.action === "complete" &&
      (args.channel === "threads" || args.channel === "instagram" || args.channel === "naver_blog")) ||
    (args.action === "publish_member" && args.channel === "linkedin");
  const futurePublishAt = getFuturePublishAt(resolvedPublishAt);
  if (resolvedPublishAt && isScheduleCapablePublishAction && (!requestedPublishAt || !futurePublishAt)) {
    return { ok: false as const, status: 400, error: "publish_at_must_be_future" };
  }
  const shouldQueueImmediateInstagramPublish =
    args.action === "complete" &&
    args.channel === "instagram" &&
    !resolvedPublishAt &&
    !args.executeScheduledPublish;
  const queuedPublishAt = shouldQueueImmediateInstagramPublish ? new Date() : futurePublishAt;
  const canSchedulePublish = Boolean(queuedPublishAt) && isScheduleCapablePublishAction;
  const shouldClearScheduledPublish =
    !canSchedulePublish &&
    [
      "attach_image",
      "remove_image",
      "save_draft",
      "complete",
      "publish_member",
      "mark_published",
      "skip",
      "cancel_scheduled_publish",
    ].includes(args.action);
  const draftAssetMeta = shouldClearScheduledPublish
    ? clearScheduledPublishMeta(draftAsset.meta)
    : { ...(draftAsset.meta || {}) };
  const ensuredStepMeta = shouldClearScheduledPublish
    ? clearScheduledPublishMeta(ensuredStep.meta)
    : { ...(ensuredStep.meta || {}) };
  const nextCardNews = isUnknownRecord(nextDraft.cardNews) ? nextDraft.cardNews : null;
  const nextCardNewsPolicyVersion = Number(nextCardNews?.uploadPolicyVersion);
  if (
    toSafeString(nextCardNews?.kind) === "card_news" &&
    Number.isInteger(nextCardNewsPolicyVersion) &&
    nextCardNewsPolicyVersion >= 1
  ) {
    ensuredStepMeta.cardNewsUploadPolicyVersion = nextCardNewsPolicyVersion;
  } else {
    delete ensuredStepMeta.cardNewsUploadPolicyVersion;
  }

  const protectionUntil = canSchedulePublish && queuedPublishAt
    ? new Date(queuedPublishAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    : ["complete", "publish_member", "mark_published"].includes(args.action)
      ? new Date(Date.now() + MARKETING_CONTENT_IMAGE_PUBLISHED_PROTECTION_MS)
      : ["attach_image", "save_draft"].includes(args.action)
        ? new Date(Date.now() + MARKETING_CONTENT_IMAGE_DRAFT_PROTECTION_MS)
        : null;
  if (protectionUntil && referencedMarketingUploadAssetIds.length) {
    await protectMarketingContentImages({
      universeId: args.universeId,
      assetIds: referencedMarketingUploadAssetIds,
      protectedUntil: protectionUntil,
    });
  }

  if (args.action === "remove_image") {
    const removeUrls = new Set(toImageUrlArray([args.draft?.imageUrls, args.draft?.imageUrl, args.draft?.url], 12));
    const removeAssetIds = new Set(toStringArray([args.draft?.imageAssetIds, args.draft?.imageAssetId, args.draft?.assetId], 12));
    const removeMarketingUploadAssetIds = new Set(toStringArray(args.draft?.marketingUploadAssetIds, 12));
    const existingMarketingUploadImages = await resolveMarketingContentImagesByIds({
      universeId: args.universeId,
      assetIds: referencedMarketingUploadAssetIds,
      strict: false,
    });
    existingMarketingUploadImages.forEach((image) => {
      if (removeUrls.has(toSafeString(image?.url))) removeMarketingUploadAssetIds.add(toSafeString(image?.assetId));
    });
    if (!removeUrls.size && !removeAssetIds.size && !removeMarketingUploadAssetIds.size) {
      return { ok: false as const, status: 400, error: "image_remove_target_required" };
    }

    const nextImageUrls = removeImageUrls([existingDraft.imageUrls, existingDraft.images, existingDraft.imageUrl], removeUrls);
    const nextImageAssetIds = removeImageAssetIds(existingDraft.imageAssetIds, removeAssetIds);
    const nextDraftContent = { ...nextDraft };
    if (isUnknownRecord(existingDraft.cardNews) && (removeUrls.size || removeAssetIds.size)) {
      // 카드뉴스 일부를 제거하면 카드 순서·시각 증거·정책 버전 메타를 더 이상 신뢰하지 않는다.
      delete nextDraftContent.cardNews;
    }
    referencedMarketingUploadAssetIds = referencedMarketingUploadAssetIds.filter(
      (assetId) => !removeMarketingUploadAssetIds.has(assetId),
    );
    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: {
          ...nextDraftContent,
          imageUrl: nextImageUrls[0] || "",
          imageUrls: nextImageUrls,
          images: nextImageUrls.map((url) => ({ url })),
          imageAssetIds: nextImageAssetIds,
          marketingUploadAssetIds: referencedMarketingUploadAssetIds,
        },
        meta: {
          ...draftAssetMeta,
          imageRemovedBy: toSafeString(args.requestedBy),
          imageRemovedAt: new Date().toISOString(),
        },
      },
    });

    const channelImageAssets = assets.filter(
      (asset) => toSafeString(asset.kind) === "channel_image" && toSafeString(asset.state || "active") === "active",
    );
    await Promise.all(
      channelImageAssets.map(async (asset) => {
        const content = (asset.content || {}) as MarketingRecord;
        const remainingUrls = removeImageUrls([content.imageUrls, content.images, content.imageUrl], removeUrls);
        const remainingAssetIds = removeImageAssetIds(content.imageAssetIds, removeAssetIds);
        const remainingMarketingUploadAssetIds = removeImageAssetIds(
          content.marketingUploadAssetIds,
          removeMarketingUploadAssetIds,
        );
        await updateMarketingAsset({
          assetId: toSafeString(asset.assetId),
          set: {
            state: remainingUrls.length ? "active" : "detached",
            content: {
              ...content,
              imageUrl: remainingUrls[0] || "",
              imageUrls: remainingUrls,
              images: remainingUrls.map((url) => ({ url, source: content.imageSource, alt: content.imageAlt })),
              imageAssetIds: remainingAssetIds,
              marketingUploadAssetIds: remainingMarketingUploadAssetIds,
            },
            meta: {
              ...(asset.meta || {}),
              imageRemovedBy: toSafeString(args.requestedBy),
              imageRemovedAt: new Date().toISOString(),
            },
          },
        });
      }),
    );

    await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: args.channel,
      status: "draft",
      targetRef: {
        externalUrl: getExternalUrl(args.channel, nextDraft),
        imageUrl: nextImageUrls[0] || "",
      },
      request: {
        action: "remove_image",
        imageUrls: Array.from(removeUrls),
        imageAssetIds: Array.from(removeAssetIds),
        marketingUploadAssetIds: Array.from(removeMarketingUploadAssetIds),
        draftAssetId: draftAsset.assetId,
      },
      response: {
        remainingImageUrls: nextImageUrls,
        note: toSafeString(args.note),
      },
      completedBy: args.requestedBy,
      completedAt: new Date(),
    });

    await updateMarketingJobStepStatus({
      stepId: ensuredStep.stepId,
      status: "waiting_review",
      meta: {
        ...ensuredStepMeta,
        imageRemovedBy: args.requestedBy,
        note: toSafeString(args.note),
      },
      outputRef: {
        assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
      },
    });
  }

  if (args.action === "attach_image") {
    const cardNews = requestedCardNews || (
      !hasExplicitDraftImageSelection(args.draft) && isUnknownRecord(existingDraft.cardNews)
        ? existingDraft.cardNews
        : null
    );
    const isCardNewsAttach = toSafeString(cardNews?.kind) === "card_news";
    const cardNewsAltTexts = Array.isArray(cardNews?.altTexts)
      ? cardNews.altTexts.map(toSafeString)
      : [];
    const nextImageAssetIds = isCardNewsAttach
      ? requestedImageAssetIds
      : toStringArray([
          existingDraft.imageAssetIds,
          requestedImageAssetIds,
        ], 12);
    const nextImageUrls = toImageUrlArray([
      args.draft?.imageUrls,
      args.draft?.images,
      args.draft?.imageUrl,
      requestedImageAssetIds.map((assetId) => publicImageUrlByAssetId.get(assetId) || ""),
      requestedMarketingUploadImages.map((image) => image?.url),
      isCardNewsAttach ? [] : existingDraft.imageUrls,
      isCardNewsAttach ? [] : existingDraft.imageUrl,
    ]);
    const primaryImageUrl = toSafeString(args.draft?.imageUrl) || nextImageUrls[0] || "";
    const imageSource = toSafeString(args.draft?.imageSource) || "gen_studio";
    const imageAlt = toSafeString(args.draft?.imageAlt || nextDraft.imageAlt || sourceSnapshot.imageAlt);
    if (!primaryImageUrl) {
      return { ok: false as const, status: 400, error: "image_url_required" };
    }

    const imageAsset = await createMarketingAsset({
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      universeId: args.universeId,
      kind: "channel_image",
      channel: args.channel,
      title: `${args.channel} image`,
      mimeType: "application/json",
      content: {
        channel: args.channel,
        imageUrl: primaryImageUrl,
        imageUrls: nextImageUrls,
        images: nextImageUrls.map((url, index) => ({
          url,
          source: imageSource,
          alt: cardNewsAltTexts[index] || imageAlt,
          assetId: nextImageAssetIds[index] || "",
        })),
        imageAlt,
        imageSource,
        imageAssetIds: nextImageAssetIds,
        ...(cardNews ? { cardNews } : {}),
        marketingUploadAssetIds: referencedMarketingUploadAssetIds,
        templateKey: toSafeString(args.draft?.templateKey),
        generationMode: toSafeString(args.draft?.generationMode),
      },
      meta: {
        attachedBy: toSafeString(args.requestedBy),
        attachedAt: new Date().toISOString(),
        note: toSafeString(args.note),
      },
    });

    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: {
          ...nextDraft,
          imageUrl: primaryImageUrl,
          imageUrls: nextImageUrls,
          imageAssetIds: nextImageAssetIds,
          ...(cardNews ? { cardNews } : {}),
          marketingUploadAssetIds: referencedMarketingUploadAssetIds,
          imageAlt: imageAlt || toSafeString(nextDraft.title || nextDraft.headline),
          imageSource,
        },
        meta: {
          ...draftAssetMeta,
          imageAttachedBy: toSafeString(args.requestedBy),
          imageAttachedAt: new Date().toISOString(),
          imageAssetId: imageAsset.assetId,
        },
      },
    });

    await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: args.channel,
      status: "draft",
      targetRef: {
        externalUrl: getExternalUrl(args.channel, nextDraft),
        imageUrl: primaryImageUrl,
      },
      request: {
        action: "attach_image",
        imageUrl: primaryImageUrl,
        imageUrls: nextImageUrls,
        draftAssetId: draftAsset.assetId,
        imageAssetId: imageAsset.assetId,
      },
      response: {
        note: toSafeString(args.note),
      },
      completedBy: args.requestedBy,
      completedAt: new Date(),
    });

    await updateMarketingJobStepStatus({
      stepId: ensuredStep.stepId,
      status: "waiting_review",
      meta: {
        ...ensuredStepMeta,
        imageAttachedBy: args.requestedBy,
        note: toSafeString(args.note),
      },
      outputRef: {
        assetIds: [
          draftAsset.assetId,
          imageAsset.assetId,
          ...(validationAssetId ? [validationAssetId] : []),
        ],
      },
    });
  }

  if (args.action === "save_draft") {
    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: nextDraft,
        meta: {
          ...draftAssetMeta,
          editedBy: toSafeString(args.requestedBy),
          editedAt: new Date().toISOString(),
        },
      },
    });

    await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: args.channel,
      status: "draft",
      targetRef: {
        externalUrl: getExternalUrl(args.channel, nextDraft),
      },
      request: nextDraft,
      response: {
        action: "save_draft",
        note: toSafeString(args.note),
      },
      completedBy: args.requestedBy,
      completedAt: new Date(),
    });

    await updateMarketingJobStepStatus({
      stepId: ensuredStep.stepId,
      status: "waiting_review",
      meta: {
        ...ensuredStepMeta,
        editedBy: args.requestedBy,
        note: toSafeString(args.note),
      },
      outputRef: {
        assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
      },
    });
  }

  if (args.action === "cancel_scheduled_publish") {
    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: nextDraft,
        meta: {
          ...draftAssetMeta,
          scheduledPublishCanceledBy: toSafeString(args.requestedBy),
          scheduledPublishCanceledAt: new Date().toISOString(),
        },
      },
    });

    await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: args.channel,
      status: "draft",
      targetRef: {
        externalUrl: getExternalUrl(args.channel, nextDraft),
      },
      request: {
        action: "cancel_scheduled_publish",
        scheduledPublishAt: currentScheduledPublishAt?.toISOString() || "",
      },
      response: {
        note: toSafeString(args.note),
      },
      completedBy: args.requestedBy,
      completedAt: new Date(),
    });

    await updateMarketingJobStepStatus({
      stepId: ensuredStep.stepId,
      status: "waiting_review",
      meta: {
        ...ensuredStepMeta,
        scheduledPublishCanceledBy: args.requestedBy,
        scheduledPublishCanceledAt: new Date().toISOString(),
        note: toSafeString(args.note),
      },
      outputRef: {
        assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
      },
    });
  }

  if (canSchedulePublish && queuedPublishAt) {
    const scheduledPublishAt = queuedPublishAt.toISOString();
    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: nextDraft,
        meta: {
          ...(draftAsset.meta || {}),
          scheduledBy: toSafeString(args.requestedBy),
          scheduledAt: new Date().toISOString(),
          scheduledPublishAt,
          publishAction: args.action,
          publishMode:
            args.channel === "linkedin"
              ? "linkedin_member_share"
              : args.channel === "instagram"
                ? "instagram_publish"
                : args.channel === "naver_blog"
                  ? "semi_auto"
                  : "threads_publish",
        },
      },
    });

    const publishLog = await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: args.channel,
      status: "draft",
      targetRef: {
        externalUrl: getExternalUrl(args.channel, nextDraft),
      },
      request: {
        ...nextDraft,
        publishAt: scheduledPublishAt,
      },
      response: {
        action: "schedule_publish",
        publishAction: args.action,
        scheduledPublishAt,
        note: toSafeString(args.note),
      },
      completedBy: args.requestedBy,
      completedAt: new Date(),
    });

    await updateMarketingJobStepStatus({
      stepId: ensuredStep.stepId,
      status: "approved",
      meta: {
        ...(ensuredStep.meta || {}),
        scheduledBy: args.requestedBy,
        scheduledAt: new Date().toISOString(),
        scheduledPublishAt,
        publishAction: args.action,
        note: toSafeString(args.note),
      },
      outputRef: {
        assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
        publishLogIds: [publishLog.publishLogId],
      },
    });
  }

  // 발행 게이트 — 초안은 기사가 draft 인 시점에 생성되므로 저장된 링크가 /?p=<ID> 일 수 있다.
  // 실제로 외부에 나가는 지점은 여기이므로, 발행 직전에 라이브 permalink 로 다시 확인하고
  // 기사가 아직 발행되지 않았으면 발행을 막는다. 생성 단계는 막지 않는다.
  const isImmediatePublishAction =
    !canSchedulePublish &&
    ((args.action === "complete" && (args.channel === "threads" || args.channel === "instagram")) ||
      (args.action === "publish_member" && args.channel === "linkedin"));

  let publishCanonicalUrl = "";
  if (isImmediatePublishAction) {
    const canonicalResult = await resolvePublishCanonicalUrl({
      postId: Number(job.sourceRef?.postId || 0) || undefined,
      slug: toSafeString(job.sourceRef?.slug) || undefined,
      fallbackUrl:
        toSafeString(job.sourceRef?.url) ||
        toSafeString(nextDraft.linkUrl) ||
        toSafeString(nextDraft.commentLink),
    });
    if (!canonicalResult.ok) {
      return {
        ok: false as const,
        status: 409,
        error: `source_post_not_publishable:${canonicalResult.reason}`,
      };
    }
    publishCanonicalUrl = canonicalResult.canonicalUrl;
  }

  if (!canSchedulePublish && args.action === "complete" && args.channel === "threads") {
    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: nextDraft,
        meta: {
          ...draftAssetMeta,
          reviewedBy: toSafeString(args.requestedBy),
          reviewedAt: new Date().toISOString(),
        },
      },
    });

    const publishResult = await publishMarketingThreadsDraft({
      universeId: args.universeId,
      jobId: args.jobId,
      slug: toSafeString(job.sourceRef?.slug),
      draft: nextDraft,
      dryRun: false,
      canonicalUrl: publishCanonicalUrl,
      sourceImageUrl,
      campaignId: toSafeString(sourceSnapshot.campaignId),
    });

    const publishLog = await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: "threads",
      status: publishResult.status,
      targetRef: {
        canonicalUrl: publishResult.request.canonicalUrl,
        finalUrl: publishResult.request.finalUrl,
        sourceLineage: {
          sourceKind: toSafeString(sourceSnapshot.sourceKind),
          campaignId: toSafeString(sourceSnapshot.campaignId),
          sourceFingerprint: toSafeString(sourceSnapshot.sourceFingerprint),
          draftId: toSafeString(sourceSnapshot.draftId),
          draftRevision: Number(sourceSnapshot.draftRevision || 0) || undefined,
          channelProductNo: Number(sourceSnapshot.channelProductNo || 0) || undefined,
        },
      },
      request: publishResult.request,
      response: {
        mode: publishResult.mode,
        raw: publishResult.response,
      },
      completedBy: args.requestedBy,
      publishedAt: publishResult.publishedAt,
      completedAt: new Date(),
    });

    if (!publishResult.ok || publishResult.status !== "published") {
      const publishError = publishResult.ok
        ? {
            code: "THREADS_PUBLISH_NOT_COMPLETED",
            message: getPublishNotCompletedError("threads", publishResult),
          }
        : publishResult.error;

      await updateMarketingJobStepStatus({
        stepId: ensuredStep.stepId,
        status: "failed",
        meta: {
          ...ensuredStepMeta,
          completedBy: args.requestedBy,
          note: toSafeString(args.note),
          error: publishError,
        },
        outputRef: {
          assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
          publishLogIds: [publishLog.publishLogId],
        },
        lastError: publishError,
        completedAt: new Date(),
      });

      actionError = {
        status: 502,
        error: toSafeString(publishError?.message) || "threads_publish_failed",
      };
    } else {
      const receiptAsset = await createMarketingAsset({
        jobId: args.jobId,
        stepId: ensuredStep.stepId,
        universeId: args.universeId,
        kind: "publish_receipt",
        channel: "threads",
        title: "threads publish receipt",
        mimeType: "application/json",
        content: {
          channel: "threads",
          mode: publishResult.mode,
          request: publishResult.request,
          response: publishResult.response,
          publishedAt: publishResult.publishedAt,
          draftAssetId: draftAsset.assetId,
          completedBy: args.requestedBy,
          completedAt: new Date().toISOString(),
        },
        meta: {
          publishLogId: publishLog.publishLogId,
          note: toSafeString(args.note),
        },
      });

      await updateMarketingJobStepStatus({
        stepId: ensuredStep.stepId,
        status: "success",
        meta: {
          ...ensuredStepMeta,
          completedBy: args.requestedBy,
          note: toSafeString(args.note),
          publishMode: publishResult.mode,
          publishStatus: publishResult.status,
        },
        outputRef: {
          assetIds: [
            draftAsset.assetId,
            receiptAsset.assetId,
            ...(validationAssetId ? [validationAssetId] : []),
          ],
          publishLogIds: [publishLog.publishLogId],
        },
        completedAt: new Date(),
      });
    }
  }

  if (!canSchedulePublish && args.action === "complete" && args.channel === "instagram") {
    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: nextDraft,
        meta: {
          ...draftAssetMeta,
          reviewedBy: toSafeString(args.requestedBy),
          reviewedAt: new Date().toISOString(),
        },
      },
    });

    const publishResult = await publishMarketingInstagramDraft({
      universeId: args.universeId,
      jobId: args.jobId,
      slug: toSafeString(job.sourceRef?.slug),
      draft: nextDraft,
      dryRun: false,
      canonicalUrl: publishCanonicalUrl,
      sourceImageUrl,
      campaignId: toSafeString(sourceSnapshot.campaignId),
    });

    const publishLog = await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: "instagram",
      status: publishResult.status,
      targetRef: {
        canonicalUrl: publishResult.request.canonicalUrl,
        finalUrl: publishResult.request.finalUrl,
        imageUrl: publishResult.request.imageUrl,
        sourceLineage: {
          sourceKind: toSafeString(sourceSnapshot.sourceKind),
          campaignId: toSafeString(sourceSnapshot.campaignId),
          sourceFingerprint: toSafeString(sourceSnapshot.sourceFingerprint),
          draftId: toSafeString(sourceSnapshot.draftId),
          draftRevision: Number(sourceSnapshot.draftRevision || 0) || undefined,
          channelProductNo: Number(sourceSnapshot.channelProductNo || 0) || undefined,
        },
        imageUrls: publishResult.request.imageUrls,
      },
      request: publishResult.request,
      response: {
        mode: publishResult.mode,
        raw: publishResult.response,
        error: publishResult.ok ? null : publishResult.error,
      },
      completedBy: args.requestedBy,
      publishedAt: publishResult.publishedAt,
      completedAt: new Date(),
    });

    if (!publishResult.ok || publishResult.status !== "published") {
      const publishError = publishResult.ok
        ? {
            code: "INSTAGRAM_PUBLISH_NOT_COMPLETED",
            message: getPublishNotCompletedError("instagram", publishResult),
          }
        : publishResult.error;

      await updateMarketingJobStepStatus({
        stepId: ensuredStep.stepId,
        status: "failed",
        meta: {
          ...ensuredStepMeta,
          completedBy: args.requestedBy,
          note: toSafeString(args.note),
          error: publishError,
        },
        outputRef: {
          assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
          publishLogIds: [publishLog.publishLogId],
        },
        lastError: publishError,
        completedAt: new Date(),
      });

      actionError = {
        status: 502,
        error: toSafeString(publishError?.message) || "instagram_publish_failed",
      };
    } else {
      const receiptAsset = await createMarketingAsset({
        jobId: args.jobId,
        stepId: ensuredStep.stepId,
        universeId: args.universeId,
        kind: "publish_receipt",
        channel: "instagram",
        title: "instagram publish receipt",
        mimeType: "application/json",
        content: {
          channel: "instagram",
          mode: publishResult.mode,
          request: publishResult.request,
          response: publishResult.response,
          publishedAt: publishResult.publishedAt,
          draftAssetId: draftAsset.assetId,
          completedBy: args.requestedBy,
          completedAt: new Date().toISOString(),
        },
        meta: {
          publishLogId: publishLog.publishLogId,
          note: toSafeString(args.note),
        },
      });

      await updateMarketingJobStepStatus({
        stepId: ensuredStep.stepId,
        status: "success",
        meta: {
          ...ensuredStepMeta,
          completedBy: args.requestedBy,
          note: toSafeString(args.note),
          publishMode: publishResult.mode,
          publishStatus: publishResult.status,
        },
        outputRef: {
          assetIds: [
            draftAsset.assetId,
            receiptAsset.assetId,
            ...(validationAssetId ? [validationAssetId] : []),
          ],
          publishLogIds: [publishLog.publishLogId],
        },
        completedAt: new Date(),
      });
    }
  }

  if (args.action === "mark_published" || (args.action === "complete" && args.channel !== "threads" && args.channel !== "instagram")) {
    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: nextDraft,
        meta: {
          ...draftAssetMeta,
          completedBy: toSafeString(args.requestedBy),
          completedAt: new Date().toISOString(),
        },
      },
    });

    const receiptAsset = await createMarketingAsset({
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      universeId: args.universeId,
      kind: "publish_receipt",
      channel: args.channel,
      title: `${args.channel} publish receipt`,
      mimeType: "application/json",
      content: {
        channel: args.channel,
        mode: "semi_auto",
        publishedUrl: toSafeString(args.publishedUrl),
        title: toSafeString(nextDraft.title),
        completedBy: args.requestedBy,
        completedAt: new Date().toISOString(),
        draftAssetId: draftAsset.assetId,
      },
      meta: {
        note: toSafeString(args.note),
      },
    });

    const publishLog = await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: args.channel,
      status: "published",
      targetRef: {
        externalUrl: getExternalUrl(args.channel, nextDraft, args.publishedUrl),
      },
      request: nextDraft,
      response: {
        receiptAssetId: receiptAsset.assetId,
        publishedUrl: toSafeString(args.publishedUrl),
      },
      completedBy: args.requestedBy,
      publishedAt: new Date(),
      completedAt: new Date(),
    });

    await updateMarketingJobStepStatus({
      stepId: ensuredStep.stepId,
      status: "success",
      meta: {
        ...ensuredStepMeta,
        completedBy: args.requestedBy,
        note: toSafeString(args.note),
      },
      outputRef: {
        assetIds: [
          draftAsset.assetId,
          receiptAsset.assetId,
          ...(validationAssetId ? [validationAssetId] : []),
        ],
        publishLogIds: [publishLog.publishLogId],
      },
      completedAt: new Date(),
    });
  }

  if (!canSchedulePublish && args.action === "publish_member") {
    if (args.channel !== "linkedin") {
      return { ok: false as const, status: 400, error: "unsupported_publish_member_channel" };
    }

    await updateMarketingAsset({
      assetId: draftAsset.assetId,
      set: {
        content: nextDraft,
        meta: {
          ...draftAssetMeta,
          publishedBy: toSafeString(args.requestedBy),
          publishedAt: new Date().toISOString(),
          publishMode: "linkedin_member_share",
        },
      },
    });

    const publishResult = await publishLinkedInMemberShare({
      universeId: args.universeId,
      jobId: args.jobId,
      slug: toSafeString(job.sourceRef?.slug),
      draft: nextDraft,
      canonicalUrl: publishCanonicalUrl,
      dryRun: false,
      sourceImageUrl,
    });
    const publishedUrl = toSafeString(publishResult.response?.postUrl) || toSafeString(publishResult.request?.finalUrl);

    if (!publishResult.ok) {
      const publishLog = await createMarketingPublishLog({
        universeId: args.universeId,
        jobId: args.jobId,
        stepId: ensuredStep.stepId,
        channel: args.channel,
        status: "failed",
        targetRef: {
          externalUrl: publishedUrl || "https://www.linkedin.com/feed/",
        },
        request: publishResult.request,
        response: {
          mode: publishResult.mode,
          error: publishResult.error,
          raw: publishResult.response,
        },
        completedBy: args.requestedBy,
        completedAt: new Date(),
      });

      await updateMarketingJobStepStatus({
        stepId: ensuredStep.stepId,
        status: "failed",
        meta: {
          ...ensuredStepMeta,
          completedBy: args.requestedBy,
          note: toSafeString(args.note),
          error: publishResult.error,
        },
        outputRef: {
          assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
          publishLogIds: [publishLog.publishLogId],
        },
        completedAt: new Date(),
      });

      actionError = {
        status: 502,
        error: toSafeString(publishResult.error?.message) || "linkedin_member_share_failed",
      };
    } else if (publishResult.status === "published") {
      const receiptAsset = await createMarketingAsset({
        jobId: args.jobId,
        stepId: ensuredStep.stepId,
        universeId: args.universeId,
        kind: "publish_receipt",
        channel: args.channel,
        title: "linkedin member share receipt",
        mimeType: "application/json",
        content: {
          channel: args.channel,
          mode: "linkedin_member_share",
          publishedUrl,
          postId: toSafeString(publishResult.response?.postId),
          memberUrn: toSafeString(publishResult.response?.memberUrn),
          title: toSafeString(nextDraft.headline || nextDraft.title),
          completedBy: args.requestedBy,
          completedAt: new Date().toISOString(),
          draftAssetId: draftAsset.assetId,
        },
        meta: {
          note: toSafeString(args.note),
        },
      });

      const publishLog = await createMarketingPublishLog({
        universeId: args.universeId,
        jobId: args.jobId,
        stepId: ensuredStep.stepId,
        channel: args.channel,
        status: "published",
        targetRef: {
          externalUrl: publishedUrl,
          imageUrl: publishResult.request.imageUrl,
          imageUrls: publishResult.request.imageUrls,
        },
        request: publishResult.request,
        response: {
          receiptAssetId: receiptAsset.assetId,
          mode: publishResult.mode,
          raw: publishResult.response,
        },
        completedBy: args.requestedBy,
        publishedAt: new Date(),
        completedAt: new Date(),
      });

      await updateMarketingJobStepStatus({
        stepId: ensuredStep.stepId,
        status: "success",
        meta: {
          ...ensuredStepMeta,
          completedBy: args.requestedBy,
          note: toSafeString(args.note),
          publishMode: "linkedin_member_share",
        },
        outputRef: {
          assetIds: [
            draftAsset.assetId,
            receiptAsset.assetId,
            ...(validationAssetId ? [validationAssetId] : []),
          ],
          publishLogIds: [publishLog.publishLogId],
        },
        completedAt: new Date(),
      });
    } else {
      const publishError = {
        code: "LINKEDIN_MEMBER_SHARE_NOT_COMPLETED",
        message: getPublishNotCompletedError("linkedin", publishResult),
      };
      const publishLog = await createMarketingPublishLog({
        universeId: args.universeId,
        jobId: args.jobId,
        stepId: ensuredStep.stepId,
        channel: args.channel,
        status: "draft",
        targetRef: {
          externalUrl: publishedUrl || "https://www.linkedin.com/feed/",
          imageUrl: publishResult.request.imageUrl,
          imageUrls: publishResult.request.imageUrls,
        },
        request: publishResult.request,
        response: {
          mode: publishResult.mode,
          error: publishError,
          raw: publishResult.response,
        },
        completedBy: args.requestedBy,
        completedAt: new Date(),
      });

      await updateMarketingJobStepStatus({
        stepId: ensuredStep.stepId,
        status: "failed",
        meta: {
          ...ensuredStepMeta,
          completedBy: args.requestedBy,
          note: toSafeString(args.note),
          error: publishError,
        },
        outputRef: {
          assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
          publishLogIds: [publishLog.publishLogId],
        },
        completedAt: new Date(),
      });

      actionError = {
        status: 502,
        error: publishError.message,
      };
    }
  }

  if (args.action === "skip") {
    const publishLog = await createMarketingPublishLog({
      universeId: args.universeId,
      jobId: args.jobId,
      stepId: ensuredStep.stepId,
      channel: args.channel,
      status: "skipped",
      targetRef: {
        externalUrl: getExternalUrl(args.channel, existingDraft),
      },
      request: existingDraft,
      response: {
        action: "skip",
        note: toSafeString(args.note),
      },
      completedBy: args.requestedBy,
      completedAt: new Date(),
    });

    await updateMarketingJobStepStatus({
      stepId: ensuredStep.stepId,
      status: "skipped",
      meta: {
        ...ensuredStepMeta,
        skippedBy: args.requestedBy,
        note: toSafeString(args.note),
      },
      outputRef: {
        assetIds: [draftAsset.assetId, ...(validationAssetId ? [validationAssetId] : [])],
        publishLogIds: [publishLog.publishLogId],
      },
      completedAt: new Date(),
    });
  }

  const nextSteps = await listMarketingJobSteps({ jobId: args.jobId, limit: 200 });
  const summary = summarizeJobStatus(job, nextSteps);
  await updateMarketingJobStatus({
    jobId: args.jobId,
    status: summary.status,
    currentStepKey: summary.currentStepKey,
    completedAt: summary.status === "success" ? new Date() : undefined,
    lastError: summary.lastError,
  });

  if (
    (args.action === "complete" || args.action === "mark_published") &&
    args.channel === "naver_blog" &&
    toSafeString(job.sourceRef?.inventoryId)
  ) {
    await updateMarketingSourceInventoryItem({
      universeId: args.universeId,
      itemId: toSafeString(job.sourceRef?.inventoryId),
      set: {
        rewriteStatus: "applied_manually",
        lastJobId: args.jobId,
        appliedUrl: toSafeString(args.publishedUrl),
        appliedBy: toSafeString(args.requestedBy),
        appliedAt: new Date(),
        note: toSafeString(args.note),
      },
    }).catch(() => null);
  }

  const channels: Record<string, string> = {
    threads:
      toSafeString(
        nextSteps.find(
          (step) => toSafeString(step.stepKey) === "publish_threads" && toSafeString(step.channel) === "threads",
        )?.status,
      ) || "skipped",
    instagram:
      toSafeString(
        nextSteps.find(
          (step) =>
            toSafeString(step.stepKey) === "publish_instagram" && toSafeString(step.channel) === "instagram",
        )?.status,
      ) || "skipped",
    linkedin:
      toSafeString(
        nextSteps.find(
          (step) =>
            toSafeString(step.stepKey) === "prepare_linkedin_draft" && toSafeString(step.channel) === "linkedin",
        )?.status,
      ) || "waiting_review",
    naver_blog:
      toSafeString(
        nextSteps.find(
          (step) =>
            toSafeString(step.stepKey) === "prepare_naver_draft" && toSafeString(step.channel) === "naver_blog",
        )?.status,
      ) || "waiting_review",
  };

  await sendMarketingSlackNotification({
    universeId: args.universeId,
    jobId: args.jobId,
    event:
      summary.status === "success" ? "job_success" : summary.status === "partial" ? "job_partial" : "waiting_review",
    postTitle: toSafeString(job.sourceRef?.slug),
    postUrl: toSafeString(job.sourceRef?.url),
    channels,
    summary:
      canSchedulePublish
        ? `${args.channel} 예약 발행이 등록되었습니다.`
        : args.action === "cancel_scheduled_publish"
          ? `${args.channel} 예약 발행이 취소되었습니다.`
        : args.action === "publish_member"
        ? actionError
          ? `${args.channel} 개인 프로필 발행에 실패했습니다.`
          : `${args.channel} 개인 프로필 발행 요청이 처리되었습니다.`
        : args.action === "attach_image"
          ? `${args.channel} draft 이미지가 연결되었습니다.`
          : args.action === "mark_published"
            ? `${args.channel} 수동 발행 완료 처리가 반영되었습니다.`
          : args.action === "complete"
            ? `${args.channel} 채널 완료 체크가 반영되었습니다.`
            : args.action === "skip"
              ? `${args.channel} 채널이 skip 처리되었습니다.`
              : `${args.channel} draft 수정이 저장되었습니다.`,
  }).catch(() => null);

  const latestLogs = await listMarketingPublishLogs({
    universeId: args.universeId,
    jobId: args.jobId,
    channel: args.channel,
    limit: 5,
  });

  return {
    ok: actionError ? (false as const) : (true as const),
    status: actionError?.status || 200,
    ...(actionError ? { error: actionError.error } : {}),
    data: {
      jobStatus: summary.status,
      latestChannelLog: latestLogs[0] || null,
      scheduledPublishAt: canSchedulePublish ? queuedPublishAt?.toISOString() || "" : "",
    },
  };
}

export async function publishDueMarketingChannelActions(args: {
  universeId: string;
  workerId: string;
  limit?: number;
}) {
  if (/^agent:|^marketing-(?:local-)?agent-/i.test(toSafeString(args.workerId))) {
    return { ok: true as const, status: "agent_publish_blocked" as const, processed: 0 };
  }

  const steps = await listMarketingJobSteps({
    universeId: args.universeId,
    status: "approved",
    channel: ["threads", "instagram", "linkedin", "naver_blog"],
    scheduledPublishBefore: new Date(),
    limit: args.limit || 50,
  });
  const dueStep = steps.find(isDueScheduledPublishStep);

  if (!dueStep?.stepId) {
    return {
      ok: true,
      status: "idle" as const,
    };
  }

  const channel = toSafeString(dueStep.channel) as "threads" | "instagram" | "linkedin" | "naver_blog";
  const scheduledPublishAt = getScheduledPublishAt(dueStep)?.toISOString() || "";
  const pickedAt = new Date();

  const claimedStep = await updateMarketingJobStepStatus({
    stepId: dueStep.stepId,
    expectedStatus: "approved",
    status: "running",
    workerId: args.workerId,
    meta: {
      ...(dueStep.meta || {}),
      scheduledPublishPickedAt: pickedAt.toISOString(),
      scheduledPublishWorkerId: args.workerId,
    },
    startedAt: pickedAt,
  });

  if (!claimedStep) {
    return {
      ok: true,
      status: "idle" as const,
    };
  }

  const jobId = toSafeString(dueStep.jobId);

  try {
    const result = await applyMarketingChannelAction({
      universeId: args.universeId,
      jobId,
      channel,
      action: channel === "linkedin" ? "publish_member" : "complete",
      requestedBy: args.workerId,
      note: scheduledPublishAt ? `scheduled_publish:${scheduledPublishAt}` : "scheduled_publish",
      executeScheduledPublish: true,
    });

    if (!result.ok) {
      const latestLogs = await listMarketingPublishLogs({
        universeId: args.universeId,
        jobId,
        channel,
        limit: 5,
      });
      const hasCurrentFailureLog = latestLogs.some(
        (log) => toSafeString(log.stepId) === toSafeString(claimedStep.stepId) && toSafeString(log.status) === "failed",
      );
      if (!hasCurrentFailureLog) {
        const { publishError, publishLog } = await createScheduledPublishFailureLog({
          universeId: args.universeId,
          jobId,
          stepId: toSafeString(claimedStep.stepId),
          channel,
          workerId: args.workerId,
          scheduledPublishAt,
          error: result.error,
        });
        await updateMarketingJobStepStatus({
          stepId: toSafeString(claimedStep.stepId),
          status: "failed",
          meta: {
            ...(claimedStep.meta || {}),
            scheduledPublishFailedAt: new Date().toISOString(),
            scheduledPublishWorkerId: args.workerId,
            error: publishError,
          },
          outputRef: {
            ...(claimedStep.outputRef || {}),
            publishLogIds: [publishLog.publishLogId],
          },
          lastError: publishError,
          completedAt: new Date(),
        });
        await updateMarketingJobStatus({
          jobId,
          status: "failed",
          currentStepKey:
            channel === "threads"
              ? "publish_threads"
              : channel === "instagram"
                ? "publish_instagram"
                : channel === "naver_blog"
                  ? "prepare_naver_draft"
                  : "prepare_linkedin_draft",
          lastError: publishError,
        });
      }
    }

    return {
      ok: result.ok,
      status: result.ok ? ("scheduled_publish_processed" as const) : ("scheduled_publish_failed" as const),
      jobId,
      channel,
      scheduledPublishAt,
      ...(result.ok ? { data: result.data } : { error: result.error }),
    };
  } catch (error: unknown) {
    const { publishError, publishLog } = await createScheduledPublishFailureLog({
      universeId: args.universeId,
      jobId,
      stepId: toSafeString(claimedStep.stepId),
      channel,
      workerId: args.workerId,
      scheduledPublishAt,
      error,
    });
    await updateMarketingJobStepStatus({
      stepId: toSafeString(claimedStep.stepId),
      status: "failed",
      meta: {
        ...(claimedStep.meta || {}),
        scheduledPublishFailedAt: new Date().toISOString(),
        scheduledPublishWorkerId: args.workerId,
        error: publishError,
      },
      outputRef: {
        ...(claimedStep.outputRef || {}),
        publishLogIds: [publishLog.publishLogId],
      },
      lastError: publishError,
      completedAt: new Date(),
    });
    await updateMarketingJobStatus({
      jobId,
      status: "failed",
      currentStepKey:
        channel === "threads"
          ? "publish_threads"
          : channel === "instagram"
            ? "publish_instagram"
            : channel === "naver_blog"
              ? "prepare_naver_draft"
              : "prepare_linkedin_draft",
      lastError: publishError,
    });

    return {
      ok: false,
      status: "scheduled_publish_failed" as const,
      jobId,
      channel,
      scheduledPublishAt,
      error: publishError.message,
    };
  }
}
