import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listTopicFollows } from "libs/server-utils/magazine/appMagazinePersonalizationRepo";
import { NO_STORE_HEADERS, ownerUidOf, repoError } from "../_shared";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose App Magazine 주제 팔로우를 세션 주체 범위에서 cursor 방식으로 조회
 * @process ownerUid 서버 주입 -> opaque cursor 검증 -> 팔로우 projection 목록 반환
 * @domain magazine-content-experience
 * @scope account-api
 */

export const GET = withAuth(async (_body, user, request: NextRequest) => {
  const result = await listTopicFollows(ownerUidOf(user), request.nextUrl.searchParams.get("cursor") || undefined);
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json({ ok: true, data: result.data }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:topic-follows", { bodyParser: "none" });
