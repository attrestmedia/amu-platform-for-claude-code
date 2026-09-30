import { NextRequest, NextResponse } from "next/server";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { RepoError } from "libs/server-utils/magazine/appMagazinePersonalizationRepo";

/**
 * @docHint
 * @purpose App Magazine 관계 API의 인증 주체·오류 봉투·same-origin mutation 방어를 통일
 * @process withAuth가 확정한 uid만 ownerUid로 사용하고 request Origin을 현재 API origin과 정확 비교
 * @domain magazine-content-experience
 * @scope account-api
 */

export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function ownerUidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

export function routeSlug(request: NextRequest, marker: string) {
  const pathname = request.nextUrl.pathname;
  const index = pathname.indexOf(marker);
  return index < 0 ? "" : decodeURIComponent(pathname.slice(index + marker.length).split("/")[0] || "");
}

export function routeTopicKey(request: NextRequest) {
  return routeSlug(request, "/topic-follows/");
}

export function rejectCrossOriginMutation(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { ok: false, error: "동일 출처 요청만 허용됩니다.", errorCode: "MAGAZINE_PERSONALIZATION_ORIGIN_REQUIRED", requestId: request.headers.get("x-request-id") || undefined },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  return null;
}

/** mutation은 browser 기본 text/plain 등을 허용하지 않아 의도치 않은 교차 형식 요청을 차단한다. */
export function rejectNonJsonMutation(request: NextRequest) {
  if ((request.headers.get("content-type") || "").toLowerCase() !== "application/json") {
    return NextResponse.json(
      { ok: false, error: "Content-Type은 application/json이어야 합니다.", errorCode: "MAGAZINE_PERSONALIZATION_CONTENT_TYPE_REQUIRED", requestId: request.headers.get("x-request-id") || undefined },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  return null;
}

export function repoError(request: NextRequest, error: RepoError) {
  const mapping: Record<RepoError, [number, string, string]> = {
    invalid: [400, "입력값이 올바르지 않습니다.", "MAGAZINE_PERSONALIZATION_INPUT_INVALID"],
    not_found: [404, "요청한 콘텐츠 또는 주제를 찾을 수 없습니다.", "MAGAZINE_PERSONALIZATION_NOT_FOUND"],
    limit_reached: [409, "보관 한도에 도달했습니다.", "MAGAZINE_PERSONALIZATION_LIMIT_REACHED"],
    conflict: [409, "콘텐츠 개정본이 변경되어 이어읽기를 저장할 수 없습니다.", "MAGAZINE_PERSONALIZATION_REVISION_CONFLICT"],
    unavailable: [503, "개인화 관계 저장소를 일시적으로 사용할 수 없습니다.", "MAGAZINE_PERSONALIZATION_UNAVAILABLE"],
  };
  const [status, errorMessage, errorCode] = mapping[error];
  return NextResponse.json(
    { ok: false, error: errorMessage, errorCode, requestId: request.headers.get("x-request-id") || undefined },
    { status, headers: NO_STORE_HEADERS },
  );
}

export function inputError(request: NextRequest, error = "입력값이 올바르지 않습니다.") {
  return NextResponse.json(
    { ok: false, error, errorCode: "MAGAZINE_PERSONALIZATION_INPUT_INVALID", requestId: request.headers.get("x-request-id") || undefined },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}
