import {
  addTemplateKeysToGenStudioGroup,
  createGenStudioTemplateGroup,
  getGenStudioTemplateGroupByKey,
  listContentPrompts,
  listImagePrompts,
  removeTemplateKeysFromGenStudioGroup,
  setGenStudioTemplateGroupRecommended,
  updateGenStudioTemplateGroupMetadata,
} from "libs/database/lab";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import { MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS } from "consts/app";
import { normalizeKey } from "utils/normalize";
import { PUBLIC_PROMPT_ACCESS_LEVELS } from "utils/app/promptAccess";
import { toErrorLike, type UnknownRecord } from "utils/common";
import type { GenStudioTemplateGroupType } from "types/app";
import { isApprovedStudioAudioTemplateKey } from "libs/server-utils/lab/studioAudioContract";

export type GenStudioTemplateGroupMutationAction =
  | "create"
  | "update"
  | "add_templates"
  | "remove_templates"
  | "set_recommended";

export type GenStudioTemplateGroupMutationResult =
  | { ok: true; status: 200; data: GenStudioTemplateGroupType | null }
  | { ok: false; status: 400 | 404 | 409; error: string; details?: UnknownRecord };

const MAX_RECOMMENDED_DESCRIPTION_LENGTH = 200;
const GROUP_MUTATION_ACTIONS: GenStudioTemplateGroupMutationAction[] = [
  "create",
  "update",
  "add_templates",
  "remove_templates",
  "set_recommended",
];

function failure(
  error: string,
  status: 400 | 404 | 409,
  details?: UnknownRecord,
): GenStudioTemplateGroupMutationResult {
  return { ok: false, status, error, ...(details ? { details } : {}) };
}

function normalizeKeyArray(value: unknown, max = MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item || "").trim()).filter(Boolean)),
  ).slice(0, max + 1);
}

function normalizeServiceKeys(value: unknown) {
  return Array.from(new Set(normalizeKeyArray(value, 20).map(normalizeKey).filter(Boolean)));
}

function sameStringList(left: string[], right: string[]) {
  return [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
}

async function validateTemplateKeys(templateKeys: string[], promptType: "image" | "content" | "audio" = "image") {
  if (templateKeys.length > MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS) return false;
  if (!templateKeys.length) return true;
  if (promptType === "audio") return templateKeys.every((templateKey) => isApprovedStudioAudioTemplateKey(templateKey));
  const params = {
    keys: templateKeys,
    enabled: true,
    accessLevels: PUBLIC_PROMPT_ACCESS_LEVELS,
  };
  const rows = promptType === "content" ? await listContentPrompts(params) : await listImagePrompts(params);
  return new Set(rows.map((row) => row.key)).size === templateKeys.length;
}

function readRecommendedDescription(body: UnknownRecord) {
  const raw =
    body.recommendedDescription && typeof body.recommendedDescription === "object"
      ? (body.recommendedDescription as { ko?: unknown; en?: unknown })
      : null;
  return {
    ko: normalizeString(raw?.ko).slice(0, MAX_RECOMMENDED_DESCRIPTION_LENGTH),
    en: normalizeString(raw?.en).slice(0, MAX_RECOMMENDED_DESCRIPTION_LENGTH),
  };
}

function readMetadata(body: UnknownRecord) {
  return {
    title: normalizeString(body.title),
    description: normalizeString(body.description),
    visibility: body.visibility === "public" ? ("public" as const) : ("private" as const),
    serviceKeys: normalizeServiceKeys(body.serviceKeys),
  };
}

export async function mutateGenStudioTemplateGroup(
  body: UnknownRecord,
  actor: string,
): Promise<GenStudioTemplateGroupMutationResult> {
  const action = String(body.action || "") as GenStudioTemplateGroupMutationAction;
  if (!GROUP_MUTATION_ACTIONS.includes(action)) return failure("invalid_action", 400);

  const rawKey = String(body.key || "").trim();
  const key = normalizeKey(rawKey);
  if (!key || key !== rawKey) return failure("invalid_group_key", 400);

  const existing = await getGenStudioTemplateGroupByKey(key);
  const templateKeys = normalizeKeyArray(body.templateKeys);
  const updatedBy = String(actor || "").trim() || "unknown";

  if (action === "create") {
    if (existing) return failure("duplicate_group_key", 409);
    const metadata = readMetadata(body);
    const promptType: "image" | "content" | "audio" = body.promptType === "content"
      ? "content"
      : body.promptType === "audio"
        ? "audio"
        : "image";
    if (!metadata.title || metadata.title.length > 80 || metadata.description.length > 300) {
      return failure("invalid_group_metadata", 400);
    }
    if (!(await validateTemplateKeys(templateKeys, promptType))) return failure("invalid_template_keys", 400);

    try {
      const data = await createGenStudioTemplateGroup({
        key,
        promptType,
        ...metadata,
        templateKeys,
        coverTemplateKey: templateKeys[0] || "",
        enabled: true,
        sortOrder: 100,
        updatedBy,
      });
      return { ok: true, status: 200, data };
    } catch (error) {
      if (Number(toErrorLike(error).code) === 11000) return failure("duplicate_group_key", 409);
      throw error;
    }
  }

  if (!existing) return failure("not_found", 404);

  if (action === "set_recommended") {
    const recommendedTemplateKeys = normalizeKeyArray(body.recommendedTemplateKeys);
    const templateKeySet = new Set(existing.templateKeys);
    if (recommendedTemplateKeys.some((templateKey) => !templateKeySet.has(templateKey))) {
      return failure("recommended_keys_not_in_group", 400);
    }
    const data = await setGenStudioTemplateGroupRecommended(key, {
      recommendedTemplateKeys,
      recommendedDescription: readRecommendedDescription(body),
      updatedBy,
    });
    return { ok: true, status: 200, data };
  }

  if (action === "update") {
    const metadata = readMetadata(body);
    if (!metadata.title || metadata.title.length > 80 || metadata.description.length > 300) {
      return failure("invalid_group_metadata", 400);
    }
    const metadataChanged =
      metadata.title !== existing.title ||
      metadata.description !== existing.description ||
      metadata.visibility !== existing.visibility ||
      !sameStringList(metadata.serviceKeys, existing.serviceKeys);
    if (existing.serviceKeys.length > 0 && metadataChanged) {
      return failure("group_metadata_locked", 409, { serviceKeys: existing.serviceKeys });
    }
    const data = await updateGenStudioTemplateGroupMetadata(key, {
      ...metadata,
      enabled: existing.enabled,
      sortOrder: existing.sortOrder,
      updatedBy,
    });
    return { ok: true, status: 200, data };
  }

  if (action === "add_templates" && !(await validateTemplateKeys(templateKeys, existing.promptType))) {
    return failure("invalid_template_keys", 400);
  }

  try {
    const data =
      action === "add_templates"
        ? await addTemplateKeysToGenStudioGroup(key, templateKeys, updatedBy)
        : await removeTemplateKeysFromGenStudioGroup(key, templateKeys, updatedBy);
    return { ok: true, status: 200, data };
  } catch (error) {
    if (toErrorLike(error).errorCode === "TEMPLATE_GROUP_LIMIT_EXCEEDED") {
      return failure("template_group_limit_exceeded", 400, { max: MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS });
    }
    throw error;
  }
}
