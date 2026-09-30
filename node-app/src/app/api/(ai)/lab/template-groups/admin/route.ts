import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getGenStudioTemplateGroupByKey,
  listGenStudioTemplateGroups,
  removeGenStudioTemplateGroup,
} from "libs/database/lab";
import { mutateGenStudioTemplateGroup } from "libs/server-utils/lab/genStudioTemplateGroupMutationService";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

function getActor(user: AuthenticatedUserType) {
  return String(user.userEmail || user.userEmailLower || user.ID || "").trim();
}

/**
 * @docHint
 * @purpose 관리자용 Gen Studio 템플릿 그룹 조회·생성·수정·멤버십 관리
 * @process 관리자 인증  입력 검증  연결 그룹 메타 잠금  100개 제한  저장
 * @domain lab
 * @scope admin
 */
async function getHandler() {
  return NextResponse.json(
    { ok: true, data: await listGenStudioTemplateGroups() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function postHandler(body: UnknownRecord, user: AuthenticatedUserType) {
  const result = await mutateGenStudioTemplateGroup(body, getActor(user));
  const { status, ...payload } = result;
  return NextResponse.json(payload, { status });
}

async function deleteHandler(body: UnknownRecord) {
  const key = String(body.key || "").trim();
  const confirmKey = String(body.confirmKey || "").trim();
  if (!key || confirmKey !== key) {
    return NextResponse.json({ ok: false, error: "group_key_confirmation_required" }, { status: 400 });
  }
  const existing = await getGenStudioTemplateGroupByKey(key);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await removeGenStudioTemplateGroup(key);
  return NextResponse.json({ ok: true });
}

export const GET = withAuth(getHandler, undefined, "lab/template-groups:admin-list", {
  requireAdmin: true,
  bodyParser: "none",
});
export const POST = withAuth(postHandler, undefined, "lab/template-groups:admin-write", { requireAdmin: true });
export const DELETE = withAuth(deleteHandler, undefined, "lab/template-groups:admin-delete", {
  requireAdmin: true,
});
