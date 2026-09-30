import { NextResponse } from "next/server";
import {
  archiveCharacterReferenceKit,
  getCharacterReferenceKitByKitId,
  updateCharacterReferenceKit,
} from "libs/database/character";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withResolvedCharacterReferenceKitImages } from "libs/server-utils/character/referenceKitImageDisplay";
import { isCharacterReferenceKitOwnedByUniverse } from "libs/server-utils/character/referenceKitAccess";
import { validateCharacterReferenceKitPatch } from "libs/server-utils/api/routeValidators";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / character-reference-kits / [kitId]) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  모델 레퍼런스 키트 조회/수정/보관 처리  JSON 응답 반환
 * @domain commerce.model-reference
 * @scope universe
 */

async function getOwnedKit(universeId: string, kitId: string) {
  const kit = await getCharacterReferenceKitByKitId(kitId);
  // ASH-17 2단계 — 종전의 universeId 일치 조회를 소유 축 확인으로 대체한다.
  // ownerType 이 없는 과거 문서는 universe + universeId 로 해석하므로 커머스 킷 동작은 그대로다.
  if (!kit || !isCharacterReferenceKitOwnedByUniverse(kit, universeId)) return null;
  return kit;
}

export const GET = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId, kitId } = context.params as { universeId: string; kitId: string };
      const kit = await getOwnedKit(universeId, kitId);
      if (!kit) return NextResponse.json({ success: false, message: "모델 레퍼런스 키트를 찾을 수 없습니다." }, { status: 404 });

      logger.info("스마트스토어 모델 레퍼런스 키트 상세 조회 성공", { userId: user.ID, universeId, kitId });
      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("스마트스토어 모델 레퍼런스 키트 상세 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "모델 레퍼런스 키트 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_character_reference_kit_detail",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);

export const PATCH = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, kitId } = context.params as { universeId: string; kitId: string };
      const current = await getOwnedKit(universeId, kitId);
      if (!current) return NextResponse.json({ success: false, message: "모델 레퍼런스 키트를 찾을 수 없습니다." }, { status: 404 });

      const kit = await updateCharacterReferenceKit({
        kitId,
        patch: toUnknownRecord(data?.patch),
        updatedBy: String(user.ID || ""),
      });

      logger.info("스마트스토어 모델 레퍼런스 키트 수정 성공", { userId: user.ID, universeId, kitId });
      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("스마트스토어 모델 레퍼런스 키트 수정 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "모델 레퍼런스 키트 수정 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCharacterReferenceKitPatch,
  "universe_character_reference_kit_update",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);

export const DELETE = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId, kitId } = context.params as { universeId: string; kitId: string };
      const current = await getOwnedKit(universeId, kitId);
      if (!current) return NextResponse.json({ success: false, message: "모델 레퍼런스 키트를 찾을 수 없습니다." }, { status: 404 });

      const kit = await archiveCharacterReferenceKit({ kitId, actor: String(user.ID || "") });

      logger.info("스마트스토어 모델 레퍼런스 키트 보관 성공", { userId: user.ID, universeId, kitId });
      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("스마트스토어 모델 레퍼런스 키트 보관 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "모델 레퍼런스 키트 보관 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_character_reference_kit_archive",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
