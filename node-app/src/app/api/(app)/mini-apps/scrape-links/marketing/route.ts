import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import {
  assertMarketingUniverseAccess,
  listAccessibleMarketingUniverses,
} from "libs/marketing/operator/access";
import { enqueueMarketingSourceSnapshots } from "libs/marketing/ingest/contentQueueService";
import { getScrapeLinksByIds, type ScrapeLinkPublic } from "libs/database/mini-apps/scrapeLinksRepo";
import {
  MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
  type MarketingJobPriority,
} from "consts/marketing/queue";
import { normalizeMarketingQueueCategory } from "libs/marketing/queue/categoryConfig";
import type { UnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toStringArray(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => toSafeString(item))
        .filter(Boolean),
    ),
  );
}

function toScheduledAtPayload(value: unknown) {
  const safeValue = toSafeString(value);
  if (!safeValue) return undefined;
  const next = new Date(safeValue);
  return Number.isNaN(next.getTime()) ? undefined : next.toISOString();
}

function linkToSnapshot(link: ScrapeLinkPublic) {
  const title = toSafeString(link.ogTitle || link.label || link.url);
  return {
    sourceKind: "scrape_links",
    sourceId: toSafeString(link.id),
    slug: toSafeString(link.id),
    url: toSafeString(link.normalizedUrl || link.url),
    title,
    excerptText: toSafeString(link.ogDescription || link.note),
    contentText: toSafeString([title, link.ogDescription, link.note].filter(Boolean).join("\n\n")),
    imageUrl: toSafeString(link.ogImage),
    imageAlt: title,
    imageSource: link.ogImage ? "scrape_links_og" : "",
    categories: [toSafeString(link.categoryName)].filter(Boolean),
    tags: [toSafeString(link.domain)].filter(Boolean),
    modified: toSafeString(link.updatedAt || link.createdAt),
  };
}

function getScrapeLinkCategoryQueueKey(link: ScrapeLinkPublic, fallbackQueueCategory: string) {
  const categoryId = toSafeString(link.categoryId);
  const categoryName = toSafeString(link.categoryName);
  if (!categoryId && !categoryName) {
    return normalizeMarketingQueueCategory(fallbackQueueCategory);
  }

  const normalizedName = normalizeMarketingQueueCategory(categoryName);
  if (normalizedName !== "general" || categoryName.toLowerCase() === "general") {
    return normalizedName;
  }

  const idSuffix = categoryId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-10);
  return idSuffix ? `scrape-${idSuffix}` : normalizedName;
}

function groupLinksByQueueCategory(links: ScrapeLinkPublic[], fallbackQueueCategory: string) {
  const groups = new Map<string, ScrapeLinkPublic[]>();
  links.forEach((link) => {
    const queueCategory = getScrapeLinkCategoryQueueKey(link, fallbackQueueCategory);
    const current = groups.get(queueCategory) || [];
    current.push(link);
    groups.set(queueCategory, current);
  });
  return Array.from(groups.entries()).map(([queueCategory, items]) => ({ queueCategory, items }));
}

export const GET = withAuth(
  async (_data, user, _request?: NextRequest) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ ok: false, error: "marketing_disabled" }, { status: 404 });
      }

      const universes = await listAccessibleMarketingUniverses(user);
      return NextResponse.json({
        ok: true,
        data: {
          universes: universes.map((universe) => ({
            id: toSafeString(universe.id),
            name: toSafeString(universe.name || (universe as { title?: string }).title || universe.id),
          })),
          maxBatchSize: MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
        },
      });
    }, 15000),
  undefined,
  "mini-apps-scrape-links-marketing-options",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (data, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ ok: false, error: "marketing_disabled" }, { status: 404 });
      }

      const uid = toSafeString(user?.ID);
      if (!uid) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

      const universeId = toSafeString(data?.universeId);
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) {
        return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
      }

      const ids = toStringArray(data?.ids);
      if (!ids.length) return NextResponse.json({ ok: false, error: "link_ids_required" }, { status: 400 });
      if (ids.length > MARKETING_QUEUE_ENQUEUE_BATCH_MAX) {
        return NextResponse.json(
          {
            ok: false,
            error: "batch_limit_exceeded",
            maxBatchSize: MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
          },
          { status: 400 },
        );
      }

      const links = await getScrapeLinksByIds({ uid, ids, limit: MARKETING_QUEUE_ENQUEUE_BATCH_MAX });
      if (!links.length) return NextResponse.json({ ok: false, error: "links_not_found" }, { status: 404 });
      const uncategorizedCount = links.filter((link) => !toSafeString(link.categoryId) && !toSafeString(link.categoryName)).length;
      const fallbackQueueCategory = toSafeString(data?.queueCategory);
      if (uncategorizedCount > 0 && !fallbackQueueCategory) {
        return NextResponse.json(
          {
            ok: false,
            error: "uncategorized_queue_category_required",
            uncategorizedCount,
          },
          { status: 400 },
        );
      }

      const groupedResults = await Promise.all(
        groupLinksByQueueCategory(links, fallbackQueueCategory).map(async (group) => ({
          queueCategory: group.queueCategory,
          count: group.items.length,
          result: await enqueueMarketingSourceSnapshots({
            universeId: access.universeId,
            snapshots: group.items.map(linkToSnapshot),
            priority: toSafeString(data?.priority) as MarketingJobPriority,
            queueCategory: group.queueCategory,
            scheduledAt: toScheduledAtPayload(data?.scheduledAt),
            force: Boolean(data?.force),
            requestedBy: toSafeString(user?.userEmail || user?.userEmailLower || user?.ID),
            trigger: "scrape_links_queue",
            generationMode: toSafeString(data?.generationMode) as "server_worker" | "local_agent",
            modelProvider: toSafeString(data?.modelProvider),
            modelName: toSafeString(data?.modelName),
            instructionText: toSafeString(data?.instructionText),
            contentTemplateKey: toSafeString(data?.contentTemplateKey),
            imageTemplateKey: toSafeString(data?.imageTemplateKey),
            reviewMode: toSafeString(data?.reviewMode),
            channels: Array.isArray(data?.channels) ? data.channels : undefined,
          }),
        })),
      );

      const result = groupedResults.reduce(
        (acc, group) => {
          acc.enqueued.push(...(group.result.enqueued || []).map((item) => ({ ...item, queueCategory: group.queueCategory })));
          acc.skipped.push(...(group.result.skipped || []).map((item) => ({ ...item, queueCategory: group.queueCategory })));
          acc.failed.push(...(group.result.failed || []).map((item) => ({ ...item, queueCategory: group.queueCategory })));
          acc.groups.push({
            queueCategory: group.queueCategory,
            count: group.count,
            enqueued: group.result.enqueued?.length || 0,
            skipped: group.result.skipped?.length || 0,
            failed: group.result.failed?.length || 0,
          });
          return acc;
        },
        {
          enqueued: [] as Array<Record<string, unknown>>,
          skipped: [] as Array<Record<string, unknown>>,
          failed: [] as Array<Record<string, unknown>>,
          groups: [] as Array<Record<string, unknown>>,
        },
      );

      return NextResponse.json({
        ok: true,
        data: {
          ...result,
          received: links.length,
          uncategorizedCount,
          maxBatchSize: MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
        },
      });
    }, 20000),
  (data: UnknownRecord) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "mini-apps-scrape-links-marketing-enqueue",
);
