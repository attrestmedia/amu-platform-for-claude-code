import "server-only";

import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingKeywordPlanSchema,
  type IMarketingKeywordPlanDocument,
  type MarketingKeywordPlanProvider,
} from "models/marketing";

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
const keywordPlanModel = () =>
  getModel<IMarketingKeywordPlanDocument>(
    MONGODB_MARKETING_URL,
    "MarketingKeywordPlan",
    MarketingKeywordPlanSchema,
    "marketing_keyword_plans",
  );

export async function createMarketingKeywordPlan(input: {
  universeId: string;
  campaignId: string;
  provider: MarketingKeywordPlanProvider;
  lineage: Record<string, unknown>;
  source: Record<string, unknown>;
  output: Record<string, unknown>;
  createdBy?: string;
}) {
  const Model = await keywordPlanModel();
  return Model.create({
    planId: makeId("keyword_plan"),
    universeId: input.universeId,
    campaignId: input.campaignId,
    provider: input.provider,
    status: "draft",
    lineage: input.lineage,
    source: input.source,
    output: input.output,
    createdBy: input.createdBy || "",
    updatedBy: input.createdBy || "",
  });
}

export async function getMarketingKeywordPlan(universeId: string, planId: string) {
  const Model = await keywordPlanModel();
  return Model.findOne({ universeId, planId }).lean();
}

export async function listMarketingKeywordPlans(universeId: string) {
  const Model = await keywordPlanModel();
  return Model.find({ universeId }).sort({ createdAt: -1 }).limit(100).lean();
}

export async function approveMarketingKeywordPlan(args: { universeId: string; planId: string; approvedBy: string }) {
  const Model = await keywordPlanModel();
  return Model.findOneAndUpdate(
    { universeId: args.universeId, planId: args.planId, status: "draft" },
    {
      $set: {
        status: "approved",
        updatedBy: args.approvedBy,
        approval: { approvedBy: args.approvedBy, approvedAt: new Date(), approvalId: makeId("keyword_approval") },
      },
    },
    { new: true },
  ).lean();
}
