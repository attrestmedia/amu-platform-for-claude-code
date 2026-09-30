import { NextResponse } from "next/server";
import { GAME_ASSET_IMAGE_PROMPT_TEMPLATES } from "consts/game/gameAssetTemplates";
import { WORLD_ASSET_IMAGE_PROMPT_TEMPLATES } from "consts/game/worldAssetTemplates";
import {
  listRegisteredGameAssetImagePromptTemplates,
  upsertGameAssetImagePromptTemplates,
} from "libs/server-utils/game/gameAssetTemplateSeeder";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";

export const runtime = "nodejs";

export const GET = withAuth(
  async () => {
    try {
      const registered = await listRegisteredGameAssetImagePromptTemplates();

      return NextResponse.json(
        {
          ok: true,
          templates: [...GAME_ASSET_IMAGE_PROMPT_TEMPLATES, ...WORLD_ASSET_IMAGE_PROMPT_TEMPLATES],
          registered,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      logger.error("[GameAssetTemplates][GET] failed:", error);
      return NextResponse.json({ ok: false, error: "game_asset_templates_list_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets/templates:list",
  { requireAdmin: true },
);

export const POST = withAuth(
  async (_data, user) => {
    try {
      const updatedBy =
        (typeof user?.userEmailLower === "string" && user.userEmailLower) ||
        (typeof user?.email === "string" && user.email) ||
        (user?.ID ? String(user.ID) : "admin");
      const rows = await upsertGameAssetImagePromptTemplates(updatedBy);

      return NextResponse.json({
        ok: true,
        count: rows.length,
        data: rows,
      });
    } catch (error) {
      logger.error("[GameAssetTemplates][POST] failed:", error);
      return NextResponse.json({ ok: false, error: "game_asset_templates_seed_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets/templates:seed",
  { requireAdmin: true },
);
