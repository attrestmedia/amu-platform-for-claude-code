import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getUserKeyOrThrow, getUserImageModel } from "libs/server-utils/api/apiSafetyHelper";
import { readOffsetPageParams, sliceOffsetPageRows } from "libs/server-utils/api/offsetPagination";
import { IMAGE_STUDIO_USER_PROMPTS_KEY } from "consts/app";
import { existsImagePromptKey } from "libs/database/lab";
import { rejectInvalidPromptTemplate } from "libs/server-utils/api/promptTemplateValidation";
import { escapeRegExp } from "utils/normalize";
import {
  hasLegacyImagePromptNegativeSection,
  normalizeImagePromptNegative,
  stripLegacyImagePromptNegativeSection,
} from "utils/lab";
import { isPlainObject, type UnknownRecord } from "utils/common";

export const runtime = "nodejs";

function sanitizeTemplatePayload(body: UnknownRecord) {
  const rawTemplateText = String(body?.templateText || "").trim();
  const hasLegacyNegative = hasLegacyImagePromptNegativeSection(rawTemplateText);
  const defaultParams: UnknownRecord = isPlainObject(body?.defaultParams) ? { ...body.defaultParams } : {};
  const inputPolicy: UnknownRecord = isPlainObject(body?.inputPolicy) ? { ...body.inputPolicy } : {};
  const rawNegative = typeof defaultParams?.negative === "string" ? defaultParams.negative : "";
  const normalizedNegative = normalizeImagePromptNegative(rawNegative);

  if (hasLegacyNegative && !normalizedNegative) {
    return { ok: false as const, error: "legacy_negative_requires_manual_migration" };
  }

  return {
    ok: true as const,
    templateText: stripLegacyImagePromptNegativeSection(rawTemplateText),
    sceneTemplate: String(body?.sceneTemplate || "").trim(),
    defaultParams: {
      ...defaultParams,
      negative: normalizedNegative,
    },
    inputPolicy,
  };
}

export const GET = withAuth(
  async (_data: unknown, user: UnknownRecord, req: NextRequest) => {
    const userKey = getUserKeyOrThrow(user);
    const model = await getUserImageModel(userKey);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const safeQ = q ? q.slice(0, 64) : "";

    const category = (searchParams.get("category") || "").trim();
    const enabledRaw = searchParams.get("enabled");
    const enabled = enabledRaw === null ? undefined : enabledRaw === "true";
    const page = readOffsetPageParams(searchParams);

    const cond: UnknownRecord = {};
    if (typeof enabled === "boolean") cond.enabled = enabled;
    if (category) cond.categories = category;
    if (safeQ) {
      const rx = new RegExp(escapeRegExp(safeQ), "i");
      cond.$or = [
        { key: rx },
        { title: rx },
        { templateText: rx },
        { sceneTemplate: rx },
        { categories: rx },
        { tags: rx },
      ];
    }

    let query = model.find(cond).sort({ updatedAt: -1 });
    if (page.skip > 0) query = query.skip(page.skip);
    if (typeof page.limit === "number") query = query.limit(page.limit + 1);

    const [rows, total] = await Promise.all([
      query.lean(),
      typeof page.limit === "number" ? model.countDocuments(cond) : Promise.resolve(undefined),
    ]);
    const { data, pageInfo } = sliceOffsetPageRows(rows, page, total);
    return NextResponse.json({ ok: true, data, ...(pageInfo ? { pageInfo } : {}) });
  },
  undefined,
  `${IMAGE_STUDIO_USER_PROMPTS_KEY}:get`,
);

export const POST = withAuth(
  async (body: UnknownRecord, user: UnknownRecord) => {
    const userKey = getUserKeyOrThrow(user);
    const model = await getUserImageModel(userKey);

    if (!body?.key || !body?.title || !body?.templateText) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const sanitized = sanitizeTemplatePayload(body);
    if (!sanitized.ok) {
      return NextResponse.json({ ok: false, error: sanitized.error }, { status: 400 });
    }
    const invalidTemplate = rejectInvalidPromptTemplate({
      templateText: sanitized.templateText,
      sceneTemplate: sanitized.sceneTemplate,
    });
    if (invalidTemplate) return invalidTemplate;

    const key = String(body.key).trim();
    const originalKey = String(body.originalKey || key).trim();
    const categories = Array.isArray(body.categories) && body.categories.length ? body.categories : ["general"];

    if (body.strictNew === true) {
      if (await existsImagePromptKey(key)) {
        return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });
      }
      const exists = await model.exists({ key });
      if (exists) return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });

      const created = await model.create({
        key,
        title: String(body.title).trim(),
        categories,
        templateText: sanitized.templateText,
        sceneTemplate: sanitized.sceneTemplate,
        defaultParams: sanitized.defaultParams,
        inputPolicy: sanitized.inputPolicy,
        tags: Array.isArray(body.tags) ? body.tags : [],
        enabled: body.enabled !== false,
        updatedBy: user?.userEmailLower || user?.userEmail || user?.id || "",
        version: Number(body.version ?? 1),
      });

      return NextResponse.json({ ok: true, data: created.toObject() });
    }

    const changedKey = Boolean(originalKey && originalKey !== key);
    if (changedKey) {
      if (await existsImagePromptKey(key)) {
        return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });
      }
      const exists = await model.exists({ key });
      if (exists && body.overwrite !== true) {
        return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });
      }
    }

    const saved = await model
      .findOneAndUpdate(
        { key },
        {
          $set: {
            title: String(body.title).trim(),
            categories,
            templateText: sanitized.templateText,
            sceneTemplate: sanitized.sceneTemplate,
            defaultParams: sanitized.defaultParams,
            inputPolicy: sanitized.inputPolicy,
            tags: Array.isArray(body.tags) ? body.tags : [],
            enabled: body.enabled !== false,
            updatedBy: user?.userEmailLower || user?.userEmail || user?.id || "",
            version: Number(body.version ?? 1),
          },
        },
        { upsert: true, new: true },
      )
      .lean();

    if (changedKey) {
      await model.deleteOne({ key: originalKey });
    }

    return NextResponse.json({ ok: true, data: saved });
  },
  undefined,
  `${IMAGE_STUDIO_USER_PROMPTS_KEY}:write`,
);

export const DELETE = withAuth(
  async (body: UnknownRecord, user: UnknownRecord) => {
    const userKey = getUserKeyOrThrow(user);
    const model = await getUserImageModel(userKey);

    const key = String(body?.key || "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "key_required" }, { status: 400 });

    await model.deleteOne({ key });
    return NextResponse.json({ ok: true });
  },
  undefined,
  `${IMAGE_STUDIO_USER_PROMPTS_KEY}:delete`,
);
