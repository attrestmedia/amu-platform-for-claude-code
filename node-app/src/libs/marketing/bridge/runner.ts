import "server-only";

import { calcCoins, resolveBillingKey } from "utils/payment/coinUtils";
import {
  assertAIUsageBalanceOrThrow,
  assertPricingPreflightOrThrow,
  billAIUsageOrThrow,
} from "libs/services/aiUsageBilling";
import { claimProviderOperationOrThrow } from "libs/server-utils/api/providerOperationGuard";
import type { AiProviderType } from "types/ai";
import {
  isGoogleProTextModel,
  isXaiLongContextTieredTextModel,
  pickXaiPricingVariantByInputTokens,
} from "utils/ai/providerHelper";
import { runClaudeCliBridge } from "./providers/claudeCli";
import { runCodexCliBridge } from "./providers/codexCli";
import { getMarketingChannelDraftSchemaExample } from "./channelDraftContract";
import type { MarketingBridgeRequest, MarketingBridgeRunResult } from "./types";
import { getContentPromptByKey } from "libs/database/lab";
import { renderContentPrompt } from "utils/lab";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function makeBridgeError(message: string, errorCode: string, status = 400) {
  const error = new Error(message) as Error & { errorCode?: string; status?: number };
  error.errorCode = errorCode;
  error.status = status;
  return error;
}

function classifyMarketingBridgeOperationFailure(context: { dispatchStarted: boolean; providerResponseReceived: boolean; error: unknown }): "release" | "dispatch_uncertain" | "post_response_failure" {
  const { dispatchStarted, providerResponseReceived, error } = context;
  const errorRecord = error && typeof error === "object" ? error : null;
  const errorCode = errorRecord && "errorCode" in errorRecord ? errorRecord.errorCode : undefined;
  if (errorCode === "PROVIDER_OPERATION_UNRESOLVED" || errorCode === "PROVIDER_OPERATION_IN_PROGRESS") {
    return "dispatch_uncertain";
  }
  if (!dispatchStarted) return "release";
  if (providerResponseReceived) return "post_response_failure";

  const status = errorRecord && "status" in errorRecord ? errorRecord.status : undefined;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500
    ? "release"
    : "dispatch_uncertain";
}

function escapeJsonText(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function extractFirstJsonObject(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return "";

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] || text;

  let start = -1;
  let depth = 0;
  let inString: '"' | null = null;
  let escaped = false;

  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"') {
      inString = ch;
      continue;
    }

    if (ch === "{") {
      if (start === -1) start = i;
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return candidate.slice(start, i + 1);
      }
    }
  }

  return candidate;
}

function parseBridgePayload(raw: string) {
  const candidate = extractFirstJsonObject(raw);
  try {
    return JSON.parse(candidate);
  } catch (error: unknown) {
    const errLike = error as { message?: unknown } | null | undefined;
    const message = toSafeString(errLike?.message) || "json_parse_failed";
    const err = new Error("bridge_json_invalid") as Error & {
      errorCode?: string;
      status?: number;
      parseMessage?: string;
      rawText?: string;
    };
    err.errorCode = "BRIDGE_JSON_INVALID";
    err.status = 502;
    err.parseMessage = message;
    err.rawText = raw;
    throw err;
  }
}

async function resolveContentTemplateGuide(request: Extract<MarketingBridgeRequest, { task: "channel_draft" }>) {
  const templateKey = toSafeString(request.generationConfig?.contentTemplateKey);
  if (!templateKey) return "";

  const doc = await getContentPromptByKey(templateKey);
  if (!doc?.templateText) {
    return `Content template key ${templateKey} is unavailable. Continue with source-first rules.`;
  }

  return renderContentPrompt(doc.title, doc.templateText, {
    params: {
      "채널": request.channel,
      "브랜드축": "All My Universe",
      "목표전환": "allmyuniverse.com 방문",
    },
  });
}

async function buildChannelDraftPrompt(request: Extract<MarketingBridgeRequest, { task: "channel_draft" }>) {
  const config = request.generationConfig;
  const templateGuide = await resolveContentTemplateGuide(request);
  const operatorGuidance = [
    config?.contentTemplateKey ? `- Content template key: ${config.contentTemplateKey}` : "",
    config?.imageTemplateKey ? `- Image template key for follow-up visuals: ${config.imageTemplateKey}` : "",
    config?.instructionText ? `- Operator instruction: ${config.instructionText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const targetSpec = JSON.stringify(getMarketingChannelDraftSchemaExample(request.channel), null, 2);

  return [
    "You are preparing a marketing channel draft from a WordPress article.",
    "Return valid JSON only.",
    `Target channel: ${request.channel}`,
    "Output schema:",
    targetSpec,
    "Source snapshot:",
    escapeJsonText(request.source),
    templateGuide ? "Content template guide:" : "",
    templateGuide ? escapeJsonText(templateGuide) : "",
    operatorGuidance ? "Operator generation configuration:" : "",
    operatorGuidance,
    "Rules:",
    "- Keep facts aligned with the source snapshot.",
    "- Keep links canonical and unchanged.",
    "- Prefer concise, operator-friendly copy.",
    "- Do not add explanations outside JSON.",
  ].join("\n");
}

function buildValidationPrompt(request: Extract<MarketingBridgeRequest, { task: "validation" }>) {
  const config = request.generationConfig;
  return [
    "You are validating a generated marketing draft.",
    "Return valid JSON only.",
    "Output schema:",
    `{
  "channel": "${request.channel}",
  "valid": true,
  "summary": "short summary",
  "issues": ["issue_code"],
  "warnings": ["warning_code"],
  "score": 0,
  "checks": {
    "koreanProofread": {
      "candidates": [
        {
          "type": "literal",
          "pattern": "오탈자 후보",
          "expected": ["수정 후보"],
          "reason": "why this looks wrong",
          "channel": "${request.channel}",
          "field": "text",
          "context": "short surrounding text"
        }
      ]
    }
  }
}`,
    "Source snapshot:",
    escapeJsonText(request.source),
    "Draft to validate:",
    escapeJsonText(request.draft),
    config?.instructionText || config?.contentTemplateKey ? "Operator generation configuration:" : "",
    config?.contentTemplateKey ? `- Content template key: ${config.contentTemplateKey}` : "",
    config?.instructionText ? `- Operator instruction: ${config.instructionText}` : "",
    "Rules:",
    "- valid is true only when the draft is publishable with minor or no edits.",
    "- issues should contain only blocking problems.",
    "- warnings should contain non-blocking improvements.",
    "- If you find suspicious Korean typos that are not already blocking issues, add them to checks.koreanProofread.candidates for dictionary learning.",
    "- Do not add normal brand names, URLs, hashtags, or intentional quoted text as typo candidates.",
    "- score must be 0 to 100.",
  ].join("\n");
}

function buildProofreadPrompt(request: Extract<MarketingBridgeRequest, { task: "proofread" }>) {
  return [
    "You are a Korean marketing copy proofreader.",
    "Return valid JSON only, using the same draft object shape.",
    `Target channel: ${request.channel}`,
    "Original draft:",
    escapeJsonText(request.draft),
    "Detected typo findings:",
    escapeJsonText(request.findings),
    request.manualInstruction ? "Operator correction request:" : "",
    request.manualInstruction ? escapeJsonText(request.manualInstruction) : "",
    "Rules:",
    "- Correct only typos, spacing, particles, punctuation, and explicitly requested wording.",
    "- Do not summarize, rewrite, add claims, or change tone.",
    "- Preserve URLs, image fields, identifiers, and intentional proper nouns exactly.",
    "- Preserve every field that does not require correction.",
    "- Return the corrected draft JSON only.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildIndependentProofreadPrompt(request: Extract<MarketingBridgeRequest, { task: "proofread_check" }>) {
  return [
    "You are an independent Korean copy accuracy checker. Do not rewrite the draft.",
    "Return valid JSON only with this exact shape:",
    '{"valid":true,"findings":[{"field":"body","before":"exact text in field","suggestion":"replacement","reason":"short Korean reason","severity":"error|warning"}]}',
    `Target channel: ${request.channel}`,
    "Draft:",
    escapeJsonText(request.draft),
    "Rules:",
    "- Find only definite Korean spelling, spacing, particle, punctuation, duplicated-word, or obvious transcription errors.",
    "- Ignore URLs, hashtags, code, product names, quoted source text, and intentional style unless certainly incorrect.",
    "- before must be an exact non-empty substring of the named draft field.",
    "- severity=error only for a definite typo that blocks publication; use warning for uncertain suggestions.",
    "- valid is false if and only if at least one error finding exists.",
    "- Return at most 20 findings and never return a corrected draft.",
  ].join("\n");
}

function buildStrategyFitPrompt(request: Extract<MarketingBridgeRequest, { task: "strategy_fit" }>) {
  return [
    "You evaluate existing channel drafts against an operator-provided strategy.",
    "Return valid JSON only. Do not rewrite drafts and do not predict absolute reach, clicks, conversions, or revenue.",
    `Evaluation kind: ${request.fitKind}`,
    "Output schema:",
    `{"results":[{"channel":"threads","score":0,"verdict":"fit|needs_work|not_fit","summary":"short Korean summary","reasons":["reason"],"recommendations":[{"action":"action","reason":"reason"}]}]}`,
    "Strategy:",
    escapeJsonText(request.strategy),
    "Drafts:",
    escapeJsonText(request.drafts),
    "Rules:",
    "- Score each supplied channel exactly once.",
    "- 85-100 is fit, 70-84 is needs_work, and 0-69 is not_fit.",
    request.fitKind === "marketing"
      ? "- Judge goal, persona, funnel, core message, channel role, CTA, brand alignment, required topics, and excluded topics."
      : "- Judge objective, audience, offer, landing alignment, claim/disclosure safety, measurement readiness, and reuse as paid creative.",
    "- Use only the supplied strategy and draft. State missing evidence as a reason instead of inventing it.",
  ].join("\n");
}

export async function runMarketingBridge(request: MarketingBridgeRequest): Promise<MarketingBridgeRunResult> {
  const requiresBilling = request.task === "channel_draft" || request.task === "validation";
  if (requiresBilling && !request.billing) {
    throw makeBridgeError("마케팅 AI 호출에는 과금 컨텍스트가 필요합니다.", "MARKETING_BILLING_CONTEXT_REQUIRED", 503);
  }
  if (request.task === "channel_draft" && request.generationConfig?.generationMode === "local_agent") {
    throw makeBridgeError("local_agent 작업은 로컬 에이전트 경로에서만 실행할 수 있습니다.", "MARKETING_LOCAL_AGENT_REQUIRED", 409);
  }

  const startedAt = Date.now();
  const prompt =
    request.task === "channel_draft"
      ? await buildChannelDraftPrompt(request)
      : request.task === "proofread"
        ? buildProofreadPrompt(request)
        : request.task === "proofread_check"
          ? buildIndependentProofreadPrompt(request)
        : request.task === "strategy_fit"
          ? buildStrategyFitPrompt(request)
          : buildValidationPrompt(request);
  const billing = request.billing;
  const billingProvider = (request.task === "validation"
    ? "claude"
    : request.generationConfig?.modelProvider) as AiProviderType | undefined;
  const billingModelName = request.task === "validation" ? "claude-opus-5" : request.generationConfig?.modelName;
  const needsTieredVariants =
    (billingProvider === "google" && isGoogleProTextModel(billingModelName)) ||
    (billingProvider === "xai" && isXaiLongContextTieredTextModel(billingModelName));
  const billingVariant =
    billingProvider === "xai" && isXaiLongContextTieredTextModel(billingModelName) ? "long" : undefined;
  if (billing && (!toSafeString(billing.uid) || !toSafeString(billing.app) || !billingProvider || !billingModelName)) {
    throw makeBridgeError("마케팅 AI 과금 대상이 유효하지 않습니다.", "MARKETING_BILLING_TARGET_INVALID", 400);
  }

  const operation = billing ? await claimProviderOperationOrThrow(billing.operationId) : null;
  if (operation?.kind === "replay") return operation.result as MarketingBridgeRunResult;

  let providerDispatchStarted = false;
  let providerResponseReceived = false;
  try {
    if (billing && billingProvider && billingModelName) {
      await assertPricingPreflightOrThrow({
        provider: billingProvider,
        modelName: billingModelName,
        modality: "text",
        kind: "token",
        variants: needsTieredVariants ? ["short", "long"] : [undefined],
      });
      await assertAIUsageBalanceOrThrow({
        uid: billing.uid,
        app: billing.app,
        provider: billingProvider,
        modelName: billingModelName,
        ...(billingVariant ? { variant: billingVariant } : {}),
        usage: {
          text: {
            input: Math.max(1, Math.ceil(prompt.length / 3)),
            output: request.task === "validation" ? 900 : request.task === "channel_draft" ? 1200 : 3200,
          },
        },
        modality: "text",
        meta: {
          ...billing.meta,
          route: "marketing/bridge-preflight",
          operationId: billing.operationId,
        },
      });
    }

    providerDispatchStarted = true;
    const profile =
      request.task === "validation"
        ? await runClaudeCliBridge(prompt, request.actorUser)
        : await runCodexCliBridge(prompt, request.generationConfig, {
            maxOutputTokens: request.task === "strategy_fit" ? 3200 : request.task === "proofread_check" ? 500 : 1200,
            actorUser: request.actorUser,
          });
    providerResponseReceived = true;
    const durationMs = Date.now() - startedAt;
    const billingKey = resolveBillingKey(profile.executionProvider, profile.modelName);
    const inputTokens = Math.max(1, Number(profile.usageTotal.input || Math.ceil(prompt.length / 3)));
    const outputTokens = Math.max(1, Number(profile.usageTotal.output || Math.ceil(profile.rawText.length / 3)));
    const actualVariant =
      profile.executionProvider === "xai" && isXaiLongContextTieredTextModel(profile.modelName)
        ? pickXaiPricingVariantByInputTokens(inputTokens)
        : undefined;
    const actualBillingKey = actualVariant
      ? resolveBillingKey(profile.executionProvider, profile.modelName, actualVariant)
      : billingKey;
    const estimated = calcCoins({
      billingKey: actualBillingKey,
      usage: {
        text: {
          input: inputTokens,
          output: outputTokens,
        },
      },
    });

    const result: MarketingBridgeRunResult = {
      provider: profile.bridgeProvider,
      executionProvider: profile.executionProvider,
      executionKind: profile.executionKind,
      modelName: profile.modelName,
      commandPreview: profile.commandPreview,
      rawText: profile.rawText,
      payload: parseBridgePayload(profile.rawText),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs,
        billingKey: actualBillingKey,
        estimatedCoins: estimated.coins,
      },
    };

    if (billing) {
      const billed = await billAIUsageOrThrow({
        uid: billing.uid,
        app: billing.app,
        provider: result.executionProvider,
        modelName: result.modelName,
        ...(actualVariant ? { variant: actualVariant } : {}),
        usage: { text: { input: inputTokens, output: outputTokens } },
        modality: "text",
        meta: {
          ...billing.meta,
          route: "marketing/bridge",
          operationId: billing.operationId,
        },
      });
      result.usage.estimatedCoins = Number(billed.coins || 0);
    }

    if (operation?.kind === "reserved") await operation.complete(result);
    return result;
  } catch (error) {
    const disposition = classifyMarketingBridgeOperationFailure({
      dispatchStarted: providerDispatchStarted,
      providerResponseReceived,
      error,
    });
    if (operation?.kind === "reserved" && !operation.isTerminal()) {
      if (disposition === "release") await operation.release();
      else await operation.markUnresolved(disposition);
    }
    throw error;
  }
}
