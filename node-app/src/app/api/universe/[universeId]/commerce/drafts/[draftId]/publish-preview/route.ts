import { NextResponse } from "next/server";
import { getCommerceDraftByDraftId } from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateSmartstorePublishPreview } from "libs/server-utils/api/routeValidators";
import { buildNaverPublishPreviewFromDraft } from "libs/server-utils/commerce/naverDraftPayloadMapper";
import {
  assertCommerceDraftExpectedRevision,
  commerceDraftErrorResponse,
} from "libs/server-utils/commerce/commerceDraftContract";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / publish-preview) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  publish preview 계산  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };

      const draft = await getCommerceDraftByDraftId(draftId);
      if (!draft || String(draft.universeId || "").trim() !== String(universeId || "").trim()) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const expectedRevision = assertCommerceDraftExpectedRevision({
        draft,
        expectedRevision: data?.expectedRevision,
      });

      const preview = buildNaverPublishPreviewFromDraft({
        draft,
        mode: data?.mode,
        categoryPolicyGroup: data?.categoryPolicyGroup,
      });

      logger.info("스마트스토어 draft publish preview 생성 성공", {
        userId: user.ID,
        universeId,
        draftId,
        mode: preview.mode,
      });

      return NextResponse.json({
        success: true,
        data: {
          draftId,
          universeId,
          mode: preview.mode,
          categoryPolicyGroup: preview.categoryPolicyGroup,
          validation: preview.validation,
          draftRevision: expectedRevision,
          preview: preview.preview,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft publish preview 생성 실패:", error);
      return commerceDraftErrorResponse(error, "publish preview 생성 중 오류가 발생했습니다.");
    }
  },
  (data) => validateSmartstorePublishPreview({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_draft_publish_preview",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
