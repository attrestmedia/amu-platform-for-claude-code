import "server-only";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  SYSTEM_MODEL_CATALOG_MODALITY_TYPES,
  SystemModelCatalogSchema,
  type ISystemModelCatalogDocument,
  type SystemModelCatalogModalityType,
} from "models/system";

const SYSTEM_MODEL_CATALOG_COLLECTION = "system_model_catalog";

export type SystemModelCatalogRepoInput = {
  provider: string;
  modelName: string;
  modality: SystemModelCatalogModalityType;
  displayName: string;
  upstreamModelName: string;
  enabled: boolean;
  adminOnly: boolean;
  defaultModel: boolean;
  recommendedModel: boolean;
  supportsImageInput: boolean;
  supportsAudioInput: boolean;
  supportsAudioUnderstanding: boolean;
  reasoningEffort?: string;
  status?: "active" | "deprecated";
};

async function getSystemModelCatalogModel() {
  return await getModel<ISystemModelCatalogDocument>(
    MONGODB_AMU_URL,
    "SystemModelCatalog",
    SystemModelCatalogSchema,
    SYSTEM_MODEL_CATALOG_COLLECTION,
  );
}

export async function listSystemModelCatalogEntries() {
  const Model = await getSystemModelCatalogModel();
  return await Model.find({})
    .sort({ modality: 1, provider: 1, modelName: 1 })
    .lean<ISystemModelCatalogDocument[]>();
}

export async function upsertSystemModelCatalogEntries(entries: SystemModelCatalogRepoInput[]) {
  if (!entries.length) return;
  const Model = await getSystemModelCatalogModel();
  await Model.bulkWrite(
    entries.map((entry) => ({
      updateOne: {
        filter: {
          provider: entry.provider,
          modelName: entry.modelName,
          modality: entry.modality,
        },
        update: {
          $set: {
            displayName: entry.displayName,
            upstreamModelName: entry.upstreamModelName,
            enabled: entry.enabled,
            adminOnly: entry.adminOnly,
            defaultModel: entry.defaultModel,
            recommendedModel: entry.recommendedModel,
            supportsImageInput: entry.supportsImageInput,
            supportsAudioInput: entry.supportsAudioInput,
            supportsAudioUnderstanding: entry.supportsAudioUnderstanding,
            reasoningEffort: String(entry.reasoningEffort || ""),
            status: entry.status || "active",
          },
          $setOnInsert: {
            provider: entry.provider,
            modelName: entry.modelName,
            modality: entry.modality,
          },
        },
        upsert: true,
      },
    })),
  );
}

export async function deleteSystemModelCatalogEntries(
  entries: Array<{ provider: string; modelName: string; modality: SystemModelCatalogModalityType }>,
) {
  const targets = entries
    .map((entry) => ({
      provider: String(entry.provider || "").trim().toLowerCase(),
      modelName: String(entry.modelName || "").trim(),
      modality: entry.modality,
    }))
    .filter(
      (entry) =>
        entry.provider &&
        entry.modelName &&
        (SYSTEM_MODEL_CATALOG_MODALITY_TYPES as readonly string[]).includes(entry.modality),
    );

  if (!targets.length) return { deletedCount: 0 };

  const Model = await getSystemModelCatalogModel();
  const result = await Model.deleteMany({ $or: targets });
  return { deletedCount: Number(result.deletedCount || 0) };
}
