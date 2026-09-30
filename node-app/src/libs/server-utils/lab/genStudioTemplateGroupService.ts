import { listContentPrompts, listImagePrompts } from "libs/database/lab";
import { PUBLIC_PROMPT_ACCESS_LEVELS } from "utils/app/promptAccess";
import type { GenStudioTemplateGroupType } from "types/app";

export async function resolveAvailableTemplateGroup(group: GenStudioTemplateGroupType) {
  if (group.promptType === "audio") {
    // audio template group은 서버 계약/EL-501 전용이다. 기존 image/content UI에는 template key를 노출하지 않는다.
    return { ...group, templateKeys: [], coverTemplateKey: "", recommendedTemplateKeys: [] };
  }
  const listParams = {
    keys: group.templateKeys,
    enabled: true,
    accessLevels: PUBLIC_PROMPT_ACCESS_LEVELS,
  };
  const rows = group.templateKeys.length
    ? group.promptType === "content"
      ? await listContentPrompts(listParams)
      : await listImagePrompts(listParams)
    : [];
  const availableKeys = new Set(rows.map((row) => row.key));
  const templateKeys = group.templateKeys.filter((key) => availableKeys.has(key));
  return {
    ...group,
    templateKeys,
    coverTemplateKey: templateKeys.includes(group.coverTemplateKey)
      ? group.coverTemplateKey
      : templateKeys[0] || "",
    recommendedTemplateKeys: group.recommendedTemplateKeys.filter((key) => availableKeys.has(key)),
  };
}

export async function resolveAvailableTemplateGroups(groups: GenStudioTemplateGroupType[]) {
  return await Promise.all(groups.map(resolveAvailableTemplateGroup));
}
