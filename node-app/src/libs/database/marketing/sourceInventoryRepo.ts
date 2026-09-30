import "server-only";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingSourceInventorySchema,
  type IMarketingSourceInventoryDocument,
} from "models/marketing";

const SOURCE_INVENTORY_COLLECTION = "marketing_source_inventory";

function toSafeString(value: unknown, max = 12000) {
  return String(value || "").trim().slice(0, max);
}

function toDateOrNull(value?: string | Date | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

async function getMarketingSourceInventoryModel() {
  return await getModel<IMarketingSourceInventoryDocument>(
    MONGODB_MARKETING_URL,
    "MarketingSourceInventory",
    MarketingSourceInventorySchema,
    SOURCE_INVENTORY_COLLECTION,
  );
}

export async function updateMarketingSourceInventoryItem(args: {
  itemId: string;
  universeId?: string;
  set?: Record<string, unknown>;
  unset?: Record<string, unknown>;
}) {
  const model = await getMarketingSourceInventoryModel();
  const cond: Record<string, unknown> = { itemId: toSafeString(args.itemId) };
  const universeId = toSafeString(args.universeId);
  if (universeId) cond.universeId = universeId;

  const update: Record<string, unknown> = {
    $set: {
      ...(args.set || {}),
      ...(typeof args.set?.appliedAt !== "undefined" ? { appliedAt: toDateOrNull(args.set.appliedAt as string | Date | null | undefined) } : {}),
      updatedAt: new Date(),
    },
  };
  if (args.unset && Object.keys(args.unset).length > 0) update.$unset = args.unset;

  return await model.findOneAndUpdate(cond, update, { new: true }).lean();
}
