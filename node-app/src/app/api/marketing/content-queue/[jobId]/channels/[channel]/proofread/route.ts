import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { resolveMarketingJobAccess } from "libs/marketing/operator/access";
import {
  checkMarketingChannelTypos,
  correctMarketingChannelTypos,
  verifyMarketingChannelTypos,
} from "libs/marketing/operator/channelProofreadService";
import { isPlainObject, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose JOB 채널 draft의 오탈자 검사 및 AI 교정본 저장
 * @process 요청 파싱  인증/권한 검증  draft 검사  사용자 코인 차감  AI 교정  검증 후 asset 갱신
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function validatePayload(data: unknown) {
  const record = toUnknownRecord(data);
  const mode = toSafeString(record.mode);
  if (mode !== "check" && mode !== "correct" && mode !== "verify") return { valid: false, error: "지원하지 않는 mode입니다." };
  if (!isPlainObject(record.draft)) return { valid: false, error: "draft가 필요합니다." };
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
      if (!["threads", "instagram", "linkedin", "naver_blog"].includes(safeChannel)) {
        return NextResponse.json({ success: false, error: "unsupported_channel" }, { status: 400 });
      }

      const access = await resolveMarketingJobAccess({
        user,
        jobId: toSafeString(jobId),
        universeId: toSafeString(data.universeId),
      });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }

      const args = {
        universeId: access.universeId,
        jobId: toSafeString(jobId),
        channel: safeChannel as "threads" | "instagram" | "linkedin" | "naver_blog",
        draft: data.draft as UnknownRecord,
      };
      if (toSafeString(data.mode) === "check") {
        const result = await checkMarketingChannelTypos(args);
        return NextResponse.json({ success: true, data: result });
      }

      if (toSafeString(data.mode) === "verify") {
        const result = await verifyMarketingChannelTypos({
          ...args,
          uid: toSafeString(user?.uid || user?.ID),
          requestedBy: toSafeString(user?.userEmail || user?.userEmailLower),
          actorUser: user,
        });
        if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
        return NextResponse.json({ success: true, data: result.data });
      }

      const result = await correctMarketingChannelTypos({
        ...args,
        uid: toSafeString(user?.uid || user?.ID),
        requestedBy: toSafeString(user?.userEmail || user?.userEmailLower),
        actorUser: user,
        manualInstruction: toSafeString(data.manualInstruction),
        modelProvider: data.modelProvider,
        modelName: data.modelName,
      });
      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error, data: result.data }, { status: result.status });
      }
      return NextResponse.json({ success: true, data: result.data });
    }, 90000),
  validatePayload,
  "marketing_content_queue_channel_proofread",
);
