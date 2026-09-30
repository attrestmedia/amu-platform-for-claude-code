import "server-only";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { SystemPricingCatalogSchema, type ISystemPricingCatalogDocument } from "models/system";

const SYSTEM_PRICING_CATALOG_COLLECTION = "system_pricing_catalog";

export type SystemPricingCatalogRepoInput = {
  billingKey: string;
  provider: string;
  modelName: string;
  variant?: string;
  modality?: "text" | "audio" | "image" | "video";
  tokensPerCoin?: {
    input: number;
    output: number;
  } | null;
  fixedCost?: ISystemPricingCatalogDocument["fixedCost"];
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
};

async function getSystemPricingCatalogModel() {
  return await getModel<ISystemPricingCatalogDocument>(
    MONGODB_AMU_URL,
    "SystemPricingCatalog",
    SystemPricingCatalogSchema,
    SYSTEM_PRICING_CATALOG_COLLECTION,
  );
}

export async function listSystemPricingCatalogEntries() {
  const Model = await getSystemPricingCatalogModel();
  return await Model.find({})
    .sort({ provider: 1, modelName: 1, variant: 1, modality: 1, billingKey: 1 })
    .lean<ISystemPricingCatalogDocument[]>();
}

export async function upsertSystemPricingCatalogEntries(entries: SystemPricingCatalogRepoInput[]) {
  if (!entries.length) return;
  const Model = await getSystemPricingCatalogModel();
  await Model.bulkWrite(
    entries.map((entry) => ({
      updateOne: {
        filter: { billingKey: entry.billingKey },
        update: {
          $set: {
            provider: entry.provider,
            modelName: entry.modelName,
            variant: entry.variant || "",
            modality: entry.modality,
            tokensPerCoin: entry.tokensPerCoin || null,
            fixedCost: entry.fixedCost || null,
            effectiveFrom: entry.effectiveFrom || null,
            effectiveTo: entry.effectiveTo || null,
          },
          $setOnInsert: {
            billingKey: entry.billingKey,
          },
        },
        upsert: true,
      },
    })),
  );
}
