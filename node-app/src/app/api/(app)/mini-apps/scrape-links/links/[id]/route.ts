import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { updateScrapeLink, deleteScrapeLink } from "libs/database/mini-apps/scrapeLinksRepo";

import { toErrorLike } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
/**
 * @docHint
 * @purpose API 라우트 (mini-apps/scrape-links/links/[id]) — 라벨/체크/삭제
 * @process 인증 → uid 소유 확인 → 부분 업데이트 또는 삭제
 * @domain mini-app.scrape-links
 * @scope server_route
 */

type PatchBody = { label?: string; note?: string; checked?: boolean; categoryId?: string | null };

function getIdFromRequest(request: NextRequest) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function validatePatchBody(data: PatchBody) {
  if (
    typeof data?.label !== "string" &&
    typeof data?.note !== "string" &&
    typeof data?.checked !== "boolean" &&
    typeof data?.categoryId !== "string" &&
    data?.categoryId !== null
  ) {
    return { valid: false, error: "empty_patch" };
  }
  return { valid: true };
}

async function handlePATCH(data: PatchBody, user: AuthenticatedUserType, request: NextRequest) {
  const uid = String(user?.ID || "");
  const id = getIdFromRequest(request);
  if (!uid || !id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let updated;
  try {
    updated = await updateScrapeLink({ uid, id, patch: data });
  } catch (err) {
    if (toErrorLike(err).message === "category_not_found") {
      return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 400 });
    }
    throw err;
  }
  if (!updated) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return { ok: true, data: updated };
}

async function handleDELETE(_body: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = String(user?.ID || "");
  const id = getIdFromRequest(request);
  if (!uid || !id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const ok = await deleteScrapeLink({ uid, id });
  if (!ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return { ok: true, data: { deleted: true } };
}

export const PATCH = withAuth(handlePATCH, validatePatchBody, "mini-apps/scrape-links/links.patch", {
  bodyParser: "json",
});

export const DELETE = withAuth(handleDELETE, undefined, "mini-apps/scrape-links/links.delete", {
  bodyParser: "none",
});
