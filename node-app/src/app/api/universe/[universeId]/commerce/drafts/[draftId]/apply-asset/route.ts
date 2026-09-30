import { NextResponse } from "next/server";
import {
  getCommerceImageVariantSpec,
  isCommerceImageVariant,
  normalizeCommerceImageVariant,
  resolveCommerceImageVariantFromTargetField,
} from "libs/server-utils/commerce/commerceImageVariantContract";
import {
  buildCommerceModelConsistencyRecord,
  evaluateCommerceModelConsistency,
} from "libs/server-utils/commerce/commerceModelConsistencyContract";
import {
  getCommerceDraftByDraftId,
  snapshotCommerceDraftRevision,
  updateCommerceDraft,
} from "libs/database/commerce";
import { getCharacterReferenceKitByKitId } from "libs/database/character";
import { getContentAssetByAssetId, getImageAssetByAssetId } from "libs/database/lab";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftApplyAsset } from "libs/server-utils/api/routeValidators";
import {
  buildCommerceProductSourcePacket,
  validateCommerceProductClaims,
} from "libs/server-utils/commerce/commerceProductContentContract";
import { markdownToSmartstoreHtmlWithImages } from "utils/commerce/smartstoreDetailHtmlUtils";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / apply-asset) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  draft에 AI asset 반영  revision 기록  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => toSafeString(value)).filter(Boolean)));
}

function resolveNextSource(currentSource?: string) {
  const source = toSafeString(currentSource);
  if (!source || source === "manual" || source === "imported_from_naver") return "mixed";
  return source;
}

type AssetRecord = {
  assetId?: unknown;
  universeId?: unknown;
  scope?: unknown;
  content?: {
    text?: unknown;
  };
  storage?: {
    url?: unknown;
  };
};

type ImageRow = Record<string, unknown>;

function buildRepresentativeImage(asset: AssetRecord) {
  return {
    assetId: toSafeString(asset?.assetId),
    url: toSafeString(asset?.storage?.url),
    role: "representative",
    imageType: "REPRESENTATIVE",
    origin: "pure_ai",
    sortOrder: 1,
  };
}

function buildDetailImage(asset: AssetRecord, sortOrder: number) {
  return {
    assetId: toSafeString(asset?.assetId),
    url: toSafeString(asset?.storage?.url),
    role: "detail",
    imageType: "OPTIONAL",
    origin: "pure_ai",
    sortOrder,
  };
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);

      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const assetType = toSafeString(data?.assetType).toLowerCase();
      const targetField = toSafeString(data?.targetField).toLowerCase();
      const assetId = toSafeString(data?.assetId);

      let updatedDraft: unknown = draft;
      let revisionSummary = "";
      let appliedVariantForMeta: string = "";

      if (assetType === "content") {
        const asset = (await getContentAssetByAssetId(assetId)) as AssetRecord | null;
        if (!asset || toSafeString(asset.universeId) !== toSafeString(universeId) || toSafeString(asset.scope) !== "universe") {
          return NextResponse.json({ success: false, message: "적용할 콘텐츠 asset을 찾을 수 없습니다." }, { status: 404 });
        }

        const currentAssets = draft.assets || {};
        const currentDisplay = draft.display || {};
        const text = toSafeString(asset?.content?.text);
        const fieldKey = targetField === "detailhtml" ? "detailHtml" : targetField;
        const referenceImageUrls = uniqueStrings(
          Array.isArray(data?.referenceImageUrls)
            ? data.referenceImageUrls.filter((url: unknown): url is string => typeof url === "string")
            : [],
        ).slice(0, 4);
        const fieldValue =
          fieldKey === "detailHtml" ? markdownToSmartstoreHtmlWithImages(text, referenceImageUrls) : text;

        // ── SSM-204: 사실 단정 게이트(fail-closed). content asset은 display 필드에만 반영되지만,
        // 그 문장이 초안에 없는 가격·재고·원산지·배송·연락처를 단정하면 등록 payload 오염의 원인이 된다.
        // updateCommerceDraft보다 앞에서 차단해야 저장 자체가 일어나지 않는다.
        const claimsVerdict = validateCommerceProductClaims({
          packet: buildCommerceProductSourcePacket(draft),
          field: fieldKey,
          text,
        });
        if (claimsVerdict.blocked) {
          return NextResponse.json(
            {
              success: false,
              errorCode: "unsupported_claims",
              message: "초안에 등록된 사실과 다르거나 근거 없는 정보가 문구에 포함되어 있어 반영할 수 없습니다.",
              data: {
                field: fieldKey,
                unsupportedClaims: claimsVerdict.unsupportedClaims,
              },
            },
            { status: 422 },
          );
        }

        updatedDraft = await updateCommerceDraft({
          draftId,
          updatedBy: String(user.ID || ""),
          patch: {
            source: resolveNextSource(draft.source),
            display: {
              ...currentDisplay,
              [fieldKey]: fieldValue,
            },
            assets: {
              ...currentAssets,
              contentAssetIds: uniqueStrings([...(currentAssets.contentAssetIds || []), assetId]),
              selectedDescriptionContentAssetId:
                fieldKey === "detailHtml"
                  ? assetId
                  : toSafeString(currentAssets.selectedDescriptionContentAssetId),
            },
          },
        });

        revisionSummary = `AI 콘텐츠를 ${fieldKey} 필드에 반영`;
      } else {
        const asset = (await getImageAssetByAssetId(assetId)) as AssetRecord | null;
        if (!asset || toSafeString(asset.universeId) !== toSafeString(universeId) || toSafeString(asset.scope) !== "universe") {
          return NextResponse.json({ success: false, message: "적용할 이미지 asset을 찾을 수 없습니다." }, { status: 404 });
        }

        const currentAssets = draft.assets || {};
        const currentSmartstore = draft.smartstore || {};
        const currentReview = draft.review || {};

        const currentImages = Array.isArray(currentSmartstore.images) ? currentSmartstore.images : [];
        // SSM-203: targetField를 variant 계약으로 옮겨 상한을 한 곳에서 판정한다.
        //
        // payload 매핑을 **먼저** 본다. `representative`는 payload role 이름이자 variant 이름이라
        // variant 판정을 먼저 하면 대표 이미지가 내부 자산으로 오판돼 smartstore.images에 실리지 않는다.
        // 내부 자산인지 여부는 이름이 아니라 계약(`payloadRole === null`)이 정한다.
        const appliedVariant =
          resolveCommerceImageVariantFromTargetField(targetField) ||
          (isCommerceImageVariant(targetField) ? normalizeCommerceImageVariant(targetField) : null);
        appliedVariantForMeta = appliedVariant || "";
        const appliedVariantSpec = appliedVariant ? getCommerceImageVariantSpec(appliedVariant) : null;
        const isInternalAsset = Boolean(appliedVariantSpec) && appliedVariantSpec?.payloadRole == null;
        if (appliedVariantSpec && appliedVariantSpec.payloadRole === "detail") {
          const currentDetailCount = currentImages.filter(
            (image: unknown) => toSafeString((image as ImageRow).role || "detail") === "detail",
          ).length;
          const alreadyApplied = currentImages.some(
            (image: unknown) => toSafeString((image as ImageRow).assetId) === assetId,
          );
          if (!alreadyApplied && currentDetailCount >= appliedVariantSpec.maxPerDraft) {
            return NextResponse.json(
              {
                success: false,
                errorCode: "variant_limit_exceeded",
                message: `추가 이미지는 최대 ${appliedVariantSpec.maxPerDraft}장까지 등록할 수 있습니다.`,
                data: { variant: appliedVariant, max: appliedVariantSpec.maxPerDraft },
              },
              { status: 422 },
            );
          }
        }

        // ── SSM-203: 모델 일관성 수동 검수. 스토어 payload로 나가는 variant는 차단 항목을 다 확인해야 적용된다.
        // usedModelReference는 클라이언트 신고가 아니라 draft에 연결된 ready kit 존재로 서버가 판정한다.
        const draftKitIds = Array.isArray(currentAssets.selectedModelReferenceKitIds)
          ? currentAssets.selectedModelReferenceKitIds.map((kitId) => toSafeString(kitId)).filter(Boolean)
          : [];
        const readyKitCount = (
          await Promise.all(draftKitIds.map((kitId) => getCharacterReferenceKitByKitId(kitId)))
        ).filter(
          (kit) =>
            Boolean(kit) &&
            toSafeString(kit?.universeId) === toSafeString(universeId) &&
            Boolean(kit?.quality?.ready),
        ).length;
        const usedModelReference = readyKitCount > 0;
        // variant를 명시한 요청(= variant 스튜디오)만 검수 게이트를 건다.
        // 이미지 레일의 "대표로 지정"·"상세로 추가"처럼 체크리스트 UI가 없는 기존 진입점을 게이트가
        // 조용히 422로 막으면 기능 회귀다. `generate-image`가 참조 계약을 variant 명시 요청에만
        // 강제하는 것과 같은 기준이다. (레일 진입점의 검수 UI는 후속 과제)
        const declaredVariant = toSafeString(data?.variant);
        const consistencyVerdict = appliedVariant && declaredVariant
          ? evaluateCommerceModelConsistency({
              variant: appliedVariant,
              usedModelReference,
              checkedItemIds: data?.consistencyChecklist,
            })
          : null;
        if (consistencyVerdict && consistencyVerdict.gateRequired && !consistencyVerdict.passed) {
          return NextResponse.json(
            {
              success: false,
              errorCode: "model_consistency_check_required",
              message: "모델 일관성 확인 항목을 모두 체크한 뒤 적용할 수 있습니다.",
              data: {
                variant: consistencyVerdict.variant,
                requiredItemIds: consistencyVerdict.requiredItemIds,
                missingItemIds: consistencyVerdict.missingItemIds,
              },
            },
            { status: 422 },
          );
        }

        const filteredImages = currentImages.filter((image: unknown) => {
          const imageRecord = image as ImageRow;
          const sameAssetId = toSafeString(imageRecord.assetId) === assetId;
          const sameUrl = toSafeString(imageRecord.url) === toSafeString(asset?.storage?.url);
          return !sameAssetId && !sameUrl;
        });

        const nextImages = isInternalAsset
          ? currentImages
          : targetField === "detail"
            ? [...filteredImages, buildDetailImage(asset, filteredImages.length + 1)]
            : [
                buildRepresentativeImage(asset),
                ...filteredImages.map((image: unknown, index: number) => {
                  const imageRecord = image as ImageRow;
                  return {
                    ...imageRecord,
                    role: index === 0 ? "detail" : toSafeString(imageRecord.role || "detail"),
                    sortOrder: index + 2,
                  };
                }),
              ];

        updatedDraft = await updateCommerceDraft({
          draftId,
          updatedBy: String(user.ID || ""),
          patch: {
            source: resolveNextSource(draft.source),
            smartstore: {
              ...currentSmartstore,
              images: nextImages,
            },
            assets: {
              ...currentAssets,
              imageAssetIds: uniqueStrings([...(currentAssets.imageAssetIds || []), assetId]),
              selectedRepresentativeImageAssetId:
                targetField === "representative"
                  ? assetId
                  : toSafeString(currentAssets.selectedRepresentativeImageAssetId),
              // variant별 lineage. 어떤 자산이 어떤 용도로 쓰였는지 draft에서 되짚을 수 있어야 한다.
              variantAssetIds: appliedVariant
                ? {
                    ...(currentAssets.variantAssetIds || {}),
                    [appliedVariant]: uniqueStrings([
                      ...((currentAssets.variantAssetIds || {})[appliedVariant] || []),
                      assetId,
                    ]),
                  }
                : currentAssets.variantAssetIds,
              // 검수 기록은 자산 단위로 남긴다. 어떤 컷을 누가 무엇으로 통과시켰는지 되짚을 수 있어야 한다.
              variantQuality: consistencyVerdict
                ? {
                    ...(currentAssets.variantQuality || {}),
                    [assetId]: {
                      ...buildCommerceModelConsistencyRecord({
                        verdict: consistencyVerdict,
                        usedModelReference,
                        actor: String(user.ID || ""),
                      }),
                      // usedModelReference는 자산의 생성 이력이 아니라 **적용 시점 draft가 선택 중인 kit**에서
                      // 유도한 값이다. 증거로 읽을 때 오해가 없도록 근거와 대상 kit을 함께 남긴다.
                      usedModelReferenceBasis: "draft_selected_ready_kits",
                      basisKitIds: draftKitIds,
                    },
                  }
                : currentAssets.variantQuality,
            },
            review: {
              ...currentReview,
              representativeImageConfirmed:
                targetField === "representative" ? false : Boolean(currentReview.representativeImageConfirmed),
            },
          },
        });

        revisionSummary = isInternalAsset
          ? `AI 이미지를 ${appliedVariant} 자산으로 보관`
          : targetField === "detail"
            ? "AI 이미지를 상세 이미지로 반영"
            : "AI 이미지를 대표 이미지로 반영";
      }

      // updateCommerceDraft는 expectedRevision 없이 호출하면 publish 락에 걸려도 예외 없이 null을 돌려준다
      // (`draftRepo.ts`의 충돌 분기는 expectedRevision이 있을 때만 탄다). 가드가 없으면 저장되지 않은
      // 적용에 lineage·revision 스냅샷만 남고 success=true가 나간다 — SSM-202가 고친 것과 같은 형태다.
      if (!updatedDraft) {
        return NextResponse.json(
          {
            success: false,
            errorCode: "publish_in_progress",
            message: "등록이 진행 중이라 지금은 자산을 적용할 수 없습니다. 완료 후 다시 시도해 주세요.",
          },
          { status: 409 },
        );
      }

      await snapshotCommerceDraftRevision({
        draftId,
        actor: String(user.ID || ""),
        source: "ai_apply",
        summary: revisionSummary,
        patchMeta: {
          assetType,
          assetId,
          targetField,
          variant: appliedVariantForMeta,
        },
      });

      logger.info("스마트스토어 draft asset 반영 성공", {
        userId: user.ID,
        universeId,
        draftId,
        assetType,
        assetId,
        targetField,
      });

      return NextResponse.json({
        success: true,
        data: {
          draft: updatedDraft,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "draft asset 반영 중 오류가 발생했습니다.";
      logger.error("스마트스토어 draft asset 반영 실패:", error);
      return NextResponse.json(
        { success: false, message },
        { status: 500 },
      );
    }
  },
  (data) => validateCommerceDraftApplyAsset({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_draft_apply_asset",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
