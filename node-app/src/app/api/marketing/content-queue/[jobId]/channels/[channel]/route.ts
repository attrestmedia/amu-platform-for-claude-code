import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { resolveMarketingJobAccess } from "libs/marketing/operator/access";
import { applyMarketingChannelAction } from "libs/marketing/operator/channelActionService";
import { isPlainObject, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(marketing / content-queue / [jobId] / channels / [channel]) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function validatePayload(data: unknown) {
  const action = toSafeString(toUnknownRecord(data).action);
  if (
    ![
      "save_draft",
      "complete",
      "skip",
      "publish_member",
      "attach_image",
      "remove_image",
      "mark_published",
      "cancel_scheduled_publish",
    ].includes(action)
  )
    return { valid: false, error: "지원하지 않는 action입니다." };
  return { valid: true };
}

export const POST = withAuth<UnknownRecord>(
  async (data, user, _request, { params }: { params: Promise<{ jobId: string; channel: string }> }) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const { jobId, channel } = await params;
      const safeChannel = toSafeString(channel);
      if (safeChannel !== "threads" && safeChannel !== "instagram" && safeChannel !== "linkedin" && safeChannel !== "naver_blog") {
        return NextResponse.json({ success: false, message: "지원하지 않는 channel입니다." }, { status: 400 });
      }

      const access = await resolveMarketingJobAccess({
        user,
        jobId,
        universeId: toSafeString(data?.universeId),
      });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }

      const result = await applyMarketingChannelAction({
        universeId: access.universeId,
        jobId: toSafeString(jobId),
        channel: safeChannel as "threads" | "instagram" | "linkedin" | "naver_blog",
        action: toSafeString(data?.action) as
          | "save_draft"
          | "complete"
          | "skip"
          | "publish_member"
          | "attach_image"
          | "remove_image"
          | "mark_published"
          | "cancel_scheduled_publish",
        requestedBy: toSafeString(user?.userEmail || user?.userEmailLower),
        requestedByUid: toSafeString(user?.uid || user?.ID),
        draft: isPlainObject(data?.draft) ? data.draft : undefined,
        publishAt: toSafeString(data?.publishAt),
        publishHour: typeof data?.publishHour === "number" && Number.isInteger(data.publishHour) ? data.publishHour : null,
        publishMinute: typeof data?.publishMinute === "number" && Number.isInteger(data.publishMinute) ? data.publishMinute : null,
        recommendationToken: toSafeString(data?.recommendationToken),
        publishedUrl: toSafeString(data?.publishedUrl),
        note: toSafeString(data?.note),
      });

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }

      return NextResponse.json({ success: true, data: result.data });
    }, 60000),
  validatePayload,
  "marketing_content_queue_channel_action",
);
