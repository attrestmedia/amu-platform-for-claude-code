import "server-only";

import { getImageAssetByAssetId } from "libs/database/lab";
import { canAccessImageAsset } from "libs/server-utils/lab/imageAssetAccess";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import { extractAssetIdFromPrivateWorkerUrl } from "libs/server-utils/lab/imageAssetProfileUrlResolver";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

const LEGACY_GEN_STUDIO_IMAGE_PREFIX = "/apps/gen-studio/";

export function resolveLegacyGenStudioImageUrl(url: string) {
  const clean = String(url || "").trim();
  if (!clean.startsWith(LEGACY_GEN_STUDIO_IMAGE_PREFIX)) return "";

  const configuredDomain = String(process.env.SITE_DOMAIN || "").trim();
  if (!configuredDomain) return "";

  try {
    const origin = new URL(
      configuredDomain.includes("://") ? configuredDomain : "https://" + configuredDomain,
    ).origin;
    return new URL(clean, origin).toString();
  } catch {
    return "";
  }
}

/**
 * @docHint
 * @purpose 공개/비공개 전환으로 깨진 다운스트림 프로필 이미지 URL을 읽기 시점에 자가 복구한다.
 * @process private Worker URL 감지  assetId 추출  자산 조회  현재 표시 URL로 교체
 * @domain lab
 * @scope server
 *
 * 쓰기 시점 전파(imageAssetUrlPropagation.ts)는 best-effort라, 전파 기능 배포 이전에
 * 전환됐거나 전파를 거치지 않은 경로로 바뀐 레코드는 stale private Worker URL이 남는다.
 * 해당 URL은 visibility가 public으로 바뀐 뒤 `asset_access_denied`로 깨지므로,
 * 페르소나 profiles를 직렬화하는 읽기 경로에서 현재 자산 URL로 교체한다.
 */

export async function resolveStaleProfileImageUrl(url: string): Promise<string> {
  const clean = String(url || "").trim();
  if (!clean) return clean;

  const assetId = extractAssetIdFromPrivateWorkerUrl(clean);
  if (!assetId) return clean;

  try {
    const asset = await getImageAssetByAssetId(assetId);
    if (!asset) return clean;

    const display = await resolveImageAssetDisplayUrl(asset);
    // 여전히 private(worker/signed)이면 기존 URL이 유효하므로 그대로 둔다.
    if (!display.url || display.urlKind === "worker" || display.urlKind === "signed") return clean;
    if (display.url === clean) return clean;

    return display.url;
  } catch {
    return clean;
  }
}

export async function resolveStaleProfileImageUrls(
  profiles: unknown,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) return result;

  const entries = Object.entries(profiles as Record<string, unknown>);
  const resolved = await Promise.all(
    entries.map(async ([key, value]) => {
      if (!Array.isArray(value)) return [key, value] as const;
      const mapped = await Promise.all(
        value.map((item) => resolveStaleProfileImageUrl(String(item ?? ""))),
      );
      return [key, mapped] as const;
    }),
  );

  for (const [key, value] of resolved) {
    if (Array.isArray(value)) result[key] = value;
  }
  return result;
}

/**
 * 브라우저가 private Worker 쿠키를 받을 수 없는 개발/스테이징 호스트에서도
 * 프로필 이미지를 표시할 수 있도록, 권한 확인 후 표시용 signed URL을 만든다.
 * 원본 profiles에는 signed URL을 넣지 않아 만료 URL이 DB에 재저장되지 않게 한다.
 */
export async function resolveClientProfileImageUrl(url: string, user: AuthenticatedUserType): Promise<string> {
  const clean = String(url || "").trim();
  if (!clean) return "";

  // R2 전환 전 legacy 파일은 local public/ 디렉터리에 없을 수 있으므로
  // 개발 환경에서는 SITE_DOMAIN의 canonical public asset origin으로 보정한다.
  const legacyUrl = resolveLegacyGenStudioImageUrl(clean);
  if (legacyUrl) return legacyUrl;

  const assetId = extractAssetIdFromPrivateWorkerUrl(clean);
  if (!assetId) return clean;

  try {
    const asset = await getImageAssetByAssetId(assetId);
    if (!asset) return "";

    const isPublic = String(asset.visibility || "").trim() === "public";
    if (!isPublic && !(await canAccessImageAsset(user, asset))) return "";

    const display = await resolveImageAssetDisplayUrl(asset, { delivery: "signed" });
    return display.url || "";
  } catch {
    return "";
  }
}
