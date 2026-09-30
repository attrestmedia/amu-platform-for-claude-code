import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { extractAndNormalizeAll, normalizeUrl, safeDomain } from "utils/mini-apps/scrapeLinks";
import { insertScrapeLinksBulk, listScrapeLinks } from "libs/database/mini-apps/scrapeLinksRepo";

import { toErrorLike } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
/**
 * @docHint
 * @purpose API 라우트 (mini-apps/scrape-links/links) — 개인 링크 추가/조회
 * @process 인증 → 입력 파싱 → 정규화/중복 제거 → DB 저장 or 페이징 조회 → JSON 반환
 * @domain mini-app.scrape-links
 * @scope server_route
 */

type PostBody = {
  text?: string;
  urls?: string[];
  source?: "paste" | "manual" | "text-extract";
  baseDomain?: string | null;
  categoryId?: string | null;
};

function validatePostBody(data: PostBody) {
  const text = typeof data?.text === "string" ? data.text : "";
  const urls = Array.isArray(data?.urls) ? data.urls : [];
  if (!text && urls.length === 0) return { valid: false, error: "input_required" };
  return { valid: true };
}

async function handlePOST(data: PostBody, user: AuthenticatedUserType) {
  const uid = String(user?.ID || "");
  if (!uid) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const baseDomain = typeof data.baseDomain === "string" ? data.baseDomain : null;
  const fromText = data.text ? extractAndNormalizeAll(data.text, { baseDomain }) : [];
  const fromList = Array.isArray(data.urls)
    ? (data.urls
        .map((u) => {
          const normalized = normalizeUrl(String(u || ""), { baseDomain });
          if (!normalized) return null;
          return { url: normalized, normalizedUrl: normalized, domain: safeDomain(normalized) };
        })
        .filter(Boolean) as Array<{ url: string; normalizedUrl: string; domain: string }>)
    : [];

  const seen = new Set<string>();
  const merged = [...fromText, ...fromList].filter((it) => {
    if (!it?.normalizedUrl) return false;
    if (seen.has(it.normalizedUrl)) return false;
    seen.add(it.normalizedUrl);
    return true;
  });

  if (!merged.length) {
    return { ok: true, data: { created: [], skipped: 0, received: 0 } };
  }
  const limited = merged.slice(0, 200);

  let result;
  try {
    result = await insertScrapeLinksBulk({
      uid,
      items: limited,
      source: (data.source || "paste") as "paste" | "manual" | "text-extract",
      categoryId: typeof data.categoryId === "string" ? data.categoryId : null,
    });
  } catch (err) {
    if (toErrorLike(err).message === "category_not_found") {
      return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 400 });
    }
    throw err;
  }

  return { ok: true, data: { ...result, received: limited.length } };
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = String(user?.ID || "");
  if (!uid) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const url = new URL(request.url);
  const checkedRaw = url.searchParams.get("checked") || "all";
  const checked = checkedRaw === "done" ? "done" : checkedRaw === "todo" ? "todo" : "all";
  const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
  const categoryId = url.searchParams.get("category") || "all";
  const limit = Number(url.searchParams.get("limit") || 50);
  const cursor = url.searchParams.get("cursor");

  const result = await listScrapeLinks({ uid, checked, query, categoryId, limit, cursor });
  return { ok: true, data: result };
}

export const POST = withAuth(handlePOST, validatePostBody, "mini-apps/scrape-links/links", {
  bodyParser: "json",
});

export const GET = withAuth(handleGET, undefined, "mini-apps/scrape-links/links", {
  bodyParser: "none",
});
