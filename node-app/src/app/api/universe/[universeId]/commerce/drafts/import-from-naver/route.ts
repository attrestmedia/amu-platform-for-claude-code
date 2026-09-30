import { NextResponse } from "next/server";
import {
  createCommerceDraft,
  findCommerceDraftBySmartstoreRef,
  removeCommerceStorefrontProductBySmartstoreRef,
  setCommerceDraftValidation,
  snapshotCommerceDraftRevision,
  updateCommerceDraft,
  upsertCommerceStorefrontProductFromDraft,
} from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftImportFromNaver } from "libs/server-utils/api/routeValidators";
import { buildNaverPublishPreviewFromDraft } from "libs/server-utils/commerce/naverDraftPayloadMapper";
import { getNaverDraftConnector } from "libs/server-utils/commerce/naverDraftConnector";
import { mapNaverProductDetailToDraftWithCategory, resolveSmartstoreRegisteredAt } from "libs/server-utils/commerce/naverDraftImportService";
import { invalidateUniverseDetailPromptCache } from "libs/server-utils/system-prompt/commercePromptData";
import { toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / import-from-naver) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  네이버 상품 상세 import  draft upsert  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function resolveNextSource(currentSource?: string) {
  const source = toSafeString(currentSource);
  if (!source || source === "manual") return "imported_from_naver";
  if (source === "generated_by_ai") return "mixed";
  return source;
}

function isVisibleSmartstoreStatus(statusType?: unknown) {
  const status = toSafeString(statusType).toUpperCase();
  return !status || status === "SALE";
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId } = context.params as { universeId: string };
      const channelProductNo = Number(data?.channelProductNo);
      const { client, storeId } = await getNaverDraftConnector(universeId);
      const product = await client.getProductDetail(channelProductNo);
      const productRecord = toUnknownRecord(product);
      const mapped = await mapNaverProductDetailToDraftWithCategory({
        client,
        product: {
          ...productRecord,
          channelProductNo: productRecord.channelProductNo || channelProductNo,
        },
      });

      const existingDraft = await findCommerceDraftBySmartstoreRef({
        universeId,
        channelProductNo: mapped.smartstore.channelProductNo,
        originProductNo: mapped.smartstore.originProductNo,
      });

      // 등록일은 최초 확정 후 불변 — 재import 시 기존 값을 유지한다.
      const registeredAt = await resolveSmartstoreRegisteredAt({ existingDraft });

      const draft = existingDraft
        ? await updateCommerceDraft({
            draftId: String(existingDraft.draftId || ""),
            updatedBy: String(user.ID || ""),
            patch: {
              source: resolveNextSource(existingDraft.source),
              display: {
                ...(existingDraft.display || {}),
                ...(mapped.display || {}),
              },
              smartstore: {
                ...(existingDraft.smartstore || {}),
                ...(mapped.smartstore || {}),
                registeredAt,
              },
              review: {
                ...(existingDraft.review || {}),
                ...(mapped.review || {}),
              },
            },
          })
        : await createCommerceDraft({
            universeId,
            source: "imported_from_naver",
            status: "draft",
            createdBy: String(user.ID || ""),
            display: mapped.display,
            smartstore: {
              ...mapped.smartstore,
              registeredAt,
            },
            review: mapped.review,
          });

      if (!draft) {
        return NextResponse.json({ success: false, message: "import draft 저장에 실패했습니다." }, { status: 500 });
      }

      const preview = buildNaverPublishPreviewFromDraft({
        draft: toUnknownRecord(draft),
        mode: "update",
        categoryPolicyGroup: String(toUnknownRecord(draft?.smartstore).categoryPolicyGroup || ""),
      });

      const validatedDraft = await setCommerceDraftValidation({
        draftId: String(draft?.draftId || ""),
        updatedBy: String(user.ID || ""),
        validation: {
          errors: preview.validation.errors,
          warnings: preview.validation.warnings,
          allowlistMatched: preview.validation.allowlistMatched,
          rulesVersion: preview.validation.rulesVersion,
        },
      });

      await snapshotCommerceDraftRevision({
        draftId: String(draft?.draftId || ""),
        actor: String(user.ID || ""),
        source: "import",
        summary: existingDraft ? "네이버 상품 재가져오기" : "네이버 상품 import",
        patchMeta: {
          channelProductNo: mapped.smartstore.channelProductNo,
          originProductNo: mapped.smartstore.originProductNo,
          sellerManagementCode: mapped.smartstore.sellerManagementCode,
        },
      });

      const storefrontProduct = isVisibleSmartstoreStatus(validatedDraft?.smartstore?.statusType)
        ? await upsertCommerceStorefrontProductFromDraft({
            draft: toUnknownRecord(validatedDraft),
            operation: "sync",
            publishedAt: new Date(),
            storeId,
          })
        : await removeCommerceStorefrontProductBySmartstoreRef({
            universeId,
            channelProductNo: mapped.smartstore.channelProductNo,
            originProductNo: mapped.smartstore.originProductNo,
          }).then(() => null);

      invalidateUniverseDetailPromptCache(universeId);

      logger.info("스마트스토어 상품 import 성공", {
        userId: user.ID,
        universeId,
        draftId: draft?.draftId,
        channelProductNo: mapped.smartstore.channelProductNo,
        originProductNo: mapped.smartstore.originProductNo,
        reusedDraft: Boolean(existingDraft?.draftId),
      });

      return NextResponse.json({
        success: true,
        data: {
          draft: validatedDraft,
          reusedDraft: Boolean(existingDraft?.draftId),
          storefrontProduct,
        },
      });
    } catch (error: unknown) {
      logger.error("스마트스토어 상품 import 실패:", error);
      const message = error instanceof Error ? error.message : "";
      return NextResponse.json(
        { success: false, message: message || "네이버 상품 import 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }
  },
  validateCommerceDraftImportFromNaver,
  "universe_commerce_draft_import_from_naver",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
