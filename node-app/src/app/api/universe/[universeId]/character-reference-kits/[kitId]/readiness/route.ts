import { NextResponse } from "next/server";
import {
  getCharacterReferenceKitByKitId,
  refreshCharacterReferenceKitQuality,
} from "libs/database/character";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withResolvedCharacterReferenceKitImages } from "libs/server-utils/character/referenceKitImageDisplay";
import { isCharacterReferenceKitOwnedByUniverse } from "libs/server-utils/character/referenceKitAccess";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / character-reference-kits / [kitId] / readiness) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  모델 레퍼런스 품질 상태 갱신  JSON 응답 반환
 * @domain commerce.model-reference
 * @scope universe
 */

export const POST = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId, kitId } = context.params as { universeId: string; kitId: string };
      const current = await getCharacterReferenceKitByKitId(kitId);
      if (!current || !isCharacterReferenceKitOwnedByUniverse(current, universeId)) {
        return NextResponse.json({ success: false, message: "모델 레퍼런스 키트를 찾을 수 없습니다." }, { status: 404 });
      }

      const kit = await refreshCharacterReferenceKitQuality({
        kitId,
        updatedBy: String(user.ID || ""),
      });

      logger.info("스마트스토어 모델 레퍼런스 키트 readiness 갱신 성공", { userId: user.ID, universeId, kitId });
      return NextResponse.json({
        success: true,
        data: { kit: await withResolvedCharacterReferenceKitImages(kit), quality: kit?.quality || null },
      });
    } catch (error) {
      logger.error("스마트스토어 모델 레퍼런스 키트 readiness 갱신 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "모델 레퍼런스 키트 검사 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_character_reference_kit_readiness",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
