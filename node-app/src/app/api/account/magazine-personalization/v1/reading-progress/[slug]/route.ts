import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { appMagazineContentId } from "libs/server-utils/magazine/appContentContract";
import { getAppMagazineContentBySlug } from "libs/server-utils/magazine/appContentRepo";
import { isAppContentSlug } from "libs/server-utils/magazine/appContentValidate";
import { advanceReadingProgress, deleteReadingProgress } from "libs/server-utils/magazine/appMagazinePersonalizationRepo";
import { NO_STORE_HEADERS, inputError, ownerUidOf, rejectCrossOriginMutation, rejectNonJsonMutation, repoError, routeSlug } from "../../_shared";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose App 콘텐츠 이어읽기 위치를 단조 증가 규칙으로 저장하거나 초기화
 * @process same-origin 확인 -> 현재 revision/block 확인 -> ownerUid 범위 progress만 advance 또는 삭제
 * @domain magazine-content-experience
 * @scope account-api
 */

async function contentFor(request: NextRequest) {
  return getAppMagazineContentBySlug(routeSlug(request, "/reading-progress/"));
}
export const PUT = withAuth(async (body: unknown, user, request: NextRequest) => {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const invalidContentType = rejectNonJsonMutation(request); if (invalidContentType) return invalidContentType;
  if (!body || typeof body !== "object" || Array.isArray(body)) return inputError(request);
  const input = body as { contentRevision?: unknown; blockId?: unknown; progressBps?: unknown; mode?: unknown };
  if (input.mode !== "advance" || typeof input.contentRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.contentRevision)
    || typeof input.blockId !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(input.blockId)
    || typeof input.progressBps !== "number" || !Number.isInteger(input.progressBps) || input.progressBps < 0 || input.progressBps > 10000) return inputError(request);
  const content = await contentFor(request);
  if (!content.ok) return repoError(request, content.error === "not_found" ? "not_found" : "unavailable");
  if (content.data.revision !== input.contentRevision || !content.data.content.body.some((block) => block.blockId === input.blockId)) {
    return repoError(request, "conflict");
  }
  const result = await advanceReadingProgress(ownerUidOf(user), {
    contentRef: { kind: "app_content", contentId: content.data.content.contentId, slug: content.data.content.slug },
    contentRevision: input.contentRevision,
    blockId: input.blockId,
    progressBps: input.progressBps,
  });
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json({ ok: true, data: result.data }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:progress-put", { bodyParser: "json" });
export const DELETE = withAuth(async (_body, user, request: NextRequest) => {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const slug = routeSlug(request, "/reading-progress/");
  if (!isAppContentSlug(slug)) return repoError(request, "not_found");
  // 콘텐츠가 비공개·삭제된 뒤에도 회원은 자신의 관계 기록을 삭제할 수 있어야 한다.
  const result = await deleteReadingProgress(ownerUidOf(user), appMagazineContentId(slug));
  if (!result.ok) return repoError(request, result.error);
  return NextResponse.json({ ok: true, data: result.data }, { headers: NO_STORE_HEADERS });
}, undefined, "account:magazine-personalization:progress-delete", { bodyParser: "none", allowStalePolicyConsent: true });
