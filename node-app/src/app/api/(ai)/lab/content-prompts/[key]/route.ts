import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getContentPromptByKey, removeContentPrompt } from "libs/database/lab";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose 콘텐츠 프롬프트 템플릿 단건 조회
 * @process key 기반 조회  결과 반환
 * @domain lab
 * @scope mixed
 */

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  const doc = await getContentPromptByKey(key);
  if (!doc) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, data: doc });
}

async function delHandler(_data: unknown, _user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const raw = String(ctx?.params?.key || "");
  const key = decodeURIComponent(raw);
  if (!key) return NextResponse.json({ ok: false, error: "key_required" }, { status: 400 });
  await removeContentPrompt(key);
  return NextResponse.json({ ok: true });
}
export const DELETE = withAuth(delHandler, undefined, "lab/content-prompts:delete", { requireAdmin: true });
