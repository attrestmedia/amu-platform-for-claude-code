import { NextRequest, NextResponse } from "next/server";
import { CONTENT_STUDIO_NAMESPACE_KEY } from "consts/app/services";
import { TEXT_MODEL_MAP, TEXT_PROVIDER_TYPES } from "consts/ai";
import { getContentPromptByKey } from "libs/database/lab";
import { handleUserContentBasic, type ContentBasicBody } from "libs/server-utils/api/contentBasicHandler";
import { assertSystemModelSelectableOrThrow } from "libs/server-utils/api/systemModelControl";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { getUserFromDB } from "libs/server-utils/auth/userRoleUtils";
import { AGENT_CONTENT_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import type { TextProviderType } from "types/ai";
import type { PromptVisibilityType } from "types/app";
import { extractCodedError, isUnknownRecord, toUnknownRecord } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

const AGENT_CONTENT_ENDPOINT = "ai/generate/agent-content";

function codedError(message: string, errorCode: string, status = 400) {
  const error = new Error(message) as Error & { errorCode: string; status: number };
  error.errorCode = errorCode;
  error.status = status;
  return error;
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function resolveProvider(raw: unknown): TextProviderType {
  const provider = toSafeString(raw || AGENT_CONTENT_POLICY.defaultProvider);
  if (!(TEXT_PROVIDER_TYPES as readonly string[]).includes(provider)) {
    throw codedError("agent_provider_not_allowed", "INVALID_PROVIDER");
  }
  return provider as TextProviderType;
}

function resolveModelName(provider: TextProviderType, raw: unknown) {
  const defaults = AGENT_CONTENT_POLICY.defaultModelByProvider as Record<string, string>;
  const models = TEXT_MODEL_MAP as Record<string, readonly string[]>;
  const modelName = toSafeString(raw || defaults[provider]);
  if (!modelName || !(models[provider] || []).includes(modelName)) {
    throw codedError("agent_model_not_allowed", "INVALID_MODEL");
  }
  return modelName;
}

function resolveVariables(raw: unknown) {
  if (!isUnknownRecord(raw) || Array.isArray(raw)) {
    throw codedError("variables_must_be_an_object", "INVALID_INPUT");
  }

  const entries = Object.entries(raw);
  if (entries.length > AGENT_CONTENT_POLICY.maxVariableCount) {
    throw codedError("variable_count_exceeded", "INVALID_INPUT");
  }

  let totalChars = 0;
  const variables: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = toSafeString(rawKey);
    if (!key || typeof rawValue !== "string") {
      throw codedError("variables_must_contain_string_values", "INVALID_INPUT");
    }
    if (rawValue.length > AGENT_CONTENT_POLICY.maxVariableChars) {
      throw codedError("variable_value_too_long", "INVALID_INPUT");
    }
    totalChars += key.length + rawValue.length;
    variables[key] = rawValue;
  }

  if (totalChars > AGENT_CONTENT_POLICY.maxVariablesTotalChars) {
    throw codedError("variables_too_large", "INVALID_INPUT");
  }
  return variables;
}

function resolveOptionalNumber(raw: unknown, field: "temperature" | "maxOutputTokens" | "thinkingBudget") {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw codedError(`${field}_must_be_a_number`, "INVALID_INPUT");
  if (field === "temperature" && (value < 0 || value > 1.5)) {
    throw codedError("temperature_out_of_range", "INVALID_INPUT");
  }
  if (
    field === "maxOutputTokens" &&
    (!Number.isInteger(value) ||
      value < AGENT_CONTENT_POLICY.minOutputTokens ||
      value > AGENT_CONTENT_POLICY.maxOutputTokens)
  ) {
    throw codedError("max_output_tokens_out_of_range", "INVALID_INPUT");
  }
  if (
    field === "thinkingBudget" &&
    (!Number.isInteger(value) || value < 0 || value > AGENT_CONTENT_POLICY.maxThinkingBudget)
  ) {
    throw codedError("thinking_budget_out_of_range", "INVALID_INPUT");
  }
  return value;
}

/**
 * Agent 전용 공개 콘텐츠 템플릿 생성 엔드포인트.
 * 기존 콘텐츠 생성·과금·asset 저장 파이프라인을 그대로 사용한다.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:content:generate" });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }
    if (!isUnknownRecord(rawBody)) throw codedError("body_must_be_an_object", "INVALID_INPUT");

    if (typeof rawBody.templateKey !== "string") {
      throw codedError("template_key_required", "INVALID_INPUT");
    }
    const templateKey = rawBody.templateKey.trim();
    if (!templateKey || templateKey.length > AGENT_CONTENT_POLICY.maxTemplateKeyChars) {
      throw codedError("template_key_required", "INVALID_INPUT");
    }
    const template = await getContentPromptByKey(templateKey);
    if (!template) throw codedError("template_not_found", "TEMPLATE_NOT_FOUND", 404);

    const variables = resolveVariables(rawBody.variables);
    if (rawBody.extraPrompt !== undefined && typeof rawBody.extraPrompt !== "string") {
      throw codedError("extra_prompt_must_be_a_string", "INVALID_INPUT");
    }
    const extraPrompt = toSafeString(rawBody.extraPrompt);
    if (extraPrompt.length > AGENT_CONTENT_POLICY.maxExtraPromptChars) {
      throw codedError("extra_prompt_too_long", "INVALID_INPUT");
    }

    const provider = resolveProvider(rawBody.provider);
    const modelName = resolveModelName(provider, rawBody.modelName);
    const agentUser = await getUserFromDB(auth.uid);
    await assertSystemModelSelectableOrThrow({ provider, modelName, modality: "text", actor: { user: agentUser || undefined } });
    const temperature = resolveOptionalNumber(rawBody.temperature, "temperature");
    const maxOutputTokens = resolveOptionalNumber(rawBody.maxOutputTokens, "maxOutputTokens");
    const thinkingBudget = resolveOptionalNumber(rawBody.thinkingBudget, "thinkingBudget");
    if (thinkingBudget !== undefined && provider !== "google") {
      throw codedError("thinking_budget_requires_google", "INVALID_INPUT");
    }
    if (thinkingBudget !== undefined && maxOutputTokens !== undefined && thinkingBudget >= maxOutputTokens) {
      throw codedError("thinking_budget_must_be_less_than_max_output_tokens", "INVALID_INPUT");
    }
    if (rawBody.visibility !== undefined && rawBody.visibility !== "private" && rawBody.visibility !== "public") {
      throw codedError("visibility_not_allowed", "INVALID_INPUT");
    }
    const visibility: PromptVisibilityType = rawBody.visibility || AGENT_CONTENT_POLICY.defaultVisibility;

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_CONTENT_ENDPOINT,
      limitPerMinute: AGENT_CONTENT_POLICY.maxRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });

    logger.info("[agent-content] request accepted", {
      endpoint: AGENT_CONTENT_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      templateKey,
      provider,
      modelName,
      visibility,
      variableCount: Object.keys(variables).length,
      extraPromptBytes: Buffer.byteLength(extraPrompt, "utf8"),
    });

    const body: ContentBasicBody = {
      templateKey,
      templateScope: "system",
      generationMode: "template",
      variables,
      extraPrompt,
      n: 1,
      provider,
      modelName,
      temperature,
      maxOutputTokens,
      thinkingBudget,
      visibility,
    };
    const result = await handleUserContentBasic(body, { uid: auth.uid, ID: auth.uid }, {
      routeMeta: AGENT_CONTENT_ENDPOINT,
      appBillingKey: CONTENT_STUDIO_NAMESPACE_KEY,
    });
    const resultRecord = toUnknownRecord(result);

    if (resultRecord.ok !== true) {
      const error = toSafeString(resultRecord.error || "content_generation_failed");
      const errorCode = toSafeString(resultRecord.errorCode || "INVALID_INPUT");
      return NextResponse.json(
        { ok: false, error, errorCode, ...(Array.isArray(resultRecord.issues) ? { issues: resultRecord.issues } : {}) },
        { status: 400 },
      );
    }

    const resultData = toUnknownRecord(resultRecord.data);
    const assetIds = Array.isArray(resultData.assetIds) ? resultData.assetIds.filter(Boolean) : [];
    if (assetIds.length === 0) {
      logger.error("[agent-content] billed generation has no persisted asset", {
        endpoint: AGENT_CONTENT_ENDPOINT,
        uid: auth.uid,
        keyHash: auth.keyHash,
        templateKey,
        provider: resultData.provider || provider,
        modelName: resultData.modelName || modelName,
        coins: Number(resultData.coins || 0),
      });
      return NextResponse.json(
        {
          ok: false,
          error: "content_asset_persist_failed",
          errorCode: "ASSET_PERSIST_FAILED",
          data: {
            templateKey,
            provider: resultData.provider || provider,
            modelName: resultData.modelName || modelName,
            coins: Number(resultData.coins || 0),
          },
        },
        { status: 502 },
      );
    }

    logger.info("[agent-content] request completed", {
      endpoint: AGENT_CONTENT_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      templateKey,
      assetIds,
      provider: resultData.provider || provider,
      modelName: resultData.modelName || modelName,
      coins: Number(resultData.coins || 0),
    });

    return NextResponse.json(result);
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, {
      message: "Content generation failed",
    });
    logger.error("[agent-content] request failed", {
      endpoint: AGENT_CONTENT_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
