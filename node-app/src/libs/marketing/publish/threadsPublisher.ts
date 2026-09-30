import "server-only";

import { MARKETING_DRY_RUN } from "consts/marketing/server";
import { THREADS_POST_MEDIA_MAX_COUNT, THREADS_POST_TEXT_MAX_LEN } from "consts/thirdparty/threads";
import { resolveSocialMarketingCredential } from "libs/marketing/auth/marketingOAuthResolver";
import { ThreadsApiClient } from "libs/api/thirdparty/threads/threadsClient";
import { stripSocialMarkdownText } from "libs/marketing/format/socialPlainText";
import { resolveMarketingPublishImages } from "libs/marketing/images/resolvePublishImage";
import { buildMarketingUtmUrl } from "libs/marketing/utm/buildUtmUrl";
import { logger } from "utils/log";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function uniqueStrings(values: unknown, limit = 6) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => toSafeString(value))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function uniqueHashTags(values: unknown, limit = 6) {
  return uniqueStrings(values, limit)
    .map((item) => {
      const tag = toSafeString(item).replace(/^#+/, "");
      return tag ? `#${tag}` : "";
    })
    .filter(Boolean);
}

function splitThreadsText(text: string) {
  const source = toSafeString(text);
  if (!source) return [];

  const chunks: string[] = [];
  let rest = source;

  while (rest.length > THREADS_POST_TEXT_MAX_LEN) {
    const windowText = rest.slice(0, THREADS_POST_TEXT_MAX_LEN + 1);
    const breakCandidates = [
      windowText.lastIndexOf("\n\n", THREADS_POST_TEXT_MAX_LEN),
      windowText.lastIndexOf("\n", THREADS_POST_TEXT_MAX_LEN),
      windowText.lastIndexOf(". ", THREADS_POST_TEXT_MAX_LEN),
      windowText.lastIndexOf(" ", THREADS_POST_TEXT_MAX_LEN),
    ];
    const breakAt = Math.max(...breakCandidates);
    const cutAt = breakAt >= Math.floor(THREADS_POST_TEXT_MAX_LEN * 0.45) ? breakAt : THREADS_POST_TEXT_MAX_LEN;
    const chunk = rest.slice(0, cutAt).trim();

    if (chunk) chunks.push(chunk);
    rest = rest.slice(cutAt).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function buildThreadsPostPayload(args: {
  text: string;
  cta?: string;
  finalUrl: string;
  hashtags?: unknown;
}) {
  const body = stripSocialMarkdownText(args.text);
  const cta = stripSocialMarkdownText(args.cta);
  const finalUrl = toSafeString(args.finalUrl);
  const hashtags = uniqueHashTags(args.hashtags).join(" ");

  const texts = splitThreadsText([body, hashtags].filter(Boolean).join("\n\n"));
  const commentTexts = splitThreadsText([cta, finalUrl].filter(Boolean).join("\n"));
  return { texts, commentTexts };
}

export async function publishMarketingThreadsDraft(args: {
  universeId: string;
  jobId: string;
  slug: string;
  draft: Record<string, unknown>;
  dryRun?: boolean;
  canonicalUrl: string;
  sourceImageUrl?: string;
  campaignId?: string;
}) {
  const publishLinkUrl = toSafeString(args.draft.linkUrl);
  const utm = buildMarketingUtmUrl({
    canonicalUrl: publishLinkUrl,
    channel: "threads",
    jobId: args.jobId,
    slug: args.slug,
    campaignId: args.campaignId,
  });

  const imageUrls = await resolveMarketingPublishImages({
    universeId: args.universeId,
    draft: args.draft,
    sourceImageUrl: args.sourceImageUrl,
    limit: THREADS_POST_MEDIA_MAX_COUNT,
  });
  const imageUrl = imageUrls[0] || "";
  const { texts, commentTexts } = buildThreadsPostPayload({
    text: toSafeString(args.draft.text),
    cta: utm.finalUrl ? toSafeString(args.draft.cta) : "",
    finalUrl: utm.finalUrl,
    hashtags: args.draft.hashtags,
  });
  const request = {
    text: texts[0] || "",
    texts,
    commentTexts,
    postCount: texts.length,
    commentCount: commentTexts.length,
    imageUrl,
    imageUrls,
    mediaType: imageUrls.length > 1 ? "CAROUSEL" : imageUrl ? "IMAGE" : "TEXT",
    canonicalUrl: utm.canonicalUrl,
    finalUrl: utm.finalUrl,
    hashtags: uniqueHashTags(args.draft.hashtags),
    utm: utm.utm,
    trackingPolicy: utm.policy,
  };

  if (!request.text) {
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "validation_failed" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: "THREADS_TEXT_REQUIRED",
        message: "threads_text_required",
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

  const credential = await resolveSocialMarketingCredential(args.universeId, "threads");
  const threadsUserId = toSafeString(credential?.clientId);
  const accessToken = toSafeString(credential?.clientSecret);
  if (!threadsUserId || !accessToken) {
    return {
      ok: true as const,
      status: "skipped" as const,
      mode: "missing_credential" as const,
      request,
      response: {},
      publishedAt: null,
    };
  }

  try {
    const client = new ThreadsApiClient({
      baseUrl: typeof credential?.extras?.graphBaseUrl === "string" ? credential.extras.graphBaseUrl : undefined,
    });
    const posts: Array<{ index: number; creationId: string; postId: string }> = [];
    let replyToId = "";

    for (const [index, text] of texts.entries()) {
      const created =
        index === 0 && request.imageUrls.length > 1
          ? await client.createCarouselPostContainer({
              threadsUserId,
              accessToken,
              childIds: (
                await Promise.all(
                  request.imageUrls.map(async (carouselImageUrl) => {
                    const child = await client.createCarouselImageItemContainer({
                      threadsUserId,
                      accessToken,
                      imageUrl: carouselImageUrl,
                    });
                    const childId = toSafeString(child?.id);
                    await client.waitForMediaContainerReady({
                      accessToken,
                      creationId: childId,
                    });
                    return childId;
                  }),
                )
              ).filter(Boolean),
              text,
            })
          : index === 0 && request.imageUrl
            ? await client.createImagePostContainer({
                threadsUserId,
                accessToken,
                imageUrl: request.imageUrl,
                text,
              })
            : await client.createTextPostContainer({
                threadsUserId,
                accessToken,
                text,
                replyToId,
              });
      const creationId = toSafeString(created?.id);
      await client.waitForMediaContainerReady({
        accessToken,
        creationId,
      });
      const published = await client.publishPost({
        threadsUserId,
        accessToken,
        creationId,
      });
      const postId = toSafeString(published?.id);
      posts.push({
        index,
        creationId,
        postId,
      });
      if (postId && (index < texts.length - 1 || commentTexts.length > 0)) {
        await client.waitForPublishedPostAvailable({
          accessToken,
          postId,
        });
      }
      replyToId = postId || replyToId;
    }
    for (const [index, text] of commentTexts.entries()) {
      const created = await client.createTextPostContainer({
        threadsUserId,
        accessToken,
        text,
        replyToId,
      });
      const creationId = toSafeString(created?.id);
      await client.waitForMediaContainerReady({
        accessToken,
        creationId,
      });
      const published = await client.publishPost({
        threadsUserId,
        accessToken,
        creationId,
      });
      const postId = toSafeString(published?.id);
      posts.push({
        index: texts.length + index,
        creationId,
        postId,
      });
      if (postId && index < commentTexts.length - 1) {
        await client.waitForPublishedPostAvailable({
          accessToken,
          postId,
        });
      }
      replyToId = postId || replyToId;
    }
    const publishedAt = new Date();

    return {
      ok: true as const,
      status: "published" as const,
      mode: "published" as const,
      request,
      response: {
        creationId: posts[0]?.creationId || "",
        postId: posts[0]?.postId || "",
        posts,
        username: toSafeString(credential?.extras?.username),
      },
      publishedAt: publishedAt.toISOString(),
    };
  } catch (error: unknown) {
    logger.error("[marketing/threadsPublisher] publish failed", error);
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "failed" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: "THREADS_PUBLISH_FAILED",
        message: toSafeString(error instanceof Error ? error.message : "") || "threads_publish_failed",
      },
    };
  }
}
