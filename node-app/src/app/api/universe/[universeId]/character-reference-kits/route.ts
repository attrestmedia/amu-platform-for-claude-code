import { NextRequest, NextResponse } from "next/server";
import { createCharacterReferenceKit, listCharacterReferenceKits } from "libs/database/character";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  withResolvedCharacterReferenceKitImages,
  withResolvedCharacterReferenceKitImagesList,
} from "libs/server-utils/character/referenceKitImageDisplay";
import { validateCharacterReferenceKitCreate } from "libs/server-utils/api/routeValidators";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / character-reference-kits) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  모델 레퍼런스 키트 목록/생성 처리  JSON 응답 반환
 * @domain commerce.model-reference
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toBool(raw?: string | null) {
  const value = toSafeString(raw).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export const GET = withAuth(
  async (_data, user, request, context) => {
    try {
      const { universeId } = context.params as { universeId: string };
      const url = request instanceof NextRequest ? new URL(request.url) : null;
      const kits = await listCharacterReferenceKits({
        universeId,
        status: toSafeString(url?.searchParams.get("status")),
        includeArchived: toBool(url?.searchParams.get("includeArchived")),
        limit: Number(url?.searchParams.get("limit") || 50),
      });

      logger.info("스마트스토어 모델 레퍼런스 키트 목록 조회 성공", {
        userId: user.ID,
        universeId,
        count: kits.length,
      });

      return NextResponse.json({
        success: true,
        data: { kits: await withResolvedCharacterReferenceKitImagesList(kits), totalCount: kits.length },
      });
    } catch (error) {
      logger.error("스마트스토어 모델 레퍼런스 키트 목록 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "모델 레퍼런스 키트 목록 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_character_reference_kits_list",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId } = context.params as { universeId: string };
      const kit = await createCharacterReferenceKit({
        universeId,
        name: toSafeString(data?.name),
        displayName: toSafeString(data?.displayName),
        description: toSafeString(data?.description),
        tags: Array.isArray(data?.tags) ? data.tags : [],
        categoryHints: Array.isArray(data?.categoryHints) ? data.categoryHints : [],
        spec: toUnknownRecord(data?.spec),
        createdBy: String(user.ID || ""),
      });

      logger.info("스마트스토어 모델 레퍼런스 키트 생성 성공", {
        userId: user.ID,
        universeId,
        kitId: kit.kitId,
      });

      return NextResponse.json({ success: true, data: { kit: await withResolvedCharacterReferenceKitImages(kit) } });
    } catch (error) {
      logger.error("스마트스토어 모델 레퍼런스 키트 생성 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "모델 레퍼런스 키트 생성 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCharacterReferenceKitCreate,
  "universe_character_reference_kit_create",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
