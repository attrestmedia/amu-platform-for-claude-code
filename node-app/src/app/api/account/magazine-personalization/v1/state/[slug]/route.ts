import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getAppMagazineContentBySlug } from "libs/server-utils/magazine/appContentRepo";
import { getContentSave, getReadingProgress, getTopicFollow } from "libs/server-utils/magazine/appMagazinePersonalizationRepo";
import { NO_STORE_HEADERS, ownerUidOf, repoError, routeSlug } from "../../_shared";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 로그인 사용자의 현재 App 콘텐츠 관계 상태를 한 번에 조회
 * @process slug로 App 콘텐츠 검증 -> 세션 ownerUid 범위의 save/progress/follow 병렬 조회 -> projection 반환
 * @domain magazine-content-experience
 * @scope account-api
 */

export const GET = withAuth(async (_body, user, request: NextRequest) => {
  const slug = routeSlug(request, "/state/");
  const content = await getAppMagazineContentBySlug(slug);
  if (!content.ok) return repoError(request, content.error === "not_found" ? "not_found" : "unavailable");
  const ownerUid = ownerUidOf(user);
  const results = await Promise.all([
    getContentSave(ownerUid, content.data.content.contentId),
    getReadingProgress(ownerUid, content.data.content.contentId),
    Promise.all((content.data.content.topicRefs || []).map((topic) => getTopicFollow(ownerUid, topic.topicId))),
  ]);
  if (!results[0].ok) return repoError(request, results[0].error);
  if (!results[1].ok) return repoError(request, results[1].error);
  const follows = results[2];
  const failedFollow = follows.find((result) => !result.ok);
  if (failedFollow && !failedFollow.ok) return repoError(request, failedFollow.error);
  return NextResponse.json({
    ok: true,
    data: {
      sourceSystem: "app",
      content: { contentId: content.data.content.contentId, slug: content.data.content.slug, revision: content.data.revision },
      saved: results[0].data,
      readingProgress: results[1].data,
      topicFollows: follows.filter((result): result is Extract<typeof result, { ok: true }> => result.ok).map((result) => result.data).filter(Boolean),
    },
  }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:state", { bodyParser: "none" });
