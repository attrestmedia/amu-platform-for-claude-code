import "server-only";

import { CHARACTER_REFERENCE_IMAGE_ROLES } from "consts/app";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import { logger } from "utils/log";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * 레퍼런스 킷 이미지의 표시 URL을 읽는 시점에 해석한다.
 *
 * 킷 문서에는 저장소 참조(driver/access/bucket/key)만 남는다. private R2 객체는
 * 영구 URL이 존재하지 않으므로, 만료형 signed URL 또는 private asset worker URL을
 * 응답 시점에 만들어 전달한다 (media-storage.md §5, ASH-15).
 *
 * 저장 문서를 바꾸지 않는 전송 전용 변환이며, 이미 URL을 가진 공개 자산은 그대로 둔다.
 * 응답에는 bucket/key를 내보내지 않는다 — 내부 키 레이아웃 노출이며 studio-images의
 * storage 전송 규약과도 어긋난다.
 */
type ResolveOptions = {
  /** 외부 이미지 프로바이더가 직접 가져가야 하면 "signed". worker URL은 쿠키 게이트라 쓸 수 없다. */
  delivery?: "auto" | "signed";
};

function toDisplaySource(image: UnknownRecord) {
  return {
    assetId: String(image.assetId || ""),
    // imageAssetDisplay는 자산의 visibility로 private 여부를 판정한다. 킷 슬롯은 access만 갖는다.
    visibility: String(image.access || "") === "private" ? "private" : "public",
    storage: {
      driver: String(image.driver || ""),
      access: String(image.access || ""),
      bucket: String(image.bucket || ""),
      key: String(image.key || ""),
      url: String(image.url || ""),
      sha256: String(image.sha256 || ""),
    },
  };
}

async function resolveSlot(role: string, image: UnknownRecord, options?: ResolveOptions) {
  const { bucket: _bucket, key: _key, ...transport } = image;

  try {
    const display = await resolveImageAssetDisplayUrl(toDisplaySource(image), options);
    return [
      role,
      {
        ...transport,
        url: display.url || String(image.url || ""),
        urlKind: display.urlKind,
        ...(display.urlExpiresAt ? { urlExpiresAt: display.urlExpiresAt } : {}),
        ...(display.refreshUrl ? { refreshUrl: display.refreshUrl } : {}),
      },
    ] as const;
  } catch (error) {
    // 표시 경로다. 슬롯 하나의 서명 실패로 킷 목록 전체를 500으로 만들지 않는다.
    logger.warn("[referenceKitImageDisplay] 표시 URL 해석 실패", {
      role,
      assetId: String(image.assetId || ""),
      message: error instanceof Error ? error.message : String(error),
    });
    return [role, { ...transport, url: "", urlKind: "none" as const }] as const;
  }
}

export async function resolveCharacterReferenceKitImages(images?: UnknownRecord, options?: ResolveOptions) {
  const raw = toUnknownRecord(images);
  const targets = CHARACTER_REFERENCE_IMAGE_ROLES.map((role) => [role, toUnknownRecord(raw[role])] as const).filter(
    ([, image]) => Object.keys(image).length > 0,
  );

  const resolved = await Promise.all(targets.map(([role, image]) => resolveSlot(role, image, options)));
  return Object.fromEntries(resolved) as UnknownRecord;
}

export async function withResolvedCharacterReferenceKitImages<T>(kit: T | null, options?: ResolveOptions): Promise<T | null> {
  if (!kit) return kit;
  const raw = kit as unknown as Record<string, unknown>;
  return { ...raw, images: await resolveCharacterReferenceKitImages(toUnknownRecord(raw.images), options) } as T;
}

export async function withResolvedCharacterReferenceKitImagesList<T>(kits: T[], options?: ResolveOptions): Promise<T[]> {
  return await Promise.all(kits.map((kit) => withResolvedCharacterReferenceKitImages(kit, options) as Promise<T>));
}
