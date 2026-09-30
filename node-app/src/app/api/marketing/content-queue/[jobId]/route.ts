import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import {
  createMarketingAsset,
  listMarketingAssets,
  listMarketingJobSteps,
  listMarketingPublishLogs,
  updateMarketingAsset,
  updateMarketingJob,
} from "libs/database/marketing";
import { listImageAssets } from "libs/database/lab";
import wpCacheService from "libs/services/wpCacheService";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import {
  archiveMarketingJob,
  cancelMarketingJob,
  requestMarketingJobGeneration,
  updateMarketingJobCategory,
} from "libs/marketing/operator/jobLifecycleService";
import { resolveMarketingJobAccess } from "libs/marketing/operator/access";
import { pollMarketingDryRunWorker } from "libs/marketing/queue/worker";
import { extractMarketingPostImageFields } from "libs/marketing/sourceImageFields";
import { toAbsoluteMarketingImageUrl, toMarketingImageUrlValues } from "libs/marketing/images/resolvePublishImage";
import { dedupeImagePreviewsByUrl } from "utils/common/imagePreviewUtils";
import { resolveMarketingContentImagesByIds } from "libs/marketing/images/contentImageService";
import type { MarketingChannel, MarketingJobPriority } from "consts/marketing/queue";
import { decodeHtmlEntities, stripHtml, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(marketing / content-queue / [jobId]) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GENSTUDIO_ASSET_ID_RE = /^asset_[a-z0-9]+$/i;

type MarketingDocLike = UnknownRecord;

function normalizeGenStudioAssetId(raw: unknown) {
  const value = toSafeString(raw).replace(/\s+/g, "");
  return GENSTUDIO_ASSET_ID_RE.test(value) ? value : "";
}

function isImageUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function pushImagePreview(
  previews: Array<Record<string, string>>,
  seen: Set<string>,
  input: {
    url?: string;
    assetId?: string;
    alt?: string;
    source?: string;
    label?: string;
  },
) {
  const assetId = normalizeGenStudioAssetId(input.assetId);
  const url = toAbsoluteMarketingImageUrl(input.url);
  const key = assetId || url;
  if (!key) return;

  const existingIndex = previews.findIndex((item) =>
    (assetId && item.assetId === assetId) || (url && item.url === url),
  );
  if (existingIndex >= 0) {
    const existing = previews[existingIndex];
    previews[existingIndex] = {
      ...existing,
      key: assetId || existing.key || url,
      ...(url ? { url, downloadUrl: url } : {}),
      ...(assetId ? { assetId } : {}),
      alt: existing.alt || toSafeString(input.alt),
      source: existing.source || toSafeString(input.source),
      label: existing.label || toSafeString(input.label),
    };
    seen.add(key);
    return;
  }
  if (seen.has(key)) return;
  seen.add(key);

  previews.push({
    key,
    url,
    assetId,
    alt: toSafeString(input.alt),
    source: toSafeString(input.source),
    label: toSafeString(input.label),
    downloadUrl: url,
  });
}

function collectImagePreviewsFromValue(
  value: unknown,
  previews: Array<Record<string, string>>,
  seen: Set<string>,
  context: { source: string; label: string },
) {
  if (!value) return;

  if (typeof value === "string") {
    const safeValue = toSafeString(value);
    const assetId = normalizeGenStudioAssetId(safeValue);
    if (assetId) {
      pushImagePreview(previews, seen, { assetId, source: context.source, label: context.label });
    } else {
      toMarketingImageUrlValues(safeValue, 12)
        .filter(isImageUrl)
        .forEach((url) => pushImagePreview(previews, seen, { url, source: context.source, label: context.label }));
    }
    return;
  }

  if (Array.isArray(value)) {
    value.slice(0, 12).forEach((item) => collectImagePreviewsFromValue(item, previews, seen, context));
    return;
  }

  if (typeof value !== "object") return;

  const record = value as MarketingDocLike;
  const imageUrlKeys = [
    "url",
    "imageUrl",
    "image_url",
    "thumbnailUrl",
    "thumbnail_url",
    "featured_media_url",
  ];
  const assetIdKeys = [
    "imageAssetId",
    "image_asset_id",
    "assetId",
    "genStudioImageAssetId",
    "genstudio_thumbnail_asset_id",
  ];
  const alt = toSafeString(record.alt || record.imageAlt || record.featured_media_alt || record.title);

  imageUrlKeys.forEach((key) =>
    pushImagePreview(previews, seen, {
      url: toSafeString(record[key]),
      alt,
      source: context.source,
      label: context.label,
    }),
  );
  assetIdKeys.forEach((key) =>
    pushImagePreview(previews, seen, {
      url: toSafeString(record.url || record.imageUrl || record.image_url || record.thumbnailUrl),
      assetId: normalizeGenStudioAssetId(record[key]),
      alt,
      source: context.source,
      label: context.label,
    }),
  );

  collectImagePreviewsFromValue(record.imageUrls, previews, seen, context);
  collectImagePreviewsFromValue(record.images, previews, seen, context);
  collectImagePreviewsFromValue(record.imageAssetIds, previews, seen, context);
}

async function resolveGenStudioImagePreviewUrls(previews: Array<Record<string, string>>) {
  const assetIds = Array.from(new Set(previews.map((item) => normalizeGenStudioAssetId(item.assetId)).filter(Boolean)));
  if (!assetIds.length) return previews.filter((item) => toSafeString(item.url));

  const rows = await listImageAssets({
    scope: "all",
    visibility: "public",
    state: "active",
    assetIds,
    limit: assetIds.length,
  }).catch(() => []);
  const urlByAssetId = new Map(
    (rows || [])
      .map((asset) => {
        const record = toUnknownRecord(asset);
        const storage = toUnknownRecord(record.storage);
        return [normalizeGenStudioAssetId(record.assetId), toAbsoluteMarketingImageUrl(storage.url)] as const;
      })
      .filter(([assetId, url]) => assetId && url),
  );

  return previews
    .map((item) => {
      const url = toSafeString(item.url) || urlByAssetId.get(normalizeGenStudioAssetId(item.assetId)) || "";
      const absoluteUrl = toAbsoluteMarketingImageUrl(url);
      return { ...item, url: absoluteUrl, downloadUrl: absoluteUrl };
    })
    .filter((item) => toSafeString(item.url));
}

async function buildChannelImagePreviews(job: MarketingDocLike, channel: string, channelAssets: MarketingDocLike[]) {
  const previews: Array<Record<string, string>> = [];
  const seen = new Set<string>();
  const sourceAssets = channelAssets.filter((asset) => toSafeString(asset.kind) === "source_snapshot");
  const draftAssets = channelAssets.filter((asset) => toSafeString(asset.kind) === "channel_draft");
  const channelImageAssets = channelAssets.filter(
    (asset) => toSafeString(asset.kind) === "channel_image" && toSafeString(asset.state || "active") === "active",
  );

  collectImagePreviewsFromValue(job?.sourceRef, previews, seen, {
    source: "job_source",
    label: "source",
  });
  sourceAssets.forEach((asset) =>
    collectImagePreviewsFromValue(asset?.content, previews, seen, {
      source: "source_snapshot",
      label: toSafeString(asset?.title) || "source snapshot",
    }),
  );
  draftAssets.forEach((asset) =>
    collectImagePreviewsFromValue(asset?.content, previews, seen, {
      source: "channel_draft",
      label: `${channel} draft`,
    }),
  );
  channelImageAssets.forEach((asset) =>
    collectImagePreviewsFromValue(asset?.content, previews, seen, {
      source: "channel_image",
      label: toSafeString(asset?.title) || `${channel} image`,
    }),
  );

  const resolvedPreviews = dedupeImagePreviewsByUrl(await resolveGenStudioImagePreviewUrls(previews));
  const marketingUploadAssetIds = Array.from(
    new Set(
      [...draftAssets, ...channelImageAssets].flatMap((asset) => {
        const content = toUnknownRecord(asset.content);
        return Array.isArray(content.marketingUploadAssetIds)
          ? content.marketingUploadAssetIds.map(toSafeString).filter(Boolean)
          : [];
      }),
    ),
  );
  if (!marketingUploadAssetIds.length) return resolvedPreviews;

  const uploadedImages = await resolveMarketingContentImagesByIds({
    universeId: toSafeString(job.universeId),
    assetIds: marketingUploadAssetIds,
    strict: false,
  });
  const assetIdByUrl = new Map(
    uploadedImages
      .map((asset) => [toAbsoluteMarketingImageUrl(asset?.url), toSafeString(asset?.assetId)] as const)
      .filter(([url, assetId]) => url && assetId),
  );
  return resolvedPreviews.map((preview) => ({
    ...preview,
    marketingUploadAssetId: assetIdByUrl.get(toSafeString(preview.url)) || "",
  }));
}

async function refreshMarketingJobSourceImages(args: { job: MarketingDocLike; universeId: string; requestedBy: string }) {
  const job = args.job;
  const sourceRef = toUnknownRecord(job.sourceRef);
  const jobId = toSafeString(job.jobId);
  const postId = Number(sourceRef.postId || 0) || undefined;
  const slug = toSafeString(sourceRef.slug);
  if (!postId && !slug) return { ok: false as const, status: 400, error: "wp_source_ref_required" };

  const post = await wpCacheService.getPostDetail({ postId, slug: slug || undefined, forceRefresh: true });
  if (!post?.id) return { ok: false as const, status: 404, error: "wp_post_not_found" };

  const imageFields = extractMarketingPostImageFields(post);
  const refreshedAt = new Date().toISOString();
  const nextSourceSnapshot = {
    ...toUnknownRecord(sourceRef.sourceSnapshot),
    postId: Number(post.id),
    slug: toSafeString(post.slug || slug),
    url: toSafeString(post.link || sourceRef.url),
    title: decodeHtmlEntities(toSafeString(post.title?.rendered || sourceRef.title)),
    imageUrl: imageFields.imageUrl,
    imageAlt: imageFields.imageAlt,
    imageSource: imageFields.imageSource,
    genStudioImageAssetId: imageFields.genStudioImageAssetId,
    imageUrls: imageFields.imageUrls,
    excerptText: decodeHtmlEntities(toSafeString(stripHtml(toSafeString(post.excerpt?.rendered)))).slice(0, 1200),
    contentText: decodeHtmlEntities(toSafeString(stripHtml(toSafeString(post.content?.rendered)))).slice(0, 4000),
    categories: Array.isArray(post.categories) ? post.categories.map(String) : [],
    tags: Array.isArray(post.tags) ? post.tags.map(String) : [],
    modified: toSafeString(post.modified),
    refreshedAt,
  };
  const nextSourceRef = {
    ...sourceRef,
    postId: Number(post.id),
    slug: nextSourceSnapshot.slug,
    url: nextSourceSnapshot.url,
    imageUrl: imageFields.imageUrl,
    imageAlt: imageFields.imageAlt,
    imageSource: imageFields.imageSource,
    genStudioImageAssetId: imageFields.genStudioImageAssetId,
    imageUrls: imageFields.imageUrls,
    sourceSnapshot: nextSourceSnapshot,
    sourceImageRefreshedAt: refreshedAt,
  };

  const [loadStep, ...sourceAssets] = await Promise.all([
    listMarketingJobSteps({ jobId, limit: 200 }).then((steps) =>
      steps.find((step) => toSafeString(step.stepKey) === "load_wp_content"),
    ),
    listMarketingAssets({ jobId, kind: "source_snapshot", limit: 20 }),
  ]);
  const sourceAsset = toUnknownRecord(sourceAssets.flat()[0]);
  const sourceAssetId = toSafeString(sourceAsset.assetId);
  const updatedSourceAsset = sourceAssetId
    ? await updateMarketingAsset({
        assetId: sourceAssetId,
        set: {
          title: nextSourceSnapshot.title,
          content: nextSourceSnapshot,
          meta: {
            ...toUnknownRecord(sourceAsset.meta),
            refreshedBy: args.requestedBy,
            refreshedAt,
          },
        },
      })
    : await createMarketingAsset({
        jobId,
        stepId: toSafeString(loadStep?.stepId),
        universeId: args.universeId,
        kind: "source_snapshot",
        title: nextSourceSnapshot.title,
        mimeType: "application/json",
        content: nextSourceSnapshot,
        meta: {
          refreshedBy: args.requestedBy,
          refreshedAt,
        },
      });

  await updateMarketingJob({
    jobId,
    set: {
      sourceRef: nextSourceRef,
      metrics: {
        ...toUnknownRecord(job.metrics),
        sourceImageRefresh: {
          refreshedAt,
          refreshedBy: args.requestedBy,
          sourceSnapshotAssetId: updatedSourceAsset?.assetId,
          imageCount: imageFields.imageUrls.length + (imageFields.genStudioImageAssetId ? 1 : 0),
        },
      },
    },
  });

  return {
    ok: true as const,
    data: {
      sourceSnapshotAssetId: updatedSourceAsset?.assetId,
      imageUrl: imageFields.imageUrl,
      imageUrls: imageFields.imageUrls,
      genStudioImageAssetId: imageFields.genStudioImageAssetId,
      refreshedAt,
    },
  };
}

async function buildChannelSummaries(
  job: MarketingDocLike,
  steps: MarketingDocLike[],
  assets: MarketingDocLike[],
  publishLogs: MarketingDocLike[],
) {
  const channels: string[] = Array.isArray(job?.channels)
    ? job.channels.map((channel) => toSafeString(channel)).filter(Boolean)
    : [];

  return await Promise.all(channels.map(async (channel: string) => {
    const channelAssets = assets.filter(
      (asset) => toSafeString(asset.channel) === channel || toSafeString(asset.kind) === "source_snapshot",
    );
    const draftAsset = channelAssets.find((asset) => toSafeString(asset.kind) === "channel_draft") || null;
    const validationAsset = channelAssets.find((asset) => toSafeString(asset.kind) === "validation_report") || null;
    const receiptAsset = channelAssets.find((asset) => toSafeString(asset.kind) === "publish_receipt") || null;
    const latestPublishLog = publishLogs.find((log) => toSafeString(log.channel) === channel) || null;
    const generateStep =
      steps.find(
        (step) => toSafeString(step.stepKey) === "generate_channel_copy" && toSafeString(step.channel) === channel,
      ) || null;
    const validateStep =
      steps.find(
        (step) => toSafeString(step.stepKey) === "validate_output" && toSafeString(step.channel) === channel,
      ) || null;
    const reviewStep =
      channel === "linkedin"
        ? steps.find(
            (step) => toSafeString(step.stepKey) === "prepare_linkedin_draft" && toSafeString(step.channel) === "linkedin",
          ) || null
        : channel === "naver_blog"
          ? steps.find(
              (step) => toSafeString(step.stepKey) === "prepare_naver_draft" && toSafeString(step.channel) === "naver_blog",
            ) || null
          : channel === "threads"
            ? steps.find(
                (step) => toSafeString(step.stepKey) === "publish_threads" && toSafeString(step.channel) === "threads",
              ) || null
            : channel === "instagram"
              ? steps.find(
                  (step) =>
                    toSafeString(step.stepKey) === "publish_instagram" && toSafeString(step.channel) === "instagram",
                ) || null
            : null;
    const publishStep =
      channel === "threads"
        ? steps.find(
            (step) => toSafeString(step.stepKey) === "publish_threads" && toSafeString(step.channel) === "threads",
          ) || null
        : channel === "instagram"
          ? steps.find(
              (step) => toSafeString(step.stepKey) === "publish_instagram" && toSafeString(step.channel) === "instagram",
            ) || null
        : null;

    return {
      channel,
      draftAsset,
      validationAsset,
      receiptAsset,
      latestPublishLog,
      generateStep,
      validateStep,
      reviewStep,
      publishStep,
      imagePreviews: await buildChannelImagePreviews(job, channel, channelAssets),
    };
  }));
}

export const GET = withAuth(
  async (_data, user, request: NextRequest | undefined, { params }: { params: Promise<{ jobId: string }> }) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const { jobId } = await params;
      const searchParams = request ? new URL(request.url).searchParams : undefined;
      const access = await resolveMarketingJobAccess({
        user,
        jobId,
        universeId: toSafeString(searchParams?.get("universeId")),
      });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }

      const [steps, assets, publishLogs] = await Promise.all([
        listMarketingJobSteps({ jobId, limit: 200 }),
        listMarketingAssets({ jobId, limit: 200 }),
        listMarketingPublishLogs({ universeId: access.universeId, jobId, limit: 100 }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          job: access.job,
          steps,
          assets,
          publishLogs,
          channels: await buildChannelSummaries(access.job, steps, assets, publishLogs),
        },
      });
    }, 20000),
  undefined,
  "marketing_content_queue_detail",
);

export const PATCH = withAuth(
  async (data, user, _request: NextRequest | undefined, { params }: { params: Promise<{ jobId: string }> }) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const { jobId } = await params;
      const access = await resolveMarketingJobAccess({
        user,
        jobId,
        universeId: toSafeString(data?.universeId),
      });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }

      const action = toSafeString(data?.action);
      const requestedBy = toSafeString(user?.userEmail || user?.userEmailLower);
      const reason = toSafeString(data?.reason);
      const result =
        action === "cancel"
          ? await cancelMarketingJob({
              universeId: access.universeId,
              jobId,
              requestedBy,
              reason,
              archive: false,
            })
          : action === "cancel_and_archive"
            ? await cancelMarketingJob({
                universeId: access.universeId,
                jobId,
                requestedBy,
                reason,
                archive: true,
                })
              : action === "archive"
                ? await archiveMarketingJob({
                    universeId: access.universeId,
                    jobId,
                    requestedBy,
                    reason,
                  })
                : action === "update_category"
                  ? await updateMarketingJobCategory({
                      universeId: access.universeId,
                      jobId,
                      queueCategory: toSafeString(data?.queueCategory),
                      requestedBy,
                      reason,
                    })
                  : action === "request_generation"
                    ? await requestMarketingJobGeneration({
                        universeId: access.universeId,
                        jobId,
                        channels: Array.isArray(data?.channels) ? (data.channels as MarketingChannel[]) : undefined,
                        queueCategory: toSafeString(data?.queueCategory),
                        priority: toSafeString(data?.priority) as MarketingJobPriority,
                        generationConfig: toUnknownRecord(data?.generationConfig),
                        requestedBy,
                        reason,
                      })
                    : action === "refresh_source_images"
                      ? await refreshMarketingJobSourceImages({
                          job: access.job,
                          universeId: access.universeId,
                          requestedBy,
                        })
                      : { ok: false as const, status: 400, error: "invalid_action" };

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }

      const runNow = action === "request_generation" && data?.runNow !== false;
      const workerResult =
        runNow && toSafeString(data?.generationConfig?.generationMode) !== "local_agent"
          ? await pollMarketingDryRunWorker({
              universeId: access.universeId,
              jobId,
              workerId: toSafeString(data?.workerId) || `admin-ui-${Date.now()}`,
              billingUid: toSafeString(user?.uid),
            })
          : null;

      return NextResponse.json({ success: true, data: { ...result, workerResult } });
    }, 20000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_content_queue_lifecycle",
);
