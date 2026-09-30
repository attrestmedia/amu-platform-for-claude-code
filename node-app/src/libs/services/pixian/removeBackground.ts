import "server-only";
import sharp from "sharp";
import { MAX_BASE_FILE_BYTES } from "consts/app";
import { formatBytes } from "utils/normalize";
import { isUnknownRecord } from "utils/common/typeUtils";
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProviderResult,
} from "libs/services/backgroundRemoval/types";

const PIXIAN_REMOVE_BACKGROUND_URL = "https://api.pixian.ai/api/v2/remove-background";

const MAX_PIXELS_BY_SIZE: Record<NonNullable<BackgroundRemovalOptions["size"]>, number> = {
  preview: 250_000,
  medium: 1_500_000,
  hd: 4_000_000,
  full: 25_000_000,
};

const isSupportedMime = (mime: string) =>
  ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp", "image/tiff"].includes(
    String(mime || "").toLowerCase(),
  );

async function readPixianError(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    const parsed: unknown = JSON.parse(text);
    const root = isUnknownRecord(parsed) ? parsed : {};
    const error = isUnknownRecord(root.error) ? root.error : {};
    if (typeof error.message === "string" && error.message.trim()) return error.message.slice(0, 800);
  } catch {
    // JSON이 아니면 원문을 제한 길이로 사용한다.
  }
  return text.slice(0, 800);
}

function normalizeBackgroundColor(value: string | undefined) {
  const color = String(value || "").trim();
  if (!color) return "";
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw Object.assign(new Error("Pixian의 bg_color는 #RRGGBB 형식이어야 합니다."), { status: 400 });
  }
  return color;
}

export async function removeBackgroundByPixian(params: {
  apiId: string;
  apiSecret: string;
  file: File;
  options?: BackgroundRemovalOptions;
  timeoutMs?: number;
}): Promise<BackgroundRemovalProviderResult> {
  const { apiId, apiSecret, file, options = {}, timeoutMs = 180_000 } = params;
  if (!apiId || !apiSecret) {
    throw Object.assign(new Error("Pixian API 자격증명이 설정되어 있지 않습니다."), { status: 503 });
  }
  if (!file) throw Object.assign(new Error("image_file이 비어 있습니다."), { status: 400 });
  if (file.size > MAX_BASE_FILE_BYTES) {
    throw Object.assign(new Error(`파일이 너무 큽니다. (장당 최대 ${formatBytes(MAX_BASE_FILE_BYTES)})`), {
      status: 413,
    });
  }
  if (!isSupportedMime(file.type)) {
    throw Object.assign(new Error(`지원하지 않는 이미지 형식입니다: ${file.type || "unknown"}`), { status: 415 });
  }

  const form = new FormData();
  form.set("image", file, file.name || "image");
  if (options.size) form.set("max_pixels", String(MAX_PIXELS_BY_SIZE[options.size]));
  if (options.crop) form.set("result.crop_to_foreground", options.crop);

  const backgroundColor = normalizeBackgroundColor(options.bg_color);
  if (backgroundColor) form.set("background.color", backgroundColor);

  const requestedFormat = options.channels === "alpha" ? "png" : options.format || "png";
  form.set("output.format", requestedFormat === "jpg" ? "jpeg" : requestedFormat === "webp" ? "png" : requestedFormat);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const authorization = Buffer.from(`${apiId}:${apiSecret}`, "utf8").toString("base64");
    const res = await fetch(PIXIAN_REMOVE_BACKGROUND_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${authorization}` },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await readPixianError(res);
      throw Object.assign(new Error(`Pixian remove-bg 실패 (${res.status})${detail ? `: ${detail}` : ""}`), {
        status: res.status,
      });
    }

    let output: Buffer<ArrayBufferLike> = Buffer.from(await res.arrayBuffer());
    let contentType = String(res.headers.get("content-type") || "image/png").split(";")[0].trim();
    if (options.channels === "alpha") {
      output = await sharp(output).ensureAlpha().extractChannel("alpha").png().toBuffer();
      contentType = "image/png";
    } else if (options.format === "webp") {
      output = await sharp(output).webp({ quality: 100, lossless: true }).toBuffer();
      contentType = "image/webp";
    }

    return {
      buffer: Uint8Array.from(output).buffer,
      contentType,
      providerCredits: res.headers.get("x-credits-charged"),
      calculatedProviderCredits: res.headers.get("x-credits-calculated"),
    };
  } finally {
    clearTimeout(timer);
  }
}
