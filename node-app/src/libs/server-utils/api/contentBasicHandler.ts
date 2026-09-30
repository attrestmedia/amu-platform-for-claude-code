import "server-only";
import type { TextProviderType } from "types/ai";
import type { BaseImageType, PromptGenType, PromptVisibilityType, StudioGenerationSourceType } from "types/app";
import { getContentPromptByKey } from "libs/database/lab";
import { resolveUserContentPromptDoc } from "./apiSafetyHelper";
import { renderContentPrompt } from "utils/lab";
import { generateAndBillContent, resolveTextProvider } from "./contentPipeline";
import { getRequiredPromptVariableError } from "./promptTemplateValidation";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process handleUserContentBasic 중심 처리  입력 검증  핵심 로직  결과 포맷팅  프롬프트 렌더링/정책 적용 포함
 * @domain ai-content
 * @scope global
 */

export type ContentHandlerOptsType = {
  forcedProvider?: TextProviderType;
  routeMeta?: string;
  appBillingKey: string;
  // AIR-600: Gen Studio content queue만 비용 trace 파일럿을 opt-in한다.
  costTracePilot?: boolean;
  // studio content queue worker가 미리 만든 Job을 이어받을 때 전달한다.
  existingJobId?: string;
  kind?: string;
  clientRequestId?: string;
};

export type ContentBasicBody = {
  templateKey: string;
  templateScope?: "user" | "system";
  generationMode?: PromptGenType;
  variables?: Record<string, string>;
  extraPrompt?: string;
  platform?: string;
  language?: string;
  length?: string;
  outputFormat?: string;
  n?: number;
  modelName?: string;
  provider?: TextProviderType;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
  universeId?: string; // commerce only
  baseImages?: BaseImageType[];
  visibility?: PromptVisibilityType;
  embedSessionId?: string;
  source?: StudioGenerationSourceType;
};

export type ContentCustomBody = Omit<ContentBasicBody, "templateKey"> & {
  prompt?: string;
  templateKey?: string;
};

function appendContentMeta(base: string, data: { platform?: string; language?: string; length?: string; outputFormat?: string }) {
  const meta: string[] = [];
  if (data?.platform?.trim()) meta.push(`Platform: ${data.platform.trim()}`);
  if (data?.language?.trim()) meta.push(`Language: ${data.language.trim()}`);
  if (data?.length?.trim()) meta.push(`Length: ${data.length.trim()}`);
  if (data?.outputFormat?.trim()) meta.push(`Output Format: ${data.outputFormat.trim()}`);
  return meta.length ? `${base}\n\n${meta.join("\n")}` : base;
}

function buildCustomExtraPrompt(data: ContentCustomBody) {
  const prompt = String(data?.prompt || "").trim();
  const extraPrompt = String(data?.extraPrompt || "").trim();
  return [prompt, extraPrompt].filter(Boolean).join("\n\n");
}

function countBaseImages(baseImages?: BaseImageType[]) {
  return Array.isArray(baseImages) ? baseImages.filter((image) => Boolean(image?.data)).length : 0;
}

export async function handleUserContentBasic(
  data: ContentBasicBody,
  user: unknown,
  opts: ContentHandlerOptsType,
) {
  const u = toUnknownRecord(user);
  const uid = String(u.uid || u.ID || "");
  if (!uid) return { ok: false, error: "UNAUTHORIZED" };

  const templateKey = String(data?.templateKey || "").trim();
  const generationMode: PromptGenType = data?.generationMode === "custom" ? "custom" : "template";
  const templateScopeRaw = data.templateScope;
  const templateScope =
    templateScopeRaw === "user" || templateScopeRaw === "system" ? templateScopeRaw : undefined;
  const doc = await resolveUserContentPromptDoc({
    templateKey,
    templateScope,
    user,
  });
  if (!doc) return { ok: false, error: "prompt_not_found" };

  const variables = data?.variables || {};
  const requiredVariableError = getRequiredPromptVariableError(doc.templateText, variables);
  if (requiredVariableError) return requiredVariableError;

  // variables를 실제 생성에 반영
  const base = renderContentPrompt(doc.title, doc.templateText, {
    extra: String(data?.extraPrompt || ""),
    params: variables,
  });

  const meta: string[] = [];
  if (data?.platform?.trim()) meta.push(`Platform: ${data.platform.trim()}`);
  if (data?.language?.trim()) meta.push(`Language: ${data.language.trim()}`);
  if (data?.length?.trim()) meta.push(`Length: ${data.length.trim()}`);
  if (data?.outputFormat?.trim()) meta.push(`Output Format: ${data.outputFormat.trim()}`);

  const finalPrompt = meta.length ? `${base}\n\n${meta.join("\n")}` : base;

  const provider = resolveTextProvider({
    bodyProvider: data?.provider,
    modelName: data?.modelName,
    forcedProvider: opts.forcedProvider,
  });

  return await generateAndBillContent({
    scope: "user",
    uid,
    provider,
    modelName: data?.modelName,
    actorUser: user,
    prompt: finalPrompt,
    n: data?.n,
    temperature: data?.temperature,
    maxOutputTokens: data?.maxOutputTokens,
    thinkingBudget: data?.thinkingBudget,
    baseImages: data?.baseImages,
    visibility: data?.visibility,
    metaRoute: opts.routeMeta || "ai/generate/template-content",
    appBillingKey: opts.appBillingKey,
    costTracePilot: opts.costTracePilot,
    existingJobId: opts.existingJobId,
    metaExtra: {
      kind: opts.kind,
      clientRequestId: opts.clientRequestId,
      templateTitle: String(doc.title || ""),
      templateKey,
      generationMode,
      variables,
      extraPrompt: String(data?.extraPrompt || ""),
      platform: data?.platform,
      language: data?.language,
      length: data?.length,
      outputFormat: data?.outputFormat,
      baseImageCount: countBaseImages(data?.baseImages),
      source: data?.source,
    },
  });
}

export async function handleUniverseContentBasic(
  data: ContentBasicBody,
  user: unknown,
  opts: ContentHandlerOptsType,
) {
  const universeId = String(data?.universeId || "");
  if (!universeId) return { ok: false, error: "universeId_required" };

  const templateKey = String(data?.templateKey || "").trim();
  const generationMode: PromptGenType = data?.generationMode === "custom" ? "custom" : "template";
  const doc = await getContentPromptByKey(templateKey);
  if (!doc) return { ok: false, error: "prompt_not_found" };

  const variables = data?.variables || {};
  const requiredVariableError = getRequiredPromptVariableError(doc.templateText, variables);
  if (requiredVariableError) return requiredVariableError;

  const base = renderContentPrompt(doc.title, doc.templateText, {
    extra: String(data?.extraPrompt || ""),
    params: variables,
  });

  const meta: string[] = [];
  if (data?.platform?.trim()) meta.push(`Platform: ${data.platform.trim()}`);
  if (data?.language?.trim()) meta.push(`Language: ${data.language.trim()}`);
  if (data?.length?.trim()) meta.push(`Length: ${data.length.trim()}`);
  if (data?.outputFormat?.trim()) meta.push(`Output Format: ${data.outputFormat.trim()}`);

  const finalPrompt = meta.length ? `${base}\n\n${meta.join("\n")}` : base;

  const provider = resolveTextProvider({
    bodyProvider: data?.provider,
    modelName: data?.modelName,
    forcedProvider: opts.forcedProvider,
  });

  return await generateAndBillContent({
    scope: "universe",
    universeId,
    provider,
    modelName: data?.modelName,
    actorUser: user,
    prompt: finalPrompt,
    n: data?.n,
    temperature: data?.temperature,
    maxOutputTokens: data?.maxOutputTokens,
    baseImages: data?.baseImages,
    visibility: data?.visibility,
    metaRoute: opts.routeMeta || "commerce/generate/template-content",
    appBillingKey: opts.appBillingKey,
    costTracePilot: opts.costTracePilot,
    existingJobId: opts.existingJobId,
    metaExtra: {
      kind: opts.kind,
      clientRequestId: opts.clientRequestId,
      templateTitle: String(doc.title || ""),
      templateKey,
      generationMode,
      variables,
      extraPrompt: String(data?.extraPrompt || ""),
      platform: data?.platform,
      language: data?.language,
      length: data?.length,
      outputFormat: data?.outputFormat,
      universeId,
      baseImageCount: countBaseImages(data?.baseImages),
      source: data?.source,
    },
  });
}

export async function handleUserContentCustom(
  data: ContentCustomBody,
  user: unknown,
  opts: ContentHandlerOptsType,
) {
  const u = toUnknownRecord(user);
  const uid = String(u.uid || u.ID || "");
  if (!uid) return { ok: false, error: "UNAUTHORIZED" };

  const basePrompt = String(data?.prompt || "").trim();
  if (!basePrompt) return { ok: false, error: "prompt_required" };

  const finalPrompt = appendContentMeta(basePrompt, data);
  const provider = resolveTextProvider({
    bodyProvider: data?.provider,
    modelName: data?.modelName,
    forcedProvider: opts.forcedProvider,
  });

  return await generateAndBillContent({
    scope: "user",
    uid,
    provider,
    modelName: data?.modelName,
    actorUser: user,
    prompt: finalPrompt,
    n: data?.n,
    temperature: data?.temperature,
    maxOutputTokens: data?.maxOutputTokens,
    baseImages: data?.baseImages,
    visibility: data?.visibility,
    metaRoute: opts.routeMeta || "ai/generate/basic-content",
    appBillingKey: opts.appBillingKey,
    costTracePilot: opts.costTracePilot,
    existingJobId: opts.existingJobId,
    metaExtra: {
      kind: opts.kind,
      clientRequestId: opts.clientRequestId,
      generationMode: "custom",
      templateKey: String(data?.templateKey || ""),
      variables: {},
      extraPrompt: buildCustomExtraPrompt(data),
      platform: data?.platform,
      language: data?.language,
      length: data?.length,
      outputFormat: data?.outputFormat,
      baseImageCount: countBaseImages(data?.baseImages),
      source: data?.source,
    },
  });
}

export async function handleUniverseContentCustom(
  data: ContentCustomBody,
  user: unknown,
  opts: ContentHandlerOptsType,
) {
  const universeId = String(data?.universeId || "");
  if (!universeId) return { ok: false, error: "universeId_required" };

  const basePrompt = String(data?.prompt || "").trim();
  if (!basePrompt) return { ok: false, error: "prompt_required" };

  const finalPrompt = appendContentMeta(basePrompt, data);
  const provider = resolveTextProvider({
    bodyProvider: data?.provider,
    modelName: data?.modelName,
    forcedProvider: opts.forcedProvider,
  });

  return await generateAndBillContent({
    scope: "universe",
    universeId,
    provider,
    modelName: data?.modelName,
    actorUser: user,
    prompt: finalPrompt,
    n: data?.n,
    temperature: data?.temperature,
    maxOutputTokens: data?.maxOutputTokens,
    baseImages: data?.baseImages,
    visibility: data?.visibility,
    metaRoute: opts.routeMeta || "commerce/generate/basic-content",
    appBillingKey: opts.appBillingKey,
    costTracePilot: opts.costTracePilot,
    existingJobId: opts.existingJobId,
    metaExtra: {
      kind: opts.kind,
      clientRequestId: opts.clientRequestId,
      generationMode: "custom",
      templateKey: String(data?.templateKey || ""),
      variables: {},
      extraPrompt: buildCustomExtraPrompt(data),
      platform: data?.platform,
      language: data?.language,
      length: data?.length,
      outputFormat: data?.outputFormat,
      universeId,
      baseImageCount: countBaseImages(data?.baseImages),
      source: data?.source,
    },
  });
}
