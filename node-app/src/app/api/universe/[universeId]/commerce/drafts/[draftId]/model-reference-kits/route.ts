import { NextResponse } from "next/server";
import {
  getCommerceDraftByDraftId,
  snapshotCommerceDraftRevision,
  updateCommerceDraft,
} from "libs/database/commerce";
import { getCharacterReferenceKitByKitId, markCharacterReferenceKitsUsed } from "libs/database/character";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftModelReferenceKitSelection } from "libs/server-utils/api/routeValidators";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / model-reference-kits) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  모델 레퍼런스 키트 선택 저장  revision 기록  JSON 응답 반환
 * @domain commerce.model-reference
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set((values || []).map((value) => toSafeString(value)).filter(Boolean)));
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);
      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const kitIds = uniqueStrings(Array.isArray(data?.kitIds) ? data.kitIds : []);
      const kits = await Promise.all(kitIds.map((kitId) => getCharacterReferenceKitByKitId(kitId)));
      const invalidKit = kits.find((kit) => !kit || toSafeString(kit.universeId) !== toSafeString(universeId));
      if (invalidKit !== undefined) {
        return NextResponse.json({ success: false, message: "선택할 수 없는 모델 레퍼런스 키트가 포함되어 있습니다." }, { status: 400 });
      }

      const currentAssets = draft.assets || {};
      const updatedDraft = await updateCommerceDraft({
        draftId,
        updatedBy: String(user.ID || ""),
        patch: {
          assets: {
            ...currentAssets,
            selectedModelReferenceKitIds: kitIds,
          },
        },
      });

      // publish 락이 살아 있으면 updateCommerceDraft가 예외 없이 null을 돌려준다
      // (draftRepo의 충돌 분기는 expectedRevision을 넘겼을 때만 동작한다).
      // 저장되지 않은 선택으로 lineage와 revision 스냅샷을 남기지 않도록 여기서 끊는다.
      if (!updatedDraft) {
        logger.warn("스마트스토어 draft 모델 레퍼런스 키트 선택 저장 실패: draft가 갱신되지 않음", {
          userId: user.ID,
          universeId,
          draftId,
          kitCount: kitIds.length,
        });
        return NextResponse.json(
          {
            success: false,
            errorCode: "publish_in_progress",
            message: "발행이 진행 중이라 모델 선택을 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.",
          },
          { status: 409 },
        );
      }

      // kit → draft 역방향 lineage. 선택이 저장된 뒤에만 기록해 draft 저장 실패 시 흔적이 남지 않게 한다.
      const usageMarkedCount = await markCharacterReferenceKitsUsed({
        kitIds,
        universeId,
        draftId,
        updatedBy: String(user.ID || ""),
      });

      await snapshotCommerceDraftRevision({
        draftId,
        actor: String(user.ID || ""),
        source: "manual_edit",
        summary: "모델 레퍼런스 키트 선택 변경",
        patchMeta: {
          selectedModelReferenceKitIds: kitIds,
        },
      });

      logger.info("스마트스토어 draft 모델 레퍼런스 키트 선택 저장 성공", {
        userId: user.ID,
        universeId,
        draftId,
        kitCount: kitIds.length,
        usageMarkedCount,
      });

      return NextResponse.json({ success: true, data: { draft: updatedDraft } });
    } catch (error) {
      logger.error("스마트스토어 draft 모델 레퍼런스 키트 선택 저장 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "모델 레퍼런스 키트 선택 저장 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCommerceDraftModelReferenceKitSelection,
  "universe_commerce_draft_model_reference_kits_update",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);

