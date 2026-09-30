import "server-only";
import crypto from "crypto";
import { getModel } from "libs/database/modelCache";
import { MONGODB_AI_URL } from "consts/env/server";
import { AiCostTraceSchema, type IAiCostTraceDocument } from "models/ai";
import type { AiCostTraceCompletion, AiCostTraceDraft } from "libs/server-utils/ai/aiCostTraceContract";

const COLLECTION = "ai_cost_traces";

function makeFallbackTraceId() {
  return `trace_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function getAiCostTraceModel() {
  return await getModel<IAiCostTraceDocument>(MONGODB_AI_URL, "AiCostTrace", AiCostTraceSchema, COLLECTION);
}

export async function createAiCostTrace(input: AiCostTraceDraft) {
  const model = await getAiCostTraceModel();
  const traceId = String(input.traceId || makeFallbackTraceId()).trim();
  const doc = await model.create({ ...input, traceId, rootTraceId: input.rootTraceId || traceId });
  return (doc.toObject?.() ?? doc) as IAiCostTraceDocument;
}

export async function completeAiCostTrace(args: { traceId: string; completion: AiCostTraceCompletion }) {
  const traceId = String(args.traceId || "").trim();
  if (!traceId) return null;

  const model = await getAiCostTraceModel();
  const completion = args.completion;
  const $set: Record<string, unknown> = {
    ...completion,
    updatedAt: new Date(),
  };
  return await model.findOneAndUpdate({ traceId }, { $set }, { new: true }).lean();
}
