import "server-only";
import sharp from "sharp";

export const IMAGE_BRIDGE_FORMATS = ["jpg", "png", "webp"] as const;
export type ImageBridgeFormatType = (typeof IMAGE_BRIDGE_FORMATS)[number];

const MIME_BY_FORMAT: Record<ImageBridgeFormatType, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function coerceImageBridgeFormat(raw?: string, fallback: ImageBridgeFormatType = "webp"): ImageBridgeFormatType {
  const v = String(raw || "")
    .toLowerCase()
    .trim();
  if (v === "jpg" || v === "jpeg") return "jpg";
  if (v === "png") return "png";
  if (v === "webp") return "webp";
  return fallback;
}

export async function transformImageBufferByBridge(params: {
  input: Buffer;
  format: ImageBridgeFormatType;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const format = coerceImageBridgeFormat(params.format, "webp");
  const quality = Math.max(1, Math.min(100, Number(params.quality || 82)));

  let pipeline = sharp(params.input, { failOn: "none" }).rotate();
  if (params.maxWidth || params.maxHeight) {
    pipeline = pipeline.resize({
      width: params.maxWidth,
      height: params.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (format === "jpg") {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true, progressive: true });
  } else if (format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  } else {
    pipeline = pipeline.webp({ quality, effort: 4, smartSubsample: true });
  }

  const buffer = await pipeline.toBuffer();
  const meta = await sharp(buffer, { failOn: "none" }).metadata();

  return {
    buffer,
    ext: format,
    mimeType: MIME_BY_FORMAT[format],
    bytes: buffer.length,
    width: typeof meta.width === "number" ? meta.width : undefined,
    height: typeof meta.height === "number" ? meta.height : undefined,
  };
}
