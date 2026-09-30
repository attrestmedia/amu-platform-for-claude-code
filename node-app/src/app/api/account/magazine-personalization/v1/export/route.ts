import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { exportAppMagazinePersonalization } from "libs/server-utils/magazine/appMagazinePersonalizationRepo";
import { NO_STORE_HEADERS, ownerUidOf, repoError } from "../_shared";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose App Magazine 관계 데이터 이동권 export를 App 저장소 범위에서 제공
 * @process stale policy consent도 허용한 인증 주체 -> ownerUid 범위 세 관계 projection -> 다운로드 응답
 * @domain magazine-content-experience
 * @scope account-api
 */

export const GET = withAuth(async (_body, user, request: NextRequest) => {
  const result = await exportAppMagazinePersonalization(ownerUidOf(user));
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json(
    { ok: true, generatedAt: new Date().toISOString(), data: result.data },
    { headers: { ...NO_STORE_HEADERS, "Content-Disposition": "attachment; filename=amu-magazine-personalization-export.json" } },
  );
}, undefined, "account:magazine-personalization:export", { bodyParser: "none", allowStalePolicyConsent: true });
