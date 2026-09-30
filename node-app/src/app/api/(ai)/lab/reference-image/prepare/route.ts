import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { MAX_BASE_FILE_BYTES } from "consts/app";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { formatBytes } from "utils/normalize";
import {
  createImageFileDiagnostic,
  getImageFileMimeType,
  IMAGE_REFERENCE_MAX_LONG_EDGE,
  IMAGE_REFERENCE_MAX_PIXELS,
  IMAGE_REFERENCE_NORMALIZE_LONG_EDGE,
  IMAGE_REFERENCE_NORMALIZE_PIXELS,
  isImageFileLike,
  type ImageFileDiagnostic,
  type ImageFileFailureReason,
} from "utils/app/imageFile";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Gen Studio 참조 이미지 multipart 준비 요청 처리
 * @process multipart 파일 검증  인증/권한 검증  sharp 기반 차원 측정/정규화  base64 payload 반환
 * @domain ai
 * @scope authenticated-api
 */

type PreparedServerImage = {
  mimeType: string;
  data: string;
  preview: string;
  diagnostic: ImageFileDiagnostic;
};

function imageErrorResponse(
  reason: ImageFileFailureReason,
  message: string,
  diagnostic: ImageFileDiagnostic,
  status: number,
) {
  return NextResponse.json({ ok: false, reason, message, diagnostic }, { status });
}

function shouldNormalizeServerImage(diagnostic: ImageFileDiagnostic, mimeType: string) {
  const longEdge = Math.max(diagnostic.width || 0, diagnostic.height || 0);
  const pixels = diagnostic.pixels || 0;
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  const aiFriendlyMime = ["image/jpeg", "image/png", "image/webp"].includes(normalizedMimeType);
  return !aiFriendlyMime || longEdge > IMAGE_REFERENCE_NORMALIZE_LONG_EDGE || pixels > IMAGE_REFERENCE_NORMALIZE_PIXELS;
}

async function prepareServerImage(file: File, fallbackMimeType: string): Promise<PreparedServerImage> {
  const fallbackDiagnostic = createImageFileDiagnostic(file, fallbackMimeType);
  const input = Buffer.from(await file.arrayBuffer());
  const source = sharp(input, { limitInputPixels: IMAGE_REFERENCE_MAX_PIXELS + 1 }).rotate();
  const metadata = await source.metadata();
  const width = Math.max(1, Number(metadata.width || 0));
  const height = Math.max(1, Number(metadata.height || 0));
  const diagnostic: ImageFileDiagnostic = {
    ...fallbackDiagnostic,
    width,
    height,
    pixels: width * height,
  };

  if (Math.max(width, height) > IMAGE_REFERENCE_MAX_LONG_EDGE || width * height > IMAGE_REFERENCE_MAX_PIXELS) {
    throw Object.assign(new Error("image_resolution_too_large"), {
      reason: "resolution_too_large" satisfies ImageFileFailureReason,
      diagnostic,
      status: 413,
    });
  }

  const mimeType = getImageFileMimeType(file, fallbackMimeType);
  const shouldNormalize = shouldNormalizeServerImage(diagnostic, mimeType);

  if (!shouldNormalize) {
    const preview = `data:${mimeType};base64,${input.toString("base64")}`;
    return {
      mimeType,
      data: preview.split(",")[1] || "",
      preview,
      diagnostic: { ...diagnostic, normalized: false },
    };
  }

  const output = await sharp(input, { limitInputPixels: IMAGE_REFERENCE_MAX_PIXELS + 1 })
    .rotate()
    .flatten({ background: "#fff" })
    .resize({
      width: IMAGE_REFERENCE_NORMALIZE_LONG_EDGE,
      height: IMAGE_REFERENCE_NORMALIZE_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  const preview = `data:image/jpeg;base64,${output.toString("base64")}`;
  return {
    mimeType: "image/jpeg",
    data: preview.split(",")[1] || "",
    preview,
    diagnostic: { ...diagnostic, normalized: true },
  };
}

async function handlePOST(_body: unknown, _user: unknown, request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, message: "multipart/form-data 요청만 허용됩니다." }, { status: 400 });
  }

  const form = await request.formData();
  const file = (form.get("image_file") || form.get("file")) as File | null;
  const fallbackMimeTypeRaw = form.get("fallbackMimeType");
  const fallbackMimeType = typeof fallbackMimeTypeRaw === "string" ? fallbackMimeTypeRaw : "image/png";

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "image_file 업로드가 필요합니다." }, { status: 400 });
  }

  const diagnostic = createImageFileDiagnostic(file, fallbackMimeType);
  if (!isImageFileLike(file)) {
    return imageErrorResponse("unsupported_type", "지원하지 않는 이미지 형식입니다.", diagnostic, 415);
  }

  if (file.size > MAX_BASE_FILE_BYTES) {
    return imageErrorResponse(
      "file_too_large",
      `파일 용량이 너무 큽니다. (장당 최대 ${formatBytes(MAX_BASE_FILE_BYTES)})`,
      diagnostic,
      413,
    );
  }

  try {
    const prepared = await prepareServerImage(file, fallbackMimeType);
    return NextResponse.json({ ok: true, ...prepared });
  } catch (error) {
    const reason =
      error && typeof error === "object" && "reason" in error
        ? ((error as { reason?: ImageFileFailureReason }).reason || "decode_failed")
        : "decode_failed";
    const errorDiagnostic =
      error && typeof error === "object" && "diagnostic" in error
        ? ((error as { diagnostic?: ImageFileDiagnostic }).diagnostic || diagnostic)
        : diagnostic;
    const status =
      error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number"
        ? Number((error as { status: number }).status)
        : 422;
    logger.warn("[reference-image/prepare] server prepare failed", {
      reason,
      diagnostic: errorDiagnostic,
      message: error instanceof Error ? error.message : String(error),
    });
    return imageErrorResponse(reason, "이미지를 처리하지 못했습니다.", errorDiagnostic, status);
  }
}

export const POST = withAuth(handlePOST, undefined, "lab/reference-image/prepare", { bodyParser: "none" });
