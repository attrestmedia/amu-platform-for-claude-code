import { callTextByProvider } from "libs/server-utils/api/apiHelper";
import type { MarketingGenerationConfig } from "libs/marketing/generationConfig";

export async function runCodexCliBridge(
  prompt: string,
  generationConfig?: MarketingGenerationConfig,
  options?: { maxOutputTokens?: number; actorUser?: unknown },
) {
  const provider = generationConfig?.modelProvider;
  const modelName = generationConfig?.modelName;
  if (!provider || !modelName) {
    const error = new Error("마케팅 생성 모델 설정이 필요합니다.") as Error & { errorCode?: string; status?: number };
    error.errorCode = "MARKETING_MODEL_CONFIG_REQUIRED";
    error.status = 503;
    throw error;
  }
  const response = await callTextByProvider(provider, modelName, prompt, {
    n: 1,
    temperature: 0.4,
    maxOutputTokens: options?.maxOutputTokens || 1200,
    responseMimeType: "application/json",
    actorUser: options?.actorUser,
  });

  return {
    bridgeProvider: "codex" as const,
    executionProvider: provider,
    executionKind: "api" as const,
    commandPreview: `codex --model ${modelName} --output json`,
    modelName: response.modelName,
    rawText: String(response.outputs?.[0] || "").trim(),
    usageTotal: response.usageTotal,
  };
}
