import "server-only";

import { getR2PrivateBucket, getR2SignedGetUrl, isR2PrivateStorage } from "libs/server-utils/storage/r2Storage";

export type ImageAssetDisplayUrlType = {
  url: string;
  urlKind: "public" | "signed" | "worker" | "local" | "none";
  urlExpiresAt?: string;
  refreshUrl?: string;
};

type ImageAssetDisplayLike = {
  assetId?: unknown;
  visibility?: unknown;
  storage?: unknown;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export function getPrivateAssetBaseUrl() {
  return String(process.env.PRIVATE_ASSET_BASE_URL || "").trim().replace(/\/+$/g, "");
}

/**
 * Private asset Worker는 운영 도메인 쿠키와 허용 Origin이 맞아야 한다.
 *
 * 개발 서버를 LAN/IP 주소로 열면 `.allmyuniverse.com` 쿠키가 브라우저에서
 * Worker까지 전달되지 않으므로, Worker base URL이 실수로 남아 있어도
 * 서명된 R2 URL을 우선 사용한다. 운영에서 Worker를 쓰려면 기본값으로 충분하고,
 * staging처럼 NODE_ENV가 production이 아닌 환경은 `PRIVATE_ASSET_DELIVERY=worker`
 * 로 명시적으로 opt-in할 수 있다.
 */
export function shouldUsePrivateAssetWorker() {
  const configuredDelivery = String(process.env.PRIVATE_ASSET_DELIVERY || "").trim().toLowerCase();
  if (configuredDelivery === "signed") return false;
  if (configuredDelivery === "worker") return Boolean(getPrivateAssetBaseUrl());
  return process.env.NODE_ENV === "production" && Boolean(getPrivateAssetBaseUrl());
}

function getPrivateAssetVersion(storage: Record<string, unknown>) {
  const sha256 = toSafeString(storage.sha256).toLowerCase();
  return /^[a-f0-9]{64}$/.test(sha256) ? sha256.slice(0, 16) : "";
}

export function buildPrivateAssetWorkerUrl(assetId: string, storage: Record<string, unknown>) {
  const baseUrl = getPrivateAssetBaseUrl();
  if (!baseUrl || !assetId) return "";
  const version = getPrivateAssetVersion(storage);
  const path = `${baseUrl}/images/${encodeURIComponent(assetId)}`;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

function isPrivateR2Asset(asset: ImageAssetDisplayLike) {
  const storage = toRecord(asset.storage);
  if (String(asset.visibility || "").trim() !== "private") return false;
  if (String(storage.driver || "").trim() !== "r2") return false;
  return isR2PrivateStorage(storage);
}

export async function resolveImageAssetDisplayUrl(
  asset: ImageAssetDisplayLike,
  options?: { delivery?: "auto" | "signed" },
): Promise<ImageAssetDisplayUrlType> {
  const storage = toRecord(asset.storage);
  const assetId = toSafeString(asset.assetId);

  if (isPrivateR2Asset(asset)) {
    if (options?.delivery !== "signed" && shouldUsePrivateAssetWorker()) {
      const workerUrl = buildPrivateAssetWorkerUrl(assetId, storage);
      if (workerUrl) {
        return {
          url: workerUrl,
          urlKind: "worker",
        };
      }
    }

    const bucket = toSafeString(storage.bucket) || getR2PrivateBucket();
    const key = toSafeString(storage.key);
    if (!bucket || !key) {
      return { url: "", urlKind: "none" };
    }

    const signed = await getR2SignedGetUrl({ bucket, key });
    return {
      url: signed.url,
      urlKind: "signed",
      urlExpiresAt: signed.urlExpiresAt,
      refreshUrl: assetId ? `/api/lab/studio-images/${encodeURIComponent(assetId)}/signed-url` : undefined,
    };
  }

  const url = toSafeString(storage.url);
  if (!url) return { url: "", urlKind: "none" };
  return {
    url,
    urlKind: url.startsWith("/apps/") ? "local" : "public",
  };
}
