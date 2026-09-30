import { THREADS_GRAPH_BASE, THREADS_GRAPH_FALLBACK_BASE } from "consts/thirdparty/threads";
import type { ThreadsPagingType, ThreadsPostType, ThreadsProfileType } from "types/thirdparty/threads";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common/typeUtils";

type ThreadsErrorPayload = { error?: { message?: string } };
type ThreadsApiError = Error & { status?: number; payload?: unknown };
type ThreadsContainerStatusResponse = { id?: string; status?: string; error_message?: string };
type ThreadsPublishedPostResponse = { id?: string; permalink?: string };
type ThreadsInsightsResponse = {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: unknown }>;
    total_value?: { value?: unknown };
  }>;
};

type ThreadsClientConfig = {
  baseUrl?: string;
};

type RequestParams = Record<string, string | number | undefined>;
const THREADS_CONTAINER_READY_STATUS = "FINISHED";
const THREADS_CONTAINER_FAILED_STATUSES = new Set(["ERROR", "EXPIRED"]);
const THREADS_CONTAINER_POLL_INTERVAL_MS = 5_000;
const THREADS_CONTAINER_READY_TIMEOUT_MS = 35_000;
const THREADS_PUBLISHED_POST_TIMEOUT_MS = 20_000;

function stripTrailingSlash(v: string) {
  return String(v || "").replace(/\/+$/, "");
}

function toPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStatusCode(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export class ThreadsApiClient {
  private baseUrl: string;
  private fallbackUrl: string;

  constructor(config: ThreadsClientConfig = {}) {
    const custom = config.baseUrl ? stripTrailingSlash(config.baseUrl) : "";
    this.baseUrl = custom || THREADS_GRAPH_BASE;
    this.fallbackUrl = THREADS_GRAPH_FALLBACK_BASE;
  }

  private async request<T>(path: string, params: RequestParams, method: "GET" | "POST" | "DELETE" = "GET"): Promise<T> {
    const bases = [this.baseUrl, this.fallbackUrl].filter((v, i, arr) => arr.indexOf(v) === i);
    let lastError: unknown;

    for (const base of bases) {
      try {
        const url = new URL(`${base}${toPath(path)}`);
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null || v === "") return;
          url.searchParams.set(k, String(v));
        });

        const res = await fetch(url.toString(), { method });
        const rawText = await res.text();
        const parsed: unknown = rawText ? JSON.parse(rawText) : {};

        if (!res.ok) {
          const parsedObj = parsed && typeof parsed === "object" ? (parsed as ThreadsErrorPayload) : null;
          const err: ThreadsApiError = new Error(parsedObj?.error?.message || `Threads API 오류: ${res.status}`);
          err.status = res.status;
          err.payload = parsed;
          throw err;
        }

        return parsed as T;
      } catch (error: unknown) {
        lastError = error;
        logger.warn("[ThreadsApiClient] base 호출 실패, fallback 시도", {
          base,
          path,
          message: toErrorMessage(error, String(error)),
        });
      }
    }

    throw lastError || new Error("Threads API 호출 실패");
  }

  async createTextPostContainer(args: {
    threadsUserId: string;
    accessToken: string;
    text: string;
    replyToId?: string;
    quotePostId?: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.threadsUserId}/threads`,
      {
        media_type: "TEXT",
        text: args.text,
        reply_to_id: args.replyToId,
        quote_post_id: args.quotePostId,
        access_token: args.accessToken,
      },
      "POST",
    );
  }

  async createImagePostContainer(args: {
    threadsUserId: string;
    accessToken: string;
    imageUrl: string;
    text?: string;
    replyToId?: string;
    quotePostId?: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.threadsUserId}/threads`,
      {
        media_type: "IMAGE",
        image_url: args.imageUrl,
        text: args.text,
        reply_to_id: args.replyToId,
        quote_post_id: args.quotePostId,
        access_token: args.accessToken,
      },
      "POST",
    );
  }

  async createCarouselImageItemContainer(args: {
    threadsUserId: string;
    accessToken: string;
    imageUrl: string;
    altText?: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.threadsUserId}/threads`,
      {
        media_type: "IMAGE",
        image_url: args.imageUrl,
        is_carousel_item: "true",
        alt_text: args.altText,
        access_token: args.accessToken,
      },
      "POST",
    );
  }

  async createCarouselPostContainer(args: {
    threadsUserId: string;
    accessToken: string;
    childIds: string[];
    text?: string;
    replyToId?: string;
    quotePostId?: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.threadsUserId}/threads`,
      {
        media_type: "CAROUSEL",
        children: args.childIds.join(","),
        text: args.text,
        reply_to_id: args.replyToId,
        quote_post_id: args.quotePostId,
        access_token: args.accessToken,
      },
      "POST",
    );
  }

  async publishPost(args: { threadsUserId: string; accessToken: string; creationId: string }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.threadsUserId}/threads_publish`,
      {
        creation_id: args.creationId,
        access_token: args.accessToken,
      },
      "POST",
    );
  }

  async getMediaContainerStatus(args: {
    accessToken: string;
    creationId: string;
  }): Promise<ThreadsContainerStatusResponse> {
    return this.request<ThreadsContainerStatusResponse>(
      `/${args.creationId}`,
      {
        fields: "id,status,error_message",
        access_token: args.accessToken,
      },
      "GET",
    );
  }

  async waitForMediaContainerReady(args: {
    accessToken: string;
    creationId: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  }): Promise<ThreadsContainerStatusResponse> {
    const creationId = String(args.creationId || "").trim();
    if (!creationId) throw new Error("threads_creation_id_required");

    const timeoutMs = args.timeoutMs ?? THREADS_CONTAINER_READY_TIMEOUT_MS;
    const pollIntervalMs = args.pollIntervalMs ?? THREADS_CONTAINER_POLL_INTERVAL_MS;
    const startedAt = Date.now();
    let lastStatus: ThreadsContainerStatusResponse | null = null;
    let lastErrorMessage = "";

    while (Date.now() - startedAt <= timeoutMs) {
      let status: ThreadsContainerStatusResponse | null = null;
      try {
        status = await this.getMediaContainerStatus({
          accessToken: args.accessToken,
          creationId,
        });
        lastErrorMessage = "";
      } catch (error: unknown) {
        lastErrorMessage = toErrorMessage(error, String(error));
        await sleep(pollIntervalMs);
        continue;
      }

      const statusCode = toStatusCode(status.status);
      lastStatus = status;

      if (statusCode === THREADS_CONTAINER_READY_STATUS) return status;
      if (THREADS_CONTAINER_FAILED_STATUSES.has(statusCode)) {
        throw new Error(status.error_message || `threads_container_${statusCode.toLowerCase()}`);
      }

      await sleep(pollIntervalMs);
    }

    const statusCode = toStatusCode(lastStatus?.status) || "UNKNOWN";
    throw new Error(lastStatus?.error_message || lastErrorMessage || `threads_container_not_ready:${statusCode}`);
  }

  async getPublishedPost(args: { accessToken: string; postId: string }): Promise<ThreadsPublishedPostResponse> {
    return this.request<ThreadsPublishedPostResponse>(
      `/${args.postId}`,
      {
        fields: "id,permalink",
        access_token: args.accessToken,
      },
      "GET",
    );
  }

  async getMediaInsights(args: {
    accessToken: string;
    postId: string;
    metrics: string[];
  }): Promise<ThreadsInsightsResponse> {
    return this.request<ThreadsInsightsResponse>(
      `/${args.postId}/insights`,
      {
        metric: args.metrics.join(","),
        access_token: args.accessToken,
      },
      "GET",
    );
  }

  async getUserInsights(args: {
    accessToken: string;
    threadsUserId: string;
    metrics: string[];
  }): Promise<ThreadsInsightsResponse> {
    return this.request<ThreadsInsightsResponse>(
      `/${args.threadsUserId}/threads_insights`,
      {
        metric: args.metrics.join(","),
        access_token: args.accessToken,
      },
      "GET",
    );
  }

  async waitForPublishedPostAvailable(args: {
    accessToken: string;
    postId: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  }): Promise<ThreadsPublishedPostResponse> {
    const postId = String(args.postId || "").trim();
    if (!postId) throw new Error("threads_post_id_required");

    const timeoutMs = args.timeoutMs ?? THREADS_PUBLISHED_POST_TIMEOUT_MS;
    const pollIntervalMs = args.pollIntervalMs ?? THREADS_CONTAINER_POLL_INTERVAL_MS;
    const startedAt = Date.now();
    let lastErrorMessage = "";

    while (Date.now() - startedAt <= timeoutMs) {
      try {
        return await this.getPublishedPost({
          accessToken: args.accessToken,
          postId,
        });
      } catch (error: unknown) {
        lastErrorMessage = toErrorMessage(error, String(error));
        await sleep(pollIntervalMs);
      }
    }

    throw new Error(lastErrorMessage || "threads_published_post_not_available");
  }

  async deletePost(args: { postId: string; accessToken: string }): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/${args.postId}`, { access_token: args.accessToken }, "DELETE");
  }

  async profileLookup(args: { username: string; accessToken: string; fields?: string[] }): Promise<ThreadsProfileType> {
    const fields = (args.fields || ["id", "username", "name", "threadsProfilePictureUrl", "biography"]).join(",");

    return this.request<ThreadsProfileType>(
      "/profile_lookup",
      {
        username: args.username,
        fields,
        access_token: args.accessToken,
      },
      "GET",
    );
  }

  async getOwnProfile(args: { accessToken: string; fields?: string[] }): Promise<ThreadsProfileType> {
    const fields = (
      args.fields || ["id", "username", "name", "threads_profile_picture_url", "threads_biography"]
    ).join(",");
    return this.request<ThreadsProfileType>(
      "/me",
      { fields, access_token: args.accessToken },
      "GET",
    );
  }

  async profilePosts(args: {
    username: string;
    accessToken: string;
    fields?: string[];
    limit?: number;
    after?: string;
  }): Promise<{ data: ThreadsPostType[]; paging?: ThreadsPagingType }> {
    const fields = (
      args.fields || [
        "id",
        "text",
        "timestamp",
        "permalink",
        "shortcode",
        "mediaProductType",
        "mediaType",
        "mediaUrl",
        "username",
      ]
    ).join(",");

    return this.request<{ data: ThreadsPostType[]; paging?: ThreadsPagingType }>(
      "/profile_posts",
      {
        username: args.username,
        fields,
        limit: args.limit,
        after: args.after,
        access_token: args.accessToken,
      },
      "GET",
    );
  }
}
