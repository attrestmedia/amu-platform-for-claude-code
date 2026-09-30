import "server-only";

import { TEXT_MODEL_MAP } from "consts/ai";
import type { MarketingChannel } from "consts/marketing/queue";
import {
  createMarketingAsset,
  createMarketingPublishLog,
  getMarketingJobByJobId,
  listMarketingAssets,
  listMarketingJobSteps,
  updateMarketingAsset,
  updateMarketingJobStepStatus,
} from "libs/database/marketing";
import { runMarketingBridge } from "libs/marketing/bridge/runner";
import { validateMarketingChannelDraft } from "libs/marketing/bridge/schemaValidator";
import type { MarketingChannelDraft } from "libs/marketing/bridge/types";
import { normalizePlainTextSocialDraft } from "libs/marketing/format/socialPlainText";
import { normalizeMarketingGenerationConfig } from "libs/marketing/generationConfig";
import { validateDraftAgainstActiveTypoRules } from "libs/marketing/quality/koreanTypoRules";
import { runIndependentMarketingProofread } from "libs/marketing/quality/independentProofreadService";
import { createMarketingDraftDigest } from "libs/marketing/quality/marketingDraftDigest";
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

type SupportedManualChannel = "threads" | "instagram" | "linkedin" | "naver_blog";

const CORRECTABLE_FIELDS: Record<SupportedManualChannel, readonly string[]> = {
  threads: ["title", "text", "body", "cta", "hashtags"],
  instagram: ["title", "caption", "body", "text", "cta", "hashtags", "tags"],
  linkedin: ["title", "headline", "body", "text", "summary", "cta", "hashtags"],
  naver_blog: ["title", "summary", "body", "plainText", "html", "cta", "tags"],
};

function resolveProofreadModel(providerRaw: unknown, modelRaw: unknown) {
  const provider = toSafeString(providerRaw) as keyof typeof TEXT_MODEL_MAP;
  const modelName = toSafeString(modelRaw);
  const allowed = (TEXT_MODEL_MAP as Record<string, readonly string[]>)[provider] || [];
  return allowed.includes(modelName) ? { provider, modelName } : null;
}

function mergeCorrectedTextFields(
  channel: SupportedManualChannel,
  source: UnknownRecord,
  corrected: UnknownRecord,
) {
  const next: UnknownRecord = { ...source, channel };
  for (const field of CORRECTABLE_FIELDS[channel]) {
    if (Object.prototype.hasOwnProperty.call(corrected, field)) next[field] = corrected[field];
  }
  return normalizePlainTextSocialDraft(channel, next);
}

function findReviewStep(steps: UnknownRecord[], channel: SupportedManualChannel) {
  const stepKey =
    channel === "threads"
      ? "publish_threads"
      : channel === "instagram"
        ? "publish_instagram"
        : channel === "linkedin"
          ? "prepare_linkedin_draft"
          : "prepare_naver_draft";
  return steps.find((step) => toSafeString(step.stepKey) === stepKey && toSafeString(step.channel) === channel);
}

export async function checkMarketingChannelTypos(args: {
  universeId: string;
  channel: SupportedManualChannel;
  draft: UnknownRecord;
}) {
  const draft = normalizePlainTextSocialDraft(args.channel, { ...args.draft, channel: args.channel });
  const report = await validateDraftAgainstActiveTypoRules({
    universeId: args.universeId,
    channel: args.channel,
    draft,
  });
  return { draft, report };
}

export async function verifyMarketingChannelTypos(args: {
  universeId: string;
  jobId: string;
  channel: SupportedManualChannel;
  uid: string;
  requestedBy: string;
  actorUser?: unknown;
  draft: UnknownRecord;
}) {
  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) return { ok: false as const, status: 404, error: "job_not_found" };
  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }
  const draft = normalizePlainTextSocialDraft(args.channel, { ...args.draft, channel: args.channel });
  const assets = await listMarketingAssets({ jobId: args.jobId, channel: args.channel, limit: 200 });
  const validationAsset = assets.find((asset) => toSafeString(asset.kind) === "validation_report");
  if (!validationAsset?.assetId) return { ok: false as const, status: 404, error: "validation_asset_not_found" };
  try {
    const independentProofread = await runIndependentMarketingProofread({
      uid: args.uid,
      universeId: args.universeId,
      jobId: args.jobId,
      channel: args.channel,
      draft,
      requestedBy: args.requestedBy,
      actorUser: args.actorUser,
      source: "user_action",
    });
    const previous = isUnknownRecord(validationAsset.content) ? validationAsset.content : {};
    const previousChecks = isUnknownRecord(previous.checks) ? previous.checks : {};
    const staticCheck = isUnknownRecord(previousChecks.static) ? previousChecks.static : {};
    const typoCheck = isUnknownRecord(previousChecks.koreanTypoRules) ? previousChecks.koreanTypoRules : {};
    const valid = staticCheck.valid !== false && typoCheck.valid !== false && independentProofread.valid;
    const content = {
      ...previous,
      valid,
      issues: Array.from(new Set([
        ...(Array.isArray(previous.issues)
          ? previous.issues.map(toSafeString).filter((issue) => issue && issue !== "independent_proofread_required")
          : []),
        ...independentProofread.issues,
      ])),
      checks: { ...previousChecks, independentProofread },
    };
    await updateMarketingAsset({
      assetId: toSafeString(validationAsset.assetId),
      set: {
        content,
        meta: {
          ...(validationAsset.meta || {}),
          independentProofreadAt: independentProofread.checkedAt,
          independentProofreadModelName: independentProofread.modelName,
          independentProofreadBy: args.requestedBy,
        },
      },
    });
    return { ok: true as const, data: { validation: content, independentProofread } };
  } catch (error: unknown) {
    return {
      ok: false as const,
      status: 502,
      error: error instanceof Error ? error.message : "independent_proofread_unavailable",
    };
  }
}

export async function correctMarketingChannelTypos(args: {
  universeId: string;
  jobId: string;
  channel: SupportedManualChannel;
  uid: string;
  requestedBy: string;
  actorUser?: unknown;
  draft: UnknownRecord;
  manualInstruction?: string;
  modelProvider: unknown;
  modelName: unknown;
}) {
  const uid = toSafeString(args.uid);
  if (!uid) return { ok: false as const, status: 401, error: "proofread_user_required" };

  const selectedModel = resolveProofreadModel(args.modelProvider, args.modelName);
  if (!selectedModel) return { ok: false as const, status: 400, error: "proofread_model_not_allowed" };

  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) return { ok: false as const, status: 404, error: "job_not_found" };
  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  const [assets, steps] = await Promise.all([
    listMarketingAssets({ jobId: args.jobId, channel: args.channel, limit: 200 }),
    listMarketingJobSteps({ jobId: args.jobId, limit: 200 }),
  ]);
  const draftAsset = assets.find((asset) => toSafeString(asset.kind) === "channel_draft");
  if (!draftAsset?.assetId) return { ok: false as const, status: 404, error: "draft_asset_not_found" };
  const reviewStep = findReviewStep(steps as unknown as UnknownRecord[], args.channel);
  const stepId = toSafeString(reviewStep?.stepId || draftAsset.stepId);
  if (!stepId) return { ok: false as const, status: 404, error: "review_step_not_found" };

  const checked = await checkMarketingChannelTypos({
    universeId: args.universeId,
    channel: args.channel,
    draft: args.draft,
  });
  const manualInstruction = toSafeString(args.manualInstruction).slice(0, 1000);
  const requestDigest = createMarketingDraftDigest({
    draft: checked.draft,
    manualInstruction,
    provider: selectedModel.provider,
    modelName: selectedModel.modelName,
  });
  const operationId = `marketing:${args.jobId}:${args.channel}:proofread:${requestDigest}`;

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
  await assertAIUsageBalanceOrThrow({
    uid,
    app: "ai_marketing_proofread",
    provider: selectedModel.provider,
    modelName: selectedModel.modelName,
    ...(selectedModel.provider === "xai" && isXaiLongContextTieredTextModel(selectedModel.modelName)
      ? { variant: "long" }
      : {}),
    usage: {
      text: {
        input: Math.max(
          1,
          Math.ceil(JSON.stringify({ draft: checked.draft, findings: checked.report.findings, manualInstruction }).length / 3),
        ),
        output: 2400,
      },
    },
    modality: "text",
    meta: {
      route: "marketing/channel-proofread-preflight",
      universeId: args.universeId,
      jobId: args.jobId,
      channel: args.channel,
      operationId,
    },
  });

  const generationConfig = normalizeMarketingGenerationConfig({
    generationMode: "server_worker",
    modelProvider: selectedModel.provider,
    modelName: selectedModel.modelName,
    reviewMode: "review_required",
  });
  const aiResult = await runMarketingBridge({
    task: "proofread",
    actorUser: args.actorUser,
    channel: args.channel,
    draft: checked.draft as MarketingChannelDraft,
    findings: checked.report.findings,
    manualInstruction,
    generationConfig,
  });
  if (!isUnknownRecord(aiResult.payload)) {
    return { ok: false as const, status: 502, error: "proofread_response_invalid" };
  }

  const correctedDraft = mergeCorrectedTextFields(args.channel, checked.draft, aiResult.payload);
  const staticReport = validateMarketingChannelDraft(args.channel, correctedDraft);
  const typoReport = await validateDraftAgainstActiveTypoRules({
    universeId: args.universeId,
    channel: args.channel,
    draft: correctedDraft,
  });
  if (!staticReport.valid || !typoReport.valid) {
    return {
      ok: false as const,
      status: 422,
      error: "proofread_result_invalid",
      data: { staticReport, typoReport },
    };
  }

  const provider = aiResult.executionProvider as AiProviderType;
  const variant =
    provider === "google" && isGoogleProTextModel(aiResult.modelName)
      ? aiResult.usage.inputTokens > 200_000
        ? "long"
        : "short"
      : provider === "xai" && isXaiLongContextTieredTextModel(aiResult.modelName)
        ? pickXaiPricingVariantByInputTokens(aiResult.usage.inputTokens)
        : undefined;
  const billingParams = {
    uid,
    app: "ai_marketing_proofread",
    provider,
    modelName: aiResult.modelName,
    variant,
    usage: {
      text: {
        input: aiResult.usage.inputTokens,
        output: aiResult.usage.outputTokens,
      },
    },
    modality: "text" as const,
    meta: {
      route: "marketing/channel-proofread",
      universeId: args.universeId,
      jobId: args.jobId,
      channel: args.channel,
      source: "user_action",
      operationId,
    },
  };
  const billed = await billAIUsageOrThrow(billingParams);
  const billedCoins = Number(billed.coins || 0);

  const correctedAt = new Date().toISOString();
  try {
    const updatedDraft = await updateMarketingAsset({
      assetId: toSafeString(draftAsset.assetId),
      set: {
        content: correctedDraft,
        meta: {
          ...(draftAsset.meta || {}),
          proofreadBy: args.requestedBy,
          proofreadAt: correctedAt,
          proofreadProvider: aiResult.executionProvider,
          proofreadModelName: aiResult.modelName,
          proofreadCoins: billedCoins,
        },
      },
    });
    if (!updatedDraft) throw new Error("proofread_draft_update_failed");
  } catch (error) {
    try {
      await refundAIUsageOrThrow({ ...billingParams, coins: billedCoins });
    } catch (refundError) {
      logger.error("오탈자 교정 draft 저장 실패 후 코인 환불 실패", { error, refundError, jobId: args.jobId });
    }
    throw error;
  }

  const validationReport = {
    channel: args.channel,
    valid: true,
    summary: "AI 오탈자 교정본이 기본 스키마와 활성 오탈자 규칙 검수를 통과했습니다.",
    issues: [],
    warnings: typoReport.warnings,
    score: Math.min(Number(staticReport.score || 100), Number(typoReport.score || 100)),
    checks: {
      static: staticReport,
      koreanTypoRules: typoReport,
      independentProofread: { status: "stale", valid: false, reason: "draft_corrected_after_check" },
    },
  };
  const validationAsset = assets.find((asset) => toSafeString(asset.kind) === "validation_report");

  try {
    const validationAssetId = validationAsset?.assetId
      ? toSafeString(validationAsset.assetId)
      : toSafeString(
          (
            await createMarketingAsset({
              jobId: args.jobId,
              stepId,
              universeId: args.universeId,
              kind: "validation_report",
              channel: args.channel,
              title: `${args.channel} validation report`,
              mimeType: "application/json",
              content: validationReport,
              meta: { provider: "ai_proofread", createdAt: correctedAt },
            })
          ).assetId,
        );
    if (validationAsset?.assetId) {
      await updateMarketingAsset({
        assetId: validationAssetId,
        set: {
          content: validationReport,
          meta: {
            ...(validationAsset.meta || {}),
            provider: "ai_proofread",
            validatedBy: args.requestedBy,
            validatedAt: correctedAt,
            modelName: aiResult.modelName,
          },
        },
      });
    }

    await Promise.all([
      createMarketingPublishLog({
        universeId: args.universeId,
        jobId: args.jobId,
        stepId,
        channel: args.channel as MarketingChannel,
        status: "draft",
        targetRef: {},
        request: {
          action: "proofread_draft",
          findings: checked.report.findings,
          manualInstruction,
          modelProvider: aiResult.executionProvider,
          modelName: aiResult.modelName,
        },
        response: { usage: aiResult.usage, coins: billedCoins, validation: validationReport },
        completedBy: args.requestedBy,
        completedAt: new Date(),
      }),
      updateMarketingJobStepStatus({
        stepId,
        status: "waiting_review",
        meta: {
          ...(reviewStep?.meta || {}),
          proofreadBy: args.requestedBy,
          proofreadAt: correctedAt,
          proofreadModelName: aiResult.modelName,
        },
        outputRef: { assetIds: [toSafeString(draftAsset.assetId), validationAssetId] },
      }),
    ]);
  } catch (error) {
    logger.error("오탈자 교정본의 검증 자산 또는 감사 로그 갱신 실패", { error, jobId: args.jobId });
  }

  return {
    ok: true as const,
    data: { draft: correctedDraft, validation: validationReport, usage: aiResult.usage, coins: billedCoins },
  };
}
