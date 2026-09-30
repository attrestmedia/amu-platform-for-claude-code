import type { BaseImageType } from "types/app";

const IMAGE_FILE_NAME_PATTERN = /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i;
export const IMAGE_REFERENCE_MAX_LONG_EDGE = 8192;
export const IMAGE_REFERENCE_MAX_PIXELS = 64 * 1000 * 1000;
export const IMAGE_REFERENCE_NORMALIZE_LONG_EDGE = 2048;
export const IMAGE_REFERENCE_NORMALIZE_PIXELS = 4 * 1000 * 1000;
const PRIMARY_READ_RETRY_DELAYS_MS = [0, 150, 500, 1200] as const;
const SECONDARY_READ_RETRY_DELAYS_MS = [0, 350, 1000] as const;

export type ImageFileFailureReason =
  | "unsupported_type"
  | "file_too_large"
  | "resolution_too_large"
  | "decode_failed"
  | "read_failed"
  | "canvas_unavailable"
  | "memory_or_browser_limit";

export type ImageFileDiagnostic = {
  name?: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  pixels?: number;
  normalized?: boolean;
};

export type ImageFileError = Error & {
  reason: ImageFileFailureReason;
  diagnostic: ImageFileDiagnostic;
  cause?: unknown;
};

function createFileReadError(reader: FileReader) {
  return new Error(`image_file_read_failed:${reader.error?.name || "unknown"}`);
}

function readBlobViaFileReader(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("image_file_read_failed:filereader_unsupported"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(createFileReadError(reader));
    reader.onabort = () => reject(new Error("image_file_read_aborted"));
    reader.readAsDataURL(file);
  });
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

// 일부 모바일 브라우저(예: Samsung Internet)는 content:// 기반 File을 FileReader로
// 읽지 못하고 onerror를 발생시킨다. 이 경우 다른 Blob 소비 경로를 순차 폴백한다.
async function readBlobViaArrayBuffer(blob: Blob) {
  return arrayBufferToDataUrl(await blob.arrayBuffer(), blob.type || "image/png");
}

async function readBlobViaResponse(blob: Blob) {
  if (typeof Response === "undefined") throw new Error("image_file_read_failed:response_unsupported");
  return arrayBufferToDataUrl(await new Response(blob).arrayBuffer(), blob.type || "image/png");
}

async function readBlobViaObjectUrlFetch(blob: Blob) {
  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof fetch === "undefined"
  ) {
    throw new Error("image_file_read_failed:objecturl_fetch_unsupported");
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const response = await fetch(objectUrl);
    if (!response.ok) throw new Error(`image_file_read_failed:objecturl_fetch_${response.status}`);
    return arrayBufferToDataUrl(await response.arrayBuffer(), blob.type || "image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function toErrorText(error: unknown) {
  if (error instanceof Error) return error.message || error.name || "Error";
  return String(error);
}

function readDelay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function readBlobAsDataUrl(file: Blob) {
  const failures: string[] = [];
  const canEncodeBase64 = typeof btoa !== "undefined";

  const tryRead = async (
    label: string,
    delays: readonly number[],
    read: (blob: Blob) => Promise<string>,
  ): Promise<string | null> => {
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      const delay = delays[attempt] || 0;
      if (delay > 0) await readDelay(delay);
      try {
        return await read(file);
      } catch (error) {
        failures.push(`${label}#${attempt}:${toErrorText(error)}`);
      }
    }
    return null;
  };

  const fileReaderResult = await tryRead("filereader", PRIMARY_READ_RETRY_DELAYS_MS, readBlobViaFileReader);
  if (fileReaderResult) return fileReaderResult;

  if (!canEncodeBase64) {
    failures.push("base64:unsupported");
    throw new Error(`image_file_read_failed_all:${failures.join("|")}`);
  }

  if (typeof file.arrayBuffer === "function") {
    const arrayBufferResult = await tryRead("arraybuffer", SECONDARY_READ_RETRY_DELAYS_MS, readBlobViaArrayBuffer);
    if (arrayBufferResult) return arrayBufferResult;
  } else {
    failures.push("arraybuffer:unsupported");
  }

  const responseResult = await tryRead("response", SECONDARY_READ_RETRY_DELAYS_MS, readBlobViaResponse);
  if (responseResult) return responseResult;

  const objectUrlFetchResult = await tryRead("objecturl-fetch", SECONDARY_READ_RETRY_DELAYS_MS, readBlobViaObjectUrlFetch);
  if (objectUrlFetchResult) return objectUrlFetchResult;

  // 모든 읽기 경로 실패: 실제 사유(NotReadableError/SecurityError 등)를 메시지에 담아 전파
  throw new Error(`image_file_read_failed_all:${failures.join("|")}`);
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_object_url_load_failed"));
    image.src = src;
  });
}

// 디코드된 이미지를 canvas로 축소 재인코딩해 data URL로 반환한다.
// blob 재읽기 없이 toDataURL을 사용해 모바일 다중 읽기 이슈를 피한다.
function canvasToDataUrl(image: HTMLImageElement, diagnostic: ImageFileDiagnostic) {
  if (typeof document === "undefined") throw createImageFileError("canvas_unavailable", diagnostic);

  const width = Math.max(1, image.naturalWidth || image.width);
  const height = Math.max(1, image.naturalHeight || image.height);
  const scale = Math.min(1, IMAGE_REFERENCE_NORMALIZE_LONG_EDGE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) throw createImageFileError("canvas_unavailable", diagnostic);

  context.fillStyle = "#fff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function createImageFileError(
  reason: ImageFileFailureReason,
  diagnostic: ImageFileDiagnostic,
  cause?: unknown,
): ImageFileError {
  const error = new Error(`image_file_${reason}`) as ImageFileError;
  error.reason = reason;
  error.diagnostic = diagnostic;
  if (cause !== undefined) error.cause = cause;
  return error;
}

export function isImageFileError(error: unknown): error is ImageFileError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "reason" in error &&
      "diagnostic" in error &&
      typeof (error as ImageFileError).reason === "string",
  );
}

export function createImageFileDiagnostic(file: File | Blob, fallbackMimeType = "image/png"): ImageFileDiagnostic {
  return {
    name: "name" in file ? String(file.name || "") : undefined,
    mimeType: getImageFileMimeType(file, fallbackMimeType),
    size: file.size,
  };
}

function exceedsHardResolutionLimit(diagnostic: ImageFileDiagnostic) {
  const longEdge = Math.max(diagnostic.width || 0, diagnostic.height || 0);
  const pixels = diagnostic.pixels || 0;
  return longEdge > IMAGE_REFERENCE_MAX_LONG_EDGE || pixels > IMAGE_REFERENCE_MAX_PIXELS;
}

function shouldNormalizeImage(diagnostic: ImageFileDiagnostic) {
  const longEdge = Math.max(diagnostic.width || 0, diagnostic.height || 0);
  const pixels = diagnostic.pixels || 0;
  return longEdge > IMAGE_REFERENCE_NORMALIZE_LONG_EDGE || pixels > IMAGE_REFERENCE_NORMALIZE_PIXELS;
}

export function isImageFileLike(file: File | Blob) {
  const mimeType = String(file.type || "").trim().toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  if ("name" in file) return IMAGE_FILE_NAME_PATTERN.test(String(file.name || ""));
  return false;
}

export function getImageFileMimeType(file: File | Blob, fallbackMimeType = "image/png") {
  const mimeType = String(file.type || "").trim();
  return mimeType.startsWith("image/") ? mimeType : fallbackMimeType;
}

export async function fileToDataUrl(file: Blob) {
  return await readBlobAsDataUrl(file);
}

export async function blobToDataUrl(blob: Blob) {
  return await fileToDataUrl(blob);
}

export async function prepareImageFilePayload(file: File | Blob, fallbackMimeType = "image/png") {
  const baseDiagnostic = createImageFileDiagnostic(file, fallbackMimeType);
  const mimeType = getImageFileMimeType(file, fallbackMimeType);

  // [모바일 안정성] 원본 File을 한 번만 data URL로 읽는다.
  // content:// 기반 File(Samsung Internet 등)은 다중 읽기/접근 revoke로 decode_failed/read_failed가
  // 발생하므로, 이후 차원 측정/미리보기/정규화가 모두 이 단일 data URL을 재사용한다.
  let sourceDataUrl: string;
  try {
    sourceDataUrl = await readBlobAsDataUrl(file);
  } catch (error) {
    throw createImageFileError("read_failed", baseDiagnostic, error);
  }

  // SSR/비DOM 환경: 디코드/정규화 불가 -> 원본 data URL 그대로 반환
  if (typeof document === "undefined") {
    return {
      mimeType,
      data: sourceDataUrl.split(",")[1] || "",
      preview: sourceDataUrl,
      diagnostic: { ...baseDiagnostic, normalized: false },
    } satisfies BaseImageType & { preview: string; diagnostic: ImageFileDiagnostic };
  }

  // 단일 data URL에서 디코드 (object URL 미사용)
  let decodedImage: HTMLImageElement;
  try {
    decodedImage = await loadImageElement(sourceDataUrl);
  } catch (error) {
    throw createImageFileError("decode_failed", baseDiagnostic, error);
  }

  const width = Math.max(1, decodedImage.naturalWidth || decodedImage.width);
  const height = Math.max(1, decodedImage.naturalHeight || decodedImage.height);
  const diagnostic: ImageFileDiagnostic = { ...baseDiagnostic, width, height, pixels: width * height };

  if (exceedsHardResolutionLimit(diagnostic)) {
    throw createImageFileError("resolution_too_large", diagnostic);
  }

  // 정규화 불필요: 원본 data URL 그대로 사용
  if (!shouldNormalizeImage(diagnostic)) {
    return {
      mimeType,
      data: sourceDataUrl.split(",")[1] || "",
      preview: sourceDataUrl,
      diagnostic: { ...diagnostic, normalized: false },
    } satisfies BaseImageType & { preview: string; diagnostic: ImageFileDiagnostic };
  }

  // 정규화: 같은 디코드 이미지를 canvas로 축소 재인코딩 (blob 재읽기 없음)
  let normalizedDataUrl: string;
  try {
    normalizedDataUrl = canvasToDataUrl(decodedImage, diagnostic);
  } catch (error) {
    if (isImageFileError(error)) throw error;
    throw createImageFileError("memory_or_browser_limit", diagnostic, error);
  }

  return {
    mimeType: "image/jpeg",
    data: normalizedDataUrl.split(",")[1] || "",
    preview: normalizedDataUrl,
    diagnostic: { ...diagnostic, normalized: true },
  } satisfies BaseImageType & { preview: string; diagnostic: ImageFileDiagnostic };
}

type ServerPreparedImageResponse = {
  ok?: boolean;
  mimeType?: string;
  data?: string;
  preview?: string;
  diagnostic?: ImageFileDiagnostic;
  reason?: ImageFileFailureReason;
  message?: string;
  error?: string;
};

function isServerPreparedImageResponse(value: unknown): value is ServerPreparedImageResponse {
  return Boolean(value && typeof value === "object");
}

async function prepareImageFilePayloadOnServer(file: File | Blob, fallbackMimeType = "image/png") {
  const diagnostic = createImageFileDiagnostic(file, fallbackMimeType);
  if (typeof FormData === "undefined" || typeof fetch === "undefined") {
    throw createImageFileError("read_failed", diagnostic, new Error("server_upload_unavailable"));
  }

  const form = new FormData();
  const filename = "name" in file ? String(file.name || "image") : "image";
  form.append("image_file", file, filename);
  form.append("fallbackMimeType", fallbackMimeType);

  let response: Response;
  try {
    response = await fetch("/api/lab/reference-image/prepare", {
      method: "POST",
      body: form,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    throw createImageFileError("read_failed", diagnostic, error);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw createImageFileError("read_failed", diagnostic, error);
  }

  if (!response.ok || !isServerPreparedImageResponse(payload) || payload.ok === false) {
    const reason = isServerPreparedImageResponse(payload) ? payload.reason : undefined;
    const message =
      (isServerPreparedImageResponse(payload) && (payload.message || payload.error)) ||
      `server_prepare_failed:${response.status}`;
    throw createImageFileError(reason || "read_failed", diagnostic, new Error(message));
  }

  if (
    typeof payload.mimeType !== "string" ||
    typeof payload.data !== "string" ||
    typeof payload.preview !== "string" ||
    !payload.diagnostic
  ) {
    throw createImageFileError("read_failed", diagnostic, new Error("server_prepare_payload_invalid"));
  }

  return {
    mimeType: payload.mimeType,
    data: payload.data,
    preview: payload.preview,
    diagnostic: payload.diagnostic,
  } satisfies BaseImageType & { preview: string; diagnostic: ImageFileDiagnostic };
}

export async function prepareImageFilePayloadWithUploadFallback(file: File | Blob, fallbackMimeType = "image/png") {
  try {
    return await prepareImageFilePayload(file, fallbackMimeType);
  } catch (error) {
    if (
      !isImageFileError(error) ||
      (error.reason !== "read_failed" &&
        error.reason !== "decode_failed" &&
        error.reason !== "memory_or_browser_limit")
    ) {
      throw error;
    }

    try {
      return await prepareImageFilePayloadOnServer(file, fallbackMimeType);
    } catch (fallbackError) {
      if (isImageFileError(fallbackError)) {
        const serverCause = fallbackError.cause ? toErrorText(fallbackError.cause) : toErrorText(fallbackError);
        fallbackError.cause = new Error(`server_fallback_failed:${serverCause}|client:${toErrorText(error)}`);
        throw fallbackError;
      }
      throw createImageFileError(error.reason, error.diagnostic, fallbackError);
    }
  }
}

export async function fileToBaseImagePayload(file: File | Blob, fallbackMimeType = "image/png") {
  return await prepareImageFilePayload(file, fallbackMimeType);
}

export async function fetchRemoteImageFile(url: string, filename: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("image_fetch_failed");
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

function getRemoteImageFilename(url: string, fallbackName: string, mimeType: string) {
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  let sourceName = "";

  try {
    const segments = new URL(url, window.location.origin).pathname.split("/");
    sourceName = decodeURIComponent(segments[segments.length - 1] || "");
  } catch {
    sourceName = "";
  }

  if (IMAGE_FILE_NAME_PATTERN.test(sourceName)) return sourceName;
  return `${fallbackName}.${ext}`;
}

export async function prepareEditableImageFileFromUrl(url: string, fallbackName = "editable-image") {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) throw new Error("image_url_required");

  const response = await fetch(normalizedUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("image_fetch_failed");

  const blob = await response.blob();
  const mimeType = getImageFileMimeType(blob);
  const name = getRemoteImageFilename(normalizedUrl, fallbackName, mimeType);
  const file = new File([blob], name, { type: mimeType });

  return {
    file,
    preview: await fileToDataUrl(file),
    name,
  };
}

export async function fetchRemoteImageAsBasePayload(url: string, filename = "reference.png") {
  const file = await fetchRemoteImageFile(url, filename);
  return await fileToBaseImagePayload(file, file.type || "image/png");
}
