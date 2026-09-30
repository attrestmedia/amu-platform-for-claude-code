import "server-only";

import { MARKETING_DRY_RUN } from "consts/marketing/server";
import { getDecryptedLinkedInMemberToken } from "libs/database/secure/linkedinMemberTokens";
import { stripSocialMarkdownText } from "libs/marketing/format/socialPlainText";
import { resolveMarketingPublishImages } from "libs/marketing/images/resolvePublishImage";
import { buildMarketingUtmUrl } from "libs/marketing/utm/buildUtmUrl";
import { toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

const LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const LINKEDIN_ASSETS_REGISTER_URL = "https://api.linkedin.com/v2/assets?action=registerUpload";
const LINKEDIN_SOCIAL_ACTIONS_URL = "https://api.linkedin.com/v2/socialActions";
const LINKEDIN_SHARE_TEXT_MAX_LEN = 3000;

type LinkedInShareMedia = {
  status: "READY";
  media?: string;
  originalUrl?: string;
  title: { text: string };
  description: { text: string };
};

type LinkedInUgcPayload = {
  author: string;
  lifecycleState: "PUBLISHED";
  specificContent: {
    "com.linkedin.ugc.ShareContent": {
      shareCommentary: { text: string };
      shareMediaCategory: "IMAGE" | "ARTICLE" | "NONE";
      media?: LinkedInShareMedia[];
    };
  };
  visibility: {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC";
  };
};

function uniqueStrings(values: unknown, limit = 6) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : String(values || "").split(/[,\s]+/))
        .map((value) => toSafeString(value))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function buildShareText(args: { headline?: string; body?: string; hashtags?: string[] }) {
  const hashtags = uniqueStrings(args.hashtags)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`))
    .join(" ");
  const text = [args.headline, args.body, hashtags]
    .map((value) => stripSocialMarkdownText(value))
    .filter(Boolean)
    .join("\n\n");
  return text.slice(0, LINKEDIN_SHARE_TEXT_MAX_LEN).trim();
}

function buildCommentText(args: { cta?: unknown; finalUrl?: unknown }) {
  return [stripSocialMarkdownText(args.cta), toSafeString(args.finalUrl)].filter(Boolean).join("\n").trim();
}

function buildPostUrl(postId: string) {
  const safePostId = toSafeString(postId);
  return safePostId ? `https://www.linkedin.com/feed/update/${safePostId}` : "https://www.linkedin.com/feed/";
}

function parseJsonSafe(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function uploadLinkedInImage(args: { accessToken: string; owner: string; imageUrl: string }) {
  const registerPayload = {
    registerUploadRequest: {
      recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
      owner: args.owner,
      serviceRelationships: [
        {
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        },
      ],
    },
  };
  const registerResponse = await fetch(LINKEDIN_ASSETS_REGISTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(registerPayload),
  });
  const registerText = await registerResponse.text().catch(() => "");
  const registerBody = toUnknownRecord(parseJsonSafe(registerText));
  if (!registerResponse.ok) {
    throw new Error(
      toSafeString(registerBody.message) || `linkedin_image_register_failed:${registerResponse.status}`,
    );
  }

  const value = toUnknownRecord(registerBody.value);
  const uploadMechanism = toUnknownRecord(value.uploadMechanism);
  const mediaUpload = toUnknownRecord(uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]);
  const uploadUrl = toSafeString(
    mediaUpload.uploadUrl,
  );
  const asset = toSafeString(value.asset);
  if (!uploadUrl || !asset) {
    throw new Error("linkedin_image_upload_contract_invalid");
  }

  const imageResponse = await fetch(args.imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`linkedin_image_fetch_failed:${imageResponse.status}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": imageResponse.headers.get("content-type") || "application/octet-stream",
    },
    body: imageBuffer,
  });
  if (!uploadResponse.ok) {
    throw new Error(`linkedin_image_upload_failed:${uploadResponse.status}`);
  }

  return {
    asset,
    uploadUrl,
    bytes: imageBuffer.byteLength,
  };
}

async function createLinkedInComment(args: { accessToken: string; postId: string; actor: string; text: string }) {
  const response = await fetch(`${LINKEDIN_SOCIAL_ACTIONS_URL}/${encodeURIComponent(args.postId)}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      actor: args.actor,
      message: {
        text: args.text,
      },
    }),
  });
  const rawText = await response.text().catch(() => "");
  const body = toUnknownRecord(parseJsonSafe(rawText));
  if (!response.ok) {
    throw new Error(toSafeString(body.message) || `linkedin_comment_failed:${response.status}`);
  }

  return {
    status: response.status,
    commentId: toSafeString(response.headers.get("x-restli-id")) || toSafeString(body.id),
    body,
  };
}

export async function publishLinkedInMemberShare(args: {
  universeId: string;
  jobId: string;
  slug: string;
  draft: UnknownRecord;
  canonicalUrl: string;
  dryRun?: boolean;
  sourceImageUrl?: string;
}) {
  const hashtags = uniqueStrings(args.draft.hashtags);
  const utm = buildMarketingUtmUrl({
    canonicalUrl: toSafeString(args.draft.commentLink || args.draft.linkUrl) || args.canonicalUrl,
    channel: "linkedin",
    jobId: args.jobId,
    slug: args.slug,
  });
  const imageUrls = await resolveMarketingPublishImages({
    universeId: args.universeId,
    draft: args.draft,
    sourceImageUrl: args.sourceImageUrl,
    limit: 9,
  });
  const request = {
    text: buildShareText({
      headline: toSafeString(args.draft.headline || args.draft.title),
      body: toSafeString(args.draft.body),
      hashtags,
    }),
    title: stripSocialMarkdownText(args.draft.headline || args.draft.title),
    description: stripSocialMarkdownText(args.draft.summary || args.draft.body).slice(0, 250),
    canonicalUrl: utm.canonicalUrl,
    finalUrl: utm.finalUrl,
    commentText: buildCommentText({ cta: args.draft.cta, finalUrl: utm.finalUrl }),
    imageUrl: imageUrls[0] || "",
    imageUrls,
    hashtags,
    utm: utm.utm,
    trackingPolicy: utm.policy,
  };

  if (!request.text) {
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "invalid_draft" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: "LINKEDIN_SHARE_TEXT_REQUIRED",
        message: "linkedin_share_text_required",
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

  const token = await getDecryptedLinkedInMemberToken(args.universeId);
  if (!token?.accessToken) {
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "missing_token" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: "LINKEDIN_MEMBER_TOKEN_MISSING",
        message: "linkedin_member_token_missing",
      },
    };
  }

  if (token.expired) {
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "expired_token" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: "LINKEDIN_MEMBER_TOKEN_EXPIRED",
        message: "linkedin_member_token_expired",
      },
    };
  }

  const owner = token.memberUrn || `urn:li:person:${token.memberId}`;
  let imageUploads: Array<Awaited<ReturnType<typeof uploadLinkedInImage>>> = [];
  const imageUploadFailures: Array<{ imageUrl: string; message: string }> = [];
  if (request.imageUrls.length) {
    const uploadResults = await Promise.allSettled(
      request.imageUrls.map((imageUrl) =>
        uploadLinkedInImage({
          accessToken: token.accessToken,
          owner,
          imageUrl,
        }),
      ),
    );
    imageUploads = uploadResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    uploadResults.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      imageUploadFailures.push({
        imageUrl: request.imageUrls[index] || "",
        message:
          toSafeString(result.reason instanceof Error ? result.reason.message : result.reason) ||
          "linkedin_image_upload_failed",
      });
    });
  }

  const payload: LinkedInUgcPayload = {
    author: owner,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: request.text,
        },
        shareMediaCategory: imageUploads.length ? "IMAGE" : "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  if (imageUploads.length) {
    payload.specificContent["com.linkedin.ugc.ShareContent"].media = imageUploads.map((imageUpload, index) => ({
      status: "READY",
      media: imageUpload.asset,
      title: {
        text: request.title || `All My Universe ${index + 1}`,
      },
      description: {
        text: request.description,
      },
    }));
  }

  try {
    const response = await fetch(LINKEDIN_UGC_POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(payload),
    });
    const rawText = await response.text().catch(() => "");
    const responseBody = toUnknownRecord(parseJsonSafe(rawText));

    if (!response.ok) {
      return {
        ok: false as const,
        status: "failed" as const,
        mode: "failed" as const,
        request,
        response: {
          status: response.status,
          body: responseBody,
        },
        publishedAt: null,
        error: {
          code: "LINKEDIN_MEMBER_SHARE_FAILED",
          message: toSafeString(responseBody.message) || `linkedin_member_share_failed:${response.status}`,
        },
      };
    }

    const postId = toSafeString(response.headers.get("x-restli-id")) || toSafeString(responseBody.id);
    let comment: Awaited<ReturnType<typeof createLinkedInComment>> | null = null;
    let commentError: { message: string } | null = null;
    if (postId && request.commentText) {
      try {
        comment = await createLinkedInComment({
          accessToken: token.accessToken,
          postId,
          actor: owner,
          text: request.commentText,
        });
      } catch (error: unknown) {
        commentError = {
          message: toSafeString(error instanceof Error ? error.message : "") || "linkedin_comment_failed",
        };
      }
    }
    const publishedAt = new Date();
    return {
      ok: true as const,
      status: "published" as const,
      mode: commentError ? ("published_comment_failed" as const) : ("published" as const),
      request,
      response: {
        status: response.status,
        postId,
        postUrl: buildPostUrl(postId),
        comment,
        commentError,
        memberUrn: token.memberUrn,
        imageAsset: imageUploads[0]?.asset || "",
        imageAssets: imageUploads.map((item) => item.asset).filter(Boolean),
        imageBytes: imageUploads.reduce((sum, item) => sum + Number(item.bytes || 0), 0),
        imageUploadFailures,
        imageUploadFailureCount: imageUploadFailures.length,
      },
      publishedAt: publishedAt.toISOString(),
    };
  } catch (error: unknown) {
    logger.error("[marketing/linkedinMemberPublisher] publish failed", error);
    return {
      ok: false as const,
      status: "failed" as const,
      mode: "failed" as const,
      request,
      response: {},
      publishedAt: null,
      error: {
        code: "LINKEDIN_MEMBER_SHARE_FAILED",
        message: toSafeString(error instanceof Error ? error.message : "") || "linkedin_member_share_failed",
      },
    };
  }
}
