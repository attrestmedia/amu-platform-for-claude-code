import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { deleteTopicFollow, getActiveAppMagazineTopic, getAppMagazineTopic, putTopicFollow } from "libs/server-utils/magazine/appMagazinePersonalizationRepo";
import { NO_STORE_HEADERS, ownerUidOf, rejectCrossOriginMutation, rejectNonJsonMutation, repoError, routeTopicKey } from "../../_shared";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose App 등록 주제 팔로우 관계를 생성 또는 해제
 * @process same-origin 확인 -> active topic registry 확인 -> 세션 ownerUid 관계만 idempotent 변경
 * @domain magazine-content-experience
 * @scope account-api
 */

async function activeTopic(request: NextRequest) {
  return getActiveAppMagazineTopic(routeTopicKey(request));
}
export const PUT = withAuth(async (_body, user, request: NextRequest) => {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const invalidContentType = rejectNonJsonMutation(request); if (invalidContentType) return invalidContentType;
  const topic = await activeTopic(request);
  if (!topic.ok) return repoError(request, topic.error);
  const result = await putTopicFollow(ownerUidOf(user), { kind: "app_topic", ...topic.data });
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json({ ok: true, data: result.data }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:topic-follow-put", { bodyParser: "none" });
export const DELETE = withAuth(async (_body, user, request: NextRequest) => {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const topic = await getAppMagazineTopic(routeTopicKey(request));
  if (!topic.ok) return repoError(request, topic.error);
  const result = await deleteTopicFollow(ownerUidOf(user), topic.data.topicId);
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json({ ok: true, data: result.data }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:topic-follow-delete", { bodyParser: "none", allowStalePolicyConsent: true });
