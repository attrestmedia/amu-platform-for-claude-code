import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { deleteAllAppMagazinePersonalization } from "libs/server-utils/magazine/appMagazinePersonalizationRepo";
import { NO_STORE_HEADERS, ownerUidOf, rejectCrossOriginMutation, repoError } from "./_shared";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 사용자가 App Magazine 관계 데이터 전체를 직접 삭제
 * @process same-origin 확인 -> stale policy consent도 허용한 인증 주체 -> ownerUid 세 컬렉션만 삭제
 * @domain magazine-content-experience
 * @scope account-api
 */

export const DELETE = withAuth(async (_body, user, request: NextRequest) => {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const result = await deleteAllAppMagazinePersonalization(ownerUidOf(user));
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json({ ok: true, data: result.data }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:delete-all", { bodyParser: "none", allowStalePolicyConsent: true });
