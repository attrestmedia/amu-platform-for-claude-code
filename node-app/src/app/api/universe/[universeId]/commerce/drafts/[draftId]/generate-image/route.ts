import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  getCommerceDraftByDraftId,
  attachCommerceDraftAssets,
  completeCommerceWorkflowStage,
  failCommerceWorkflowStage,
  snapshotCommerceDraftRevision,
  startCommerceWorkflowStage,
} from "libs/database/commerce";
import { getCharacterReferenceKitByKitId } from "libs/database/character";
import { toUnknownRecord } from "utils/common/typeUtils";
import { buildCommerceDraftPostprocessOperationKey } from "libs/database/commerce/draftRepo";
import {
  buildCommerceImageGenerationIdempotencyKey,
  buildCommerceImageReferenceBundle,
  getCommerceImageVariantSpec,
  normalizeCommerceImageVariant,
  type CommerceImageReferenceKitInputType,
} from "libs/server-utils/commerce/commerceImageVariantContract";
import { resolveCommerceModelReferenceImages } from "libs/server-utils/commerce/commerceModelReferenceDelivery";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftGenerateImage } from "libs/server-utils/api/routeValidators";
import { handleUniverseImageBasic } from "libs/server-utils/api/imageBasicHandler";
import { handleUniverseImagePrompt } from "libs/server-utils/api/imagePromptHandler";
import type { ImagePromptBodyType, ImagePromptCustomType } from "types/app/service";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import { stableSerialize } from "utils/common/stableSerialize";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / generate-image) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  AI 이미지 생성  draft asset 연결  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function safeOperationSegment(value: unknown, fallback: string) {
  const normalized = toSafeString(value).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return normalized || fallback;
}

function buildProviderClientRequestId(args: {
  universeId: string;
  draftId: string;
  supplied?: unknown;
  fingerprint: unknown;
}) {
  const supplied = toSafeString(args.supplied);
  const digest = crypto
    .createHash("sha256")
    .update(supplied || stableSerialize(args.fingerprint), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `commerce:draft:${safeOperationSegment(args.universeId, "universe")}:${safeOperationSegment(args.draftId, "draft")}:provider:${digest}`;
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);

      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      // ── SSM-203: variant 참조 계약을 유료 호출 *전에* 검증한다.
      // 최소 참조를 못 채운 채 생성하면 코인만 쓰고 목적에 못 미치는 결과가 나온다.
      const variant = normalizeCommerceImageVariant(data?.variant);
      const variantSpec = getCommerceImageVariantSpec(variant);
      const selectedKitIds = Array.isArray(draft.assets?.selectedModelReferenceKitIds)
        ? draft.assets.selectedModelReferenceKitIds.map((kitId) => toSafeString(kitId)).filter(Boolean)
        : [];
      const selectedKits = (
        await Promise.all(selectedKitIds.map((kitId) => getCharacterReferenceKitByKitId(kitId)))
      ).filter(
        (kit): kit is NonNullable<typeof kit> => Boolean(kit) && toSafeString(kit?.universeId) === toSafeString(universeId),
      );
      const referenceBundle = buildCommerceImageReferenceBundle({
        variant,
        productPhotoUrls: Array.isArray(data?.productPhotoUrls) ? data.productPhotoUrls : [],
        poseProxyUrls: Array.isArray(data?.poseProxyUrls) ? data.poseProxyUrls : [],
        // variant 강제 경로는 signed URL이 아니라 저장소 참조를 서버 바이트로 materialize한다 (ASH-15 D3).
        kits: await Promise.all(
          selectedKits.map(
            async (kit) =>
              ({
                kitId: toSafeString(kit.kitId),
                ready: Boolean(kit.quality?.ready),
                images: toUnknownRecord(kit.images),
              }) as CommerceImageReferenceKitInputType,
          ),
        ),
      });

      // variant를 명시한 요청만 계약을 강제한다. 기존 자유 생성 호출은 종전대로 동작한다.
      const enforceVariant = Boolean(toSafeString(data?.variant));
      if (enforceVariant && !referenceBundle.valid) {
        return NextResponse.json(
          {
            success: false,
            errorCode: "reference_requirement_not_met",
            message: "이 이미지 종류에 필요한 참고 이미지가 부족합니다.",
            data: { variant, errors: referenceBundle.errors, spec: variantSpec },
          },
          { status: 422 },
        );
      }

      let modelImages = data?.modelImages;
      if (enforceVariant) {
        try {
          modelImages = await resolveCommerceModelReferenceImages({
            enforceVariant,
            bundle: referenceBundle,
            clientModelImages: data?.modelImages,
          });
        } catch (error) {
          logger.warn("[commerce/generate-image] 모델 참조 서버 전달 실패", {
            universeId,
            draftId,
            variant,
            expected: referenceBundle.modelReferenceCount,
            reason: error instanceof Error ? error.message : String(error),
          });
          return NextResponse.json(
            {
              success: false,
              errorCode: "model_reference_not_delivered",
              message: "모델 레퍼런스 이미지를 생성 요청에 전달하지 못했습니다. 잠시 후 다시 시도해 주세요.",
              data: { variant, expected: referenceBundle.modelReferenceCount, delivered: 0 },
            },
            { status: 422 },
          );
        }
      }

      // 서버 materialize 결과와 번들 수량이 다르면 유료 호출 전에 fail-closed 한다.
      const deliveredModelImageCount = Array.isArray(modelImages) ? modelImages.length : 0;
      if (enforceVariant && referenceBundle.modelReferenceCount > deliveredModelImageCount) {
        logger.warn("[commerce/generate-image] 모델 참조 전달 수 불일치", {
          universeId,
          draftId,
          variant,
          expected: referenceBundle.modelReferenceCount,
          delivered: deliveredModelImageCount,
        });
        return NextResponse.json(
          {
            success: false,
            errorCode: "model_reference_not_delivered",
            message: "모델 레퍼런스 이미지를 생성 요청에 전달하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            data: {
              variant,
              expected: referenceBundle.modelReferenceCount,
              delivered: deliveredModelImageCount,
            },
          },
          { status: 422 },
        );
      }

      // ── SSM-203: 실패 후 재시도가 중복 과금되지 않도록 workflow stage 멱등키로 감싼다.
      const runId = toSafeString(data?.runId);
      const stageIdempotencyKey = buildCommerceImageGenerationIdempotencyKey({
        draftId,
        draftRevision: Number(draft.revision || 0),
        variant,
        referenceHash: referenceBundle.referenceHash,
        attempt: Number(data?.attempt || 1),
      });
      // 후처리 멱등은 attach가 revision을 올린 뒤의 재시도에서도 같은 생성으로 묶는다.
      const postprocessOperationKey = buildCommerceDraftPostprocessOperationKey({
        draftId,
        variant,
        referenceHash: referenceBundle.referenceHash,
        attempt: Number(data?.attempt || 1),
      });
      const providerClientRequestId = buildProviderClientRequestId({
        universeId,
        draftId,
        supplied: data?.clientRequestId,
        fingerprint: {
          variant,
          attempt: Number(data?.attempt || 1),
          referenceHash: referenceBundle.referenceHash,
          templateKey: toSafeString(data?.templateKey),
          generationMode: toSafeString(data?.generationMode),
          variables: data?.variables,
          extraPrompt: toSafeString(data?.extraPrompt),
          prompt: toSafeString(data?.prompt),
          baseImages: data?.baseImages,
          modelImages: data?.modelImages,
          n: data?.n,
          modelName: toSafeString(data?.modelName),
          provider: toSafeString(data?.provider),
          size: toSafeString(data?.size),
          aspectRatio: toSafeString(data?.aspectRatio),
          visibility: toSafeString(data?.visibility),
        },
      });
      if (runId) {
        try {
          await startCommerceWorkflowStage({
            runId,
            universeId,
            stage: "image_assets_ready",
            idempotencyKey: stageIdempotencyKey,
            estimatedCost: Number(data?.estimatedCost || 0) || undefined,
            draftRevision: Number(draft.revision || 0),
            actor: String(user.ID || ""),
          });
        } catch (stageError) {
          // 같은 키로 이미 진행 중이거나 성공한 생성이다. 다시 과금하지 않는다.
          logger.warn("스마트스토어 draft 이미지 생성 멱등 차단", {
            userId: user.ID,
            universeId,
            draftId,
            variant,
            stageIdempotencyKey,
            reason: toErrorMessage(stageError, "stage_conflict"),
          });
          return NextResponse.json(
            {
              success: false,
              errorCode: "generation_already_in_progress",
              message: "같은 조건의 생성이 이미 진행되었거나 진행 중입니다. 재생성하려면 시도 회차를 올려주세요.",
              data: { variant, idempotencyKey: stageIdempotencyKey },
            },
            { status: 409 },
          );
        }
      }

      const hasTemplateKey = toSafeString(data?.templateKey).length > 0;
      const generation = hasTemplateKey
        ? await handleUniverseImagePrompt({
            universeId,
            templateKey: data?.templateKey,
            generationMode: data?.generationMode,
            variables: data?.variables,
            extraPrompt: data?.extraPrompt,
            baseImages: data?.baseImages,
            modelImages,
            n: data?.n,
            modelName: data?.modelName,
            provider: data?.provider,
            size: data?.size,
            aspectRatio: data?.aspectRatio,
            visibility: data?.visibility,
          } as unknown as ImagePromptBodyType,
          user,
          { clientRequestId: providerClientRequestId },
        )
        : await handleUniverseImageBasic(
            {
              universeId,
              prompt: data?.prompt,
              templateKey: data?.templateKey,
              generationMode: data?.generationMode,
              baseImages: data?.baseImages,
              modelImages,
              n: data?.n,
              modelName: data?.modelName,
              provider: data?.provider,
              size: data?.size,
              aspectRatio: data?.aspectRatio,
              visibility: data?.visibility,
            } as unknown as ImagePromptCustomType,
            user,
            { routeMeta: "commerce/draft/generate/basic-image", clientRequestId: providerClientRequestId },
          );

      if (!generation?.ok || !("data" in generation)) {
        // stage를 failed로 내려야 같은 키로 retry가 가능해진다. 열어둔 채 두면 재시도가 영구 차단된다.
        if (runId) {
          await failCommerceWorkflowStage({
            runId,
            universeId,
            stage: "image_assets_ready",
            idempotencyKey: stageIdempotencyKey,
            error: {
              code: "image_generation_failed",
              message: ("error" in generation ? String(generation.error || "") : "").slice(0, 240),
              retryable: true,
            },
            actor: String(user.ID || ""),
          }).catch((stageError) => {
            logger.error("스마트스토어 draft 이미지 생성 stage 실패 기록 오류:", stageError);
          });
        }
        return NextResponse.json(
          { success: false, message: ("error" in generation ? generation.error : "") || "이미지 생성에 실패했습니다." },
          { status: 400 },
        );
      }

      const assetIds = Array.isArray(generation.data?.assetIds) ? generation.data.assetIds : [];
      const updatedDraft =
        assetIds.length > 0
          ? await attachCommerceDraftAssets({
              draftId,
              updatedBy: String(user.ID || ""),
              operationKey: postprocessOperationKey,
              imageAssetIds: assetIds,
            })
          : draft;

      if (runId) {
        await completeCommerceWorkflowStage({
          runId,
          universeId,
          stage: "image_assets_ready",
          idempotencyKey: stageIdempotencyKey,
          appliedCost: Number(generation.data?.coins || 0) || undefined,
          evidence: { outputAssetIds: assetIds, modelReferenceKitIds: selectedKitIds },
          actor: String(user.ID || ""),
        }).catch((stageError) => {
          logger.error("스마트스토어 draft 이미지 생성 stage 완료 기록 오류:", stageError);
        });
      }

      await snapshotCommerceDraftRevision({
        draftId,
        actor: String(user.ID || ""),
        operationKey: postprocessOperationKey,
        source: "ai_apply",
        summary: hasTemplateKey ? "AI 템플릿 이미지 생성" : "AI 커스텀 이미지 생성",
        patchMeta: {
          templateKey: toSafeString(data?.templateKey),
          prompt: toSafeString(data?.prompt).slice(0, 140),
          generatedCount: Array.isArray(generation.data?.images) ? generation.data.images.length : 0,
          assetCount: assetIds.length,
          variant,
          referenceCount: referenceBundle.items.length,
        },
      });

      logger.info("스마트스토어 draft AI 이미지 생성 성공", {
        userId: user.ID,
        universeId,
        draftId,
        templateKey: toSafeString(data?.templateKey),
        generatedCount: Array.isArray(generation.data?.images) ? generation.data.images.length : 0,
        assetCount: assetIds.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          draft: updatedDraft,
          generation: generation.data,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft AI 이미지 생성 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "AI 이미지 생성 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  (data) => validateCommerceDraftGenerateImage({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_draft_generate_image",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
