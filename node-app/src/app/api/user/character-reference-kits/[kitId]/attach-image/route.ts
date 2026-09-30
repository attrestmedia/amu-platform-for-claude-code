import { NextResponse } from "next/server";
import {
  attachCharacterReferenceKitImage,
  getCharacterReferenceKitByKitId,
} from "libs/database/character";
import { getImageAssetByAssetId } from "libs/database/lab";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withResolvedCharacterReferenceKitImages } from "libs/server-utils/character/referenceKitImageDisplay";
import {
  canEditCharacterReferenceKit,
  resolveCharacterReferenceKitOwner,
} from "libs/server-utils/character/referenceKitAccess";
import { hasCharacterReferenceImageRef } from "libs/server-utils/character/referenceSetContract";
import { validateCharacterReferenceKitAttachImage } from "libs/server-utils/api/routeValidators";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose 사용자 소유 레퍼런스 킷 슬롯에 사용자 scope 자산을 연결 (ASH-17 4단계)
 * @process 인증  사용자 킷 소유자 확인  자산 scope=user·자산 uid=킷 소유 uid 확인  슬롯 저장  JSON 응답
 * @domain character.reference-kit
 * @scope user
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { kitId } = context.params as { kitId: string };
      const current = await getCharacterReferenceKitByKitId(kitId);
      const owner = resolveCharacterReferenceKitOwner(current);
      // 사용자 경로는 사용자 소유 킷 전용이다. 유니버스 킷은 유니버스 경로 소관이므로 404 로 숨긴다.
      if (
        !current ||
        !owner ||
        owner.ownerType !== "user" ||
        !(await canEditCharacterReferenceKit(user as AuthenticatedUserType, current))
      ) {
        return NextResponse.json({ success: false, message: "레퍼런스 킷을 찾을 수 없습니다." }, { status: 404 });
      }

      const assetId = toSafeString(data?.assetId);
      let image = {
        url: toSafeString(data?.url),
        assetId,
        source: toSafeString(data?.source) || "manual",
        driver: "",
        access: "",
        bucket: "",
        key: "",
        mimeType: toSafeString(data?.mimeType),
        width: Number(data?.width || 0) || undefined,
        height: Number(data?.height || 0) || undefined,
        sha256: toSafeString(data?.sha256),
      };

      if (assetId) {
        const asset = await getImageAssetByAssetId(assetId);
        const assetUid = toSafeString(asset?.uid);
        // 사용자 킷에는 scope=user 자산 중 자산 소유 uid 와 킷 소유 uid 가 일치하는 것만 붙는다.
        // 유니버스 scope 자산은 이 경로로 붙지 않는다 — 유니버스 소유 킷 제약과 분리한다 (ASH-17 4단계).
        if (!asset || toSafeString(asset.scope) !== "user" || !assetUid || assetUid !== owner.ownerId) {
          return NextResponse.json({ success: false, message: "연결할 이미지 asset을 찾을 수 없습니다." }, { status: 404 });
        }
        const assetSourceService = toSafeString(asset.sourceService);
        image = {
          url: toSafeString(asset.storage?.url),
          assetId,
          source: assetSourceService === "upload" ? "upload" : "gen_studio",
          driver: toSafeString(asset.storage?.driver),
          access: toSafeString(asset.storage?.access),
          bucket: toSafeString(asset.storage?.bucket),
          key: toSafeString(asset.storage?.key),
          mimeType: toSafeString(asset.storage?.mimeType),
          width: Number(asset.storage?.width || 0) || undefined,
          height: Number(asset.storage?.height || 0) || undefined,
          sha256: toSafeString(asset.storage?.sha256),
        };
      }

      if (!hasCharacterReferenceImageRef(image)) {
        return NextResponse.json(
          { success: false, message: "이미지 URL 또는 저장소 참조가 비어 있습니다." },
          { status: 400 },
        );
      }

      const kit = await attachCharacterReferenceKitImage({
        kitId,
        role: toSafeString(data?.role),
        image,
        updatedBy: String(user.ID || ""),
      });

      logger.info("사용자 레퍼런스 킷 이미지 연결 성공", {
        userId: user.ID,
        kitId,
        role: toSafeString(data?.role),
        assetId,
      });

      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("사용자 레퍼런스 킷 이미지 연결 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "레퍼런스 킷 이미지 연결 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCharacterReferenceKitAttachImage,
  "user_character_reference_kit_attach_image",
);
