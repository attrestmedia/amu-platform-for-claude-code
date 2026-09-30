import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { resolveMarketingJobAccess } from "libs/marketing/operator/access";
import {
  evaluateMarketingJobStrategyFit,
  getMarketingStrategyFitContext,
} from "libs/marketing/operator/strategyFitService";
import { toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose JOB 채널 draft의 마케팅/광고 전략 적합도를 AI로 평가하고 validation asset에 저장
 * @process 인증/권한 확인  전략·draft 확인  가격/잔액 preflight  AI 평가  코인 차감  결과 저장
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(
  async (_data, user, _request, { params }: { params: Promise<{ jobId: string }> }) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, error: "marketing_feature_disabled" }, { status: 404 });
      }
      const { jobId } = await params;
      const access = await resolveMarketingJobAccess({ user, jobId: toSafeString(jobId) });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      const data = await getMarketingStrategyFitContext(access.universeId);
      return NextResponse.json({ success: true, data });
    }, 20_000),
  undefined,
  "marketing_content_queue_strategy_fit_context",
  { bodyParser: "none" },
);

export const POST = withAuth<UnknownRecord>(
  async (data, user, _request, { params }: { params: Promise<{ jobId: string }> }) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, error: "marketing_feature_disabled" }, { status: 404 });
      }
      const { jobId } = await params;
      const access = await resolveMarketingJobAccess({
        user,
        jobId: toSafeString(jobId),
        universeId: toSafeString(data.universeId),
      });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      const result = await evaluateMarketingJobStrategyFit({
        universeId: access.universeId,
        jobId: toSafeString(jobId),
        kind: toSafeString(data.kind) as "marketing" | "advertising",
        uid: toSafeString(user?.uid || user?.ID),
        requestedBy: toSafeString(user?.userEmail || user?.userEmailLower),
        actorUser: user,
        modelProvider: data.modelProvider,
        modelName: data.modelName,
      });
      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error, data: result.data }, { status: result.status });
      }
      return NextResponse.json({ success: true, data: result.data });
    }, 90_000),
  (data) => {
    const body = toUnknownRecord(data);
    return ["marketing", "advertising"].includes(toSafeString(body.kind))
      ? { valid: true }
      : { valid: false, error: "strategy_fit_kind_invalid" };
  },
  "marketing_content_queue_strategy_fit",
);
