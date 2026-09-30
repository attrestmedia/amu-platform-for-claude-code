import { NextResponse } from "next/server";
import { createCommerceDraft, createCommerceDraftRevision, listCommerceDrafts } from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftCreate } from "libs/server-utils/api/routeValidators";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  draft 목록/생성 처리  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export const GET = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId } = context.params as { universeId: string };
      const drafts = await listCommerceDrafts({ universeId, includeArchived: false, limit: 100 });

      logger.info("스마트스토어 draft 목록 조회 성공", {
        userId: user.ID,
        universeId,
        count: drafts.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          drafts,
          totalCount: drafts.length,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft 목록 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "draft 목록 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_commerce_drafts_list",
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
      const title = toSafeString(data?.title) || "새 스마트스토어 초안";

      const draft = await createCommerceDraft({
        universeId,
        source: "manual",
        status: "draft",
        createdBy: String(user.ID || ""),
        display: {
          title,
          summary: "",
          detailHtml: "",
        },
        smartstore: {
          productName: title,
          channelProductName: title,
          salePrice: 0,
          stockQuantity: 0,
          categoryId: "",
          categoryPolicyGroup: "",
        },
      });

      await createCommerceDraftRevision({
        draftId: String(draft.draftId || ""),
        universeId,
        actor: String(user.ID || ""),
        source: "manual_edit",
        summary: "draft 생성",
        patchMeta: {
          title,
        },
        snapshot: {
          status: draft.status,
          display: draft.display || {},
          smartstore: draft.smartstore || {},
          validation: draft.validation || {},
          review: draft.review || {},
          publish: draft.publish || {},
        },
      });

      logger.info("스마트스토어 draft 생성 성공", {
        userId: user.ID,
        universeId,
        draftId: draft.draftId,
      });

      return NextResponse.json({
        success: true,
        data: {
          draft,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft 생성 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "draft 생성 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCommerceDraftCreate,
  "universe_commerce_draft_create",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
