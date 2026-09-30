import { withGlobalLoading } from "libs/api/globalLoading";

export type DownloadImageFormatType = "jpg" | "webp";

function makeDownloadFileName(url: string, fallbackIndex: number, format: DownloadImageFormatType) {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const raw = decodeURIComponent(pathname.split("/").pop() || "").trim();
    if (raw) {
      const base = raw.replace(/\.[a-z0-9]{2,8}$/i, "");
      return `${base}.${format}`;
    }
  } catch {
    // noop
  }

  return `generated-${fallbackIndex + 1}.${format}`;
}

async function convertBlobFormat(blob: Blob, format: DownloadImageFormatType, quality = 0.9) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_context_unavailable");

  if (format === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  const targetMime = format === "jpg" ? "image/jpeg" : "image/webp";

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => {
        if (!out) return reject(new Error("image_convert_failed"));
        resolve(out);
      },
      targetMime,
      quality,
    );
  });
}

export async function downloadImageByUrl(
  url: string,
  fallbackIndex = 0,
  opts?: { format?: DownloadImageFormatType; quality?: number; assetId?: string },
) {
  const format: DownloadImageFormatType = opts?.format === "jpg" ? "jpg" : "webp";
  const src = String(url || "").trim();
  if (!src) return false;

  const assetId = String(opts?.assetId || "").trim();
  if (assetId) {
    const query = new URLSearchParams({ download: "1", format });
    const anchor = document.createElement("a");
    anchor.href = `/api/lab/studio-images/${encodeURIComponent(assetId)}/editor-file?${query.toString()}`;
    anchor.download = makeDownloadFileName(src, fallbackIndex, format);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }

  return withGlobalLoading(async () => {
    try {
      const response = await fetch(src);
      if (!response.ok) return false;

      const blob = await response.blob();
      const target = await convertBlobFormat(blob, format, opts?.quality);
      const objectUrl = URL.createObjectURL(target);

      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = makeDownloadFileName(src, fallbackIndex, format);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(objectUrl);
      return true;
    } catch {
      return false;
    }
  });
}
