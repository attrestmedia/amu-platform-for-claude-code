import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listUploadedMedia } from "libs/server-utils/file/uploadedMediaStorage";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / uploaded-images) 기능 요청 처리
 * @process 인증/권한 검증  유니버스 업로드 이미지 목록 조회  JSON 응답 반환
 * @domain files
 * @scope universe
 *
 * 상품 등록 화면의 "내 이미지" 선택기에서 사용한다. 업로드 기록(UploadedMediaAsset) 중
 * 활성 상태인 이미지를 최신순으로 반환한다.
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export const GET = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId } = context.params as { universeId: string };
      const kind = toSafeString(new URL(_request.url).searchParams.get("kind")) || undefined;
      const images = await listUploadedMedia({
        scope: "universe",
        ownerId: universeId,
        kind,
        limit: 40,
      });

      logger.info("유니버스 업로드 이미지 목록 조회", {
        userId: user.ID,
        universeId,
        kind: kind || "all",
        count: images.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          images: images.map((image) => ({
            assetId: image.assetId,
            url: image.storage?.url || "",
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            originalFilename: image.originalFilename,
            createdAt: image.createdAt,
          })),
          totalCount: images.length,
        },
      });
    } catch (error) {
      logger.error("유니버스 업로드 이미지 목록 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "이미지 목록 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_uploaded_images_list",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
