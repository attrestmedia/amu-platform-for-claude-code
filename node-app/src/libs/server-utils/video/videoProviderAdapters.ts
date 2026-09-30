import "server-only";

import { XAI_BASE_URL, ZAI_BASE_URL } from "consts/env/server";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import type { VideoGenerationRequest } from "types/ai";

export type VideoProviderStartResult = { providerRequestId: string };

export type VideoProviderPollResult =
  | { status: "running"; progress?: number }
  | { status: "success"; sourceUrl: string; downloadHeaders?: Record<string, string>; actualDurationSeconds?: number; moderationApproved?: boolean }
  | { status: "failed" | "expired"; errorCode: string; errorMessage: string };

export type VideoProviderAdapter = {
  provider: "google" | "xai" | "zai";
  start(request: VideoGenerationRequest): Promise<VideoProviderStartResult>;
  poll(args: { providerRequestId: string }): Promise<VideoProviderPollResult>;
};

function safe(value: unknown) {
  return String(value || "").trim();
}

function coded(message: string, errorCode: string, status = 502) {
  return Object.assign(new Error(message), { errorCode, status });
}

async function jsonOrThrow(response: Response, errorCode: string) {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw coded(`${errorCode}_${response.status}`, errorCode, response.status >= 500 ? 502 : response.status);
  }
  if (!response.ok) {
    const message = safe((body.error as Record<string, unknown> | undefined)?.message || body.message) || `${errorCode}_${response.status}`;
    throw coded(message, errorCode, response.status >= 500 ? 502 : response.status);
  }
  return body;
}

function requireRequestId(body: Record<string, unknown>, provider: string) {
  const requestId = safe(body.request_id || body.id || body.name);
  if (!requestId) throw coded(`${provider}_provider_request_id_missing`, "VIDEO_PROVIDER_RESPONSE_INVALID");
  return requestId;
}

function assertProviderInputUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw coded("video_input_url_https_required", "VIDEO_INPUT_INVALID", 400);
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw coded("video_input_url_private_host", "VIDEO_INPUT_INVALID", 400);
  }
  return url.toString();
}

function resolveInputUrls(request: VideoGenerationRequest) {
  return (request.inputImages || []).map((image) => {
    const url = safe(image.url);
    if (!url) throw coded("video_input_image_url_required", "VIDEO_INPUT_INVALID", 400);
    return assertProviderInputUrl(url);
  });
}

function xaiBaseUrl() {
  return XAI_BASE_URL.replace(/\/+$/, "");
}

function zaiBaseUrl() {
  return ZAI_BASE_URL.replace(/\/+$/, "");
}

function googleVideoResolution(value: string) {
  return value === "4K" ? "4k" : value;
}

function zAiSize(resolution: string, aspectRatio: string) {
  if (resolution === "480p") return aspectRatio === "9:16" ? "480x854" : "854x480";
  if (resolution === "1080p") return aspectRatio === "9:16" ? "1080x1920" : aspectRatio === "1:1" ? "1024x1024" : "1920x1080";
  return aspectRatio === "9:16" ? "720x1280" : aspectRatio === "1:1" ? "1024x1024" : "1280x720";
}

async function buildGoogleInlineImage(url: string) {
  const response = await fetch(assertProviderInputUrl(url), {
    headers: { Accept: "image/png,image/jpeg,image/webp" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw coded(`google_video_input_fetch_${response.status}`, "VIDEO_INPUT_FETCH_FAILED", 400);
  const contentType = safe(response.headers.get("content-type")).split(";", 1)[0].toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw coded("google_video_input_mime_invalid", "VIDEO_INPUT_INVALID", 400);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw coded("google_video_input_too_large", "VIDEO_INPUT_INVALID", 400);
  return { mimeType: contentType, data: buffer.toString("base64") };
}

function googleOperationPath(name: string) {
  return name.startsWith("http") ? name : `https://generativelanguage.googleapis.com/v1beta/${name.replace(/^\/+/, "")}`;
}

function makeGoogleAdapter(): VideoProviderAdapter {
  return {
    provider: "google",
    async start(request) {
      const credential = await resolvePlatformCredential("ai.google.gemini");
      const inputUrls = resolveInputUrls(request);
      const firstImage = inputUrls[0] ? await buildGoogleInlineImage(inputUrls[0]) : undefined;
      const instance: Record<string, unknown> = { prompt: request.prompt };
      if (firstImage) instance.image = { inlineData: firstImage };
      if (request.inputVideo?.url) {
        instance.video = { uri: assertProviderInputUrl(request.inputVideo.url), mimeType: request.inputVideo.mimeType || "video/mp4" };
      }
      const body = {
        instances: [instance],
        parameters: {
          durationSeconds: request.durationSeconds,
          aspectRatio: request.aspectRatio,
          resolution: googleVideoResolution(request.resolution || "720p"),
          ...(request.audio?.enabled ? { generateAudio: true } : {}),
        },
      };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.modelName || "")}:predictLongRunning`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": credential.payload.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await jsonOrThrow(response, "GOOGLE_VIDEO_UPSTREAM_ERROR");
      return { providerRequestId: requireRequestId(result, "google") };
    },
    async poll({ providerRequestId }) {
      const credential = await resolvePlatformCredential("ai.google.gemini");
      const response = await fetch(googleOperationPath(providerRequestId), {
        headers: { "x-goog-api-key": credential.payload.apiKey },
        signal: AbortSignal.timeout(30_000),
      });
      const result = await jsonOrThrow(response, "GOOGLE_VIDEO_UPSTREAM_ERROR");
      if (!result.done) return { status: "running" as const };
      if (result.error) {
        return { status: "failed" as const, errorCode: "GOOGLE_VIDEO_FAILED", errorMessage: safe((result.error as Record<string, unknown>).message) || "google_video_failed" };
      }
      const responseBody = (result.response || {}) as Record<string, unknown>;
      const generated = (responseBody.generateVideoResponse || responseBody) as Record<string, unknown>;
      const samples = Array.isArray(generated.generatedSamples) ? generated.generatedSamples : Array.isArray(generated.generatedVideos) ? generated.generatedVideos : [];
      const video = (samples[0] || {}) as Record<string, unknown>;
      const videoBody = (video.video || video) as Record<string, unknown>;
      const sourceUrl = safe(videoBody.uri || videoBody.url);
      if (!sourceUrl) return { status: "failed" as const, errorCode: "GOOGLE_VIDEO_RESULT_INVALID", errorMessage: "google_video_result_url_missing" };
      return { status: "success" as const, sourceUrl, downloadHeaders: { "x-goog-api-key": credential.payload.apiKey } };
    },
  };
}

function makeXaiAdapter(): VideoProviderAdapter {
  return {
    provider: "xai",
    async start(request) {
      const credential = await resolvePlatformCredential("ai.xai.default");
      const inputUrls = resolveInputUrls(request);
      const body: Record<string, unknown> = {
        model: request.modelName,
        prompt: request.prompt,
        duration: request.durationSeconds,
        ...(request.resolution ? { resolution: request.resolution } : {}),
        ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
      };
      if (request.mode === "edit" && request.inputVideo?.url) {
        body.video = { url: assertProviderInputUrl(request.inputVideo.url) };
      } else if (request.mode === "reference-to-video" && inputUrls.length) {
        body.reference_images = inputUrls.map((url) => ({ url }));
      } else if (inputUrls[0]) {
        body.image = { url: inputUrls[0] };
      }
      const path = request.mode === "edit" ? "videos/edits" : request.mode === "extend" ? "videos/extensions" : "videos/generations";
      const response = await fetch(`${xaiBaseUrl()}/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.payload.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await jsonOrThrow(response, "XAI_VIDEO_UPSTREAM_ERROR");
      return { providerRequestId: requireRequestId(result, "xai") };
    },
    async poll({ providerRequestId }) {
      const credential = await resolvePlatformCredential("ai.xai.default");
      const response = await fetch(`${xaiBaseUrl()}/videos/${encodeURIComponent(providerRequestId)}`, {
        headers: { Authorization: `Bearer ${credential.payload.apiKey}` },
        signal: AbortSignal.timeout(30_000),
      });
      const result = await jsonOrThrow(response, "XAI_VIDEO_UPSTREAM_ERROR");
      const status = safe(result.status).toLowerCase();
      if (status === "pending" || status === "processing" || status === "running") return { status: "running" as const, progress: Number(result.progress || 0) };
      if (status === "expired") return { status: "expired" as const, errorCode: "XAI_VIDEO_EXPIRED", errorMessage: "xai_video_expired" };
      if (status !== "done" && status !== "success") return { status: "failed" as const, errorCode: "XAI_VIDEO_FAILED", errorMessage: safe(result.error) || "xai_video_failed" };
      const video = (result.video || {}) as Record<string, unknown>;
      const sourceUrl = safe(video.url);
      if (!sourceUrl) return { status: "failed" as const, errorCode: "XAI_VIDEO_RESULT_INVALID", errorMessage: "xai_video_result_url_missing" };
      return { status: "success" as const, sourceUrl, actualDurationSeconds: Number(video.duration || 0) || undefined, moderationApproved: video.respect_moderation !== false };
    },
  };
}

function makeZaiAdapter(): VideoProviderAdapter {
  return {
    provider: "zai",
    async start(request) {
      const credential = await resolvePlatformCredential("ai.zai.default");
      const inputUrls = resolveInputUrls(request);
      const imageUrl = inputUrls.length === 1 ? inputUrls[0] : inputUrls;
      const body: Record<string, unknown> = {
        model: request.modelName,
        prompt: request.prompt,
        duration: request.durationSeconds,
        quality: "quality",
        with_audio: Boolean(request.audio?.enabled),
        size: zAiSize(request.resolution || "720p", request.aspectRatio || "16:9"),
        fps: 30,
        request_id: request.clientRequestId,
        ...(inputUrls.length ? { image_url: imageUrl } : {}),
      };
      const response = await fetch(`${zaiBaseUrl()}/videos/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.payload.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await jsonOrThrow(response, "ZAI_VIDEO_UPSTREAM_ERROR");
      const providerRequestId = safe(result.id || result.task_id || result.request_id);
      if (!providerRequestId) throw coded("zai_provider_request_id_missing", "VIDEO_PROVIDER_RESPONSE_INVALID");
      return { providerRequestId };
    },
    async poll({ providerRequestId }) {
      const credential = await resolvePlatformCredential("ai.zai.default");
      const response = await fetch(`${zaiBaseUrl()}/async-result/${encodeURIComponent(providerRequestId)}`, {
        headers: { Authorization: `Bearer ${credential.payload.apiKey}` },
        signal: AbortSignal.timeout(30_000),
      });
      const result = await jsonOrThrow(response, "ZAI_VIDEO_UPSTREAM_ERROR");
      const status = safe(result.task_status).toUpperCase();
      if (status === "PROCESSING" || status === "PENDING") return { status: "running" as const };
      if (status === "FAIL" || status === "FAILED") return { status: "failed" as const, errorCode: "ZAI_VIDEO_FAILED", errorMessage: safe(result.message) || "zai_video_failed" };
      if (status !== "SUCCESS") return { status: "running" as const };
      const first = (Array.isArray(result.video_result) ? result.video_result[0] : {}) as Record<string, unknown>;
      const sourceUrl = safe(first.url);
      if (!sourceUrl) return { status: "failed" as const, errorCode: "ZAI_VIDEO_RESULT_INVALID", errorMessage: "zai_video_result_url_missing" };
      return { status: "success" as const, sourceUrl, moderationApproved: true };
    },
  };
}

export function getVideoProviderAdapter(provider: "google" | "xai" | "zai"): VideoProviderAdapter {
  if (provider === "google") return makeGoogleAdapter();
  if (provider === "xai") return makeXaiAdapter();
  return makeZaiAdapter();
}

/** 외부 provider 호출 없이 queue/poll 계약을 검증하는 S4 mock adapter. */
export function createMockVideoProviderAdapter(args: {
  provider?: "google" | "xai" | "zai";
  pollsUntilSuccess?: number;
  sourceUrl?: string;
  actualDurationSeconds?: number;
} = {}): VideoProviderAdapter {
  let pollCount = 0;
  const pollsUntilSuccess = Math.max(0, Math.floor(args.pollsUntilSuccess ?? 1));
  return {
    provider: args.provider || "zai",
    async start() {
      return { providerRequestId: "mock-video-request" };
    },
    async poll() {
      pollCount += 1;
      if (pollCount <= pollsUntilSuccess) return { status: "running" as const, progress: 0 };
      return {
        status: "success" as const,
        sourceUrl: args.sourceUrl || "https://provider.example/mock-video.mp4",
        actualDurationSeconds: args.actualDurationSeconds || 5,
        moderationApproved: true,
      };
    },
  };
}
