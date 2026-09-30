import { NextResponse } from "next/server";
import {
  archiveCharacterReferenceKit,
  getCharacterReferenceKitByKitId,
  updateCharacterReferenceKit,
} from "libs/database/character";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withResolvedCharacterReferenceKitImages } from "libs/server-utils/character/referenceKitImageDisplay";
import {
  canEditCharacterReferenceKit,
  resolveCharacterReferenceKitOwner,
} from "libs/server-utils/character/referenceKitAccess";
import { validateCharacterReferenceKitPatch } from "libs/server-utils/api/routeValidators";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자 소유 레퍼런스 킷 상세/수정/보관 (ASH-17 4단계) — 사용자 킷 전용 경로
 * @process 인증  사용자 소유 + 소유자/관리자 확인  수정/보관  JSON 응답
 * @domain character.reference-kit
 * @scope user
 */

/** 사용자 경로는 사용자 소유 킷만 다룬다. 유니버스 킷은 유니버스 경로 소관이므로 404 로 숨긴다. */
async function getEditableUserKit(user: AuthenticatedUserType, kitId: string) {
  const kit = await getCharacterReferenceKitByKitId(kitId);
  if (!kit) return null;
  const owner = resolveCharacterReferenceKitOwner(kit);
  if (!owner || owner.ownerType !== "user") return null;
  if (!(await canEditCharacterReferenceKit(user, kit))) return null;
  return kit;
}

export const GET = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { kitId } = context.params as { kitId: string };
      const kit = await getEditableUserKit(user as AuthenticatedUserType, kitId);
      if (!kit) {
        return NextResponse.json({ success: false, message: "레퍼런스 킷을 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("사용자 레퍼런스 킷 상세 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "레퍼런스 킷 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "user_character_reference_kit_detail",
);

export const PATCH = withAuth(
  async (data, user, _request, context) => {
    try {
      const { kitId } = context.params as { kitId: string };
      const current = await getEditableUserKit(user as AuthenticatedUserType, kitId);
      if (!current) {
        return NextResponse.json({ success: false, message: "레퍼런스 킷을 찾을 수 없습니다." }, { status: 404 });
      }

      const kit = await updateCharacterReferenceKit({
        kitId,
        patch: toUnknownRecord(data?.patch),
        updatedBy: String(user.ID || ""),
      });
      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("사용자 레퍼런스 킷 수정 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "레퍼런스 킷 수정 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCharacterReferenceKitPatch,
  "user_character_reference_kit_update",
);

export const DELETE = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { kitId } = context.params as { kitId: string };
      const current = await getEditableUserKit(user as AuthenticatedUserType, kitId);
      if (!current) {
        return NextResponse.json({ success: false, message: "레퍼런스 킷을 찾을 수 없습니다." }, { status: 404 });
      }

      const kit = await archiveCharacterReferenceKit({ kitId, actor: String(user.ID || "") });
      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("사용자 레퍼런스 킷 보관 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "레퍼런스 킷 보관 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "user_character_reference_kit_archive",
);
