import { NextResponse } from "next/server";
import { listGenStudioTemplateGroups } from "libs/database/lab";
import { resolveAvailableTemplateGroups } from "libs/server-utils/lab/genStudioTemplateGroupService";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Gen Studio 공개 이미지 템플릿 그룹 목록 제공
 * @process 공개·활성 그룹 조회 후 비활성/삭제 템플릿 key를 제거해 응답
 * @domain lab
 * @scope public
 */
export async function GET() {
  const groups = await listGenStudioTemplateGroups({ visibility: "public", enabled: true });
  const resolved = await resolveAvailableTemplateGroups(groups);
  return NextResponse.json(
    { ok: true, data: resolved.filter((group) => group.templateKeys.length > 0) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
