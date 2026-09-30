import "server-only";
import { GAME_ASSET_IMAGE_PROMPT_TEMPLATES } from "consts/game/gameAssetTemplates";
import { WORLD_ASSET_IMAGE_PROMPT_TEMPLATES } from "consts/game/worldAssetTemplates";
import { listImagePrompts, upsertImagePrompt } from "libs/database/lab";

const ALL_GAME_ASSET_IMAGE_PROMPT_TEMPLATES = [
  ...GAME_ASSET_IMAGE_PROMPT_TEMPLATES,
  ...WORLD_ASSET_IMAGE_PROMPT_TEMPLATES,
];

export async function upsertGameAssetImagePromptTemplates(updatedBy?: string) {
  const actor = String(updatedBy || "").trim();

  const rows = await Promise.all(
    ALL_GAME_ASSET_IMAGE_PROMPT_TEMPLATES.map((template) =>
      upsertImagePrompt({
        ...template,
        accessLevel: template.accessLevel || "admin",
        updatedBy: actor || template.updatedBy || "system",
      }),
    ),
  );

  return rows;
}

export async function listRegisteredGameAssetImagePromptTemplates() {
  const rows = await listImagePrompts({
    q: "amu-game-",
    accessLevels: ["admin"],
  });

  const keys = new Set(ALL_GAME_ASSET_IMAGE_PROMPT_TEMPLATES.map((template) => template.key));
  return rows.filter((row) => keys.has(row.key));
}
