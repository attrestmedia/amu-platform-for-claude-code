import "server-only";

import type { ImageProviderType } from "types/ai";
import type { GameAssetType, IGameAssetDoc } from "types/game/asset";
import {
  WORLD_ASSET_CATEGORIES,
  WORLD_ASSET_CATEGORY_PRESETS,
  WORLD_ASSET_CATEGORY_TEMPLATE_MAP,
  WORLD_ASSET_PRICING_ROLE,
  type WorldAssetCategoryKey,
  type WorldAssetPresetType,
} from "consts/game/worldAssetCatalog";
import { WORLD_ASSET_IMAGE_PROMPT_TEMPLATES } from "consts/game/worldAssetTemplates";
import { IMAGE_STUDIO_NAMESPACE_KEY } from "consts/app";
import { getGameAssetByWorldAssetClientRequestId, createGameAsset, listGameAssets } from "libs/database/game";
import {
  getImageGenJobByClientRequestId,
  listImageAssets,
  getImageAssetByAssetId,
} from "libs/database/lab";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import { generateSaveAndBillImages, resolveImageProvider } from "libs/server-utils/api/imagePipeline";
import {
  createSystemPricingSnapshotRevision,
  getSystemPricingMaps,
  previewSystemPricingQuote,
} from "libs/server-utils/api/systemPricingControl";
import { assertPricingPreflightOrThrow } from "libs/services/aiUsageBilling";
import { claimProviderOperationOrThrow } from "libs/server-utils/api/providerOperationGuard";
import {
  filterImagePromptVariableDefaults,
  renderImagePrompt,
  resolveImagePromptNegative,
} from "utils/lab";
import { resolvePromptModelLock } from "utils/app/promptModelLock";
import { resolveMediaBillingStrategy } from "utils/payment";
import { estimateImageGenerationTokenUsage } from "utils/ai";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

const WORLD_ASSET_DRAFT_LIMIT = 100;
const WORLD_ASSET_CLIENT_REQUEST_MAX_LENGTH = 180;
const WORLD_ASSET_NAME_MAX_LENGTH = 80;
const WORLD_ASSET_OPERATION_PREFIX = "game-world-asset";

type WorldAssetError = Error & { errorCode?: string; status?: number; detail?: unknown };

export type WorldAssetGenerationQuote = {
  categoryKey: WorldAssetCategoryKey;
  presetKey: string;
  pricingRole: typeof WORLD_ASSET_PRICING_ROLE;
  quotedCoins: number;
  count: 1;
  provider: ImageProviderType;
  modelName: string;
  billingStrategy: "fixed" | "token" | "hybrid";
  pricingRevision: string;
  source: "system-pricing";
};

export type WorldAssetGenerationResult = {
  asset: IGameAssetDoc;
  quote: WorldAssetGenerationQuote;
  replayed: boolean;
};

function fail(message: string, errorCode: string, status = 400, detail?: unknown): never {
  const error = new Error(message) as WorldAssetError;
  error.errorCode = errorCode;
  error.status = status;
  error.detail = detail;
  throw error;
}

function safeText(value: unknown, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function resolveCategory(categoryKey: string) {
  const category = WORLD_ASSET_CATEGORIES.find((item) => item.key === categoryKey);
  if (!category) fail("월드 에셋 카테고리를 찾을 수 없습니다.", "WORLD_ASSET_CATEGORY_INVALID", 400);
  return categoryKey as WorldAssetCategoryKey;
}

function resolvePreset(categoryKey: WorldAssetCategoryKey, presetKey: string) {
  const presets = WORLD_ASSET_CATEGORY_PRESETS[categoryKey as keyof typeof WORLD_ASSET_CATEGORY_PRESETS];
  if (!presets) fail("이 카테고리는 아직 AI 생성을 지원하지 않습니다.", "WORLD_ASSET_CATEGORY_DEFERRED", 409);
  const preset = presets.find((item) => item.key === presetKey);
  if (!preset) fail("월드 에셋 프리셋을 찾을 수 없습니다.", "WORLD_ASSET_PRESET_INVALID", 400);
  return preset as WorldAssetPresetType;
}

function resolveTemplate(categoryKey: WorldAssetCategoryKey) {
  const mapping = WORLD_ASSET_CATEGORY_TEMPLATE_MAP[categoryKey];
  if (!mapping || "status" in mapping) {
    fail("이 카테고리는 아직 AI 생성을 지원하지 않습니다.", "WORLD_ASSET_CATEGORY_DEFERRED", 409);
  }
  const template = WORLD_ASSET_IMAGE_PROMPT_TEMPLATES.find((item) => item.key === mapping.templateKey);
  if (!template) fail("월드 에셋 생성 템플릿을 찾을 수 없습니다.", "WORLD_ASSET_TEMPLATE_NOT_FOUND", 503);
  return { mapping, template };
}

function resolveGenerationInput(categoryKey: WorldAssetCategoryKey, presetKey: string) {
  const preset = resolvePreset(categoryKey, presetKey);
  const { mapping, template } = resolveTemplate(categoryKey);
  const defaultParams = toUnknownRecord(template.defaultParams);
  const variables = {
    ...filterImagePromptVariableDefaults(defaultParams),
    ...preset.variables,
  };
  const negative = resolveImagePromptNegative(template.templateText, String(defaultParams.negative || ""));
  const prompt = renderImagePrompt(template.title, template.templateText, { negative, params: variables });
  const locked = resolvePromptModelLock(defaultParams);
  const modelName = safeText(locked?.modelName || defaultParams.modelName, 120);
  const provider = resolveImageProvider({
    bodyProvider: locked?.provider || defaultParams.provider,
    modelName,
  });
  if (!modelName) fail("월드 에셋 생성 모델이 설정되지 않았습니다.", "WORLD_ASSET_MODEL_NOT_CONFIGURED", 503);

  return {
    categoryKey,
    presetKey,
    preset,
    mapping,
    template,
    defaultParams,
    variables,
    negative,
    prompt,
    provider,
    modelName,
    size: safeText(defaultParams.size, 32) || "1K",
    aspectRatio: safeText(defaultParams.aspectRatio, 32) || "1:1",
  };
}

export async function getWorldAssetGenerationQuote(args: {
  categoryKey: string;
  presetKey: string;
}): Promise<WorldAssetGenerationQuote> {
  const categoryKey = resolveCategory(safeText(args.categoryKey, 32));
  const input = resolveGenerationInput(categoryKey, safeText(args.presetKey, 64));
  const pricing = await getSystemPricingMaps();
  const billingStrategy = resolveMediaBillingStrategy({
    provider: input.provider,
    modelName: input.modelName,
    modality: "image",
    variant: input.provider === "google" ? input.size : undefined,
    pricing,
  });

  if (billingStrategy === "token" || billingStrategy === "hybrid") {
    await assertPricingPreflightOrThrow({
      provider: input.provider,
      modelName: input.modelName,
      modality: "image",
      kind: "token",
    });
  }
  if (billingStrategy === "fixed" || billingStrategy === "hybrid") {
    await assertPricingPreflightOrThrow({
      provider: input.provider,
      modelName: input.modelName,
      modality: "image",
      kind: "fixed",
      fixedUnits: ["images"],
    });
  }

  const quote = await previewSystemPricingQuote({
    provider: input.provider,
    modelName: input.modelName,
    modality: "image",
    ...(billingStrategy === "token" || billingStrategy === "hybrid"
      ? {
          usage: estimateImageGenerationTokenUsage({
            promptChars: input.prompt.length,
            inputImageCount: 0,
            outputImageCount: 1,
          }),
        }
      : {}),
    ...(billingStrategy === "fixed" || billingStrategy === "hybrid" ? { fixed: { images: 1 } } : {}),
  });
  const quotedCoins = Number(quote.coins);
  if (!Number.isFinite(quotedCoins) || quotedCoins < 0) {
    fail("월드 에셋 생성 견적을 확인할 수 없습니다.", "WORLD_ASSET_PRICING_UNAVAILABLE", 503);
  }

  return {
    categoryKey,
    presetKey: input.presetKey,
    pricingRole: WORLD_ASSET_PRICING_ROLE,
    quotedCoins,
    count: 1,
    provider: input.provider,
    modelName: input.modelName,
    billingStrategy,
    pricingRevision: createSystemPricingSnapshotRevision(pricing),
    source: "system-pricing",
  };
}

function assertClientRequestId(value: unknown) {
  const clientRequestId = safeText(value, WORLD_ASSET_CLIENT_REQUEST_MAX_LENGTH);
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{7,179}$/.test(clientRequestId)) {
    fail("clientRequestId가 필요합니다.", "WORLD_ASSET_CLIENT_REQUEST_ID_INVALID", 400);
  }
  return clientRequestId;
}

async function assertDraftCapacity(uid: string) {
  const result = await listGameAssets({ createdBy: uid, status: "draft", page: 1, pageSize: 100 });
  const worldCount = result.items.filter((asset) =>
    ["stage-tileset", "prop-sheet", "building-sheet", "tile", "object"].includes(String(asset.assetType)),
  ).length;
  if (worldCount >= WORLD_ASSET_DRAFT_LIMIT) {
    fail("내 월드 에셋 보관 한도에 도달했습니다. 필요하지 않은 드래프트를 정리한 뒤 다시 시도해주세요.", "WORLD_ASSET_DRAFT_LIMIT_REACHED", 409, {
      limit: WORLD_ASSET_DRAFT_LIMIT,
    });
  }
}

async function materializeGameAsset(args: {
  uid: string;
  universeId: string;
  name?: string;
  clientRequestId: string;
  input: ReturnType<typeof resolveGenerationInput>;
  quote: WorldAssetGenerationQuote;
  imageAsset: UnknownRecord;
}) {
  const imageAssetId = safeText(args.imageAsset.assetId, 180);
  const imageStorage = toUnknownRecord(args.imageAsset.storage);
  const display = await resolveImageAssetDisplayUrl(args.imageAsset, { delivery: "signed" });
  const displayUrl = safeText(display.url || imageStorage.url, 2000);
  if (!imageAssetId || !displayUrl) {
    fail("생성된 이미지 저장 위치를 확인할 수 없습니다.", "WORLD_ASSET_STORAGE_UNAVAILABLE", 502);
  }

  const storage = {
    ...imageStorage,
    url: displayUrl,
  } as IGameAssetDoc["storage"];
  const created = await createGameAsset({
    name: safeText(args.name || args.input.preset.label.ko, WORLD_ASSET_NAME_MAX_LENGTH),
    assetType: args.input.mapping.assetType as GameAssetType,
    status: "draft",
    sourceType: "generated",
    sourceImageAssetId: imageAssetId,
    templateKey: args.input.mapping.templateKey,
    provider: safeText(args.imageAsset.provider, 64),
    modelName: safeText(args.imageAsset.modelName, 120),
    universeId: args.universeId,
    tags: [...(args.input.template.tags || []), args.input.presetKey],
    categories: [args.input.categoryKey],
    storage,
    meta: {
      worldAsset: {
        ownerScope: "user",
        pricingRole: WORLD_ASSET_PRICING_ROLE,
        clientRequestId: args.clientRequestId,
        imageAssetId,
        generationJobId: safeText(args.imageAsset.jobId, 180),
        generationCoins: args.quote.quotedCoins,
        projection: "isometric-2to1",
        sizeClass: args.input.mapping.sizeClass || "single-tile",
      },
    },
    createdBy: args.uid,
    updatedBy: args.uid,
  });
  return created as unknown as IGameAssetDoc;
}

async function recoverExistingGeneration(args: {
  uid: string;
  universeId: string;
  name?: string;
  clientRequestId: string;
  input: ReturnType<typeof resolveGenerationInput>;
  quote: WorldAssetGenerationQuote;
}) {
  const job = await getImageGenJobByClientRequestId({
    uid: args.uid,
    scope: "user",
    clientRequestId: args.clientRequestId,
  });
  if (!job) return null;
  const jobStatus = safeText(toUnknownRecord(job).status, 32);
  if (jobStatus === "queued" || jobStatus === "running") {
    fail("같은 월드 에셋 생성 요청이 이미 처리 중입니다.", "WORLD_ASSET_GENERATION_IN_PROGRESS", 409);
  }
  if (jobStatus !== "success" && jobStatus !== "partial") return null;

  const jobId = safeText(toUnknownRecord(job).jobId, 180);
  const imageAssets = await listImageAssets({ scope: "user", uid: args.uid, jobId, state: "active", limit: 1 });
  const imageAsset = imageAssets[0] as unknown as UnknownRecord | undefined;
  if (!imageAsset) fail("기존 생성 결과를 찾을 수 없습니다.", "WORLD_ASSET_RESULT_MISSING", 502);
  const asset = await materializeGameAsset({ ...args, imageAsset });
  return { asset, replayed: true };
}

export async function generateWorldAsset(args: {
  uid: string;
  universeId: string;
  categoryKey: string;
  presetKey: string;
  name?: string;
  clientRequestId: string;
}): Promise<WorldAssetGenerationResult> {
  const uid = safeText(args.uid, 180);
  const universeId = safeText(args.universeId, 180);
  if (!uid) fail("로그인이 필요합니다.", "UNAUTHORIZED", 401);
  if (!universeId) fail("universeId가 필요합니다.", "UNIVERSE_ID_REQUIRED", 400);
  const clientRequestId = assertClientRequestId(args.clientRequestId);
  const categoryKey = resolveCategory(safeText(args.categoryKey, 32));
  const input = resolveGenerationInput(categoryKey, safeText(args.presetKey, 64));
  const quote = await getWorldAssetGenerationQuote({ categoryKey, presetKey: input.presetKey });

  const existing = await getGameAssetByWorldAssetClientRequestId({ createdBy: uid, clientRequestId });
  if (existing) return { asset: existing as unknown as IGameAssetDoc, quote, replayed: true };

  const operationId = `${WORLD_ASSET_OPERATION_PREFIX}:${uid}:${clientRequestId}`;
  const lease = await claimProviderOperationOrThrow(operationId);
  if (lease.kind === "replay") {
    const replay = toUnknownRecord(lease.result);
    const asset = toUnknownRecord(replay.asset) as unknown as IGameAssetDoc;
    return { asset, quote: (replay.quote as WorldAssetGenerationQuote) || quote, replayed: true };
  }

  try {
    const recovered = await recoverExistingGeneration({
      uid,
      universeId,
      name: args.name,
      clientRequestId,
      input,
      quote,
    });
    if (recovered) {
      const result = { ...recovered, quote } satisfies WorldAssetGenerationResult;
      await lease.complete(result);
      return result;
    }

    await assertDraftCapacity(uid);
    const pricingMaps = await getSystemPricingMaps();
    const generated = await generateSaveAndBillImages({
      scope: "user",
      uid,
      provider: input.provider,
      modelName: input.modelName,
      prompt: input.prompt,
      n: 1,
      size: input.size,
      aspectRatio: input.aspectRatio,
      metaRoute: "game/world-assets:generate",
      appBillingKey: IMAGE_STUDIO_NAMESPACE_KEY,
      pricingMaps,
      templateKey: input.mapping.templateKey,
      metaExtra: {
        pricingRole: WORLD_ASSET_PRICING_ROLE,
        categoryKey,
        presetKey: input.presetKey,
        projection: "isometric-2to1",
      },
      requestMeta: {
        variables: input.variables,
        negative: input.negative,
        generationMode: "template",
        clientRequestId,
        templateTitle: input.template.title,
        source: { service: "play", surface: "forge-world" },
      },
      promptSnapshot: {
        title: input.template.title,
        templateText: input.template.templateText,
        defaultParams: input.defaultParams,
        inputPolicy: toUnknownRecord(input.template.inputPolicy),
        tags: input.template.tags,
        categories: input.template.categories,
        version: input.template.version,
        enabled: input.template.enabled,
        renderedPrompt: input.prompt,
        negative: input.negative,
        variables: input.variables,
      },
      visibility: "private",
    });
    const data = toUnknownRecord(toUnknownRecord(generated).data);
    const imageAssetId = safeText(Array.isArray(data.assetIds) ? data.assetIds[0] : "", 180);
    if (!imageAssetId) fail("월드 에셋 이미지 결과가 없습니다.", "WORLD_ASSET_IMAGE_RESULT_MISSING", 502);
    const imageAsset = await getImageAssetByAssetId(imageAssetId);
    if (!imageAsset) fail("월드 에셋 이미지 자산을 찾을 수 없습니다.", "WORLD_ASSET_IMAGE_ASSET_MISSING", 502);

    const asset = await materializeGameAsset({
      uid,
      universeId,
      name: args.name,
      clientRequestId,
      input,
      quote,
      imageAsset: imageAsset as unknown as UnknownRecord,
    });
    const result = { asset, quote, replayed: false } satisfies WorldAssetGenerationResult;
    await lease.complete(result);
    return result;
  } catch (error) {
    await lease.release();
    throw error;
  }
}
