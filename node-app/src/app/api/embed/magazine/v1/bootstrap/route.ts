import { NextRequest, NextResponse } from "next/server";
import { buildResolverError } from "libs/server-utils/magazine/magazineEmbedContract";
import { revalidateMagazineLaunch } from "libs/server-utils/magazine/magazineEmbedResolver";
import { consumeMagazineLaunchToken, MagazineLaunchTokenError, verifyMagazineLaunchToken } from "libs/server-utils/magazine/magazineEmbedToken";
import { logger } from "utils/log";
import { createMagazineEmbedSession } from "libs/server-utils/magazine/magazineEmbedSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * @docHint
 * @purpose dedicated Magazine embed surface의 one-time bootstrap API
 * @process token 서명·Registry 재판정  Redis atomic consume  최소 context 반환
 * @domain magazine-content-experience
 * @scope embed-api
 */

function responseHeaders(extra: Record<string, string> = {}) {
  return { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", ...extra };
}

function idFor(request: NextRequest) {
  const value = String(request.headers.get("x-request-id") || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : `embed-${crypto.randomUUID()}`;
}

function errorCode(error: MagazineLaunchTokenError["code"]) {
  if (error === "replayed") return "CONFLICT" as const;
  if (error === "not_configured" || error === "store_unavailable") return "PRECONDITION_REQUIRED" as const;
  return "UNAUTHORIZED" as const;
}

export async function POST(request: NextRequest) {
  const requestId = idFor(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(buildResolverError({ requestId, code: "INVALID_INPUT", message: "요청 형식이 올바르지 않습니다." }), { status: 400, headers: responseHeaders() });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "token") || typeof (body as { token?: unknown }).token !== "string") {
    return NextResponse.json(buildResolverError({ requestId, code: "INVALID_INPUT", message: "launch token이 필요합니다." }), { status: 400, headers: responseHeaders() });
  }

  const token = (body as { token: string }).token;
  try {
    const verifiedTokenClaims = verifyMagazineLaunchToken(token);
    const verified = await revalidateMagazineLaunch({ claims: verifiedTokenClaims });
    if (!verified.ok) {
      return NextResponse.json(buildResolverError({ requestId, code: "PRECONDITION_REQUIRED", message: "전용 화면을 사용할 수 없습니다.", reasonCode: verified.reasonCode }), { status: 428, headers: responseHeaders() });
    }
    // 세션을 먼저 저장해 token 소비 직후 Redis 장애가 발생해도, 성공한 token이
    // session 없는 상태로 소모되지 않게 한다. 경쟁 요청의 고아 세션은 5분 TTL로 정리된다.
    const embedSession = await createMagazineEmbedSession(verifiedTokenClaims);
    const claims = { ok: true as const, claims: await consumeMagazineLaunchToken(token), entry: verified.entry };
    return NextResponse.json({
      ok: true,
      data: {
        integrationId: claims.entry.integrationId,
        serviceKey: claims.entry.serviceKey,
        moduleType: claims.claims.moduleType,
        capabilities: claims.entry.capabilities,
        contextRevision: claims.claims.contextRevision,
        ...(claims.claims.templateKey ? { templateKey: claims.claims.templateKey } : {}),
        ...(claims.claims.contextKey ? { contextKey: claims.claims.contextKey } : {}),
        ...(claims.claims.allowedProps ? { allowedProps: claims.claims.allowedProps } : {}),
        parentOrigin: claims.claims.parentOrigin,
        nonce: claims.claims.nonce,
        requestId: claims.claims.requestId,
        returnUrl: claims.claims.returnUrl,
        embedSessionId: embedSession.id,
        ...(claims.claims.articleContext ? { articleContext: claims.claims.articleContext } : {}),
        context: {
          contentRef: claims.claims.contentRef,
          sectionId: claims.claims.sectionId,
          experienceId: claims.claims.experienceId,
          experienceLevel: claims.claims.experienceLevel,
          returnSectionId: claims.claims.returnSectionId,
        },
      },
      meta: { requestId },
    }, { headers: responseHeaders() });
  } catch (error) {
    const code = error instanceof MagazineLaunchTokenError ? errorCode(error.code) : "INTERNAL_ERROR" as const;
    const status = code === "CONFLICT" ? 409 : code === "UNAUTHORIZED" ? 401 : code === "PRECONDITION_REQUIRED" ? 428 : 503;
    if (!(error instanceof MagazineLaunchTokenError)) logger.error("[embed/magazine/v1/bootstrap] bootstrap failed", { requestId, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json(buildResolverError({ requestId, code, message: code === "INTERNAL_ERROR" ? "전용 화면을 시작할 수 없습니다." : "전용 화면 token이 유효하지 않습니다." }), { status, headers: responseHeaders(code === "INTERNAL_ERROR" ? { "Retry-After": "30" } : {}) });
  }
}
