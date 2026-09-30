import "server-only";

import { TEXT_MODEL_MAP } from "consts/ai";
import type { MarketingChannel } from "consts/marketing/queue";
import {
  createMarketingAsset,
  createMarketingPublishLog,
  getMarketingAdsPolicy,
  getMarketingJobByJobId,
  getMarketingKeywordSettings,
  listMarketingAssets,
  updateMarketingAsset,
} from "libs/database/marketing";
import { runMarketingBridge } from "libs/marketing/bridge/runner";
import type { MarketingChannelDraft } from "libs/marketing/bridge/types";
import { normalizeMarketingGenerationConfig } from "libs/marketing/generationConfig";
import {
  assertAIUsageBalanceOrThrow,
  assertPricingPreflightOrThrow,
  billAIUsageOrThrow,
  refundAIUsageOrThrow,
} from "libs/services/aiUsageBilling";
import { assertSystemModelSelectableOrThrow } from "libs/server-utils/api/systemModelControl";
import type { AiProviderType } from "types/ai";
import {
  isGoogleProTextModel,
  isXaiLongContextTieredTextModel,
  pickXaiPricingVariantByInputTokens,
} from "utils/ai/providerHelper";
import { isUnknownRecord, toSafeString, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";
import { createMarketingDraftDigest } from "libs/marketing/quality/marketingDraftDigest";

type StrategyFitKind = "marketing" | "advertising";
type SupportedChannel = "threads" | "instagram" | "linkedin" | "naver_blog";

const SUPPORTED_CHANNELS = new Set<SupportedChannel>(["threads", "instagram", "linkedin", "naver_blog"]);

function resolveModel(providerRaw: unknown, modelRaw: unknown) {
  const provider = toSafeString(providerRaw) as keyof typeof TEXT_MODEL_MAP;
  const modelName = toSafeString(modelRaw);
  const allowed = (TEXT_MODEL_MAP as Record<string, readonly string[]>)[provider] || [];
  return allowed.includes(modelName) ? { provider, modelName } : null;
}

function normalizeStringList(value: unknown, limit = 10) {
  return Array.isArray(value) ? value.map((item) => toSafeString(item)).filter(Boolean).slice(0, limit) : [];
}

function normalizeFitResult(value: unknown, channel: SupportedChannel, args: {
  kind: StrategyFitKind;
  strategyVersion: number;
  evaluatedAt: string;
  provider: string;
  modelName: string;
  coins: number;
}) {
  const row = isUnknownRecord(value) ? value : {};
  const score = Math.max(0, Math.min(100, Math.round(Number(row.score) || 0)));
  const verdict = score >= 85 ? "fit" : score >= 70 ? "needs_work" : "not_fit";
  return {
    kind: args.kind,
    channel,
    score,
    verdict,
    signal: score >= 85 ? "green" : score >= 70 ? "yellow" : "red",
    summary: toSafeString(row.summary).slice(0, 500),
    reasons: normalizeStringList(row.reasons),
    recommendations: Array.isArray(row.recommendations)
      ? row.recommendations
          .filter(isUnknownRecord)
          .map((item) => ({
            action: toSafeString(item.action).slice(0, 300),
            reason: toSafeString(item.reason).slice(0, 500),
          }))
          .filter((item) => item.action || item.reason)
          .slice(0, 5)
      : [],
    strategyVersion: args.strategyVersion,
    evaluatedAt: args.evaluatedAt,
    provider: args.provider,
    modelName: args.modelName,
    coins: args.coins,
  };
}

export async function getMarketingStrategyFitContext(universeId: string) {
  const [keywordSettings, adsPolicy] = await Promise.all([
    getMarketingKeywordSettings(universeId),
    getMarketingAdsPolicy(universeId),
  ]);
  const marketingCriteria: UnknownRecord = isUnknownRecord(keywordSettings?.marketingCriteria)
    ? keywordSettings.marketingCriteria
    : {};
  const advertisingCriteria: UnknownRecord = isUnknownRecord(adsPolicy?.advertisingCriteria)
    ? adsPolicy.advertisingCriteria
    : {};
  return {
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
  };
}

export async function evaluateMarketingJobStrategyFit(args: {
  universeId: string;
  jobId: string;
  kind: StrategyFitKind;
  uid: string;
  requestedBy: string;
  actorUser?: unknown;
  modelProvider: unknown;
  modelName: unknown;
}) {
  if (!args.uid) return { ok: false as const, status: 401, error: "strategy_fit_user_required" };
  if (args.kind !== "marketing" && args.kind !== "advertising") {
    return { ok: false as const, status: 400, error: "strategy_fit_kind_invalid" };
  }
  const selectedModel = resolveModel(args.modelProvider, args.modelName);
  if (!selectedModel) return { ok: false as const, status: 400, error: "strategy_fit_model_not_allowed" };

  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) return { ok: false as const, status: 404, error: "job_not_found" };
  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  const [assets, context] = await Promise.all([
    listMarketingAssets({ jobId: args.jobId, limit: 300 }),
    getMarketingStrategyFitContext(args.universeId),
  ]);
  const selectedContext = context[args.kind];
  if (!selectedContext.ready) {
    return { ok: false as const, status: 409, error: `${args.kind}_strategy_required`, data: context };
  }

  const drafts = assets
    .filter((asset) => toSafeString(asset.kind) === "channel_draft" && SUPPORTED_CHANNELS.has(toSafeString(asset.channel) as SupportedChannel))
    .map((asset) => ({
      channel: toSafeString(asset.channel) as SupportedChannel,
      draft: asset.content as MarketingChannelDraft,
      asset,
    }));
  if (!drafts.length) return { ok: false as const, status: 409, error: "strategy_fit_drafts_required" };
  const requestDigest = createMarketingDraftDigest({
    strategy: selectedContext.criteria,
    drafts: Object.fromEntries(drafts.map(({ channel, draft }) => [channel, draft])),
    provider: selectedModel.provider,
    modelName: selectedModel.modelName,
  });
  const operationId = `marketing:${args.jobId}:${args.kind}:strategy-fit:${requestDigest}`;

  await assertSystemModelSelectableOrThrow({
    provider: selectedModel.provider,
    modelName: selectedModel.modelName,
    modality: "text",
    actor: { user: args.actorUser },
  });
  const needsTieredVariants =
    (selectedModel.provider === "google" && isGoogleProTextModel(selectedModel.modelName)) ||
    (selectedModel.provider === "xai" && isXaiLongContextTieredTextModel(selectedModel.modelName));
  await assertPricingPreflightOrThrow({
    provider: selectedModel.provider,
    modelName: selectedModel.modelName,
    modality: "text",
    kind: "token",
    variants: needsTieredVariants ? ["short", "long"] : [undefined],
  });
  const generationConfig = normalizeMarketingGenerationConfig({
    generationMode: "server_worker",
    modelProvider: selectedModel.provider,
    modelName: selectedModel.modelName,
    reviewMode: "review_required",
  });
  const promptInputEstimate = Math.max(
    1,
    Math.ceil(JSON.stringify({ strategy: selectedContext.criteria, drafts: drafts.map(({ channel, draft }) => ({ channel, draft })) }).length / 3),
  );
  await assertAIUsageBalanceOrThrow({
    uid: args.uid,
    app: "ai_marketing_strategy_fit",
    provider: selectedModel.provider,
    modelName: selectedModel.modelName,
    ...(selectedModel.provider === "xai" && isXaiLongContextTieredTextModel(selectedModel.modelName)
      ? { variant: "long" }
      : {}),
    usage: { text: { input: promptInputEstimate, output: 3200 } },
    modality: "text",
    meta: {
      route: "marketing/strategy-fit-preflight",
      universeId: args.universeId,
      jobId: args.jobId,
      kind: args.kind,
      operationId,
    },
  });

  const aiResult = await runMarketingBridge({
    task: "strategy_fit",
    actorUser: args.actorUser,
    fitKind: args.kind,
    strategy: selectedContext.criteria,
    drafts: drafts.map(({ channel, draft }) => ({ channel, draft })),
    generationConfig,
  });
  const payload = isUnknownRecord(aiResult.payload) ? aiResult.payload : {};
  const rawResults = Array.isArray(payload.results) ? payload.results.filter(isUnknownRecord) : [];
  const byChannel = new Map(rawResults.map((row) => [toSafeString(row.channel), row]));
  if (drafts.some(({ channel }) => !byChannel.has(channel))) {
    return { ok: false as const, status: 502, error: "strategy_fit_response_incomplete" };
  }

  const provider = aiResult.executionProvider as AiProviderType;
  const variant = provider === "google" && isGoogleProTextModel(aiResult.modelName)
    ? aiResult.usage.inputTokens > 200_000 ? "long" : "short"
    : provider === "xai" && isXaiLongContextTieredTextModel(aiResult.modelName)
      ? pickXaiPricingVariantByInputTokens(aiResult.usage.inputTokens)
      : undefined;
  const billingParams = {
    uid: args.uid,
    app: "ai_marketing_strategy_fit",
    provider,
    modelName: aiResult.modelName,
    variant,
    usage: { text: { input: aiResult.usage.inputTokens, output: aiResult.usage.outputTokens } },
    modality: "text" as const,
    meta: {
      route: "marketing/strategy-fit",
      universeId: args.universeId,
      jobId: args.jobId,
      kind: args.kind,
      source: "user_action",
      operationId,
    },
  };
  const billed = await billAIUsageOrThrow(billingParams);
  const coins = Number(billed.coins || 0);
  const evaluatedAt = new Date().toISOString();
  const resultKey = args.kind === "marketing" ? "marketingFit" : "adFit";
  const normalizedResults = drafts.map(({ channel }) => normalizeFitResult(byChannel.get(channel), channel, {
    kind: args.kind,
    strategyVersion: selectedContext.version,
    evaluatedAt,
    provider: aiResult.executionProvider,
    modelName: aiResult.modelName,
    coins,
  }));

  try {
    await Promise.all(drafts.map(async ({ channel, asset }, index) => {
      const validationAsset = assets.find(
        (candidate) => toSafeString(candidate.kind) === "validation_report" && toSafeString(candidate.channel) === channel,
      );
      const content = { ...(isUnknownRecord(validationAsset?.content) ? validationAsset.content : {}), [resultKey]: normalizedResults[index] };
      if (validationAsset?.assetId) {
        return updateMarketingAsset({
          assetId: toSafeString(validationAsset.assetId),
          set: { content, meta: { ...(validationAsset.meta || {}), strategyFitUpdatedAt: evaluatedAt } },
        });
      }
      return createMarketingAsset({
        jobId: args.jobId,
        stepId: toSafeString(asset.stepId),
        universeId: args.universeId,
        kind: "validation_report",
        channel: channel as MarketingChannel,
        title: `${channel} validation report`,
        mimeType: "application/json",
        content,
        meta: { provider: "ai_strategy_fit", strategyFitUpdatedAt: evaluatedAt },
      });
    }));
  } catch (error) {
    try {
      await refundAIUsageOrThrow({ ...billingParams, coins });
    } catch (refundError) {
      logger.error("마케팅 적합도 저장 실패 후 코인 환불 실패", { error, refundError, jobId: args.jobId });
    }
    throw error;
  }

  await Promise.all(normalizedResults.map((result) => createMarketingPublishLog({
    universeId: args.universeId,
    jobId: args.jobId,
    channel: result.channel as MarketingChannel,
    status: "draft",
    request: { action: "strategy_fit", kind: args.kind, strategyVersion: selectedContext.version },
    response: { result, usage: aiResult.usage, coins },
    completedBy: args.requestedBy,
    completedAt: new Date(),
  })));

  return { ok: true as const, data: { kind: args.kind, results: normalizedResults, usage: aiResult.usage, coins } };
}
