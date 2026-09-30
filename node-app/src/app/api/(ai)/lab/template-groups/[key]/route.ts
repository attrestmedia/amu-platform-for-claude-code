import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getGenStudioTemplateGroupByKey } from "libs/database/lab";
import { resolveAvailableTemplateGroup } from "libs/server-utils/lab/genStudioTemplateGroupService";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 인증된 서비스 화면에 공개·비공개 Gen Studio 템플릿 그룹 제공
 * @process key 조회  활성 여부 확인  유효한 공개 템플릿만 선별  응답
 * @domain lab
 * @scope authenticated
 */
async function getHandler(
  _data: unknown,
  _user: AuthenticatedUserType,
  _request: NextRequest,
  context: NextRouteContext,
) {
  const key = decodeURIComponent(String(context.params.key || "")).trim();
  const group = await getGenStudioTemplateGroupByKey(key);
  if (!group || !group.enabled) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, data: await resolveAvailableTemplateGroup(group) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withAuth(getHandler, undefined, "lab/template-groups:get", { bodyParser: "none" });
