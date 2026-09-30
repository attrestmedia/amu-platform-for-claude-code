import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  existsImagePromptKey,
  countImagePrompts,
  createImagePrompt,
  listImagePrompts,
  upsertImagePrompt,
  removeImagePrompt,
  removeImageTemplateKeyFromGroups,
  replaceImageTemplateKeyInGroups,
} from "libs/database/lab";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import { readOffsetPageParams, sliceOffsetPageRows } from "libs/server-utils/api/offsetPagination";
import { IMAGE_USAGE_TIP_MAX } from "consts/app";
import { PUBLIC_PROMPT_ACCESS_LEVELS, normalizePromptAccessLevel } from "utils/app/promptAccess";
import { rejectInvalidPromptTemplate } from "libs/server-utils/api/promptTemplateValidation";
import {
  hasLegacyImagePromptNegativeSection,
  normalizeImagePromptNegative,
  stripLegacyImagePromptNegativeSection,
} from "utils/lab";
import { isPlainObject, toErrorLike, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose 이미지 프롬프트 템플릿 목록/등록/수정 관리
 * @process GET 목록 조회  POST 생성/업데이트  인증/권한 검증  중복키 검사  DB 저장  응답 반환
 * @domain lab
 * @scope mixed
 */

export const runtime = "nodejs";

function getUsageTipOrError(body: UnknownRecord) {
  const usageTip = normalizeString(body?.usageTip);
  if (Array.from(usageTip).length > IMAGE_USAGE_TIP_MAX) return null;
  return usageTip;
}

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || undefined;
  const category = searchParams.get("category") || undefined;
  const enabled = searchParams.get("enabled");
  const enabledBool = enabled === null ? undefined : enabled === "true";
  const page = readOffsetPageParams(searchParams);
  const listParams = {
    q,
    category,
    enabled: enabledBool,
    accessLevels: PUBLIC_PROMPT_ACCESS_LEVELS,
  };
  const [rows, total] = await Promise.all([
    listImagePrompts({
      ...listParams,
      limit: typeof page.limit === "number" ? page.limit + 1 : undefined,
      skip: page.skip,
    }),
    typeof page.limit === "number" ? countImagePrompts(listParams) : Promise.resolve(undefined),
  ]);
  const { data, pageInfo } = sliceOffsetPageRows(rows, page, total);
  return NextResponse.json(
    { ok: true, data, ...(pageInfo ? { pageInfo } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// POST 관리자 가드 적용
async function postHandler(body: UnknownRecord, _user: unknown) {
  const usageTip = getUsageTipOrError(body);
  if (usageTip === null) {
    return NextResponse.json({ ok: false, error: "usage_tip_too_long", max: IMAGE_USAGE_TIP_MAX }, { status: 400 });
  }

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

  const categories = Array.isArray(body.categories) && body.categories.length > 0 ? body.categories : ["general"];

  // 이미 존재하면 409로 거절
  if (body.strictNew === true) {
    const exists = await existsImagePromptKey(String(body.key).trim());
    if (exists) {
      return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });
    }
    try {
      const created = await createImagePrompt({
        key: String(body.key).trim(),
        title: String(body.title).trim(),
        categories,
        templateText: sanitized.templateText,
        sceneTemplate: sanitized.sceneTemplate,
        accessLevel: normalizePromptAccessLevel(body.accessLevel),
        usageTip,
        defaultParams: sanitized.defaultParams,
        inputPolicy: sanitized.inputPolicy,
        tags: Array.isArray(body.tags) ? body.tags : [],
        enabled: body.enabled !== false,
        updatedBy: String(body.updatedBy || ""),
        version: Number(body.version ?? 1),
      });
      return NextResponse.json({ ok: true, data: created });
    } catch (e: unknown) {
      if (toErrorLike(e).errorCode === "DUPLICATE_KEY") {
        return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
  }

  const { originalKey, overwrite } = body;
  const newPayload = {
    key: String(body.key).trim(),
    title: String(body.title).trim(),
    categories,
    templateText: sanitized.templateText,
    sceneTemplate: sanitized.sceneTemplate,
    accessLevel: normalizePromptAccessLevel(body.accessLevel),
    usageTip,
    defaultParams: sanitized.defaultParams,
    inputPolicy: sanitized.inputPolicy,
    tags: Array.isArray(body.tags) ? body.tags : [],
    enabled: body.enabled !== false,
    updatedBy: String(body.updatedBy || ""),
    version: Number(body.version || 1),
  };

  // 1) 동일 키 수정(upsert)
  if (!originalKey || originalKey === body.key) {
    try {
      const saved = await upsertImagePrompt(newPayload);
      return NextResponse.json({ ok: true, data: saved });
    } catch {
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
  }

  // 2) 키 변경(리네임)
  const exists = await existsImagePromptKey(String(body.key).trim());
  if (exists && overwrite !== true) {
    return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });
  }
  const saved = await upsertImagePrompt(newPayload);
  await replaceImageTemplateKeyInGroups(String(originalKey).trim(), newPayload.key);
  await removeImagePrompt(String(originalKey).trim());
  return NextResponse.json({ ok: true, data: saved });
}
export const POST = withAuth(postHandler, undefined, "lab/image-prompts", { requireAdmin: true });

async function deleteHandler(body: UnknownRecord, _user: unknown) {
  const keyRaw = String(body?.key || "").trim();
  if (!keyRaw) {
    return NextResponse.json({ ok: false, error: "key_required" }, { status: 400 });
  }

  const decodedKey = decodeURIComponent(keyRaw);
  await removeImageTemplateKeyFromGroups(decodedKey);
  await removeImagePrompt(decodedKey);
  return NextResponse.json({ ok: true });
}

export const DELETE = withAuth(deleteHandler, undefined, "lab/image-prompts:delete", {
  requireAdmin: true,
});
