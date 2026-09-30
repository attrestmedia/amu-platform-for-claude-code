import { NextResponse } from "next/server";
import { getCommerceDraftByDraftId } from "libs/database/commerce";
import { getCharacterReferenceKitByKitId } from "libs/database/character";
import { resolveCharacterReferenceKitImages } from "libs/server-utils/character/referenceKitImageDisplay";
import { toUnknownRecord } from "utils/common/typeUtils";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  buildCommerceImageGenerationIdempotencyKey,
  buildCommerceImageReferenceBundle,
  getCommerceImageVariantSpec,
  normalizeCommerceImageVariant,
  type CommerceImageReferenceKitInputType,
} from "libs/server-utils/commerce/commerceImageVariantContract";
import { evaluateCommerceModelConsistency } from "libs/server-utils/commerce/commerceModelConsistencyContract";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / image-preflight) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  variant 참조 계약 판정  생성 가능 여부·멱등키 응답
 * @domain commerce.naver
 * @scope universe
 *
 * 읽기 전용이다. 이미지를 만들지 않고 코인도 쓰지 않는다.
 * Gen Studio 에디터를 열기 *전에* 참조 부족을 잡아내 헛돈 쓰는 생성을 막는 것이 목적이다.
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);
      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const variant = normalizeCommerceImageVariant(data?.variant);
      const spec = getCommerceImageVariantSpec(variant);

      const selectedKitIds = Array.isArray(draft.assets?.selectedModelReferenceKitIds)
        ? draft.assets.selectedModelReferenceKitIds.map((kitId) => toSafeString(kitId)).filter(Boolean)
        : [];
      const kits = (await Promise.all(selectedKitIds.map((kitId) => getCharacterReferenceKitByKitId(kitId)))).filter(
        (kit): kit is NonNullable<typeof kit> =>
          Boolean(kit) && toSafeString(kit?.universeId) === toSafeString(universeId),
      );

      const bundle = buildCommerceImageReferenceBundle({
        variant,
        productPhotoUrls: Array.isArray(data?.productPhotoUrls) ? data.productPhotoUrls : [],
        poseProxyUrls: Array.isArray(data?.poseProxyUrls) ? data.poseProxyUrls : [],
        // private R2 슬롯은 DB에 url이 없다. 생성 경로와 같은 기준으로 해석해야 preflight가 실제 참조 수를 센다 (ASH-15 P1-1).
        kits: await Promise.all(
          kits.map(
            async (kit) =>
              ({
                kitId: toSafeString(kit.kitId),
                ready: Boolean(kit.quality?.ready),
                images: await resolveCharacterReferenceKitImages(toUnknownRecord(kit.images), { delivery: "signed" }),
              }) as CommerceImageReferenceKitInputType,
          ),
        ),
      });

      const blockedKits = kits
        .filter((kit) => !kit.quality?.ready)
        .map((kit) => ({ kitId: toSafeString(kit.kitId), name: toSafeString(kit.name) }));

      // 검수 항목은 apply-asset이 강제하는 것과 같은 계약에서 뽑는다. 화면이 목록을 따로 갖지 않게 한다.
      // ready 플래그가 아니라 번들이 실제로 확보한 모델 참조 수로 판정한다.
      // 슬롯은 있는데 URL 해석에 실패하면 참조 0장으로 생성되므로, ready만 보면 정합성 게이트가 거짓 보고를 한다 (ASH-15 P1-1).
      const usedModelReference = bundle.modelReferenceCount > 0;
      const consistency = evaluateCommerceModelConsistency({ variant, usedModelReference, checkedItemIds: [] });

      const idempotencyKey = buildCommerceImageGenerationIdempotencyKey({
        draftId,
        draftRevision: Number(draft.revision || 0),
        variant,
        referenceHash: bundle.referenceHash,
        attempt: Number(data?.attempt || 1),
      });

      return NextResponse.json({
        success: true,
        data: {
          variant,
          spec,
          draftRevision: Number(draft.revision || 0),
          idempotencyKey,
          blockedKits,
          consistency: {
            gateRequired: consistency.gateRequired,
            usedModelReference,
            requiredItemIds: consistency.requiredItemIds,
          },
          reference: {
            valid: bundle.valid,
            errors: bundle.errors,
            productPhotoCount: bundle.productPhotoCount,
            modelReferenceCount: bundle.modelReferenceCount,
            poseProxyCount: bundle.poseProxyCount,
            droppedCount: bundle.droppedCount,
            referenceHash: bundle.referenceHash,
            items: bundle.items,
          },
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft 이미지 preflight 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "이미지 생성 사전 검사 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_commerce_draft_image_preflight",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
