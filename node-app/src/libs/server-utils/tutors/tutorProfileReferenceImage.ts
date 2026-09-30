import "server-only";

import { getImageAssetByAssetId } from "libs/database/lab";
import { canAccessImageAsset } from "libs/server-utils/lab/imageAssetAccess";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { BaseImageType } from "types/app";

/**
 * @docHint
 * @purpose 튜터 프로필 참고 이미지 URL을 서버에서 base64(BaseImageType)로 해석하는 공통 유틸
 * @process URL 정규화  private worker URL 자산 조회/권한 확인  서명 URL 또는 원본 fetch  base64 반환
 * @domain tutors
 * @scope server
 */

const MAX_TUTOR_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;

function parseBaseImageDataUrl(dataUrl: string): BaseImageType | null {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = String(match[1] || "image/png").split(";")[0].trim().toLowerCase() || "image/png";
  const data = match[2];
  if (!data) return null;

  return { mimeType, data };
}

function inferReferenceImageMime(url: string) {
  const pathname = String(url || "").split("?")[0].toLowerCase();
  if (/\.jpe?g$/.test(pathname)) return "image/jpeg";
  if (/\.webp$/.test(pathname)) return "image/webp";
  return "image/png";
}

// private Gen Studio 이미지는 Cloudflare Worker(private-assets.allmyuniverse.com)가
// `/images/{assetId}` 경로로 서빙한다. URL에서 assetId를 추출해 서버가 직접 자산을 조회한다.
function extractPrivateAssetIdFromWorkerUrl(url: string) {
  const base = String(process.env.PRIVATE_ASSET_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return "";

  const clean = String(url || "").trim();
  const prefix = `${base}/images/`;
  if (!clean.startsWith(prefix)) return "";

  const raw = clean.slice(prefix.length).split("/")[0].split("?")[0] || "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return "";
  }
}

async function fetchReferenceImageUrlAsBaseImage(url: string): Promise<BaseImageType | null> {
  const clean = String(url || "").trim();
  if (!clean) return null;

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      response = await fetch(clean, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const mimeType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_TUTOR_REFERENCE_IMAGE_BYTES) return null;

  const normalizedMime = ["image/png", "image/jpeg", "image/webp"].includes(mimeType)
    ? mimeType
    : mimeType === "image/jpg"
      ? "image/jpeg"
      : inferReferenceImageMime(clean);

  return { mimeType: normalizedMime, data: buffer.toString("base64") };
}

// 참고 이미지 URL을 서버에서 base64로 해석한다.
// - private Gen Studio 이미지(worker URL)는 assetId → 접근 권한 확인 → 서명 URL → fetch
// - public/외부 http(s) URL은 서버에서 직접 fetch (브라우저 CORS 제약이 없음)
// - data: URL은 그대로 파싱
export async function resolveTutorProfileReferenceBaseImagesFromUrl(
  referenceImageUrl: string,
  user: AuthenticatedUserType,
): Promise<BaseImageType[]> {
  const url = String(referenceImageUrl || "").trim();
  if (!url) return [];

  if (url.startsWith("data:")) {
    const parsed = parseBaseImageDataUrl(url);
    return parsed ? [parsed] : [];
  }

  const assetId = extractPrivateAssetIdFromWorkerUrl(url);
  if (assetId) {
    const asset = await getImageAssetByAssetId(assetId);
    const accessAllowed =
      asset && (await canAccessImageAsset(user, asset as { scope?: string; uid?: string; universeId?: string } | null));
    if (accessAllowed) {
      const display = await resolveImageAssetDisplayUrl(
        asset as { assetId?: string; visibility?: string; storage?: unknown },
        { delivery: "signed" },
      );
      if (display.url) {
        const image = await fetchReferenceImageUrlAsBaseImage(display.url);
        if (image) return [image];
      }
    }
    return [];
  }

  if (/^https?:\/\//i.test(url)) {
    const image = await fetchReferenceImageUrlAsBaseImage(url);
    return image ? [image] : [];
  }

  return [];
}
