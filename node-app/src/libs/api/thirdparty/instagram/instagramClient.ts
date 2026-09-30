import {
  getInstagramGraphBase,
  resolveInstagramAuthMode,
  type InstagramAuthMode,
} from "consts/thirdparty/instagram";

type InstagramClientConfig = {
  authMode?: InstagramAuthMode;
};

type RequestParams = Record<string, string | number | undefined>;

function stripTrailingSlash(value: string) {
  return String(value || "").replace(/\/+$/, "");
}

function toPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function parseJsonSafe(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

type InstagramErrorPayload = { error?: { message?: string } };
type InstagramApiError = Error & { status?: number; payload?: unknown };
type InstagramInsightsResponse = {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: unknown }>;
    total_value?: { value?: unknown };
  }>;
};

export type InstagramContainerStatusResponse = {
  id?: string;
  status_code?: string;
  status?: string;
};

export class InstagramGraphClient {
  private baseUrl: string;

  constructor(config: InstagramClientConfig = {}) {
    this.baseUrl = stripTrailingSlash(getInstagramGraphBase(resolveInstagramAuthMode(config.authMode)));
  }

  private async request<T>(
    path: string,
    params: RequestParams,
    accessToken: string,
    method: "GET" | "POST" = "GET",
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${toPath(path)}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const rawText = await response.text().catch(() => "");
    const parsed = parseJsonSafe(rawText);

    if (!response.ok) {
      const parsedObj = (parsed && typeof parsed === "object" ? (parsed as InstagramErrorPayload) : null);
      const error: InstagramApiError = new Error(parsedObj?.error?.message || `Instagram Graph API error: ${response.status}`);
      error.status = response.status;
      error.payload = parsed;
      throw error;
    }

    return parsed as T;
  }

  async createImageContainer(args: {
    instagramUserId: string;
    accessToken: string;
    imageUrl: string;
    caption: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.instagramUserId}/media`,
      {
        image_url: args.imageUrl,
        caption: args.caption,
      },
      args.accessToken,
      "POST",
    );
  }

  async createCarouselImageContainer(args: {
    instagramUserId: string;
    accessToken: string;
    imageUrl: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.instagramUserId}/media`,
      {
        image_url: args.imageUrl,
        is_carousel_item: "true",
      },
      args.accessToken,
      "POST",
    );
  }

  async createCarouselContainer(args: {
    instagramUserId: string;
    accessToken: string;
    childIds: string[];
    caption: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.instagramUserId}/media`,
      {
        media_type: "CAROUSEL",
        children: args.childIds.join(","),
        caption: args.caption,
      },
      args.accessToken,
      "POST",
    );
  }

  async publishMedia(args: { instagramUserId: string; accessToken: string; creationId: string }): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/${args.instagramUserId}/media_publish`,
      {
        creation_id: args.creationId,
      },
      args.accessToken,
      "POST",
    );
  }

  async getContainerStatus(args: {
    containerId: string;
    accessToken: string;
  }): Promise<InstagramContainerStatusResponse> {
    return this.request<InstagramContainerStatusResponse>(
      `/${args.containerId}`,
      { fields: "id,status_code,status" },
      args.accessToken,
      "GET",
    );
  }

  async getMediaInsights(args: {
    mediaId: string;
    accessToken: string;
    metrics: string[];
  }): Promise<InstagramInsightsResponse> {
    return this.request<InstagramInsightsResponse>(
      `/${args.mediaId}/insights`,
      {
        metric: args.metrics.join(","),
      },
      args.accessToken,
      "GET",
    );
  }

  async getAccountFields(args: {
    instagramUserId: string;
    accessToken: string;
    fields: string[];
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/${args.instagramUserId}`,
      {
        fields: args.fields.join(","),
      },
      args.accessToken,
      "GET",
    );
  }
}
