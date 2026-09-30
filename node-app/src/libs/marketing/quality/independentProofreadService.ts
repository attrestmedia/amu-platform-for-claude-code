import "server-only";

import type { MarketingChannel } from "consts/marketing/queue";
import {
  MARKETING_PROOFREAD_DEFAULT_MODEL,
  MARKETING_PROOFREAD_DEFAULT_PROVIDER,
} from "consts/marketing/proofread";
import { runMarketingBridge } from "libs/marketing/bridge/runner";
import type { MarketingChannelDraft } from "libs/marketing/bridge/types";
import { normalizeMarketingGenerationConfig } from "libs/marketing/generationConfig";
import {
  assertAIUsageBalanceOrThrow,
  assertPricingPreflightOrThrow,
  billAIUsageOrThrow,
} from "libs/services/aiUsageBilling";
import { assertSystemModelSelectableOrThrow } from "libs/server-utils/api/systemModelControl";
import { isUnknownRecord, toSafeString } from "utils/common/typeUtils";
import { createMarketingDraftDigest } from "./marketingDraftDigest";
import type { CoinUsageSource } from "types/payment";

export const INDEPENDENT_PROOFREAD_POLICY_VERSION = 1;

type Finding = {
  field: string;
  before: string;
  suggestion: string;
  reason: string;
  severity: "error" | "warning";
};

function normalizeFindings(payload: Record<string, unknown>, draft: Record<string, unknown>) {
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  return findings.slice(0, 20).flatMap((item): Finding[] => {
    if (!isUnknownRecord(item)) return [];
    const field = toSafeString(item.field).slice(0, 80);
    const before = toSafeString(item.before).slice(0, 300);
    const fieldValue = typeof draft[field] === "string" ? String(draft[field]) : "";
    if (!field || !before || !fieldValue.includes(before)) return [];
    return [{
      field,
      before,
      suggestion: toSafeString(item.suggestion).slice(0, 300),
      reason: toSafeString(item.reason).slice(0, 500),
      severity: toSafeString(item.severity) === "error" ? "error" : "warning",
    }];
  });
}

export async function runIndependentMarketingProofread(args: {
  uid: string;
  universeId: string;
  jobId: string;
  channel: MarketingChannel;
  draft: Record<string, unknown>;
  requestedBy: string;
  actorUser?: unknown;
  source: Extract<CoinUsageSource, "local_agent" | "user_action" | "server_worker">;
}) {
  if (!toSafeString(args.uid)) throw new Error("independent_proofread_user_required");
  const draftDigest = createMarketingDraftDigest(args.draft);
  const operationId = `marketing:${args.jobId}:${args.channel}:independent-proofread:${draftDigest}`;
  await assertSystemModelSelectableOrThrow({
    provider: MARKETING_PROOFREAD_DEFAULT_PROVIDER,
    modelName: MARKETING_PROOFREAD_DEFAULT_MODEL,
    modality: "text",
    actor: { user: args.actorUser },
  });
  await assertPricingPreflightOrThrow({
    provider: MARKETING_PROOFREAD_DEFAULT_PROVIDER,
    modelName: MARKETING_PROOFREAD_DEFAULT_MODEL,
    modality: "text",
    kind: "token",
    variants: [undefined],
  });
  await assertAIUsageBalanceOrThrow({
    uid: args.uid,
    app: "ai_marketing_independent_proofread",
    provider: MARKETING_PROOFREAD_DEFAULT_PROVIDER,
    modelName: MARKETING_PROOFREAD_DEFAULT_MODEL,
    usage: {
      text: {
        input: Math.max(1, Math.ceil(JSON.stringify(args.draft).length / 3)),
        output: 2000,
      },
    },
    modality: "text",
    meta: {
      route: "marketing/independent-proofread-preflight",
      universeId: args.universeId,
      jobId: args.jobId,
      channel: args.channel,
      operationId,
    },
  });

  const generationConfig = normalizeMarketingGenerationConfig({
    generationMode: "server_worker",
    modelProvider: MARKETING_PROOFREAD_DEFAULT_PROVIDER,
    modelName: MARKETING_PROOFREAD_DEFAULT_MODEL,
    reviewMode: "review_required",
  });
  const result = await runMarketingBridge({
    task: "proofread_check",
    actorUser: args.actorUser,
    channel: args.channel,
    draft: args.draft as MarketingChannelDraft,
    generationConfig,
  });
  if (!isUnknownRecord(result.payload) || !Array.isArray(result.payload.findings)) {
    throw new Error("independent_proofread_response_invalid");
  }
  const findings = normalizeFindings(result.payload, args.draft);
  const blocking = findings.filter((finding) => finding.severity === "error");
  if (
    typeof result.payload.valid !== "boolean" ||
    (result.payload.valid === true && blocking.length > 0) ||
    (result.payload.valid === false && blocking.length === 0)
  ) {
    throw new Error("independent_proofread_response_inconsistent");
  }
  const billed = await billAIUsageOrThrow({
    uid: args.uid,
    app: "ai_marketing_independent_proofread",
    provider: result.executionProvider,
    modelName: result.modelName,
    usage: { text: { input: result.usage.inputTokens, output: result.usage.outputTokens } },
    modality: "text",
    meta: {
      route: "marketing/independent-proofread",
      universeId: args.universeId,
      jobId: args.jobId,
      channel: args.channel,
      requestedBy: args.requestedBy,
      source: args.source,
      operationId,
    },
  });
  return {
    policyVersion: INDEPENDENT_PROOFREAD_POLICY_VERSION,
    status: blocking.length === 0 ? "passed" : "failed",
    valid: blocking.length === 0,
    provider: result.executionProvider,
    modelName: result.modelName,
    checkedAt: new Date().toISOString(),
    draftDigest,
    findings,
    issues: blocking.map((finding) => `${finding.field}: ${finding.before} → ${finding.suggestion}`),
    warnings: findings.filter((finding) => finding.severity === "warning").map((finding) => finding.reason),
    usage: result.usage,
    coins: Number(billed.coins || 0),
  };
}
