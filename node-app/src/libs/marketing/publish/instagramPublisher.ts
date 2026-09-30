import "server-only";

import crypto from "crypto";
import { MARKETING_DRY_RUN } from "consts/marketing/server";
import { INSTAGRAM_CAPTION_MAX_LEN, resolveInstagramAuthMode } from "consts/thirdparty/instagram";
import { resolveSocialMarketingCredential } from "libs/marketing/auth/marketingOAuthResolver";
import {
  InstagramGraphClient,
  type InstagramContainerStatusResponse,
} from "libs/api/thirdparty/instagram/instagramClient";
import {
  getInstagramAccountIdentityFields,
  resolveInstagramAccountIdentity,
} from "libs/api/thirdparty/instagram/instagramIdentity";
import { stripSocialMarkdownText } from "libs/marketing/format/socialPlainText";
import { resolveMarketingPublishImages } from "libs/marketing/images/resolvePublishImage";
import { getCardNewsPublishGateError } from "libs/card-news/draftMapping";
import { buildMarketingUtmUrl } from "libs/marketing/utm/buildUtmUrl";
import { transformImageBufferByBridge } from "libs/server-utils/file/imageTransformBridge";
import { getR2PublicObjectFromUrl, putR2PublicObject } from "libs/server-utils/storage/r2Storage";
import { toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

const INSTAGRAM_CONTAINER_POLL_INTERVAL_MS = 1_000;
const INSTAGRAM_CONTAINER_POLL_MAX_ATTEMPTS = 20;
const INSTAGRAM_IMAGE_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const INSTAGRAM_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const INSTAGRAM_IMAGE_FETCH_TIMEOUT_MS = 15_000;

function createInstagramPublisherError(code: string, message: string, details: UnknownRecord = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

function requireInstagramContainerId(value: unknown) {
  const containerId = toSafeString(toUnknownRecord(value).id);
  if (!containerId) {
    throw createInstagramPublisherError(
      "INSTAGRAM_CONTAINER_ID_MISSING",
      "instagram_container_id_missing",
    );
  }
  return containerId;
}

function toFiniteNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeInstagramPublishError(error: unknown, phase: string) {
  const errorRecord = toUnknownRecord(error);
  const payload = toUnknownRecord(errorRecord.payload);
  const graphError = toUnknownRecord(payload.error);
  const graphCode = toFiniteNumber(graphError.code);
  const graphSubcode = toFiniteNumber(graphError.error_subcode);
  const httpStatus = toFiniteNumber(errorRecord.status);
  const message =
    toSafeString(error instanceof Error ? error.message : "") ||
    toSafeString(graphError.message) ||
    "instagram_publish_failed";

  return {
    code:
      toSafeString(errorRecord.code) ||
      (graphCode !== undefined ? "INSTAGRAM_GRAPH_API_ERROR" : "INSTAGRAM_PUBLISH_FAILED"),
    message,
    phase,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(graphCode !== undefined ? { graphCode } : {}),
    ...(graphSubcode !== undefined ? { graphSubcode } : {}),
    ...(toSafeString(graphError.type) ? { graphType: toSafeString(graphError.type) } : {}),
    ...(toSafeString(graphError.fbtrace_id) ? { graphTraceId: toSafeString(graphError.fbtrace_id) } : {}),
    ...(toSafeString(errorRecord.containerId) ? { containerId: toSafeString(errorRecord.containerId) } : {}),
    ...(toSafeString(errorRecord.containerStatus)
      ? { containerStatus: toSafeString(errorRecord.containerStatus) }
      : {}),
    ...(toSafeString(errorRecord.containerMessage)
      ? { containerMessage: toSafeString(errorRecord.containerMessage) }
      : {}),
  };
}

async function waitForInstagramContainer(args: {
  client: InstagramGraphClient;
  containerId: string;
  accessToken: string;
}) {
  let lastStatus: InstagramContainerStatusResponse = {};

  for (let attempt = 1; attempt <= INSTAGRAM_CONTAINER_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      lastStatus = await args.client.getContainerStatus({
        containerId: args.containerId,
        accessToken: args.accessToken,
      });
    } catch (error: unknown) {
      if (error instanceof Error) Object.assign(error, { containerId: args.containerId });
      throw error;
    }
    const statusCode = toSafeString(lastStatus.status_code).toUpperCase();
    if (statusCode === "FINISHED") return { ...lastStatus, attempts: attempt };
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw createInstagramPublisherError("INSTAGRAM_CONTAINER_FAILED", "instagram_container_failed", {
        containerId: args.containerId,
        containerStatus: statusCode,
        containerMessage: toSafeString(lastStatus.status),
      });
    }
    if (attempt < INSTAGRAM_CONTAINER_POLL_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, INSTAGRAM_CONTAINER_POLL_INTERVAL_MS));
    }
  }

  throw createInstagramPublisherError("INSTAGRAM_CONTAINER_TIMEOUT", "instagram_container_timeout", {
    containerId: args.containerId,
    containerStatus: toSafeString(lastStatus.status_code),
    containerMessage: toSafeString(lastStatus.status),
  });
}

async function prepareInstagramR2Image(imageUrl: string) {
  const source = getR2PublicObjectFromUrl(imageUrl);
  if (!source) return imageUrl;
  if (source.key.startsWith("marketing/instagram/") && /\.jpe?g$/i.test(source.key)) return imageUrl;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INSTAGRAM_IMAGE_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(imageUrl, { cache: "no-store", redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw createInstagramPublisherError(
      "INSTAGRAM_IMAGE_FETCH_FAILED",
      `instagram_image_fetch_failed:${response.status}`,
    );
  }
  const contentType = toSafeString(response.headers.get("content-type")).toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw createInstagramPublisherError("INSTAGRAM_IMAGE_INVALID_CONTENT_TYPE", "instagram_image_invalid_content_type");
  }
  const contentLength = toFiniteNumber(response.headers.get("content-length"));
  if (contentLength !== undefined && contentLength > INSTAGRAM_IMAGE_SOURCE_MAX_BYTES) {
    throw createInstagramPublisherError("INSTAGRAM_IMAGE_SOURCE_TOO_LARGE", "instagram_image_source_too_large");
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  if (sourceBuffer.length > INSTAGRAM_IMAGE_SOURCE_MAX_BYTES) {
    throw createInstagramPublisherError("INSTAGRAM_IMAGE_SOURCE_TOO_LARGE", "instagram_image_source_too_large");
  }
  const transformed = await transformImageBufferByBridge({
    input: sourceBuffer,
    format: "jpg",
    quality: 90,
    maxWidth: 1_440,
  });
  if (transformed.bytes > INSTAGRAM_IMAGE_MAX_BYTES) {
    throw createInstagramPublisherError("INSTAGRAM_IMAGE_TOO_LARGE", "instagram_image_too_large");
  }

  const digest = crypto.createHash("sha256").update(transformed.buffer).digest("hex");
  const stored = await putR2PublicObject({
    key: `marketing/instagram/${digest}.jpg`,
    body: transformed.buffer,
    contentType: transformed.mimeType,
  });
  return stored.url;
}

function uniqueHashtags(values: unknown, limit = 20) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : String(values || "").split(/[,\s]+/))
        .map((value) => toSafeString(value))
        .filter(Boolean)
        .map((value) => (value.startsWith("#") ? value : `#${value.replace(/^#+/, "")}`)),
    ),
  ).slice(0, limit);
}

function buildCaption(args: { title?: string; body?: string; cta?: string; finalUrl?: string; hashtags?: string[] }) {
  const hashtags = uniqueHashtags(args.hashtags).join(" ");
  return [args.title, args.body, args.cta, args.finalUrl, hashtags]
    .map((value) => stripSocialMarkdownText(value))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, INSTAGRAM_CAPTION_MAX_LEN)
    .trim();
}

export async function publishMarketingInstagramDraft(args: {
  universeId: string;
  jobId: string;
  slug: string;
  draft: UnknownRecord;
  dryRun?: boolean;
  canonicalUrl: string;
  sourceImageUrl?: string;
  campaignId?: string;
}) {
  const cardNewsPublishGateError = getCardNewsPublishGateError(args.draft);
  const hashtags = uniqueHashtags(args.draft.hashtags || args.draft.tags);
  const utm = buildMarketingUtmUrl({
    canonicalUrl: toSafeString(args.draft.linkUrl || args.draft.commentLink) || args.canonicalUrl,
    channel: "instagram",
    jobId: args.jobId,
    slug: args.slug,
    campaignId: args.campaignId,
  });
  const imageUrls = await resolveMarketingPublishImages({
    universeId: args.universeId,
    draft: args.draft,
    sourceImageUrl: args.sourceImageUrl,
    limit: 10,
  });
  const request = {
    imageUrl: imageUrls[0] || "",
    imageUrls,
    sourceImageUrls: imageUrls,
    mediaType: imageUrls.length > 1 ? "CAROUSEL" : "IMAGE",
    caption: buildCaption({
      title: toSafeString(args.draft.title || args.draft.headline),
      body: toSafeString(args.draft.caption || args.draft.body || args.draft.text || args.draft.summary),
      cta: toSafeString(args.draft.cta),
      finalUrl: utm.finalUrl,
      hashtags,
    }),
    canonicalUrl: utm.canonicalUrl,
    finalUrl: utm.finalUrl,
    hashtags,
    utm: utm.utm,
    trackingPolicy: utm.policy,
  };

  if (cardNewsPublishGateError) {
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "invalid_draft" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: cardNewsPublishGateError.toUpperCase(),
        message: cardNewsPublishGateError,
      },
    };
  }

  if (!request.imageUrls.length) {
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "invalid_draft" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: "INSTAGRAM_IMAGE_URL_REQUIRED",
        message: "instagram_image_url_required",
      },
    };
  }

  if (!request.caption) {
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "invalid_draft" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: "INSTAGRAM_CAPTION_REQUIRED",
        message: "instagram_caption_required",
      },
    };
  }

  const dryRun = typeof args.dryRun === "boolean" ? args.dryRun : MARKETING_DRY_RUN;
  if (dryRun) {
    return {
      ok: true as const,
      status: "draft" as const,
      mode: "dry_run" as const,
      request,
      response: {},
      publishedAt: null,
    };
  }

  const credential = await resolveSocialMarketingCredential(args.universeId, "instagram");
  const instagramUserId = toSafeString(credential?.clientId);
  const accessToken = toSafeString(credential?.clientSecret);
  if (!instagramUserId || !accessToken) {
    return {
      ok: true as const,
      status: "skipped" as const,
      mode: "missing_credential" as const,
      request,
      response: {},
      publishedAt: null,
    };
  }

  let phase = "validate_account";
  let publishRequest = request;
  try {
    const authMode = resolveInstagramAuthMode(credential?.extras?.authMode, credential?.extras?.graphBaseUrl);
    const client = new InstagramGraphClient({ authMode });
    const account = await client.getAccountFields({
      instagramUserId,
      accessToken,
      fields: getInstagramAccountIdentityFields(authMode),
    });
    const identity = resolveInstagramAccountIdentity(account, authMode);
    const validatedAccountId = identity.accountId;
    const validatedUsername = identity.username;
    if (validatedAccountId !== instagramUserId) {
      throw new Error("instagram_credential_account_mismatch");
    }
    const expectedUsername = toSafeString(credential?.extras?.username).toLowerCase();
    if (expectedUsername && validatedUsername.toLowerCase() !== expectedUsername) {
      throw new Error("instagram_credential_username_mismatch");
    }

    phase = "prepare_images";
    const preparedImageUrls = await Promise.all(request.imageUrls.map((imageUrl) => prepareInstagramR2Image(imageUrl)));
    publishRequest = {
      ...request,
      sourceImageUrls: request.imageUrls,
      imageUrl: preparedImageUrls[0] || "",
      imageUrls: preparedImageUrls,
    };

    phase = preparedImageUrls.length > 1 ? "create_carousel_children" : "create_image_container";
    const childContainers =
      preparedImageUrls.length > 1
        ? await Promise.all(
            preparedImageUrls.map((imageUrl) =>
              client.createCarouselImageContainer({
                instagramUserId,
                accessToken,
                imageUrl,
              }),
            ),
          )
        : [];
    phase = "wait_carousel_children";
    const childContainerIds = childContainers.map(requireInstagramContainerId);
    const childStatuses = await Promise.all(
      childContainerIds.map((containerId) =>
        waitForInstagramContainer({
          client,
          containerId,
          accessToken,
        }),
      ),
    );

    phase = childContainers.length > 1 ? "create_carousel_container" : "create_image_container";
    const created =
      childContainers.length > 1
        ? await client.createCarouselContainer({
            instagramUserId,
            accessToken,
            childIds: childContainerIds,
            caption: publishRequest.caption,
          })
        : await client.createImageContainer({
            instagramUserId,
            accessToken,
            imageUrl: publishRequest.imageUrl,
            caption: publishRequest.caption,
          });
    phase = childContainers.length > 1 ? "wait_carousel_container" : "wait_image_container";
    const creationId = requireInstagramContainerId(created);
    const containerStatus = await waitForInstagramContainer({
      client,
      containerId: creationId,
      accessToken,
    });

    phase = "publish_container";
    const published = await client.publishMedia({
      instagramUserId,
      accessToken,
      creationId,
    });
    const publishedAt = new Date();

    return {
      ok: true as const,
      status: "published" as const,
      mode: "published" as const,
      request: publishRequest,
      response: {
        creationId,
        mediaId: toSafeString(published?.id),
        childCreationIds: childContainerIds,
        childStatuses,
        containerStatus,
        username: validatedUsername || toSafeString(credential?.extras?.username),
      },
      publishedAt: publishedAt.toISOString(),
    };
  } catch (error: unknown) {
    logger.error("[marketing/instagramPublisher] publish failed", error);
    const publishError = normalizeInstagramPublishError(error, phase);
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "failed" as const,
      request: publishRequest,
      response: { error: publishError },
      publishedAt: null,
      error: publishError,
    };
  }
}
