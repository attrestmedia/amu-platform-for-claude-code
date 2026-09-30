import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { appMagazineContentId } from "libs/server-utils/magazine/appContentContract";
import { getAppMagazineContentBySlug } from "libs/server-utils/magazine/appContentRepo";
import { isAppContentSlug } from "libs/server-utils/magazine/appContentValidate";
import { deleteContentSave, putContentSave } from "libs/server-utils/magazine/appMagazinePersonalizationRepo";
import { NO_STORE_HEADERS, ownerUidOf, rejectCrossOriginMutation, rejectNonJsonMutation, repoError, routeSlug } from "../../_shared";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose App 콘텐츠 저장 관계를 생성 또는 해제
 * @process same-origin 확인 -> App 콘텐츠 slug 검증 -> 세션 ownerUid 관계만 idempotent 변경
 * @domain magazine-content-experience
 * @scope account-api
 */

async function contentFor(request: NextRequest) {
  return getAppMagazineContentBySlug(routeSlug(request, "/saves/"));
}
export const PUT = withAuth(async (_body, user, request: NextRequest) => {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const invalidContentType = rejectNonJsonMutation(request); if (invalidContentType) return invalidContentType;
  const content = await contentFor(request);
  if (!content.ok) return repoError(request, content.error === "not_found" ? "not_found" : "unavailable");
  const result = await putContentSave(ownerUidOf(user), { kind: "app_content", contentId: content.data.content.contentId, slug: content.data.content.slug });
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json({ ok: true, data: result.data }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:save-put", { bodyParser: "none" });
export const DELETE = withAuth(async (_body, user, request: NextRequest) => {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const slug = routeSlug(request, "/saves/");
  if (!isAppContentSlug(slug)) return repoError(request, "not_found");
  // 콘텐츠가 비공개·삭제된 뒤에도 회원은 자신의 관계 기록을 삭제할 수 있어야 한다.
  const result = await deleteContentSave(ownerUidOf(user), appMagazineContentId(slug));
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json({ ok: true, data: result.data }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:save-delete", { bodyParser: "none", allowStalePolicyConsent: true });
