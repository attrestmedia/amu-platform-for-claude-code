import { NextRequest, NextResponse } from "next/server";
import { getUniverseById } from "libs/database/universe";
import { createUserCharacterReferenceKit, listUserCharacterReferenceKits } from "libs/database/character";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  withResolvedCharacterReferenceKitImages,
  withResolvedCharacterReferenceKitImagesList,
} from "libs/server-utils/character/referenceKitImageDisplay";
import { validateCharacterReferenceKitCreate } from "libs/server-utils/api/routeValidators";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자 소유 레퍼런스 킷 생성·목록 (ASH-17 4단계) — 유니버스 편집권 없이 자기 킷을 만든다
 * @process 인증  소속 유니버스 확인  서버가 ownerType=user·ownerId=uid 고정(클라이언트 입력 무시)  JSON 응답
 * @domain character.reference-kit
 * @scope user
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toBool(raw?: string | null) {
  const value = toSafeString(raw).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export const GET = withAuth(
  async (_data, user, request) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      if (!uid) {
        return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
      }

      const url = request instanceof NextRequest ? new URL(request.url) : null;
      const kits = await listUserCharacterReferenceKits({
        ownerId: uid,
        universeId: toSafeString(url?.searchParams.get("universeId")),
        status: toSafeString(url?.searchParams.get("status")),
        includeArchived: toBool(url?.searchParams.get("includeArchived")),
        limit: Number(url?.searchParams.get("limit") || 50),
      });

      return NextResponse.json({
        success: true,
        data: { kits: await withResolvedCharacterReferenceKitImagesList(kits), totalCount: kits.length },
      });
    } catch (error) {
      logger.error("사용자 레퍼런스 킷 목록 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "레퍼런스 킷 목록 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "user_character_reference_kits_list",
);

export const POST = withAuth(
  async (data, user) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      if (!uid) {
        return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
      }

      // 사용자 킷도 소속 유니버스를 갖는다(선택 목록 필터). 소유는 바뀌지 않는다 (ASH-17 Q3).
      const universeId = toSafeString(data?.universeId);
      if (!universeId) {
        return NextResponse.json({ success: false, message: "소속 유니버스가 필요합니다." }, { status: 400 });
      }
      const universe = await getUniverseById(universeId);
      if (!universe) {
        return NextResponse.json({ success: false, message: "유니버스를 찾을 수 없습니다." }, { status: 404 });
      }

      // 소유는 서버가 정한다 — 인증된 uid 를 ownerId 로, ownerType 은 user 로 고정한다.
      // 클라이언트가 보낸 ownerType·ownerId 는 여기서 읽지 않으므로 위조할 수 없다.
      const owner = { ownerType: "user" as const, ownerId: uid };
      const kit = await createUserCharacterReferenceKit({
        universeId,
        owner,
        name: toSafeString(data?.name),
        displayName: toSafeString(data?.displayName),
        description: toSafeString(data?.description),
        tags: Array.isArray(data?.tags) ? data.tags : [],
        categoryHints: Array.isArray(data?.categoryHints) ? data.categoryHints : [],
        spec: toUnknownRecord(data?.spec),
        createdBy: uid,
      });
      if (!kit) {
        return NextResponse.json({ success: false, message: "레퍼런스 킷을 만들 수 없습니다." }, { status: 400 });
      }

      logger.info("사용자 레퍼런스 킷 생성 성공", { userId: user.ID, universeId, kitId: kit.kitId });

      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } }, { status: 201 });
    } catch (error) {
      logger.error("사용자 레퍼런스 킷 생성 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "레퍼런스 킷 생성 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCharacterReferenceKitCreate,
  "user_character_reference_kits_create",
);
