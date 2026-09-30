import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess, listAccessibleMarketingUniverseIds } from "libs/marketing/operator/access";
import {
  listMarketingQueueCategoryConfigs,
  upsertMarketingQueueCategoryConfig,
} from "libs/database/marketing";
import {
  normalizeMarketingQueueBatchSize,
  normalizeMarketingQueueCategory,
  normalizeMarketingQueueChannels,
  normalizeMarketingQueuePriority,
} from "libs/marketing/queue/categoryConfig";

/**
 * @docHint
 * @purpose API 라우트(marketing / queue-categories) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  카테고리 실행 정책 조회/저장  JSON 응답 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSafeString(value: unknown, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

export const GET = withAuth(
  async (_data, user, request?: NextRequest) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const searchParams = request ? new URL(request.url).searchParams : undefined;
      const requestedUniverseId = toSafeString(searchParams?.get("universeId"), 120);
      const enabled = searchParams?.get("enabled");
      const enabledBool = enabled === null || typeof enabled === "undefined" ? undefined : enabled === "true";

      if (requestedUniverseId) {
        const access = await assertMarketingUniverseAccess({ user, universeId: requestedUniverseId });
        if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        const items = await listMarketingQueueCategoryConfigs({
          universeId: access.universeId,
          enabled: enabledBool,
        });
        return NextResponse.json({ success: true, data: { items } });
      }

      const universeIds = await listAccessibleMarketingUniverseIds(user);
      const items = await listMarketingQueueCategoryConfigs({
        universeIds,
        enabled: enabledBool,
      });

      return NextResponse.json({ success: true, data: { items } });
    }, 20000),
  undefined,
  "marketing_queue_categories_list",
);

export const POST = withAuth(
  async (data, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const universeId = toSafeString(data?.universeId, 120);
      const queueCategory = normalizeMarketingQueueCategory(data?.queueCategory);
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      const item = await upsertMarketingQueueCategoryConfig({
        universeId: access.universeId,
        queueCategory,
        label: toSafeString(data?.label, 200),
        enabled: data?.enabled !== false,
        defaultBatchSize: normalizeMarketingQueueBatchSize(data?.defaultBatchSize),
        maxConcurrency: normalizeMarketingQueueBatchSize(data?.maxConcurrency, 1),
        defaultPriority: normalizeMarketingQueuePriority(data?.defaultPriority),
        priorityWeight: Number(data?.priorityWeight || 100),
        defaultContentTemplateKey: toSafeString(data?.defaultContentTemplateKey, 120),
        defaultImageTemplateKey: toSafeString(data?.defaultImageTemplateKey, 120),
        defaultGenerationMode: toSafeString(data?.defaultGenerationMode) === "local_agent" ? "local_agent" : "server_worker",
        defaultModelProvider: toSafeString(data?.defaultModelProvider, 80),
        defaultModelName: toSafeString(data?.defaultModelName, 160),
        defaultReviewMode: toSafeString(data?.defaultReviewMode, 80) || "review_required",
        instructionText: toSafeString(data?.instructionText, 4000),
        siteUrl: toSafeString(data?.siteUrl, 500),
        allowedChannels: normalizeMarketingQueueChannels(data?.allowedChannels),
        updatedBy: toSafeString(user?.userEmail || user?.userEmailLower, 200),
      });

      return NextResponse.json({ success: true, data: { item } });
    }, 20000),
  (data) => {
    if (!data) return { valid: false, error: "no body" };
    if (!toSafeString(data?.universeId, 120)) return { valid: false, error: "universeId_required" };
    if (!normalizeMarketingQueueCategory(data?.queueCategory)) return { valid: false, error: "queueCategory_required" };
    return { valid: true };
  },
  "marketing_queue_categories_upsert",
);
