import { MAX_BASE_FILE_BYTES } from "consts/app";
import { formatBytes } from "utils/normalize";
import { isUnknownRecord } from "utils/common/typeUtils";
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProviderResult,
} from "libs/services/backgroundRemoval/types";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain ai
 * @scope server
 */

export type PhotoRoomRemoveBgOptions = BackgroundRemovalOptions;

const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";

const isSupportedMime = (mime: string) => {
  const m = String(mime || "").toLowerCase();
  return ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"].includes(m);
};

async function readPhotoRoomError(res: Response) {
  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const j: unknown = await res.json();
      const obj = isUnknownRecord(j) ? j : {};
      const nested = isUnknownRecord(obj.error) ? obj.error : null;
      const msg =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        (typeof obj.detail === "string" && obj.detail) ||
        (nested && typeof nested.message === "string" && nested.message) ||
        "";
      if (msg) return msg.slice(0, 800);
      return JSON.stringify(j).slice(0, 800);
    } catch {
      // fallthrough
    }
  }
  const text = await res.text().catch(() => "");
  return (text || "").slice(0, 800);
}

export async function removeBackgroundByPhotoRoom(params: {
  apiKey: string;
  file: File;
  options?: PhotoRoomRemoveBgOptions;
  timeoutMs?: number;
}): Promise<BackgroundRemovalProviderResult> {
  const { apiKey, file, options, timeoutMs = 60000 } = params;

  if (!apiKey) {
    throw Object.assign(new Error("PhotoRoom API 자격증명이 설정되어 있지 않습니다."), { status: 503 });
  }

  if (!file) {
    throw Object.assign(new Error("image_file이 비어 있습니다."), { status: 400 });
  }

  if (file.size > MAX_BASE_FILE_BYTES) {
    throw Object.assign(new Error(`파일이 너무 큽니다. (장당 최대 ${formatBytes(MAX_BASE_FILE_BYTES)})`), {
      status: 413,
    });
  }

  // file.type이 비어있는 경우도 있어, 비어있으면 통과(서버에서 PhotoRoom이 최종 검증)
  if (file.type && !isSupportedMime(file.type)) {
    throw Object.assign(new Error("지원하지 않는 이미지 형식입니다."), { status: 400 });
  }

  const form = new FormData();
  // PhotoRoom 필드명은 image_file :contentReference[oaicite:7]{index=7}
  form.append("image_file", file, file.name || "image");

  if (options?.format) form.append("format", options.format);
  if (options?.channels) form.append("channels", options.channels);
  if (options?.bg_color) form.append("bg_color", options.bg_color);
  if (options?.size) form.append("size", options.size);
  if (options?.crop) form.append("crop", options.crop);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(PHOTOROOM_SEGMENT_URL, {
      method: "POST",
      headers: {
        // x-api-key 헤더 사용 :contentReference[oaicite:8]{index=8}
        "x-api-key": apiKey,
        // 이미지 또는 JSON 에러 반환 가능
        Accept: "image/png, image/jpeg, image/webp, application/json",
      },
      body: form,
      signal: ac.signal,
    });

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const uncertaintyScore = res.headers.get("x-uncertainty-score"); // :contentReference[oaicite:9]{index=9}

    if (!res.ok) {
      const msg = await readPhotoRoomError(res);
      throw Object.assign(new Error(msg || `PhotoRoom API Error (${res.status})`), {
        status: res.status,
      });
    }

    // 성공은 보통 image/* (문서 기준) :contentReference[oaicite:3]{index=3}
    if (String(contentType).toLowerCase().includes("application/json")) {
      const msg = await readPhotoRoomError(res);
      throw Object.assign(new Error(msg || "PhotoRoom returned JSON on success"), { status: 502 });
    }

    const buffer = await res.arrayBuffer();
    return { buffer, contentType, uncertaintyScore };
  } finally {
    clearTimeout(t);
  }
}
