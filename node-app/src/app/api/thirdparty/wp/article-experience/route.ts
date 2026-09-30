import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import { buildResolverError } from "libs/server-utils/magazine/magazineEmbedContract";
import { resolveMagazineEmbedRequest } from "libs/server-utils/magazine/magazineEmbedResolver";
import { logger } from "utils/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * @docHint
 * @purpose WordPress 호환 transport를 위한 서명된 Article Experience resolver API
 * @process JSON body hash/HMAC 검증  node-app declaration SSOT 대조  fail-closed projection 반환
 * @domain magazine-content-experience
 * @scope thirdparty-api
 */

function requestId(request: NextRequest) {
  const value = String(request.headers.get("x-request-id") || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : `wp-${crypto.randomUUID()}`;
}

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const id = requestId(request);
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) {
    return NextResponse.json(buildResolverError({ requestId: id, code: verified.status === 403 ? "FORBIDDEN" : verified.status === 503 ? "PRECONDITION_REQUIRED" : "UNAUTHORIZED", message: "서명된 Article Experience 요청이 아닙니다." }), { status: verified.status, headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText || "{}");
  } catch {
    return NextResponse.json(buildResolverError({ requestId: id, code: "INVALID_INPUT", message: "요청 형식이 올바르지 않습니다." }), { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  try {
    const response = await resolveMagazineEmbedRequest({ body, site: verified.site, requestId: id });
    return NextResponse.json(response, { status: 200, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Vary: "Origin" } });
  } catch (error) {
    logger.error("[thirdparty/wp/article-experience] resolver failed", { error: error instanceof Error ? error.message : "unknown", requestId: id });
    return NextResponse.json(buildResolverError({ requestId: id, code: "INTERNAL_ERROR", message: "Article Experience를 확인할 수 없습니다.", retryable: true }), { status: 503, headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": "30" } });
  }
}
