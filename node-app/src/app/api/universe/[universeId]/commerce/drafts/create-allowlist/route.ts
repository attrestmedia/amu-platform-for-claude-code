import { NextResponse } from "next/server";
import { SMARTSTORE_CREATE_ALLOWLIST_GROUPS, SMARTSTORE_DEFAULT_CREATE_STATUS } from "consts/commerce/smartstore";
import { createCommerceDraft, createCommerceDraftRevision } from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftCreateAllowlist } from "libs/server-utils/api/routeValidators";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / create-allowlist) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  allowlist draft 생성  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function buildDefaultTitle(categoryPolicyGroup: string) {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `신규 등록 초안 ${categoryPolicyGroup} ${month}${day}`;
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId } = context.params as { universeId: string };
      const categoryPolicyGroup = toSafeString(data?.categoryPolicyGroup).toLowerCase();

      if (!(SMARTSTORE_CREATE_ALLOWLIST_GROUPS as readonly string[]).includes(categoryPolicyGroup)) {
        return NextResponse.json(
          { success: false, message: "허용된 신규 등록 카테고리군이 아닙니다." },
          { status: 400 },
        );
      }

      const title = toSafeString(data?.title) || buildDefaultTitle(categoryPolicyGroup);
      const actor = String(user.ID || "");

      const draft = await createCommerceDraft({
        universeId,
        source: "manual",
        status: "draft",
        createdBy: actor,
        display: {
          title,
          summary: "",
          detailHtml: "",
          price: 0,
        },
        smartstore: {
          categoryId: "",
          categoryPolicyGroup,
          sellerManagementCode: "",
          productName: title,
          channelProductName: title,
          salePrice: 0,
          stockQuantity: 0,
          statusType: SMARTSTORE_DEFAULT_CREATE_STATUS,
          images: [],
          facts: {
            brandName: "",
            manufacturerName: "",
            modelName: "",
          },
          origin: {
            originAreaCode: "",
            originAreaName: "",
            content: "",
          },
          logistics: {
            shippingPolicyText: "",
            returnPolicyText: "",
            asPolicyText: "",
          },
          notice: {
            productInfoProvidedNoticeType: "",
            payload: {},
          },
        },
        review: {
          factualConfirmed: false,
          representativeImageConfirmed: false,
          aiDisclosureChecked: false,
        },
      });

      await createCommerceDraftRevision({
        draftId: String(draft.draftId || ""),
        universeId,
        actor,
        source: "manual_edit",
        summary: "allowlist 신규 등록 draft 생성",
        patchMeta: {
          title,
          categoryPolicyGroup,
          mode: "create",
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

      logger.info("스마트스토어 allowlist 신규 draft 생성 성공", {
        userId: user.ID,
        universeId,
        draftId: draft.draftId,
        categoryPolicyGroup,
      });

      return NextResponse.json({
        success: true,
        data: {
          draft,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 allowlist 신규 draft 생성 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "allowlist draft 생성 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCommerceDraftCreateAllowlist,
  "universe_commerce_draft_create_allowlist",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
