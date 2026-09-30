import "server-only";

import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingPromoCreativeSchema,
  type IMarketingPromoCreative,
  type IMarketingPromoCreativeDocument,
  type MarketingPromoStatus,
} from "models/marketing";

const promoModel = () =>
  getModel<IMarketingPromoCreativeDocument>(
    MONGODB_MARKETING_URL,
    "MarketingPromoCreative",
    MarketingPromoCreativeSchema,
    "marketing_promo_creatives",
  );

export function createMarketingPromoCreativeId() {
  return `promo_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function createMarketingPromoCreative(input: IMarketingPromoCreative) {
  const Model = await promoModel();
  return (await Model.create(input)).toObject();
}

export async function getMarketingPromoCreative(universeId: string, creativeId: string) {
  const Model = await promoModel();
  return Model.findOne({ universeId, creativeId }).lean();
}

export async function listMarketingPromoCreatives(args: {
  universeId: string;
  statuses?: MarketingPromoStatus[];
  slotId?: string;
  limit?: number;
}) {
  const Model = await promoModel();
  const query: Record<string, unknown> = { universeId: args.universeId };
  if (args.statuses?.length) query.status = { $in: args.statuses };
  if (args.slotId) query.slotIds = args.slotId;
  return Model.find(query)
    .sort({ updatedAt: -1, creativeId: 1 })
    .limit(Math.max(1, Math.min(500, args.limit || 200)))
    .lean();
}

export async function deleteMarketingPromoCreative(args: {
  universeId: string;
  creativeId: string;
  allowedStatuses?: MarketingPromoStatus[];
}) {
  const Model = await promoModel();
  const query: Record<string, unknown> = { universeId: args.universeId, creativeId: args.creativeId };
  if (args.allowedStatuses?.length) query.status = { $in: args.allowedStatuses };
  return Model.findOneAndDelete(query).lean();
}

export async function updateMarketingPromoCreative(args: {
  universeId: string;
  creativeId: string;
  set: Partial<IMarketingPromoCreative>;
  allowedStatuses?: MarketingPromoStatus[];
}) {
  const Model = await promoModel();
  const query: Record<string, unknown> = { universeId: args.universeId, creativeId: args.creativeId };
  if (args.allowedStatuses?.length) query.status = { $in: args.allowedStatuses };
  return Model.findOneAndUpdate(query, { $set: args.set }, { new: true }).lean();
}
