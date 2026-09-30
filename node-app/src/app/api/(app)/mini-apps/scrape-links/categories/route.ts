import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { toErrorLike } from "utils/common";
import {
  createScrapeLinkCategory,
  listScrapeLinkCategories,
} from "libs/database/mini-apps/scrapeLinksRepo";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose API 라우트 (mini-apps/scrape-links/categories) — 카테고리 생성/조회
 * @process 인증 → 입력 검증 → 사용자별 카테고리 생성 또는 목록 조회 → JSON 반환
 * @domain mini-app.scrape-links
 * @scope server_route
 */

type PostBody = { name?: string };

function validatePostBody(data: PostBody) {
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!name) return { valid: false, error: "name_required" };
  if (name.length > 40) return { valid: false, error: "name_too_long" };
  return { valid: true };
}

async function handlePOST(data: PostBody, user: AuthenticatedUserType) {
  const uid = String(user?.ID || "");
  if (!uid) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  try {
    const category = await createScrapeLinkCategory({ uid, name: data.name || "" });
    if (!category) return NextResponse.json({ ok: false, error: "create_failed" }, { status: 400 });
    return { ok: true, data: category };
  } catch (err) {
    if (Number(toErrorLike(err).code) === 11000) {
      return NextResponse.json({ ok: false, error: "category_duplicated" }, { status: 409 });
    }
    throw err;
  }
}

async function handleGET(_data: unknown, user: AuthenticatedUserType) {
  const uid = String(user?.ID || "");
  if (!uid) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { items, total, uncategorized } = await listScrapeLinkCategories({ uid });
  return { ok: true, data: { items, total, uncategorized } };
}

export const POST = withAuth(handlePOST, validatePostBody, "mini-apps/scrape-links/categories", {
  bodyParser: "json",
});

export const GET = withAuth(handleGET, undefined, "mini-apps/scrape-links/categories", {
  bodyParser: "none",
});
