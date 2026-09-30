import { NextResponse } from "next/server";
import {
  attachCharacterReferenceKitImage,
  getCharacterReferenceKitByKitId,
} from "libs/database/character";
import { getImageAssetByAssetId } from "libs/database/lab";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withResolvedCharacterReferenceKitImages } from "libs/server-utils/character/referenceKitImageDisplay";
import { isCharacterReferenceKitOwnedByUniverse } from "libs/server-utils/character/referenceKitAccess";
import { hasCharacterReferenceImageRef } from "libs/server-utils/character/referenceSetContract";
import { validateCharacterReferenceKitAttachImage } from "libs/server-utils/api/routeValidators";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / character-reference-kits / [kitId] / attach-image) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  이미지 asset/url 검증  모델 레퍼런스 슬롯 연결  JSON 응답 반환
 * @domain commerce.model-reference
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, kitId } = context.params as { universeId: string; kitId: string };
      const current = await getCharacterReferenceKitByKitId(kitId);
      if (!current || !isCharacterReferenceKitOwnedByUniverse(current, universeId)) {
        return NextResponse.json({ success: false, message: "모델 레퍼런스 키트를 찾을 수 없습니다." }, { status: 404 });
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
        if (!asset || toSafeString(asset.universeId) !== toSafeString(universeId) || toSafeString(asset.scope) !== "universe") {
          return NextResponse.json({ success: false, message: "연결할 이미지 asset을 찾을 수 없습니다." }, { status: 404 });
        }
        // 업로드 자산도 assetId로 붙을 수 있다. 출처를 무조건 gen_studio로 덮어쓰면
        // usage.generatedAssetIds에 생성 이력이 아닌 것이 섞인다 (SSM-202 독립 리뷰 P2).
        const assetSourceService = toSafeString(asset.sourceService);
        // private R2 자산은 storage.url이 없다(private 전환이 지운다). url만 보고 거절하면
        // 지금 생성되는 자산은 하나도 붙지 않으므로, bucket/key 참조를 함께 받아 저장한다 (ASH-15).
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

      logger.info("스마트스토어 모델 레퍼런스 이미지 연결 성공", {
        userId: user.ID,
        universeId,
        kitId,
        role: toSafeString(data?.role),
        assetId,
      });

      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("스마트스토어 모델 레퍼런스 이미지 연결 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "모델 레퍼런스 이미지 연결 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCharacterReferenceKitAttachImage,
  "universe_character_reference_kit_attach_image",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
