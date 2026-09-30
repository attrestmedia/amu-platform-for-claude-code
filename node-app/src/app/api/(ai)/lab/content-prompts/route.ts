import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  existsContentPromptKey,
  countContentPrompts,
  createContentPrompt,
  listContentPrompts,
  upsertContentPrompt,
  removeContentPrompt,
} from "libs/database/lab";
import { readOffsetPageParams, sliceOffsetPageRows } from "libs/server-utils/api/offsetPagination";
import { rejectInvalidPromptTemplate } from "libs/server-utils/api/promptTemplateValidation";
import { PUBLIC_PROMPT_ACCESS_LEVELS, normalizePromptAccessLevel } from "utils/app/promptAccess";
import { isPlainObject, toErrorLike, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose 콘텐츠 프롬프트 템플릿 목록/등록/수정 관리
 * @process GET 목록 조회  POST 생성/업데이트  인증/권한 검증  중복키 검사  DB 저장  응답 반환
 * @domain lab
 * @scope mixed
 */

export const runtime = "nodejs";

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
    listContentPrompts({
      ...listParams,
      limit: typeof page.limit === "number" ? page.limit + 1 : undefined,
      skip: page.skip,
    }),
    typeof page.limit === "number" ? countContentPrompts(listParams) : Promise.resolve(undefined),
  ]);
  const { data, pageInfo } = sliceOffsetPageRows(rows, page, total);
  return NextResponse.json(
    { ok: true, data, ...(pageInfo ? { pageInfo } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function postHandler(body: UnknownRecord, _user: unknown) {
  if (!body?.key || !body?.title || !body?.templateText) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const templateText = String(body.templateText || "").trim();
  const invalidTemplate = rejectInvalidPromptTemplate({ templateText });
  if (invalidTemplate) return invalidTemplate;

  const categories = Array.isArray(body.categories) && body.categories.length > 0 ? body.categories : ["general"];

  // 이미 존재하면 409로 거절
  if (body.strictNew === true) {
    const exists = await existsContentPromptKey(String(body.key).trim());
    if (exists) {
      return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });
    }
    try {
      const defaultParams: UnknownRecord | undefined = isPlainObject(body.defaultParams)
        ? body.defaultParams
        : body.defaultParams === undefined
          ? undefined
          : {};
      const created = await createContentPrompt({
        key: String(body.key).trim(),
        title: String(body.title).trim(),
        categories,
        templateText,
        accessLevel: normalizePromptAccessLevel(body.accessLevel),
        ...(defaultParams !== undefined ? { defaultParams } : {}),
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
  const defaultParams: UnknownRecord | undefined = isPlainObject(body.defaultParams)
    ? body.defaultParams
    : body.defaultParams === undefined
      ? undefined
      : {};
  const newPayload = {
    key: String(body.key).trim(),
    title: String(body.title).trim(),
    categories,
    templateText,
    accessLevel: normalizePromptAccessLevel(body.accessLevel),
    ...(defaultParams !== undefined ? { defaultParams } : {}),
    tags: Array.isArray(body.tags) ? body.tags : [],
    enabled: body.enabled !== false,
    updatedBy: String(body.updatedBy || ""),
    version: Number(body.version ?? 1),
  };

  // 1) 동일 키 수정(upsert)
  if (!originalKey || originalKey === body.key) {
    try {
      const saved = await upsertContentPrompt(newPayload);
      return NextResponse.json({ ok: true, data: saved });
    } catch {
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
  }

  // 2) 키 변경(리네임)
  const exists = await existsContentPromptKey(String(body.key).trim());
  if (exists && overwrite !== true) {
    return NextResponse.json({ ok: false, error: "duplicate_key" }, { status: 409 });
  }
  const saved = await upsertContentPrompt(newPayload);
  await removeContentPrompt(String(originalKey).trim());
  return NextResponse.json({ ok: true, data: saved });
}
export const POST = withAuth(postHandler, undefined, "lab/content-prompts", { requireAdmin: true });
