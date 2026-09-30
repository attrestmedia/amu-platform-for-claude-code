import { NextRequest, NextResponse } from "next/server";
import {
  MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
  MARKETING_QUEUE_PAGE_SIZE_DEFAULT,
  MARKETING_QUEUE_PAGE_SIZE_MAX,
} from "consts/marketing/queue";
import type {
  MarketingChannel,
  MarketingJobPriority,
  MarketingJobSource,
  MarketingJobStatus,
} from "consts/marketing/queue";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { listMarketingJobs, listMarketingJobSteps } from "libs/database/marketing";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { enqueueMarketingContent } from "libs/marketing/ingest/contentQueueService";
import { assertMarketingUniverseAccess, listAccessibleMarketingUniverseIds } from "libs/marketing/operator/access";
import { buildStableUploadRecommendations } from "libs/marketing/operator/uploadScheduleRecommendation";
import { toSafeString, toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(marketing / content-queue) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type EnqueueGenerationMode = "server_worker" | "local_agent";

const REVIEW_STEP_KEY_BY_CHANNEL: Record<string, string> = {
  threads: "publish_threads",
  instagram: "publish_instagram",
  linkedin: "prepare_linkedin_draft",
  naver_blog: "prepare_naver_draft",
};

function buildJobChannelStatuses(channels: unknown, steps: Record<string, unknown>[], now = Date.now()) {
  const channelList = Array.isArray(channels) ? channels.map(toSafeString).filter(Boolean) : [];
  return channelList.map((channel) => {
    const stepKey = REVIEW_STEP_KEY_BY_CHANNEL[channel] || "";
    const step = steps.find(
      (item) => toSafeString(item.stepKey) === stepKey && toSafeString(item.channel) === channel,
    );
    const status = toSafeString(step?.status);
    const meta = toUnknownRecord(step?.meta);
    const lastError = toUnknownRecord(step?.lastError);
    const scheduledPublishAt = toSafeString(meta.scheduledPublishAt);
    const scheduledPublishTime = scheduledPublishAt ? Date.parse(scheduledPublishAt) : Number.NaN;
    const scheduledPublishOverdue =
      status === "approved" && Number.isFinite(scheduledPublishTime) && scheduledPublishTime < now;
    return {
      channel,
      status: status || "waiting_review",
      ...(status === "approved" && scheduledPublishAt ? { scheduledPublishAt } : {}),
      ...(scheduledPublishOverdue ? { scheduledPublishOverdue: true } : {}),
      ...(Object.keys(lastError).length > 0 ? { lastError } : {}),
    };
  });
}

function toPage(raw?: string | null) {
  const next = Number(raw || "1");
  return Math.max(1, Number.isFinite(next) ? next : 1);
}

function toLimit(raw?: string | null) {
  const next = Number(raw || MARKETING_QUEUE_PAGE_SIZE_DEFAULT);
  return Math.max(1, Math.min(MARKETING_QUEUE_PAGE_SIZE_MAX, Number.isFinite(next) ? next : MARKETING_QUEUE_PAGE_SIZE_DEFAULT));
}

function toCsvValues(raw?: string | null) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export const GET = withAuth(
  async (_data, user, request?: NextRequest) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const searchParams = request ? new URL(request.url).searchParams : undefined;
      const universeId = toSafeString(searchParams?.get("universeId"));
      const page = toPage(searchParams?.get("page"));
      const limit = toLimit(searchParams?.get("limit"));
      const statuses = toCsvValues(searchParams?.get("status"));
      const sources = toCsvValues(searchParams?.get("source"));
      const priorities = toCsvValues(searchParams?.get("priority"));
      const queueCategory = toSafeString(searchParams?.get("queueCategory"));
      const channels = toCsvValues(searchParams?.get("channel"));
      const dateFrom = toSafeString(searchParams?.get("dateFrom"));
      const dateTo = toSafeString(searchParams?.get("dateTo"));
      const includeArchived = toSafeString(searchParams?.get("includeArchived")) === "true";

      let universeIds: string[] = [];
      if (universeId) {
        const access = await assertMarketingUniverseAccess({ user, universeId });
        if (!access.ok) {
          return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }
        universeIds = [access.universeId];
      } else {
        universeIds = await listAccessibleMarketingUniverseIds(user);
      }

      const result = await listMarketingJobs({
        universeIds,
        status: statuses.length > 0 ? (statuses as MarketingJobStatus[]) : undefined,
        source: sources.length > 0 ? (sources as MarketingJobSource[]) : undefined,
        priority: priorities.length > 0 ? (priorities as MarketingJobPriority[]) : undefined,
        queueCategory,
        channel: channels.length > 0 ? (channels as MarketingChannel[]) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        includeArchived,
        page,
        limit,
      });

      const jobIds = result.items.map((item) => toSafeString(item.jobId)).filter(Boolean);
      const steps = jobIds.length > 0 ? await listMarketingJobSteps({ jobIds, limit: 2000 }) : [];
      const stepsByJob = new Map<string, Record<string, unknown>[]>();
      for (const step of steps) {
        const jid = toSafeString((step as Record<string, unknown>).jobId);
        if (!jid) continue;
        const list = stepsByJob.get(jid);
        if (list) list.push(step as Record<string, unknown>);
        else stepsByJob.set(jid, [step as Record<string, unknown>]);
      }
      const stableRecommendations = await buildStableUploadRecommendations(universeIds);
      const items = result.items.map((item) => {
        const channels = Array.isArray((item as Record<string, unknown>).channels)
          ? ((item as Record<string, unknown>).channels as unknown[]).map(toSafeString).filter(Boolean)
          : [];
        const recommendedUploadSchedules = channels
          .map((channel) => stableRecommendations.get(`${toSafeString(item.jobId)}:${channel}`))
          .filter(Boolean);
        return {
          ...item,
          channelStatuses: buildJobChannelStatuses(channels, stepsByJob.get(toSafeString(item.jobId)) || []),
          recommendedUploadDates: recommendedUploadSchedules.map((schedule) => ({ channel: schedule!.channel, date: schedule!.date })),
          recommendedUploadSchedules,
        };
      });

      return NextResponse.json({
        success: true,
        data: {
          items,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        },
      });
    }, 20000),
  undefined,
  "marketing_content_queue_status",
);

export const POST = withAuth(
  async (data, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const universeId = toSafeString(data?.universeId);
      if (!universeId) {
        return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
      }

      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }
      const enqueueTargetCount = [
        toSafeString(data?.slug),
        toSafeString(data?.url),
        ...(Array.isArray(data?.slugs) ? data.slugs.map(toSafeString) : []),
        ...(Array.isArray(data?.urls) ? data.urls.map(toSafeString) : []),
        ...(Array.isArray(data?.sourceSnapshots) ? data.sourceSnapshots.map((item: unknown) => toSafeString(toUnknownRecord(item).url)) : []),
      ].filter(Boolean).length;
      if (enqueueTargetCount > MARKETING_QUEUE_ENQUEUE_BATCH_MAX) {
        return NextResponse.json(
          {
            success: false,
            error: "batch_limit_exceeded",
            maxBatchSize: MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
          },
          { status: 400 },
        );
      }

      const result = await enqueueMarketingContent({
        universeId: access.universeId,
        slug: toSafeString(data?.slug),
        url: toSafeString(data?.url),
        slugs: Array.isArray(data?.slugs) ? data.slugs : [],
        urls: Array.isArray(data?.urls) ? data.urls : [],
        priority: toSafeString(data?.priority) as MarketingJobPriority,
        queueCategory: toSafeString(data?.queueCategory),
        scheduledAt: data?.scheduledAt,
        force: Boolean(data?.force),
        requestedBy: toSafeString(data?.requestedBy) || toSafeString(user?.userEmail || user?.userEmailLower),
        source: "manual",
        trigger: "manual_queue",
        generationMode: toSafeString(data?.generationMode) as EnqueueGenerationMode,
        modelProvider: toSafeString(data?.modelProvider),
        modelName: toSafeString(data?.modelName),
        instructionText: toSafeString(data?.instructionText),
        contentTemplateKey: toSafeString(data?.contentTemplateKey),
        imageTemplateKey: toSafeString(data?.imageTemplateKey),
        reviewMode: toSafeString(data?.reviewMode),
        channels: Array.isArray(data?.channels) ? data.channels : undefined,
        sourceSnapshots: Array.isArray(data?.sourceSnapshots) ? data.sourceSnapshots : undefined,
      });

      return NextResponse.json({
        success: true,
        data: result,
      });
    }, 20000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_content_queue_enqueue",
);
