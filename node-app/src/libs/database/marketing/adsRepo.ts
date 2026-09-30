import "server-only";

import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingAdDraftSchema,
  MarketingAdExecutionSchema,
  MarketingAdsPolicySchema,
  type IMarketingAdDraftDocument,
  type IMarketingAdExecutionDocument,
  type IMarketingAdsPolicyDocument,
} from "models/marketing";

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
const policyModel = () => getModel<IMarketingAdsPolicyDocument>(MONGODB_MARKETING_URL, "MarketingAdsPolicy", MarketingAdsPolicySchema, "marketing_ads_policies");
const draftModel = () => getModel<IMarketingAdDraftDocument>(MONGODB_MARKETING_URL, "MarketingAdDraft", MarketingAdDraftSchema, "marketing_ad_drafts");
const executionModel = () => getModel<IMarketingAdExecutionDocument>(MONGODB_MARKETING_URL, "MarketingAdExecution", MarketingAdExecutionSchema, "marketing_ad_executions");

export async function getMarketingAdsPolicy(universeId: string) {
  const Model = await policyModel();
  return Model.findOne({ universeId }).lean();
}

export async function upsertMarketingAdsPolicy(args: {
  universeId: string;
  executionEnabled: boolean;
  spendCap: { dailyAmount: number; monthlyAmount: number; currency: string };
  allowedLandingDomains: string[];
  advertisingCriteria?: Record<string, unknown>;
  updatedBy?: string;
}) {
  const Model = await policyModel();
  const { advertisingCriteria, ...policy } = args;
  const set: Record<string, unknown> = policy;
  if (advertisingCriteria) {
    const existing = await Model.findOne({ universeId: args.universeId }).select({ "advertisingCriteria.version": 1 }).lean();
    for (const [key, value] of Object.entries(advertisingCriteria)) {
      set[`advertisingCriteria.${key}`] = value;
    }
    set["advertisingCriteria.version"] = Number(existing?.advertisingCriteria?.version || 0) + 1;
  }
  return Model.findOneAndUpdate(
    { universeId: args.universeId },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function upsertMarketingAdvertisingCriteria(args: {
  universeId: string;
  advertisingCriteria: Record<string, unknown>;
  updatedBy?: string;
}) {
  const Model = await policyModel();
  const existing = await Model.findOne({ universeId: args.universeId }).select({ "advertisingCriteria.version": 1 }).lean();
  const set = Object.fromEntries(
    Object.entries(args.advertisingCriteria).map(([key, value]) => [`advertisingCriteria.${key}`, value]),
  );
  set["advertisingCriteria.version"] = Number(existing?.advertisingCriteria?.version || 0) + 1;
  return Model.findOneAndUpdate(
    { universeId: args.universeId },
    {
      $set: { ...set, updatedBy: args.updatedBy || "" },
      $setOnInsert: { universeId: args.universeId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function updateMarketingAdvertisingCriteriaByAgent(args: {
  universeId: string;
  expectedVersion: number;
  advertisingCriteria: Record<string, unknown>;
  updatedBy?: string;
}) {
  const Model = await policyModel();
  const existing = await Model.findOne({ universeId: args.universeId })
    .select({ "advertisingCriteria.version": 1 })
    .lean();
  if (!existing) return { ok: false as const, status: "not_found" as const };

  const currentVersion = Math.max(0, Math.floor(Number(existing.advertisingCriteria?.version) || 0));
  if (args.expectedVersion !== currentVersion) {
    return { ok: false as const, status: "version_conflict" as const, currentVersion };
  }

  const set = Object.fromEntries(
    Object.entries(args.advertisingCriteria).map(([key, value]) => [`advertisingCriteria.${key}`, value]),
  );
  set["advertisingCriteria.version"] = currentVersion + 1;
  set.updatedBy = args.updatedBy || "";
  const policy = await Model.findOneAndUpdate(
    { universeId: args.universeId, "advertisingCriteria.version": currentVersion },
    { $set: set },
    { new: true },
  ).lean();

  if (!policy) return { ok: false as const, status: "version_conflict" as const, currentVersion };
  return { ok: true as const, policy };
}

export async function createMarketingAdDraft(input: Record<string, unknown>) {
  const Model = await draftModel();
  const draftId = makeId("ad_draft");
  return Model.create({ ...input, draftId, idempotencyKey: `ads:${draftId}` });
}

export async function listMarketingAdDrafts(universeId: string) {
  const Model = await draftModel();
  return Model.find({ universeId }).sort({ createdAt: -1 }).limit(100).lean();
}

export async function getMarketingAdDraft(universeId: string, draftId: string) {
  const Model = await draftModel();
  return Model.findOne({ universeId, draftId }).lean();
}

export async function approveMarketingAdDraft(args: { universeId: string; draftId: string; approvedBy: string }) {
  const Model = await draftModel();
  return Model.findOneAndUpdate(
    { universeId: args.universeId, draftId: args.draftId, status: "draft", "validation.valid": true },
    { $set: { status: "approved", approval: { approvedBy: args.approvedBy, approvedAt: new Date(), approvalId: makeId("approval") } } },
    { new: true },
  ).lean();
}

export async function claimMarketingAdExecution(args: {
  universeId: string;
  draftId: string;
  provider: "naver_ads" | "google_ads";
  idempotencyKey: string;
  executedBy: string;
  request: Record<string, unknown>;
}) {
  const Model = await executionModel();
  const existing = await Model.findOne({ idempotencyKey: args.idempotencyKey }).lean();
  if (existing) return { claimed: false as const, execution: existing };
  try {
    const execution = await Model.create({ ...args, executionId: makeId("ad_exec"), status: "creating" });
    return { claimed: true as const, execution: execution.toObject() };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return { claimed: false as const, execution: await Model.findOne({ idempotencyKey: args.idempotencyKey }).lean() };
  }
}

// 외부 mutate는 트랜잭션이 아니므로, 리소스 생성 직후 외부 ID를 증분 기록해
// 중간 실패 시에도 이미 생성된 provider 리소스를 execution 문서만으로 추적할 수 있게 한다.
export async function appendMarketingAdExecutionExternalId(args: { executionId: string; key: string; value: string }) {
  if (!args.value) return null;
  const Model = await executionModel();
  return Model.findOneAndUpdate(
    { executionId: args.executionId },
    { $set: { [`externalIds.${args.key}`]: args.value } },
    { new: true },
  ).lean();
}

export async function finishMarketingAdExecution(args: {
  executionId: string;
  status: "paused_created" | "failed";
  externalIds?: Record<string, string>;
  response?: Record<string, unknown>;
  error?: string;
}) {
  const Model = await executionModel();
  return Model.findOneAndUpdate({ executionId: args.executionId }, { $set: args }, { new: true }).lean();
}

export async function markMarketingAdDraftExecuted(universeId: string, draftId: string, status: "paused_created" | "failed") {
  const Model = await draftModel();
  return Model.findOneAndUpdate({ universeId, draftId }, { $set: { status } }, { new: true }).lean();
}

export async function listMarketingAdExecutions(universeId: string) {
  const Model = await executionModel();
  return Model.find({ universeId }).sort({ createdAt: -1 }).limit(100).lean();
}
