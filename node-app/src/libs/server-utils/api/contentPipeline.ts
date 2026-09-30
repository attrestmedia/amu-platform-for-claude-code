import "server-only";
import crypto from "crypto";
import type { TextProviderType, UserScopeType, AiProviderType } from "types/ai";
import type { BaseImageType, PromptVisibilityType } from "types/app";
import { AI_GEN_CONTENT_LIMIT } from "consts/ai";
import {
  inferTextProviderFromModelNameRaw,
  isGoogleProTextModel,
  isXaiLongContextTieredTextModel,
  isOpenAIGpt6TextModel,
  normalizeTextProvider as normalizeTextProviderShared,
  pickXaiPricingVariantByInputTokens,
  pickOpenAIGpt6PricingVariantByInputTokens,
  resolveTextOutputBudget,
} from "utils/ai/providerHelper";
import { callTextByProvider, resolveTextModelNameFor } from "./apiHelper";
import {
  assertAIUsageBalanceOrThrow,
  assertCommerceAIUsageBalanceOrThrow,
  assertPricingPreflightOrThrow,
  billAIUsageOrThrow,
  billCommerceAIUsageOrThrow,
} from "libs/services/aiUsageBilling";
import { logger } from "utils/log";
import {
  assertSystemModelEnabledOrThrow,
  assertSystemModelSupportsImageInputOrThrow,
  listSystemModelCatalog,
  resolveSystemDefaultModelName,
} from "libs/server-utils/api/systemModelControl";
import {
  claimContentGenJob,
  createContentAssets,
  createContentGenJob,
  listContentAssets,
  markContentGenJobFailed,
  markContentGenJobRunning,
  markContentGenJobSuccess,
} from "libs/database/lab";
import { completeAiCostTrace, createAiCostTrace } from "libs/database/ai";
import { calculateProviderCogs } from "consts/ai/providerCost";
import {
  AI_ROUTING_POLICY_VERSION,
  isAiRoutingRolloutEnabled,
  resolveAiRoutingDecision,
} from "consts/ai/modelRoutingPolicy";
import {
  AI_COST_TRACE_TASK_TYPE,
  AI_COST_TRACE_WORKFLOW,
  buildAiCostTraceCompletion,
  buildAiCostTraceDraft,
  EMPTY_AI_COST_TRACE_TOKENS,
  normalizeAiCostTraceTokens,
} from "libs/server-utils/ai/aiCostTraceContract";
import { toUnknownRecord, toErrorLike, type UnknownRecord } from "utils/common";
import type { StudioGenerationSourceServiceType } from "types/app";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process normalizeTextProvider 중심 처리  입력 검증  핵심 로직  결과 포맷팅  프롬프트 렌더링/정책 적용 포함
 * @domain ai-content
 * @scope global
 */

// errorCode/status를 부착할 수 있는 Error 확장 타입
type CodedError = Error & { errorCode?: string; status?: number };

function codedError(message: string, errorCode: string, status = 400): CodedError {
  const err: CodedError = new Error(message);
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

export function normalizeTextProvider(raw: unknown): TextProviderType | "" {
  return normalizeTextProviderShared(raw);
}

export function inferTextProviderFromModelName(modelName?: string): TextProviderType {
  return inferTextProviderFromModelNameRaw(modelName) || "google";
}

export function resolveTextProvider(args: {
  bodyProvider?: unknown;
  modelName?: string;
  forcedProvider?: TextProviderType;
}): TextProviderType {
  const forced = normalizeTextProvider(args.forcedProvider);
  if (forced) return forced;

  const p = normalizeTextProvider(args.bodyProvider);
  if (p) return p;

  return inferTextProviderFromModelName(args.modelName);
}

function validatePromptOrThrow(prompt: unknown) {
  const p = String(prompt || "").trim();
  if (!p) throw codedError("prompt_required", "INVALID_INPUT", 400);
}

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

async function finalizePilotTrace(
  traceId: string,
  completion: Parameters<typeof completeAiCostTrace>[0]["completion"],
) {
  if (!traceId) return;
  try {
    await completeAiCostTrace({ traceId, completion });
  } catch (error) {
    // 비용 trace 장애가 사용자 생성·과금 결과를 바꾸지 않도록 관측 경로만 경고한다.
    logger.warn("[aiCostTrace] trace completion failed", { traceId, error });
  }
}

const STUDIO_SOURCE_SERVICES: readonly StudioGenerationSourceServiceType[] = [
  "gen-studio", "tutors", "store", "play", "mini-app", "marketing", "admin", "agent", "upload", "unknown",
];

function toSourceService(value: unknown): StudioGenerationSourceServiceType {
  const source = toSafeString(value) as StudioGenerationSourceServiceType;
  return STUDIO_SOURCE_SERVICES.includes(source) ? source : "unknown";
}

function toGenerationMode(raw: unknown) {
  return toSafeString(raw).toLowerCase() === "template" ? "template" : "custom";
}

function toVisibility(raw: unknown): PromptVisibilityType {
  return toSafeString(raw).toLowerCase() === "public" ? "public" : "private";
}

function normalizeContentBaseImages(baseImages?: BaseImageType[]) {
  return Array.isArray(baseImages)
    ? baseImages
        .filter((image) => Boolean(image?.data))
        .map((image) => ({
          mimeType: toSafeString(image.mimeType) || "image/png",
          data: toSafeString(image.data),
        }))
    : [];
}

// createContentAssets가 반환하는 asset 항목(런타임 shape를 좁히기 위한 로컬 타입)
type ContentAssetLike = {
  assetId?: unknown;
  templateKey?: unknown;
  visibility?: unknown;
  createdAt?: unknown;
  provider?: unknown;
  modelName?: unknown;
  generationMode?: unknown;
  extraPrompt?: unknown;
  state?: unknown;
  outputIndex?: unknown;
  content?: { text?: unknown; chars?: unknown; bytes?: unknown };
};

export async function generateAndBillContent(params: {
  scope: UserScopeType;
  uid?: string;
  universeId?: string;

  provider: TextProviderType;
  modelName?: string;
  /** Trusted server actor; absent for userless workers and agent-key requests. */
  actorUser?: unknown;

  prompt: string;
  n?: number;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
  baseImages?: BaseImageType[];
  visibility?: PromptVisibilityType;

  metaRoute: string;
  appBillingKey: string;
  costTracePilot?: boolean;
  metaExtra?: UnknownRecord;
  // queue worker가 미리 만들어둔 Job을 재사용할 때 전달한다(신규 생성 대신 running 전이).
  existingJobId?: string;
}) {
  const {
    scope,
    uid,
    universeId,
    provider: requestedProvider,
    modelName: requestedModelName,
    actorUser,
    prompt,
    n,
    temperature,
    maxOutputTokens,
    thinkingBudget,
    metaRoute,
    appBillingKey,
    costTracePilot,
    metaExtra,
    existingJobId,
  } = params;

  validatePromptOrThrow(prompt);

  let provider = requestedProvider;
  let modelName = requestedModelName;
  let routingDecision = "baseline";
  const routingRole = toSafeString(metaExtra?.routingRole) || "worker";
  if (!String(modelName || "").trim() && isAiRoutingRolloutEnabled() && routingRole === "worker") {
    const baselineModel = await resolveSystemDefaultModelName({ provider, modality: "text" });
    const catalog = await listSystemModelCatalog();
    const catalogKeys = new Set(
      catalog
        .filter((item) => item.modality === "text" && item.enabled && !item.adminOnly && !item.deprecated)
        .map((item) => item.key),
    );
    const decision = resolveAiRoutingDecision({
      service: "gen-studio",
      role: "worker",
      requestId: toSafeString(metaExtra?.clientRequestId) || toSafeString(existingJobId) || "unbound",
      catalogKeys,
      baseline: {
        provider,
        modelName: baselineModel,
        catalogKey: `${provider}:${baselineModel}:text`,
      },
      rolloutEnabled: true,
      benchmarkCases: Number(process.env.AI_ROUTING_BENCHMARK_CASES || 0),
    });
    routingDecision = decision.route;
    if (decision.route === "candidate" && decision.selected.provider && decision.selected.modelName) {
      provider = decision.selected.provider as TextProviderType;
      modelName = decision.selected.modelName;
    }
  }

  const fallbackModel = !String(modelName || "").trim()
    ? await resolveSystemDefaultModelName({ provider, modality: "text" })
    : "";
  const useModel = await resolveTextModelNameFor(provider, String(modelName || fallbackModel), actorUser);
  const effectiveMaxOutputTokens = resolveTextOutputBudget(provider, useModel, maxOutputTokens);
  await assertSystemModelEnabledOrThrow({
    provider,
    modelName: useModel,
    modality: "text",
  });
  const take = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(n || 1)));
  const promptRaw = String(prompt || "");
  const baseImages = normalizeContentBaseImages(params.baseImages);
  if (baseImages.length > 0) {
    await assertSystemModelSupportsImageInputOrThrow({ provider, modelName: useModel });
  }
  const promptHash = promptRaw ? crypto.createHash("sha256").update(promptRaw, "utf8").digest("hex") : "";
  const generationMode = toGenerationMode(metaExtra?.generationMode);
  const templateKey = toSafeString(metaExtra?.templateKey);
  const extraPrompt = toSafeString(metaExtra?.extraPrompt);
  const visibility = toVisibility(params.visibility);
  const isUserScope = scope === "user";
  const safeUid = toSafeString(uid);
  const safeUniverseId = toSafeString(universeId);

  let contentJobId = "";
  let savedAssets: ContentAssetLike[] = [];
  let rootTraceId = "";
  let rootTraceStartedAt: Date | null = null;
  let providerTraceId = "";
  let providerTraceStartedAt: Date | null = null;
  let providerTraceFinished = false;
  let traceUsage = { ...EMPTY_AI_COST_TRACE_TOKENS };
  let traceCoinCharged = 0;
  const sourceRecord = toUnknownRecord(metaExtra?.source);

  // pricing preflight (token)
  const needsShortLongVariants =
    (provider === "google" && isGoogleProTextModel(useModel)) ||
    (provider === "xai" && isXaiLongContextTieredTextModel(useModel)) ||
    (provider === "openai" && isOpenAIGpt6TextModel(useModel));

  await assertPricingPreflightOrThrow({
    provider,
    modelName: useModel,
    modality: "text",
    kind: "token",
    variants: needsShortLongVariants ? ["short", "long"] : [undefined],
  });

  const existingJobIdSafe = toSafeString(existingJobId);
  const jobRequest = {
    kind: toSafeString(metaExtra?.kind),
    clientRequestId: toSafeString(metaExtra?.clientRequestId),
    templateKey,
    templateTitle: toSafeString(metaExtra?.templateTitle),
    generationMode,
    promptBytes: Buffer.byteLength(promptRaw, "utf8"),
    promptHash,
    variables: (metaExtra?.variables as UnknownRecord | undefined) || {},
    extraPrompt,
    platform: toSafeString(metaExtra?.platform),
    language: toSafeString(metaExtra?.language),
    length: toSafeString(metaExtra?.length),
    outputFormat: toSafeString(metaExtra?.outputFormat),
    baseImageCount: baseImages.length,
    visibility,
    n: take,
    sourceService: toSourceService(toUnknownRecord(metaExtra?.source).service),
    sourceSurface: toSafeString(toUnknownRecord(metaExtra?.source).surface) || "unknown",
  };

  const clientRequestIdSafe = toSafeString(metaExtra?.clientRequestId);
  const isCommerceProductContentRequest = toSafeString(metaExtra?.kind) === "commerce-product-content";
  if (!existingJobIdSafe && clientRequestIdSafe && isCommerceProductContentRequest) {
    const claim = await claimContentGenJob({
      scope,
      uid: safeUid,
      universeId: safeUniverseId,
      createdBy: safeUid,
      provider,
      modelName: useModel,
      clientRequestId: clientRequestIdSafe,
      request: jobRequest,
      deletePolicy: "soft",
    });

    if (!claim.owner) {
      const reusedStatus = claim.job.status === "success" || claim.job.status === "partial";
      if (reusedStatus) {
        const replayAssets = (await listContentAssets({
          jobId: toSafeString(claim.job.jobId),
          state: "active",
          limit: AI_GEN_CONTENT_LIMIT,
        })) as ContentAssetLike[];
        if (!replayAssets.length) {
          throw codedError("content_replay_assets_unavailable", "CONTENT_REPLAY_UNAVAILABLE", 503);
        }

        const orderedAssets = [...replayAssets].sort(
          (a, b) => Number(a.outputIndex || 0) - Number(b.outputIndex || 0),
        );
        return {
          ok: true,
          data: {
            contents: orderedAssets.map((asset) => String(asset.content?.text || "")).filter(Boolean),
            assetIds: orderedAssets.map((asset) => String(asset.assetId || "")).filter(Boolean),
            assets: orderedAssets.map((asset) => ({
              assetId: String(asset.assetId || ""),
              text: String(asset.content?.text || ""),
              textPreview: String(asset.content?.text || "").slice(0, 180),
              templateKey: String(asset.templateKey || ""),
              visibility: String(asset.visibility || visibility),
              createdAt: asset.createdAt || null,
              provider: String(asset.provider || claim.job.provider || provider),
              modelName: String(asset.modelName || claim.job.modelName || useModel),
              generationMode: String(asset.generationMode || generationMode),
              extraPrompt: String(asset.extraPrompt || extraPrompt),
              state: String(asset.state || "active"),
              outputIndex: Number(asset.outputIndex || 0),
              content: {
                chars: Number(asset.content?.chars || 0),
                bytes: Number(asset.content?.bytes || 0),
              },
            })),
            coins: Number(claim.job.billing?.coins || 0),
            provider: String(claim.job.provider || provider),
            modelName: String(claim.job.modelName || useModel),
            reused: true,
          },
        };
      }

      throw codedError("content_generation_in_progress", "CONTENT_GENERATION_IN_PROGRESS", 409);
    }
    contentJobId = toSafeString(claim.job.jobId);
  }

  try {
    if (!contentJobId) {
      const job = existingJobIdSafe
        ? await markContentGenJobRunning({
            jobId: existingJobIdSafe,
            provider,
            modelName: useModel,
            request: jobRequest,
          })
        : await createContentGenJob({
            scope,
            uid: safeUid,
            universeId: safeUniverseId,
            createdBy: safeUid,
            provider,
            modelName: useModel,
            request: jobRequest,
            status: "running",
            deletePolicy: "soft",
          });
      contentJobId = toSafeString(toUnknownRecord(job).jobId) || existingJobIdSafe;
    }
  } catch (error) {
    contentJobId = existingJobIdSafe;
    logger.warn("콘텐츠 생성 Job 저장 실패(계속 진행)", { scope, provider, modelName: useModel, error });
  }

  // AIR-600 파일럿은 queue worker가 명시적으로 opt-in한 Gen Studio content workflow만 기록한다.
  if (costTracePilot) {
    const rootTrace = buildAiCostTraceDraft({
      traceRole: "workflow",
      service: toSourceService(sourceRecord.service),
      workflow: AI_COST_TRACE_WORKFLOW,
      workflowRunId: contentJobId || toSafeString(metaExtra?.clientRequestId) || "unbound",
      taskType: AI_COST_TRACE_TASK_TYPE,
      provider,
      model: useModel,
      metadata: {
        ...(contentJobId ? { jobId: contentJobId } : {}),
        ...(contentJobId ? { operationId: `content:${contentJobId}:generate` } : {}),
        sourceService: toSourceService(sourceRecord.service),
      },
    });
    rootTraceStartedAt = rootTrace.startedAt;
    try {
      await createAiCostTrace(rootTrace);
      rootTraceId = rootTrace.traceId;
    } catch (error) {
      logger.warn("[aiCostTrace] root trace creation failed", { workflow: AI_COST_TRACE_WORKFLOW, error });
    }
  }

  try {
    const estimatedInputTokens = Math.max(1, Math.ceil(promptRaw.length / 3));
    const estimatedOutputTokens = Math.max(1, Number(effectiveMaxOutputTokens || 4096)) * take;
    const estimatedVariant =
      provider === "google" && isGoogleProTextModel(useModel)
        ? estimatedInputTokens > 200_000
          ? "long"
          : "short"
        : provider === "xai" && isXaiLongContextTieredTextModel(useModel)
          ? "long"
          : provider === "openai" && isOpenAIGpt6TextModel(useModel)
            ? "long"
          : undefined;
    const operationId = contentJobId ? `content:${contentJobId}:generate` : undefined;
    const balanceParams = {
      app: appBillingKey,
      provider: provider as AiProviderType,
      modelName: useModel,
      variant: estimatedVariant,
      usage: { text: { input: estimatedInputTokens, output: estimatedOutputTokens } },
      modality: "text" as const,
      meta: {
        route: `${metaRoute}:preflight`,
        ...(operationId ? { operationId } : {}),
      },
    };
    if (isUserScope) {
      await assertAIUsageBalanceOrThrow({ uid: safeUid, ...balanceParams });
    } else {
      await assertCommerceAIUsageBalanceOrThrow({ universeId: safeUniverseId, ...balanceParams });
    }

    if (rootTraceId && rootTraceStartedAt) {
      const providerTrace = buildAiCostTraceDraft({
        parentTraceId: rootTraceId,
        rootTraceId,
        traceRole: "provider_call",
        service: toSourceService(sourceRecord.service),
        workflow: AI_COST_TRACE_WORKFLOW,
        workflowRunId: contentJobId || rootTraceId,
        taskType: AI_COST_TRACE_TASK_TYPE,
        provider,
        model: useModel,
        metadata: {
          ...(contentJobId ? { jobId: contentJobId } : {}),
          ...(contentJobId ? { operationId: `content:${contentJobId}:generate` } : {}),
          sourceService: toSourceService(sourceRecord.service),
        },
      });
      providerTraceStartedAt = providerTrace.startedAt;
      try {
        await createAiCostTrace(providerTrace);
        providerTraceId = providerTrace.traceId;
      } catch (error) {
        logger.warn("[aiCostTrace] provider trace creation failed", { rootTraceId, error });
      }
    }

    let out: Awaited<ReturnType<typeof callTextByProvider>>;
    try {
      out = await callTextByProvider(provider, useModel, promptRaw, {
        n: take,
        temperature,
        maxOutputTokens: effectiveMaxOutputTokens,
        thinkingBudget,
        baseImages,
        actorUser,
      });
      traceUsage = normalizeAiCostTraceTokens(out.usageTotal);
      if (providerTraceId && providerTraceStartedAt) {
        await finalizePilotTrace(
          providerTraceId,
          buildAiCostTraceCompletion({
            startedAt: providerTraceStartedAt,
            provider: provider,
            model: out.modelName,
            tokens: traceUsage,
            providerCost: calculateProviderCogs({
              provider,
              modelName: out.modelName,
              variant:
                provider === "xai" && isXaiLongContextTieredTextModel(out.modelName)
                  ? pickXaiPricingVariantByInputTokens(traceUsage.input)
                  : provider === "openai" && isOpenAIGpt6TextModel(out.modelName)
                    ? pickOpenAIGpt6PricingVariantByInputTokens(traceUsage.input)
                  : undefined,
              usage: { text: { input: traceUsage.input, output: traceUsage.output } },
            }),
            resultStatus: out.outputs.length < take ? "partial" : "success",
          }),
        );
        providerTraceFinished = true;
      }
    } catch (error) {
      if (providerTraceId && providerTraceStartedAt && !providerTraceFinished) {
        const errorMeta = toErrorLike(error);
        await finalizePilotTrace(
          providerTraceId,
          buildAiCostTraceCompletion({
            startedAt: providerTraceStartedAt,
            tokens: traceUsage,
            resultStatus: "failed",
            errorCode: toSafeString(errorMeta.errorCode || errorMeta.code),
          }),
        );
        providerTraceFinished = true;
      }
      throw error;
    }

    // Google Pro는 출력별 호출량, xAI는 단일 요청의 usage.input 기준으로 short/long을 고른다.
    const perCallIn = out.outputs.length ? Math.ceil(out.usageTotal.input / out.outputs.length) : out.usageTotal.input;
    const variant =
      provider === "google" && isGoogleProTextModel(out.modelName)
        ? perCallIn > 200_000
          ? "long"
          : "short"
        : provider === "xai" && isXaiLongContextTieredTextModel(out.modelName)
          ? pickXaiPricingVariantByInputTokens(out.usageTotal.input)
          : provider === "openai" && isOpenAIGpt6TextModel(out.modelName)
            ? pickOpenAIGpt6PricingVariantByInputTokens(out.usageTotal.input)
        : undefined;

    const safeMetaExtra: UnknownRecord = { ...(metaExtra || {}) };
    delete safeMetaExtra.source;
    const meta = {
      route: metaRoute,
      ...(scope === "universe" ? { universeId: safeUniverseId } : {}),
      provider,
      modelName: out.modelName,
      variants: out.outputs.length,
      tokenUsage: out.usageTotal,
      baseImageCount: baseImages.length,
      visibility,
      source: "user_action",
      sourceService: toSourceService(sourceRecord.service),
      sourceSurface: toSafeString(sourceRecord.surface) || "unknown",
      routingPolicyVersion: AI_ROUTING_POLICY_VERSION,
      routingDecision,
      ...safeMetaExtra,
      ...(contentJobId ? { operationId: `content:${contentJobId}:generate` } : {}),
      ...(rootTraceId ? { costTraceRootId: rootTraceId } : {}),
      ...(providerTraceId ? { costTraceChildId: providerTraceId } : {}),
    };

    const billed = isUserScope
      ? await billAIUsageOrThrow({
          uid: safeUid,
          app: appBillingKey,
          provider: provider as AiProviderType,
          modelName: out.modelName,
          variant,
          usage: { text: { input: out.usageTotal.input, output: out.usageTotal.output } },
          modality: "text",
          meta,
        })
      : await billCommerceAIUsageOrThrow({
          universeId: safeUniverseId,
          app: appBillingKey,
          provider: provider as AiProviderType,
          modelName: out.modelName,
          variant,
          usage: { text: { input: out.usageTotal.input, output: out.usageTotal.output } },
          modality: "text",
          meta,
      });
    traceCoinCharged = Number(billed?.coins || 0);

    if (contentJobId) {
      try {
        savedAssets = (await createContentAssets({
          jobId: contentJobId,
          scope,
          uid: safeUid,
          universeId: safeUniverseId,
          contents: out.outputs,
          provider,
          modelName: out.modelName,
          templateKey,
          generationMode,
          extraPrompt,
          visibility,
          deletePolicy: "soft",
          sourceService: toSourceService(sourceRecord.service),
          sourceSurface: toSafeString(sourceRecord.surface) || "unknown",
        })) as ContentAssetLike[];
        await markContentGenJobSuccess({
          jobId: contentJobId,
          outputCount: out.outputs.length,
          billing: {
            coins: billed?.coins ?? 0,
            tokenUsage: out.usageTotal,
            pricingKey: appBillingKey,
          },
        });
      } catch (error) {
        logger.warn("콘텐츠 자산 저장 실패(응답은 성공 유지)", {
          scope,
          contentJobId,
          outputCount: out.outputs.length,
          error,
        });
      }
    }

    if (rootTraceId && rootTraceStartedAt) {
      await finalizePilotTrace(
        rootTraceId,
        buildAiCostTraceCompletion({
          startedAt: rootTraceStartedAt,
          provider,
          model: out.modelName,
          tokens: traceUsage,
          providerCost: calculateProviderCogs({
            provider,
            modelName: out.modelName,
            variant:
              provider === "xai" && isXaiLongContextTieredTextModel(out.modelName)
                ? variant
                : provider === "openai" && isOpenAIGpt6TextModel(out.modelName)
                  ? variant
                : undefined,
            usage: { text: { input: traceUsage.input, output: traceUsage.output } },
          }),
          coinCharged: traceCoinCharged,
          resultStatus: out.outputs.length < take ? "partial" : "success",
        }),
      );
    }

    return {
      ok: true,
      data: {
        contents: out.outputs,
        assetIds: savedAssets.map((asset) => String(asset?.assetId || "")).filter(Boolean),
        assets: savedAssets.map((asset) => ({
          assetId: String(asset?.assetId || ""),
          text: String(asset?.content?.text || ""),
          textPreview: String(asset?.content?.text || "").slice(0, 180),
          templateKey: String(asset?.templateKey || ""),
          visibility: String(asset?.visibility || visibility),
          createdAt: asset?.createdAt || null,
          provider: String(asset?.provider || provider),
          modelName: String(asset?.modelName || out.modelName),
          generationMode: String(asset?.generationMode || generationMode),
          extraPrompt: String(asset?.extraPrompt || extraPrompt),
          state: String(asset?.state || "active"),
          outputIndex: Number(asset?.outputIndex || 0),
          content: {
            chars: Number(asset?.content?.chars || 0),
            bytes: Number(asset?.content?.bytes || 0),
          },
        })),
        coins: billed.coins ?? 0,
        provider,
        modelName: out.modelName,
      },
    };
  } catch (error: unknown) {
    if (contentJobId) {
      try {
        const meta = toErrorLike(error);
        await markContentGenJobFailed({
          jobId: contentJobId,
          reason: toSafeString(meta.message || "generation_failed"),
          code: toSafeString(meta.errorCode || meta.code),
        });
      } catch (markError) {
        logger.warn("콘텐츠 생성 Job 실패 상태 저장 실패", { contentJobId, markError });
      }
    }
    if (rootTraceId && rootTraceStartedAt) {
      const errorMeta = toErrorLike(error);
      await finalizePilotTrace(
        rootTraceId,
        buildAiCostTraceCompletion({
          startedAt: rootTraceStartedAt,
          tokens: traceUsage,
          providerCost: calculateProviderCogs({
            provider,
            modelName: useModel,
            variant:
              ((provider === "xai" && isXaiLongContextTieredTextModel(useModel)) ||
                (provider === "openai" && isOpenAIGpt6TextModel(useModel)))
                ? "long"
                : undefined,
            usage: { text: { input: traceUsage.input, output: traceUsage.output } },
          }),
          coinCharged: traceCoinCharged,
          resultStatus: "failed",
          errorCode: toSafeString(errorMeta.errorCode || errorMeta.code),
        }),
      );
    }
    throw error;
  }
}
