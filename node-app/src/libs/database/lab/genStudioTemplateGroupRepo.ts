import { getModel } from "libs/database/modelCache";
import {
  GenStudioTemplateGroupSchema,
  type IGenStudioTemplateGroupDocument,
} from "models/lab";
import { MONGODB_AI_URL } from "consts/env/server";
import { MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS } from "consts/app";
import type { GenStudioTemplateGroupType } from "types/app";

const COLLECTION = "gen_studio_template_groups";

type TemplateGroupCreateInput = Omit<
  GenStudioTemplateGroupType,
  "promptType" | "recommendedTemplateKeys" | "recommendedDescription"
> &
  Partial<Pick<GenStudioTemplateGroupType, "promptType" | "recommendedTemplateKeys" | "recommendedDescription">>;
type TemplateGroupMetadataInput = Pick<
  GenStudioTemplateGroupType,
  "title" | "description" | "visibility" | "serviceKeys" | "enabled" | "sortOrder" | "updatedBy"
>;
type TemplateGroupDataLike = {
  key?: unknown;
  promptType?: unknown;
  title?: unknown;
  description?: unknown;
  visibility?: unknown;
  serviceKeys?: unknown;
  templateKeys?: unknown;
  coverTemplateKey?: unknown;
  recommendedTemplateKeys?: unknown;
  recommendedDescription?: unknown;
  enabled?: unknown;
  sortOrder?: unknown;
  updatedBy?: unknown;
};

async function getTemplateGroupModel() {
  return await getModel<IGenStudioTemplateGroupDocument>(
    MONGODB_AI_URL,
    "GenStudioTemplateGroup",
    GenStudioTemplateGroupSchema,
    COLLECTION,
  );
}

export function toGenStudioTemplateGroupData(
  value: TemplateGroupDataLike | null | undefined,
): GenStudioTemplateGroupType | null {
  if (!value?.key) return null;
  const templateKeys = Array.isArray(value.templateKeys) ? value.templateKeys.map(String) : [];
  const templateKeySet = new Set(templateKeys);
  const recommendedDescription =
    value.recommendedDescription && typeof value.recommendedDescription === "object"
      ? (value.recommendedDescription as { ko?: unknown; en?: unknown })
      : null;
  return {
    key: String(value.key),
    promptType: value.promptType === "content" ? "content" : value.promptType === "audio" ? "audio" : "image",
    title: String(value.title || ""),
    description: String(value.description || ""),
    visibility: value.visibility === "public" ? "public" : "private",
    serviceKeys: Array.isArray(value.serviceKeys) ? value.serviceKeys.map(String) : [],
    templateKeys,
    coverTemplateKey: String(value.coverTemplateKey || ""),
    // 추천은 항상 templateKeys의 부분집합으로 노출 (문서가 어긋나도 읽기 시점에 정리)
    recommendedTemplateKeys: Array.isArray(value.recommendedTemplateKeys)
      ? value.recommendedTemplateKeys.map(String).filter((key) => templateKeySet.has(key))
      : [],
    recommendedDescription: {
      ko: String(recommendedDescription?.ko || ""),
      en: String(recommendedDescription?.en || ""),
    },
    enabled: value.enabled !== false,
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : 100,
    updatedBy: String(value.updatedBy || ""),
  };
}

export async function listGenStudioTemplateGroups(params?: {
  visibility?: "public" | "private";
  enabled?: boolean;
  serviceKey?: string;
}) {
  const model = await getTemplateGroupModel();
  const condition: Record<string, unknown> = {};
  if (params?.visibility) condition.visibility = params.visibility;
  if (typeof params?.enabled === "boolean") condition.enabled = params.enabled;
  if (params?.serviceKey) condition.serviceKeys = params.serviceKey;
  const rows = await model.find(condition).sort({ sortOrder: 1, updatedAt: -1 }).lean();
  return rows.map((row) => toGenStudioTemplateGroupData(row)).filter(Boolean) as GenStudioTemplateGroupType[];
}

export async function getGenStudioTemplateGroupByKey(key: string) {
  const model = await getTemplateGroupModel();
  const row = await model.findOne({ key }).lean();
  return toGenStudioTemplateGroupData(row);
}

export async function createGenStudioTemplateGroup(input: TemplateGroupCreateInput) {
  const model = await getTemplateGroupModel();
  const promptType = input.promptType === "content" ? "content" : input.promptType === "audio" ? "audio" : "image";
  const row = await model.create({ ...input, promptType });
  return toGenStudioTemplateGroupData(row.toObject());
}

// 추천 키/설명 설정 — 추천은 templateKeys의 부분집합만 허용 (호출 측 검증 + 저장 시 재정리)
export async function setGenStudioTemplateGroupRecommended(
  key: string,
  input: {
    recommendedTemplateKeys: string[];
    recommendedDescription: { ko: string; en: string };
    updatedBy: string;
  },
) {
  const model = await getTemplateGroupModel();
  const current = await model.findOne({ key }).lean();
  if (!current) return null;
  const templateKeySet = new Set(current.templateKeys || []);
  const recommendedTemplateKeys = Array.from(
    new Set(input.recommendedTemplateKeys.map((item) => String(item || "").trim()).filter(Boolean)),
  ).filter((item) => templateKeySet.has(item));
  const row = await model
    .findOneAndUpdate(
      { key },
      {
        $set: {
          recommendedTemplateKeys,
          recommendedDescription: {
            ko: String(input.recommendedDescription.ko || ""),
            en: String(input.recommendedDescription.en || ""),
          },
          updatedBy: input.updatedBy,
          updatedAt: new Date(),
        },
      },
      { new: true },
    )
    .lean();
  return toGenStudioTemplateGroupData(row);
}

export async function updateGenStudioTemplateGroupMetadata(key: string, input: TemplateGroupMetadataInput) {
  const model = await getTemplateGroupModel();
  const row = await model
    .findOneAndUpdate({ key }, { $set: { ...input, updatedAt: new Date() } }, { new: true })
    .lean();
  return toGenStudioTemplateGroupData(row);
}

export async function addTemplateKeysToGenStudioGroup(key: string, templateKeys: string[], updatedBy: string) {
  const model = await getTemplateGroupModel();
  const current = await model.findOne({ key }).lean();
  if (!current) return null;
  const nextTemplateKeys = Array.from(new Set([...(current.templateKeys || []), ...templateKeys]));
  if (nextTemplateKeys.length > MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS) {
    const error = new Error("template_group_limit_exceeded") as Error & { errorCode?: string };
    error.errorCode = "TEMPLATE_GROUP_LIMIT_EXCEEDED";
    throw error;
  }
  const coverTemplateKey = current.coverTemplateKey || nextTemplateKeys[0] || "";
  const row = await model
    .findOneAndUpdate(
      { key },
      { $set: { templateKeys: nextTemplateKeys, coverTemplateKey, updatedBy, updatedAt: new Date() } },
      { new: true },
    )
    .lean();
  return toGenStudioTemplateGroupData(row);
}

export async function removeTemplateKeysFromGenStudioGroup(key: string, templateKeys: string[], updatedBy: string) {
  const model = await getTemplateGroupModel();
  const current = await model.findOne({ key }).lean();
  if (!current) return null;
  const removeSet = new Set(templateKeys);
  const nextTemplateKeys = (current.templateKeys || []).filter((templateKey) => !removeSet.has(templateKey));
  const coverTemplateKey = nextTemplateKeys.includes(current.coverTemplateKey)
    ? current.coverTemplateKey
    : nextTemplateKeys[0] || "";
  const nextTemplateKeySet = new Set(nextTemplateKeys);
  const recommendedTemplateKeys = (current.recommendedTemplateKeys || []).filter((templateKey) =>
    nextTemplateKeySet.has(templateKey),
  );
  const row = await model
    .findOneAndUpdate(
      { key },
      {
        $set: {
          templateKeys: nextTemplateKeys,
          coverTemplateKey,
          recommendedTemplateKeys,
          updatedBy,
          updatedAt: new Date(),
        },
      },
      { new: true },
    )
    .lean();
  return toGenStudioTemplateGroupData(row);
}

export async function removeGenStudioTemplateGroup(key: string) {
  const model = await getTemplateGroupModel();
  const result = await model.deleteOne({ key });
  return result.deletedCount > 0;
}

export async function replaceImageTemplateKeyInGroups(previousKey: string, nextKey: string) {
  const model = await getTemplateGroupModel();
  const rows = await model.find({ templateKeys: previousKey }).lean();
  if (!rows.length) return;
  await model.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            templateKeys: Array.from(
              new Set((row.templateKeys || []).map((key) => (key === previousKey ? nextKey : key))),
            ),
            coverTemplateKey: row.coverTemplateKey === previousKey ? nextKey : row.coverTemplateKey,
            recommendedTemplateKeys: Array.from(
              new Set((row.recommendedTemplateKeys || []).map((key) => (key === previousKey ? nextKey : key))),
            ),
            updatedAt: new Date(),
          },
        },
      },
    })),
  );
}

export async function removeImageTemplateKeyFromGroups(templateKey: string) {
  const model = await getTemplateGroupModel();
  const rows = await model.find({ templateKeys: templateKey }).lean();
  if (!rows.length) return;
  await model.bulkWrite(
    rows.map((row) => {
      const templateKeys = (row.templateKeys || []).filter((key) => key !== templateKey);
      return {
        updateOne: {
          filter: { _id: row._id },
          update: {
            $set: {
              templateKeys,
              coverTemplateKey:
                row.coverTemplateKey === templateKey ? templateKeys[0] || "" : row.coverTemplateKey,
              recommendedTemplateKeys: (row.recommendedTemplateKeys || []).filter((key) => key !== templateKey),
              updatedAt: new Date(),
            },
          },
        },
      };
    }),
  );
}
