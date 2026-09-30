import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { toErrorLike } from "utils/common";
import {
  deleteScrapeLinkCategory,
  updateScrapeLinkCategory,
} from "libs/database/mini-apps/scrapeLinksRepo";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose API 라우트 (mini-apps/scrape-links/categories/[id]) — 카테고리 이름 변경/삭제
 * @process 인증 → uid 소유 확인 → 카테고리 수정 또는 삭제 후 링크 분류 동기화
 * @domain mini-app.scrape-links
 * @scope server_route
 */

type PatchBody = { name?: string };

function getIdFromRequest(request: NextRequest) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function validatePatchBody(data: PatchBody) {
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!name) return { valid: false, error: "name_required" };
  if (name.length > 40) return { valid: false, error: "name_too_long" };
  return { valid: true };
}

async function handlePATCH(data: PatchBody, user: AuthenticatedUserType, request: NextRequest) {
  const uid = String(user?.ID || "");
  const id = getIdFromRequest(request);
  if (!uid || !id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  try {
    const updated = await updateScrapeLinkCategory({ uid, id, name: data.name || "" });
    if (!updated) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return { ok: true, data: updated };
  } catch (err) {
    if (Number(toErrorLike(err).code) === 11000) {
      return NextResponse.json({ ok: false, error: "category_duplicated" }, { status: 409 });
    }
    throw err;
  }
}

async function handleDELETE(_body: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = String(user?.ID || "");
  const id = getIdFromRequest(request);
  if (!uid || !id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const ok = await deleteScrapeLinkCategory({ uid, id });
  if (!ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return { ok: true, data: { deleted: true } };
}

export const PATCH = withAuth(handlePATCH, validatePatchBody, "mini-apps/scrape-links/categories.patch", {
  bodyParser: "json",
});

export const DELETE = withAuth(handleDELETE, undefined, "mini-apps/scrape-links/categories.delete", {
  bodyParser: "none",
});
