import "server-only";
import crypto from "crypto";
import { getModel } from "libs/database/modelCache";
import { MONGODB_AI_URL } from "consts/env/server";
import { AiCostLedgerSchema, type IAiCostLedgerDocument } from "models/ai";

const COLLECTION = "ai_cost_ledger";

function makeLedgerId() {
  return `ai_ledger_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function getAiCostLedgerModel() {
  return await getModel<IAiCostLedgerDocument>(MONGODB_AI_URL, "AiCostLedger", AiCostLedgerSchema, COLLECTION);
}

export async function createAiCostLedger(input: Omit<IAiCostLedgerDocument, "ledgerId" | "createdAt" | "updatedAt">) {
  const model = await getAiCostLedgerModel();
  const doc = await model.create({ ...input, ledgerId: makeLedgerId() });
  return (doc.toObject?.() ?? doc) as IAiCostLedgerDocument;
}
