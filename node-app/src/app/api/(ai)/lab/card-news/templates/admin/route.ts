import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  listCardNewsTemplateRegistry,
  publishCardNewsTemplateVersion,
  registerCardNewsTemplate,
  setCardNewsTemplateStatus,
} from "libs/database/lab";
import {
  listCardNewsTemplatePresets,
  toBuiltInCardNewsTemplateRegistryEntry,
  validateCardNewsTemplatePreset,
} from "libs/card-news/templateResolver";
import { CARD_NEWS_BUILT_IN_TEMPLATE_ID } from "types/card-news";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common";

export const runtime = "nodejs";

type TemplateAdminAction = "register" | "publish_version" | "activate" | "deactivate";

/**
 * @docHint
 * @purpose 관리자용 CardNews preset 등록·버전 발행·활성화·비활성화 API
 * @process admin auth·immutable snapshot·monotonic version·single active version per template id
 * @domain card-news
 * @scope admin
 */

function actorOf(user: AuthenticatedUserType) {
  return String(user.userEmail || user.userEmailLower || user.ID || "").trim();
}

function actionOf(value: unknown): TemplateAdminAction | null {
  return ["register", "publish_version", "activate", "deactivate"].includes(String(value))
    ? String(value) as TemplateAdminAction
    : null;
}

function refKey(id: string, version: number) {
  return `${id}@${version}`;
}

function referenceOf(data: UnknownRecord) {
  const id = String(data.id || "").trim();
  const version = Number(data.version);
  if (!id || !Number.isInteger(version) || version < 1 || version > 100) return null;
  return { id, version };
}

function badRequest(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function getHandler() {
  const stored = await listCardNewsTemplateRegistry();
  const storedByRef = new Map(stored.map((entry) => [refKey(entry.id, entry.version), entry]));
  const builtIns = listCardNewsTemplatePresets().map((preset) => {
    const storedEntry = storedByRef.get(refKey(preset.id, preset.version));
    return storedEntry || toBuiltInCardNewsTemplateRegistryEntry(preset);
  });
  const builtInRefs = new Set(builtIns.map((entry) => refKey(entry.id, entry.version)));
  const customEntries = stored.filter((entry) => !builtInRefs.has(refKey(entry.id, entry.version)));
  return NextResponse.json({ ok: true, data: [...builtIns, ...customEntries] }, { headers: { "Cache-Control": "no-store" } });
}

async function postHandler(data: UnknownRecord, user: AuthenticatedUserType) {
  const action = actionOf(data.action);
  if (!action) return badRequest("card_news_template_action_invalid");
  const actor = actorOf(user);
  if (!actor) return badRequest("card_news_template_actor_required", 401);

  try {
    if (action === "register" || action === "publish_version") {
      const preset = validateCardNewsTemplatePreset(data.preset);
      const result = action === "register"
        ? await registerCardNewsTemplate({ preset, actor })
        : await publishCardNewsTemplateVersion({ preset, actor });
      if (result.kind === "duplicate") return badRequest("card_news_template_version_exists", 409);
      if (result.kind === "version_conflict") return badRequest(`card_news_template_next_version_required:${result.latestVersion + 1}`, 409);
      if (result.kind !== "ok") return badRequest("card_news_template_mutation_failed", 409);
      return NextResponse.json({ ok: true, data: result.entry }, { status: 201 });
    }

    const reference = referenceOf(data);
    if (!reference) return badRequest("card_news_template_reference_invalid");
    const result = await setCardNewsTemplateStatus({ ...reference, status: action === "activate" ? "active" : "inactive", actor });
    if (result.kind === "not_found") {
      if (reference.id === CARD_NEWS_BUILT_IN_TEMPLATE_ID) return badRequest("card_news_template_register_builtin_first", 409);
      return badRequest("card_news_template_not_found", 404);
    }
    if (result.kind !== "ok") return badRequest("card_news_template_mutation_failed", 409);
    return NextResponse.json({ ok: true, data: result.entry });
  } catch (error) {
    if (error instanceof Error && error.name === "CardNewsTemplateResolutionError") {
      return badRequest(error.message);
    }
    return badRequest("card_news_template_mutation_failed", 409);
  }
}

const validatePost = (data: UnknownRecord) => {
  const action = actionOf(data.action);
  if (!action) return { valid: false, error: "card_news_template_action_invalid" };
  if ((action === "register" || action === "publish_version") && !data.preset) {
    return { valid: false, error: "card_news_template_preset_required" };
  }
  if ((action === "activate" || action === "deactivate") && !referenceOf(data)) {
    return { valid: false, error: "card_news_template_reference_invalid" };
  }
  return { valid: true };
};

export const GET = withAuth(getHandler, undefined, "admin/lab/card-news/templates:list", {
  requireAdmin: true,
  bodyParser: "none",
});
export const POST = withAuth(postHandler, validatePost, "admin/lab/card-news/templates:write", {
  requireAdmin: true,
});
